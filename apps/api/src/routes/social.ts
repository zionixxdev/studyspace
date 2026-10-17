import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { friendRequestSchema, blockSchema, searchSchema, LIMITS } from '@studyspace/shared';
import { z } from 'zod';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { areBlocked } from '../services/authorization/access.js';
import { notify } from '../services/notifications/service.js';

export const socialRouter = Router();
socialRouter.use(requireAuth);

/** Paginated user search, blocked users excluded. */
socialRouter.get(
  '/users/search',
  validate({ query: searchSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const q = (req.query.q as string) ?? '';
    const limit = Math.min(Number(req.query.limit) || LIMITS.SEARCH_PAGE_SIZE, 50);
    if (q.length < 1) {
      res.json({ items: [] });
      return;
    }

    const { data: blockedRows } = await supabaseAdmin
      .from('blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`);
    const blocked = new Set<string>();
    for (const b of blockedRows ?? []) {
      blocked.add(b.blocker_id === uid ? b.blocked_id : b.blocker_id);
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
      .neq('id', uid)
      .limit(limit * 2);
    if (error) throw ApiError.internal(error.message);

    res.json({ items: (data ?? []).filter((u) => !blocked.has(u.id)).slice(0, limit) });
  }),
);

socialRouter.post(
  '/friend-requests',
  writeLimiter,
  validate({ body: friendRequestSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const target = req.body.targetId;
    if (target === uid) throw ApiError.badRequest('You cannot add yourself');
    if (await areBlocked(uid, target)) throw ApiError.forbidden('You cannot send a request to this user');

    const { data: existing } = await supabaseAdmin
      .from('friend_requests')
      .select('id, status')
      .or(`and(requester_id.eq.${uid},target_id.eq.${target}),and(requester_id.eq.${target},target_id.eq.${uid})`)
      .eq('status', 'pending')
      .maybeSingle();
    if (existing) throw ApiError.conflict('A request is already pending');

    const { data, error } = await supabaseAdmin
      .from('friend_requests')
      .insert({ requester_id: uid, target_id: target, message: req.body.message ?? null })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);

    await notify({
      userId: target,
      kind: 'friend_request',
      title: 'New friend request',
      body: req.body.message ?? 'Someone wants to study with you',
      link: '/people',
      dedupeKey: `fr:${data.id}`,
    });
    res.status(201).json(data);
  }),
);

async function respond(req: import('express').Request, accept: boolean) {
  const uid = userId(req);
  const { data: fr } = await supabaseAdmin
    .from('friend_requests')
    .select('*')
    .eq('id', req.params.id!)
    .maybeSingle();
  if (!fr) throw ApiError.notFound('Request not found');
  if (fr.target_id !== uid) throw ApiError.forbidden('This request is not yours to answer');
  if (fr.status !== 'pending') throw ApiError.conflict('Request already resolved');

  await supabaseAdmin
    .from('friend_requests')
    .update({ status: accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
    .eq('id', fr.id);
  return fr;
}

socialRouter.post('/friend-requests/:id/accept', writeLimiter, asyncHandler(async (req, res) => {
  const fr = await respond(req, true);
  await notify({ userId: fr.requester_id, kind: 'friend_request', title: 'Friend request accepted', link: '/people', dedupeKey: `fr-acc:${fr.id}` });
  res.status(204).end();
}));

socialRouter.post('/friend-requests/:id/reject', writeLimiter, asyncHandler(async (req, res) => {
  await respond(req, false);
  res.status(204).end();
}));

socialRouter.post(
  '/blocks',
  writeLimiter,
  validate({ body: blockSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (req.body.userId === uid) throw ApiError.badRequest('You cannot block yourself');
    await supabaseAdmin
      .from('blocks')
      .upsert({ blocker_id: uid, blocked_id: req.body.userId }, { onConflict: 'blocker_id,blocked_id' });
    res.status(204).end();
  }),
);

socialRouter.delete(
  '/blocks/:userId',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    await supabaseAdmin.from('blocks').delete().eq('blocker_id', uid).eq('blocked_id', req.params.userId!);
    res.status(204).end();
  }),
);
