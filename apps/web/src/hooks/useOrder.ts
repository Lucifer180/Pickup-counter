import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Order, type OrderStatus } from '../api/client';

const TERMINAL: OrderStatus[] = ['paid', 'expired', 'needs_review', 'picked_up'];

export interface OrderSnapshot {
  order: Order;
  /**
   * performance.now() taken when the request was *sent*. Pairing it with the
   * server's expiresInSeconds gives a deadline on the browser's monotonic clock,
   * which ignores the wall clock entirely (the counter's clock may be minutes off).
   * Using the send time (not receive time) errs on the side of showing less time.
   */
  sentAt: number;
}

/** Polls GET /orders/:id until the order reaches a final state. */
export function useOrder(orderId: string, initial?: OrderSnapshot, pollMs = 2000) {
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  const fetchOnce = useCallback(async () => {
    const sentAt = performance.now();
    try {
      const order = await api.getOrder(orderId);
      setSnapshot({ order, sentAt });
      setError(null);
      if (TERMINAL.includes(order.status)) stopped.current = true;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [orderId]);

  useEffect(() => {
    stopped.current = false;
    void fetchOnce();
    const t = setInterval(() => {
      if (!stopped.current) void fetchOnce();
    }, pollMs);
    return () => clearInterval(t);
  }, [fetchOnce, pollMs]);

  return { snapshot, error, refresh: fetchOnce, setSnapshot };
}
