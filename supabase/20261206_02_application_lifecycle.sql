-- EboHomes 20261206_02 (Phase 11.4)  *** PROPOSED. NOT EXECUTED. Run after 20261206_00 review. Independent of 20261206_01. ***
-- WHY: statuses are not constrained in the repo, transitions are only enforced per actor (tenant/landlord) and an admin
--      direct UPDATE can set any status. There is no record of who changed a status, when and why.
-- WHAT IT DOES
--   A. Preflight: STOPS if any application has a status outside the lifecycle below.
--   B. One CHECK on applications.status:
--        pending, info_requested, approved, rejected, withdrawn   (existing)
--        accepted, not_selected                                    (new, SYSTEM-ONLY; nothing writes them until Phase 11.9)
--      Any existing CHECK that mentions status is dropped first; the dropped names are printed as NOTICEs.
--   C. public.application_events: append-only audit of every submission and status change (who, role, from, to, note, when).
--      Written by a trigger, so it also catches admin direct updates and every existing function. Readable by EboHomes staff only.
--   D. a40_application_transition_guard (BEFORE UPDATE OF status): allowed transitions for EVERY signed-in actor, admin included.
--        pending        -> info_requested | approved | rejected | withdrawn | not_selected
--        info_requested -> pending | rejected | withdrawn | not_selected
--        approved       -> withdrawn | accepted | not_selected | pending (admin reopen only, never if a tenancy exists)
--        rejected       -> pending (admin reopen only)
--        not_selected   -> pending (admin reopen only)
--        withdrawn, accepted -> no further change
--      accepted and not_selected can only be set by trusted database functions (transaction flag eb.system_transition).
--      Inserts and updates with no signed-in user (SQL editor, service role) are not blocked, same convention as the other guards.
--   E. eb_admin_override_application(application, new_status, reason): the audited admin correction path.
--      Admin only, reason of 10+ characters, refused when a tenancy exists for the application. Targets: pending, rejected, not_selected.
-- DOES NOT: change enforce_application_rules, admin_decide_application, admin_review_legacy_decision, any policy or any data.
--           Existing reopen (approved/rejected -> pending by admin) keeps working.
-- APP IMPACT: none until 11.9. lib/application-status.ts is updated in this phase so the new values display correctly.
-- ROLLBACK: at the bottom.

begin;

-- ===== A. Preflight =====
do $$
declare n int;
begin
  select count(*) into n from public.applications
   where status is null or status not in ('pending','info_requested','approved','rejected','withdrawn','accepted','not_selected');
  if n > 0 then
    raise exception 'STOPPED: % applications have a status outside the lifecycle (see R9). Resolve them first.', n;
  end if;
end $$;

-- ===== B. Status constraint =====
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.applications'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ~* '\mstatus\M'
  loop
    raise notice 'Dropping existing status check: %', c.conname;
    execute format('alter table public.applications drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.applications
  add constraint applications_status_lifecycle_check
  check (status in ('pending','info_requested','approved','rejected','withdrawn','accepted','not_selected'));

-- ===== C. Audit events =====
-- No foreign key on purpose: the audit record must survive even if an application row is ever removed.
create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  event text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  actor_role text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists application_events_application_idx on public.application_events (application_id, created_at);

alter table public.application_events enable row level security;
revoke all on public.application_events from anon, authenticated;
grant select on public.application_events to authenticated;
drop policy if exists application_events_select_staff on public.application_events;
create policy application_events_select_staff on public.application_events for select to authenticated
  using (public.eb_is_admin());

create or replace function public.eb_log_application_event()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_note text;
begin
  v_role := case
    when v_uid is null then 'system'
    when coalesce(public.eb_is_admin(), false) then 'admin'
    when v_uid = new.tenant_id then 'tenant'
    when v_uid = new.landlord_id then 'landlord'
    else 'other' end;

  if tg_op = 'INSERT' then
    insert into public.application_events (application_id, event, from_status, to_status, actor_id, actor_role)
    values (new.id, 'submitted', null, new.status, v_uid, v_role);
    return new;
  end if;

  v_note := case new.status
    when 'approved' then new.decision_note
    when 'rejected' then new.decision_note
    when 'not_selected' then new.decision_note
    when 'info_requested' then new.info_request
    else null end;
  insert into public.application_events (application_id, event, from_status, to_status, actor_id, actor_role, note)
  values (new.id, 'status_changed', old.status, new.status, v_uid, v_role, v_note);
  return new;
end;
$function$;
revoke all on function public.eb_log_application_event() from public, anon, authenticated;

drop trigger if exists zz_log_application_insert on public.applications;
create trigger zz_log_application_insert
  after insert on public.applications
  for each row execute function public.eb_log_application_event();

drop trigger if exists zz_log_application_status on public.applications;
create trigger zz_log_application_status
  after update of status on public.applications
  for each row when (old.status is distinct from new.status)
  execute function public.eb_log_application_event();

-- ===== D. Transition guard =====
create or replace function public.eb_application_transition_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_system boolean := coalesce(current_setting('eb.system_transition', true), '') = '1';
  v_ok boolean := false;
  v_reopen boolean := false;
begin
  if v_uid is null or v_system then
    return new;
  end if;

  if new.status in ('accepted', 'not_selected') then
    raise exception 'The status "%" is set by EboHomes system rules only.', new.status using errcode = '42501';
  end if;

  v_reopen := new.status = 'pending' and old.status in ('approved', 'rejected', 'not_selected');

  v_ok := case old.status
    when 'pending'        then new.status in ('info_requested', 'approved', 'rejected', 'withdrawn')
    when 'info_requested' then new.status in ('pending', 'rejected', 'withdrawn')
    when 'approved'       then new.status in ('withdrawn', 'pending')
    when 'rejected'       then new.status = 'pending'
    when 'not_selected'   then new.status = 'pending'
    else false end;

  if not v_ok then
    raise exception 'Invalid application status change: % to %.', old.status, new.status using errcode = '22023';
  end if;

  if v_reopen then
    if not coalesce(public.eb_is_admin(), false) then
      raise exception 'Only EboHomes staff can reopen an application.' using errcode = '42501';
    end if;
    if exists (select 1 from public.tenancies t where t.application_id = old.id) then
      raise exception 'A tenancy already exists for this application, so it cannot be reopened.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$function$;
revoke all on function public.eb_application_transition_guard() from public, anon, authenticated;

drop trigger if exists a40_application_transition_guard on public.applications;
create trigger a40_application_transition_guard
  before update of status on public.applications
  for each row when (old.status is distinct from new.status)
  execute function public.eb_application_transition_guard();

-- ===== E. Audited admin correction =====
create or replace function public.eb_admin_override_application(p_application uuid, p_new_status text, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can correct an application.' using errcode = '42501';
  end if;
  if p_new_status is null or p_new_status not in ('pending', 'rejected', 'not_selected') then
    raise exception 'A correction can set pending, rejected or not_selected only.' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'Write a clear reason (at least 10 characters).' using errcode = '22023';
  end if;

  -- Same lock order as admin_decide_application: listing first, then the application.
  select listing_id into a from public.applications where id = p_application;
  if not found then raise exception 'Application not found.' using errcode = 'P0002'; end if;
  perform 1 from public.listings where id = a.listing_id for update;
  select * into a from public.applications where id = p_application for update;

  if a.status = p_new_status then return; end if;
  if a.status in ('withdrawn') then
    raise exception 'A withdrawn application cannot be changed. The tenant can apply again.' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t where t.application_id = a.id) then
    raise exception 'A tenancy exists for this application. Use the tenancy process instead.' using errcode = '22023';
  end if;

  perform set_config('eb.system_transition', '1', true);
  update public.applications
     set status = p_new_status,
         decision_note = case when p_new_status = 'pending' then null else v_reason end,
         decided_by = case when p_new_status = 'pending' then null else auth.uid() end,
         decided_at = case when p_new_status = 'pending' then null else now() end,
         updated_at = now()
   where id = p_application;
  perform set_config('eb.system_transition', '', true);

  insert into public.application_events (application_id, event, from_status, to_status, actor_id, actor_role, note)
  values (a.id, 'admin_override', a.status, p_new_status, auth.uid(), 'admin', v_reason);
end;
$function$;
revoke all on function public.eb_admin_override_application(uuid, text, text) from public, anon;
grant execute on function public.eb_admin_override_application(uuid, text, text) to authenticated;

commit;

-- CHECK (read only): expect 1 constraint, 1 table, 3 triggers, 2 functions.
select conname from pg_constraint where conrelid = 'public.applications'::regclass and conname = 'applications_status_lifecycle_check';
select to_regclass('public.application_events') as events_table;
select tgname from pg_trigger where tgrelid = 'public.applications'::regclass and not tgisinternal
  and tgname in ('a40_application_transition_guard', 'zz_log_application_insert', 'zz_log_application_status');
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eb_application_transition_guard', 'eb_admin_override_application');

-- ROLLBACK (only if needed). The old status check is NOT restored automatically: use the names printed as NOTICEs,
-- or the definition saved from R1 'constraints'.
-- drop trigger if exists a40_application_transition_guard on public.applications;
-- drop trigger if exists zz_log_application_status on public.applications;
-- drop trigger if exists zz_log_application_insert on public.applications;
-- drop function if exists public.eb_application_transition_guard();
-- drop function if exists public.eb_log_application_event();
-- drop function if exists public.eb_admin_override_application(uuid, text, text);
-- alter table public.applications drop constraint if exists applications_status_lifecycle_check;
-- (keep public.application_events; it is the audit history)
