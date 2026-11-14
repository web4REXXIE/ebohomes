-- EboHomes 20261217_04: lets search hide flats that another tenant is completing a reservation for.
-- WHY: the database already refuses applications and payments on a reserved property, but search still listed it,
--      so tenants opened it, tapped Apply, and only then learned it was taken.
-- WHAT: reserved_listing_ids() returns the ids of approved listings that have a tenancy in 'pending' or 'awaiting_payment'.
--       Ids only: no names, no dates, no counts. Same idea as listing_reserved (20261217_02) for many listings at once.
-- DOES NOT: change any table, trigger or existing function. Safe to re-run. If it is missing, search still works as before.
-- ROLLBACK: bottom of file.

begin;

create or replace function public.reserved_listing_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select distinct t.listing_id
    from public.tenancies t
    join public.listings l on l.id = t.listing_id
   where l.status = 'approved'
     and t.status in ('pending', 'awaiting_payment');
$f$;
revoke all on function public.reserved_listing_ids() from public;
grant execute on function public.reserved_listing_ids() to anon, authenticated;

commit;

-- CHECK (read only): returns zero or more ids, no error.
select * from public.reserved_listing_ids();

-- ROLLBACK
-- drop function if exists public.reserved_listing_ids();
