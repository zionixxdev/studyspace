import 'dotenv/config';
import { z } from 'zod';

/**
 * Server configuration. Every secret lives here and ONLY here — none of these
 * names may be prefixed VITE_ or shipped to the browser.
 *
 * We validate at boot and exit with a clear message rather than starting a
 * half-configured server that fails mysteriously later.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),

  SUPABASE_URL: z.string().url(),
  // Privileged: bypasses RLS. Never expose to the client.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Google Drive (central owner account).
  GOOGLE_CLIENT_ID: z.string().min(10),
  GOOGLE_CLIENT_SECRET: z.string().min(10),
  GOOGLE_REDIRECT_URI: z.string().url(),
  GOOGLE_REFRESH_TOKEN: z.string().min(10),
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().min(10),

  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  // Comma-separated allow-list for CORS.
  ALLOWED_ORIGINS: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Fail loudly and specifically.
  console.error(`\nStudySpace API cannot start — invalid environment:\n${missing}\n`);
  console.error('Copy .env.example to .env and fill in the required values.\n');
  process.exit(1);
}

export const env = parsed.data;

export const allowedOrigins = (env.ALLOWED_ORIGINS ?? env.FRONTEND_ORIGIN)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isProd = env.NODE_ENV === 'production';
