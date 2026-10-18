-- ============================================================================
-- StudySpace — 0004_hardening.sql
-- Fixes reported by the Supabase security advisor. Run after 0003_functions.sql.
--
-- Two classes of issue:
--   1. SECURITY DEFINER functions were executable by the `anon` role. An
--      unauthenticated caller could invoke helpers such as can_access_file()
--      or is_group_member() directly through /rest/v1/rpc/* and use them to
--      probe other users' data.
--   2. Five functions had a mutable `search_path`, which lets a caller who can
--      create objects earlier on the path shadow a function or operator the
--      function relies on.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Lock down EXECUTE on SECURITY DEFINER functions.
--    Signed-in users still need the policy helpers (RLS policies are evaluated
--    with the caller's privileges), but anonymous callers never do. The two
--    trigger functions are not callable through the API at all.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef            -- SECURITY DEFINER only
  loop
    execute format('revoke execute on function %s from anon, public', r.sig);

    -- Trigger functions must never be exposed as RPC endpoints.
    if r.proname not in ('handle_new_user', 'log_annotation_event') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;

-- Belt and braces for the two trigger functions.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.log_annotation_event() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 2. Pin search_path on the functions that lacked it.
--    `gen_token()` calls gen_random_bytes(), which lives in the `extensions`
--    schema on Supabase, so it needs that on its path. The rest reference only
--    schema-qualified tables or pg_catalog, so an empty path is correct.
-- ---------------------------------------------------------------------------
alter function public.touch_updated_at() set search_path = '';
alter function public.enforce_message_rate_limit() set search_path = '';
alter function public.bump_conversation_last_message() set search_path = '';
alter function public.server_now() set search_path = '';
alter function public.gen_token() set search_path = public, extensions;

-- ---------------------------------------------------------------------------
-- Note: `audit_events` and `moderation_actions` have RLS enabled with no
-- policies. That is deliberate — they are append-only, written only by the API
-- with the service role, and unreadable from the browser.
-- ---------------------------------------------------------------------------
