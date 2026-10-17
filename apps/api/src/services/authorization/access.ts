import { supabaseAdmin } from '../../lib/supabaseAdmin.js';
import { ApiError } from '../../utils/errors.js';
import type { GroupRole, RoomRole } from '@studyspace/shared';

/**
 * Server-side authorization. This is the real gate: RLS protects direct
 * Supabase access, but the API uses the service-role client, so every privileged
 * operation MUST pass through these checks first.
 *
 * The golden rule: a Drive file id is never authorization. We always consult our
 * own records (drive_files + file_shares + membership) before touching Drive.
 */

export async function isConversationMember(conversationId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

export async function assertConversationMember(conversationId: string, userId: string) {
  if (!(await isConversationMember(conversationId, userId))) {
    throw ApiError.forbidden('You are not a member of this conversation');
  }
}

export async function groupRole(groupId: string, userId: string): Promise<GroupRole | null> {
  const { data } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as GroupRole | undefined) ?? null;
}

export async function isGroupMember(groupId: string, userId: string): Promise<boolean> {
  return (await groupRole(groupId, userId)) !== null;
}

export async function canManageGroup(groupId: string, userId: string): Promise<boolean> {
  const role = await groupRole(groupId, userId);
  return role === 'owner' || role === 'admin' || role === 'moderator';
}

export async function roomRole(roomId: string, userId: string): Promise<RoomRole | null> {
  const { data } = await supabaseAdmin
    .from('study_room_members')
    .select('role')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as RoomRole | undefined) ?? null;
}

export async function isRoomMember(roomId: string, userId: string): Promise<boolean> {
  return (await roomRole(roomId, userId)) !== null;
}

export async function isRoomHost(roomId: string, userId: string): Promise<boolean> {
  return (await roomRole(roomId, userId)) === 'host';
}

export interface FileAccess {
  file: {
    id: string;
    owner_id: string;
    drive_file_id: string | null;
    name: string;
    mime: string;
    size_bytes: number;
    scope: string;
    scope_id: string | null;
    upload_state: string;
  };
  canEdit: boolean;
}

/**
 * Resolves whether `userId` may access `fileId`, returning the file row when so.
 * Owner access is unconditional; otherwise a live, unexpired share whose scope
 * the user currently belongs to is required.
 */
export async function resolveFileAccess(fileId: string, userId: string): Promise<FileAccess> {
  const { data: file } = await supabaseAdmin
    .from('drive_files')
    .select('id, owner_id, drive_file_id, name, mime, size_bytes, scope, scope_id, upload_state, deleted_at')
    .eq('id', fileId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!file) throw ApiError.notFound('File not found');

  if (file.owner_id === userId) {
    return { file, canEdit: true };
  }

  const { data: shares } = await supabaseAdmin
    .from('file_shares')
    .select('scope, scope_id, permission, expires_at, revoked_at')
    .eq('file_id', fileId)
    .is('revoked_at', null);

  const now = Date.now();
  for (const s of shares ?? []) {
    if (s.expires_at && new Date(s.expires_at).getTime() < now) continue;
    const ok =
      (s.scope === 'user' && s.scope_id === userId) ||
      (s.scope === 'conversation' && (await isConversationMember(s.scope_id, userId))) ||
      (s.scope === 'group' && (await isGroupMember(s.scope_id, userId))) ||
      (s.scope === 'room' && (await isRoomMember(s.scope_id, userId)));
    if (ok) return { file, canEdit: s.permission === 'edit' };
  }

  throw ApiError.forbidden('You do not have access to this file');
}

/** True when the user has any block relationship (either direction) with `other`. */
export async function areBlocked(a: string, b: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('blocks')
    .select('blocker_id')
    .or(
      `and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`,
    )
    .maybeSingle();
  return !!data;
}
