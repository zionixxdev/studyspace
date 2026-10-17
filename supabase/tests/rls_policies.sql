-- ============================================================================
-- StudySpace — RLS policy tests
-- Run with:  supabase test db   (or psql -f against a scratch database)
--
-- These assertions simulate distinct users with `set role authenticated` and a
-- forged `request.jwt.claim.sub`, then prove that cross-user access is denied.
-- They are written to FAIL LOUDLY (raise exception) if a policy regresses.
-- Never run destructive tests against production data.
-- ============================================================================

-- Seed two users and one group they do NOT share.
do $$
declare
  u_a uuid := gen_random_uuid();
  u_b uuid := gen_random_uuid();
  g   uuid;
  n   int;
begin
  insert into auth.users (id, email) values (u_a, 'a@example.test'), (u_b, 'b@example.test');
  insert into public.profiles (id, username, display_name) values
    (u_a, 'user_a', 'User A'), (u_b, 'user_b', 'User B');

  -- A private group owned by A.
  insert into public.groups (name, visibility, owner_id) values ('A private', 'private', u_a)
  returning id into g;
  insert into public.group_members (group_id, user_id, role) values (g, u_a, 'owner');

  -- ---- As user B: A's private group must be invisible. ----
  perform set_config('request.jwt.claim.sub', u_b::text, true);
  set local role authenticated;

  select count(*) into n from public.groups where id = g;
  if n <> 0 then
    raise exception 'RLS FAIL: user B can read a private group they are not in';
  end if;

  select count(*) into n from public.group_members where group_id = g;
  if n <> 0 then
    raise exception 'RLS FAIL: user B can read membership of a private group';
  end if;

  reset role;

  -- ---- As user A: A can read their own group. ----
  perform set_config('request.jwt.claim.sub', u_a::text, true);
  set local role authenticated;

  select count(*) into n from public.groups where id = g;
  if n <> 1 then
    raise exception 'RLS FAIL: owner cannot read their own group';
  end if;

  reset role;

  raise notice 'RLS group visibility tests passed';
end $$;

-- A file shared only with a specific user is invisible to everyone else.
do $$
declare
  u_a uuid := gen_random_uuid();
  u_b uuid := gen_random_uuid();
  u_c uuid := gen_random_uuid();
  f   uuid;
  n   int;
begin
  insert into auth.users (id, email) values
    (u_a, 'fa@example.test'), (u_b, 'fb@example.test'), (u_c, 'fc@example.test');
  insert into public.profiles (id, username, display_name) values
    (u_a, 'file_a', 'A'), (u_b, 'file_b', 'B'), (u_c, 'file_c', 'C');

  insert into public.drive_files (owner_id, name, mime, size_bytes, upload_state)
  values (u_a, 'notes.pdf', 'application/pdf', 1000, 'completed') returning id into f;

  insert into public.file_shares (file_id, created_by, scope, scope_id, permission)
  values (f, u_a, 'user', u_b, 'view');

  -- B has access.
  perform set_config('request.jwt.claim.sub', u_b::text, true);
  set local role authenticated;
  select count(*) into n from public.drive_files where id = f;
  if n <> 1 then raise exception 'RLS FAIL: intended recipient cannot read a shared file'; end if;
  reset role;

  -- C does not.
  perform set_config('request.jwt.claim.sub', u_c::text, true);
  set local role authenticated;
  select count(*) into n from public.drive_files where id = f;
  if n <> 0 then raise exception 'RLS FAIL: unrelated user can read a shared file'; end if;
  reset role;

  raise notice 'RLS file-share tests passed';
end $$;

-- A revoked share removes access immediately.
do $$
declare
  u_a uuid := gen_random_uuid();
  u_b uuid := gen_random_uuid();
  f uuid;
  n int;
begin
  insert into auth.users (id, email) values (u_a, 'ra@example.test'), (u_b, 'rb@example.test');
  insert into public.profiles (id, username, display_name) values (u_a, 'rev_a', 'A'), (u_b, 'rev_b', 'B');
  insert into public.drive_files (owner_id, name, mime, upload_state)
  values (u_a, 'x.pdf', 'application/pdf', 'completed') returning id into f;
  insert into public.file_shares (file_id, created_by, scope, scope_id, permission)
  values (f, u_a, 'user', u_b, 'view');

  update public.file_shares set revoked_at = now() where file_id = f and scope_id = u_b;

  perform set_config('request.jwt.claim.sub', u_b::text, true);
  set local role authenticated;
  select count(*) into n from public.drive_files where id = f;
  if n <> 0 then raise exception 'RLS FAIL: revoked share still grants access'; end if;
  reset role;

  raise notice 'RLS revocation test passed';
end $$;

-- An anonymous role must not reach private application tables at all.
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.messages;
  if n <> 0 then raise exception 'RLS FAIL: anon can read messages'; end if;
  select count(*) into n from public.drive_files;
  if n <> 0 then raise exception 'RLS FAIL: anon can read file metadata'; end if;
  reset role;
  raise notice 'RLS anonymous-access tests passed';
end $$;
