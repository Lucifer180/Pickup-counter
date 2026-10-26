import { Router } from 'express';
import { asyncHandler } from '../../middleware/error-handler';
import { validateRequest } from '../../middleware/validate-request';
import * as controller from './order.controller';
import { createOrderBody, orderIdParams } from './order.schemas';

export const orderRouter = Router();

orderRouter.post('/orders', validateRequest({ body: createOrderBody }), asyncHandler(controller.create));
orderRouter.get('/orders/:id', validateRequest({ params: orderIdParams }), asyncHandler(controller.getOne));
