import { pool, type Queryable } from '../db/pool';
import { expireOverdue } from '../modules/orders/order.repository';

const BATCH = 500;

/**
 * Flips overdue pending orders to 'expired'.
 *
 * This job is NOT what releases stock: holds are derived from expires_at, so
 * units become available the moment a hold runs out even if this job is down.
 * The job only keeps the stored status tidy for reporting. SKIP LOCKED lets
 * several API instances run it at once, and lets it step around orders a
 * webhook is processing at that moment.
 */
export async function expireOrders(db: Queryable = pool): Promise<number> {
  let total = 0;
  for (;;) {
    const n = await expireOverdue(db, BATCH);
    total += n;
    if (n < BATCH) return total;
  }
}

export function startExpireOrdersJob(intervalMs: number): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await expireOrders();
      // eslint-disable-next-line no-console
      if (n > 0) console.log(`[expire-orders] marked ${n} order(s) expired`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[expire-orders] failed', (err as Error).message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
