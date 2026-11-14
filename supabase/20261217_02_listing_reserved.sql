begin;

create or replace function public.listing_reserved(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select exists (
    select 1
      from public.tenancies t
      join public.listings l on l.id = t.listing_id
     where t.listing_id = p_listing
       and l.status = 'approved'
       and t.status in ('pending', 'awaiting_payment')
  );
$f$;
revoke all on function public.listing_reserved(uuid) from public;
grant execute on function public.listing_reserved(uuid) to anon, authenticated;

commit;
