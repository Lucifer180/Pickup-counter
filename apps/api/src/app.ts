import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env';
import { pool } from './db/pool';
import { asyncHandler, errorHandler, notFound } from './middleware/error-handler';
import { requestId } from './middleware/request-id';
import { orderRouter } from './modules/orders/order.routes';
import { paymentRouter, WEBHOOK_PATH } from './modules/payments/payment.routes';
import { pickupRouter } from './modules/pickups/pickup.routes';
import { productRouter } from './modules/products/product.routes';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(requestId);
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));

  // JSON for everything except the webhook, which needs the raw bytes for its signature.
  const json = express.json({ limit: '64kb' });
  app.use((req, res, next) => (req.path === WEBHOOK_PATH ? next() : json(req, res, next)));

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ ok: true });
    }),
  );

  app.use(productRouter);
  app.use(orderRouter);
  app.use(pickupRouter);
  app.use(paymentRouter);

  // In the Docker image the API also serves the built customer screen.
  if (env.WEB_DIST_DIR && existsSync(env.WEB_DIST_DIR)) {
    const dir = path.resolve(env.WEB_DIST_DIR);
    app.use(express.static(dir, { index: false }));
    app.get(['/', '/pay/*'], (_req, res) => res.sendFile(path.join(dir, 'index.html')));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
