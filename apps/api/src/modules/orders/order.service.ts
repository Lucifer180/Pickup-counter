import { env } from '../../config/env';
import { pool, withTransaction, type Queryable } from '../../db/pool';
import { AppError } from '../../middleware/error-handler';
import * as productRepo from '../products/product.repository';
import * as repo from './order.repository';
import type { CreateOrderItems } from './order.schemas';

export interface OrderDto {
  id: string;
  status: repo.OrderStatus;
  totalPaise: number;
  currency: 'INR';
  items: { productId: string; name: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }[];
  
  expiresInSeconds: number;
  expiresAt: string;
  paidAt: string | null;
  pickedUpAt: string | null;
  reviewReason: string | null;
  createdAt: string;
}

function mergeLines(items: CreateOrderItems): { productId: string; quantity: number }[] {
  const byId = new Map<string, number>();
  for (const { productId, quantity } of items) byId.set(productId, (byId.get(productId) ?? 0) + quantity);
  return [...byId.entries()]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}

export async function createOrder(items: CreateOrderItems): Promise<OrderDto> {
  const lines = mergeLines(items);
  const ids = lines.map((l) => l.productId);

  const orderId = await withTransaction(async (client) => {
    await productRepo.lockProducts(client, ids);
    const availability = await productRepo.availabilityFor(client, ids);

    const unknown = ids.filter((id) => !availability.has(id));
    if (unknown.length > 0) {
      throw new AppError(422, 'UNKNOWN_PRODUCT', 'One or more products do not exist', { productIds: unknown });
    }

    const shortages = lines
      .map((l) => ({ ...l, available: Math.max(0, availability.get(l.productId)!.available) }))
      .filter((l) => l.available < l.quantity)
      .map((l) => ({
        productId: l.productId,
        name: availability.get(l.productId)!.name,
        requested: l.quantity,
        available: l.available,
      }));
    if (shortages.length > 0) {
      const names = shortages.map((s) => `${s.name} (${s.available} left)`).join(', ');
      throw new AppError(409, 'INSUFFICIENT_STOCK', `Not enough stock for: ${names}`, { shortages });
    }

    const priced = lines.map((l) => ({ ...l, unitPricePaise: availability.get(l.productId)!.price_paise }));
    const total = priced.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);

    const id = await repo.insertOrder(client, total, env.HOLD_SECONDS);
    await repo.insertItems(client, id, priced);
    return id;
  });

  return getOrder(orderId);
}

export async function getOrder(id: string, db: Queryable = pool): Promise<OrderDto> {
  const order = await repo.findOrderView(db, id);
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${id} not found`);
  const items = await repo.findItems(db, id);
  return {
    id: order.id,
    status: order.status,
    totalPaise: order.total_paise,
    currency: 'INR',
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.name,
      quantity: i.quantity,
      unitPricePaise: i.unit_price_paise,
      lineTotalPaise: i.unit_price_paise * i.quantity,
    })),
    expiresInSeconds: order.expires_in_seconds,
    expiresAt: order.expires_at.toISOString(),
    paidAt: order.paid_at?.toISOString() ?? null,
    pickedUpAt: order.picked_up_at?.toISOString() ?? null,
    reviewReason: order.review_reason,
    createdAt: order.created_at.toISOString(),
  };
}
