import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { ApiError } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** The verified Supabase user id. NEVER taken from the request body. */
      userId?: string;
      userEmail?: string;
    }
  }
}

/**
 * Verifies the Supabase access token on the Authorization header and attaches
 * the *verified* user id. Any id, role or membership sent by the client is
 * ignored — authorization is always re-derived from this identity.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
    const token = header.slice('Bearer '.length).trim();

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) throw ApiError.unauthorized('Invalid or expired session');

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? undefined;
    next();
  } catch (err) {
    next(err instanceof ApiError ? err : ApiError.unauthorized());
  }
}

/** Asserts a verified user is present; narrows the type for handlers. */
export function userId(req: Request): string {
  if (!req.userId) throw ApiError.unauthorized();
  return req.userId;
}
