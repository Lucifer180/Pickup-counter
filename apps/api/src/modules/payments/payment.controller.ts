import type { Request, Response } from 'express';
import { env } from '../../config/env';
import { pool } from '../../db/pool';
import { AppError } from '../../middleware/error-handler';
import { getOrder } from '../orders/order.service';
import * as service from './payment.service';
import { isValidSignature } from './signature';

/** POST /payments/webhook — body arrives as a raw Buffer (see app.ts) so the signature covers the exact bytes. */
export async function webhook(req: Request, res: Response): Promise<void> {
  const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!isValidSignature(raw, req.header('x-signature'), env.WEBHOOK_SECRET)) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'X-Signature does not match the request body');
  }

  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Webhook body is not valid JSON');
  }

  const parsed = service.webhookEventSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Webhook body has the wrong shape', parsed.error.issues);
  }

  const result = await service.processWebhook(parsed.data, json);
  // Always 200 for a correctly signed event we have recorded, including ignored
  // and duplicate ones, so the provider stops retrying.
  res.status(200).json({ received: true, eventId: parsed.data.eventId, ...result });
}

/** POST /payments/simulate — dev-only "Pay with UPI" button for the customer screen. */
export async function simulate(
  req: Request<unknown, unknown, { orderId: string; amountPaise?: number }>,
  res: Response,
): Promise<void> {
  const event = await service.simulateCapture(pool, req.body.orderId, req.body.amountPaise);
  const result = await service.processWebhook(event, { ...event, simulated: true });
  res.json({ event, result, order: await getOrder(req.body.orderId) });
}
