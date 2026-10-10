import initializeDatabase from '../src/initDb.js';
import pool from '../src/db.js';
try { await initializeDatabase(); } catch (error) { console.error(error.message); process.exitCode = 1; } finally { await pool.end(); }
