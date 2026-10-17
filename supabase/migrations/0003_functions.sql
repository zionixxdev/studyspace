-- ============================================================================
-- StudySpace — 0003_functions.sql
-- SECURITY DEFINER RPCs called by the web app for operations that grant or
-- change privilege. Run after 0002_rls.sql.
--
-- Every function derives the caller from auth.uid() and re-checks permissions.
-- None of them trusts an id, role or membership supplied by the client.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Utilities
-- ---------------------------------------------------------------------------
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now(); $$;

-- URL-safe random token for invitations (32 bytes -> 43 chars, base64url).
create or replace function public.gen_token()
returns text language sql volatile as $$
  select translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

-- ===========================================================================
-- CONVERSATIONS
-- ===========================================================================
create or replace function public.create_conversation(
  p_member_ids uuid[],
  p_type text default 'direct',
  p_title text default null
)
returns public.conversations
language plpgsql security definer set search_path = public as $$
declare
  v_conv public.conversations;
  v_uid uuid := auth.uid();
  v_member uuid;
  v_all uuid[];
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_type not in ('direct', 'group') then raise exception 'invalid conversation type'; end if;

  -- Always include the creator, deduplicate, and drop self-references.
  v_all := array(select distinct unnest(array_append(coalesce(p_member_ids, '{}'), v_uid)));
  v_all := array_remove(v_all, v_uid);

  if array_length(v_all, 1) is null then
    raise exception 'a conversation needs at least one other member';
  end if;
  if p_type = 'direct' and array_length(v_all, 1) <> 1 then
    raise exception 'direct conversations take exactly one other member';
  end if;

  -- Refuse to open a conversation with someone who blocked the caller.
  foreach v_member in array v_all loop
    if public.are_blocked(v_uid, v_member) then
      raise exception 'cannot start a conversation with a blocked user';
    end if;
  end loop;

  insert into public.conversations (type, title, created_by)
  values (p_type, nullif(btrim(coalesce(p_title, '')), ''), v_uid)
  returning * into v_conv;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv.id, v_uid, 'admin');

  foreach v_member in array v_all loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conv.id, v_member, 'member')
    on conflict do nothing;
  end loop;

  return v_conv;
end;
$$;

create or replace function public.get_my_conversations()
returns table (
  id uuid, type text, title text, last_message_at timestamptz,
  other_user_id uuid, other_display_name text, other_username text, other_avatar text,
  unread_count int, muted boolean
)
language sql stable security definer set search_path = public as $$
  select
    c.id, c.type, c.title, c.last_message_at,
    ou.id, ou.display_name, ou.username, ou.avatar_url,
    (select count(*)::int from public.messages m
       where m.conversation_id = c.id
         and m.deleted_at is null
         and m.sender_id <> auth.uid()
         and (me.last_read_at is null or m.created_at > me.last_read_at)) as unread_count,
    me.muted
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id and me.user_id = auth.uid()
  -- For a direct conversation, resolve the other participant.
  left join lateral (
    select p.* from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = c.id and cm.user_id <> auth.uid()
    limit 1
  ) ou on c.type = 'direct'
  order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- Keyset-paginated history, oldest-first within each page.
create or replace function public.get_conversation_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit int default 40
)
returns table (
  id bigint, conversation_id uuid, sender_id uuid, body text,
  reply_to_id bigint, attachment_file_id uuid, edited_at timestamptz,
  deleted_at timestamptz, created_at timestamptz, sender_display_name text,
  sender_username text, sender_avatar text
)
language sql stable security definer set search_path = public as $$
  select t.id, t.conversation_id, t.sender_id, t.body, t.reply_to_id,
         t.attachment_file_id, t.edited_at, t.deleted_at, t.created_at,
         t.sender_display_name, t.sender_username, t.sender_avatar
  from (
    select m.id, m.conversation_id, m.sender_id, m.body, m.reply_to_id,
           m.attachment_file_id, m.edited_at, m.deleted_at, m.created_at,
           p.display_name as sender_display_name, p.username as sender_username,
           p.avatar_url as sender_avatar
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
      and public.is_conversation_member(p_conversation_id, auth.uid())
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc, m.id desc
    limit least(greatest(coalesce(p_limit, 40), 1), 100)
  ) t
  order by t.created_at asc, t.id asc;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'not a member of this conversation';
  end if;
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

-- ===========================================================================
-- GROUPS
-- ===========================================================================
create or replace function public.create_group(
  p_name text, p_description text default null,
  p_visibility text default 'public', p_image_url text default null
)
returns public.groups
language plpgsql security definer set search_path = public as $$
declare v_group public.groups;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_name is null or char_length(btrim(p_name)) < 1 then raise exception 'name is required'; end if;
  if p_visibility not in ('public', 'private') then raise exception 'invalid visibility'; end if;

  insert into public.groups (name, description, visibility, image_url, owner_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''),
          p_visibility, p_image_url, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$$;

create or replace function public.join_public_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_vis text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select visibility into v_vis from public.groups where id = p_group_id;
  if v_vis is null then raise exception 'group not found'; end if;
  if v_vis <> 'public' then raise exception 'this group requires an invitation'; end if;

  insert into public.group_members (group_id, user_id, role)
  values (p_group_id, auth.uid(), 'member')
  on conflict do nothing;
end;
$$;

create or replace function public.leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  if v_role is null then raise exception 'not a member of this group'; end if;
  if v_role = 'owner' then raise exception 'the owner cannot leave; transfer or delete the group'; end if;
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
end;
$$;

create or replace function public.create_group_invitation(
  p_group_id uuid, p_role text default 'member',
  p_max_uses int default 1, p_expires_in interval default interval '7 days',
  p_invitee_id uuid default null
)
returns public.group_invitations
language plpgsql security definer set search_path = public as $$
declare v_inv public.group_invitations;
begin
  if not public.can_manage_group(p_group_id, auth.uid()) then
    raise exception 'not allowed to invite to this group';
  end if;
  if p_role not in ('member', 'moderator', 'admin') then raise exception 'invalid role'; end if;

  insert into public.group_invitations (group_id, inviter_id, invitee_id, token, role, max_uses, expires_at)
  values (p_group_id, auth.uid(), p_invitee_id, public.gen_token(), p_role,
          greatest(least(coalesce(p_max_uses, 1), 1000), 1), now() + coalesce(p_expires_in, interval '7 days'))
  returning * into v_inv;
  return v_inv;
end;
$$;

create or replace function public.accept_group_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.group_invitations;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  select * into v_inv from public.group_invitations where token = p_token for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_inv.status <> 'pending' then raise exception 'invitation is no longer valid'; end if;
  if v_inv.expires_at < now() then
    update public.group_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired';
  end if;
  if v_inv.uses >= v_inv.max_uses then raise exception 'invitation has reached its use limit'; end if;
  if v_inv.invitee_id is not null and v_inv.invitee_id <> auth.uid() then
    raise exception 'this invitation is not for you';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, auth.uid(), v_inv.role)
  on conflict (group_id, user_id) do update set role = excluded.role;

  update public.group_invitations
  set uses = uses + 1,
      status = case when uses + 1 >= max_uses then 'accepted' else 'pending' end,
      responded_at = now()
  where id = v_inv.id;

  return v_inv.group_id;
end;
$$;

create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_caller_role text; v_target_role text;
begin
  select role into v_caller_role from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
  select role into v_target_role from public.group_members
  where group_id = p_group_id and user_id = p_user_id;

  if v_target_role is null then raise exception 'target is not a member'; end if;
  if p_user_id = auth.uid() then raise exception 'you cannot change your own role'; end if;
  if p_role not in ('member', 'moderator', 'admin') then raise exception 'invalid role'; end if;
  -- Only the owner may grant admin; admins may set member/moderator.
  if v_caller_role = 'owner' then
    null;
  elsif v_caller_role = 'admin' and p_role in ('member', 'moderator') and v_target_role <> 'owner' then
    null;
  else
    raise exception 'not allowed to change this role';
  end if;

  update public.group_members set role = p_role
  where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_target_role text;
begin
  if not public.can_manage_group(p_group_id, auth.uid()) then
    raise exception 'not allowed to remove members';
  end if;
  select role into v_target_role from public.group_members
  where group_id = p_group_id and user_id = p_user_id;
  if v_target_role is null then raise exception 'target is not a member'; end if;
  if v_target_role = 'owner' then raise exception 'the owner cannot be removed'; end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

create or replace function public.get_my_groups()
returns table (
  id uuid, name text, description text, image_url text, visibility text,
  owner_id uuid, created_at timestamptz, my_role text, member_count int
)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.description, g.image_url, g.visibility, g.owner_id, g.created_at,
         m.role as my_role,
         (select count(*)::int from public.group_members gm where gm.group_id = g.id) as member_count
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = auth.uid()
  order by g.created_at desc;
$$;

-- ===========================================================================
-- STUDY ROOMS
-- ===========================================================================
create or replace function public.create_study_room(
  p_name text, p_subject text default null, p_file_id uuid default null
)
returns public.study_rooms
language plpgsql security definer set search_path = public as $$
declare v_room public.study_rooms;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_name is null or char_length(btrim(p_name)) < 1 then raise exception 'name is required'; end if;
  -- If a file is attached up-front, the creator must be able to read it.
  if p_file_id is not null and not public.can_access_file(p_file_id, auth.uid()) then
    raise exception 'you do not have access to that file';
  end if;

  insert into public.study_rooms (name, subject, host_id, file_id)
  values (btrim(p_name), nullif(btrim(coalesce(p_subject, '')), ''), auth.uid(), p_file_id)
  returning * into v_room;

  insert into public.study_room_members (room_id, user_id, role)
  values (v_room.id, auth.uid(), 'host');

  return v_room;
end;
$$;

create or replace function public.invite_to_room(p_room_id uuid, p_invitee_id uuid)
returns public.study_room_invitations
language plpgsql security definer set search_path = public as $$
declare v_inv public.study_room_invitations;
begin
  if not public.is_room_host(p_room_id, auth.uid()) then
    raise exception 'only the host may invite participants';
  end if;
  if public.are_blocked(auth.uid(), p_invitee_id) then
    raise exception 'cannot invite a blocked user';
  end if;

  insert into public.study_room_invitations (room_id, inviter_id, invitee_id)
  values (p_room_id, auth.uid(), p_invitee_id)
  on conflict (room_id, invitee_id) where status = 'pending'
  do update set created_at = now(), expires_at = now() + interval '7 days'
  returning * into v_inv;
  return v_inv;
end;
$$;

create or replace function public.respond_room_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv public.study_room_invitations;
begin
  select * into v_inv from public.study_room_invitations
  where id = p_invitation_id and invitee_id = auth.uid() for update;
  if not found then raise exception 'invitation not found'; end if;
  if v_inv.status <> 'pending' then raise exception 'invitation already resolved'; end if;
  if v_inv.expires_at < now() then
    update public.study_room_invitations set status = 'expired' where id = v_inv.id;
    raise exception 'invitation has expired';
  end if;

  update public.study_room_invitations
  set status = case when p_accept then 'accepted' else 'rejected' end,
      responded_at = now()
  where id = v_inv.id;

  if p_accept then
    insert into public.study_room_members (room_id, user_id, role)
    values (v_inv.room_id, auth.uid(), 'member')
    on conflict do nothing;
    return v_inv.room_id;
  end if;
  return null;
end;
$$;

create or replace function public.leave_study_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.study_room_members
  where room_id = p_room_id and user_id = auth.uid();
  if v_role is null then raise exception 'not a member of this room'; end if;
  if v_role = 'host' then raise exception 'the host must close the room instead of leaving'; end if;
  delete from public.study_room_members where room_id = p_room_id and user_id = auth.uid();
end;
$$;

create or replace function public.close_study_room(p_room_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_room_host(p_room_id, auth.uid()) then
    raise exception 'only the host may close this room';
  end if;
  update public.study_rooms set closed_at = now() where id = p_room_id;
end;
$$;

create or replace function public.get_my_rooms()
returns table (
  id uuid, name text, subject text, host_id uuid, file_id uuid,
  closed_at timestamptz, created_at timestamptz, my_role text, member_count int
)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.subject, r.host_id, r.file_id, r.closed_at, r.created_at,
         m.role as my_role,
         (select count(*)::int from public.study_room_members sm where sm.room_id = r.id) as member_count
  from public.study_rooms r
  join public.study_room_members m on m.room_id = r.id and m.user_id = auth.uid()
  order by r.created_at desc;
$$;

-- ===========================================================================
-- DASHBOARD / COUNTS
-- ===========================================================================
create or replace function public.get_unread_counts()
returns table (unread_messages int, unread_notifications int, pending_requests int)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::int
       from public.messages m
       join public.conversation_members cm
         on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
      where m.deleted_at is null and m.sender_id <> auth.uid()
        and (cm.last_read_at is null or m.created_at > cm.last_read_at)) as unread_messages,
    (select count(*)::int from public.notifications n
      where n.user_id = auth.uid() and n.read_at is null) as unread_notifications,
    (select count(*)::int from public.friend_requests fr
      where fr.target_id = auth.uid() and fr.status = 'pending') as pending_requests;
$$;

create or replace function public.get_study_stats()
returns table (
  today_seconds bigint, week_seconds bigint, sessions_this_week int, focus_streak_days int
)
language sql stable security definer set search_path = public as $$
  with s as (
    select * from public.study_sessions
    where user_id = auth.uid() and mode = 'focus'
  )
  select
    coalesce((select sum(duration_sec) from s
              where started_at >= date_trunc('day', now())), 0)::bigint,
    coalesce((select sum(duration_sec) from s
              where started_at >= date_trunc('week', now())), 0)::bigint,
    coalesce((select count(*) from s
              where started_at >= date_trunc('week', now())), 0)::int,
    coalesce((select count(distinct date_trunc('day', started_at)) from s
              where started_at >= now() - interval '30 days'), 0)::int;
$$;

-- ===========================================================================
-- ACCOUNT
-- ===========================================================================
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- profiles cascades to almost everything; the API removes owned Drive files
  -- first so the central Drive account is not left with orphans.
  delete from auth.users where id = auth.uid();
end;
$$;

-- ===========================================================================
-- Lock execution down to signed-in users.
-- ===========================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_conversation','get_my_conversations','get_conversation_messages',
        'mark_conversation_read','create_group','join_public_group','leave_group',
        'create_group_invitation','accept_group_invitation','set_group_member_role',
        'remove_group_member','get_my_groups','create_study_room','invite_to_room',
        'respond_room_invitation','leave_study_room','close_study_room','get_my_rooms',
        'get_unread_counts','get_study_stats','delete_own_account'
      )
  loop
    execute format('revoke execute on function %s from anon, public;', f.sig);
    execute format('grant execute on function %s to authenticated;', f.sig);
  end loop;
end $$;

grant execute on function public.server_now() to authenticated;
