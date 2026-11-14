# Member 2 / Member 4 integration handoff

The initial backend and Member4 integration were found committed in main when this continuation began. Further handoff changes are on feature/backend-member4-integration. This does not promote the proposed Member4 contract into the existing frontend API.

## Integrated files and database results

- vendor/member4/: unchanged 18-file snapshot of the supplied extracted package. Original Downloads files are unchanged. member4_manifest.json records SHA-256 hashes.
- app/member4_import.py: new-database-only importer, lossless source JSON storage and projection into existing backend tables. Refuses every existing database destination.
- app/member4_contract.py: proposed Member4 request/response models, separate from existing frontend models.
- app/member4_app.py: opt-in isolated API, source-native profile/health/inventory reads, request validation and inventory sanitization. Returns 503 engine_unavailable without a real engine.
- integration/member4_adapter.py: real API inventory test seam. Skips without a configured real engine; does not manufacture responses.
- integration/run_member4_qa.py: runs the original harness in temporary copies, starts a temporary API/database, terminates it and deletes the database afterwards.
- tests/test_member4_integration.py: import, null, timestamp, baseline, persistence, sanitizer and source-integrity tests.
- qa_results/: actual measured reports and failure logs; the vendor's original evaluation report is historical and is not updated.

Imported: 4 astronauts (A01–A04), 120 history records, 4 inventory items and 4 historical baselines. Both empty numeric cells remain null. Original +06:30 timestamps remain in source records; history projection uses equivalent UTC timestamps. Symptoms are parsed JSON arrays stored in SQLite JSON columns. Available equipment is exactly thermometer and weighing_scale, from positive quantity AND usable=true. Historical baselines and supplied scenario baselines remain independent.

The development mednav.db SHA-256 was identical before and after integration QA. No development database was overwritten. All QA databases were disposable.

## Commands (from backend/)

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m integration.run_member4_qa baseline
.\.venv\Scripts\python.exe -m integration.run_member4_qa integrated
```

The integration runner removes inherited MEDNAV environment variables and only points HTTP tests at its own temporary server. It intentionally runs without an engine. Its in-memory skip annotation marks the engine-dependent valid-scenarios HTTP method pending; the original test file is unchanged. Invalid-type HTTP validation still exercises the actual isolated API.

For manual import, choose a new disposable destination, never mednav.db:

```powershell
.\.venv\Scripts\python.exe -m app.member4_import --package vendor/member4 --database .qa/member4-disposable.db
$env:MEDNAV_MEMBER4_TEST_DB = (Resolve-Path .qa/member4-disposable.db).Path
.\.venv\Scripts\python.exe -m uvicorn app.member4_app:factory --factory --host 127.0.0.1 --port 8001
```

This app is for proposed-contract integration testing. Continue using app.main:app for the existing frontend contract. Importing creates a fresh database; reusing that destination is refused.

## Actual test outcomes

| Run | Passed | Failed/errors | Skipped |
| --- | ---: | ---: | ---: |
| Existing backend before integration | 56 | 0 | 0 |
| Backend plus Member2 integration tests | 73 | 0 | 0 |
| Original Member4 harness, no adapters | 11 | 1 | 20 |
| Member4 harness, isolated API configured | 12 | 1 | 19 |

The integrated extra pass is S13 actionable API validation. Skips are pending work, not passes. Backend pytest has one upstream Starlette/AnyIO deprecation warning. The 17 new backend tests verify data plumbing; they do not establish engine correctness or clinical validity.

## Reproducibility failure requiring Member4 agreement

test_generator_byte_reproducibility fails on Windows. generate_seed.py uses Path.write_text without an explicit newline policy for JSON. Windows regeneration emits CRLF while supplied JSON fixtures contain LF. All three generated CSV files are byte-identical. All four generated JSON files match after CRLF-to-LF normalization. This diagnostic does not turn the failed test into a pass.

Proposed Member4-owned fix: add newline="\n" to write_json's Path.write_text call, then regenerate and rerun the original harness on Windows and Linux. Do not weaken the byte comparison. This patch has NOT been applied; original generator/fixtures remain unchanged pending owner agreement. Evidence is in qa_results/integrity_and_generator_diagnostic.json and the harness logs.

## Member3 dependency and shared contract decisions

At the start of the package integration no engine was installed. During continuation, origin/feature/decision-engine became available with MEMBER_3_STABLE_V1_HANDOFF.md and an engine declaring rule version demo-2. It has been inspected read-only; it has not been merged, imported or tested against this backend. “Engine unavailable” in existing reports means absent from the executing integration environment, not absent from GitHub.

The required backend callable is Member3Engine(request_dict) -> response_dict. It must call the real engine's InvestigationRequest validation and evaluate_investigation, serialize the real result, preserve synthetic sources, and return the Member4 response model. The API supplies sanitized inventory-derived equipment IDs. Set MEDNAV_MEMBER3_ENGINE=module:function only after installing/reviewing that adapter. The inventory harness seam is integration.member4_adapter:evaluate and always creates a disposable database. Direct engine QA additionally needs MEDNAV_EVALUATOR and MEDNAV_CONTEXT_EVALUATOR; context evaluation must support S12's genuinely empty candidate catalog. The current runner intentionally does not enable these components automatically.

Resolve COMPATIBILITY.md before replacing the default v1 contract: Crew labels vs A IDs; structured BP vs nullable display string; observations/resource/source list types; status vocabulary; validation envelope; /health shape; and durable report model. S06 conflict representation is explicitly unresolved. Report persistence, disconnected full-app browser testing, real engine determinism and offline execution remain pending. No procedural medical advice or clinical logic was added.
