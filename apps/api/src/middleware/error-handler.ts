import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';

export function asyncHandler<R extends Request<any>>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON', requestId } });
    return;
  }

  console.error(`[${requestId}] unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', requestId } });
};
