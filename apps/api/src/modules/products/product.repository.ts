import type { Queryable } from '../../db/pool';

export const ACTIVE_HOLD_SQL = `((o.status = 'pending' AND o.expires_at > clock_timestamp()) OR o.status = 'paid')`;

export interface ProductRow {
  id: string;
  name: string;
  price_paise: number;
  stock: number;
  available: number;
}

const SELECT_WITH_AVAILABILITY = `
  SELECT p.id, p.name, p.price_paise, p.stock,
         p.stock - COALESCE(h.held, 0) AS available
  FROM products p
  LEFT JOIN (
    SELECT oi.product_id, SUM(oi.quantity) AS held
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE ${ACTIVE_HOLD_SQL}
    GROUP BY oi.product_id
  ) h ON h.product_id = p.id`;

export async function listProducts(db: Queryable): Promise<ProductRow[]> {
  const { rows } = await db.query<ProductRow>(`${SELECT_WITH_AVAILABILITY} ORDER BY p.name`);
  return rows;
}

export async function findProduct(db: Queryable, id: string): Promise<ProductRow | null> {
  const { rows } = await db.query<ProductRow>(`${SELECT_WITH_AVAILABILITY} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function lockProducts(db: Queryable, ids: string[]): Promise<void> {
  await db.query('SELECT id FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE', [ids]);
}

export async function availabilityFor(
  db: Queryable,
  ids: string[],
  excludeOrderId: string | null = null,
): Promise<Map<string, ProductRow>> {
  const { rows } = await db.query<ProductRow>(
    `SELECT p.id, p.name, p.price_paise, p.stock,
            p.stock - COALESCE((
              SELECT SUM(oi.quantity)
              FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id
                AND ${ACTIVE_HOLD_SQL}
                AND ($2::uuid IS NULL OR o.id <> $2::uuid)
            ), 0) AS available
     FROM products p
     WHERE p.id = ANY($1::uuid[])`,
    [ids, excludeOrderId],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export async function decrementStock(db: Queryable, items: { productId: string; quantity: number }[]): Promise<void> {
  const ids = items.map((i) => i.productId);
  await lockProducts(db, ids); // same lock order as everywhere else
  await db.query(
    `UPDATE products p SET stock = p.stock - x.quantity
     FROM unnest($1::uuid[], $2::int[]) AS x(product_id, quantity)
     WHERE p.id = x.product_id`,
    [ids, items.map((i) => i.quantity)],
  );
}
