# Stable v1 real-engine integration

Update: Member1/Member2 approved the separate POST /api/v1/investigations/evaluate endpoint with flat explicit context and the exact engine response. It is now implemented independently of the legacy route and internal mode gate. See FRONTEND_API_HANDOFF.md for the current public contract and generated HTTP examples. The v2 proposal and pending-exposure notes below describe the earlier milestone and are superseded for this new endpoint only. Fixture default and legacy route behavior remain as previously implemented.

## Implemented boundary

Pinned engine commit: 2297c6af99a402a2aab354ed82eacd7335ec6b06, rule version demo-2, catalog provenance prototype:mednav_catalog_v2. vendor/member3_stable/engine is an unchanged git-archive export of that exact revision. No remote future changes are imported. Backend app.real_engine imports it through a namespaced path, not an arbitrary installed `engine` module or the old ignored trial checkout.

RealEngineService.evaluate(session, check_in_id, SimulationContext, candidate_checks=None) reads the saved check-in, its matching baseline and current inventory in the caller's database session. It validates the persisted check-in, restores SQLite's documented UTC timestamp convention, constructs the real engine request, calls evaluate_investigation with a real inventory snapshot and explicit rules, and validates the returned result. No fixtures are consulted. No engine output is fabricated or relabeled.

Existing uncommitted research and integration work is preserved. No frontend, original Member3 code, Member4 data or existing database was modified. No commit, push or merge was performed.

## Modes and execution

`MEDNAV_INVESTIGATION_MODE=fixture` is the default. Existing POST /api/v1/investigations request and response behavior remains unchanged.

`MEDNAV_INVESTIGATION_MODE=real` configures app.state.real_engine. This is deliberately an INTERNAL integration mode pending public contract approval. It has no fixture adapter and no fallback. POST /api/v1/investigations returns 503 with an explicit contract-approval message in this mode; it does not serialize the incompatible real result as the legacy DTO. Other routes remain available. Invalid mode names fail configuration immediately. Injecting a fixture adapter into real mode is rejected.

From backend/, existing fixture server:

```powershell
$env:MEDNAV_INVESTIGATION_MODE='fixture'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Internal real mode (legacy investigation HTTP response remains blocked):

```powershell
$env:MEDNAV_INVESTIGATION_MODE='real'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Python integration calls can evaluate with the configured service and an explicitly supplied context:

```python
from app.real_engine import SimulationContext
with app.state.sessions() as session:
    result = app.state.real_engine.evaluate(
        session, saved_check_in_id,
        SimulationContext(communication_status="offline", emergency_override=False),
    )
    payload = result.model_dump(mode="json")
```

A local CLI is also available without starting HTTP. It requires an existing SQLite file, does not seed/create tables, and does not commit writes:

```powershell
.\.venv\Scripts\python.exe -m app.real_engine --database PATH_TO_EXISTING_SYNTHETIC_DB --check-in-id SAVED_ID --communication-status offline --emergency-override false
```

The CLI and internal service are for synthetic records only. Context fields are required, typed and explicit; there is no default emergency flag or communication guess. candidate_checks=[] is an internal test/catalog input for genuine empty-catalog abstention, not a new public medical request field.

## Exact mappings and limits

| Existing backend | Real engine | Policy |
| --- | --- | --- |
| check-in hr | measurements.resting_hr_bpm | Preserve numeric/null |
| sleep | measurements.sleep_hours | Preserve numeric/null |
| nullable bp string | systolic_bp_mm_hg / diastolic_bp_mm_hg | Validate existing paired-string format first; parse both or preserve both null |
| recorded_at | observed_at | Use saved receipt timestamp; restore UTC after SQLite; not represented as device acquisition time |
| profile baseline / sleepBaseline | personal_baseline | Load matching saved astronaut row; do not substitute scenario or research baselines |
| symptoms / astronaut_id | symptoms / astronaut_id | Preserve saved values and IDs |
| inventory display names | canonical IDs | Explicit Blood-pressure monitor→bp_monitor; Digital thermometer/Thermometer→thermometer; Pulse oximeter→pulse_oximeter; Weighing scale→weighing_scale |
| quantity + available | quantity + usable | Current DB lacks independent usable; available is a conservative availability/usability proxy. Stock must also be positive. Do not infer expiry |
| unmapped equipment | absent engine resource | Do not guess IDs; duplicate aliases mapping to one ID raise an integration error rather than double-counting stock |
| explicit simulation context | communication_status / emergency_override | Required; never derived from symptoms/readings |

This proxy cannot recover a separate inventory usability reason; genuine Member4 usable metadata should be used when the final inventory schema is approved. No migrations were made. Unsupported or ambiguous resources require catalog agreement, not an engine change. Research C001–C004 records are absent from synthetic tables; non-synthetic saved observations are explicitly rejected. No research loader is called by this adapter.

## Canonical public API proposal — approval required, NOT registered

Keep existing fixture v1 stable. Propose a versioned real endpoint `POST /api/v2/investigations` with exactly:

```json
{"check_in_id":"saved-id","simulation_context":{"communication_status":"offline","emergency_override":false}}
```

Response envelope proposal:

```text
{
  check_in_id,
  engine: {commit, rules_version},
  result: <unaltered validated engine response>
}
```

The nested result retains status, observations, missing_data, resource_constraints, safety_flags, next_check, requires_medical_officer_review, explanation, evidence_sources, diagnosis. No client-submitted readings, baseline or equipment list overrides persisted values in this proposed endpoint. Propose 404 for unknown check-in/baseline, 422 for invalid explicit context, and a sanitized integration error for invalid persisted data/engine output (rather than misreporting engine failure as client validation). Exact error envelope and HTTP codes require agreement. The internal service currently raises LookupError, ValueError or Pydantic ValidationError; no new public HTTP mapping is installed.

Status differences are substantive: legacy review and resource-unavailable are NOT assumed equivalent to engine needs_review or insufficient_evidence. Legacy observation/resource objects, explanation object and structured source entries differ from engine string lists/string explanation. Legacy title/equipment differs from engine id/label/requires_equipment/prototype_only. Member1 must approve and render the canonical result model; no lossy conversion is performed here.

## Executed tests and dependency investigation

| Run | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing + real-adapter backend suite, original environment | 96 | 0 | 0 |
| Pinned Stable v1 standalone tests, isolated environment | 35 | 0 | 0 |
| New real-adapter tests, isolated environment | 12 | 0 | 0 |

Commands from backend/:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
$env:PYTHONPATH = (Resolve-Path vendor/member3_stable).Path + ';' + (Get-Location).Path
.\.trial\member3\venv\Scripts\python.exe -m pytest -q vendor/member3_stable/engine/tests
.\.trial\member3\venv\Scripts\python.exe -m pytest -q tests/test_real_engine.py
```

The original environment is FastAPI 0.115.0; the isolated environment is FastAPI 0.116.1. Both use Python 3.13.1 and Pydantic 2.11.7. Member3 declares FastAPI>=0.116,<1, but the pure engine runtime imports Pydantic, not FastAPI. The real adapter passes in the existing environment as well as the declared-compatible isolated one. This evidence does not silently resolve the dependency declaration; agree a shared FastAPI lock before final promotion. No existing packages were upgraded. Backend/adapter runs have one upstream Starlette/AnyIO deprecation warning each; standalone tests have none.

New tests execute actual saved-record evaluation, missing measurements, zero stock, present/unavailable stock, explicit override, empty candidates, exact replay, invalid context/BP, unknown/non-synthetic records, environment mode selection, original fixture behavior, and fresh-process saved-record evaluation with Python networking blocked. The public gate is checked as 503 in real mode. Offline validation is a Python socket guard, not a full OS-disconnected application audit. This work makes no claim of clinical validation.

## Next handoff / default promotion

Member1 should continue using fixture v1 until the versioned public schema is approved. Research API approval is a separate task. After approval: implement the v2 route and agreed error mapping; wire explicit simulation context; run frontend and real Member4 end-to-end QA; approve inventory IDs/usability semantics; introduce report persistence with response/input/resource/version snapshots; resolve the shared dependency lock; only then consider making real behavior the application default. Keep the pinned stable snapshot while Member3 develops independently.
