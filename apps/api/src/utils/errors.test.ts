import { describe, expect, it } from 'vitest';
import { ApiError } from './errors';

describe('ApiError factories', () => {
  it('carries a status, a machine code and a message', () => {
    const e = ApiError.forbidden();
    expect(e.status).toBe(403);
    expect(e.code).toBe('forbidden');
    expect(e.message).toMatch(/access/i);
  });

  it('exposes field-level validation details', () => {
    const e = ApiError.badRequest('Validation failed', { email: ['Invalid email'] });
    expect(e.status).toBe(400);
    expect(e.fields?.email).toEqual(['Invalid email']);
  });

  it('maps a full storage condition to 507', () => {
    expect(new ApiError(507, 'storage_limit', 'full').status).toBe(507);
  });
});
