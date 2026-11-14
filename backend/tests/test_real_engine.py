import os
import subprocess
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app.main import create_app
from app.real_engine import RealEngineService, SimulationContext
from app.database import InventoryRow, CheckInRow

CONTEXT = SimulationContext(communication_status='offline', emergency_override=False)


@pytest.mark.parametrize('case',['normal','missing','unavailable','unusable','override','empty','repeat','invalid','offline'])
def test_real_mode(case,tmp_path):
    app=create_app(f'sqlite:///{(tmp_path/"real.db").as_posix()}',investigation_mode='real')
    with TestClient(app) as client:
        payload={'astronaut_id':'Crew A','hr':88,'sleep':4.2,'bp':'120 / 80' if case=='normal' else None,'symptoms':['Headache']}
        if case=='missing': payload.update(hr=None,sleep=None)
        saved=client.post('/api/v1/check-ins',json=payload).json()
        context=SimulationContext(communication_status='offline',emergency_override=case=='override')
        with app.state.sessions() as session:
            monitor=session.get(InventoryRow,'Blood-pressure monitor')
            monitor.available=case not in ('unavailable','unusable')
            monitor.quantity=0 if case=='unavailable' else 1
            session.commit()
            if case=='invalid':
                with pytest.raises(ValidationError): app.state.real_engine.evaluate(session,saved['id'],{'communication_status':'offline'})
                assert client.post('/api/v1/check-ins',json={**payload,'bp':'bad'}).status_code==422
                return
            result=app.state.real_engine.evaluate(session,saved['id'],context,candidate_checks=[] if case=='empty' else None)
            assert result.diagnosis is None
            if result.next_check and case in ('unavailable','unusable'):
                assert 'bp_monitor' not in result.next_check.requires_equipment
            if case=='override': assert result.status=='escalate' and result.next_check is None
            elif case=='empty': assert result.status=='insufficient_evidence' and result.next_check is None
            else: assert result.status=='needs_review'
            if payload['bp'] is None: assert {'systolic_bp_mm_hg','diastolic_bp_mm_hg'}<=set(result.missing_data)
            if case=='missing': assert {'resting_hr_bpm','sleep_hours'}<=set(result.missing_data)
            if case=='repeat': assert app.state.real_engine.evaluate(session,saved['id'],context)==result
        # Real response never slips into the incompatible legacy response model.
        assert client.post('/api/v1/investigations',json={'check_in_id':saved['id']}).status_code==503
        assert app.state.investigation_adapter is None


def test_fixture_default_and_mode_validation(tmp_path,monkeypatch):
    monkeypatch.delenv('MEDNAV_INVESTIGATION_MODE',raising=False)
    app=create_app(f'sqlite:///{(tmp_path/"fixture.db").as_posix()}')
    with TestClient(app) as client:
        assert app.state.investigation_mode=='fixture'
        response=client.post('/api/v1/investigations',json={'check_in_id':'demo-A-180'})
        assert response.status_code==200 and response.json()['id']=='MN-0000'
    with pytest.raises(ValueError): create_app(investigation_mode='unknown')
    monkeypatch.setenv('MEDNAV_INVESTIGATION_MODE','real')
    assert create_app('sqlite:///:memory:').state.investigation_mode=='real'


def test_unknown_record_and_synthetic_guard(tmp_path):
    app=create_app(f'sqlite:///{(tmp_path/"guard.db").as_posix()}',investigation_mode='real')
    with TestClient(app):
        with app.state.sessions() as session:
            with pytest.raises(LookupError): app.state.real_engine.evaluate(session,'C001',CONTEXT)
            row=session.get(CheckInRow,'demo-A-180');row.synthetic=False;session.flush()
            with pytest.raises(ValueError): app.state.real_engine.evaluate(session,row.id,CONTEXT)


def test_fresh_process_offline_saved_evaluation(tmp_path):
    app=create_app(f'sqlite:///{(tmp_path/"offline.db").as_posix()}')
    with TestClient(app): pass
    script='''
import socket,sys
def blocked(*a,**kw): raise AssertionError('Network attempted')
socket.socket.connect=blocked
socket.socket.connect_ex=blocked
socket.socket.sendto=blocked
socket.getaddrinfo=blocked
socket.create_connection=blocked
from app.database import create_database
from app.real_engine import RealEngineService,SimulationContext
engine,sessions=create_database('sqlite:///'+sys.argv[1])
with sessions() as session:
 result=RealEngineService().evaluate(session,'demo-A-180',SimulationContext(communication_status='offline',emergency_override=False))
 assert result.diagnosis is None
engine.dispose()
'''
    completed=subprocess.run([sys.executable,'-c',script,(tmp_path/'offline.db').as_posix()],capture_output=True,text=True,timeout=30)
    assert completed.returncode==0,completed.stderr
