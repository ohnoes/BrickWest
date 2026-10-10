# Startup and authentication fixes

Copy `backend/.env.example` to `backend/.env` and set a unique JWT_SECRET before starting. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Existing tokens signed with the placeholder secret will no longer work; sign in again.

The canonical database schema is `backend/scripts/schema.sql`, shipped in the backend Docker image. `npm run migrate` from `backend` applies the schema. Startup also initializes it transactionally and fails if initialization fails. The root `scripts/schema.sql` remains for compatibility with the original setup instructions.

For Docker Compose, provide JWT_SECRET in the environment or a Compose `.env` file. The API container uses the production start command; it does not require nodemon.

Public registration always creates a brewer. Administrator provisioning must be managed outside public registration. Socket.IO clients pass their token in `auth.token`; batch rooms and reading broadcasts are restricted to the batch owner or an administrator. These live events are broadcasts, not database writes; persist readings through the batch logs API.

The mobile app now uses shared authentication state for registration, login, and logout. A basic new-batch form creates a batch without an assigned recipe. Set the API URL to an address reachable from your device; localhost on a physical phone refers to that phone. Native Android/iOS project scaffolding is not included in this repository.

Run `npm ci`, `npm test`, and `npm run lint` from `backend`. Regression tests cover startup configuration, schema transaction behavior, registration roles, and socket authorization. Tests use a database stub; a live PostgreSQL migration and a mobile emulator smoke test are still required before deployment.

## API hardening

See `docs/TESTING.md` for how to test locally, in CI and on Railway.

Set `REGISTRATION_CODE` on any public deployment. When it is set, `POST /api/auth/register` requires a matching `registration_code` field; when it is not, anyone who can reach the API can create an account, and the server logs a warning at startup. Emails are stored lowercase and matched case-insensitively. New passwords must be 8 to 72 characters. Deactivated users (`users.active = false`) can no longer log in. `/api/auth/*` is limited to 30 requests per 15 minutes per client address (`AUTH_RATE_LIMIT_MAX`).

Invalid input now returns 400 with a short message instead of a 500 containing database error text: non-numeric IDs, bad `limit`/`offset`, unknown statuses, out-of-range readings. A duplicate batch number returns 409. Readings can only be logged against a batch that exists and is not deleted, and `POST /api/batches/:id/logs` returns the saved reading as `log`. Request bodies are limited to 256 KB.

The unauthenticated `/api/fermentation/*` placeholder routes were removed. They returned success without saving anything; use `/api/batches/:id/logs`.

Batches, recipes, tasks and vessels are shared by every signed-in user. Live Socket.IO batch rooms are still restricted to the batch owner or an administrator.

