import type { Queryable } from '../../db/pool';

export type OrderStatus = 'pending' | 'paid' | 'expired' | 'needs_review' | 'picked_up';

export interface OrderViewRow {
  id: string;
  status: OrderStatus;
  total_paise: number;
  expires_at: Date;
  expires_in_seconds: number;
  paid_at: Date | null;
  picked_up_at: Date | null;
  review_reason: string | null;
  created_at: Date;
}

export interface OrderItemRow {
  product_id: string;
  name: string;
  quantity: number;
  unit_price_paise: number;
}

export interface LockedOrderRow {
  id: string;
  status: OrderStatus;
  total_paise: number;
  expires_at: Date;
}

export async function insertOrder(db: Queryable, totalPaise: number, holdSeconds: number): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO orders (total_paise, expires_at)
     VALUES ($1, clock_timestamp() + make_interval(secs => $2))
     RETURNING id`,
    [totalPaise, holdSeconds],
  );
  return rows[0]!.id;
}

export async function insertItems(
  db: Queryable,
  orderId: string,
  items: { productId: string; quantity: number; unitPricePaise: number }[],
): Promise<void> {
  await db.query(
    `INSERT INTO order_items (order_id, product_id, quantity, unit_price_paise)
     SELECT $1, * FROM unnest($2::uuid[], $3::int[], $4::int[])`,
    [orderId, items.map((i) => i.productId), items.map((i) => i.quantity), items.map((i) => i.unitPricePaise)],
  );
}

export async function findOrderView(db: Queryable, id: string): Promise<OrderViewRow | null> {
  const { rows } = await db.query<OrderViewRow>(
    `SELECT o.id,
            CASE WHEN o.status = 'pending' AND o.expires_at <= clock_timestamp()
                 THEN 'expired' ELSE o.status::text END AS status,
            o.total_paise, o.expires_at, o.paid_at, o.picked_up_at, o.review_reason, o.created_at,
            CASE WHEN o.status = 'pending'
                 THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (o.expires_at - clock_timestamp()))))::int
                 ELSE 0 END AS expires_in_seconds
     FROM orders o
     WHERE o.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function findItems(db: Queryable, orderId: string): Promise<OrderItemRow[]> {
  const { rows } = await db.query<OrderItemRow>(
    `SELECT oi.product_id, p.name, oi.quantity, oi.unit_price_paise
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY p.name`,
    [orderId],
  );
  return rows;
}

export async function lockOrder(db: Queryable, id: string): Promise<LockedOrderRow | null> {
  const { rows } = await db.query<LockedOrderRow>(
    'SELECT id, status, total_paise, expires_at FROM orders WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] ?? null;
}

export async function isHoldActive(db: Queryable, id: string): Promise<boolean> {
  const { rows } = await db.query<{ active: boolean }>(
    'SELECT expires_at > clock_timestamp() AS active FROM orders WHERE id = $1',
    [id],
  );
  return rows[0]?.active ?? false;
}

export async function markPaid(db: Queryable, id: string, amountPaise: number, eventId: string): Promise<void> {
  await db.query(
    `UPDATE orders
     SET status = 'paid', paid_at = clock_timestamp(), paid_amount_paise = $2, payment_event_id = $3
     WHERE id = $1`,
    [id, amountPaise, eventId],
  );
}

export async function markNeedsReview(
  db: Queryable,
  id: string,
  reason: string,
  amountPaise: number,
  eventId: string,
): Promise<void> {
  await db.query(
    `UPDATE orders
     SET status = 'needs_review', review_reason = $2, paid_amount_paise = $3, payment_event_id = $4
     WHERE id = $1`,
    [id, reason, amountPaise, eventId],
  );
}

export async function claimPickup(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE orders SET status = 'picked_up', picked_up_at = clock_timestamp()
     WHERE id = $1 AND status = 'paid'`,
    [id],
  );
  return rowCount === 1;
}

export async function expireOverdue(db: Queryable, limit: number): Promise<number> {
  const { rowCount } = await db.query(
    `UPDATE orders SET status = 'expired'
     WHERE id IN (
       SELECT id FROM orders
       WHERE status = 'pending' AND expires_at <= clock_timestamp()
       ORDER BY expires_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )`,
    [limit],
  );
  return rowCount ?? 0;
}
