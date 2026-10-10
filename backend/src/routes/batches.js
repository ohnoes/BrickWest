import express from 'express';
import * as Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';
import {
  HttpError, badRequest, optionalDate, optionalId, optionalNumber, optionalString,
  parseId, parsePagination, requireBody, requiredNumber, requiredString, wrap
} from '../http.js';

const router = express.Router();
router.use(auth);

export const BATCH_STATUSES = ['milling', 'mashing', 'boiling', 'cooling', 'fermenting', 'packaging', 'complete', 'discarded'];

const notFound = () => new HttpError(404, 'Batch not found');

const loadBatch = async rawId => {
  const result = await Batch.getBatchById(parseId(rawId, 'batch ID'));
  if (result.rows.length === 0) throw notFound();
  return result.rows[0];
};

router.get('/', wrap(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  const { status, recipe_id } = req.query;
  const filters = {};
  if (status !== undefined) {
    if (!BATCH_STATUSES.includes(status)) throw badRequest('Invalid status');
    filters.status = status;
  }
  if (recipe_id !== undefined) filters.recipe_id = parseId(recipe_id, 'recipe ID');

  const result = await Batch.getBatches(limit, offset, filters);
  res.json(result.rows);
}));

router.get('/:id', wrap(async (req, res) => {
  res.json(await loadBatch(req.params.id));
}));

router.post('/', requireBody, wrap(async (req, res) => {
  const brewDate = optionalDate(req.body, 'brew_date');
  const data = {
    batch_number: requiredString(req.body, 'batch_number', 50),
    recipe_id: optionalId(req.body.recipe_id, 'recipe ID'),
    brew_date: brewDate ?? null,
    volume_produced: optionalNumber(req.body, 'volume_produced', { min: 0, exclusiveMin: true, max: 999999 }) ?? null,
    notes: optionalString(req.body, 'notes', 10000) ?? null
  };

  try {
    const result = await Batch.createBatch(req.user.id, data);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'Batch number already exists');
    if (err.code === '23503') throw badRequest('Recipe does not exist');
    throw err;
  }
}));

router.put('/:id/status', requireBody, wrap(async (req, res) => {
  const id = parseId(req.params.id, 'batch ID');
  const { status } = req.body;
  if (!BATCH_STATUSES.includes(status)) throw badRequest('Invalid status');

  const result = await Batch.updateBatchStatus(id, status);
  if (result.rows.length === 0) throw notFound();
  res.json(result.rows[0]);
}));

router.post('/:id/logs', requireBody, wrap(async (req, res) => {
  const reading = {
    phase: requiredString(req.body, 'phase', 50),
    // Ranges match the column precision in schema.sql and reject obvious typos.
    temperature: requiredNumber(req.body, 'temperature', { min: -50, max: 200 }),
    gravity: requiredNumber(req.body, 'gravity', { min: 0, exclusiveMin: true, max: 100 }),
    ph: optionalNumber(req.body, 'ph', { min: 0, max: 9.99 }) ?? null,
    notes: optionalString(req.body, 'notes', 10000) ?? null,
    measured_at: optionalDate(req.body, 'measured_at') ?? null
  };

  const batch = await loadBatch(req.params.id);
  const result = await Batch.logBatchPhase(batch.id, reading.phase, reading);
  res.status(201).json({ logged: true, log: result.rows[0] });
}));

router.get('/:id/logs', wrap(async (req, res) => {
  const batch = await loadBatch(req.params.id);
  const result = await Batch.getBatchLogs(batch.id);
  res.json(result.rows);
}));

export default router;
