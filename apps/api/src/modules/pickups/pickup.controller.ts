import type { Request, Response } from 'express';
import * as service from './pickup.service';

export async function claim(req: Request<{ id: string }>, res: Response): Promise<void> {
  const order = await service.claimPickup(req.params.id);
  res.status(200).json({ claimed: true, order });
}
