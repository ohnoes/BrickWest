import express from 'express';
import pool from '../db.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
const isId = value => /^[1-9]\d*$/.test(String(value));
const bad = (res, message) => res.status(400).json({ error: message });

router.get('/today', async (_req, res, next) => {
  try {
    const [batches, tasks, vessels] = await Promise.all([
      pool.query("SELECT status, COUNT(*)::int AS count FROM batches WHERE deleted_at IS NULL AND status NOT IN ('complete','discarded') GROUP BY status"),
      pool.query("SELECT COUNT(*)::int AS open, COUNT(*) FILTER (WHERE due_at < now())::int AS overdue, COUNT(*) FILTER (WHERE due_at::date = CURRENT_DATE)::int AS due_today FROM brewery_tasks WHERE status IN ('open','in_progress')"),
      pool.query("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE a.id IS NOT NULL)::int AS occupied FROM vessels v LEFT JOIN vessel_assignments a ON a.vessel_id=v.id AND a.released_at IS NULL WHERE v.active")
    ]);
    res.json({ batches: batches.rows, tasks: tasks.rows[0], vessels: vessels.rows[0] });
  } catch (err) { next(err); }
});

router.get('/tasks', async (_req, res, next) => {
  try {
    res.json((await pool.query("SELECT * FROM brewery_tasks ORDER BY due_at ASC NULLS LAST, id DESC LIMIT 200")).rows);
  } catch (err) { next(err); }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const { title, description, batch_id, vessel_id, assigned_to, due_at } = req.body;
    if (typeof title !== 'string' || !title.trim() || title.length > 200) return bad(res, 'Invalid task title');
    if ([batch_id, vessel_id, assigned_to].some(v => v != null && !isId(v))) return bad(res, 'Invalid reference ID');
    if (due_at != null && (typeof due_at !== 'string' || !Number.isFinite(Date.parse(due_at)))) return bad(res, 'Invalid due date');
    const result = await pool.query(
      'INSERT INTO brewery_tasks(title,description,batch_id,vessel_id,assigned_to,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title.trim(), description ?? null, batch_id ?? null, vessel_id ?? null, assigned_to ?? null, due_at ?? null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.patch('/tasks/:id/status', async (req, res, next) => {
  try {
    if (!isId(req.params.id) || !['open','in_progress','done','cancelled'].includes(req.body.status)) return bad(res, 'Invalid task or status');
    const result = await pool.query(
      "UPDATE brewery_tasks SET status=$1, completed_at=CASE WHEN $1='done' THEN now() ELSE NULL END, completed_by=CASE WHEN $1='done' THEN $2 ELSE NULL END WHERE id=$3 RETURNING *",
      [req.body.status, req.user.id, req.params.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get('/vessels', async (_req, res, next) => {
  try {
    res.json((await pool.query(
      'SELECT v.*, a.id AS assignment_id, a.batch_id, b.batch_number FROM vessels v LEFT JOIN vessel_assignments a ON a.vessel_id=v.id AND a.released_at IS NULL LEFT JOIN batches b ON b.id=a.batch_id WHERE v.active ORDER BY v.name'
    )).rows);
  } catch (err) { next(err); }
});

router.post('/vessels', async (req, res, next) => {
  try {
    const { name, capacity_liters } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 100) return bad(res, 'Invalid vessel name');
    if (capacity_liters != null && (!Number.isFinite(Number(capacity_liters)) || Number(capacity_liters) <= 0)) return bad(res, 'Invalid capacity');
    res.status(201).json((await pool.query('INSERT INTO vessels(name,capacity_liters) VALUES($1,$2) RETURNING *', [name.trim(), capacity_liters ?? null])).rows[0]);
  } catch (err) { next(err); }
});

router.post('/vessels/:id/assign', async (req, res, next) => {
  if (!isId(req.params.id) || !isId(req.body.batch_id)) return bad(res, 'Invalid vessel or batch ID');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const vessel = await client.query('SELECT id FROM vessels WHERE id=$1 AND active FOR UPDATE', [req.params.id]);
    const batch = await client.query("SELECT id FROM batches WHERE id=$1 AND deleted_at IS NULL AND status NOT IN ('complete','discarded')", [req.body.batch_id]);
    if (!vessel.rowCount || !batch.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Vessel or active batch not found' }); }
    const occupied = await client.query('SELECT id FROM vessel_assignments WHERE vessel_id=$1 AND released_at IS NULL', [req.params.id]);
    if (occupied.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Vessel already occupied' }); }
    const result = await client.query('INSERT INTO vessel_assignments(vessel_id,batch_id,assigned_by) VALUES($1,$2,$3) RETURNING *', [req.params.id, req.body.batch_id, req.user.id]);
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

router.post('/vessels/:id/release', async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, 'Invalid vessel ID');
    const result = await pool.query('UPDATE vessel_assignments SET released_at=now() WHERE vessel_id=$1 AND released_at IS NULL RETURNING *', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'No active assignment' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get('/shifts', (_req, res) => res.json([]));
export default router;
