import type { Request, Response } from 'express';
import * as service from './product.service';

export async function list(_req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await service.listProducts());
}

export async function getOne(req: Request<{ id: string }>, res: Response): Promise<void> {
  res.json(await service.getProduct(req.params.id));
}
