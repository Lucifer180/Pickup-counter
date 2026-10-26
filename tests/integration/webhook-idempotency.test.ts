import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { countRows, createProduct, expireHold, orderRow, pool, productState, resetDb } from '../helpers/db';
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

describe('payment webhook', () => {
  it('the same event sent twice is processed once', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId, 2);
    const event = { eventId: 'evt_twice', orderId: order.id, amountPaise: order.totalPaise };

    const first = await sendWebhook(baseUrl, event);
    const second = await sendWebhook(baseUrl, event);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ duplicate: false, outcome: 'paid' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true, outcome: 'paid' });

    const paid = await api(baseUrl, 'GET', `/orders/${order.id}`);
    expect(paid.body.status).toBe('paid');
    const { rows } = await pool.query('SELECT paid_at FROM orders WHERE id = $1', [order.id]);
    const paidAtAfterFirst = rows[0].paid_at;

    await sendWebhook(baseUrl, event);
    const again = await pool.query('SELECT paid_at FROM orders WHERE id = $1', [order.id]);
    expect(again.rows[0].paid_at).toEqual(paidAtAfterFirst);
    expect(await countRows('payment_events', 'event_id = $1', ['evt_twice'])).toBe(1);
  });

  it('the same event delivered 10 times concurrently is processed once', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    const event = { eventId: 'evt_storm', orderId: order.id, amountPaise: order.totalPaise };

    const results = await Promise.all(Array.from({ length: 10 }, () => sendWebhook(baseUrl, event)));

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.duplicate === false)).toHaveLength(1);
    expect(results.filter((r) => r.body.duplicate === true)).toHaveLength(9);
    expect(await countRows('payment_events')).toBe(1);
    expect((await orderRow(order.id)).status).toBe('paid');
  });

  it('rejects a bad or missing signature and changes nothing', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    const event = { eventId: 'evt_forged', orderId: order.id, amountPaise: order.totalPaise };

    const wrongSecret = await sendWebhook(baseUrl, event, { secret: 'not-the-secret' });
    const garbage = await sendWebhook(baseUrl, event, { signature: 'abc123' });
    const missing = await fetch(`${baseUrl}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.body.error.code).toBe('INVALID_SIGNATURE');
    expect(garbage.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await countRows('payment_events')).toBe(0);
    expect((await orderRow(order.id)).status).toBe('pending');
  });

  it('a signature over different bytes (re-serialised body) is rejected', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    const { computeSignature } = await import('../../apps/api/src/modules/payments/signature');
    const signedBody = JSON.stringify({ eventId: 'evt_x', orderId: order.id, amountPaise: order.totalPaise, status: 'captured' });
    const sentBody = JSON.stringify({ eventId: 'evt_x', orderId: order.id, amountPaise: 1, status: 'captured' });

    const res = await fetch(`${baseUrl}/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Signature': computeSignature(signedBody, process.env.WEBHOOK_SECRET!) },
      body: sentBody,
    });
    expect(res.status).toBe(401);
  });

  it('an amount mismatch marks the order needs_review, not paid', async () => {
    const productId = await createProduct({ stock: 5, pricePaise: 4500 });
    const order = await placeOrder(baseUrl, productId);

    const res = await sendWebhook(baseUrl, { eventId: 'evt_short', orderId: order.id, amountPaise: 4400 });

    expect(res.body.outcome).toBe('needs_review_amount_mismatch');
    const view = await api(baseUrl, 'GET', `/orders/${order.id}`);
    expect(view.body.status).toBe('needs_review');
    expect(view.body.reviewReason).toContain('expected 4500');
  });

  it('a non-captured status is recorded but does not change the order', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);

    const res = await sendWebhook(baseUrl, {
      eventId: 'evt_failed',
      orderId: order.id,
      amountPaise: order.totalPaise,
      status: 'failed',
    });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('ignored_status_failed');
    expect((await orderRow(order.id)).status).toBe('pending');
  });

  it('a second, different capture for a paid order is ignored (logged for refund)', async () => {
    const productId = await createProduct({ stock: 5 });
    const order = await placeOrder(baseUrl, productId);
    await sendWebhook(baseUrl, { eventId: 'evt_a', orderId: order.id, amountPaise: order.totalPaise });

    const res = await sendWebhook(baseUrl, { eventId: 'evt_b', orderId: order.id, amountPaise: order.totalPaise });
    expect(res.body).toMatchObject({ duplicate: false, outcome: 'ignored_already_paid' });
    expect(await countRows('payment_events')).toBe(2);
  });

  describe('late payment (arrives after the hold expired)', () => {
    it('is accepted when the units are still free', async () => {
      const productId = await createProduct({ stock: 1 });
      const order = await placeOrder(baseUrl, productId);
      await expireHold(order.id);

      const res = await sendWebhook(baseUrl, { eventId: 'evt_late_ok', orderId: order.id, amountPaise: order.totalPaise });

      expect(res.body.outcome).toBe('paid_late_stock_available');
      expect((await orderRow(order.id)).status).toBe('paid');
      expect((await productState(productId)).available).toBe(0); // re-held for this customer
    });

    it('goes to needs_review when the units were sold to someone else', async () => {
      const productId = await createProduct({ stock: 1 });
      const slow = await placeOrder(baseUrl, productId);
      await expireHold(slow.id);
      const fast = await placeOrder(baseUrl, productId); // takes the freed unit

      const res = await sendWebhook(baseUrl, { eventId: 'evt_late_gone', orderId: slow.id, amountPaise: slow.totalPaise });

      expect(res.body.outcome).toBe('needs_review_late_payment_stock_gone');
      const row = await orderRow(slow.id);
      expect(row.status).toBe('needs_review');
      expect(row.review_reason).toContain('refund');
      expect((await orderRow(fast.id)).status).toBe('pending'); // the other customer keeps their hold
      expect((await productState(productId)).available).toBe(0); // never oversold
    });
  });
});
