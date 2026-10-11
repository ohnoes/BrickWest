import './config.js';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './routes/auth.js';
import recipeRoutes from './routes/recipes.js';
import batchRoutes from './routes/batches.js';
import teamRoutes from './routes/team.js';
import inventoryRoutes from './routes/inventory.js';
import checklistRoutes from './routes/checklists.js';
import scanRoutes from './routes/scanning.js';
import { errorHandler, notFoundHandler } from './http.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url));

// The web app loads only its own scripts and styles (plus Google Fonts), so
// injected markup cannot run script or send data elsewhere.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

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

  // The browser app in backend/public, served from the same origin as the API.
  app.use(express.static(PUBLIC_DIR, {
    setHeaders: res => {
      res.set('Cache-Control', 'no-cache');
      res.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
      res.set('Referrer-Policy', 'no-referrer');
    }
  }));
  app.get('/vendor/zxing.js', (_req, res) => res.sendFile(fileURLToPath(new URL('../node_modules/@zxing/browser/umd/zxing-browser.min.js', import.meta.url))));

  app.use('/api/auth', createAuthRouter(options.auth));
  app.use('/api/recipes', recipeRoutes);
  app.use('/api/batches', batchRoutes);
  app.use('/api/team', teamRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/checklists', checklistRoutes);
  app.use('/api/scan', scanRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
