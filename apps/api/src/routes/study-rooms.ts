import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { createRoomSchema, createAnnotationSchema, updateAnnotationSchema } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isRoomMember, isRoomHost, resolveFileAccess } from '../services/authorization/access.js';
import { notify } from '../services/notifications/service.js';
import { audit } from '../services/audit.js';
import { z } from 'zod';

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

roomsRouter.get(
  '/study-rooms',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data } = await supabaseAdmin
      .from('study_room_members')
      .select('role, study_rooms(*)')
      .eq('user_id', uid);
    res.json({ items: data ?? [] });
  }),
);

roomsRouter.post(
  '/study-rooms',
  writeLimiter,
  validate({ body: createRoomSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (req.body.fileId) await resolveFileAccess(req.body.fileId, uid);

    const { data: room, error } = await supabaseAdmin
      .from('study_rooms')
      .insert({ name: req.body.name, subject: req.body.subject ?? null, host_id: uid, file_id: req.body.fileId ?? null })
      .select()
      .single();
    if (error || !room) throw ApiError.internal('Could not create the study room');

    await supabaseAdmin.from('study_room_members').insert({ room_id: room.id, user_id: uid, role: 'host' });
    await audit({ actorId: uid, action: 'room.create', entityType: 'study_room', entityId: room.id });
    res.status(201).json(room);
  }),
);

roomsRouter.get(
  '/study-rooms/:id',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await isRoomMember(req.params.id!, uid))) throw ApiError.forbidden('You are not in this room');

    const { data: room } = await supabaseAdmin.from('study_rooms').select('*').eq('id', req.params.id!).maybeSingle();
    if (!room) throw ApiError.notFound('Room not found');

    const { data: members } = await supabaseAdmin
      .from('study_room_members')
      .select('user_id, role, joined_at, profiles(username, display_name, avatar_url)')
      .eq('room_id', room.id);

    res.json({ ...room, members: members ?? [] });
  }),
);

roomsRouter.post(
  '/study-rooms/:id/invitations',
  writeLimiter,
  validate({ body: z.object({ inviteeId: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await isRoomHost(req.params.id!, uid))) throw ApiError.forbidden('Only the host may invite');

    const { data, error } = await supabaseAdmin
      .from('study_room_invitations')
      .upsert(
        { room_id: req.params.id!, inviter_id: uid, invitee_id: req.body.inviteeId, expires_at: new Date(Date.now() + 7 * 864e5).toISOString() },
        { onConflict: 'room_id,invitee_id' },
      )
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);

    const { data: room } = await supabaseAdmin.from('study_rooms').select('name').eq('id', req.params.id!).maybeSingle();
    await notify({
      userId: req.body.inviteeId,
      kind: 'room_invite',
      title: `Study room invite: ${room?.name ?? ''}`,
      link: `/rooms/${req.params.id!}`,
      dedupeKey: `ri:${data.id}`,
    });
    res.status(201).json(data);
  }),
);

roomsRouter.post(
  '/study-rooms/invitations/:id/respond',
  writeLimiter,
  validate({ body: z.object({ accept: z.boolean() }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: inv } = await supabaseAdmin
      .from('study_room_invitations')
      .select('*')
      .eq('id', req.params.id!)
      .eq('invitee_id', uid)
      .maybeSingle();
    if (!inv) throw ApiError.notFound('Invitation not found');
    if (inv.status !== 'pending') throw ApiError.conflict('Already resolved');
    if (new Date(inv.expires_at) < new Date()) throw ApiError.conflict('Invitation has expired');

    await supabaseAdmin
      .from('study_room_invitations')
      .update({ status: req.body.accept ? 'accepted' : 'rejected', responded_at: new Date().toISOString() })
      .eq('id', inv.id);

    if (req.body.accept) {
      await supabaseAdmin.from('study_room_members').upsert({ room_id: inv.room_id, user_id: uid, role: 'member' }, { onConflict: 'room_id,user_id' });
      res.json({ roomId: inv.room_id });
      return;
    }
    res.status(204).end();
  }),
);

roomsRouter.post(
  '/study-rooms/:id/close',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await isRoomHost(req.params.id!, uid))) throw ApiError.forbidden('Only the host may close the room');
    await supabaseAdmin.from('study_rooms').update({ closed_at: new Date().toISOString() }).eq('id', req.params.id!);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Annotations (shared workspace state). Stored in Postgres, not just broadcast,
// so they survive a reconnect.
// ---------------------------------------------------------------------------
roomsRouter.get(
  '/study-rooms/:id/annotations',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await isRoomMember(req.params.id!, uid))) throw ApiError.forbidden('You are not in this room');
    const { data } = await supabaseAdmin
      .from('annotations')
      .select('*')
      .eq('room_id', req.params.id!)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    res.json({ items: data ?? [] });
  }),
);

roomsRouter.post(
  '/study-rooms/:id/annotations',
  writeLimiter,
  validate({ body: createAnnotationSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (!(await isRoomMember(req.params.id!, uid))) throw ApiError.forbidden('You are not in this room');
    await resolveFileAccess(req.body.fileId, uid);

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .insert({
        file_id: req.body.fileId,
        room_id: req.params.id!,
        author_id: uid,
        page: req.body.page,
        type: req.body.type,
        geometry: req.body.geometry,
        color: req.body.color,
        text: req.body.text ?? null,
      })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);

export const annotationsRouter = Router();
annotationsRouter.use(requireAuth);

annotationsRouter.patch(
  '/annotations/:id',
  writeLimiter,
  validate({ body: updateAnnotationSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: ann } = await supabaseAdmin.from('annotations').select('author_id').eq('id', req.params.id!).maybeSingle();
    if (!ann) throw ApiError.notFound('Annotation not found');
    if (ann.author_id !== uid) throw ApiError.forbidden('You can only edit your own annotations');

    const { data, error } = await supabaseAdmin
      .from('annotations')
      .update({
        ...(req.body.geometry ? { geometry: req.body.geometry } : {}),
        ...(req.body.color ? { color: req.body.color } : {}),
        ...(req.body.text !== undefined ? { text: req.body.text } : {}),
        ...(req.body.page ? { page: req.body.page } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id!)
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.json(data);
  }),
);

annotationsRouter.delete(
  '/annotations/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: ann } = await supabaseAdmin.from('annotations').select('author_id').eq('id', req.params.id!).maybeSingle();
    if (!ann) throw ApiError.notFound('Annotation not found');
    if (ann.author_id !== uid) throw ApiError.forbidden('You can only delete your own annotations');
    await supabaseAdmin.from('annotations').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id!);
    res.status(204).end();
  }),
);
