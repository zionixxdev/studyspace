import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { createGroupSchema, updateGroupSchema, inviteMemberSchema, changeRoleSchema } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isGroupMember, canManageGroup, groupRole } from '../services/authorization/access.js';
import { notify, notifyMany } from '../services/notifications/service.js';
import { audit } from '../services/audit.js';
import { z } from 'zod';

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

groupsRouter.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const mine = req.query.mine === 'true';
    if (mine) {
      const { data } = await supabaseAdmin
        .from('group_members')
        .select('role, groups(*)')
        .eq('user_id', uid);
      res.json({ items: data ?? [] });
      return;
    }
    const { data, error } = await supabaseAdmin
      .from('groups')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw ApiError.internal(error.message);
    res.json({ items: data ?? [] });
  }),
);

groupsRouter.post(
  '/groups',
  writeLimiter,
  validate({ body: createGroupSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: group, error } = await supabaseAdmin
      .from('groups')
      .insert({
        name: req.body.name,
        description: req.body.description ?? null,
        visibility: req.body.visibility,
        image_url: req.body.imageUrl ?? null,
        owner_id: uid,
      })
      .select()
      .single();
    if (error || !group) throw ApiError.internal('Could not create the community');

    await supabaseAdmin.from('group_members').insert({ group_id: group.id, user_id: uid, role: 'owner' });
    await audit({ actorId: uid, action: 'group.create', entityType: 'group', entityId: group.id });
    res.status(201).json(group);
  }),
);

groupsRouter.get(
  '/groups/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: group } = await supabaseAdmin.from('groups').select('*').eq('id', req.params.id!).maybeSingle();
    if (!group) throw ApiError.notFound('Community not found');

    const member = await isGroupMember(group.id, uid);
    if (group.visibility === 'private' && !member) throw ApiError.forbidden('This community is private');

    const { data: members } = member
      ? await supabaseAdmin
          .from('group_members')
          .select('user_id, role, joined_at, profiles(username, display_name, avatar_url)')
          .eq('group_id', group.id)
      : { data: null };

    res.json({ ...group, myRole: await groupRole(group.id, uid), members: members ?? [] });
  }),
);

groupsRouter.patch(
  '/groups/:id',
  writeLimiter,
  validate({ body: updateGroupSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await canManageGroup(req.params.id!, uid))) throw ApiError.forbidden('Not allowed');

    const { data, error } = await supabaseAdmin
      .from('groups')
      .update({
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.description !== undefined ? { description: req.body.description } : {}),
        ...(req.body.visibility ? { visibility: req.body.visibility } : {}),
        ...(req.body.imageUrl !== undefined ? { image_url: req.body.imageUrl } : {}),
      })
      .eq('id', req.params.id!)
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.json(data);
  }),
);

groupsRouter.post(
  '/groups/:id/join',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: group } = await supabaseAdmin.from('groups').select('visibility').eq('id', req.params.id!).maybeSingle();
    if (!group) throw ApiError.notFound('Community not found');
    if (group.visibility !== 'public') throw ApiError.forbidden('This community requires an invitation');
    await supabaseAdmin.from('group_members').upsert({ group_id: req.params.id!, user_id: uid, role: 'member' }, { onConflict: 'group_id,user_id' });
    res.status(204).end();
  }),
);

groupsRouter.post(
  '/groups/:id/leave',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const role = await groupRole(req.params.id!, uid);
    if (!role) throw ApiError.badRequest('You are not a member');
    if (role === 'owner') throw ApiError.conflict('The owner cannot leave; transfer or delete the community');
    await supabaseAdmin.from('group_members').delete().eq('group_id', req.params.id!).eq('user_id', uid);
    res.status(204).end();
  }),
);

/** Create an invitation (link or directed). Only managers may. */
groupsRouter.post(
  '/groups/:id/invitations',
  writeLimiter,
  validate({ body: inviteMemberSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await canManageGroup(req.params.id!, uid))) throw ApiError.forbidden('Not allowed to invite');

    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const { data, error } = await supabaseAdmin
      .from('group_invitations')
      .insert({
        group_id: req.params.id!,
        inviter_id: uid,
        invitee_id: req.body.userId ?? null,
        token,
        role: req.body.role,
        max_uses: req.body.userId ? 1 : 25,
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);

    if (req.body.userId) {
      const { data: group } = await supabaseAdmin.from('groups').select('name').eq('id', req.params.id!).maybeSingle();
      await notify({
        userId: req.body.userId,
        kind: 'group_invite',
        title: `Invitation to ${group?.name ?? 'a community'}`,
        link: `/communities/${req.params.id!}`,
        dedupeKey: `gi:${data.id}`,
      });
    }
    res.status(201).json(data);
  }),
);

/** Accept an invitation by token. */
groupsRouter.post(
  '/invitations/:token/accept',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: inv } = await supabaseAdmin
      .from('group_invitations')
      .select('*')
      .eq('token', req.params.token!)
      .maybeSingle();
    if (!inv) throw ApiError.notFound('Invitation not found');
    if (inv.status !== 'pending') throw ApiError.conflict('Invitation is no longer valid');
    if (new Date(inv.expires_at) < new Date()) {
      await supabaseAdmin.from('group_invitations').update({ status: 'expired' }).eq('id', inv.id);
      throw ApiError.conflict('Invitation has expired');
    }
    if (inv.uses >= inv.max_uses) throw ApiError.conflict('Invitation has reached its limit');
    if (inv.invitee_id && inv.invitee_id !== uid) throw ApiError.forbidden('This invitation is not for you');

    await supabaseAdmin.from('group_members').upsert({ group_id: inv.group_id, user_id: uid, role: inv.role }, { onConflict: 'group_id,user_id' });
    await supabaseAdmin
      .from('group_invitations')
      .update({ uses: inv.uses + 1, status: inv.uses + 1 >= inv.max_uses ? 'accepted' : 'pending', responded_at: new Date().toISOString() })
      .eq('id', inv.id);
    res.json({ groupId: inv.group_id });
  }),
);

groupsRouter.patch(
  '/groups/:id/members/:userId/role',
  writeLimiter,
  validate({ body: changeRoleSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const callerRole = await groupRole(req.params.id!, uid);
    const targetRole = await groupRole(req.params.id!, req.params.userId!);
    if (!targetRole) throw ApiError.notFound('Target is not a member');
    if (req.params.userId! === uid) throw ApiError.badRequest('You cannot change your own role');

    const allowed =
      callerRole === 'owner' ||
      (callerRole === 'admin' && ['member', 'moderator'].includes(req.body.role) && targetRole !== 'owner');
    if (!allowed) throw ApiError.forbidden('Not allowed to change this role');

    await supabaseAdmin
      .from('group_members')
      .update({ role: req.body.role })
      .eq('group_id', req.params.id!)
      .eq('user_id', req.params.userId!);
    await audit({ actorId: uid, action: 'group.role_change', entityType: 'group', entityId: req.params.id!, metadata: { target: req.params.userId!, role: req.body.role } });
    res.status(204).end();
  }),
);

groupsRouter.delete(
  '/groups/:id/members/:userId',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await canManageGroup(req.params.id!, uid))) throw ApiError.forbidden('Not allowed');
    const targetRole = await groupRole(req.params.id!, req.params.userId!);
    if (targetRole === 'owner') throw ApiError.forbidden('The owner cannot be removed');
    await supabaseAdmin.from('group_members').delete().eq('group_id', req.params.id!).eq('user_id', req.params.userId!);
    res.status(204).end();
  }),
);

groupsRouter.post(
  '/groups/:id/announcements',
  writeLimiter,
  validate({ body: z.object({ body: z.string().trim().min(1).max(4000) }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await canManageGroup(req.params.id!, uid))) throw ApiError.forbidden('Not allowed');
    // An announcement is a message posted to the community's group conversation.
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('type', 'group')
      .eq('title', `group:${req.params.id!}`)
      .maybeSingle();
    if (!conv) throw ApiError.badRequest('This community has no announcement thread yet');
    await supabaseAdmin.from('messages').insert({ conversation_id: conv.id, sender_id: uid, body: req.body.body });

    const { data: members } = await supabaseAdmin.from('group_members').select('user_id').eq('group_id', req.params.id!);
    await notifyMany((members ?? []).map((m) => m.user_id), {
      kind: 'system', title: 'Community announcement', body: req.body.body.slice(0, 120), link: `/communities/${req.params.id!}`, actorId: uid,
    });
    res.status(201).end();
  }),
);
