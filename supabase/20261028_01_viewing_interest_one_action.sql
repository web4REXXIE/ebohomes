-- EboHomes 20261028_01: ONE tenant action after a completed viewing.
-- "I'm interested" now records the viewing decision AND the intention to proceed on the application, when eligible.
-- It does NOT approve the application, create a tenancy, reserve the property or touch payments.
-- No new tables. Replaces ONE function, adds ONE small trigger. No data is changed by running this file.
--
-- STEP 0 (read-only, run first, nothing changes). Paste me the results if anything looks different from this file:
--   select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.applications'::regclass and not tgisinternal;
--   select proname, position('tenant_interest_at' in pg_get_functiondef(oid)) > 0 as mentions_interest
--     from pg_proc where pronamespace = 'public'::regnamespace
--      and proname in ('enforce_application_rules', 'tenant_viewing_decision', 'notify_admins', 'eb_log_viewing_event');
--
-- ROLLBACK: drop trigger if exists a30_carry_viewing_interest on public.applications;
--           drop function if exists public.eb_carry_viewing_interest();
--           then re-run section 11 of 20261022_01_viewing_workflow.sql to restore the old tenant_viewing_decision.

begin;

-- Safety: stop (changing nothing) if something this file relies on is missing.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'viewings' and column_name = 'tenant_decision_at') then
    raise exception 'viewings.tenant_decision_at is missing. Apply 20261022_01_viewing_workflow.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'applications' and column_name = 'tenant_interest_at') then
    raise exception 'applications.tenant_interest_at is missing.';
  end if;
  if not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'notify_admins')
     or not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'eb_log_viewing_event') then
    raise exception 'notify_admins or eb_log_viewing_event is missing.';
  end if;
end $$;

-- 1. The tenant's one action. Same name and arguments as before, so the app keeps working.
create or replace function public.tenant_viewing_decision(p_viewing uuid, p_interested boolean)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v record; a record;
  v_has_app boolean := false;
  v_proceed boolean := false;
  v_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;

  -- Lock the viewing first, then the application, so two taps (or an admin decision at the same moment) cannot conflict.
  select * into v from public.viewings where id = p_viewing for update;
  if not found or v.tenant_id <> auth.uid() then raise exception 'Viewing not found'; end if;
  if v.status <> 'completed' then raise exception 'You can decide once the viewing has been completed'; end if;
  if v.tenant_decision is not null then raise exception 'You have already recorded your decision'; end if;

  select * into a from public.applications where id = v.application_id for update;
  v_has_app := found;
  if v_has_app and a.status in ('withdrawn', 'rejected') then
    raise exception 'This application is closed, so a decision cannot be recorded';
  end if;

  -- Cannot say "not interested" after already confirming on the application: that would leave two conflicting answers.
  if not p_interested and v_has_app and a.tenant_interest_at is not null then
    raise exception 'You already told EboHomes you want to proceed with this application. To change your mind, contact EboHomes.';
  end if;

  -- Eligible = approved and not confirmed yet. Only tenant_interest_at changes; the existing application rules
  -- (enforce_application_rules) still decide whether the tenant may make that change.
  if p_interested and v_has_app and a.status = 'approved' and a.tenant_interest_at is null then
    update public.applications set tenant_interest_at = now(), updated_at = now() where id = a.id;
    v_proceed := true;
  end if;

  update public.viewings
     set tenant_decision = case when p_interested then 'interested' else 'not_interested' end,
         tenant_decision_at = now(), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;

  perform public.eb_log_viewing_event(p_viewing,
    case when p_interested then 'tenant_interested' else 'tenant_declined' end, v.status, v.status,
    case when not p_interested then null
         when v_proceed then 'Intention to proceed recorded on the application.'
         when v_has_app and a.tenant_interest_at is not null then 'Application already marked as wanting to proceed.'
         else 'Application is not approved yet. The intention to proceed is applied when EboHomes approves it.' end);

  select coalesce(nullif(trim(title), ''), 'a property') into v_title from public.listings where id = v.listing_id;
  if p_interested then
    perform public.notify_admins('Tenant wants to proceed',
      concat('The applicant for "', coalesce(v_title, 'a property'), '" viewed the property and wants to proceed. ',
        case when v_has_app and a.status = 'approved'
             then 'The application is already approved, so the landlord can now set up the tenancy.'
             else 'Review the application: approve it, ask a question or decline.' end),
      '/admin/applications', 'application');
  else
    perform public.notify_admins('Tenant no longer interested',
      concat('A tenant who viewed "', coalesce(v_title, 'a property'), '" is no longer interested.'),
      '/admin/viewings', 'application');
  end if;
end;
$$;

revoke all on function public.tenant_viewing_decision(uuid, boolean) from public, anon;
grant execute on function public.tenant_viewing_decision(uuid, boolean) to authenticated;

-- 2. If the tenant said "interested" BEFORE EboHomes approved the application, carry it over at the moment of approval,
--    using the time the tenant tapped. Only runs when the status becomes 'approved' and no interest is recorded yet.
--    It does not approve anything itself.
create or replace function public.eb_carry_viewing_interest()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v_at timestamptz;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' and new.tenant_interest_at is null then
    select max(tenant_decision_at) into v_at from public.viewings
     where application_id = new.id and status = 'completed' and tenant_decision = 'interested';
    if v_at is not null then new.tenant_interest_at := v_at; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.eb_carry_viewing_interest() from public, anon, authenticated;

drop trigger if exists a30_carry_viewing_interest on public.applications;
create trigger a30_carry_viewing_interest
  before update on public.applications
  for each row execute function public.eb_carry_viewing_interest();

commit;

-- CHECK (read-only): both must return a row.
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname = 'eb_carry_viewing_interest';
select tgname from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'a30_carry_viewing_interest';

-- OPTIONAL read-only list: tenants who already tapped "interested" on an APPROVED application but have no confirmation.
-- They are NOT changed by this file; their viewing page tells them to confirm once on My Applications.
select v.id as viewing_id, v.application_id, a.status, a.tenant_interest_at
from public.viewings v join public.applications a on a.id = v.application_id
where v.tenant_decision = 'interested' and a.status = 'approved' and a.tenant_interest_at is null;