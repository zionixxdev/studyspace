import { ApiError } from '../../utils/errors.js';

/** Turns a Google API failure into a clear, non-leaking ApiError. */
export function mapDriveError(err: unknown): ApiError {
  const anyErr = err as { code?: number | string; message?: string; response?: { status?: number } };
  const status = anyErr?.response?.status ?? (typeof anyErr?.code === 'number' ? anyErr.code : undefined);
  const message = String(anyErr?.message ?? '');

  if (message.includes('invalid_grant') || status === 401) {
    return new ApiError(
      502,
      'drive_auth_revoked',
      'Google Drive authorization has been revoked or expired. The app owner must reconnect Drive.',
    );
  }
  if (status === 403 && /quota|storage/i.test(message)) {
    return new ApiError(507, 'drive_quota_exceeded', 'Google Drive storage is full.');
  }
  if (status === 404) return ApiError.notFound('The file no longer exists in Drive');
  if (status === 429 || (status && status >= 500)) {
    return new ApiError(503, 'drive_unavailable', 'Google Drive is temporarily unavailable.');
  }
  return ApiError.upstream('Google Drive request failed');
}
