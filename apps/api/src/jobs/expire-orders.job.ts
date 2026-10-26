import { pool, type Queryable } from '../db/pool';
import { expireOverdue } from '../modules/orders/order.repository';

const BATCH = 500;

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

      if (n > 0) console.log(`[expire-orders] marked ${n} order(s) expired`);
    } catch (err) {

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
