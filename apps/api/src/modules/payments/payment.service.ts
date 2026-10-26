import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withTransaction, type Queryable } from '../../db/pool';
import { AppError } from '../../middleware/error-handler';
import * as orderRepo from '../orders/order.repository';
import * as productRepo from '../products/product.repository';
import * as repo from './payment.repository';

export const webhookEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  orderId: z.string().min(1).max(200),
  amountPaise: z.number().int().nonnegative(),
  status: z.string().min(1).max(50),
});

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

/** What happened to the order. Stored on the event row so a redelivery can report it. */
export type WebhookOutcome =
  | 'paid'
  | 'paid_late_stock_available'
  | 'needs_review_amount_mismatch'
  | 'needs_review_late_payment_stock_gone'
  | 'ignored_already_paid'
  | 'ignored_order_in_review'
  | 'ignored_order_not_found'
  | `ignored_status_${string}`;

export interface WebhookResult {
  duplicate: boolean;
  outcome: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies one provider event exactly once. The event row insert and the order
 * update share one transaction: either both happen or neither does, so a crash
 * half-way means the provider's retry is processed from scratch.
 */
export async function processWebhook(event: WebhookEvent, payload: unknown): Promise<WebhookResult> {
  return withTransaction(async (client) => {
    const isNew = await repo.insertEventIfNew(client, event, payload);
    if (!isNew) {
      return { duplicate: true, outcome: (await repo.findOutcome(client, event.eventId)) ?? 'unknown' };
    }
    const outcome = await applyEvent(client, event);
    await repo.setOutcome(client, event.eventId, outcome);
    return { duplicate: false, outcome };
  });
}

async function applyEvent(db: Queryable, event: WebhookEvent): Promise<WebhookOutcome> {
  // Only a capture moves money. A failed/pending status changes nothing:
  // the hold simply runs out and the customer can try again.
  if (event.status !== 'captured') return `ignored_status_${event.status}`;
  if (!UUID.test(event.orderId)) return 'ignored_order_not_found';

  // Lock order first, then its products (same order as pickup) to avoid deadlocks.
  const order = await orderRepo.lockOrder(db, event.orderId);
  if (!order) return 'ignored_order_not_found';

  if (order.status === 'paid' || order.status === 'picked_up') {
    // A *different* event id capturing an already-paid order: likely a double
    // charge. We keep the order as is; the event row is the refund trail.
    return 'ignored_already_paid';
  }
  if (order.status === 'needs_review') return 'ignored_order_in_review';

  // order.status is 'pending' or 'expired' from here on.
  const items = await orderRepo.findItems(db, order.id);
  const productIds = items.map((i) => i.product_id);
  // Taking the product locks serialises us with new orders for the same items,
  // so the "is the hold still active / is stock still free" check can't race.
  await productRepo.lockProducts(db, productIds);

  if (event.amountPaise !== order.total_paise) {
    await orderRepo.markNeedsReview(
      db,
      order.id,
      `amount_mismatch: expected ${order.total_paise} paise, received ${event.amountPaise} paise`,
      event.amountPaise,
      event.eventId,
    );
    return 'needs_review_amount_mismatch';
  }

  const holdActive = order.status === 'pending' && (await orderRepo.isHoldActive(db, order.id));
  if (holdActive) {
    await orderRepo.markPaid(db, order.id, event.amountPaise, event.eventId);
    return 'paid';
  }

  // Late payment: the hold ran out before the money arrived. Honour it if the
  // units are still free right now (nobody bought them meanwhile); otherwise
  // a human has to refund. See README → "Late payments".
  const availability = await productRepo.availabilityFor(db, productIds, order.id);
  const stillAvailable = items.every((i) => (availability.get(i.product_id)?.available ?? 0) >= i.quantity);
  if (stillAvailable) {
    await orderRepo.markPaid(db, order.id, event.amountPaise, event.eventId);
    return 'paid_late_stock_available';
  }
  await orderRepo.markNeedsReview(
    db,
    order.id,
    'late_payment_stock_gone: payment arrived after the hold expired and the items were sold; refund required',
    event.amountPaise,
    event.eventId,
  );
  return 'needs_review_late_payment_stock_gone';
}

/** Dev helper for the customer screen: builds a capture for the order's exact total. */
export async function simulateCapture(
  db: Queryable,
  orderId: string,
  amountPaise?: number,
): Promise<WebhookEvent> {
  const order = await orderRepo.findOrderView(db, orderId);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${orderId} not found`);
  return {
    eventId: `evt_sim_${randomUUID()}`,
    orderId,
    amountPaise: amountPaise ?? order.total_paise,
    status: 'captured',
  };
}
