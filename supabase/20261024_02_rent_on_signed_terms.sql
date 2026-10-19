-- EboHomes 20261024_02: a property becomes 'rented' only when the signed agreement is recorded.
-- WHAT:
--   A. handle_tenancy_created() no longer marks the listing rented (it becomes a harmless no-op; the trigger stays,
--      so its name is not needed).
--   B. Tenancy guard v2 (replaces 20261023_01 step 2). Same rules, plus: no new tenancy while ANOTHER tenancy on the
--      same property is active or has accepted/signed terms. If 20261023_01 was never run, this file replaces it.
--   C. rental_terms BEFORE UPDATE guard: terms cannot become accepted/signed if another tenancy on the same property
--      already is. The listing row is locked first, so two people cannot both win.
--   D. rental_terms AFTER UPDATE: when terms become 'signed' (EboHomes records the signed agreement), the listing is
--      set to 'rented'.
-- DOES NOT: change existing data. Listings already 'rented' stay rented (see read-only Q6 for the legacy list).
-- PREREQUISITES: 20261024_00 Q1, Q2, Q3, Q4 reviewed. Specifically:
--   * 'rented' must be allowed by the listings status check (Q3). It should be, because the old trigger sets it.
--   * Q1: confirm the default tenancy status and whether index tenancies_one_active_per_listing exists.
-- RISKS: signing is blocked if the listing is not 'approved' or 'rented' (for example paused); admin sees the message.
--   Legacy tenancies that are 'active' on a listing block new tenancies on that listing (intended).
-- DECISION TO CONFIRM: "formally accepted" is implemented as SIGNED (record_signed_agreement), not merely both-accepted.
-- ROLLBACK: at the bottom.

begin;

-- A
create or replace function public.handle_tenancy_created()
 returns trigger language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Intentionally does nothing. A property is marked rented when the signed agreement is recorded
  -- (see eb_terms_mark_rented). Creating a tenancy record alone must not take a property off the market.
  return new;
end;
$function$;

-- B
create or replace function public.eb_tenancy_guard()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_listing_status text;
  v_listing_landlord uuid;
begin
  if auth.uid() is null then return new; end if;

  select * into a from public.applications where id = new.application_id;
  if not found then raise exception 'A tenancy can only be created from an approved application.'; end if;
  if a.status <> 'approved' then raise exception 'The application must be approved by EboHomes first (current: %).', a.status; end if;
  if a.tenant_interest_at is null then raise exception 'The tenant has not confirmed they want to proceed yet.'; end if;
  if a.tenant_id is distinct from new.tenant_id or a.listing_id is distinct from new.listing_id then
    raise exception 'This tenancy does not match the application.';
  end if;

  select status, landlord_id into v_listing_status, v_listing_landlord
    from public.listings where id = new.listing_id for update;
  if v_listing_status is distinct from 'approved' then
    raise exception 'This property is not open for new tenants (listing status: %).', coalesce(v_listing_status, 'unknown');
  end if;
  if v_listing_landlord is distinct from new.landlord_id then
    raise exception 'The landlord on this tenancy does not own the property.';
  end if;

  if exists (
    select 1 from public.tenancies t
    where t.listing_id = new.listing_id
      and (t.status = 'active'
           or exists (select 1 from public.rental_terms r where r.tenancy_id = t.id and r.status in ('accepted', 'signed')))
  ) then
    raise exception 'Another tenancy for this property is already agreed or active. Contact EboHomes.';
  end if;

  return new;
end;
$function$;

drop trigger if exists a_eb_tenancy_guard on public.tenancies;
create trigger a_eb_tenancy_guard
  before insert on public.tenancies
  for each row execute function public.eb_tenancy_guard();

-- C
create or replace function public.eb_terms_conflict_guard()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare t record;
begin
  select id, listing_id into t from public.tenancies where id = new.tenancy_id;
  if not found then return new; end if;
  perform 1 from public.listings where id = t.listing_id for update;
  if exists (
    select 1 from public.tenancies o
    where o.listing_id = t.listing_id and o.id <> t.id
      and (o.status = 'active'
           or exists (select 1 from public.rental_terms r where r.tenancy_id = o.id and r.status in ('accepted', 'signed')))
  ) then
    raise exception 'Another tenancy for this property has already agreed terms. Contact EboHomes.';
  end if;
  return new;
end;
$function$;

drop trigger if exists a_eb_terms_conflict_guard on public.rental_terms;
create trigger a_eb_terms_conflict_guard
  before update of status on public.rental_terms
  for each row
  when (new.status in ('accepted', 'signed') and old.status is distinct from new.status)
  execute function public.eb_terms_conflict_guard();

-- D
create or replace function public.eb_terms_mark_rented()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare t record; v_status text;
begin
  select listing_id into t from public.tenancies where id = new.tenancy_id;
  if not found then return new; end if;
  select status into v_status from public.listings where id = t.listing_id for update;
  if v_status is null then raise exception 'The property for this tenancy was not found.'; end if;
  if v_status not in ('approved', 'rented') then
    raise exception 'The property is not open (listing status: %). Resolve that before recording the signed agreement.', v_status;
  end if;
  if v_status <> 'rented' then
    update public.listings set status = 'rented' where id = t.listing_id;
  end if;
  return new;
end;
$function$;

drop trigger if exists z_eb_terms_mark_rented on public.rental_terms;
create trigger z_eb_terms_mark_rented
  after update of status on public.rental_terms
  for each row
  when (new.status = 'signed' and old.status is distinct from new.status)
  execute function public.eb_terms_mark_rented();

commit;

-- CHECK (read only): expect 3 rows.
select tgname from pg_trigger
where tgname in ('a_eb_tenancy_guard', 'a_eb_terms_conflict_guard', 'z_eb_terms_mark_rented') and not tgisinternal;

-- ROLLBACK (only if needed; restores the OLD behaviour of renting at tenancy creation. Compare with Q4 first):
-- drop trigger if exists z_eb_terms_mark_rented on public.rental_terms;
-- drop trigger if exists a_eb_terms_conflict_guard on public.rental_terms;
-- drop function if exists public.eb_terms_mark_rented();
-- drop function if exists public.eb_terms_conflict_guard();
-- create or replace function public.handle_tenancy_created() returns trigger language plpgsql
--   set search_path to 'public', 'pg_temp'
--   as $f$ begin update public.listings set status = 'rented' where id = new.listing_id; return new; end; $f$;