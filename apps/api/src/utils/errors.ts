/** A typed error the API can turn into a structured, safe HTTP response. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  static badRequest(message: string, fields?: Record<string, string[]>) {
    return new ApiError(400, 'bad_request', message, fields);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'conflict', message);
  }
  static tooMany(message = 'Too many requests') {
    return new ApiError(429, 'rate_limited', message);
  }
  static upstream(message = 'Upstream service error') {
    return new ApiError(502, 'upstream_error', message);
  }
  static internal(message = 'Something went wrong') {
    return new ApiError(500, 'internal_error', message);
  }
}
