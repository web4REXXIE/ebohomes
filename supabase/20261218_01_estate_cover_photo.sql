-- EboHomes 20261218_01: Stage B3a. Overview photo for a building or estate (additive only).
-- WHY: tenants should see the whole building first, then pick a flat.
-- WHAT: adds estates.cover_photo_url, and set_estate_cover_photo(estate, url) so only the owner can set it.
-- DOES NOT: touch listings, payments, tenancies, handover, or any existing policy.
-- ROLLBACK at the bottom. Safe to re-run.

begin;

alter table public.estates add column if not exists cover_photo_url text;

create or replace function public.set_estate_cover_photo(p_estate uuid, p_url text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.';
  end if;
  if p_url is null or p_url !~ '^https://res\.cloudinary\.com/' then
    raise exception 'That photo link is not valid.';
  end if;
  update public.estates
     set cover_photo_url = p_url
   where id = p_estate
     and owner_id = auth.uid();
  if not found then
    raise exception 'You can only change your own place.';
  end if;
end
$f$;

revoke all on function public.set_estate_cover_photo(uuid, text) from public, anon;
grant execute on function public.set_estate_cover_photo(uuid, text) to authenticated;

commit;

-- CHECK (read only): should show the column.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'estates' and column_name = 'cover_photo_url';

-- ROLLBACK (only if needed):
-- drop function if exists public.set_estate_cover_photo(uuid, text);
-- alter table public.estates drop column if exists cover_photo_url;
