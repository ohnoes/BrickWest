# Testing

There are three layers, from fastest to most realistic.

## 1. Automated tests (CI and local)

Every pull request and every push to `main` runs `.github/workflows/backend.yml`:

1. `npm run lint`
2. `npm test` against a real PostgreSQL 16 service
3. boots the server, runs the smoke test against it, and checks it shuts down cleanly on `SIGTERM`
4. builds the Docker image (nothing is pushed)

To run the same tests locally you need a **disposable** PostgreSQL database:

```bash
cd backend
npm ci
createdb brickwest_test
NODE_ENV=test DB_NAME=brickwest_test DB_USER=postgres DB_PASSWORD=postgres \
  JWT_SECRET=local-test-secret npm test
```

`test/api.test.js` only runs when `NODE_ENV=test`, because it writes rows. Without it,
`npm test` runs just the database-free checks in `test/regression.test.js`.

## 2. Smoke test against a running API

`backend/scripts/smoke.js` needs only Node 18+ (no `npm install`) and works against any
deployment:

```bash
cd backend

# Local or Docker
npm run smoke

# Railway: use the public domain from the service's Settings → Networking
BASE_URL=https://<your-service>.up.railway.app npm run smoke
```

By default it registers a throwaway user, creates a recipe, a batch and one reading (all
labelled `SMOKE`), then discards the batch and deletes the recipe.

| Variable | Purpose |
| --- | --- |
| `BASE_URL` | API origin without `/api`. Default `http://localhost:3001` |
| `SMOKE_EMAIL`, `SMOKE_PASSWORD` | Log in as an existing account instead of registering |
| `REGISTRATION_CODE` | Sent when registering, if the server requires one |
| `SMOKE_READONLY=1` | Log in and read only; creates nothing. Requires `SMOKE_EMAIL` |

For production, prefer the read-only mode with a dedicated account:

```bash
BASE_URL=https://<your-service>.up.railway.app SMOKE_READONLY=1 \
  SMOKE_EMAIL=smoke@example.com SMOKE_PASSWORD=... npm run smoke
```

## 3. Railway

Railway is connected to this repository and **deploys every push to `main` straight to
the production environment**. `railway.json` sets a `/health` healthcheck, so a build
that fails to start is not switched in and the previous deployment keeps serving.

To test changes before they reach production, use one of:

- **PR environments** (Project Settings → Environments → enable PR environments). Railway
  creates a temporary copy of the service and database for each pull request and removes
  it on merge. Run the smoke test against the PR environment's domain.
- **A staging environment** (Environments → New Environment → duplicate production),
  pointed at a `develop` branch. CI already runs on `develop`.

Each environment needs its own `JWT_SECRET`; set `REGISTRATION_CODE` on any that is
publicly reachable.

## Mobile app

The `mobile/` folder contains screens and navigation but not the native iOS/Android
project scaffolding, so it cannot be built or tested yet.
