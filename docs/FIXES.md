# Startup and authentication fixes

Copy `backend/.env.example` to `backend/.env` and set a unique JWT_SECRET before starting. Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Existing tokens signed with the placeholder secret will no longer work; sign in again.

The canonical database schema is `backend/scripts/schema.sql`, shipped in the backend Docker image. `npm run migrate` from `backend` applies the schema. Startup also initializes it transactionally and fails if initialization fails. The root `scripts/schema.sql` remains for compatibility with the original setup instructions.

For Docker Compose, provide JWT_SECRET in the environment or a Compose `.env` file. The API container uses the production start command; it does not require nodemon.

Public registration always creates a brewer. Administrator provisioning must be managed outside public registration. Socket.IO clients pass their token in `auth.token`; batch rooms and reading broadcasts are restricted to the batch owner or an administrator. These live events are broadcasts, not database writes; persist readings through the batch logs API.

The mobile app now uses shared authentication state for registration, login, and logout. A basic new-batch form creates a batch without an assigned recipe. Set the API URL to an address reachable from your device; localhost on a physical phone refers to that phone. Native Android/iOS project scaffolding is not included in this repository.

Run `npm ci`, `npm test`, and `npm run lint` from `backend`. Regression tests cover startup configuration, schema transaction behavior, registration roles, and socket authorization. Tests use a database stub; a live PostgreSQL migration and a mobile emulator smoke test are still required before deployment.
