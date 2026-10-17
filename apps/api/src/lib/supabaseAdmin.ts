import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Privileged Supabase client (service role). It bypasses RLS, so every call
 * that uses it must re-apply the application's authorization rules itself —
 * see services/authorization. This client never leaves the server.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
