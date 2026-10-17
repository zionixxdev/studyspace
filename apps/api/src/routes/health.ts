import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const healthRouter = Router();

/** Liveness — cheap, no dependencies. */
healthRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'studyspace-api', time: new Date().toISOString() });
});

/** Readiness — verifies the database is reachable. */
healthRouter.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    if (error) {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
      return;
    }
    res.json({ status: 'ready', database: 'ok' });
  }),
);
