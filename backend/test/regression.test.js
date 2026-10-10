import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

process.env.JWT_SECRET = 'test-secret-that-is-never-used-in-production';
const { default: initializeDatabase } = await import('../src/initDb.js');
const { initializeSocket } = await import('../src/services/websocket.js');
const { default: jwt } = await import('jsonwebtoken');

test('missing and placeholder JWT secrets fail immediately', () => {
  for (const secret of ['', 'your-secret-key-change-in-production']) {
    const result = spawnSync(process.execPath, ['src/config.js'], { env: { ...process.env, JWT_SECRET: secret } });
    assert.notEqual(result.status, 0);
  }
});

test('public registration cannot choose an administrator role', async () => {
  const { default: express } = await import('express');
  const { default: request } = await import('supertest');
  const { default: pool } = await import('../src/db.js');
  const { default: router } = await import('../src/routes/auth.js');
  const original = pool.query;
  pool.query = async (_sql, params) => ({ rows: [{ id: 9, email: params[0], name: params[2], role: params[3] }] });
  const app = express();
  app.use(express.json());
  app.use('/auth', router);
  try {
    const result = await request(app).post('/auth/register').send({ email: 'test@example.com', password: 'test-password', name: 'Test', role: 'admin' });
    assert.equal(result.status, 201);
    assert.equal(result.body.user.role, 'brewer');
    assert.equal(jwt.verify(result.body.token, process.env.JWT_SECRET).role, 'brewer');
  } finally { pool.query = original; }
});

test('database schema is available and initialization commits', async () => {
  const queries = [];
  let released = false;
  await initializeDatabase({ connect: async () => ({
    query: async sql => queries.push(sql), release: () => { released = true; }
  }) });
  assert.equal(queries[0], 'BEGIN');
  assert.match(queries[2], /CREATE TABLE IF NOT EXISTS users/);
  assert.equal(queries.at(-1), 'COMMIT');
  assert.equal(released, true);
});

test('schema errors roll back, release the client, and reject startup', async () => {
  const queries = [];
  let released = false;
  await assert.rejects(initializeDatabase({ connect: async () => ({
    query: async sql => { queries.push(sql); if (sql.includes('CREATE TABLE')) throw new Error('schema failure'); },
    release: () => { released = true; }
  }) }), /schema failure/);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(released, true);
});

test('sockets reject invalid tokens and prevent access to another brewer batch', async () => {
  let middleware, connect;
  const broadcasts = [];
  const io = { use: fn => { middleware = fn; }, on: (_event, fn) => { connect = fn; },
    to: room => ({ emit: (event, data) => broadcasts.push({ room, event, data }) }) };
  initializeSocket(io, async () => ({ rows: [{ brewer_id: 7 }] }));
  let failure;
  middleware({ handshake: { auth: {} } }, error => { failure = error; });
  assert.match(failure.message, /Unauthorized/);
  const handlers = {}, rooms = [];
  const socket = { id: 'test', handshake: { auth: { token: jwt.sign({ id: 8, role: 'brewer' }, process.env.JWT_SECRET) } },
    on: (event, fn) => { handlers[event] = fn; }, join: async room => rooms.push(room) };
  middleware(socket, error => assert.equal(error, undefined));
  connect(socket);
  let reply;
  await handlers.join_batch(1, result => { reply = result; });
  assert.equal(reply.error, 'Forbidden');
  assert.equal(rooms.length, 0);
  await handlers.fermentation_update({ batchId: 1, temperature: 20, gravity: 1.01 }, result => { reply = result; });
  assert.equal(broadcasts.length, 0);
  socket.user.id = 7;
  await handlers.join_batch(1);
  assert.deepEqual(rooms, ['batch_1']);
  await handlers.fermentation_update({ batchId: 1, temperature: 20, gravity: 1.01, timestamp: 'spoofed' });
  assert.equal(broadcasts.length, 1);
  assert.notEqual(broadcasts[0].data.timestamp, 'spoofed');
  await handlers.fermentation_update({ batchId: 1, temperature: 'bad', gravity: 1.01 });
  assert.equal(broadcasts.length, 1);
});
