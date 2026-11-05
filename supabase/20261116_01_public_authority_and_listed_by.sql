-- EboHomes 20261116_01: Phase 9.2 - public "Authority reviewed" indicator and the "Listed by" label.
-- WHAT:
--   (1) listing_authority_reviewed(listing): a yes/no for the public listing page. It says true only when
--       EboHomes has accepted the authority review. It never exposes pending, rejected or on-hold states.
--   (2) listed_by_role may now also be 'company_representative' (the old form only knew four values).
--   (3) When an authority review is ACCEPTED, listings.listed_by_role is set from the accepted claim, so
--       "Listed by" shows what EboHomes reviewed: owner, agent, manager, company representative or other.
-- DOES NOT: change any existing row. No backfill. Listings keep their current "Listed by" until they are accepted.
--           Tenancies, applications, holds and listing statuses are not touched.
-- REQUIRES: 20261114_01 and 20261115_01 already run.
-- STOPS SAFELY: if listed_by_role is not a plain text column, this raises an error and nothing is changed.
-- ROLLBACK: at the bottom.
begin;

-- 1. public yes/no
create or replace function public.listing_authority_reviewed(p_listing uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $f$ select coalesce((select l.authority_status = 'accepted' from public.listings l where l.id = p_listing), false) $f$;

revoke all on function public.listing_authority_reviewed(uuid) from public;
grant execute on function public.listing_authority_reviewed(uuid) to anon, authenticated;

-- 2. allow 'company_representative' (drop only CHECK constraints that mention listed_by_role)
do $do$
declare t text; c record;
begin
  select data_type into t from information_schema.columns
   where table_schema = 'public' and table_name = 'listings' and column_name = 'listed_by_role';
  if t is null then raise exception 'listings.listed_by_role does not exist.'; end if;
  if t not in ('text', 'character varying') then
    raise exception 'listings.listed_by_role is % (not text). Stop and ask before changing it.', t;
  end if;
  for c in select conname from pg_constraint
            where conrelid = 'public.listings'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%listed_by_role%'
  loop
    execute format('alter table public.listings drop constraint %I', c.conname);
  end loop;
end $do$;

alter table public.listings add constraint listings_listed_by_role_chk
  check (listed_by_role is null or listed_by_role in ('owner','agent','manager','company_representative','other'));

-- 3. copy the accepted role onto the listing, only at the moment of acceptance and only if it differs
create or replace function public.listings_sync_listed_by_role()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_role text;
begin
  if new.authority_status is distinct from 'accepted' or old.authority_status is not distinct from 'accepted' then return new; end if;
  select claimed_role into v_role from public.listing_authority_claims where listing_id = new.id;
  if v_role is not null and new.listed_by_role is distinct from v_role then new.listed_by_role := v_role; end if;
  return new;
end $f$;

revoke all on function public.listings_sync_listed_by_role() from public, anon, authenticated;

drop trigger if exists ad_listings_sync_listed_by_role on public.listings;
create trigger ad_listings_sync_listed_by_role before update of authority_status on public.listings
  for each row execute function public.listings_sync_listed_by_role();

commit;

-- CHECK (read only, run after the migration):
-- select
--  (select count(*) from pg_trigger where not tgisinternal and tgname = 'ad_listings_sync_listed_by_role') as trigger_should_be_1,
--  (select public.listing_authority_reviewed('00000000-0000-0000-0000-000000000000')) as unknown_listing_should_be_false,
--  (select count(*) from pg_constraint where conrelid = 'public.listings'::regclass and conname = 'listings_listed_by_role_chk') as constraint_should_be_1;

-- ROLLBACK (only if you must undo):
-- drop trigger if exists ad_listings_sync_listed_by_role on public.listings;
-- drop function if exists public.listings_sync_listed_by_role(), public.listing_authority_reviewed(uuid);
-- alter table public.listings drop constraint if exists listings_listed_by_role_chk;
