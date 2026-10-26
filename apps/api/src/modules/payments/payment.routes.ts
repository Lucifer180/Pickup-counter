import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError, asyncHandler } from '../../middleware/error-handler';
import { validateRequest } from '../../middleware/validate-request';
import * as controller from './payment.controller';

export const WEBHOOK_PATH = '/payments/webhook';

export const paymentRouter = Router();

// Raw body: the signature must be checked against the exact bytes received.
paymentRouter.post(
  WEBHOOK_PATH,
  express.raw({ type: () => true, limit: '64kb' }),
  asyncHandler(controller.webhook),
);

paymentRouter.post(
  '/payments/simulate',
  (_req, _res, next) =>
    env.ENABLE_PAYMENT_SIMULATOR
      ? next()
      : next(new AppError(404, 'NOT_FOUND', 'Payment simulator is disabled (set ENABLE_PAYMENT_SIMULATOR=true)')),
  validateRequest({
    body: z.object({ orderId: z.string().uuid(), amountPaise: z.number().int().nonnegative().optional() }),
  }),
  asyncHandler(controller.simulate),
);
