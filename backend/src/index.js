import './config.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import recipeRoutes from './routes/recipes.js';
import batchRoutes from './routes/batches.js';
import fermentationRoutes from './routes/fermentation.js';
import teamRoutes from './routes/team.js';
import inventoryRoutes from './routes/inventory.js';
import { initializeSocket } from './services/websocket.js';
import pool from './db.js';
import initializeDatabase from './initDb.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/fermentation', fermentationRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/inventory', inventoryRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket
initializeSocket(io);

// Error handling
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✓ Database connected');
    
    // Initialize schema
    await initializeDatabase();
    
    server.listen(PORT, () => {
      console.log(`✓ Brewmaster API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('✗ Startup failed:', err.message);
    process.exit(1);
  }
}

start();

export default app;
