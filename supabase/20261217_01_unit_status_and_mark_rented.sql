-- EboHomes 20261217_01: Step 3. Unit status kept in step with the listing, and an owner "It's rented" action.
-- WHY: a landlord who rents a flat off-platform had no way to say so except pause or delete. Tenants could still
--      apply or pay for it. Also units.status was never updated after it was first created.
-- WHAT: (1) eb_unit_status_for + sync triggers, so units.status follows listings.status and tenancies.
--       (2) mark_listing_rented(listing): owner only, refused while a reservation, tenancy or payment is in progress.
--           It withdraws open applications and offers and tells the applicants.
-- DOES NOT: touch payments, handover, payouts, verification, or the two freshness functions.
-- NOTE: status changes are already audited by the existing trigger zz_listings_status_audit.
-- ROLLBACK: bottom of file. Safe to re-run.

begin;

do $$
begin
  if to_regclass('public.listings') is null or to_regclass('public.units') is null
     or to_regclass('public.applications') is null or to_regclass('public.tenancies') is null
     or to_regclass('public.payments') is null or to_regclass('public.payment_submissions') is null
     or to_regclass('public.rental_offers') is null then
    raise exception 'STOPPED: a required table is missing. Tell Claude which one.';
  end if;
  if to_regprocedure('public.eb_offer_notify(uuid,text,text,text)') is null
     or to_regprocedure('public.eb_offer_event(uuid,text,text,text)') is null then
    raise exception 'STOPPED: the offer helper functions are missing. Tell Claude.';
  end if;
end $$;

-- 1. What a unit's status should be, worked out from the listing and its tenancies.
create or replace function public.eb_unit_status_for(p_listing uuid)
returns text language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select case
    when l.status = 'rented' then 'rented'
    when l.status = 'approved' and exists (
      select 1 from public.tenancies t where t.listing_id = l.id and t.status = 'active'
    ) then 'rented'
    when l.status = 'approved' and exists (
      select 1 from public.tenancies t where t.listing_id = l.id and t.status in ('pending', 'awaiting_payment')
    ) then 'reserved'
    when l.status = 'approved' then 'available'
    else 'off_market'
  end
  from public.listings l where l.id = p_listing
$f$;
revoke all on function public.eb_unit_status_for(uuid) from public, anon, authenticated;

create or replace function public.eb_sync_unit_status(p_listing uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v text;
begin
  if p_listing is null then return; end if;
  v := public.eb_unit_status_for(p_listing);
  if v is null then return; end if;
  update public.units set status = v where listing_id = p_listing and status is distinct from v;
exception when others then
  null;  -- keeping the unit label in step must never block a rental step
end $f$;
revoke all on function public.eb_sync_unit_status(uuid) from public, anon, authenticated;

-- 2. Triggers (fail open)
create or replace function public.eb_listings_unit_sync()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.status is distinct from old.status then
    perform public.eb_sync_unit_status(new.id);
  end if;
  return new;
end $f$;
drop trigger if exists zz_listings_unit_sync on public.listings;
create trigger zz_listings_unit_sync
  after update of status on public.listings
  for each row execute function public.eb_listings_unit_sync();

create or replace function public.eb_tenancies_unit_sync()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if tg_op = 'INSERT' then
    perform public.eb_sync_unit_status(new.listing_id);
  elsif new.status is distinct from old.status or new.listing_id is distinct from old.listing_id then
    perform public.eb_sync_unit_status(new.listing_id);
    if old.listing_id is distinct from new.listing_id then
      perform public.eb_sync_unit_status(old.listing_id);
    end if;
  end if;
  return new;
exception when others then
  return new;
end $f$;
drop trigger if exists zz_tenancies_unit_sync on public.tenancies;
create trigger zz_tenancies_unit_sync
  after insert or update of status, listing_id on public.tenancies
  for each row execute function public.eb_tenancies_unit_sync();

-- 3. One-time catch-up for existing units
update public.units u
   set status = public.eb_unit_status_for(u.listing_id)
 where u.listing_id is not null
   and public.eb_unit_status_for(u.listing_id) is not null
   and u.status is distinct from public.eb_unit_status_for(u.listing_id);

-- 4. "It's rented": the owner says the property is no longer available
create or replace function public.mark_listing_rented(p_listing uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_uid uuid := auth.uid();
  l record;
  r record;
  n int := 0;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;

  select id, landlord_id, status, title into l from public.listings where id = p_listing for update;
  if not found or l.landlord_id is distinct from v_uid then
    raise exception 'This is not your listing' using errcode = '42501';
  end if;
  if l.status = 'rented' then
    return jsonb_build_object('status', 'rented', 'applicants_notified', 0, 'already', true);
  end if;
  if l.status not in ('approved', 'paused') then
    raise exception 'This listing is not live, so it cannot be marked rented' using errcode = '22023';
  end if;

  -- Protection: never while someone may have paid, or is about to.
  if exists (select 1 from public.tenancies t
              where t.listing_id = l.id and t.status in ('pending', 'awaiting_payment', 'active')) then
    raise exception 'A reservation or tenancy is in progress for this property. Contact EboHomes so nobody loses money' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments p join public.tenancies t on t.id = p.tenancy_id
              where t.listing_id = l.id and p.status in ('pending', 'recorded')) then
    raise exception 'A payment for this property is being checked. Contact EboHomes' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_submissions s join public.tenancies t on t.id = s.tenancy_id
              where t.listing_id = l.id and s.status in ('submitted', 'under_review', 'needs_info')) then
    raise exception 'A payment for this property is being checked. Contact EboHomes' using errcode = '22023';
  end if;

  -- Open applications are closed and the applicants told (same pattern as eb_finalize_rental)
  perform set_config('eb.system_transition', '1', true);
  for r in
    with c as (
      update public.applications
         set status = 'not_selected',
             decision_note = 'The landlord marked this property as rented.',
             decided_at = now(),
             updated_at = now()
       where listing_id = l.id and status in ('pending', 'info_requested', 'approved')
       returning id, tenant_id
    )
    select * from c
  loop
    n := n + 1;
    perform public.eb_offer_notify(r.tenant_id, 'This property is no longer available',
      'The landlord marked this property as rented, so your application was not selected. This is not a rejection of you. Nothing was charged. You can apply for other properties.',
      '/journey/' || r.id);
    begin
      perform public.eb_offer_event(r.id, 'listing_marked_rented', 'landlord', 'Owner marked the property as rented');
    exception when others then null;
    end;
  end loop;
  perform set_config('eb.system_transition', '', true);

  update public.rental_offers
     set status = 'withdrawn', response_note = 'The landlord marked this property as rented.', responded_at = now(), updated_at = now()
   where listing_id = l.id and status in ('offered', 'countered');

  update public.listings set status = 'rented' where id = l.id;   -- audit and unit sync triggers follow

  begin
    perform public.audit_write('listing_marked_rented_by_owner', 'listing', l.id,
      jsonb_build_object('status', l.status), jsonb_build_object('status', 'rented'), 'applicants notified: ' || n);
  exception when others then null;
  end;

  return jsonb_build_object('status', 'rented', 'applicants_notified', n);
end $f$;

revoke all on function public.mark_listing_rented(uuid) from public, anon;
grant execute on function public.mark_listing_rented(uuid) to authenticated;

commit;

-- CHECK (run after): all three should return rows.
-- select proname from pg_proc where proname in ('mark_listing_rented','eb_unit_status_for','eb_sync_unit_status');
-- select tgname from pg_trigger where tgname in ('zz_listings_unit_sync','zz_tenancies_unit_sync') and not tgisinternal;

-- ROLLBACK
-- drop trigger if exists zz_listings_unit_sync on public.listings;
-- drop trigger if exists zz_tenancies_unit_sync on public.tenancies;
-- drop function if exists public.mark_listing_rented(uuid), public.eb_listings_unit_sync(), public.eb_tenancies_unit_sync(),
--   public.eb_sync_unit_status(uuid), public.eb_unit_status_for(uuid);
