-- EboHomes 20261115_01: Phase 9.2 Drop B - publish gate + re-review triggers.
-- WHAT: (1) a listing cannot become 'approved' unless its authority is accepted, it is an open legacy
--           listing, or it has an active tenancy/application.
--       (2) a real change to location text, GPS pin or property type on an accepted listing reopens its authority review.
--       (3) 'kept unchanged' now saves a fresh baseline, so the next edit is compared to the new text.
-- DOES NOT: hide, unpublish or change the status of any listing. Tenancies and applications are never touched.
-- REQUIRES: 20261114_01 already run. Uses notify_admins(), notify_user().
-- ROLLBACK: at the bottom.
begin;

-- 1. helpers (internal)
create or replace function public.eb_norm_loc(p text) returns text language sql immutable
as $f$ select trim(regexp_replace(lower(regexp_replace(coalesce(p, ''), '[[:punct:]]+', ' ', 'g')), '\s+', ' ', 'g')) $f$;

create or replace function public.eb_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable
as $f$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))
$f$;

revoke all on function public.eb_norm_loc(text), public.eb_distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- 2. 'kept unchanged' now stores a new baseline (otherwise every later save would reopen the review again)
create or replace function public.admin_confirm_authority_unchanged(p_listing uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare l record; v_last record; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'A reason is required.' using errcode = '22023'; end if;
  select id, landlord_id, authority_status, location_text, property_type, lat, lng into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = auth.uid() then raise exception 'Only an administrator other than the lister can do this.' using errcode = '42501'; end if;
  select decision, reason_code into v_last from public.listing_authority_reviews where listing_id = p_listing order by decided_at desc limit 1;
  if l.authority_status <> 'submitted' or v_last.decision is distinct from 'reopened' or v_last.reason_code is distinct from 'location_text' then
    raise exception 'There is nothing to decide for this listing yet.' using errcode = '22023';
  end if;
  perform set_config('eb.authority_write', '1', true);
  update public.listings set authority_status = 'accepted' where id = p_listing;
  perform set_config('eb.authority_write', '', true);
  insert into public.listing_authority_reviews (listing_id, decision, internal_note, baseline, decided_by)
  values (p_listing, 'kept_unchanged', v_reason,
          jsonb_build_object('location_text', l.location_text, 'property_type', l.property_type, 'lat', l.lat, 'lng', l.lng), auth.uid());
  perform public.audit_write('listing_authority_kept_unchanged', 'listing', p_listing, jsonb_build_object('authority_status','submitted'), jsonb_build_object('authority_status','accepted'), v_reason);
end $f$;

-- 3. re-review trigger: runs after the status lock (aa_) because of its name
create or replace function public.listings_authority_rereview()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  b jsonb; tol double precision; v_text boolean; v_type boolean; v_gps boolean := false;
  v_had boolean; v_has boolean; v_reason text;
begin
  if coalesce(current_setting('eb.authority_write', true), '') = '1' then return new; end if;
  if old.authority_status is distinct from 'accepted' or new.authority_status is distinct from 'accepted' then return new; end if;
  if new.location_text is not distinct from old.location_text and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng and new.property_type is not distinct from old.property_type then
    return new;
  end if;

  -- compare with the last ACCEPTED (or kept-unchanged) review, not the previous edit, so small moves cannot add up
  select r.baseline into b from public.listing_authority_reviews r
   where r.listing_id = new.id and r.decision in ('accepted','kept_unchanged') and r.baseline is not null
   order by r.decided_at desc limit 1;
  if b is null then return new; end if;

  select gps_tolerance_m::double precision into tol from public.listing_authority_settings where id;
  tol := coalesce(tol, 100);

  v_text := public.eb_norm_loc(new.location_text) <> public.eb_norm_loc(b->>'location_text');
  v_type := public.eb_norm(new.property_type) <> public.eb_norm(b->>'property_type');
  v_had := (b->>'lat') is not null and (b->>'lng') is not null;
  v_has := new.lat is not null and new.lng is not null;
  if not v_had then v_gps := new.lat is not null or new.lng is not null;
  elsif not v_has then v_gps := true;
  else v_gps := public.eb_distance_m((b->>'lat')::double precision, (b->>'lng')::double precision, new.lat::double precision, new.lng::double precision) > tol;
  end if;

  if not (v_text or v_type or v_gps) then return new; end if;

  v_reason := case when v_type then 'property_type' when v_gps then 'location_pin' else 'location_text' end;
  new.authority_status := 'submitted';
  insert into public.listing_authority_reviews (listing_id, decision, reason_code, message)
  values (new.id, 'reopened', v_reason, 'The property details changed, so EboHomes needs to check the authority evidence again.');
  perform public.notify_admins('Property details changed', concat('Authority needs another look for "', coalesce(new.title, 'a listing'), '".'), '/admin/listing-authority', 'general');
  perform public.notify_user(new.landlord_id, 'Property details changed',
    concat('You changed the details of "', coalesce(new.title, 'your listing'), '". EboHomes will check your authority evidence again. Your listing stays as it is meanwhile.'),
    '/dashboard/authority/' || new.id, 'general');
  return new;
end $f$;

drop trigger if exists ab_listings_authority_rereview on public.listings;
create trigger ab_listings_authority_rereview before update of location_text, lat, lng, property_type on public.listings
  for each row execute function public.listings_authority_rereview();

-- 4. publish gate: only a move TO 'approved' is checked; listings already approved are never touched
create or replace function public.listings_publish_gate()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.status is distinct from 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from 'approved' then return new; end if;
  if auth.uid() is null or coalesce(current_setting('eb.authority_write', true), '') = '1' then return new; end if; -- SQL editor / server key
  if new.authority_status = 'accepted' then return new; end if;
  if tg_op = 'UPDATE' then
    if exists (select 1 from public.listing_authority_legacy g where g.listing_id = new.id and g.resolved_at is null) then return new; end if;
    if public.eb_authority_protection(new.id) is not null then return new; end if;
  end if;
  raise exception 'This listing cannot be published until its property authority has been reviewed and accepted.' using errcode = '42501';
end $f$;

drop trigger if exists ac_listings_publish_gate on public.listings;
create trigger ac_listings_publish_gate before insert or update of status on public.listings
  for each row execute function public.listings_publish_gate();

revoke all on function public.listings_authority_rereview(), public.listings_publish_gate() from public, anon, authenticated;

commit;

-- CHECK (read only, run after the migration):
-- select
--  (select count(*) from pg_trigger where not tgisinternal and tgname in ('aa_listings_authority_status_lock','ab_listings_authority_rereview','ac_listings_publish_gate')) as triggers_should_be_3,
--  (select transition_started_at from public.listing_authority_settings where id) as transition_started_at,
--  (select count(*) from public.listings l where l.status in ('approved','paused','inspection_required') and l.authority_status <> 'accepted'
--     and not exists (select 1 from public.listing_authority_legacy g where g.listing_id = l.id)) as live_listings_not_in_legacy;

-- ROLLBACK (only if you must undo):
-- drop trigger if exists ac_listings_publish_gate on public.listings;
-- drop trigger if exists ab_listings_authority_rereview on public.listings;
-- drop function if exists public.listings_publish_gate(), public.listings_authority_rereview(), public.eb_norm_loc(text), public.eb_distance_m(double precision, double precision, double precision, double precision);
-- (admin_confirm_authority_unchanged can stay: the new version is harmless without the triggers.)
