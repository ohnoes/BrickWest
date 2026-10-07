import pool from './db.js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    
    const schemaPath = join(__dirname, '../scripts/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Split by semicolon and filter empty statements
    const statements = schema
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      try {
        await pool.query(statement);
        console.log('✓ Executed:', statement.substring(0, 50) + '...');
      } catch (err) {
        // Ignore "already exists" errors
        if (!err.message.includes('already exists')) {
          throw err;
        }
        console.log('→ Table already exists:', statement.substring(0, 50) + '...');
      }
    }
    
    console.log('✓ Database schema initialized');
    return true;
  } catch (err) {
    console.error('✗ Database initialization failed:', err.message);
    return false;
  }
}

export default initializeDatabase;
