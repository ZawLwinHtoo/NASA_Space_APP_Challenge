# Shared backend checkout

This branch includes backend-owned adapters and an unchanged snapshot of the verified Member3 Stable v1 engine. No separate engine checkout, .trial directory, external PYTHONPATH or experimental Member3 branch is required to run the backend.

From a clean clone:

```powershell
git fetch origin
git switch --track origin/feature/backend-member4-integration
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

If you already have the branch locally, switch to it and use `git pull --ff-only` after saving your own changes. Do not reset a dirty teammate checkout. For an existing frontend/engine working tree, prefer a separate clone or worktree for the backend demo.

Member1: follow FRONTEND_API_HANDOFF.md. Save a synthetic check-in, use its returned id with POST /api/v1/investigations/evaluate, and consume the canonical engine response. OpenAPI is /openapi.json; /docs is disabled. Keep radiation/microgravity telemetry out of the strict check-in request. CORS currently permits localhost/127.0.0.1 port 5173 only.

Member3: backend/vendor/member3_stable/engine is pinned to commit 2297c6af99a402a2aab354ed82eacd7335ec6b06 (demo-2). Continue engine improvements independently; do not replace this verified snapshot during the demo without a reviewed adapter regression run. The backend does not need your experimental branch on PYTHONPATH.

Existing backend requirements preserve FastAPI 0.115.0; the real adapter has also been verified separately with 0.116.1. The engine's own requirements specify >=0.116, so its standalone suite should be run in an isolated declared-compatible environment rather than installing conflicting requirements over the backend environment. See REAL_ENGINE_INTEGRATION.md for historical commands.

Only synthetic seeds create a new local mednav.db at startup. Database files, virtual environments, caches and credentials are not versioned. NASA research source assets are separate and read-only. The duplicated MEDNAV_NASA_OSD575_Handoff.zip delivery bundle is omitted from Git; the actual research JSON, source CSVs, original metadata ZIP and documentation are included unchanged.

Incident/report persistence is not implemented. Check-ins and inventory persist locally; evaluation responses must not be presented as transmitted or durably saved reports.
