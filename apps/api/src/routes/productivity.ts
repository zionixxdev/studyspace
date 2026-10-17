import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { createTaskSchema, updateTaskSchema, createStudySessionSchema } from '@studyspace/shared';
import { ApiError } from '../utils/errors.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isGroupMember, isRoomMember, canManageGroup, isRoomHost } from '../services/authorization/access.js';
import { z } from 'zod';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

/** Tasks owned by the caller, plus shared tasks from groups/rooms they are in. */
tasksRouter.get(
  '/tasks',
  validate({ query: z.object({ completed: z.coerce.boolean().optional(), subject: z.string().optional(), dueBefore: z.string().datetime().optional() }) }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    let query = supabaseAdmin
      .from('tasks')
      .select('*')
      .eq('owner_id', uid)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200);

    const completed = req.query.completed as unknown as boolean | undefined;
    if (completed === true) query = query.not('completed_at', 'is', null);
    else if (completed === false) query = query.is('completed_at', null);
    if (req.query.subject) query = query.eq('subject', req.query.subject as string);
    if (req.query.dueBefore) query = query.lte('due_at', req.query.dueBefore as string);

    const { data, error } = await query;
    if (error) throw ApiError.internal(error.message);
    res.json({ items: data ?? [] });
  }),
);

tasksRouter.post(
  '/tasks',
  writeLimiter,
  validate({ body: createTaskSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    if (req.body.groupId && !(await isGroupMember(req.body.groupId, uid))) throw ApiError.forbidden('You are not in that community');
    if (req.body.roomId && !(await isRoomMember(req.body.roomId, uid))) throw ApiError.forbidden('You are not in that room');

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert({
        owner_id: uid,
        group_id: req.body.groupId ?? null,
        room_id: req.body.roomId ?? null,
        title: req.body.title,
        notes: req.body.notes ?? null,
        subject: req.body.subject ?? null,
        priority: req.body.priority,
        due_at: req.body.dueAt ?? null,
      })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);

tasksRouter.patch(
  '/tasks/:id',
  writeLimiter,
  validate({ body: updateTaskSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: task } = await supabaseAdmin.from('tasks').select('*').eq('id', req.params.id!).maybeSingle();
    if (!task) throw ApiError.notFound('Task not found');

    const canEdit =
      task.owner_id === uid ||
      (task.group_id && (await canManageGroup(task.group_id, uid))) ||
      (task.room_id && (await isRoomHost(task.room_id, uid)));
    if (!canEdit) throw ApiError.forbidden('You cannot modify this task');

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update({
        ...(req.body.title ? { title: req.body.title } : {}),
        ...(req.body.notes !== undefined ? { notes: req.body.notes } : {}),
        ...(req.body.subject !== undefined ? { subject: req.body.subject } : {}),
        ...(req.body.priority ? { priority: req.body.priority } : {}),
        ...(req.body.dueAt !== undefined ? { due_at: req.body.dueAt } : {}),
        ...(req.body.completed !== undefined
          ? { completed_at: req.body.completed ? new Date().toISOString() : null }
          : {}),
      })
      .eq('id', task.id)
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.json(data);
  }),
);

tasksRouter.delete(
  '/tasks/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data: task } = await supabaseAdmin.from('tasks').select('owner_id').eq('id', req.params.id!).maybeSingle();
    if (!task) throw ApiError.notFound('Task not found');
    if (task.owner_id !== uid) throw ApiError.forbidden('Only the owner may delete this task');
    await supabaseAdmin.from('tasks').delete().eq('id', req.params.id!);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Focus sessions
// ---------------------------------------------------------------------------
tasksRouter.post(
  '/study-sessions',
  writeLimiter,
  validate({ body: createStudySessionSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const started = new Date(req.body.startedAt);
    const ended = new Date(req.body.endedAt);
    // Duration is derived from real timestamps, so a paused tab cannot inflate it.
    const elapsed = Math.round((ended.getTime() - started.getTime()) / 1000);
    if (elapsed < 1) throw ApiError.badRequest('Session is too short to record');

    const { data, error } = await supabaseAdmin
      .from('study_sessions')
      .insert({
        user_id: uid,
        task_id: req.body.taskId ?? null,
        mode: req.body.mode,
        duration_sec: Math.min(elapsed, req.body.durationSec),
        started_at: req.body.startedAt,
        ended_at: req.body.endedAt,
      })
      .select()
      .single();
    if (error) throw ApiError.internal(error.message);
    res.status(201).json(data);
  }),
);

tasksRouter.get(
  '/study-sessions',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const { data, error } = await supabaseAdmin
      .from('study_sessions')
      .select('*')
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(100);
    if (error) throw ApiError.internal(error.message);
    res.json({ items: data ?? [] });
  }),
);

/** Aggregate stats for the dashboard (today/week/streak). */
tasksRouter.get(
  '/study-sessions/stats',
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data, error } = await supabaseAdmin
      .from('study_sessions')
      .select('duration_sec, started_at, mode')
      .eq('user_id', uid)
      .eq('mode', 'focus')
      .gte('started_at', weekAgo);
    if (error) throw ApiError.internal(error.message);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const rows = data ?? [];
    const todaySeconds = rows
      .filter((r) => new Date(r.started_at) >= dayStart)
      .reduce((s, r) => s + Number(r.duration_sec), 0);
    const weekSeconds = rows.reduce((s, r) => s + Number(r.duration_sec), 0);
    const days = new Set(rows.map((r) => new Date(r.started_at).toDateString()));

    res.json({ todaySeconds, weekSeconds, sessionsThisWeek: rows.length, activeDays: days.size });
  }),
);
