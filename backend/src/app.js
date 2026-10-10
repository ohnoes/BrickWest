import './config.js';
import express from 'express';
import cors from 'cors';
import { createAuthRouter } from './routes/auth.js';
import recipeRoutes from './routes/recipes.js';
import batchRoutes from './routes/batches.js';
import teamRoutes from './routes/team.js';
import inventoryRoutes from './routes/inventory.js';
import { errorHandler, notFoundHandler } from './http.js';

// Builds the Express app without opening a port or touching the database, so
// tests can exercise it directly. `options.auth` is passed to createAuthRouter.
export function createApp(options = {}) {
  const app = express();

  app.disable('x-powered-by');
  // Railway (and most hosts) put one reverse proxy in front of the API. Trust
  // it so req.ip is the real client address for rate limiting.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
  app.use(express.json({ limit: '256kb' }));

  const health = (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  };
  app.get('/health', health);
  app.get('/api/health', health);

  app.use('/api/auth', createAuthRouter(options.auth));
  app.use('/api/recipes', recipeRoutes);
  app.use('/api/batches', batchRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/inventory', inventoryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
