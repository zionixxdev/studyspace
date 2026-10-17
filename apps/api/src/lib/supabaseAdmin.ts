import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env, dbConfigured } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * Privileged Supabase client (service role). It bypasses RLS, so every call
 * that uses it must re-apply the application's authorization rules itself —
 * see services/authorization. This client never leaves the server.
 *
 * It is created lazily and behind a Proxy so the server can boot (and report
 * its configuration state) before Supabase credentials exist. Using it while
 * unconfigured raises a clear 503 rather than failing obscurely.
 *
 * Realtime is not used here (the browser subscribes directly, under RLS), but
 * supabase-js constructs a Realtime client eagerly. On Node < 22 that requires
 * an explicit WebSocket transport, otherwise construction throws — so we pass
 * `ws`.
 */
let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!dbConfigured) {
    throw new ApiError(
      503,
      'database_not_configured',
      'Supabase is not configured on this server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as never },
    });
  }
  return client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});
