# GitHub Pages demo

Source branch: `Final`. GitHub Actions builds and deploys on pushes to `Final`.
The previous `gh-pages` output remains available as deployment history.

The Pages build uses `VITE_PAGES_DEMO=true` and Vite base
`/NASA_Space_APP_Challenge/`. This explicitly selects the existing synthetic
fixture mode; the normal local build continues using FastAPI.

The public demo supports the dashboard, anatomy navigation and session-only
synthetic check-ins. The Python investigation engine, SQLite persistence,
medication stock, PDF reports and local voice services need a separately hosted
backend and are not provided by GitHub Pages. Data does not sync across devices.

Build from `frontend/` with `npm ci`, then set `VITE_PAGES_DEMO=true` and run
`npm run build -- --base=/NASA_Space_APP_Challenge/`.
The `.github/workflows/pages.yml` workflow uploads `frontend/dist/` and deploys
with the official GitHub Pages actions. Repository Settings → Pages uses
GitHub Actions. A `deployment.json` file records the exact Final commit deployed.

Files changed for this deployment: the Pages frontend build guards, smoke check,
deployment workflow, Pages helper and this usage note. Dependencies remain locked
by `frontend/package-lock.json`; no backend contracts are changed.

Acceptance criteria: the public dashboard and session check-in render under
the repository subpath at desktop and phone sizes, no localhost API or voice
requests occur, and server-only features have explicit unavailable states.

Validation: TypeScript/Vite production build passes. The existing contract unit
suite passes 14/16 tests; two unchanged component tests expect previous empty-state
copy (`No saved check-in` and `No saved check-in available`). No assertions were
weakened. Run `node audit/pages-smoke.mjs` after building to verify the production
output under the repository subpath in headless Microsoft Edge.
