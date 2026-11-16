-- Listing freshness trigger, captured from the live database.
-- When a listing becomes approved (a first approval, or a paused one resumed), the freshness dates reset.
-- Safe to re-run.
begin;

create or replace function public.eb_listing_fresh_on_approve()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.availability_confirmed_at := now();
    new.availability_reminded_at := null;
    new.freshness_paused_at := null;
  end if;
  return new;
end
$function$;

drop trigger if exists ad_listings_fresh_on_approve on public.listings;
create trigger ad_listings_fresh_on_approve
  before update of status on public.listings
  for each row execute function public.eb_listing_fresh_on_approve();

commit;

notify pgrst, 'reload schema';
