import type { Request, Response } from 'express';
import type { CreateOrderItems } from './order.schemas';
import * as service from './order.service';

export async function create(req: Request<unknown, unknown, CreateOrderItems>, res: Response): Promise<void> {
  const order = await service.createOrder(req.body);
  res.status(201).location(`/orders/${order.id}`).json(order);
}

export async function getOne(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await service.getOrder(req.params.id));
}
