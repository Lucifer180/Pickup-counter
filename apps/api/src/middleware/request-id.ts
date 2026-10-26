import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;

    console.log(`[${id}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms)`);
  });
  next();
};
