import { supabase } from './supabase';
import { env } from './env';
import type { ApiError } from '@studyspace/shared';

/**
 * The single place the frontend talks to the backend API. It attaches the
 * Supabase access token, unwraps the error envelope, and throws a typed
 * ApiRequestError the UI can render. The server re-derives the user from this
 * token — a client-supplied id is never trusted.
 */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;
  readonly requestId?: string;

  constructor(status: number, body: ApiError['error']) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.requestId = body.requestId;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(await authHeader()),
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  let body = rest.body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  }

  const res = await fetch(`${env.VITE_API_BASE_URL}${path}`, { ...rest, headers, body });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err: ApiError['error'] = payload?.error ?? {
      code: 'unknown_error',
      message: res.statusText || 'Request failed',
    };
    throw new ApiRequestError(res.status, err);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: 'POST', json }),
  patch: <T>(path: string, json?: unknown) => apiFetch<T>(path, { method: 'PATCH', json }),
  del: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),

  /** Upload a file with progress via XHR (fetch has no upload progress). */
  upload: <T>(
    path: string,
    file: File,
    fields: Record<string, string>,
    onProgress?: (pct: number) => void,
    signal?: AbortSignal,
  ) =>
    new Promise<T>(async (resolve, reject) => {
      const form = new FormData();
      form.append('file', file);
      for (const [k, v] of Object.entries(fields)) form.append(k, v);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${env.VITE_API_BASE_URL}${path}`);
      const h = await authHeader();
      for (const [k, v] of Object.entries(h)) xhr.setRequestHeader(k, v);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as T);
        else
          reject(
            new ApiRequestError(
              xhr.status,
              parsed?.error ?? { code: 'upload_failed', message: 'Upload failed' },
            ),
          );
      };
      xhr.onerror = () =>
        reject(new ApiRequestError(0, { code: 'network_error', message: 'Network error' }));
      signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(form);
    }),
};
