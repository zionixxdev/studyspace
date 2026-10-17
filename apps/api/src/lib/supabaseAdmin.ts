import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env.js';

/**
 * Privileged Supabase client (service role). It bypasses RLS, so every call
 * that uses it must re-apply the application's authorization rules itself —
 * see services/authorization. This client never leaves the server.
 *
 * Realtime is not used here (the browser subscribes directly, under RLS), but
 * supabase-js still constructs a Realtime client eagerly. On Node < 22 that
 * requires an explicit WebSocket transport, otherwise construction throws and
 * the server never starts — so we pass `ws`.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as never },
});
