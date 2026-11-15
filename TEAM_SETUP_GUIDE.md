# MEDNAV teammate setup — Windows

## Updating your local code from `Final` (and `main`)

The latest integrated MEDNAV build is published on **`Final`** (and **`main`** has been updated to match `Final`).

- **Fresh checkout of `Final`:**
  ```powershell
  git fetch origin
  git checkout -B Final origin/Final
  ```
- **Sync your local `main`** *(note: `origin/main` was force-updated to `Final`)*:
  ```powershell
  git fetch origin
  git checkout main
  git reset --hard origin/main
  ```
- **Merge `Final` updates into your feature branch:**
  ```powershell
  git fetch origin
  git merge origin/Final
  ```
- **Install any updated frontend/backend dependencies after pulling:**
  ```powershell
  npm --prefix frontend install
  backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
  ```

---

Use this guide for `feature/body-system-monitoring-v1` (BodyGraph v3, including v1/v2 monitoring and follow-up). No teammate's checkout, virtual environment, database or installed model is required. The original integrated demo remains on `integration/first-live-demo`.

## Prerequisites

- Git; Windows 10/11 PowerShell 5.1+.
- Python **3.11–3.13** with venv/pip; clean verification uses **3.13.1**. Use a supported 64-bit CPython build. The optional voice wheel must support your Python/platform.
- Node.js **22 LTS or 24 LTS**, including npm; verification uses **24.14.0**.
- Microsoft Edge for the configured browser tests (application itself works in a modern browser). Tests use Playwright `channel: msedge`. If absent, install Edge or run `npx.cmd playwright install msedge` from frontend/; browser installation can require administrator access and a substantial download.
- Internet for package installation; afterward core services and the installed voice model run locally. Fonts/detailed anatomy may use optional external assets and fall back offline.

## Clone and install

```powershell
git clone --branch feature/body-system-monitoring-v1 https://github.com/ZawLwinHtoo/NASA_Space_APP_Challenge.git MEDNAV
cd MEDNAV
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
cd frontend
npm.cmd ci
cd ..
```

If `python` is a Windows Store alias or selects another version, use `py -3.13 -m venv backend/.venv`. No activation is required. Install the documented backend manifest, **not** every requirements file recursively: the vendor engine contains its historical standalone dependency declarations. The tested unified environment uses backend pins (including FastAPI 0.115.0); the unchanged engine functions/tests work there. Alignment with its historical FastAPI >=0.116 declaration remains a packaging review item, not an observed core runtime failure.

## Optional offline voice

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-voice.txt
```

PocketSphinx 5.1.1 includes its English acoustic/language model and dictionary in the wheel: approximately **29 MB / 27.7 MiB** for tested Windows Python 3.13, plus small dependencies. No separate model folder, GPU, FFmpeg, cloud API key or runtime model download is needed. Install before disconnecting. Do not copy a teammate's model/venv.

Voice is **experimental**. Known recordings can lose important words, even though the HTTP service is operational. Transcript review/correction and explicit Apply → Review → Save remain mandatory. Physical microphone/noise/accent accuracy is not certified. Missing voice dependencies produce an explicit service error/warning; the manual demo remains usable.

## Start the complete application

From the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-mednav-demo.ps1
```

Open **http://127.0.0.1:5173/**. API: **http://127.0.0.1:8000/api/v1**. Health: `/api/v1/healthz`; schema: `http://127.0.0.1:8000/openapi.json`. `/docs` is intentionally disabled.

The launcher checks the environment, starts missing services, prints readiness and warns if voice is unavailable. It reuses ready services only when process ownership matches this checkout; it refuses a port occupied by another or unverifiable checkout. **Stop the other checkout before testing a new clone.** It does not kill unrelated port owners. Logs/process ownership are in ignored `.demo-runtime/`.

Shutdown only this launcher's owned processes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-mednav-demo.ps1 -Stop
```

Reused processes remain owned by their original launcher/terminal. An alternative prepared Python can be selected with `-PythonPath`, but this is not needed for normal setup.

## Database initialization and data safety

First FastAPI startup automatically creates `backend/mednav.db`, tables and the versioned fictional seed. Default demo has **Crew A/B/C**, their recorded baselines/history, and synthetic inventory. No database download, migration command, cloud account or Member 4 import is needed for the core demo. Restart retains observations/inventory; seed logic does not reset existing records.

Never commit or share your working DB as setup. Tests use temporary SQLite files; **browser tests mutate whichever running backend they target**, appending synthetic check-ins and changing inventory. Use a disposable DB for test runs or a dedicated test checkout. To choose a new disposable SQLite file before starting:

```powershell
$env:MEDNAV_DATABASE_URL='sqlite:///demo-tests.sqlite3'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/start-mednav-demo.ps1
```

The relative file is created in backend/ because that is the server working directory. Stop the services before changing this variable; starting the launcher does not reconfigure an already-running server. Clear it when returning to the normal demo:

```powershell
Remove-Item Env:MEDNAV_DATABASE_URL -ErrorAction SilentlyContinue
```

Do not delete/reset an existing database to fix a setup problem; inspect the error or select a new disposable path.

## Reproduce the core demo

1. Load the default live mode and select Crew B.
2. Health Check-In: enter HR 95, sleep 3.5, leave both BP fields Unknown, select Headache/Fatigue. Review and save.
3. Open Investigation. Original styled evidence/Decision Trace show the real backend result for the returned saved record ID.
4. What-If Lab: change BP monitor availability and inspect the new response. **These controls change shared SQLite inventory.** Communication/override are explicit simulation context; they do not rewrite saved medical observations. BP-record simulation controls are read-only in live mode.
5. Enable manual emergency override: expect `escalate` and `next_check=null`, not an ordinary check. No automatic emergency inference is claimed.
6. Refresh/reselect the crew. Records/inventory persist; temporary crew/context/form state resets. Report is a local preview/download, not durable incident storage or actual Earth transmission.
7. Footer Developer tools provides saved IDs, raw diagnostics and explicit local fixture mode. A failed live request never silently selects fixtures.

Radiation/ARED/mass/ocular fields are illustrative and not persisted by the strict check-in API. Anatomy is a display/navigation model, not a real scan. OSD-575 research loader remains isolated and has no public research view/route. The pinned Stable v1 engine is vendored under `backend/vendor/member3_stable`, commit `2297c6af99a402a2aab354ed82eacd7335ec6b06`, rules `demo-2`; no ignored `.trial` checkout or remote engine branch is required.

## Run tests

Start services against a disposable DB first. From backend/:

```powershell
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/python.exe -m pytest vendor/member3_stable/engine/tests -o pythonpath=vendor/member3_stable -q
```

Default backend collection excludes standalone vendor tests, so those suites are distinct. With no optional speech package/test WAV, real-model tests may be **skipped**, not passed. Generate the voice fixture below and install voice to exercise them.

From frontend/:

```powershell
npm.cmd run build
npm.cmd run test:unit
npm.cmd run test:core
```

`test:core` explicitly excludes voice/recorder-named cases; it does not change their assertions or claim speech success. It runs the stable manual/live integration regressions. Tests create their generated directories automatically.

For the full suite including known voice failures, from repository root generate actual synthetic speech using built-in Windows System.Speech (an English TTS voice must be available):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/create-voice-test-wav.ps1
cd frontend
npm.cmd test -- --workers=1
# Or only optional voice cases:
npm.cmd run test:voice
```

The generated ignored WAV is real audio test input, not a mocked transcript. Automated capture uses a WAV-backed microphone device; it does not verify the physical presentation microphone. Voice phrase assertions are known to fail intermittently and must be reported honestly. Keep the stable core demo separate from that defect; do not hardcode expected speech.

## Troubleshooting and limitations

- **Port occupied / wrong checkout:** stop that checkout using its launcher or original terminal. Do not start duplicate servers or assume a reused server belongs to this clone.
- **Scripts disabled:** use the shown per-process `-ExecutionPolicy Bypass` command; no persistent system-policy change is required.
- **Python/import failure:** confirm `backend/.venv/Scripts/python.exe` exists and install requirements into it, not a global interpreter. Check `.demo-runtime/backend.stderr.log`.
- **PyPI connection reset:** retry the installation on a stable connection. The second clean-clone run succeeded with pip 24.3.1 using `--use-deprecated=legacy-certs --no-cache-dir --index-url https://pypi.org/simple` on the same install command. This selects pip's verified certificate path; it does not disable TLS verification. Use this fallback only if your pip supports it; do not use `--trusted-host` or disable certificate checks.
- **npm/Vite missing:** run `npm.cmd ci` from frontend/. Use Node 22/24; package-lock is tracked. Check `.demo-runtime/frontend.stderr.log`.
- **Browser test cannot launch Edge:** install Edge or Playwright's msedge channel. No browser download is required when compatible Edge already exists.
- **Missing voice model:** install requirements-voice into this clone's venv and restart its backend. `/api/v1/voice/status` reports availability. Do not treat a 503 as a medical result.
- **Voice transcript wrong:** correct it explicitly or use manual entry. Captured browser audio quality remains a known P1; voice success is not a publication gate for the verified core.
- **Mobile Incident Report:** the scoped v2 fix now covers 375/390 px without changing the desktop columns; see `MEDNAV_V2_QA_FIX_REPORT.md` for verification.
- **Offline assets:** installed core engine/DB/STT need no external service. Google Fonts and detailed anatomy CDN assets may fail; fallback fonts/schematic remain. Vendor approved assets separately if identical offline visuals are required.
- **Different device:** 127.0.0.1 is that device, not another PC. LAN binding/CORS/HTTPS microphone access require deliberate configuration. The tested setup is same-PC localhost.
- **API URL override:** set `VITE_API_URL` before starting/building Vite, default `http://127.0.0.1:8000/api/v1`, no trailing slash. Do not send radiation/microgravity extras to strict POST check-ins.
- No authentication, cloud sync, validated clinical reasoning, medication/treatment system or NASA endorsement is claimed. All competition health records are synthetic.

## BodyGraph v3 demo and handoff

In Live Mode select a crew, then use Mission replay inside Selected Anatomy to select an exact saved timestamp/check-in. Choose any of the eight region labels. Heart/Brain show recorded HR/sleep history; the other systems display original reported symptoms and honest missing-measurement states. Ocular assessments are not persisted and remain Unknown. Expand Cross-system observations or Recorded follow-up, or investigate the selected saved record using the existing real engine. Return to latest restores current monitoring. Replay itself does not mutate measurements or save an event.

For implementation details, actual test counts, screenshots, the reproducible synthetic evaluation and remaining limitations, read `BODYGRAPH_V3_REPORT.md`. Local screenshot/test-log folders are ignored and are not required to run the application. Reproduce browser evidence on a disposable database using the tracked Playwright suites. This branch includes the additive follow-up model/API documented in `backend/integration/FOLLOW_UP_API_V1.md`; startup creates its table without resetting existing records. Incident reports remain session previews, and evidence markers are not clinical severity or approval labels.
