import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../utils/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound('Endpoint not found'));
}

/** Converts thrown errors into a structured envelope; never leaks internals. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = randomUUID();

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, requestId, path: req.path }, err.message);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, fields: err.fields, requestId },
    });
    return;
  }

  logger.error({ err, requestId, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProd ? 'Something went wrong' : String(err),
      requestId,
    },
  });
}
