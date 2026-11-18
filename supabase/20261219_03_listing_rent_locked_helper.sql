-- WHAT: one function, listing_rent_locked(listing), that answers "does this listing have a live rental?".
--   The database trigger and the edit page now both use it, so they can never disagree.
-- LIVE RENTAL = an application (pending, info_requested, approved, accepted), a rental offer (offered, countered,
--   accepted) or a tenancy that has not ended.
-- PRIVACY: it only answers for the listing's own landlord or an admin. For anyone else it returns false.
-- DOES NOT: change any table, policy or other trigger. It replaces only the body of listings_rent_lock().
-- ROLLBACK: restore the body from 20261219_02_listings_rent_lock.sql, then:
--           drop function if exists public.listing_rent_locked(uuid);

create or replace function public.listing_rent_locked(p_listing uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
  select exists (
           select 1 from public.listings l
            where l.id = p_listing
              and (l.landlord_id = auth.uid() or public.is_admin())
         )
     and (
           exists (select 1 from public.applications a
                    where a.listing_id = p_listing
                      and a.status in ('pending', 'info_requested', 'approved', 'accepted'))
        or exists (select 1 from public.rental_offers o
                    where o.listing_id = p_listing
                      and o.status in ('offered', 'countered', 'accepted'))
        or exists (select 1 from public.tenancies t
                    where t.listing_id = p_listing
                      and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed'))
         );
$f$;

revoke all on function public.listing_rent_locked(uuid) from public, anon;
grant execute on function public.listing_rent_locked(uuid) to authenticated;

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

  if new.price_monthly   is not distinct from old.price_monthly
     and new.price_yearly    is not distinct from old.price_yearly
     and new.rent            is not distinct from old.rent
     and new.service_charge  is not distinct from old.service_charge
     and new.caution_deposit is not distinct from old.caution_deposit then
    return new;
  end if;

  if public.listing_rent_locked(old.id) then
    raise exception 'The rent and fees cannot be changed while a tenant has applied or a rental is in progress.'
      using errcode = '42501';
  end if;

  return new;
end
$f$;
