begin;

-- 1) A landlord must be verified before a listing can be created.
--    Admins and server-side jobs (no signed-in user) are not affected.
create or replace function public.eb_listings_require_verified_landlord()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare p record;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.landlord_id is distinct from auth.uid() then return new; end if;

  select role, verified, verification_status into p
    from public.profiles where id = auth.uid();

  if found and p.role = 'landlord'
     and not (p.verified is true and p.verification_status = 'verified') then
    raise exception 'Your account must be verified by EboHomes before you can list a property.' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists a05_listings_require_verified_landlord on public.listings;
create trigger a05_listings_require_verified_landlord before insert on public.listings
  for each row execute function public.eb_listings_require_verified_landlord();

-- 2) A tenant must be verified before an application can be created.
create or replace function public.eb_applications_require_verified_tenant()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare p record;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.tenant_id is distinct from auth.uid() then return new; end if;

  select role, verified, verification_status into p
    from public.profiles where id = auth.uid();

  if found and p.role = 'tenant'
     and not (p.verified is true and p.verification_status = 'verified') then
    raise exception 'Your account must be verified by EboHomes before you can apply.' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists a05_applications_require_verified_tenant on public.applications;
create trigger a05_applications_require_verified_tenant before insert on public.applications
  for each row execute function public.eb_applications_require_verified_tenant();

commit;
-- ROLLBACK: drop trigger if exists a05_listings_require_verified_landlord on public.listings;
--           drop trigger if exists a05_applications_require_verified_tenant on public.applications;
--           drop function if exists public.eb_listings_require_verified_landlord();
--           drop function if exists public.eb_applications_require_verified_tenant();
