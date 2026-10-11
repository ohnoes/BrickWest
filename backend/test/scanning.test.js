import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseCode, createLabel, resolveCode } from '../src/services/scanning.js';

test('label identifiers preserve leading zeros and reject malformed input', () => {
  assert.equal(parseCode(' 001234567890 '), '001234567890');
  for (const value of [123, null, '', ' ', 'x'.repeat(257), 'abc\nxyz']) assert.throws(() => parseCode(value));
});
test('label registration restricts table names to known targets', async () => {
  const db = { query: () => { throw new Error('Database must not be called'); } };
  await assert.rejects(createLabel(db, { kind: '__proto__', target_id: 1 }, 1), /Invalid label target/);
  await assert.rejects(createLabel(db, { kind: 'inventory_items;DROP TABLE users', target_id: 1 }, 1));
});
test('lookup reads stock and reminders without modifying inventory or tasks', async () => {
  const queries = [];
  const db = { query: async sql => {
    queries.push(sql);
    if (sql.includes('FROM scan_labels')) return { rows: [{ id: 1, item_id: 2 }] };
    if (sql.includes('FROM inventory_items')) return { rows: [{ id: 2, name: 'Malt', unit: 'kg', reorder_point: 5 }] };
    return { rows: [{ id: 3, item_name: 'Malt', lot_number: 'A', on_hand: 4, expired: true },
      { id: 4, item_name: 'Malt', lot_number: 'B', on_hand: 0, expired: true }] };
  } };
  const result = await resolveCode(db, '0012345');
  assert.equal(result.on_hand, 4);
  assert.deepEqual(result.reminders.map(r => r.type), ['expired', 'reorder']);
  assert.ok(queries.every(sql => sql.startsWith('SELECT')));
});
test('retired or missing labels do not fall back to a guessed numeric item ID', async () => {
  await assert.rejects(resolveCode({ query: async () => ({ rows: [] }) }, '0001'), /not registered or retired/);
});

const enabled = process.env.NODE_ENV === 'test';
const skip = enabled ? false : 'set NODE_ENV=test and DB_* to a disposable database';
const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let pool, api, token;
const auth = req => req.set('Authorization', `Bearer ${token}`);
before(async () => {
  if (!enabled) return;
  process.env.JWT_SECRET ||= 'scan-test-secret';
  const { default: request } = await import('supertest');
  ({ default: pool } = await import('../src/db.js'));
  const { createApp } = await import('../src/app.js');
  const { default: initializeDatabase } = await import('../src/initDb.js');
  await initializeDatabase(); await initializeDatabase();
  api = request(createApp({ auth: { registrationCode: '', rateLimitOptions: { max: 1000 } } }));
  const res = await api.post('/api/auth/register').send({ email: `scan-${stamp}@example.test`, password: 'inventory-test-password', name: 'Scanner Test' });
  assert.equal(res.status, 201);
  token = res.body.token;
});
after(async () => { if (pool) await pool.end(); });

test('scan routes require authentication and validate input', { skip }, async () => {
  for (const path of ['/labels', '/targets', '/areas', '/labels/1/qr', '/labels/1/qr-image']) {
    assert.equal((await api.get(`/api/scan${path}`)).status, 401);
  }
  assert.equal((await api.post('/api/scan/resolve').send({ code: 'x' })).status, 401);
  assert.equal((await auth(api.post('/api/scan/resolve')).send({ code: 123 })).status, 400);
  assert.equal((await auth(api.post('/api/scan/labels')).send({ kind: 'task', target_id: 1 })).status, 400);
  assert.equal((await auth(api.post('/api/scan/labels')).send({ kind: 'area', target_id: 2147483647 })).status, 404);
  assert.equal((await api.get('/scanning.js')).status, 200);
  assert.equal((await api.get('/vendor/zxing.js')).status, 200);
});
test('QR, barcode and NFC label payloads resolve shared stock records with read-only scans', { skip }, async () => {
  const itemRes = await auth(api.post('/api/inventory/items')).send({ sku: `SCAN-${stamp}`, name: 'Scan malt', category: 'ingredient', unit: 'kg', reorder_point: 10 });
  assert.equal(itemRes.status, 201); const item = itemRes.body;
  const receive = await auth(api.post('/api/inventory/receive')).send({ item_id: item.id, lot_number: `LOT-${stamp}`, quantity: 5, expires_on: '2000-01-01' });
  assert.equal(receive.status, 201); const lot = receive.body.lot;
  const areaRes = await auth(api.post('/api/scan/areas')).send({ name: `Cold room ${stamp}` });
  assert.equal(areaRes.status, 201); const area = areaRes.body;
  const labels = {};
  for (const [kind, id] of [['item', item.id], ['lot', lot.id], ['area', area.id]]) {
    const body = { kind, target_id: id, ...(kind === 'item' ? { code: `00123${stamp}` } : {}) };
    const created = await auth(api.post('/api/scan/labels')).send(body);
    assert.equal(created.status, 201, JSON.stringify(created.body)); labels[kind] = created.body;
  }
  assert.equal((await auth(api.post('/api/scan/labels')).send({ kind: 'lot', target_id: lot.id, code: labels.item.code })).status, 409);
  const before = (await pool.query('SELECT COUNT(*)::int AS count FROM inventory_ledger WHERE item_id=$1', [item.id])).rows[0].count;
  for (let i = 0; i < 3; i++) {
    const resolved = await auth(api.post('/api/scan/resolve')).send({ code: labels.item.code });
    assert.equal(resolved.status, 200); assert.equal(resolved.body.on_hand, 5);
    assert.deepEqual(resolved.body.reminders.map(r => r.type), ['expired', 'reorder']);
  }
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM inventory_ledger WHERE item_id=$1', [item.id])).rows[0].count, before);
  assert.equal((await auth(api.patch(`/api/scan/lots/${lot.id}/area`)).send({})).status, 400);
  assert.equal((await auth(api.patch(`/api/scan/lots/${lot.id}/area`)).send({ area_id: area.id })).status, 200);
  assert.equal((await auth(api.patch(`/api/scan/lots/${lot.id}/area`)).send({ area_id: area.id })).status, 200);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM lot_location_events WHERE lot_id=$1', [lot.id])).rows[0].count, 1);
  const resolvedArea = await auth(api.post('/api/scan/resolve')).send({ code: labels.area.code });
  assert.equal(resolvedArea.status, 200); assert.equal(resolvedArea.body.lots[0].on_hand, 5);
  assert.equal(resolvedArea.body.lots[0].area_name, area.name);
  const image = await auth(api.get(`/api/scan/labels/${labels.lot.id}/qr-image`));
  assert.equal(image.status, 200); assert.match(image.body.image, /^data:image\/png;base64,/);
  // Decode the printable PNG with the same barcode engine used by the browser.
  const { PNG } = await import('pngjs');
  const zxing = await import('@zxing/library');
  const png = PNG.sync.read(Buffer.from(image.body.image.split(',')[1], 'base64'));
  const luminance = new Uint8ClampedArray(png.width * png.height);
  for (let i = 0; i < luminance.length; i++) luminance[i] = (png.data[i * 4] + png.data[i * 4 + 1] * 2 + png.data[i * 4 + 2]) / 4;
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(luminance, png.width, png.height)));
  assert.equal(new zxing.MultiFormatReader().decode(bitmap).getText(), labels.lot.code);
  const svg = await auth(api.get(`/api/scan/labels/${labels.lot.id}/qr`));
  assert.equal(svg.status, 200); assert.match(svg.headers['content-type'], /image\/svg\+xml/);
  assert.equal((await auth(api.delete(`/api/scan/labels/${labels.item.id}`))).status, 200);
  assert.equal((await auth(api.post('/api/scan/resolve')).send({ code: labels.item.code })).status, 404);
  assert.equal((await auth(api.post('/api/scan/labels')).send({ kind: 'item', target_id: item.id, code: labels.item.code })).status, 409);
  // Clearing the area moves the entire lot back to unassigned, without stock entries.
  assert.equal((await auth(api.patch(`/api/scan/lots/${lot.id}/area`)).send({ area_id: null })).status, 200);
  assert.equal((await auth(api.post('/api/scan/resolve')).send({ code: labels.area.code })).body.lots.length, 0);
});
test('tank labels show current contents and become empty after batch release', { skip }, async () => {
  const vesselRes = await auth(api.post('/api/team/vessels')).send({ name: `Scan tank ${stamp}`, capacity_liters: 100 });
  assert.equal(vesselRes.status, 201); const vessel = vesselRes.body;
  const batchRes = await auth(api.post('/api/batches')).send({ batch_number: `SCAN-${stamp}`, volume_produced: 80 });
  assert.equal(batchRes.status, 201); const batch = batchRes.body;
  assert.equal((await auth(api.post(`/api/team/vessels/${vessel.id}/assign`)).send({ batch_id: batch.id })).status, 201);
  const label = (await auth(api.post('/api/scan/labels')).send({ kind: 'vessel', target_id: vessel.id })).body;
  const resolve = () => auth(api.post('/api/scan/resolve')).send({ code: label.code });
  assert.equal((await resolve()).body.batch.id, batch.id);
  assert.equal((await auth(api.post(`/api/team/vessels/${vessel.id}/release`))).status, 200);
  assert.equal((await resolve()).body.batch, null);
});
