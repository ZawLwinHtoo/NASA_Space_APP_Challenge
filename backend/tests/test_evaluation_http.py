import json
import logging
from pathlib import Path
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from vendor.member3_stable import engine as stable

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(f'sqlite:///{(tmp_path/"http.db").as_posix()}')) as c:
        yield c


def evaluate(client, **changes):
    return client.post('/api/v1/investigations/evaluate',json={'check_in_id':'demo-A-180','communication_status':'offline','emergency_override':False,**changes})


@pytest.mark.parametrize('available',[True,False])
def test_device_http(client,available,monkeypatch):
    spy=Mock(wraps=stable.evaluate_investigation)
    monkeypatch.setattr(stable,'evaluate_investigation',spy)
    assert client.patch('/api/v1/inventory/Blood-pressure%20monitor',json={'available':available}).status_code==200
    response=evaluate(client)
    assert response.status_code==200
    result=response.json()
    assert spy.call_count==1
    assert result['diagnosis'] is None
    assert result['status']=='needs_review'
    assert {'systolic_bp_mm_hg','diastolic_bp_mm_hg'}<=set(result['missing_data'])
    assert result['next_check'] is None or set(result['next_check']['requires_equipment']) <= ({'bp_monitor','thermometer'} if available else {'thermometer'})
    assert evaluate(client).json()==result
    assert client.post('/api/v1/investigations',json={'check_in_id':'demo-A-180'}).json()['id']=='MN-0000'


def test_saved_checkin_and_actual_example(client):
    request={'astronaut_id':'Crew A','hr':88,'sleep':4.2,'bp':'120 / 80','symptoms':['Headache','Dizziness','Fatigue']}
    saved=client.post('/api/v1/check-ins',json=request)
    assert saved.status_code==201
    body={'check_in_id':saved.json()['id'],'communication_status':'offline','emergency_override':False}
    response=client.post('/api/v1/investigations/evaluate',json=body)
    assert response.status_code==200 and response.json()['missing_data']==[]
    required={'status','observations','missing_data','resource_constraints','safety_flags','next_check','requires_medical_officer_review','explanation','evidence_sources','diagnosis'}
    assert set(response.json())==required
    path=Path(__file__).resolve().parents[1]/'qa_results/evaluation_http'
    path.mkdir(parents=True,exist_ok=True)
    (path/'example.json').write_text(json.dumps({'check_in_request':request,'check_in_response':saved.json(),'evaluate_request':body,'evaluate_response':response.json()},indent=2)+'\n',encoding='utf-8')


def test_override_and_unknown_record(client):
    result=evaluate(client,emergency_override=True).json()
    assert result['status']=='escalate' and result['next_check'] is None
    assert evaluate(client,check_in_id='unknown').status_code==404


@pytest.mark.parametrize('change',[{'communication_status':'delayed'},{'emergency_override':'false'},{'emergency_override':0},{'check_in_id':''},{'fixture_id':'MN-0000'}])
def test_invalid_payload(client,change):
    response=evaluate(client,**change)
    assert response.status_code==422
    assert 'detail' in response.json()


def test_required_fields_and_no_extra_telemetry(client):
    assert client.post('/api/v1/investigations/evaluate',json={'check_in_id':'demo-A-180'}).status_code==422
    assert client.post('/api/v1/check-ins',json={'astronaut_id':'Crew A','radiation':1,'microgravity':True}).status_code==422
    schema=client.get('/openapi.json').json()
    assert '/api/v1/investigations/evaluate' in schema['paths']
    assert client.get('/docs').status_code==404


def test_engine_errors_not_replaced_by_fixtures(client,monkeypatch,caplog):
    def fail(*a,**kw): raise RuntimeError('private-test-input')
    monkeypatch.setattr(stable,'evaluate_investigation',fail)
    with caplog.at_level(logging.ERROR): response=evaluate(client)
    assert response.status_code==500 and response.json()=={'detail':'Evaluation failed'}
    assert 'Stable evaluation failed' in caplog.text
    def unavailable(*a,**kw): raise ImportError('private-module')
    monkeypatch.setattr(stable,'evaluate_investigation',unavailable)
    response=evaluate(client)
    assert response.status_code==503 and response.json()=={'detail':'Evaluation service unavailable'}


def test_offline_http(client,monkeypatch):
    import socket
    original=socket.socket.connect
    def guarded(sock,address):
        if isinstance(address,tuple) and address[0] in ('127.0.0.1','::1'): return original(sock,address)
        raise AssertionError('external network forbidden')
    def blocked(*a,**kw): raise AssertionError('DNS/network forbidden')
    monkeypatch.setattr(socket.socket,'connect',guarded)
    monkeypatch.setattr(socket,'getaddrinfo',blocked)
    monkeypatch.setattr(socket,'create_connection',blocked)
    assert evaluate(client).status_code==200


def test_live_localhost_http(tmp_path):
    import os
    import socket
    import subprocess
    import sys
    import time
    import httpx
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    env=dict(os.environ)
    env['MEDNAV_DATABASE_URL']=f'sqlite:///{(tmp_path/"live.db").as_posix()}'
    env['MEDNAV_INVESTIGATION_MODE']='fixture'
    process=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',str(port)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        with httpx.Client(base_url=f'http://127.0.0.1:{port}',trust_env=False,timeout=2) as http:
            for _ in range(100):
                try:
                    if http.get('/api/v1/healthz').status_code==200: break
                except httpx.TransportError: pass
                if process.poll() is not None: pytest.fail('Local server exited')
                time.sleep(.1)
            else: pytest.fail('Local server did not start')
            payload={'astronaut_id':'Crew A','hr':88,'sleep':4.2,'bp':None,'symptoms':['Headache','Dizziness','Fatigue']}
            saved=http.post('/api/v1/check-ins',json=payload)
            assert saved.status_code==201
            body={'check_in_id':saved.json()['id'],'communication_status':'offline','emergency_override':False}
            response=http.post('/api/v1/investigations/evaluate',json=body)
            assert response.status_code==200 and response.json()['diagnosis'] is None
            assert http.post('/api/v1/investigations/evaluate',json=body).json()==response.json()
            assert http.post('/api/v1/investigations',json={'check_in_id':saved.json()['id']}).status_code==200
            path=Path(__file__).resolve().parents[1]/'qa_results/evaluation_http/live_example.json'
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps({'check_in_request':payload,'check_in_response':saved.json(),'evaluate_request':body,'evaluate_response':response.json()},indent=2)+'\n',encoding='utf-8')
    finally:
        process.terminate()
        try: process.communicate(timeout=10)
        except subprocess.TimeoutExpired: process.kill();process.communicate(timeout=10)
