import { pool } from '../../apps/api/src/db/pool';

export { pool };

export async function resetDb(): Promise<void> {
  await pool.query('TRUNCATE payment_events, order_items, orders, products RESTART IDENTITY CASCADE');
}

export async function createProduct(opts: { name?: string; pricePaise?: number; stock: number }): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO products (name, price_paise, stock) VALUES ($1, $2, $3) RETURNING id',
    [opts.name ?? `Test snack ${Math.random().toString(36).slice(2, 8)}`, opts.pricePaise ?? 2500, opts.stock],
  );
  return rows[0]!.id;
}

export async function productState(id: string): Promise<{ stock: number; available: number }> {
  const { rows } = await pool.query<{ stock: number; available: number }>(
    `SELECT p.stock,
            p.stock - COALESCE((
              SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id
                AND ((o.status = 'pending' AND o.expires_at > clock_timestamp()) OR o.status = 'paid')
            ), 0)::int AS available
     FROM products p WHERE p.id = $1`,
    [id],
  );
  return rows[0]!;
}

export async function expireHold(orderId: string): Promise<void> {
  await pool.query("UPDATE orders SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1", [orderId]);
}

export async function orderRow(orderId: string): Promise<{ status: string; review_reason: string | null }> {
  const { rows } = await pool.query('SELECT status, review_reason FROM orders WHERE id = $1', [orderId]);
  return rows[0];
}

export async function countRows(table: 'orders' | 'order_items' | 'payment_events', where = 'TRUE', params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${where}`, params);
  return rows[0]!.n;
}
