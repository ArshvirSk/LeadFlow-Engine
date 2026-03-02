import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://leadflow:leadflow@localhost:5432/leadflow',
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
