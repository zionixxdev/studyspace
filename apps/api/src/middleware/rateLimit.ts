import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/errors.js';

/**
 * In-memory rate limiting. Adequate for a single free-tier instance; swap for a
 * shared store (Redis/Upstash) if the API is ever horizontally scaled.
 */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooMany()),
});

export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooMany('Slow down a moment')),
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(ApiError.tooMany('Too many uploads in a short time')),
});
