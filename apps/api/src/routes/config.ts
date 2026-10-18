import { Router } from 'express';
import { env, driveConfigured, dbConfigured, isPlaceholder } from '../config/env.js';

export const configRouter = Router();

/**
 * Public runtime configuration for the browser.
 *
 * Only values that are safe to expose are returned. This exists so the SPA does
 * not need its Supabase keys baked in at build time — which is what makes a
 * single portable container image possible.
 *
 * Placeholder values (copied from .env.example by a hosting dashboard) are
 * returned as `null`, not passed through. Handing the browser
 * `https://YOUR-PROJECT-REF.supabase.co` would make it look configured, render
 * the login screen, and then fail every request with "Failed to fetch" — a
 * confusing symptom that hides the real cause. Returning null makes the app show
 * its setup screen instead, which names the actual problem.
 */
configRouter.get('/config', (_req, res) => {
  const supabaseUrl = isPlaceholder(env.SUPABASE_URL) ? null : (env.SUPABASE_URL ?? null);
  const supabaseAnonKey = isPlaceholder(env.SUPABASE_ANON_KEY) ? null : (env.SUPABASE_ANON_KEY ?? null);

  res.json({
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl: '/api/v1',
    features: {
      // Let the UI report honestly when a dependency is not set up yet,
      // instead of offering controls that would fail.
      db: dbConfigured,
      drive: driveConfigured,
    },
  });
});
