-- EboHomes 20261204_06: Phase 10.5 Step E - a NEW listing must have a map pin.
-- WHAT: refuses an INSERT into listings without a pin. Existing listings and edits are untouched.
-- ROLLBACK: at the bottom.
begin;

create or replace function public.eb_listing_pin_required()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  if new.lat is null or new.lng is null then
    raise exception 'Drop a pin on the map before submitting your listing.' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists ac_listings_pin_required on public.listings;
create trigger ac_listings_pin_required before insert on public.listings
  for each row execute function public.eb_listing_pin_required();

commit;

-- ROLLBACK:
-- drop trigger if exists ac_listings_pin_required on public.listings;
-- drop function if exists public.eb_listing_pin_required();
