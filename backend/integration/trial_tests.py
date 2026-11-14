"""Explicit opt-in tests: require pinned engine on PYTHONPATH, not regular discovery."""
import json
import os
import subprocess
import sys
from pathlib import Path
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import create_app
from app.schemas import CheckIn, Astronaut, InventoryItem
from integration.member3_trial import ScenarioContext, evaluate_saved

CONTEXT = ScenarioContext(communication_status="offline", emergency_override=False)


@pytest.mark.parametrize("case", ["normal", "missing_bp", "unavailable", "unusable", "override", "empty_catalog", "repeat", "invalid", "unknown_all"])
def test_saved_api_to_real_engine(tmp_path, case):
    backend = create_app(f'sqlite:///{(tmp_path/"trial.db").as_posix()}')
    with TestClient(backend) as client:
        saved = client.post('/api/v1/check-ins', json={"astronaut_id":"Crew A", "hr": None if case=='unknown_all' else 88, "sleep":None if case=='unknown_all' else 4.2, "bp":"120 / 80" if case=='normal' else None, "symptoms":["Headache","Dizziness","Fatigue"]}).json()
        profile = Astronaut.model_validate(client.get('/api/v1/astronauts/Crew%20A').json())
        record = CheckIn.model_validate(saved)
        items = [InventoryItem.model_validate(i) for i in client.get('/api/v1/inventory').json()]
        bp = next(i for i in items if i.name=='Blood-pressure monitor')
        bp.quantity = 0 if case=='unavailable' else 1
        bp.available = case not in ('unavailable','unusable')
        if case=='invalid':
            assert client.post('/api/v1/check-ins', json={'astronaut_id':'Crew A','hr':'not-a-number'}).status_code == 422
            with pytest.raises(ValidationError):
                CheckIn.model_validate({**saved, 'hr':'not-a-number'})
            with pytest.raises(ValidationError):
                evaluate_saved(record.model_copy(update={'hr':'not-a-number'}),profile,items,CONTEXT)
            return
        scenario = ScenarioContext(communication_status='offline', emergency_override=case=='override')
        app = FastAPI()

        @app.post('/trial/investigate')
        def investigate():
            request, result = evaluate_saved(record, profile, items, scenario, candidate_checks=[] if case=='empty_catalog' else None)
            return {'input':request.model_dump(mode='json'),'result':result.model_dump(mode='json')}

        with TestClient(app) as trial:
            response = trial.post('/trial/investigate')
            assert response.status_code == 200
            actual=response.json(); out=actual['result']; req=actual['input']
            assert out['diagnosis'] is None
            assert out['evidence_sources'][0].startswith('synthetic:')
            if out['next_check']:
                assert set(out['next_check']['requires_equipment']) <= set(req['available_equipment'])
            if case in ('unavailable','unusable'):
                assert 'bp_monitor' not in req['available_equipment']
            if case=='override':
                assert out['status']=='escalate' and out['next_check'] is None
                assert 'approved_emergency_protocol_required' in out['safety_flags']
            elif case=='empty_catalog':
                assert out['status']=='insufficient_evidence' and out['next_check'] is None
            else:
                assert out['status']=='needs_review'
            if saved['bp'] is None:
                assert {'systolic_bp_mm_hg','diastolic_bp_mm_hg'} <= set(out['missing_data'])
            if case=='unknown_all':
                assert {'resting_hr_bpm','sleep_hours'} <= set(out['missing_data'])
            if case=='normal':
                assert req['measurements']['systolic_bp_mm_hg']==120
                assert req['measurements']['diastolic_bp_mm_hg']==80
            if case=='repeat': assert trial.post('/trial/investigate').json()==actual
            print(json.dumps({'case':case,'expected_status':'escalate' if case=='override' else 'insufficient_evidence' if case=='empty_catalog' else 'needs_review','actual':out},sort_keys=True))


def test_offline_fresh_engine_import_and_evaluation():
    script = '''
import socket,json
def blocked(*args,**kwargs): raise AssertionError('network forbidden')
socket.socket.connect=blocked
socket.socket.connect_ex=blocked
socket.socket.sendto=blocked
socket.getaddrinfo=blocked
socket.create_connection=blocked
from engine import InvestigationRequest,evaluate_investigation
request=InvestigationRequest(astronaut_id='Crew A',observed_at='2026-11-14T08:42:00+00:00',symptoms=[],measurements={'resting_hr_bpm':None,'sleep_hours':None,'systolic_bp_mm_hg':None,'diastolic_bp_mm_hg':None},personal_baseline={'resting_hr_bpm':70,'sleep_hours':7.3},available_equipment=[],communication_status='offline',emergency_override=False,dataset_type='synthetic')
result=evaluate_investigation(request,candidate_checks=[])
assert result.diagnosis is None and result.next_check is None
assert len(result.missing_data)==4
print(result.model_dump_json())
'''
    completed = subprocess.run([sys.executable,'-c',script],env=dict(os.environ),capture_output=True,text=True,timeout=30)
    assert completed.returncode==0,completed.stdout+completed.stderr


def test_context_and_research_boundaries():
    with pytest.raises(ValidationError): ScenarioContext()
    with pytest.raises(ValidationError): ScenarioContext(communication_status='offline', emergency_override='true')


def test_engine_rejects_stale_available_list_with_unusable_inventory():
    from engine import InvestigationRequest, InventoryItem as EngineInventory, evaluate_investigation
    request=InvestigationRequest(astronaut_id='Crew A', observed_at='2026-11-14T08:42:00+00:00', symptoms=[], measurements={'systolic_bp_mm_hg':None,'diastolic_bp_mm_hg':None}, personal_baseline={}, available_equipment=['bp_monitor'], communication_status='offline', emergency_override=False, dataset_type='synthetic')
    result=evaluate_investigation(request, inventory=[EngineInventory(equipment_id='bp_monitor',quantity=1,usable=False)])
    assert result.next_check is None or 'bp_monitor' not in result.next_check.requires_equipment
    assert result.diagnosis is None
