import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate-request';
import { asyncHandler } from '../../middleware/error-handler';
import * as controller from './product.controller';

export const productRouter = Router();

productRouter.get('/products', asyncHandler(controller.list));
productRouter.get(
  '/products/:id',
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(controller.getOne),
);
