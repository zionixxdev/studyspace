import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';
import { reportSchema } from '@studyspace/shared';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (req.query.before) query = query.lt('created_at', req.query.before as string);
    const { data, error } = await query;
    if (error) throw ApiError.internal(error.message);
    res.json({ items: data ?? [] });
  }),
);

notificationsRouter.patch(
  '/notifications/:id/read',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id!)
      .eq('user_id', uid);
    res.status(204).end();
  }),
);

notificationsRouter.post(
  '/notifications/read-all',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', uid)
      .is('read_at', null);
    res.status(204).end();
  }),
);

notificationsRouter.post(
  '/reports',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const body = reportSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from('reports')
      .insert({ reporter_id: uid, target_type: body.targetType, target_id: body.targetId, reason: body.reason, details: body.details ?? null })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);
