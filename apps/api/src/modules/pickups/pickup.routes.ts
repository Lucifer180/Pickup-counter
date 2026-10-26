import { Router } from 'express';
import { asyncHandler } from '../../middleware/error-handler';
import { validateRequest } from '../../middleware/validate-request';
import { orderIdParams } from '../orders/order.schemas';
import * as controller from './pickup.controller';

export const pickupRouter = Router();

pickupRouter.post(
  '/orders/:id/pickup-claim',
  validateRequest({ params: orderIdParams }),
  asyncHandler(controller.claim),
);
