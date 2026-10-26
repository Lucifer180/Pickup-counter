import type { Queryable } from '../../db/pool';
import type { WebhookEvent } from './payment.service';

/**
 * The idempotency gate. INSERT ... ON CONFLICT DO NOTHING on the event_id
 * primary key: if a copy of this event is being processed right now in another
 * transaction, this statement waits for it to commit and then inserts nothing.
 * Returns true only for the first delivery.
 */
export async function insertEventIfNew(db: Queryable, event: WebhookEvent, payload: unknown): Promise<boolean> {
  const { rowCount } = await db.query(
    `INSERT INTO payment_events (event_id, order_id, amount_paise, status, payload, outcome)
     VALUES ($1, $2, $3, $4, $5, 'processing')
     ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId, event.orderId, event.amountPaise, event.status, JSON.stringify(payload)],
  );
  return rowCount === 1;
}

export async function setOutcome(db: Queryable, eventId: string, outcome: string): Promise<void> {
  await db.query('UPDATE payment_events SET outcome = $2 WHERE event_id = $1', [eventId, outcome]);
}

export async function findOutcome(db: Queryable, eventId: string): Promise<string | null> {
  const { rows } = await db.query<{ outcome: string }>(
    'SELECT outcome FROM payment_events WHERE event_id = $1',
    [eventId],
  );
  return rows[0]?.outcome ?? null;
}
