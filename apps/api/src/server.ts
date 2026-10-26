import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { startExpireOrdersJob } from './jobs/expire-orders.job';

const app = createApp();
const server = app.listen(env.PORT, () => {

  console.log(`[api] listening on http://localhost:${env.PORT} (hold ${env.HOLD_SECONDS}s)`);
});

const stopJob = env.ENABLE_EXPIRE_JOB ? startExpireOrdersJob(env.EXPIRE_JOB_INTERVAL_MS) : () => undefined;

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[api] ${signal} received, shutting down`);
  stopJob();
  server.close(async () => {
    await pool.end().catch(() => undefined);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
