import pool from './db.js';
import { readFileSync } from 'node:fs';

export default async function initializeDatabase(database = pool) {
  const schema = readFileSync(new URL('../scripts/schema.sql', import.meta.url), 'utf8');
  const operations = readFileSync(new URL('../scripts/operations.sql', import.meta.url), 'utf8');
  const inventory = readFileSync(new URL('../scripts/inventory.sql', import.meta.url), 'utf8');
  const checklists = readFileSync(new URL('../scripts/checklists.sql', import.meta.url), 'utf8');
  const client = await database.connect();
  try {
    await client.query('BEGIN');
    // Serialize schema initialization when multiple instances start together.
    await client.query('SELECT pg_advisory_xact_lock(7349201)');
    await client.query(schema);
    await client.query(operations);
    await client.query(inventory);
    await client.query(checklists);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
