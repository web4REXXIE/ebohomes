-- EboHomes 20261109_01  *** PROPOSED. NOT EXECUTED. DO NOT RUN BEFORE THE READ-ONLY CHECKS BELOW. ***
-- STAGE 2: (A) waiting-list answer for tenants, (B) stop marking a property 'rented' when the agreement is signed,
--          (C) mark it 'rented' only when terms are signed AND a payment is verified AND the key handover is completed.
-- CONFIRMED FROM LIVE QUERIES: trigger z_eb_terms_mark_rented IS installed on rental_terms (it marks rented at signing);
--   a_eb_terms_conflict_guard and a_eb_tenancy_guard are installed; tenancies.status defaults to 'active';
--   tenancies_one_active_per_listing exists; listings has no status CHECK constraint (rented is allowed).
-- NOT CONFIRMED (REQUIRES SCHEMA CONFIRMATION before running):
--   1. listings_guard() and listings_reedit_guard() are installed on listings but their code is not in this repo. Part C changes
--      listings.status from a trigger while a TENANT or LANDLORD (not an admin) is signed in. If either guard blocks that, handover
--      confirmation would fail. Run read-only check R1 and send me the result.
--   2. Existing 'rented' listings are NOT changed by this file. Run R2 to see which ones have no completed handover.
-- READ-ONLY CHECKS (run one at a time, change nothing):
--   R1: select proname, pg_get_functiondef(oid) from pg_proc where proname in ('listings_guard','listings_reedit_guard','tenancies_guard');
--   R2: select l.id, l.title from public.listings l where l.status = 'rented' and not exists (
--         select 1 from public.tenancies t join public.tenancy_handovers h on h.tenancy_id = t.id and h.status = 'completed' where t.listing_id = l.id);
-- PREREQUISITES: 20261024_02, 20261030_01, 20261031_01, 20261105_01 are installed (they are, per the live trigger checks and handover tables).
-- BEHAVIOUR CHANGE: after this runs, a signed agreement leaves the listing 'approved' (still public). The conflict guard still stops a
--   second tenancy for the property once one has accepted or signed terms, so the property cannot be double-let.
begin;

-- A. Waiting list. Returns ONLY true/false for the caller's own approved application. Never returns another person's data.
create or replace function public.eb_my_application_waiting(p_application uuid)
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare a record;
begin
  if auth.uid() is null then return false; end if;
  select id, tenant_id, listing_id, status into a from public.applications where id = p_application;
  if not found or a.tenant_id is distinct from auth.uid() or a.status <> 'approved' then return false; end if;
  if exists (select 1 from public.tenancies where application_id = a.id) then return false; end if;
  return exists (
    select 1 from public.tenancies o
    where o.listing_id = a.listing_id and o.application_id <> a.id
      and (o.status = 'active'
           or exists (select 1 from public.rental_terms r where r.tenancy_id = o.id and r.status in ('accepted','signed')))
  );
end;
$f$;
revoke all on function public.eb_my_application_waiting(uuid) from public, anon;
grant execute on function public.eb_my_application_waiting(uuid) to authenticated;

-- B. Signing the agreement no longer marks the property rented. It still refuses to sign for a property that is not open.
create or replace function public.eb_terms_mark_rented()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare t record; v_status text;
begin
  select listing_id into t from public.tenancies where id = new.tenancy_id;
  if not found then return new; end if;
  select status into v_status from public.listings where id = t.listing_id for update;
  if v_status is null then raise exception 'The property for this tenancy was not found.'; end if;
  if v_status not in ('approved','rented') then
    raise exception 'The property is not open (listing status: %). Resolve that before recording the signed agreement.', v_status;
  end if;
  return new; -- 'rented' is set later by eb_complete_rental, after verified payment and confirmed handover
end;
$f$;

-- C. The only place that marks a listing rented. Re-checks all three records itself, so calling it early does nothing.
create or replace function public.eb_complete_rental(p_tenancy uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare t record;
begin
  select id, listing_id into t from public.tenancies where id = p_tenancy;
  if not found then return false; end if;
  perform 1 from public.listings where id = t.listing_id for update;
  if not exists (select 1 from public.rental_terms where tenancy_id = p_tenancy and status = 'signed') then return false; end if;
  if not exists (select 1 from public.payment_submissions where tenancy_id = p_tenancy and status = 'verified') then return false; end if;
  if not exists (select 1 from public.payments where tenancy_id = p_tenancy and status = 'confirmed' and verified_by is not null) then return false; end if;
  if not exists (select 1 from public.tenancy_handovers where tenancy_id = p_tenancy and status = 'completed') then return false; end if;
  update public.listings set status = 'rented' where id = t.listing_id and status = 'approved';
  return true;
end;
$f$;
revoke all on function public.eb_complete_rental(uuid) from public, anon, authenticated;

create or replace function public.eb_handover_completed_mark_rented()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  perform public.eb_complete_rental(new.tenancy_id);
  return new;
end;
$f$;
drop trigger if exists zz_handover_mark_rented on public.tenancy_handovers;
create trigger zz_handover_mark_rented after insert or update of status on public.tenancy_handovers
  for each row when (new.status = 'completed') execute function public.eb_handover_completed_mark_rented();

commit;

-- CHECK (read only): expect 1 row.
select tgname from pg_trigger where tgname = 'zz_handover_mark_rented' and not tgisinternal;

-- ROLLBACK (restores the CURRENT live behaviour: rented at signing):
-- drop trigger if exists zz_handover_mark_rented on public.tenancy_handovers;
-- drop function if exists public.eb_handover_completed_mark_rented(), public.eb_complete_rental(uuid), public.eb_my_application_waiting(uuid);
-- then re-run the function eb_terms_mark_rented() from supabase/20261024_02_rent_on_signed_terms.sql (section D).
