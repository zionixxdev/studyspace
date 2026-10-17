import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { dbConfigured } from '../config/env.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const healthRouter = Router();

/** Liveness — cheap, no dependencies. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'studyspace-api', time: new Date().toISOString() });
});

/**
 * Readiness — verifies the database is actually reachable. Reports not-ready
 * when Supabase is not configured, so a platform health check distinguishes
 * "the process is up" from "the app can do its job".
 */
healthRouter.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    if (!dbConfigured) {
      res.status(503).json({ status: 'degraded', database: 'not_configured' });
      return;
    }
    try {
      const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
      if (error) throw error;
      res.json({ status: 'ready', database: 'ok' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  }),
);
