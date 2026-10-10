import express from 'express';
import pool from '../db.js';
import { auth } from '../middleware/auth.js';
import { BATCH_STATUSES } from './batches.js';
import {
  HttpError, badRequest, optionalNumber, optionalString, parseId, requireBody, requiredString, wrap
} from '../http.js';

const router = express.Router();
router.use(auth);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STEP_STATUSES = ['done', 'skipped', 'exception', 'reopened'];
const MAX_STEPS = 100;

// Run `work` inside a transaction on one connection.
const transaction = async work => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const readSteps = raw => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_STEPS) {
    throw badRequest(`A checklist needs between 1 and ${MAX_STEPS} steps`);
  }
  return raw.map((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw badRequest(`Step ${index + 1} is invalid`);
    const requiresValue = step.requires_value === true;
    const min = optionalNumber(step, 'value_min') ?? null;
    const max = optionalNumber(step, 'value_max') ?? null;
    if (min != null && max != null && min > max) throw badRequest(`Step ${index + 1}: minimum is above maximum`);
    if (!requiresValue && (min != null || max != null)) throw badRequest(`Step ${index + 1}: a range needs requires_value`);
    return {
      title: requiredString(step, 'title', 300),
      requires_value: requiresValue,
      value_unit: optionalString(step, 'value_unit', 20) ?? null,
      value_min: min,
      value_max: max
    };
  });
};

const withSteps = async (db, templates) => {
  if (templates.length === 0) return [];
  const { rows } = await db.query(
    'SELECT * FROM checklist_template_steps WHERE template_id = ANY($1::int[]) ORDER BY template_id, position',
    [templates.map(t => t.id)]
  );
  return templates.map(t => ({ ...t, steps: rows.filter(step => step.template_id === t.id) }));
};

// ---- Templates -------------------------------------------------------------
router.get('/templates', wrap(async (req, res) => {
  const { stage } = req.query;
  if (stage !== undefined && !BATCH_STATUSES.includes(stage)) throw badRequest('Invalid stage');
  const { rows } = await pool.query(
    `SELECT t.*, u.name AS created_by_name
       FROM checklist_templates t JOIN users u ON u.id = t.created_by
      WHERE t.active AND ($1::text IS NULL OR t.stage = $1::text)
      ORDER BY t.name`,
    [stage ?? null]
  );
  res.json(await withSteps(pool, rows));
}));

// Saving a checklist under an existing name creates its next version.
router.post('/templates', requireBody, wrap(async (req, res) => {
  const name = requiredString(req.body, 'name', 200);
  const stage = req.body.stage == null || req.body.stage === '' ? null : req.body.stage;
  if (stage !== null && !BATCH_STATUSES.includes(stage)) throw badRequest('Invalid stage');
  const steps = readSteps(req.body.steps);

  const template = await transaction(async db => {
    // Serialise saves of the same name so two people cannot both claim a version.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [`checklist:${name.toLowerCase()}`]);
    const previous = await db.query(
      'SELECT COALESCE(MAX(version), 0) AS version FROM checklist_templates WHERE lower(name) = lower($1::text)', [name]);
    await db.query('UPDATE checklist_templates SET active = FALSE WHERE lower(name) = lower($1::text) AND active', [name]);
    const created = (await db.query(
      `INSERT INTO checklist_templates (name, stage, version, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, stage, Number(previous.rows[0].version) + 1, req.user.id]
    )).rows[0];
    for (const [index, step] of steps.entries()) {
      await db.query(
        `INSERT INTO checklist_template_steps (template_id, position, title, requires_value, value_unit, value_min, value_max)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [created.id, index + 1, step.title, step.requires_value, step.value_unit, step.value_min, step.value_max]
      );
    }
    return (await withSteps(db, [created]))[0];
  });
  res.status(201).json(template);
}));

// Retiring hides a checklist from "start" lists; runs already started keep working.
router.delete('/templates/:id', wrap(async (req, res) => {
  const result = await pool.query(
    'UPDATE checklist_templates SET active = FALSE WHERE id = $1 AND active RETURNING id', [parseId(req.params.id, 'checklist ID')]);
  if (result.rowCount === 0) throw new HttpError(404, 'Checklist not found');
  res.json({ retired: true });
}));

// ---- Runs ------------------------------------------------------------------
const isFinished = status => ['done', 'skipped', 'exception'].includes(status);

// Shape runs with their steps, each step's current state and its full history.
const loadRuns = async (db, where, params) => {
  const runs = (await db.query(
    `SELECT r.id, r.batch_id, r.template_id, r.started_at, b.batch_number, b.status AS batch_status,
            t.name, t.version, t.stage, u.name AS started_by_name
       FROM batch_checklists r
       JOIN batches b ON b.id = r.batch_id
       JOIN checklist_templates t ON t.id = r.template_id
       JOIN users u ON u.id = r.started_by
      WHERE ${where}
      ORDER BY r.started_at, r.id`, params)).rows;
  if (runs.length === 0) return [];

  const [steps, events] = await Promise.all([
    db.query('SELECT * FROM checklist_template_steps WHERE template_id = ANY($1::int[]) ORDER BY position',
      [runs.map(r => r.template_id)]),
    db.query(
      `SELECT e.id, e.batch_checklist_id, e.step_id, e.status, e.measured_value, e.out_of_range, e.note,
              e.performed_at, e.recorded_at, u.name AS operator_name
         FROM checklist_step_events e JOIN users u ON u.id = e.operator_id
        WHERE e.batch_checklist_id = ANY($1::int[])
        ORDER BY e.id`, [runs.map(r => r.id)])
  ]);

  return runs.map(run => {
    const runSteps = steps.rows.filter(step => step.template_id === run.template_id).map(step => {
      const history = events.rows.filter(e => e.batch_checklist_id === run.id && e.step_id === step.id);
      const latest = history[history.length - 1];
      return { ...step, state: latest && latest.status !== 'reopened' ? latest.status : 'pending', latest: latest ?? null, history };
    });
    const remaining = runSteps.filter(step => !isFinished(step.state)).length;
    return {
      ...run,
      steps: runSteps,
      total_steps: runSteps.length,
      remaining_steps: remaining,
      exceptions: runSteps.filter(step => step.state === 'exception' || step.latest?.out_of_range).length,
      complete: remaining === 0
    };
  });
};

// Every checklist that still has steps to do, for the Today screen.
router.get('/open', wrap(async (_req, res) => {
  const runs = await loadRuns(pool, "b.deleted_at IS NULL AND b.status NOT IN ('complete','discarded')", []);
  res.json(runs.filter(run => !run.complete).map(({ steps, ...run }) => ({
    ...run,
    next_step: steps.find(step => !isFinished(step.state))?.title ?? null
  })));
}));

router.get('/batches/:batchId', wrap(async (req, res) => {
  res.json(await loadRuns(pool, 'r.batch_id = $1', [parseId(req.params.batchId, 'batch ID')]));
}));

// Starting the same checklist twice returns the run that already exists.
router.post('/batches/:batchId', requireBody, wrap(async (req, res) => {
  const batchId = parseId(req.params.batchId, 'batch ID');
  const templateId = parseId(req.body.template_id, 'checklist ID');

  const batch = await pool.query('SELECT id FROM batches WHERE id = $1 AND deleted_at IS NULL', [batchId]);
  if (batch.rowCount === 0) throw new HttpError(404, 'Batch not found');
  const existing = await pool.query('SELECT id FROM batch_checklists WHERE batch_id = $1 AND template_id = $2', [batchId, templateId]);
  if (existing.rowCount === 0) {
    const template = await pool.query('SELECT id FROM checklist_templates WHERE id = $1 AND active', [templateId]);
    if (template.rowCount === 0) throw new HttpError(404, 'Checklist not found');
    await pool.query(
      `INSERT INTO batch_checklists (batch_id, template_id, started_by) VALUES ($1, $2, $3)
       ON CONFLICT (batch_id, template_id) DO NOTHING`, [batchId, templateId, req.user.id]);
  }
  const [run] = await loadRuns(pool, 'r.batch_id = $1 AND r.template_id = $2', [batchId, templateId]);
  res.status(existing.rowCount === 0 ? 201 : 200).json(run);
}));

// Record what happened to one step. Nothing is overwritten: each call adds an
// event, and resending the same client_event_id is a no-op.
router.post('/runs/:runId/steps/:stepId', requireBody, wrap(async (req, res) => {
  const runId = parseId(req.params.runId, 'checklist run ID');
  const stepId = parseId(req.params.stepId, 'step ID');
  const { status, client_event_id: clientEventId } = req.body;
  if (!STEP_STATUSES.includes(status)) throw badRequest('Invalid status');
  if (typeof clientEventId !== 'string' || !UUID_PATTERN.test(clientEventId)) throw badRequest('Invalid client_event_id');
  const note = optionalString(req.body, 'note', 2000)?.trim() || null;
  const measured = optionalNumber(req.body, 'measured_value', { min: -99999999, max: 99999999 }) ?? null;
  const performedAt = req.body.performed_at;
  if (performedAt != null && (typeof performedAt !== 'string' || !Number.isFinite(Date.parse(performedAt)))) {
    throw badRequest('Invalid performed_at');
  }
  // A device that was offline reports when the step was really done, but never in the future.
  const performed = performedAt && Date.parse(performedAt) <= Date.now() + 60000 ? performedAt : null;

  const outcome = await transaction(async db => {
    const run = await db.query('SELECT id, template_id FROM batch_checklists WHERE id = $1 FOR UPDATE', [runId]);
    if (run.rowCount === 0) throw new HttpError(404, 'Checklist run not found');

    const duplicate = await db.query(
      'SELECT batch_checklist_id, step_id FROM checklist_step_events WHERE client_event_id = $1', [clientEventId]);
    if (duplicate.rowCount > 0) {
      const same = duplicate.rows[0].batch_checklist_id === runId && duplicate.rows[0].step_id === stepId;
      if (!same) throw new HttpError(409, 'client_event_id was already used for a different step');
      return { created: false };
    }

    const step = (await db.query(
      'SELECT * FROM checklist_template_steps WHERE id = $1 AND template_id = $2', [stepId, run.rows[0].template_id])).rows[0];
    if (!step) throw new HttpError(404, 'Step not found on this checklist');

    const latest = (await db.query(
      'SELECT status FROM checklist_step_events WHERE batch_checklist_id = $1 AND step_id = $2 ORDER BY id DESC LIMIT 1',
      [runId, stepId])).rows[0];
    const finished = latest && isFinished(latest.status);
    if (status === 'reopened' && !finished) throw new HttpError(409, 'This step has not been completed yet');
    if (status !== 'reopened' && finished) throw new HttpError(409, 'This step is already recorded. Reopen it to change it.');

    if (status !== 'done' && !note) throw badRequest('Give a reason');
    let outOfRange = false;
    if (status === 'done') {
      if (step.requires_value && measured == null) throw badRequest('Enter the measured value');
      if (measured != null) {
        outOfRange = (step.value_min != null && measured < Number(step.value_min))
          || (step.value_max != null && measured > Number(step.value_max));
      }
      if (outOfRange && !note) throw badRequest('That value is outside the expected range. Add a note explaining it.');
    }

    await db.query(
      `INSERT INTO checklist_step_events
         (batch_checklist_id, step_id, status, measured_value, out_of_range, note, operator_id, client_event_id, performed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
      [runId, stepId, status, status === 'reopened' ? null : measured, outOfRange, note, req.user.id, clientEventId, performed]
    );
    return { created: true };
  });

  const [run] = await loadRuns(pool, 'r.id = $1', [runId]);
  res.status(outcome.created ? 201 : 200).json(run);
}));

export default router;
