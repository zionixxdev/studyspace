import 'dotenv/config';
import { z } from 'zod';

/**
 * Server configuration. Every secret lives here and ONLY here — none of these
 * names may be prefixed VITE_ or shipped to the browser.
 *
 * Only the core Supabase values are required, so the container can boot and
 * serve the app before the owner has finished the (offline) Google Drive
 * setup. Missing Drive credentials degrade file features with a clear error
 * rather than preventing startup.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  // --- Required -------------------------------------------------------------
  SUPABASE_URL: z.string().url(),
  // Privileged: bypasses RLS. Never expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // --- Public config served to the browser at runtime ------------------------
  // Safe to expose: protected by RLS. Served via GET /api/v1/config so the
  // frontend does not need these at build time.
  SUPABASE_ANON_KEY: z.string().min(20).optional(),

  // --- Google Drive (optional; required only for file features) --------------
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),

  // --- Serving / CORS --------------------------------------------------------
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z.string().optional(),
  // Where the built SPA lives, when this process also serves the frontend.
  SERVE_WEB_DIR: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`\nStudySpace API cannot start — invalid environment:\n${missing}\n`);
  console.error('Copy .env.example to .env and fill in the required values.\n');
  process.exit(1);
}

export const env = parsed.data;

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
