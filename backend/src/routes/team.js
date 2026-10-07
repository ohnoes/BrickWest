import express from 'express';

const router = express.Router();

// Placeholder routes - implement based on team needs
router.get('/tasks', (req, res) => {
  res.json([]);
});

router.post('/tasks', (req, res) => {
  res.status(201).json({ created: true });
});

router.get('/shifts', (req, res) => {
  res.json([]);
});

export default router;
