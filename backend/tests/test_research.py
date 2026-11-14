import json
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from app.research import ResearchDataset, ResearchService, STUDY, TIMEPOINTS
from app.main import create_app


@pytest.fixture
def service():
    return ResearchService()


def test_counts_and_source_crosscheck(service):
    report = service.validation
    assert (report['samples'], report['measurement_slots'], report['numeric_values'], report['null_values']) == (28, 532, 509, 23)
    assert report['submitted_rows_verified'] == 531
    assert report['submitted_missing'] == ['C002_serum_R+82/bun_to_creatinine_ratio']
    assert {s.crew_id for s in service.dataset.samples} == {'C001','C002','C003','C004'}


def test_order_units_and_nulls(service):
    series = service.select(crew='C001', metric='bun_to_creatinine_ratio')
    assert tuple(s.timepoint for s,m in series) == TIMEPOINTS
    assert all(m.unit_from_source_header is None for s,m in series)
    assert any(m.value is None and m.missing and m.source_value_text == 'NA' for s,m in series)
    single = service.select(crew='C001', metric='albumin', timepoint='L-3')
    assert len(single) == 1 and single[0][1].unit_from_source_header == 'gram_per_deciliter'
    assert service.dataset.dataset_type == 'real_nasa_osdr'


@pytest.mark.parametrize('kwargs',[{'crew':'A01','metric':'albumin'}, {'crew':'C001','metric':'unknown'}, {'crew':'C001','metric':'albumin','timepoint':'D180'}])
def test_invalid_selection(service, kwargs):
    with pytest.raises(ValueError): service.select(**kwargs)


@pytest.mark.parametrize('mutation',['duplicate','missing_flag','synthetic','offset','text_numeric'])
def test_invalid_dataset(mutation):
    data = json.loads((STUDY/'processed/nasa_lab_results.json').read_text())
    if mutation == 'duplicate': data['samples'][1] = data['samples'][0]
    elif mutation == 'missing_flag': data['samples'][0]['measurements'][0]['missing'] = True
    elif mutation == 'synthetic': data['dataset_type'] = 'synthetic'
    elif mutation == 'offset': data['samples'][0]['day_offset'] = 0
    else: data['samples'][0]['measurements'][0]['value'] = '4.9'
    with pytest.raises(ValidationError): ResearchDataset.model_validate(data)


def test_read_only_and_no_cross_contamination(service, tmp_path):
    with pytest.raises(ValidationError): service.dataset.study_id = 'other'
    with TestClient(create_app(f'sqlite:///{(tmp_path/"isolated.db").as_posix()}')) as client:
        service.select(crew='C001', metric='albumin')
        assert {r['id'] for r in client.get('/api/v1/astronauts').json()} == {'Crew A','Crew B','Crew C'}
        assert client.get('/api/v1/astronauts/C001').status_code == 404
        assert client.post('/api/v1/check-ins',json={'astronaut_id':'C001','hr':88}).status_code == 404
        assert client.post('/api/v1/investigations',json=service.dataset.model_dump(mode='json')).status_code == 422
        assert not any('research' in p for p in client.get('/openapi.json').json()['paths'])
