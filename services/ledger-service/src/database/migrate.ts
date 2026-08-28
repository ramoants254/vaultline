import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Resolve .env relative to the service root (dist/database/ → ../../)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running ledger_db migrations...');

    // 1. Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const filename = '001_init_ledger.sql';
    const sqlPath = fs.existsSync(path.join(__dirname, 'migrations', filename))
      ? path.join(__dirname, 'migrations', filename)
      : path.resolve(__dirname, '../../src/database/migrations', filename);

    // 2. Check if migration has already been applied
    const existing = await client.query(
      'SELECT 1 FROM schema_migrations WHERE filename = $1',
      [filename]
    );

    if ((existing.rowCount ?? 0) > 0) {
      console.log(`[SKIP] Migration ${filename} has already been applied.`);
    } else {
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename) VALUES ($1)',
        [filename]
      );
      await client.query('COMMIT');
      console.log(`[APPLIED] Migration ${filename} executed successfully.`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();