import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expireOrders } from '../../apps/api/src/jobs/expire-orders.job';
import { countRows, createProduct, expireHold, orderRow, pool, productState, resetDb } from '../helpers/db';
import { api, startServer } from '../helpers/http';

let baseUrl: string;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ baseUrl, close } = await startServer());
});
afterAll(async () => {
  await close();
  await pool.end();
});
beforeEach(resetDb);

describe('placing orders under contention', () => {
  it('ten customers ordering the last two units at once: exactly two are held, eight fail cleanly', async () => {
    const productId = await createProduct({ name: 'Last Brownies', pricePaise: 6000, stock: 2 });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1 }])),
    );

    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(created).toHaveLength(2);
    expect(rejected).toHaveLength(8);
    for (const r of rejected) {
      expect(r.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(r.body.error.details.shortages[0]).toMatchObject({ productId, requested: 1, available: 0 });
    }
    for (const r of created) {
      expect(r.body).toMatchObject({ status: 'pending', totalPaise: 6000 });
      expect(r.body.expiresInSeconds).toBeGreaterThan(110);
      expect(r.body.expiresInSeconds).toBeLessThanOrEqual(120);
    }

    expect(await countRows('orders')).toBe(2);
    expect(await productState(productId)).toEqual({ stock: 2, available: 0 });

    const listed = await api(baseUrl, 'GET', '/products');
    expect(listed.body.find((p: { id: string }) => p.id === productId).availableUnits).toBe(0);
  });

  it('a 20-way race with mixed quantities never holds more than the stock', async () => {
    const productId = await createProduct({ stock: 7 });
    const quantities = Array.from({ length: 20 }, (_, i) => (i % 3) + 1); // 1,2,3,1,2,3...

    const results = await Promise.all(
      quantities.map((quantity) => api(baseUrl, 'POST', '/orders', [{ productId, quantity }])),
    );

    const heldUnits = results
      .map((r, i) => (r.status === 201 ? quantities[i]! : 0))
      .reduce((a, b) => a + b, 0);
    expect(heldUnits).toBeLessThanOrEqual(7);
    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect((await productState(productId)).available).toBe(7 - heldUnits);
  });

  it('holds nothing when only part of a multi-item order is available', async () => {
    const plenty = await createProduct({ name: 'Chai', stock: 10 });
    const scarce = await createProduct({ name: 'Puff', stock: 1 });

    const res = await api(baseUrl, 'POST', '/orders', [
      { productId: plenty, quantity: 3 },
      { productId: scarce, quantity: 2 },
    ]);

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Puff');
    expect(await countRows('orders')).toBe(0);
    expect((await productState(plenty)).available).toBe(10);
    expect((await productState(scarce)).available).toBe(1);
  });

  it('computes the total in integer paise and merges duplicate lines', async () => {
    const a = await createProduct({ pricePaise: 1999, stock: 10 });
    const b = await createProduct({ pricePaise: 4501, stock: 10 });

    const res = await api(baseUrl, 'POST', '/orders', {
      items: [
        { productId: a, quantity: 2 },
        { productId: b, quantity: 1 },
        { productId: a, quantity: 1 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.totalPaise).toBe(1999 * 3 + 4501);
    expect(Number.isInteger(res.body.totalPaise)).toBe(true);
    expect(res.body.items).toHaveLength(2);
  });

  it('rejects bad input with a clear error', async () => {
    const productId = await createProduct({ stock: 5 });
    const zero = await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 0 }]);
    const fractional = await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1.5 }]);
    const empty = await api(baseUrl, 'POST', '/orders', []);
    const unknown = await api(baseUrl, 'POST', '/orders', [
      { productId: '00000000-0000-4000-8000-000000000000', quantity: 1 },
    ]);

    expect(zero.status).toBe(400);
    expect(fractional.status).toBe(400);
    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(422);
    expect(await countRows('orders')).toBe(0);
  });

  it('releases the hold the moment it expires, and the order reads as expired', async () => {
    const productId = await createProduct({ stock: 1 });
    const first = await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1 }]);
    expect(first.status).toBe(201);
    expect((await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1 }])).status).toBe(409);

    await expireHold(first.body.id);

    expect((await productState(productId)).available).toBe(1);
    const view = await api(baseUrl, 'GET', `/orders/${first.body.id}`);
    expect(view.body).toMatchObject({ status: 'expired', expiresInSeconds: 0 });
    expect((await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1 }])).status).toBe(201);

    expect(await expireOrders()).toBe(1);
    expect((await orderRow(first.body.id)).status).toBe('expired');
  });
});
