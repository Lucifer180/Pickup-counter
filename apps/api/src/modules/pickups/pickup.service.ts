import { withTransaction } from '../../db/pool';
import { AppError } from '../../middleware/error-handler';
import * as orderRepo from '../orders/order.repository';
import { getOrder, type OrderDto } from '../orders/order.service';
import * as productRepo from '../products/product.repository';

const NOT_CLAIMABLE: Record<Exclude<orderRepo.OrderStatus, 'paid'>, { code: string; message: string }> = {
  picked_up: { code: 'ALREADY_CLAIMED', message: 'This order has already been collected' },
  pending: { code: 'NOT_PAID', message: 'This order has not been paid yet' },
  expired: { code: 'ORDER_EXPIRED', message: 'This order expired before it was paid' },
  needs_review: { code: 'ORDER_IN_REVIEW', message: 'This order needs staff review before it can be collected' },
};

export async function claimPickup(orderId: string): Promise<OrderDto> {
  return withTransaction(async (client) => {
    const claimed = await orderRepo.claimPickup(client, orderId);

    if (!claimed) {
      const order = await orderRepo.findOrderView(client, orderId);
      if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', `Order ${orderId} not found`);
      const reason = NOT_CLAIMABLE[order.status as keyof typeof NOT_CLAIMABLE];
      throw new AppError(409, reason.code, reason.message, { status: order.status });
    }

    const items = await orderRepo.findItems(client, orderId);
    await productRepo.decrementStock(
      client,
      items.map((i) => ({ productId: i.product_id, quantity: i.quantity })),
    );
    return getOrder(orderId, client);
  });
}
