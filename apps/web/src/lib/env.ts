/**
 * Frontend configuration. Only PUBLIC values live here — the Supabase anon key
 * is safe to ship because every table is protected by RLS. The service-role
 * key, Google OAuth secrets and refresh tokens belong on the API, never here.
 */
import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, 'VITE_SUPABASE_ANON_KEY looks too short'),
  VITE_API_BASE_URL: z.string().default('/api/v1'),
});

const parsed = schema.safeParse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
});

/** Set when the build is missing required config; the UI shows a setup screen. */
export const envError: string | null = parsed.success
  ? null
  : parsed.error.issues.map((i) => i.message).join('; ');

export const env = parsed.success
  ? parsed.data
  : {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      VITE_API_BASE_URL: '/api/v1',
    };

export const isConfigured = parsed.success;
