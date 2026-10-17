-- ============================================================================
-- StudySpace — 0001_init.sql
-- Tables, constraints, indexes, triggers and the Realtime publication.
-- Run order: 0001_init.sql -> 0002_rls.sql -> 0003_functions.sql
--
-- Conventions
--   * UUID primary keys (gen_random_uuid) except high-volume append tables
--     (messages) which use a bigint identity for cheap keyset pagination.
--   * created_at / updated_at are timestamptz, defaulted and kept fresh by a
--     single touch_updated_at() trigger.
--   * Relationships that must not duplicate carry a UNIQUE constraint.
--   * Enum-like columns use CHECK constraints so bad states cannot be stored.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ===========================================================================
-- 1. USERS AND SOCIAL
-- ===========================================================================

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique
                 check (username ~ '^[A-Za-z][A-Za-z0-9_]{2,31}$'),
  display_name text not null default 'Student'
                 check (char_length(btrim(display_name)) between 1 and 80),
  avatar_url   text,
  bio          text check (bio is null or char_length(bio) <= 280),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create table if not exists public.user_settings (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  theme              text not null default 'system'
                       check (theme in ('light', 'dark', 'system')),
  notify_email       boolean not null default true,
  notify_push        boolean not null default false,
  profile_visibility text not null default 'public'
                       check (profile_visibility in ('public', 'friends', 'private')),
  reduced_motion     boolean not null default false,
  updated_at         timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  kind        text not null default 'all',
  -- A JSON map of notification kind -> boolean. Absent keys default to enabled.
  overrides   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists follows_followee_idx on public.follows (followee_id);

create table if not exists public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  message      text check (message is null or char_length(message) <= 280),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> target_id)
);

-- At most one live request per direction; history is preserved once resolved.
create unique index if not exists friend_requests_pending_unique
  on public.friend_requests (requester_id, target_id)
  where status = 'pending';

create index if not exists friend_requests_target_idx
  on public.friend_requests (target_id, status);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

-- ===========================================================================
-- 2. MESSAGING
-- ===========================================================================

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            text not null default 'direct' check (type in ('direct', 'group')),
  title           text check (title is null or char_length(title) <= 120),
  created_by      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create index if not exists conversations_recent_idx
  on public.conversations (last_message_at desc nulls last);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            text not null default 'member' check (role in ('member', 'admin')),
  muted           boolean not null default false,
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

create table if not exists public.messages (
  id                 bigint generated always as identity primary key,
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  sender_id          uuid not null references public.profiles (id) on delete cascade,
  body               text not null check (char_length(body) between 1 and 4000),
  reply_to_id        bigint references public.messages (id) on delete set null,
  attachment_file_id uuid, -- FK added after drive_files exists (see below)
  edited_at          timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz not null default now()
);

-- Keyset pagination: newest-first within a conversation.
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

create table if not exists public.message_reads (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ===========================================================================
-- 3. COMMUNITIES (GROUPS)
-- ===========================================================================

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  image_url   text,
  visibility  text not null default 'public' check (visibility in ('public', 'private')),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists groups_visibility_idx on public.groups (visibility, created_at desc);
create index if not exists groups_name_lower_idx on public.groups (lower(name));

create table if not exists public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member'
              check (role in ('member', 'moderator', 'admin', 'owner')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

create table if not exists public.group_invitations (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  inviter_id   uuid not null references public.profiles (id) on delete cascade,
  invitee_id   uuid references public.profiles (id) on delete cascade,
  -- Unpredictable token for link invitations; unique so it can be looked up.
  token        text not null unique,
  role         text not null default 'member'
                 check (role in ('member', 'moderator', 'admin')),
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'revoked', 'expired')),
  max_uses     int not null default 1 check (max_uses between 1 and 1000),
  uses         int not null default 0 check (uses >= 0),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists group_invitations_group_idx
  on public.group_invitations (group_id, status);
create index if not exists group_invitations_invitee_idx
  on public.group_invitations (invitee_id, status);

-- ===========================================================================
-- 4. FILE MANAGEMENT (metadata only — bytes live in Google Drive)
-- ===========================================================================

create table if not exists public.drive_files (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  -- Null until the Drive upload completes; set to the Drive file id after.
  drive_file_id text,
  name          text not null check (char_length(btrim(name)) between 1 and 255),
  mime          text not null,
  size_bytes    bigint not null default 0 check (size_bytes >= 0),
  scope         text not null default 'private'
                  check (scope in ('private', 'user', 'conversation', 'group', 'room')),
  scope_id      uuid,
  upload_state  text not null default 'pending'
                  check (upload_state in ('pending', 'uploading', 'completed', 'failed', 'deleting')),
  created_at    timestamptz not null default now(),
  archived_at   timestamptz,
  deleted_at    timestamptz
);

create index if not exists drive_files_owner_idx
  on public.drive_files (owner_id, created_at desc);
create index if not exists drive_files_scope_idx
  on public.drive_files (scope, scope_id)
  where deleted_at is null;
create index if not exists drive_files_name_lower_idx
  on public.drive_files (lower(name));

-- Now that drive_files exists, wire the message attachment FK.
alter table public.messages
  drop constraint if exists messages_attachment_file_fk;
alter table public.messages
  add constraint messages_attachment_file_fk
  foreign key (attachment_file_id) references public.drive_files (id) on delete set null;

create table if not exists public.file_shares (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.drive_files (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  scope       text not null check (scope in ('user', 'conversation', 'group', 'room')),
  scope_id    uuid not null,
  permission  text not null default 'view'
                check (permission in ('view', 'download', 'edit')),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists file_shares_file_idx on public.file_shares (file_id);
create index if not exists file_shares_scope_idx
  on public.file_shares (scope, scope_id)
  where revoked_at is null;
-- One live grant per (file, scope, scope_id).
create unique index if not exists file_shares_unique_live
  on public.file_shares (file_id, scope, scope_id)
  where revoked_at is null;

create table if not exists public.saved_files (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  file_id    uuid not null references public.drive_files (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, file_id)
);

-- Upload tracking + idempotency so retries never duplicate a Drive object.
create table if not exists public.uploads (
  id              uuid primary key default gen_random_uuid(),
  file_id         uuid not null references public.drive_files (id) on delete cascade,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null,
  state           text not null default 'pending'
                    check (state in ('pending', 'uploading', 'completed', 'failed', 'deleting')),
  bytes_received  bigint not null default 0 check (bytes_received >= 0),
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Scoped to the owner: the same key from different users is independent.
  unique (owner_id, idempotency_key)
);

create index if not exists uploads_owner_state_idx on public.uploads (owner_id, state);

-- ===========================================================================
-- 5. STUDY COLLABORATION
-- ===========================================================================

create table if not exists public.study_rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  subject    text check (subject is null or char_length(subject) <= 120),
  host_id    uuid not null references public.profiles (id) on delete cascade,
  file_id    uuid references public.drive_files (id) on delete set null,
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_rooms_host_idx on public.study_rooms (host_id);

create table if not exists public.study_room_members (
  room_id   uuid not null references public.study_rooms (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('member', 'host')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists study_room_members_user_idx on public.study_room_members (user_id);

create table if not exists public.study_room_invitations (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references public.study_rooms (id) on delete cascade,
  inviter_id   uuid not null references public.profiles (id) on delete cascade,
  invitee_id   uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
                 check (status in ('pending', 'accepted', 'rejected', 'revoked', 'expired')),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  created_at   timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists study_room_invites_pending_unique
  on public.study_room_invitations (room_id, invitee_id)
  where status = 'pending';

create table if not exists public.annotations (
  id         uuid primary key default gen_random_uuid(),
  file_id    uuid not null references public.drive_files (id) on delete cascade,
  -- Null for personal annotations; set for annotations shared in a study room.
  room_id    uuid references public.study_rooms (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  page       int not null default 1 check (page >= 1),
  type       text not null
               check (type in ('highlight', 'underline', 'rect', 'ellipse', 'freehand', 'note')),
  -- Normalised (0..1) coordinates + type-specific payload. Stored as jsonb so
  -- the geometry can evolve without a migration.
  geometry   jsonb not null default '{}'::jsonb,
  color      text not null default '#facc15'
               check (color ~ '^#[0-9a-fA-F]{6}$'),
  text       text check (text is null or char_length(text) <= 4000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists annotations_file_page_idx
  on public.annotations (file_id, page)
  where deleted_at is null;
create index if not exists annotations_room_idx
  on public.annotations (room_id)
  where deleted_at is null;

-- Append-only log of annotation changes, used to resolve concurrent edits and
-- to replay state after a Realtime reconnect.
create table if not exists public.annotation_events (
  id            bigint generated always as identity primary key,
  annotation_id uuid not null references public.annotations (id) on delete cascade,
  actor_id      uuid not null references public.profiles (id) on delete cascade,
  action        text not null check (action in ('create', 'update', 'delete')),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists annotation_events_annotation_idx
  on public.annotation_events (annotation_id, created_at desc);

-- ===========================================================================
-- 6. PRODUCTIVITY
-- ===========================================================================

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  -- Exactly one of group_id / room_id may be set for a shared task.
  group_id     uuid references public.groups (id) on delete cascade,
  room_id      uuid references public.study_rooms (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  notes        text check (notes is null or char_length(notes) <= 2000),
  subject      text check (subject is null or char_length(subject) <= 80),
  priority     text not null default 'medium'
                 check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at       timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (not (group_id is not null and room_id is not null))
);

create index if not exists tasks_owner_due_idx on public.tasks (owner_id, due_at);
create index if not exists tasks_group_idx on public.tasks (group_id) where group_id is not null;
create index if not exists tasks_room_idx on public.tasks (room_id) where room_id is not null;

create table if not exists public.study_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete set null,
  mode         text not null check (mode in ('focus', 'short_break', 'long_break')),
  duration_sec int not null check (duration_sec between 1 and 14400),
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  created_at   timestamptz not null default now(),
  check (ended_at >= started_at)
);

create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);

-- ===========================================================================
-- 7. NOTIFICATIONS AND MODERATION
-- ===========================================================================

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null
               check (kind in ('message', 'reply', 'mention', 'friend_request',
                               'group_invite', 'room_invite', 'task_reminder',
                               'moderation', 'system')),
  title      text not null check (char_length(title) between 1 and 160),
  body       text check (body is null or char_length(body) <= 500),
  link       text,
  -- Dedup key: a retried operation must not create a second notification.
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create unique index if not exists notifications_dedupe_unique
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('user', 'message', 'group', 'file')),
  target_id   uuid not null,
  reason      text not null check (char_length(reason) between 1 and 120),
  details     text check (details is null or char_length(details) <= 2000),
  status      text not null default 'open'
                check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

create table if not exists public.moderation_actions (
  id           uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('user', 'message', 'group', 'file')),
  target_id    uuid not null,
  action       text not null check (char_length(action) between 1 and 60),
  reason       text,
  created_at   timestamptz not null default now()
);

create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_type, target_id);

create table if not exists public.audit_events (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_events_actor_idx on public.audit_events (actor_id, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- ===========================================================================
-- 8. TRIGGERS
-- ===========================================================================

-- Create the profile + settings + notification prefs for every new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  uname text;
  suffix int := 0;
begin
  base := regexp_replace(
            coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
                     split_part(coalesce(new.email, 'student'), '@', 1)),
            '[^A-Za-z0-9_]', '', 'g');
  if base !~ '^[A-Za-z]' then
    base := 'u' || base;
  end if;
  base := left(base, 24);
  if char_length(base) < 3 then
    base := base || 'user';
  end if;

  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    suffix := suffix + 1;
    uname := left(base, 24) || suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name)
  values (new.id, uname,
          coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), uname))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on the tables that carry it.
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','notification_preferences',
                           'groups','drive_files','uploads','study_rooms',
                           'annotations','tasks'] loop
    execute format('drop trigger if exists %I_touch on public.%I;', t, t);
    execute format('create trigger %I_touch before update on public.%I
                    for each row execute function public.touch_updated_at();', t, t);
  end loop;
end $$;

-- Server-side rate limit on message creation (10 / 10s per sender).
create or replace function public.enforce_message_rate_limit()
returns trigger language plpgsql as $$
declare recent int;
begin
  select count(*) into recent from public.messages
  where sender_id = new.sender_id and created_at > now() - interval '10 seconds';
  if recent >= 10 then
    raise exception 'rate limit exceeded: slow down';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();

-- Keep conversations.last_message_at current.
create or replace function public.bump_conversation_last_message()
returns trigger language plpgsql as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id
    and (last_message_at is null or last_message_at < new.created_at);
  return new;
end;
$$;

drop trigger if exists messages_bump_conversation on public.messages;
create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation_last_message();

-- Record an annotation_event whenever an annotation changes (replay + audit).
create or replace function public.log_annotation_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.annotation_events (annotation_id, actor_id, action, payload)
    values (new.id, new.author_id, 'create', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.annotation_events (annotation_id, actor_id, action, payload)
    values (new.id, auth.uid(), case when new.deleted_at is not null then 'delete' else 'update' end,
            to_jsonb(new));
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists annotations_log_event on public.annotations;
create trigger annotations_log_event
  after insert or update on public.annotations
  for each row execute function public.log_annotation_event();

-- ===========================================================================
-- 9. REALTIME
--    Only tables the client subscribes to directly are published. Presence,
--    typing and cursors use Realtime Broadcast and need no publication entry.
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['messages','message_reactions','notifications','annotations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
