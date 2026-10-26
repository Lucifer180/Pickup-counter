import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Order, type OrderStatus } from '../api/client';

const TERMINAL: OrderStatus[] = ['paid', 'expired', 'needs_review', 'picked_up'];

export interface OrderSnapshot {
  order: Order;
  
  sentAt: number;
}

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
