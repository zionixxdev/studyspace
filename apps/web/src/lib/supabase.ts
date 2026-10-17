import { createClient } from '@supabase/supabase-js';
import { env, isConfigured } from './env';

/**
 * The browser Supabase client. It carries only the anon key; RLS decides what
 * the signed-in user may read or write. Session persistence uses localStorage
 * (the token is short-lived and refreshed by the SDK) — we deliberately do NOT
 * cache auth tokens in the service-worker cache.
 */
export const supabase = createClient(
  env.VITE_SUPABASE_URL || 'http://localhost:54321',
  env.VITE_SUPABASE_ANON_KEY || 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
);

export { isConfigured };
