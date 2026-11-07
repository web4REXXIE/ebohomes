-- EboHomes 20261207_02 (Phase 11.9)  *** PROPOSED. NOT EXECUTED. ***
-- Atomic rental finalization. Replaces the body of eb_complete_rental (20261110_01) with a wrapper around eb_finalize_rental.
-- Needs 20261206_02 (accepted / not_selected), 20261206_05 (offer helpers), 20261207_01 (tenancies.offer_id).
-- RENTED RULE: signed terms AND a verified payment of type 'rent' (the old rule also accepted a verified deposit alone).
begin;

-- ===== A. Preflight =====
do $$
declare miss text;
begin
  if to_regprocedure('public.eb_offer_notify(uuid,text,text,text)') is null
     or to_regprocedure('public.eb_offer_event(uuid,text,text,text)') is null then
    raise exception 'STOPPED: run 20261206_05_rental_offers.sql first.';
  end if;
  if to_regclass('public.application_events') is null
     or not exists (select 1 from pg_constraint where conname = 'applications_status_lifecycle_check') then
    raise exception 'STOPPED: run 20261206_02_application_lifecycle.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'tenancies' and column_name = 'offer_id') then
    raise exception 'STOPPED: run 20261207_01_offer_tenancies.sql first.';
  end if;
  select string_agg(c, ', ') into miss from unnest(array['decision_note', 'decided_at', 'updated_at']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'applications' and column_name = c);
  if miss is not null then
    raise exception 'STOPPED: public.applications is missing column(s): %. Tell Claude.', miss;
  end if;
end $$;

-- ===== B. Failure queue =====
create table if not exists public.rental_finalization_failures (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null,
  error_message text not null,
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  last_error_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create unique index if not exists rental_finalization_one_open
  on public.rental_finalization_failures (tenancy_id) where resolved_at is null;

alter table public.rental_finalization_failures enable row level security;
revoke all on public.rental_finalization_failures from anon, authenticated;
grant select on public.rental_finalization_failures to authenticated;
drop policy if exists rental_finalization_select_staff on public.rental_finalization_failures;
create policy rental_finalization_select_staff on public.rental_finalization_failures for select to authenticated
  using (public.eb_is_admin());

-- ===== C. The atomic finalization =====
-- Returns false when the tenancy is not ready (no signed terms or no verified rent payment). Raises when something is inconsistent.
create or replace function public.eb_finalize_rental(p_tenancy uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
  l record;
  a record;
  r record;
  v_has_app boolean;
  v_new boolean := false;
  n int := 0;
begin
  select id, listing_id, application_id into t from public.tenancies where id = p_tenancy;
  if not found then return false; end if;

  -- Lock order everywhere: listing, then application, then tenancy.
  select * into l from public.listings where id = t.listing_id for update;
  select * into a from public.applications where id = t.application_id for update;
  v_has_app := found;
  select * into t from public.tenancies where id = p_tenancy for update;

  if not exists (select 1 from public.rental_terms x where x.tenancy_id = p_tenancy and x.status = 'signed') then
    return false;
  end if;
  if not exists (
    select 1 from public.payments p
     where p.tenancy_id = p_tenancy and p.status = 'confirmed' and p.verified_by is not null and p.type = 'rent'
  ) then
    return false;
  end if;

  -- Consistency checks. Any problem raises, which rolls back everything this function did.
  if t.status in ('ended', 'terminated', 'cancelled', 'expired', 'completed') then
    raise exception 'The tenancy is % so the property cannot be marked rented from it.', t.status;
  end if;
  if l.status is null or l.status not in ('approved', 'rented') then
    raise exception 'The listing status is %, so it cannot be marked rented.', coalesce(l.status, 'unknown');
  end if;
  if v_has_app and a.status not in ('approved', 'accepted') then
    raise exception 'The application status is %, expected approved.', a.status;
  end if;

  -- 1. Listing
  if l.status = 'approved' then
    update public.listings set status = 'rented' where id = l.id;
    v_new := true;
  end if;

  -- 2. Tenancy created from an offer becomes active
  update public.tenancies set status = 'active', reserved_until = null
   where id = p_tenancy and offer_id is not null and status in ('pending', 'awaiting_payment');

  -- 3. Winning application, 4. competing applications (trusted transition flag, reset below)
  perform set_config('eb.system_transition', '1', true);
  if v_has_app then
    if a.status = 'approved' then
      update public.applications set status = 'accepted', updated_at = now() where id = a.id;
      v_new := true;
    end if;
  end if;

  for r in
    with c as (
      update public.applications
         set status = 'not_selected',
             decision_note = 'Another applicant secured this property.',
             decided_at = now(),
             updated_at = now()
       where listing_id = t.listing_id
         and (not v_has_app or id <> a.id)
         and status in ('pending', 'info_requested', 'approved')
       returning id, tenant_id
    )
    select * from c
  loop
    n := n + 1;
    perform public.eb_offer_notify(r.tenant_id, 'This property was rented to another applicant',
      'Another applicant secured this property, so your application was not selected. This is not a rejection of you. Nothing was charged. You can apply for other properties.',
      '/journey/' || r.id);
  end loop;
  perform set_config('eb.system_transition', '', true);

  -- 5. Open offers of the competing applicants
  update public.rental_offers
     set status = 'withdrawn', response_note = 'Another applicant secured this property.', responded_at = now(), updated_at = now()
   where listing_id = t.listing_id
     and (not v_has_app or application_id <> a.id)
     and status in ('offered', 'countered');

  -- 6. Notices and audit, only when something actually changed (so a re-run is quiet)
  if v_new or n > 0 then
    perform public.eb_offer_notify(t.tenant_id, 'Your rental is confirmed',
      'EboHomes verified your payment and your tenancy is active. Your agreement, payments and receipts are on your journey page.',
      '/journey/' || t.application_id);
    perform public.eb_offer_notify(t.landlord_id, 'Your property is now rented',
      'The first rent payment was verified and your property is marked as rented.', '/dashboard/applications');
    if v_has_app then
      perform public.eb_offer_event(a.id, 'rental_finalized', 'system', 'tenancy ' || p_tenancy || '; competing applications resolved: ' || n);
    end if;
  end if;

  -- 7. Close any open failure for this tenancy
  update public.rental_finalization_failures
     set resolved_at = now(), resolved_by = auth.uid()
   where tenancy_id = p_tenancy and resolved_at is null;

  return true;
end;
$function$;
revoke all on function public.eb_finalize_rental(uuid) from public, anon, authenticated;

-- ===== D. Old entry point stays, same signature =====
create or replace function public.eb_complete_rental(p_tenancy uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $f$
begin
  return public.eb_finalize_rental(p_tenancy);
end;
$f$;
revoke all on function public.eb_complete_rental(uuid) from public, anon, authenticated;

-- ===== E. Payment trigger: a failure never undoes the payment, but it is now recorded and alerted =====
create or replace function public.eb_payment_verified_mark_rented()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $f$
declare v_err text;
begin
  if new.tenancy_id is not null then
    begin
      perform public.eb_finalize_rental(new.tenancy_id);
    exception when others then
      v_err := left(sqlerrm, 1000);
      begin
        insert into public.rental_finalization_failures (tenancy_id, error_message)
        values (new.tenancy_id, v_err)
        on conflict (tenancy_id) where resolved_at is null
        do update set error_message = excluded.error_message,
                      attempts = public.rental_finalization_failures.attempts + 1,
                      last_error_at = now();
        perform public.notify_admins('Rental could not be finalized',
          'A payment was verified but the property could not be marked rented. Open Rental Finalization to retry.',
          '/admin/finalization', 'application');
      exception when others then
        raise warning 'eb_payment_verified_mark_rented could not record the failure for tenancy %: %', new.tenancy_id, sqlerrm;
      end;
    end;
  end if;
  return new;
end;
$f$;
revoke all on function public.eb_payment_verified_mark_rented() from public, anon, authenticated;

-- ===== F. Staff retry (errors are shown to the admin, not swallowed) =====
create or replace function public.eb_admin_retry_finalization(p_tenancy uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can retry a rental finalization.' using errcode = '42501';
  end if;
  return public.eb_finalize_rental(p_tenancy);
end;
$function$;
revoke all on function public.eb_admin_retry_finalization(uuid) from public, anon;
grant execute on function public.eb_admin_retry_finalization(uuid) to authenticated;

commit;

-- CHECK (read only): expect 1 table, 4 functions, and the existing trigger.
select to_regclass('public.rental_finalization_failures') as failures_table;
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eb_finalize_rental', 'eb_complete_rental', 'eb_payment_verified_mark_rented', 'eb_admin_retry_finalization');
select tgname from pg_trigger where tgname = 'zz_payment_mark_rented' and not tgisinternal;

-- OPTIONAL, read only: tenancies that look ready but whose listing is not rented yet.
-- select t.id as tenancy_id, t.listing_id
--   from public.tenancies t join public.listings l on l.id = t.listing_id
--  where l.status = 'approved'
--    and exists (select 1 from public.rental_terms x where x.tenancy_id = t.id and x.status = 'signed')
--    and exists (select 1 from public.payments p where p.tenancy_id = t.id and p.status = 'confirmed' and p.verified_by is not null and p.type = 'rent');
-- To finalize one of them after you review it: select public.eb_finalize_rental('<tenancy id>');

-- ROLLBACK: put back the 20261110_01 versions of eb_complete_rental and eb_payment_verified_mark_rented (re-run that file),
-- then: drop function if exists public.eb_admin_retry_finalization(uuid); drop function if exists public.eb_finalize_rental(uuid);
-- Keep public.rental_finalization_failures if it has rows.
