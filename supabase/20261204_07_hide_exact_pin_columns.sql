-- EboHomes 20261204_07: Phase 10.5 Step F - the exact pin (listings.lat, listings.lng) can no longer be read straight from the table.
-- WHAT: removes read access to ONLY those two columns for the browser roles (anon, authenticated). Every other column stays readable.
--       People who have a reason still get the exact pin through listing_exact_location() (owner, admin, assigned inspector,
--       tenant with a scheduled or completed viewing or an approved application). Everyone else sees the approximate public pin.
-- DOES NOT: change who can WRITE a pin (landlords can still set or move their own pin; the pin rules and review triggers still run),
--       touch any row, or affect server routes that use the service key, or database functions (they run with owner rights).
-- REQUIRES: Step E pages deployed first (they no longer read lat/lng), and 20261204_03 (listing_exact_location).
-- AFTER THIS: any NEW column added to public.listings must be granted to the browser roles, or pages cannot read it.
--             Run:  select public.eb_regrant_listing_columns();   after adding a column.
-- ROLLBACK: at the bottom.
begin;

create or replace function public.eb_regrant_listing_columns()
returns text language plpgsql set search_path to 'public','pg_temp'
as $f$
declare cols text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
   where a.attrelid = 'public.listings'::regclass and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('lat', 'lng');
  execute format('grant select (%s) on public.listings to anon, authenticated', cols);
  return 'ok';
end $f$;
revoke all on function public.eb_regrant_listing_columns() from public, anon, authenticated;

revoke select on public.listings from anon, authenticated;
select public.eb_regrant_listing_columns();

commit;

-- ROLLBACK (puts the old behaviour back):
-- grant select on public.listings to anon, authenticated;
