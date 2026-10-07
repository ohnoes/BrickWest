import express from 'express';

const router = express.Router();

// Placeholder routes - implement fermentation-specific tracking
router.get('/:batchId', (req, res) => {
  res.json([]);
});

router.post('/:batchId/readings', (req, res) => {
  res.status(201).json({ logged: true });
});

export default router;
