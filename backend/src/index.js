import './config.js';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { initializeSocket } from './services/websocket.js';
import pool from './db.js';
import initializeDatabase from './initDb.js';

const app = createApp();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

initializeSocket(io);

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await pool.query('SELECT NOW()');
    console.log('✓ Database connected');

    await initializeDatabase();

    if (!process.env.REGISTRATION_CODE) {
      console.warn('! REGISTRATION_CODE is not set: anyone who can reach this API can create an account');
    }

    server.listen(PORT, () => {
      console.log(`✓ Brewmaster API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('✗ Startup failed:', err.message);
    process.exit(1);
  }
}

// Railway sends SIGTERM when it replaces a deployment. Finish in-flight
// requests and release database connections before exiting.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 10000).unref();
  io.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
