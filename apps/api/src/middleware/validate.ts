import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from '../utils/errors.js';

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validates and *replaces* request input with the parsed, typed value. A value
 * that fails validation is rejected with 400 and field-level messages.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.params) Object.assign(req.params, schemas.params.parse(req.params));
      next();
    } catch (err) {
      if (err && typeof err === 'object' && 'issues' in err) {
        const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
        const fields: Record<string, string[]> = {};
        for (const i of issues) {
          const key = i.path.join('.') || '_';
          (fields[key] ??= []).push(i.message);
        }
        next(ApiError.badRequest('Validation failed', fields));
      } else {
        next(err);
      }
    }
  };
}
