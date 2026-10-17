import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { createConversationSchema, sendMessageSchema, editMessageSchema, reactionSchema } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { assertConversationMember, areBlocked, resolveFileAccess } from '../services/authorization/access.js';
import { notifyMany } from '../services/notifications/service.js';
import { z } from 'zod';

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

/** List the caller's conversations with unread counts (via the RPC). */
conversationsRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin.rpc('get_my_conversations', {}, { head: false });
    // The RPC is SECURITY DEFINER and keyed on auth.uid(), which the service
    // client does not carry — so we replicate the query here for the API path.
    if (error) {
      const uid = userId(req);
      const { data: rows } = await supabaseAdmin
        .from('conversation_members')
        .select('muted, last_read_at, conversations(id, type, title, last_message_at, created_at)')
        .eq('user_id', uid)
        .order('joined_at', { ascending: false });
      res.json({ items: rows ?? [] });
      return;
    }
    res.json({ items: data ?? [] });
  }),
);

conversationsRouter.post(
  '/conversations',
  writeLimiter,
  validate({ body: createConversationSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { type, title, memberIds } = req.body;

    for (const other of memberIds) {
      if (other === uid) throw ApiError.badRequest('You are already in the conversation');
      if (await areBlocked(uid, other)) throw ApiError.forbidden('You cannot message a blocked user');
    }

    const { data: conv, error } = await supabaseAdmin
      .from('conversations')
      .insert({ type, title: title ?? null, created_by: uid })
      .select()
      .single();
    if (error || !conv) throw ApiError.internal('Could not create the conversation');

    await supabaseAdmin.from('conversation_members').insert([
      { conversation_id: conv.id, user_id: uid, role: 'admin' },
      ...memberIds.map((id: string) => ({ conversation_id: conv.id, user_id: id, role: 'member' })),
    ]);

    res.status(201).json(conv);
  }),
);

conversationsRouter.get(
  '/conversations/:id/messages',
  validate({ query: z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = req.params.id!;
    await assertConversationMember(id, uid);

    let query = supabaseAdmin
      .from('messages')
      .select('*, profiles:sender_id(username, display_name, avatar_url)')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(Number(req.query.limit) || 40);

    if (req.query.before) query = query.lt('created_at', req.query.before as string);

    const { data, error } = await query;
    if (error) throw ApiError.internal(error.message);
    res.json({ items: (data ?? []).reverse() });
  }),
);

conversationsRouter.post(
  '/conversations/:id/messages',
  writeLimiter,
  validate({ body: sendMessageSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const id = req.params.id!;
    await assertConversationMember(id, uid);

    if (req.body.attachmentFileId) {
      // The attachment must itself be accessible to the sender.
      await resolveFileAccess(req.body.attachmentFileId, uid);
    }

    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id: uid,
        body: req.body.body,
        reply_to_id: req.body.replyToId ?? null,
        attachment_file_id: req.body.attachmentFileId ?? null,
      })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);

    // Notify other members (deduped; the actor is skipped).
    const { data: members } = await supabaseAdmin
      .from('conversation_members')
      .select('user_id, muted')
      .eq('conversation_id', id);
    const recipients = (members ?? []).filter((m) => m.user_id !== uid && !m.muted).map((m) => m.user_id);
    await notifyMany(recipients, {
      kind: req.body.replyToId ? 'reply' : 'message',
      title: 'New message',
      body: req.body.body.slice(0, 120),
      link: `/messages/${id}`,
      dedupeKey: `msg:${data.id}`,
      actorId: uid,
    });

    res.status(201).json(data);
  }),
);

conversationsRouter.patch(
  '/messages/:id',
  writeLimiter,
  validate({ body: editMessageSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id')
      .eq('id', req.params.id!)
      .maybeSingle();
    if (!msg) throw ApiError.notFound('Message not found');
    if (msg.sender_id !== uid) throw ApiError.forbidden('You can only edit your own messages');

    const { data } = await supabaseAdmin
      .from('messages')
      .update({ body: req.body.body, edited_at: new Date().toISOString() })
      .eq('id', msg.id)
      .select()
      .single();
    res.json(data);
  }),
);

/** Soft delete: the row stays so replies and read state remain coherent. */
conversationsRouter.delete(
  '/messages/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, sender_id, conversation_id')
      .eq('id', req.params.id!)
      .maybeSingle();
    if (!msg) throw ApiError.notFound('Message not found');

    const { data: membership } = await supabaseAdmin
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', msg.conversation_id)
      .eq('user_id', uid)
      .maybeSingle();

    const allowed = msg.sender_id === uid || membership?.role === 'admin';
    if (!allowed) throw ApiError.forbidden('You cannot delete this message');

    await supabaseAdmin
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), body: '[deleted]' })
      .eq('id', msg.id);
    res.status(204).end();
  }),
);

conversationsRouter.post(
  '/messages/:id/reactions',
  writeLimiter,
  validate({ body: reactionSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: msg } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id')
      .eq('id', req.params.id!)
      .maybeSingle();
    if (!msg) throw ApiError.notFound('Message not found');
    await assertConversationMember(msg.conversation_id, uid);

    const { data, error } = await supabaseAdmin
      .from('message_reactions')
      .upsert({ message_id: msg.id, user_id: uid, emoji: req.body.emoji }, { onConflict: 'message_id,user_id,emoji' })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);

conversationsRouter.delete(
  '/messages/:id/reactions/:reactionId',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { error } = await supabaseAdmin
      .from('message_reactions')
      .delete()
      .eq('id', req.params.reactionId!)
      .eq('user_id', uid);
    if (error) throw ApiError.internal(error.message);
    res.status(204).end();
  }),
);

conversationsRouter.post(
  '/conversations/:id/read',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    await assertConversationMember(req.params.id!, uid);
    await supabaseAdmin
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', req.params.id!)
      .eq('user_id', uid);
    res.status(204).end();
  }),
);
