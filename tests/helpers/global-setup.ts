import 'dotenv/config';
import { runMigrations } from '../../apps/api/src/db/migrate';

/** Runs once before the whole suite: bring the test database schema up to date. */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Tests need a real PostgreSQL database. Set TEST_DATABASE_URL (or DATABASE_URL), e.g. a Neon branch or `docker compose up db`.',
    );
  }
  await runMigrations(url, () => undefined);
}
