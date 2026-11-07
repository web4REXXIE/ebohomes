-- EboHomes 20261204_01: Phase 10.5 Step A1 - inspection table hardening, pin rules, location review columns.
-- WHAT: (1) removes anonymous rights and TRUNCATE/REFERENCES/TRIGGER rights from inspection tables (row rules already
--           blocked anonymous users; this removes the unused rights as a second layer),
--       (2) rejects a listing pin that is only half set or outside Nigeria (new and changed pins only; old rows stay as they are),
--       (3) adds columns that record an administrator's review of a listing's pin, which only the review action can write,
--       (4) a moved pin stops counting as reviewed.
-- DOES NOT: change any existing row, make the pin mandatory (that comes in the app first, the database later), change what the
--       public sees, or touch the exact coordinates (that is Step E). A pin is a CLAIM until an administrator reviews it.
-- REQUIRES: public.listings, public.property_inspections, public.inspection_jobs, public.public_listing_inspections, public.is_admin().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. safety check before removing anonymous rights
-- If the public view ran with the CALLER's rights, removing anonymous access would break the public inspection summary.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'public_listing_inspections'
       and array_to_string(coalesce(c.reloptions, '{}'::text[]), ',') ~ 'security_invoker=(true|on)') then
    raise exception 'Stopped, nothing changed. public_listing_inspections runs with the caller''s rights, so anonymous access cannot be removed yet. Send me its definition.';
  end if;
end $$;

-- ============================================================ 2. remove unused rights
revoke all on public.property_inspections from anon;
revoke all on public.inspection_jobs from anon;
revoke truncate, references, trigger on public.property_inspections from authenticated;
revoke truncate, references, trigger on public.inspection_jobs from authenticated;

-- ============================================================ 3. pin rules (only when the pin is set or changed)
create or replace function public.eb_listing_pin_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
declare la double precision; lo double precision;
begin
  if tg_op = 'UPDATE' and new.lat is not distinct from old.lat and new.lng is not distinct from old.lng then
    return new;
  end if;
  if new.lat is null and new.lng is null then
    return new;
  end if;
  if new.lat is null or new.lng is null then
    raise exception 'Set both parts of the pin, or none.' using errcode = '23514';
  end if;
  la := new.lat::double precision;
  lo := new.lng::double precision;
  if not (la between 4 and 14 and lo between 2.5 and 15) then
    raise exception 'The pin must be inside Nigeria. Move it onto the property.' using errcode = '23514';
  end if;
  return new;
end $f$;

drop trigger if exists aa_listings_pin_range on public.listings;
create trigger aa_listings_pin_range before insert or update of lat, lng on public.listings
  for each row execute function public.eb_listing_pin_guard();

-- ============================================================ 4. location review columns (written only by the admin review action)
alter table public.listings
  add column if not exists location_reviewed_by uuid,
  add column if not exists location_reviewed_at timestamptz,
  add column if not exists location_review_note text;

create or replace function public.eb_listing_location_review_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  -- The admin review action (Step B) sets this for its own statement only.
  if coalesce(current_setting('eb.pin_admin_review', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.location_reviewed_by := null;
    new.location_reviewed_at := null;
    new.location_review_note := null;
    return new;
  end if;
  if new.location_reviewed_by is distinct from old.location_reviewed_by
     or new.location_reviewed_at is distinct from old.location_reviewed_at
     or new.location_review_note is distinct from old.location_review_note then
    raise exception 'The location review can only be recorded through the administrator review action.' using errcode = '42501';
  end if;
  if (new.lat is distinct from old.lat or new.lng is distinct from old.lng) and old.location_reviewed_at is not null then
    new.location_reviewed_by := null;      -- a moved pin is no longer reviewed
    new.location_reviewed_at := null;
    new.location_review_note := null;
  end if;
  return new;
end $f$;

drop trigger if exists ab_listings_location_review_guard on public.listings;
create trigger ab_listings_location_review_guard before insert or update on public.listings
  for each row execute function public.eb_listing_location_review_guard();

commit;

-- ROLLBACK:
-- drop trigger if exists aa_listings_pin_range on public.listings;
-- drop trigger if exists ab_listings_location_review_guard on public.listings;
-- drop function if exists public.eb_listing_pin_guard(), public.eb_listing_location_review_guard();
-- alter table public.listings drop column if exists location_reviewed_by, drop column if exists location_reviewed_at, drop column if exists location_review_note;
-- (the revoked rights were unused; to restore them: grant select, update on public.property_inspections to anon; and so on.)
