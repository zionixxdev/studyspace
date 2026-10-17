import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requireAuth, userId } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { searchSchema, LIMITS } from '@studyspace/shared';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

/**
 * Permission-aware search. Results are scoped server-side to what the caller may
 * see: public groups, their own conversations' messages, and files they can
 * access. Nothing is fetched wholesale and filtered in the browser.
 */
searchRouter.get(
  '/search',
  validate({ query: searchSchema }),
  asyncHandler(async (req, res) => {
    const uid = userId(req);
    const q = req.query.q as string;
    const scope = req.query.scope as string;
    const limit = Math.min(Number(req.query.limit) || LIMITS.SEARCH_PAGE_SIZE, 50);
    const like = `%${q}%`;

    const results: Record<string, unknown[]> = { users: [], groups: [], messages: [], files: [], rooms: [] };

    if (scope === 'all' || scope === 'users') {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .neq('id', uid)
        .limit(limit);
      results.users = data ?? [];
    }

    if (scope === 'all' || scope === 'groups') {
      const { data } = await supabaseAdmin
        .from('groups')
        .select('id, name, description, visibility')
        .ilike('name', like)
        .eq('visibility', 'public')
        .limit(limit);
      results.groups = data ?? [];
    }

    if (scope === 'all' || scope === 'rooms') {
      const { data } = await supabaseAdmin
        .from('study_room_members')
        .select('study_rooms(id, name, subject)')
        .eq('user_id', uid);
      const rooms = (data ?? [])
        .map((row) => {
          // Supabase may type a to-one relation as an object or a 1-element array.
          const sr = (row as unknown as { study_rooms: unknown }).study_rooms;
          return Array.isArray(sr) ? sr[0] : sr;
        })
        .filter((r): r is { id: string; name: string; subject: string | null } => {
          if (!r || typeof r !== 'object') return false;
          const name = (r as { name?: unknown }).name;
          return typeof name === 'string' && new RegExp(q, 'i').test(name);
        })
        .slice(0, limit);
      results.rooms = rooms;
    }

    if (scope === 'all' || scope === 'messages') {
      // Only conversations the caller belongs to are searched.
      const { data: memberships } = await supabaseAdmin
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', uid);
      const ids = (memberships ?? []).map((m) => m.conversation_id);
      if (ids.length) {
        const { data } = await supabaseAdmin
          .from('messages')
          .select('id, conversation_id, body, created_at, sender_id')
          .in('conversation_id', ids)
          .ilike('body', like)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);
        results.messages = data ?? [];
      }
    }

    if (scope === 'all' || scope === 'files') {
      const { data } = await supabaseAdmin
        .from('drive_files')
        .select('id, name, mime, size_bytes, owner_id')
        .eq('owner_id', uid)
        .ilike('name', like)
        .is('deleted_at', null)
        .limit(limit);
      results.files = data ?? [];
    }

    if (Object.values(results).every((v) => v.length === 0) && q.length > 60) {
      throw ApiError.badRequest('Search query is too long');
    }

    res.json(results);
  }),
);
