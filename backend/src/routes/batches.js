import express from 'express';
import * as Batch from '../models/Batch.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', auth, async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, status, recipe_id } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (recipe_id) filters.recipe_id = recipe_id;
    
    const result = await Batch.getBatches(limit, offset, filters);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', auth, async (req, res, next) => {
  try {
    const result = await Batch.getBatchById(req.params.id);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', auth, async (req, res, next) => {
  try {
    const result = await Batch.createBatch(req.user.id, req.body);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/status', auth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ['milling', 'mashing', 'boiling', 'cooling', 'fermenting', 'packaging', 'complete', 'discarded'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await Batch.updateBatchStatus(req.params.id, status);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/logs', auth, async (req, res, next) => {
  try {
    const { phase, temperature, gravity, ph, notes, measured_at } = req.body;
    
    if (!phase || typeof temperature !== 'number' || typeof gravity !== 'number') {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await Batch.logBatchPhase(req.params.id, phase, {
      temperature,
      gravity,
      ph,
      notes,
      measured_at
    });

    res.status(201).json({ logged: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/logs', auth, async (req, res, next) => {
  try {
    const result = await Batch.getBatchLogs(req.params.id);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
