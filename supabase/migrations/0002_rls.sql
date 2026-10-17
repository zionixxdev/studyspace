-- ============================================================================
-- StudySpace — 0002_rls.sql
-- Row Level Security for every sensitive table.
-- Run after 0001_init.sql.
--
-- Principles
--   * RLS is a real boundary, not a substitute for backend authorization. The
--     API re-checks everything; RLS stops a leaked anon key from reading rows.
--   * Membership/role checks live in SECURITY DEFINER helpers so policies do not
--     recurse into one another (and so they read membership without RLS).
--   * Writes that grant privilege (membership, roles, ownership) are RPC-only —
--     there are deliberately no INSERT/UPDATE policies for them.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Relationship helpers
-- ---------------------------------------------------------------------------
create or replace function public.are_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((requester_id = a and target_id = b) or (requester_id = b and target_id = a))
  );
$$;

-- ---------------------------------------------------------------------------
-- Conversation helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(p_conv uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = p_user
  );
$$;

create or replace function public.is_conversation_admin(p_conv uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conv and user_id = p_user and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Group helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_group_member(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.group_members where group_id = p_group and user_id = p_user
  );
$$;

create or replace function public.group_role(p_group uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.group_members where group_id = p_group and user_id = p_user;
$$;

create or replace function public.can_manage_group(p_group uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.group_role(p_group, p_user) in ('owner', 'admin', 'moderator'), false);
$$;

-- ---------------------------------------------------------------------------
-- Study-room helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_room_member(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.study_room_members where room_id = p_room and user_id = p_user
  );
$$;

create or replace function public.is_room_host(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.study_room_members
    where room_id = p_room and user_id = p_user and role = 'host'
  );
$$;

-- ---------------------------------------------------------------------------
-- File access — the single most important check in the app.
--   True when the caller owns the file, or holds a live grant whose scope they
--   currently belong to. A Drive file id is NEVER sufficient on its own.
-- ---------------------------------------------------------------------------
create or replace function public.can_access_file(p_file uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.drive_files f
    where f.id = p_file
      and f.deleted_at is null
      and (
        f.owner_id = p_user
        or exists (
          select 1 from public.file_shares s
          where s.file_id = f.id
            and s.revoked_at is null
            and (s.expires_at is null or s.expires_at > now())
            and (
              (s.scope = 'user'         and s.scope_id = p_user)
              or (s.scope = 'conversation' and public.is_conversation_member(s.scope_id, p_user))
              or (s.scope = 'group'        and public.is_group_member(s.scope_id, p_user))
              or (s.scope = 'room'         and public.is_room_member(s.scope_id, p_user))
            )
        )
      )
  );
$$;

create or replace function public.can_edit_file(p_file uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.drive_files f where f.id = p_file and f.owner_id = p_user)
    or exists (
      select 1 from public.file_shares s
      where s.file_id = p_file and s.permission = 'edit'
        and s.revoked_at is null and (s.expires_at is null or s.expires_at > now())
        and (
          (s.scope = 'user' and s.scope_id = p_user)
          or (s.scope = 'conversation' and public.is_conversation_member(s.scope_id, p_user))
          or (s.scope = 'group' and public.is_group_member(s.scope_id, p_user))
          or (s.scope = 'room' and public.is_room_member(s.scope_id, p_user))
        )
    );
$$;

-- ===========================================================================
-- Enable RLS everywhere
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_settings','notification_preferences','follows',
    'friend_requests','blocks','conversations','conversation_members','messages',
    'message_reactions','message_reads','groups','group_members','group_invitations',
    'drive_files','file_shares','saved_files','uploads','study_rooms',
    'study_room_members','study_room_invitations','annotations','annotation_events',
    'tasks','study_sessions','notifications','reports','moderation_actions','audit_events'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- ===========================================================================
-- PROFILES / SETTINGS
-- ===========================================================================
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists user_settings_all_own on public.user_settings;
create policy user_settings_all_own on public.user_settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notif_prefs_all_own on public.notification_preferences;
create policy notif_prefs_all_own on public.notification_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- SOCIAL
-- ===========================================================================
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated using (true);

drop policy if exists follows_insert_self on public.follows;
create policy follows_insert_self on public.follows
  for insert to authenticated with check (follower_id = auth.uid());

drop policy if exists follows_delete_self on public.follows;
create policy follows_delete_self on public.follows
  for delete to authenticated using (follower_id = auth.uid());

-- Friend requests: only the two parties can see one.
drop policy if exists friend_requests_select_party on public.friend_requests;
create policy friend_requests_select_party on public.friend_requests
  for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists friend_requests_insert_self on public.friend_requests;
create policy friend_requests_insert_self on public.friend_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and not public.are_blocked(requester_id, target_id));

-- The target may accept/reject; the requester may cancel.
drop policy if exists friend_requests_update_party on public.friend_requests;
create policy friend_requests_update_party on public.friend_requests
  for update to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid())
  with check (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists blocks_select_self on public.blocks;
create policy blocks_select_self on public.blocks
  for select to authenticated using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists blocks_insert_self on public.blocks;
create policy blocks_insert_self on public.blocks
  for insert to authenticated with check (blocker_id = auth.uid());

drop policy if exists blocks_delete_self on public.blocks;
create policy blocks_delete_self on public.blocks
  for delete to authenticated using (blocker_id = auth.uid());

-- ===========================================================================
-- MESSAGING
-- ===========================================================================
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member on public.conversations
  for select to authenticated using (public.is_conversation_member(id, auth.uid()));

drop policy if exists conversations_update_admin on public.conversations;
create policy conversations_update_admin on public.conversations
  for update to authenticated using (public.is_conversation_admin(id, auth.uid()))
  with check (public.is_conversation_admin(id, auth.uid()));

-- Inserts happen through create_conversation() RPC only.

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id, auth.uid()));

-- A member may mute themselves / update their own read cursor.
drop policy if exists conversation_members_update_self on public.conversation_members;
create policy conversation_members_update_self on public.conversation_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists messages_select_member on public.messages;
create policy messages_select_member on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id, auth.uid()));

drop policy if exists messages_insert_self on public.messages;
create policy messages_insert_self on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid()
              and public.is_conversation_member(conversation_id, auth.uid()));

-- Author edits their own message; no hard delete (soft delete via deleted_at).
drop policy if exists messages_update_author on public.messages;
create policy messages_update_author on public.messages
  for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists message_reactions_select_member on public.message_reactions;
create policy message_reactions_select_member on public.message_reactions
  for select to authenticated using (
    exists (select 1 from public.messages m
            where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid()))
  );

drop policy if exists message_reactions_insert_self on public.message_reactions;
create policy message_reactions_insert_self on public.message_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.messages m
                where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid()))
  );

drop policy if exists message_reactions_delete_self on public.message_reactions;
create policy message_reactions_delete_self on public.message_reactions
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists message_reads_select_member on public.message_reads;
create policy message_reads_select_member on public.message_reads
  for select to authenticated using (
    exists (select 1 from public.messages m
            where m.id = message_id and public.is_conversation_member(m.conversation_id, auth.uid()))
  );

drop policy if exists message_reads_insert_self on public.message_reads;
create policy message_reads_insert_self on public.message_reads
  for insert to authenticated with check (user_id = auth.uid());

-- ===========================================================================
-- GROUPS
-- ===========================================================================
-- Public groups are discoverable by any signed-in user; private groups only by
-- their members.
drop policy if exists groups_select_visible on public.groups;
create policy groups_select_visible on public.groups
  for select to authenticated
  using (visibility = 'public' or public.is_group_member(id, auth.uid()));

drop policy if exists groups_update_manager on public.groups;
create policy groups_update_manager on public.groups
  for update to authenticated using (public.can_manage_group(id, auth.uid()))
  with check (public.can_manage_group(id, auth.uid()));

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists group_members_select_member on public.group_members;
create policy group_members_select_member on public.group_members
  for select to authenticated using (public.is_group_member(group_id, auth.uid()));

-- Membership is written only by RPCs (join_group / invite acceptance).

drop policy if exists group_invitations_select_party on public.group_invitations;
create policy group_invitations_select_party on public.group_invitations
  for select to authenticated
  using (invitee_id = auth.uid() or public.can_manage_group(group_id, auth.uid()));

-- ===========================================================================
-- FILES
-- ===========================================================================
drop policy if exists drive_files_select_accessible on public.drive_files;
create policy drive_files_select_accessible on public.drive_files
  for select to authenticated using (public.can_access_file(id, auth.uid()));

drop policy if exists drive_files_insert_own on public.drive_files;
create policy drive_files_insert_own on public.drive_files
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists drive_files_update_owner_or_editor on public.drive_files;
create policy drive_files_update_owner_or_editor on public.drive_files
  for update to authenticated using (public.can_edit_file(id, auth.uid()))
  with check (owner_id = auth.uid());

drop policy if exists drive_files_delete_owner on public.drive_files;
create policy drive_files_delete_owner on public.drive_files
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists file_shares_select_visible on public.file_shares;
create policy file_shares_select_visible on public.file_shares
  for select to authenticated
  using (public.can_access_file(file_id, auth.uid()) or created_by = auth.uid());

drop policy if exists file_shares_insert_owner on public.file_shares;
create policy file_shares_insert_owner on public.file_shares
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (select 1 from public.drive_files f
                where f.id = file_id and f.owner_id = auth.uid())
  );

drop policy if exists file_shares_delete_owner on public.file_shares;
create policy file_shares_delete_owner on public.file_shares
  for delete to authenticated using (created_by = auth.uid());

drop policy if exists saved_files_all_own on public.saved_files;
create policy saved_files_all_own on public.saved_files
  for all to authenticated
  using (user_id = auth.uid() and public.can_access_file(file_id, auth.uid()))
  with check (user_id = auth.uid() and public.can_access_file(file_id, auth.uid()));

drop policy if exists uploads_select_own on public.uploads;
create policy uploads_select_own on public.uploads
  for select to authenticated using (owner_id = auth.uid());

drop policy if exists uploads_insert_own on public.uploads;
create policy uploads_insert_own on public.uploads
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists uploads_update_own on public.uploads;
create policy uploads_update_own on public.uploads
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ===========================================================================
-- STUDY ROOMS + ANNOTATIONS
-- ===========================================================================
drop policy if exists study_rooms_select_member on public.study_rooms;
create policy study_rooms_select_member on public.study_rooms
  for select to authenticated using (public.is_room_member(id, auth.uid()));

drop policy if exists study_rooms_update_host on public.study_rooms;
create policy study_rooms_update_host on public.study_rooms
  for update to authenticated using (public.is_room_host(id, auth.uid()))
  with check (public.is_room_host(id, auth.uid()));

drop policy if exists study_room_members_select_member on public.study_room_members;
create policy study_room_members_select_member on public.study_room_members
  for select to authenticated using (public.is_room_member(room_id, auth.uid()));

drop policy if exists study_room_invitations_select_party on public.study_room_invitations;
create policy study_room_invitations_select_party on public.study_room_invitations
  for select to authenticated
  using (invitee_id = auth.uid() or public.is_room_host(room_id, auth.uid()));

-- Personal annotations (room_id null): the author only.
-- Shared annotations (room_id set): any current room member may read.
drop policy if exists annotations_select on public.annotations;
create policy annotations_select on public.annotations
  for select to authenticated
  using (
    (room_id is null and author_id = auth.uid())
    or (room_id is not null and public.is_room_member(room_id, auth.uid()))
    or public.can_access_file(file_id, auth.uid())
  );

drop policy if exists annotations_insert_authorized on public.annotations;
create policy annotations_insert_authorized on public.annotations
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      (room_id is null and public.can_access_file(file_id, auth.uid()))
      or (room_id is not null and public.is_room_member(room_id, auth.uid()))
    )
  );

drop policy if exists annotations_update_author on public.annotations;
create policy annotations_update_author on public.annotations
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists annotations_delete_author on public.annotations;
create policy annotations_delete_author on public.annotations
  for delete to authenticated using (author_id = auth.uid());

drop policy if exists annotation_events_select on public.annotation_events;
create policy annotation_events_select on public.annotation_events
  for select to authenticated using (
    exists (select 1 from public.annotations a
            where a.id = annotation_id
              and ((a.room_id is null and a.author_id = auth.uid())
                   or (a.room_id is not null and public.is_room_member(a.room_id, auth.uid()))
                   or public.can_access_file(a.file_id, auth.uid())))
  );

-- ===========================================================================
-- TASKS + SESSIONS
-- ===========================================================================
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    owner_id = auth.uid()
    or (group_id is not null and public.is_group_member(group_id, auth.uid()))
    or (room_id is not null and public.is_room_member(room_id, auth.uid()))
  );

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      (group_id is null and room_id is null)
      or (group_id is not null and public.is_group_member(group_id, auth.uid()))
      or (room_id is not null and public.is_room_member(room_id, auth.uid()))
    )
  );

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    owner_id = auth.uid()
    or (group_id is not null and public.can_manage_group(group_id, auth.uid()))
    or (room_id is not null and public.is_room_host(room_id, auth.uid()))
  )
  with check (owner_id = auth.uid()
              or (group_id is not null and public.can_manage_group(group_id, auth.uid()))
              or (room_id is not null and public.is_room_host(room_id, auth.uid())));

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated using (owner_id = auth.uid());

drop policy if exists study_sessions_all_own on public.study_sessions;
create policy study_sessions_all_own on public.study_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ===========================================================================
-- NOTIFICATIONS + MODERATION
-- ===========================================================================
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notifications are created by the API (service role) or RPCs, never directly.

drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select to authenticated using (reporter_id = auth.uid());

-- moderation_actions and audit_events are append-only and server-written; no
-- policies are granted to clients (they are unreadable from the browser).
