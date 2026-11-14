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
