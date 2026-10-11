// End-to-end API tests against a real PostgreSQL database.
//
// They run when NODE_ENV=test (as in CI) and are skipped otherwise, so a stray
// `npm test` can never write test rows into a real database. Point DB_* (or
// DATABASE_URL) at a disposable database before running them.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret-that-is-never-used-in-production';

const enabled = process.env.NODE_ENV === 'test';
const skip = enabled ? false : 'set NODE_ENV=test and point DB_* at a disposable database';

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = 'correct-horse-battery';
let request, pool, createApp, api, token;

const emailFor = name => `${name}-${run}@example.test`;
const authed = req => req.set('Authorization', `Bearer ${token}`);

before(async () => {
  if (!enabled) return;
  ({ default: request } = await import('supertest'));
  ({ default: pool } = await import('../src/db.js'));
  ({ createApp } = await import('../src/app.js'));
  const { default: initializeDatabase } = await import('../src/initDb.js');
  await initializeDatabase();
  // Run it twice: startup re-applies the schema on every boot.
  await initializeDatabase();
  api = request(createApp({ auth: { registrationCode: '', rateLimitOptions: { max: 1000 } } }));

  const res = await api.post('/api/auth/register').send({ email: emailFor('Brewer'), password, name: 'Test Brewer' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  token = res.body.token;
});

after(async () => {
  if (pool) await pool.end();
});

test('health check and unknown routes', { skip }, async () => {
  const health = await api.get('/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.headers['x-powered-by'], undefined);

  const missing = await api.get('/api/nope');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Not found' });

  // The old unauthenticated placeholder that reported success without saving anything.
  const placeholder = await api.post('/api/fermentation/1/readings').send({});
  assert.equal(placeholder.status, 404);
});

test('the web app is served with a strict content security policy', { skip }, async () => {
  const page = await api.get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['content-type'], /text\/html/);
  assert.match(page.text, /Brickwest Brewmaster/);
  const csp = page.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);

  for (const asset of ['/app.js', '/app.css']) {
    assert.equal((await api.get(asset)).status, 200, asset);
  }
  // No inline script or style, which the policy would block.
  assert.doesNotMatch(page.text, /<script(?![^>]*\bsrc=)|<style|\sstyle=|\son[a-z]+=/i);
});

test('malformed and oversized bodies are rejected cleanly', { skip }, async () => {
  const malformed = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":');
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body, { error: 'Invalid JSON' });

  const huge = await authed(api.post('/api/recipes')).send({ name: 'Big', notes: 'x'.repeat(300 * 1024) });
  assert.equal(huge.status, 413);
});

test('registration validates input and normalizes email', { skip }, async () => {
  const post = body => api.post('/api/auth/register').send(body);
  assert.equal((await post({ email: 'not-an-email', password, name: 'A' })).status, 400);
  assert.equal((await post({ email: emailFor('short'), password: 'short', name: 'A' })).status, 400);
  assert.equal((await post({ email: emailFor('long'), password: 'x'.repeat(80), name: 'A' })).status, 400);
  assert.equal((await post({ email: emailFor('noname'), password, name: '   ' })).status, 400);
  assert.equal((await post({ email: emailFor('missing') })).status, 400);

  const created = await post({ email: `  ${emailFor('Mixed.Case')}  `, password, name: ' Mixed ', role: 'admin' });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, emailFor('mixed.case'));
  assert.equal(created.body.user.name, 'Mixed');
  assert.equal(created.body.user.role, 'brewer');
  assert.equal(created.body.user.password_hash, undefined);

  const duplicate = await post({ email: emailFor('MIXED.CASE'), password, name: 'Again' });
  assert.equal(duplicate.status, 409);
});

test('login accepts any email casing and rejects bad or deactivated accounts', { skip }, async () => {
  const login = body => api.post('/api/auth/login').send(body);
  const email = emailFor('brewer');

  const ok = await login({ email: email.toUpperCase(), password });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.email, email);

  assert.equal((await login({ email, password: 'wrong-password' })).status, 401);
  assert.equal((await login({ email: emailFor('nobody'), password })).status, 401);
  assert.equal((await login({ email })).status, 400);
  assert.equal((await login({ email: { $ne: '' }, password })).status, 400);

  const other = emailFor('deactivated');
  assert.equal((await api.post('/api/auth/register').send({ email: other, password, name: 'Gone' })).status, 201);
  await pool.query('UPDATE users SET active = FALSE WHERE email = $1', [other]);
  assert.equal((await login({ email: other, password })).status, 401);
});

test('registration code gates sign-up when configured', { skip }, async () => {
  const gated = request(createApp({ auth: { registrationCode: 'hops-and-barley', rateLimitOptions: { max: 1000 } } }));
  const body = { email: emailFor('invited'), password, name: 'Invited' };
  assert.equal((await gated.post('/api/auth/register').send(body)).status, 403);
  assert.equal((await gated.post('/api/auth/register').send({ ...body, registration_code: 'wrong' })).status, 403);
  assert.equal((await gated.post('/api/auth/register').send({ ...body, registration_code: 'hops-and-barley' })).status, 201);
});

test('auth endpoints are rate limited', { skip }, async () => {
  const limited = request(createApp({ auth: { registrationCode: '', rateLimitOptions: { max: 3, windowMs: 60000 } } }));
  const attempt = () => limited.post('/api/auth/login').send({ email: emailFor('nobody'), password });
  for (let i = 0; i < 3; i++) assert.equal((await attempt()).status, 401);
  const blocked = await attempt();
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
});

test('protected routes require a valid token', { skip }, async () => {
  for (const path of ['/api/batches', '/api/recipes', '/api/team/today', '/api/team/tasks', '/api/inventory/items']) {
    assert.equal((await api.get(path)).status, 401, path);
    assert.equal((await api.get(path).set('Authorization', 'Bearer not-a-token')).status, 401, path);
  }
});

test('recipe lifecycle with validation', { skip }, async () => {
  assert.equal((await authed(api.post('/api/recipes')).send({ style: 'IPA' })).status, 400);
  assert.equal((await authed(api.post('/api/recipes')).send({ name: 'Bad', target_abv: 'strong' })).status, 400);
  assert.equal((await authed(api.post('/api/recipes')).send({ name: 'Bad', volume_liters: 0 })).status, 400);
  assert.equal((await authed(api.post('/api/recipes')).send({ name: 'Bad', ingredients: 'hops' })).status, 400);

  const created = await authed(api.post('/api/recipes')).send({
    name: `West Coast IPA ${run}`, style: 'IPA', target_abv: 6.5, target_ibu: 60, volume_liters: 1000,
    ingredients: [{ name: 'Citra', amount: 5, unit: 'kg' }], notes: 'Dry hop day 4'
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.deepEqual(created.body.ingredients, [{ name: 'Citra', amount: 5, unit: 'kg' }]);
  assert.equal(created.body.version, 1);

  const minimal = await authed(api.post('/api/recipes')).send({ name: `Minimal ${run}` });
  assert.equal(minimal.status, 201);
  assert.equal(minimal.body.ingredients, null);

  assert.equal((await authed(api.get(`/api/recipes/${id}`))).body.name, `West Coast IPA ${run}`);
  assert.equal((await authed(api.get('/api/recipes/abc'))).status, 400);
  assert.equal((await authed(api.get('/api/recipes/99999999999'))).status, 400);
  assert.equal((await authed(api.get('/api/recipes/2147483000'))).status, 404);
  assert.equal((await authed(api.get('/api/recipes?limit=abc'))).status, 400);
  assert.equal((await authed(api.get('/api/recipes?limit=0'))).status, 400);

  const list = await authed(api.get('/api/recipes?limit=5&offset=0'));
  assert.equal(list.status, 200);
  assert.ok(list.body.length >= 1 && list.body.length <= 5);

  const updated = await authed(api.put(`/api/recipes/${id}`)).send({ target_ibu: 65 });
  assert.equal(updated.status, 200);
  assert.equal(Number(updated.body.target_ibu), 65);
  assert.equal(updated.body.name, `West Coast IPA ${run}`);
  assert.equal(updated.body.version, 2);
  assert.equal((await authed(api.put(`/api/recipes/${id}`)).send({ target_ibu: -1 })).status, 400);

  assert.equal((await authed(api.delete(`/api/recipes/${id}`))).status, 200);
  assert.equal((await authed(api.delete(`/api/recipes/${id}`))).status, 404);
  assert.equal((await authed(api.get(`/api/recipes/${id}`))).status, 404);
});

test('batch lifecycle, fermentation logs and validation', { skip }, async () => {
  const number = `T-${run}`;
  assert.equal((await authed(api.post('/api/batches')).send({})).status, 400);
  assert.equal((await authed(api.post('/api/batches')).send({ batch_number: number, volume_produced: -5 })).status, 400);
  assert.equal((await authed(api.post('/api/batches')).send({ batch_number: number, brew_date: 'someday' })).status, 400);
  const badRecipe = await authed(api.post('/api/batches')).send({ batch_number: number, recipe_id: 2147483000 });
  assert.equal(badRecipe.status, 400);
  assert.equal(badRecipe.body.error, 'Recipe does not exist');

  const created = await authed(api.post('/api/batches')).send({ batch_number: number, brew_date: '2026-10-10', volume_produced: 950.5 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  assert.equal(created.body.status, 'milling');

  const duplicate = await authed(api.post('/api/batches')).send({ batch_number: number });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'Batch number already exists');

  assert.equal((await authed(api.get('/api/batches?status=bogus'))).status, 400);
  assert.equal((await authed(api.get('/api/batches?offset=-1'))).status, 400);
  assert.equal((await authed(api.get('/api/batches/abc'))).status, 400);
  assert.equal((await authed(api.get('/api/batches/2147483000'))).status, 404);

  assert.equal((await authed(api.put(`/api/batches/${id}/status`)).send({ status: 'drinking' })).status, 400);
  const fermenting = await authed(api.put(`/api/batches/${id}/status`)).send({ status: 'fermenting' });
  assert.equal(fermenting.status, 200);
  assert.equal(fermenting.body.status, 'fermenting');

  const filtered = await authed(api.get('/api/batches?status=fermenting&limit=200'));
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.some(batch => batch.id === id));

  const log = body => authed(api.post(`/api/batches/${id}/logs`)).send(body);
  assert.equal((await log({ phase: 'fermenting', temperature: '19', gravity: 1.05 })).status, 400);
  assert.equal((await log({ phase: 'fermenting', temperature: 19 })).status, 400);
  assert.equal((await log({ phase: 'fermenting', temperature: 19, gravity: 1.05, ph: 42 })).status, 400);
  assert.equal((await log({ phase: 'fermenting', temperature: 19, gravity: 1.05, measured_at: 'yesterday-ish' })).status, 400);
  assert.equal((await log({ temperature: 19, gravity: 1.05 })).status, 400);

  const logged = await log({ phase: 'fermenting', temperature: 19.5, gravity: 1.052, ph: 4.4, notes: 'Krausen forming' });
  assert.equal(logged.status, 201, JSON.stringify(logged.body));
  assert.equal(logged.body.logged, true);
  assert.equal(Number(logged.body.log.gravity), 1.052);

  const missing = await authed(api.post('/api/batches/2147483000/logs')).send({ phase: 'fermenting', temperature: 19, gravity: 1.05 });
  assert.equal(missing.status, 404);
  assert.equal((await authed(api.get('/api/batches/2147483000/logs'))).status, 404);

  const logs = await authed(api.get(`/api/batches/${id}/logs`));
  assert.equal(logs.status, 200);
  assert.equal(logs.body.length, 1);
  assert.equal(logs.body[0].notes, 'Krausen forming');
});

test('brewery today, tasks and vessels', { skip }, async () => {
  const today = await authed(api.get('/api/team/today'));
  assert.equal(today.status, 200, JSON.stringify(today.body));
  assert.ok(Array.isArray(today.body.batches));
  assert.equal(typeof today.body.tasks.open, 'number');
  assert.equal(typeof today.body.vessels.total, 'number');

  const batch = await authed(api.post('/api/batches')).send({ batch_number: `V-${run}` });
  assert.equal(batch.status, 201);

  const vessel = await authed(api.post('/api/team/vessels')).send({ name: `FV-${run}`, capacity_liters: 2000 });
  assert.equal(vessel.status, 201, JSON.stringify(vessel.body));
  assert.equal((await authed(api.post('/api/team/vessels')).send({ name: `FV-${run}` })).status, 409);

  const assign = () => authed(api.post(`/api/team/vessels/${vessel.body.id}/assign`)).send({ batch_id: batch.body.id });
  assert.equal((await assign()).status, 201);
  assert.equal((await assign()).status, 409);
  assert.equal((await authed(api.post(`/api/team/vessels/${vessel.body.id}/release`))).status, 200);
  assert.equal((await authed(api.post(`/api/team/vessels/${vessel.body.id}/release`))).status, 404);

  assert.equal((await authed(api.post('/api/team/tasks')).send({ title: '' })).status, 400);
  const task = await authed(api.post('/api/team/tasks')).send({ title: `Dry hop ${run}`, batch_id: batch.body.id, due_at: new Date().toISOString() });
  assert.equal(task.status, 201, JSON.stringify(task.body));
  const done = await authed(api.patch(`/api/team/tasks/${task.body.id}/status`)).send({ status: 'done' });
  assert.equal(done.status, 200);
  assert.ok(done.body.completed_at);
});

test('inventory receiving, consumption and lot traceability', { skip }, async () => {
  const batch = await authed(api.post('/api/batches')).send({ batch_number: `I-${run}` });
  assert.equal(batch.status, 201);

  const supplier = await authed(api.post('/api/inventory/suppliers')).send({ name: `Yakima Hops ${run}` });
  assert.equal(supplier.status, 201, JSON.stringify(supplier.body));

  const item = await authed(api.post('/api/inventory/items')).send({ sku: `HOP-${run}`, name: 'Citra', category: 'ingredient', unit: 'kg', reorder_point: 5 });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  assert.equal((await authed(api.post('/api/inventory/items')).send({ sku: `HOP-${run}`, name: 'Citra', category: 'ingredient', unit: 'kg' })).status, 409);

  const received = await authed(api.post('/api/inventory/receive')).send({
    item_id: item.body.id, supplier_id: supplier.body.id, lot_number: `LOT-${run}`, quantity: 20, expires_on: '2027-10-01'
  });
  assert.equal(received.status, 201, JSON.stringify(received.body));
  const lotId = received.body.lot.id;

  const consume = quantity => authed(api.post('/api/inventory/movements')).send({ type: 'consume', lot_id: lotId, batch_id: batch.body.id, quantity });
  const used = await consume(8);
  assert.equal(used.status, 201, JSON.stringify(used.body));
  assert.equal(used.body.on_hand, 12);
  // A brewer cannot draw a lot below zero.
  assert.ok((await consume(50)).status >= 400);

  const items = await authed(api.get('/api/inventory/items'));
  assert.equal(items.status, 200);
  assert.equal(items.body.find(row => row.id === item.body.id).on_hand, 12);
  assert.equal((await authed(api.get('/api/inventory/items?as_of=not-a-date'))).status, 400);

  const lots = await authed(api.get(`/api/inventory/items/${item.body.id}/lots`));
  assert.equal(lots.status, 200);
  assert.equal(lots.body[0].on_hand, 12);

  const ledger = await authed(api.get(`/api/inventory/ledger?lot_id=${lotId}`));
  assert.equal(ledger.status, 200);
  assert.equal(ledger.body.length, 2);

  const trace = await authed(api.get(`/api/inventory/lots/${lotId}/trace`));
  assert.equal(trace.status, 200, JSON.stringify(trace.body));
  assert.equal(trace.body.batches.length, 1);
  assert.equal(trace.body.batches[0].quantity_used, 8);

  const usage = await authed(api.get(`/api/inventory/batches/${batch.body.id}/usage`));
  assert.equal(usage.status, 200, JSON.stringify(usage.body));
  assert.equal(usage.body.lots.length, 1);
});

test('brew-day checklists: versions, execution, idempotent retries and history', { skip }, async () => {
  const { randomUUID } = await import('node:crypto');
  const name = `Mash SOP ${run}`;
  const steps = [
    { title: 'Check mill gap' },
    { title: 'Mash-in temperature', requires_value: true, value_unit: '°C', value_min: 64, value_max: 68 },
    { title: 'Sanitise transfer hose' }
  ];

  assert.equal((await api.get('/api/checklists/templates')).status, 401);
  const post = body => authed(api.post('/api/checklists/templates')).send(body);
  assert.equal((await post({ name, steps: [] })).status, 400);
  assert.equal((await post({ name, stage: 'drinking', steps })).status, 400);
  assert.equal((await post({ name, steps: [{ title: 'x', value_min: 1 }] })).status, 400);
  assert.equal((await post({ name, steps: [{ title: 'x', requires_value: true, value_min: 9, value_max: 1 }] })).status, 400);

  const v1 = await post({ name, stage: 'mashing', steps: steps.slice(0, 2) });
  assert.equal(v1.status, 201, JSON.stringify(v1.body));
  assert.equal(v1.body.version, 1);
  assert.equal(v1.body.steps.length, 2);

  const batch = await authed(api.post('/api/batches')).send({ batch_number: `C-${run}` });
  const start = id => authed(api.post(`/api/checklists/batches/${batch.body.id}`)).send({ template_id: id });
  const oldRun = await start(v1.body.id);
  assert.equal(oldRun.status, 201, JSON.stringify(oldRun.body));

  // Saving under the same name makes version 2 and retires version 1.
  const v2 = await post({ name: name.toUpperCase(), stage: 'mashing', steps });
  assert.equal(v2.status, 201, JSON.stringify(v2.body));
  assert.equal(v2.body.version, 2);
  const listed = await authed(api.get('/api/checklists/templates?stage=mashing'));
  assert.equal(listed.status, 200);
  const mine = listed.body.filter(t => t.name.toLowerCase() === name.toLowerCase());
  assert.deepEqual(mine.map(t => t.version), [2]);
  assert.equal((await authed(api.get('/api/checklists/templates?stage=nope'))).status, 400);

  // The run started on version 1 still shows version 1's two steps.
  let runs = await authed(api.get(`/api/checklists/batches/${batch.body.id}`));
  assert.equal(runs.body[0].version, 1);
  assert.equal(runs.body[0].total_steps, 2);
  assert.equal((await start(v1.body.id)).status, 200, 'restarting an existing run is not an error');
  assert.equal((await start(2147483000)).status, 404);

  const started = await start(v2.body.id);
  assert.equal(started.status, 201);
  assert.equal((await start(v2.body.id)).body.id, started.body.id);
  const runId = started.body.id;
  const [gap, temp, hose] = started.body.steps;
  assert.equal(started.body.remaining_steps, 3);

  const record = (stepId, body) => authed(api.post(`/api/checklists/runs/${runId}/steps/${stepId}`))
    .send({ client_event_id: randomUUID(), ...body });
  assert.equal((await record(gap.id, { status: 'finished' })).status, 400);
  assert.equal((await record(gap.id, { status: 'done', client_event_id: 'not-a-uuid' })).status, 400);
  assert.equal((await record(temp.id, { status: 'done' })).status, 400, 'a measured step needs its value');
  assert.equal((await record(temp.id, { status: 'done', measured_value: 72 })).status, 400, 'out of range needs a note');
  assert.equal((await record(hose.id, { status: 'skipped' })).status, 400, 'skipping needs a reason');
  assert.equal((await record(gap.id, { status: 'reopened', note: 'oops' })).status, 409);
  assert.equal((await record(v1.body.steps[0].id, { status: 'done' })).status, 404, 'step from another checklist');

  // The same action sent twice (a retry after a dropped connection) is stored once.
  const eventId = randomUUID();
  const first = await record(gap.id, { status: 'done', client_event_id: eventId });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const retry = await record(gap.id, { status: 'done', client_event_id: eventId });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.steps[0].history.length, 1);
  assert.equal((await record(hose.id, { status: 'done', client_event_id: eventId })).status, 409);
  assert.equal((await record(gap.id, { status: 'done' })).status, 409, 'already recorded');

  const hot = await record(temp.id, { status: 'done', measured_value: 72, note: 'Strike water overshot' });
  assert.equal(hot.status, 201, JSON.stringify(hot.body));
  assert.equal(hot.body.steps[1].latest.out_of_range, true);
  assert.equal(hot.body.exceptions, 1);

  const open = await authed(api.get('/api/checklists/open'));
  assert.equal(open.status, 200);
  const pending = open.body.find(r => r.id === runId);
  assert.equal(pending.remaining_steps, 1);
  assert.equal(pending.next_step, 'Sanitise transfer hose');

  const skipped = await record(hose.id, { status: 'skipped', note: 'Hard-piped today' });
  assert.equal(skipped.body.complete, true);
  assert.ok(!(await authed(api.get('/api/checklists/open'))).body.some(r => r.id === runId));

  // Corrections add to the history instead of replacing it.
  const reopened = await record(temp.id, { status: 'reopened', note: 'Probe was miscalibrated' });
  assert.equal(reopened.body.steps[1].state, 'pending');
  assert.equal(reopened.body.complete, false);
  const fixed = await record(temp.id, { status: 'done', measured_value: 66.5 });
  assert.equal(fixed.status, 201);
  const history = fixed.body.steps[1].history;
  assert.deepEqual(history.map(e => e.status), ['done', 'reopened', 'done']);
  assert.equal(Number(history[0].measured_value), 72);
  assert.equal(history[2].operator_name, 'Test Brewer');
  assert.equal(fixed.body.complete, true);

  // The history cannot be rewritten, even with direct database access.
  await assert.rejects(pool.query('UPDATE checklist_step_events SET note = $1 WHERE batch_checklist_id = $2', ['edited', runId]), /append-only/);
  await assert.rejects(pool.query('DELETE FROM checklist_step_events WHERE batch_checklist_id = $1', [runId]), /append-only/);

  assert.equal((await authed(api.delete(`/api/checklists/templates/${v2.body.id}`))).status, 200);
  assert.equal((await authed(api.delete(`/api/checklists/templates/${v2.body.id}`))).status, 404);
  // A retired checklist's runs are still readable.
  runs = await authed(api.get(`/api/checklists/batches/${batch.body.id}`));
  assert.equal(runs.body.length, 2);
});
