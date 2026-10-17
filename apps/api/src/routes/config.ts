import { Router } from 'express';
import { env, driveConfigured, dbConfigured } from '../config/env.js';

export const configRouter = Router();

/**
 * Public runtime configuration for the browser.
 *
 * Only values that are safe to expose are returned. This exists so the SPA does
 * not need its Supabase keys baked in at build time — which is what makes a
 * single portable container image possible.
 */
configRouter.get('/config', (_req, res) => {
  res.json({
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY ?? null,
    apiBaseUrl: '/api/v1',
    features: {
      // Let the UI report honestly when a dependency is not set up yet,
      // instead of offering controls that would fail.
      db: dbConfigured,
      drive: driveConfigured,
    },
  });
});
