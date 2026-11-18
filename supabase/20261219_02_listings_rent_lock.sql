-- WHAT: while a listing has a live rental, a landlord cannot change its rent or fees.
-- LIVE RENTAL = an application (pending, info_requested, approved, accepted), a rental offer (offered, countered,
--   accepted) or a tenancy that has not ended (terms, agreement, payment, handover).
-- COVERS: price_monthly, price_yearly, rent, service_charge, caution_deposit.
-- DOES NOT: change any other column, any existing trigger or policy, or what admins and server functions can do.
-- ORDER: named a00_ so it runs before the re-edit guard, which would otherwise send the listing back to review first.
-- ROLLBACK: drop trigger if exists a00_listings_rent_lock on public.listings;
--           drop function if exists public.listings_rent_lock();

create or replace function public.listings_rent_lock()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.price_monthly  is not distinct from old.price_monthly
     and new.price_yearly   is not distinct from old.price_yearly
     and new.rent           is not distinct from old.rent
     and new.service_charge is not distinct from old.service_charge
     and new.caution_deposit is not distinct from old.caution_deposit then
    return new;
  end if;

  if exists (select 1 from public.applications a
              where a.listing_id = old.id
                and a.status in ('pending', 'info_requested', 'approved', 'accepted'))
     or exists (select 1 from public.rental_offers o
                 where o.listing_id = old.id
                   and o.status in ('offered', 'countered', 'accepted'))
     or exists (select 1 from public.tenancies t
                 where t.listing_id = old.id
                   and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')) then
    raise exception 'The rent and fees cannot be changed while a tenant has applied or a rental is in progress.'
      using errcode = '42501';
  end if;

  return new;
end
$f$;

drop trigger if exists a00_listings_rent_lock on public.listings;
create trigger a00_listings_rent_lock
  before update of price_monthly, price_yearly, rent, service_charge, caution_deposit on public.listings
  for each row execute function public.listings_rent_lock();

revoke all on function public.listings_rent_lock() from public, anon, authenticated;
