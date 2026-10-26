import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from './error-handler';

interface Schemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/** Validates and replaces req.body / req.params / req.query with the parsed values. */
export function validateRequest(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(
          new AppError(400, 'VALIDATION_ERROR', `Invalid request ${key}`, result.error.issues.map((i) => ({
            path: [key, ...i.path].join('.'),
            message: i.message,
          }))),
        );
      }
      // Express 4 allows reassigning these.
      (req as unknown as Record<string, unknown>)[key] = result.data;
    }
    next();
  };
}
