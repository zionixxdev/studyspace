import 'dotenv/config';
import { z } from 'zod';

/**
 * Server configuration. Every secret lives here and ONLY here — none of these
 * names may be prefixed VITE_ or shipped to the browser.
 *
 * Supabase is *validated* when present but not required to boot: a server with
 * no database credentials still starts and serves the app with an honest
 * "not configured" state, instead of crash-looping on a hosting platform. Real
 * readiness is reported separately by GET /api/health/ready.
 */
const optionalStr = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // --- Supabase ------------------------------------------------------------
  // Required for the app to actually function; optional to start.
  SUPABASE_URL: optionalUrl,
  // Privileged: bypasses RLS. Never expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: optionalStr,
  // Public: served to the browser via GET /api/v1/config.
  SUPABASE_ANON_KEY: optionalStr,

  // --- Google Drive (optional; required only for file features) -------------
  GOOGLE_CLIENT_ID: optionalStr,
  GOOGLE_CLIENT_SECRET: optionalStr,
  GOOGLE_REDIRECT_URI: optionalStr,
  GOOGLE_REFRESH_TOKEN: optionalStr,
  GOOGLE_DRIVE_ROOT_FOLDER_ID: optionalStr,

  // --- Serving / CORS ------------------------------------------------------
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: optionalStr,
  SERVE_WEB_DIR: optionalStr,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\nStudySpace API cannot start — invalid environment:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;

/** True when the database credentials are present. */
export const dbConfigured = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

/** True when all Google Drive credentials are present. */
export const driveConfigured = Boolean(
  env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    env.GOOGLE_REFRESH_TOKEN &&
    env.GOOGLE_REDIRECT_URI,
);

export const allowedOrigins = (env.ALLOWED_ORIGINS ?? env.FRONTEND_ORIGIN)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
