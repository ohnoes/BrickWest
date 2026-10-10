// Smoke test for a running Brewmaster API (local, Docker or Railway).
// Uses only Node built-ins, so it runs anywhere with Node 18+:
//
//   BASE_URL=https://your-service.up.railway.app node scripts/smoke.js
//
// Environment:
//   BASE_URL            API origin, without /api (default http://localhost:3001)
//   SMOKE_EMAIL         log in as this existing account instead of registering
//   SMOKE_PASSWORD      password for SMOKE_EMAIL
//   REGISTRATION_CODE   sent when registering, if the server requires one
//   SMOKE_READONLY=1    only log in and read; create nothing (use for production)
//
// Without SMOKE_READONLY it creates a recipe, a batch and one reading, all
// labelled SMOKE, then discards the batch and deletes the recipe. Without
// SMOKE_EMAIL it also leaves behind one throwaway user account.

const base = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const readOnly = process.env.SMOKE_READONLY === '1';
const stamp = Date.now().toString(36);
let token = null;
let failures = 0;

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}`);
    return true;
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}  ->  ${error.message}`);
    return false;
  }
}

function expect(result, status) {
  if (result.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${result.status}: ${JSON.stringify(result.data)}`);
  }
  return result.data;
}

console.log(`Smoke testing ${base}${readOnly ? ' (read-only)' : ''}\n`);

const healthy = await step('GET /health', async () => {
  const data = expect(await call('GET', '/health'), 200);
  if (data?.status !== 'ok') throw new Error('unexpected body');
});
if (!healthy) {
  console.log('\nThe API is not reachable; skipping the remaining checks.');
  process.exit(1);
}

await step('unauthenticated request is rejected', async () => {
  expect(await call('GET', '/api/batches'), 401);
});

const signedIn = await step('sign in', async () => {
  if (process.env.SMOKE_EMAIL) {
    const data = expect(await call('POST', '/api/auth/login', {
      email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD
    }), 200);
    token = data.token;
    return `logged in as ${data.user.email}`;
  }
  if (readOnly) throw new Error('SMOKE_READONLY needs SMOKE_EMAIL and SMOKE_PASSWORD');
  const data = expect(await call('POST', '/api/auth/register', {
    email: `smoke-${stamp}@example.test`,
    password: `smoke-${stamp}-${Math.random().toString(36).slice(2)}`,
    name: 'Smoke Test',
    registration_code: process.env.REGISTRATION_CODE
  }), 201);
  token = data.token;
  return `registered ${data.user.email}`;
});

if (signedIn) {
  await step('GET /api/team/today', async () => {
    const data = expect(await call('GET', '/api/team/today'), 200);
    return `${data.tasks.open} open tasks, ${data.vessels.occupied}/${data.vessels.total} tanks in use`;
  });
  await step('GET /api/batches', async () => `${expect(await call('GET', '/api/batches?limit=5'), 200).length} returned`);
  await step('GET /api/recipes', async () => `${expect(await call('GET', '/api/recipes?limit=5'), 200).length} returned`);
  await step('invalid input returns 400, not 500', async () => {
    expect(await call('GET', '/api/batches/not-a-number'), 400);
  });

  if (!readOnly) {
    let recipe, batch;
    await step('create recipe', async () => {
      recipe = expect(await call('POST', '/api/recipes', {
        name: `SMOKE ${stamp}`, style: 'Test', target_abv: 5, volume_liters: 100
      }), 201);
      return `id ${recipe.id}`;
    });
    await step('create batch', async () => {
      batch = expect(await call('POST', '/api/batches', {
        batch_number: `SMOKE-${stamp}`, recipe_id: recipe?.id, brew_date: new Date().toISOString().slice(0, 10)
      }), 201);
      return `id ${batch.id}`;
    });
    if (batch) {
      await step('duplicate batch number returns 409', async () => {
        expect(await call('POST', '/api/batches', { batch_number: `SMOKE-${stamp}` }), 409);
      });
      await step('move batch to fermenting', async () => {
        expect(await call('PUT', `/api/batches/${batch.id}/status`, { status: 'fermenting' }), 200);
      });
      await step('log a fermentation reading', async () => {
        expect(await call('POST', `/api/batches/${batch.id}/logs`, {
          phase: 'fermenting', temperature: 19.5, gravity: 1.05, ph: 4.4, notes: 'smoke test'
        }), 201);
      });
      await step('read the reading back', async () => {
        const logs = expect(await call('GET', `/api/batches/${batch.id}/logs`), 200);
        if (logs.length !== 1) throw new Error(`expected 1 reading, found ${logs.length}`);
      });
      await step('cleanup: discard batch', async () => {
        expect(await call('PUT', `/api/batches/${batch.id}/status`, { status: 'discarded' }), 200);
      });
    }
    if (recipe) {
      await step('cleanup: delete recipe', async () => {
        expect(await call('DELETE', `/api/recipes/${recipe.id}`), 200);
      });
    }
  }
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
