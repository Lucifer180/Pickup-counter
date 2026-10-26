import pg from 'pg';
import { env } from '../config/env';

pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {

  console.error('[db] idle client error', err.message);
});

export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
