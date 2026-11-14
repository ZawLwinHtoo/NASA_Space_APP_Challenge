# OSD-575 research-data support — Member 2 review handoff

## Scope and inspection

Current branch: feature/backend-member4-integration. Worktree was clean before this continuation. Existing backend, synthetic importer, fixture adapter, and isolated Member4 QA app were already implemented. No agreed API_CONTRACT.md, ARCHITECTURE.md or AGENTS.md was found in the repository; backend/CONTRACT_NOTES.md remains provisional.

Input actually inspected: Downloads/Telegram Desktop/MEDNAV_Member4_Data_QA_Package.zip, supplied in the final user path. It contains NASA data, despite the earlier brief referring to a differently named incoming ZIP. The archive SHA-256 and every meaningful member hash are recorded in qa_results/osd575/source_audit.json.

The updated ZIP is preserved separately under vendor/member4_osd575/MEDNAV_Member4_Data_QA_Package/. Existing vendor/member4 files were not replaced. The snapshot includes Member4's source CSVs, processed JSON, metadata ZIP, documentation and nested handoff ZIP. Packaged Python caches are not used or tracked (existing ignore rules).

## Actual differences

17 existing files are byte-identical, including every synthetic fixture, generator, scenario and QA test/runner. docs/evaluation_results.json differs and is a historical upstream report, not our executed result. Six files are new: processed NASA JSON; two raw CSVs; ISA metadata archive; docs/NASA_OSD575_HANDOFF.md; and nested MEDNAV_NASA_OSD575_Handoff.zip. No unchanged synthetic fixtures were reimported into development storage. The isolated QA runner still imports a disposable database when executing its integration checks.

## Validation results and limitations

- Four research identifiers C001–C004; 28 unique serum sample IDs.
- Seven actual samples per crew, ordered L-92, L-44, L-3, R+1, R+45, R+82, R+194. Launch and return are distinct anchors. No daily-series interpolation.
- Exactly 19 distinct measurements per sample: 532 slots, 509 numeric values, 23 nulls.
- All 532 processed values, original text and reference bounds match the transformed CSV. Measurement/unit column names are checked, including original ALT/AST `_max` column naming.
- All 531 supplied long-form submitted CSV rows match values, bounds, source text and source-unit mapping.
- SOURCE DISCREPANCY: the submitted CSV lacks C002_serum_R+82/bun_to_creatinine_ratio. That slot exists in the transformed CSV and processed JSON. It cannot be independently confirmed against a nonexistent submitted row; Member4 must explain the omission. The service exposes this limitation in its validation report.
- Null units on ratios map to `(calc)` in the submitted CSV; null measurement values remain distinct from absent reference bounds.
- Original study metadata ZIP is readable and passes ZIP integrity checking. Its six ISA members are recorded in the audit. The investigation file includes OSD-575. The application preserves the archive; it does not infer medical metadata or participant identities from it.
- The official study URL was opened: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575 . Its browser-accessible page is JavaScript-rendered and yielded no readable study details. This work verifies delivered source conversion, not that the supplied archive bytes independently match fresh NASA downloads. No NASA endorsement or clinical validity is claimed.

## Service usage and isolation

app/research.py has frozen Pydantic models, a read-only ResearchService, a chronological selector and two-CSV validation. It imports no database, API router or decision engine. It writes no files. No database migration or seed changes were made.

From backend/:

```python
from app.research import ResearchService
service = ResearchService()
series = service.select(crew="C001", metric="albumin")
single = service.select(crew="C001", metric="albumin", timepoint="L-3")
# Each result is (immutable Sample, immutable Measurement).
print(service.validation)
```

Invalid research crew, metric or timepoint raises ValueError. Invalid JSON structure, duplicate IDs, bad anchors, nonfinite/nonnumeric values, or mismatched missing flags fail validation. CSV disagreements fail loading, except the explicitly reported absent submitted row. Frozen tuple-backed models preserve source ordering while selector results use mission chronology.

NASA data retains dataset_type=real_nasa_osdr. It is never inserted into synthetic health tables, presented as A01–A04/Crew A–C, or passed to either investigation adapter. Existing API schemas reject a research dataset sent as an investigation request; C001 is not a seeded synthetic profile.

## Proposed research API — approval required, NOT implemented

Propose GET /api/v1/research/OSD-575/lab-results?crew_id=C001&metric=albumin&timepoint=L-3 (timepoint optional). Response proposal: schema_version, dataset_type, study_id, source_url, source_file, validation limitations, and points containing sample_id, crew_id, timepoint, phase, time_anchor, day_offset and the original Measurement object. Return 422 for unsupported selectors. No mutation endpoints. All research endpoints and error shape require team agreement before route registration.

This proposed endpoint uses a separate namespace and must never return the synthetic profile DTO. It is not available today; Member1 must not assume the URL exists.

## Member1 display guidance

After contract approval, display a separate NASA research panel with crew, metric and actual timepoint selectors. Retain units/source labels; show null as Not available. Use discrete sampling markers, not a continuous daily timeline. Preserve phase and anchor labels. Display source reference bounds as source metadata only; do not turn them into color-coded clinical risk, emergency or treatment thresholds. Expose the submitted-row limitation and research provenance. Existing synthetic dashboard and workflows remain independent.

## Executed tests

| Current run | Passed | Failed/errors | Skipped |
| --- | ---: | ---: | ---: |
| Backend pytest (existing 73 + 11 research tests) | 84 | 0 | 0 |
| Updated Member4 standalone harness | 11 | 1 | 20 |
| Updated Member4 isolated API harness | 12 | 1 | 19 |

Backend pytest emits one upstream Starlette/AnyIO deprecation warning. Research source audit confirms counts above. Test reports are under qa_results/osd575/; original vendor reports are untouched. Skips are not passes. The isolated API runner explicitly marks valid engine scenarios pending because no real engine is installed in its executing environment.

The generator byte-reproducibility failure remains CRLF versus LF on Windows, in the unchanged upstream JSON writer. No Member4 generator or test changes were made. The failure does not invalidate the observed CSV-to-JSON research match, and research conversion validation does not make that harness failure a pass.

Reproduce from backend/:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m integration.audit_research 'C:\Users\ZL_sht_H\Downloads\Telegram Desktop\MEDNAV_Member4_Data_QA_Package.zip'
.\.venv\Scripts\python.exe -m integration.run_member4_qa baseline --package vendor/member4_osd575/MEDNAV_Member4_Data_QA_Package --results qa_results/osd575
.\.venv\Scripts\python.exe -m integration.run_member4_qa integrated --package vendor/member4_osd575/MEDNAV_Member4_Data_QA_Package --results qa_results/osd575
```

## Member3 and team decisions

The fetched origin/feature/decision-engine exposes InvestigationRequest, InvestigationResponse, InventoryItem, evaluate_investigation and Rules. Its handoff declares demo-2. It remains a separate component and was inspected read-only. A backend adapter must validate Member4 synthetic requests using its model, call the actual evaluator, serialize the real response, and supply sanitized inventory/context. Existing frontend response shapes differ from Member4/engine list-based shapes; agreement is still needed before replacing default v1 behavior. S06 conflicting records, S12 empty-catalog context, report persistence, and full disconnected-browser QA remain pending. Never pass this NASA lab dataset to that engine.

Ready for team review as a service-layer extension. Next Member2 priority: obtain research endpoint/schema approval and resolve the Member4 source-row omission and newline bug; then coordinate the real synthetic engine adapter. No code was committed, pushed or merged during this continuation.
