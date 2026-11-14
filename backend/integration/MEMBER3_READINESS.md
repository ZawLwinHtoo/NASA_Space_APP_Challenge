# Member3 integration readiness review

Reviewed against origin/feature/decision-engine commit 2297c6af99a402a2aab354ed82eacd7335ec6b06. Current working branch is feature/backend-member4-integration. Engine source was inspected using Git object reads; it was not checked out, modified, imported or executed. No shared API_CONTRACT.md was found.

## Current verification

Backend command: `.venv/Scripts/python.exe -m pytest -q` from backend/.
Observed: 84 passed, 0 failed, 0 skipped in 9.34 seconds. One upstream Starlette/AnyIO deprecation warning. These are backend/research tests, not tests of the remote engine. Member4 harness results in OSD575_HANDOFF.md remain historical; that harness was not rerun during this review.

Existing uncommitted work was preserved: backend README, .gitattributes, QA runner options, research service/tests, source audit, OSD575 handoff, generated QA reports and updated package snapshot. This readiness document is the only newly authored file in this review. No commit, push or merge was performed.

## Interface and blockers

The engine exports InvestigationRequest, InvestigationResponse, InventoryItem, evaluate_investigation and Rules. evaluate_investigation accepts a typed request, optional candidate_checks collection, optional inventory iterable, Rules, and keyword-only evidence metadata. It returns a typed response. The inspected implementation accepts rule version demo-2.

| Boundary | Default backend | Member3 / integration issue |
| --- | --- | --- |
| Request | check_in_id and fixture_id | Full observation, baseline, equipment IDs, communication and manual override |
| Measurement | hr/sleep and nullable BP string | resting_hr_bpm/sleep_hours and separate systolic/diastolic values |
| Response | observations/resources objects; structured explanation/sources | String lists and explanation string; cannot be passed to default response model unchanged |
| Status | review/resource-unavailable/escalate | needs_review/insufficient_evidence/escalate |
| Equipment | Display names, quantity, available | equipment_id, quantity, usable, optional expires_on |
| Validation | Default DTOs plus provisional Member4 DTOs | Engine rejects negative supported readings, blank identifiers and duplicate equipment; allows nullable/dynamic baseline fields unlike fixed Member4 baseline |
| Dependencies | FastAPI ==0.115.0 | Engine requirements specify FastAPI >=0.116,<1; resolve in isolated environment before adopting a shared lock |

Member4's optional app has a closer response shape and an injectable Member3Engine callable. It is the appropriate first test boundary, not a silent replacement for app.main:app. It currently replaces submitted available_equipment with all usable inventory IDs; agree this policy versus an explicit allowlist intersection. Do not infer expiry when Member4 has supplied no expiry field.

## Proposed next implementation, in order

1. Agree and pin the engine revision, dependency versions, investigation request/response vocabulary, error envelope and equipment availability policy with Members1/3. Preserve default frontend behavior until a versioned transition is agreed.
2. Prepare an isolated engine checkout/environment. Do not merge the entire remote branch blindly: it includes frontend files. Review engine-owned changes separately and leave the dirty backend worktree intact.
3. Implement a backend-owned adapter validating with engine.InvestigationRequest, calling evaluate_investigation with sanitized inventory and explicit Rules, and returning model_dump(mode='json'). Do not map fixture IDs to engine output or relabel actual engine statuses to satisfy old DTOs.
4. Inject the real callable into create_member4_app for disposable-DB testing. Handle engine input validation as agreed 422 errors and invalid engine output as an integration error; never fall back to FixtureAdapter.
5. Add adapters for Member4 MEDNAV_EVALUATOR, MEDNAV_CONTEXT_EVALUATOR and MEDNAV_INVENTORY_API_EVALUATOR. Pass candidate_checks=[] explicitly for S12; keep S06 pending until conflict representation is agreed. The current QA runner removes inherited MEDNAV settings, so add an explicit opt-in engine mode before expecting it to execute real-engine tests.
6. Execute the engine's own tests, backend regression tests and full Member4 QA. Check exact replay determinism, null preservation, unavailable equipment exclusion, manual override with next_check=null, provenance, input immutability and offline import/evaluation. Report method passes, failures and skips separately.
7. Agree a persisted incident/report schema including actual response, input/resource snapshot, provenance and rule/catalog version before adding report storage. Verify reopening after restart using an isolated database.

## Independent research boundary

ResearchService remains read-only, with no routes, database or engine imports. NASA C001–C004 records must never be mapped onto synthetic A01–A04 or Crew A–C. Research endpoint proposal in OSD575_HANDOFF.md still requires approval. Member4 must also resolve the missing submitted CSV row and Windows generator newline defect; neither justifies modifying original data or faking engine results.

Readiness: suitable for a controlled adapter integration experiment, not ready to replace the default investigation endpoint or claim full application integration.
