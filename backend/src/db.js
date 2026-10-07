import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

let pool;

if (process.env.DATABASE_URL) {
  // Railway provides DATABASE_URL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  // Local development
  pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'brickwest_brewmaster'
  });
}

export const query = (text, params) => pool.query(text, params);
export const getClient = () => pool.connect();

export default pool;
