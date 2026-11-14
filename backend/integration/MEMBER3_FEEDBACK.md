# Member 3 engine verification — technical confirmation

## A. Integration result: PASS (isolated trial)

Tested actual origin/feature/decision-engine commit **2297c6af99a402a2aab354ed82eacd7335ec6b06**, rules **demo-2**, catalog provenance **prototype:mednav_catalog_v2**. The branch was fetched and the exact engine tree exported with git archive. Original engine code was not edited. No full merge, default endpoint replacement, frontend change, database overwrite, commit or push occurred.

The real engine imports, passes its standalone suite, and can be called by a backend-owned adapter using persisted synthetic check-ins. Required tested invariants passed. This confirms implementation interoperability for the trial, not clinical validity, final API compatibility or a production release.

## B. Tests actually executed

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Actual Member3 standalone engine tests | 35 | 0 | 0 |
| Backend-owned real-engine integration trial | 12 | 0 | 0 |
| Existing backend regression after trial | 84 | 0 | 0 |

Trial environment: Python 3.13.1, FastAPI 0.116.1, Pydantic 2.11.7, SQLAlchemy 2.0.52, pytest 8.3.0, httpx 0.28.1, uvicorn 0.32.0. pip check reported no broken requirements. The unchanged backend environment remains FastAPI 0.115.0. Both integration and regression runs emitted one upstream Starlette/AnyIO deprecation warning; the standalone run had none.

Commands executed from repository root to prepare the ignored isolated workspace:

```powershell
New-Item -ItemType Directory -Force backend/.trial/member3
git archive --format=zip --output=backend/.trial/member3/engine.zip 2297c6af99a402a2aab354ed82eacd7335ec6b06 engine MEMBER_3_STABLE_V1_HANDOFF.md
Expand-Archive -LiteralPath backend/.trial/member3/engine.zip -DestinationPath backend/.trial/member3/source
python -m venv backend/.trial/member3/venv
backend/.trial/member3/venv/Scripts/python.exe -m pip install 'fastapi==0.116.1' 'pydantic==2.11.7' 'pytest==8.3.0' 'SQLAlchemy==2.0.52' 'httpx==0.28.1' 'uvicorn==0.32.0'
```

Commands executed from backend/ for the final measured runs:

```powershell
$env:PYTHONPATH = (Resolve-Path .trial/member3/source).Path + ';' + (Get-Location).Path
./.trial/member3/venv/Scripts/python.exe -m pytest -q .trial/member3/source/engine/tests --junitxml=qa_results/member3/standalone.xml
./.trial/member3/venv/Scripts/python.exe -m pytest -q integration/trial_tests.py --junitxml=qa_results/member3/integration.xml -o junit_logging=all
./.trial/member3/venv/Scripts/python.exe -m pip check
./.venv/Scripts/python.exe -m pytest -q
```

First standalone/trial exploration also passed (35 and 11 tests). After adding a direct unusable-inventory check and stronger invalid-input checks, the final trial had 12 passing tests. Counts above are final runs, not summed repetitions. The trial tests are opt-in, outside regular backend test discovery, and require the pinned engine on PYTHONPATH. JUnit integration output includes the full actual engine responses for comparison.

### Expected versus actual behavior

All trial records are created through the existing backend POST /api/v1/check-ins in temporary file-based SQLite databases, then read back and passed through a separate TestClient FastAPI trial app. The original investigation route is not changed.

| Case | Expected invariant | Actual result |
| --- | --- | --- |
| Complete BP record / ordinary investigation | Review response, valid numeric BP mapping, no diagnosis | needs_review; symptom_review_checklist; 120 / 80 mapped to 120 and 80 |
| Missing BP, usable monitor | Both BP fields remain null/reported missing; resource-feasible check | needs_review; measure_blood_pressure; requires bp_monitor |
| BP monitor quantity zero | Monitor not advertised usable or required by selected check | needs_review; symptom_review_checklist |
| BP monitor present but unavailable | Positive stock does not override unavailable state | needs_review; symptom_review_checklist |
| Explicit emergency override | Bypass routine ranking; null next check; required safety flag | escalate; next_check=null; approved_emergency_protocol_required |
| Empty candidate catalog | Abstain without inventing action | insufficient_evidence; next_check=null |
| Repeated identical record/context | Identical full response | Exact response equality; measure_blood_pressure |
| All four readings unknown | Preserve/report all null fields | Four missing_data entries; needs_review; measure_blood_pressure with usable monitor |
| Invalid text measurement | Reject, no numeric coercion or fabricated output | Existing API 422; DTO and real engine model ValidationError |
| Offline import/evaluation | No external Python networking needed | Fresh interpreter with socket connect/connect_ex/sendto/DNS/create_connection blocked succeeds |
| Missing context / string emergency flag | Do not infer missing scenario values or coerce flag | ValidationError |
| Stale client list claims unusable monitor | Engine independently gates against inventory snapshot | No selected check requires bp_monitor |

Check identity was recorded, not treated as a clinically correct ranking. Every successful trial response was validated by the backend Member4 response model and had diagnosis=null. Selected resources were checked against allowed available equipment. The offline check is a Python-level guard, not an OS-disconnected browser or native-library audit.

## C. API compatibility and ownership

| Backend field/behavior | Engine field/behavior | Proposed mapping / owner action |
| --- | --- | --- |
| hr | measurements.resting_hr_bpm | Direct numeric/null mapping in Member2 adapter; no engine change |
| sleep | measurements.sleep_hours | Direct numeric/null mapping; no engine change |
| bp string or null | systolic_bp_mm_hg / diastolic_bp_mm_hg | Strictly parse valid paired string; null maps to two nulls; reject malformed strings; Member2 mapping needs team agreement |
| check-in astronaut_id, recorded_at, symptoms | same identity, observed_at, symptoms | Map persisted UTC receipt time; do not claim it is acquisition time. Preserve saved identifier; no silent Crew A to A01 alias |
| baseline / sleepBaseline | personal_baseline resting_hr_bpm / sleep_hours | Use selected matching profile only; do not substitute independent Member4 scenario baselines |
| Inventory display name | canonical equipment_id | Explicit mapping in member3_trial.py; unknown resources omitted from engine snapshot; team approval needed for canonical catalog |
| Inventory available | usable | Trial conservatively uses available as usable because default DB lacks separate usability; positive quantity also required. This cannot reconstruct why equipment is unavailable. Member2 should use genuine usable metadata where supplied |
| No stored communication/override fields | communication_status / emergency_override | Both explicitly required by ScenarioContext, never inferred from measurements or global UI state |
| check_in_id + fixture_id | full typed synthetic request | Trial uses persisted record plus explicit context. Do not turn fixture_id into an engine response |
| review/resource-unavailable/escalate | needs_review/insufficient_evidence/escalate | Preserve real engine statuses in separate trial response; agree versioned default API transition with Member1 |
| Structured observation/resources/explanation/source objects | string lists / explanation string | Member4-shaped response works; default frontend DTO does not. Do not discard/rewrite real output to pretend compatibility |
| title / equipment | id / label / requires_equipment / prototype_only | Agree response DTO with Member1; no engine change required |
| detail-based API errors | Pydantic ValidationError | Member2 must catch engine validation errors and serialize agreed 422 envelope in final adapter; trial verifies rejection, not a finished production error route |
| FastAPI==0.115.0 | declared FastAPI>=0.116,<1 | Isolated 0.116.1 trial succeeds. Shared dependency upgrade still requires regression and team approval; no engine change needed |

Other validation differences remain: engine accepts nullable/dynamic baseline measurements while the provisional Member4 model has fixed required numeric baseline fields. Engine enforces supported-value nonnegativity, daily sleep bounds and unique equipment IDs. Member2 should delegate final engine validation to the real engine model and agree the public boundary. Never rename shared fields silently.

The trial response is validated as Member4Response, not the incompatible legacy InvestigationResponse. No research service or NASA dataset is imported by the adapter. The only accepted saved records are marked synthetic. All databases are temporary; no mednav.db writes are involved.

## D. Engine-side problems

No reproducible engine bug or violated safety/resource invariant was found in the 35 standalone and 12 trial tests. There is no evidence-based request for Member3 to rewrite working logic. This test coverage does not prove exhaustive correctness, clinical safety or appropriate medical wording.

Member4's Windows generator reproducibility failure is outside the engine. OSD-575's absent submitted-source row is also outside the engine and must not become engine input. Those suites were not rerun in this engine trial.

## E. Recommendations

Must-fix integration blockers (primarily Member2/team): agree canonical IDs and response version; approve availability/allowlist policy; retain genuine quantity/usability metadata; resolve shared FastAPI requirements; map engine exceptions to agreed HTTP errors; make engine mode opt-in in the Member4 harness runner (it currently clears inherited MEDNAV variables); agree report persistence and capture input/resource/rule/catalog snapshots.

Safety/correctness: no observed engine defect requiring a Member3 fix. Keep explicit override, null diagnosis, resource filtering, missing-value preservation and deterministic behavior covered in subsequent revisions. Do not feed NASA research data into this synthetic system. Add an agreed S06 conflict adapter and an S12 candidate_checks=[] context seam before full Member4 acceptance testing.

Optional Member3 enhancements after this verified baseline: document validation/error guarantees and catalog/rule version stability; provide small stable serialization examples and changelog entries. Preserve the tested baseline and public signature while improving internals. No new clinical thresholds are requested.

## F. Confirmation to Member3

1. Does the engine work standalone? **Yes: 35/35 tests executed and passed.**
2. Can Member2 call the real engine? **Yes: saved SQLite synthetic records reached the actual function through a backend-owned adapter and isolated FastAPI trial.**
3. Do tested safety/resource invariants pass? **Yes: 12/12 trial tests, including direct stale-availability/unusable-inventory filtering.**
4. What can Member2 solve? Field/unit-preserving mappings, inventory IDs, explicit scenario context, serialization, HTTP errors and opt-in wiring; shared DTO/version decisions need Member1/team agreement.
5. What must Member3 fix? **No engine code fix identified by these tests.** Coordinate contract and version guarantees; do not change output merely to fit the old fixture DTO.
6. Can Member3 continue improving safely? **Yes, on a separate revision/branch with regression tests, preserving commit 2297c6a as the verified integration baseline.**
7. Ready for next integration stage? **Yes for broader real-engine Member4 QA and adapter hardening. Not approved for silently replacing the default API or claiming production/clinical readiness.**
