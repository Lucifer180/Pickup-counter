import { z } from 'zod';

export const MAX_LINES = 20;
export const MAX_QUANTITY_PER_LINE = 20;

const orderItem = z.object({
  productId: z.string().uuid('productId must be a UUID'),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be a whole number')
    .min(1, 'quantity must be at least 1')
    .max(MAX_QUANTITY_PER_LINE, `quantity must be at most ${MAX_QUANTITY_PER_LINE}`),
});

const orderItems = z.array(orderItem).min(1, 'order needs at least one item').max(MAX_LINES);

export const createOrderBody = z
  .union([orderItems, z.object({ items: orderItems })])
  .transform((v) => (Array.isArray(v) ? v : v.items));

export type CreateOrderItems = z.infer<typeof createOrderBody>;

export const orderIdParams = z.object({ id: z.string().uuid('order id must be a UUID') });
