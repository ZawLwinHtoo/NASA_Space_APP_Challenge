# GitHub Pages demo

Source branch: `MEDNAV-v1`. Public output branch: `gh-pages`.

The Pages build uses `VITE_PAGES_DEMO=true` and Vite base
`/NASA_Space_APP_Challenge/`. This explicitly selects the existing synthetic
fixture mode; the normal local build continues using FastAPI.

The public demo supports the dashboard, anatomy navigation and session-only
synthetic check-ins. The Python investigation engine, SQLite persistence,
medication stock, PDF reports and local voice services need a separately hosted
backend and are not provided by GitHub Pages. Data does not sync across devices.

Build from `frontend/` with `npm ci`, then set `VITE_PAGES_DEMO=true` and run
`npm run build -- --base=/NASA_Space_APP_Challenge/`.
Publish only `frontend/dist/` to `gh-pages`, with an empty `.nojekyll` file.
Select `gh-pages` / root under repository Settings → Pages.

Acceptance criteria: the public dashboard and session check-in render under
the repository subpath at desktop and phone sizes, no localhost API or voice
requests occur, and server-only features have explicit unavailable states.

Validation: TypeScript/Vite production build passes. The existing contract unit
suite passes 14/16 tests; two unchanged component tests expect previous empty-state
copy (`No saved check-in` and `No saved check-in available`). No assertions were
weakened. Run `node audit/pages-smoke.mjs` after building to verify the production
output under the repository subpath in headless Microsoft Edge.
