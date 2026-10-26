import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createProduct, expireHold, orderRow, pool, productState, resetDb } from '../helpers/db';
import { api, placeOrder, sendWebhook, startServer } from '../helpers/http';

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

async function paidOrder(stock: number, quantity: number) {
  const productId = await createProduct({ stock });
  const order = await placeOrder(baseUrl, productId, quantity);
  await sendWebhook(baseUrl, { eventId: `evt_${order.id}`, orderId: order.id, amountPaise: order.totalPaise });
  return { productId, orderId: order.id };
}

describe('pickup claims', () => {
  it('two lockers claiming the same order at the same moment: exactly one succeeds, the other gets 409', async () => {
    const { productId, orderId } = await paidOrder(5, 2);

    const [a, b] = await Promise.all([
      api(baseUrl, 'POST', `/orders/${orderId}/pickup-claim`),
      api(baseUrl, 'POST', `/orders/${orderId}/pickup-claim`),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('ALREADY_CLAIMED');

    // Stock reduced exactly once, permanently.
    expect(await productState(productId)).toEqual({ stock: 3, available: 3 });
    expect((await orderRow(orderId)).status).toBe('picked_up');
  });

  it('ten simultaneous claims still produce exactly one success', async () => {
    const { productId, orderId } = await paidOrder(4, 1);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => api(baseUrl, 'POST', `/orders/${orderId}/pickup-claim`)),
    );

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect((await productState(productId)).stock).toBe(3);
  });

  it('an unpaid order cannot be claimed', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);

    const res = await api(baseUrl, 'POST', `/orders/${order.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_PAID');
    expect((await productState(productId)).stock).toBe(5);
  });

  it('an expired order cannot be claimed', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    await expireHold(order.id);

    const res = await api(baseUrl, 'POST', `/orders/${order.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_EXPIRED');
  });

  it('a needs_review order cannot be claimed', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    await sendWebhook(baseUrl, { eventId: 'evt_wrong', orderId: order.id, amountPaise: 1 });

    const res = await api(baseUrl, 'POST', `/orders/${order.id}/pickup-claim`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_IN_REVIEW');
  });

  it('an unknown order returns 404', async () => {
    const res = await api(baseUrl, 'POST', '/orders/00000000-0000-4000-8000-000000000000/pickup-claim');
    expect(res.status).toBe(404);
  });

  it('a paid order keeps holding its units until it is collected', async () => {
    const { productId, orderId } = await paidOrder(2, 2);
    await expireHold(orderId); // hold timer is irrelevant once paid

    expect(await productState(productId)).toEqual({ stock: 2, available: 0 });
    expect((await api(baseUrl, 'POST', '/orders', [{ productId, quantity: 1 }])).status).toBe(409);
  });
});
