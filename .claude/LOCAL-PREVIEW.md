# Local admin preview (demo data)

Local notes only (untracked, never commit). The demo API keeps everything in memory, so every restart resets the data and signs you out.

## Start it

From the Claude desktop app: start the previews `api-demo` (port 4000) and `admin-real-api-3100` (port 3100), defined in `.claude/launch.json`.

From a terminal instead (two windows):

```bash
cd kredibble-backend && APP_ENV=test npm run e2e:server:demo
```

```bash
cd kredibble-admin && NEXT_PUBLIC_API_URL=http://localhost:4000/api NEXT_PUBLIC_USE_MOCKS=false npm run dev -- -p 3100
```

Then open http://localhost:3100.

Port 3000 is used by the Croe project's dev server, so this preview runs on 3100. While an e2e run is going, ports 3100 and 4000 belong to the tests, so the preview is down until they finish.

## Sign in

These are the test admin defaults from `kredibble-backend/scripts/e2e-server.js` (used when `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` are not set). They only work on this local test API, never on staging or production.

- Email: `test-admin@kredibble.com`
- Password: `Password123`
