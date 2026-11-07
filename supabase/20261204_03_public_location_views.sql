-- EboHomes 20261204_03: Phase 10.5 Step B1 - approximate public pin, public surroundings view, exact-pin gate.
-- WHAT: (1) public_listing_pins: the pin rounded to about 1 km, never the exact position, plus whether an admin reviewed it,
--       (2) public_listing_surroundings: ONLY facts an administrator published, with source, date, an "old" flag and a straight-line
--           distance rounded to 250 m (finer distances from several facilities could reveal the exact building),
--       (3) listing_exact_location(): the exact pin for the lister, administrators, the assigned inspector and tenants with a
--           scheduled or completed viewing or an approved application.
-- DOES NOT: change any page, remove any column or hide the exact coordinates that pages read today (that is Step E, at the end).
-- Distances are straight-line only and say so. They are never road, walking or driving distances.
-- REQUIRES: 20261204_01 and 20261204_02, 20261203_02 (eb_haversine_m), public.listing_on_hold(), public.viewings, public.applications.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. approximate pin (about 1 km grid)
create or replace view public.public_listing_pins as
select l.id as listing_id,
       (l.lat is not null and l.lng is not null) as has_pin,
       case when l.lat is not null and l.lng is not null then round(l.lat::numeric, 2) end as area_lat,
       case when l.lat is not null and l.lng is not null then round(l.lng::numeric, 2) end as area_lng,
       case when l.location_reviewed_at is not null then 'admin_reviewed' else 'landlord_provided' end as pin_label,
       l.location_reviewed_at as pin_reviewed_at
from public.listings l
where l.status in ('approved', 'paused');

revoke insert, update, delete, truncate, references, trigger on public.public_listing_pins from anon, authenticated, public;
grant select on public.public_listing_pins to anon, authenticated;

-- ============================================================ 2. published surroundings facts only
-- No facility position, no recorder, no review notes. Distance is recomputed from the CURRENT listing pin and rounded.
create or replace view public.public_listing_surroundings as
select s.id,
       s.listing_id,
       s.category,
       s.answer,
       s.name,
       s.note,
       s.context,
       s.source,
       s.observed_at,
       s.reviewed_at,
       case when s.facility_lat is not null and s.facility_lng is not null and l.lat is not null and l.lng is not null
            then greatest(250, round(public.eb_haversine_m(l.lat::double precision, l.lng::double precision, s.facility_lat, s.facility_lng) / 250) * 250)
       end as distance_m_rounded,
       case when s.facility_lat is not null and s.facility_lng is not null and l.lat is not null and l.lng is not null
            then 'straight_line' end as distance_method,
       (s.observed_at < now() - make_interval(months => (select st.stale_months from public.surroundings_settings st where st.id))) as is_stale
from public.listing_surroundings s
join public.listings l on l.id = s.listing_id
where s.review_status = 'published'
  and l.status in ('approved', 'paused')
  and not public.listing_on_hold(s.listing_id);

revoke insert, update, delete, truncate, references, trigger on public.public_listing_surroundings from anon, authenticated, public;
grant select on public.public_listing_surroundings to anon, authenticated;

-- ============================================================ 3. exact pin, only for people with a reason
create or replace function public.listing_exact_location(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); l record; v_reason text;
begin
  if uid is null then return null; end if;
  select id, landlord_id, lat, lng into l from public.listings where id = p_listing;
  if not found or l.lat is null or l.lng is null then return null; end if;

  if l.landlord_id = uid then
    v_reason := 'owner';
  elsif coalesce(public.is_admin(), false) then
    v_reason := 'admin';
  elsif exists (select 1 from public.inspectors i where i.user_id = uid and i.status = 'active')
        and exists (select 1 from public.inspection_jobs j where j.listing_id = p_listing and j.inspector_id = uid and j.status in ('assigned','submitted')) then
    v_reason := 'inspector';
  elsif exists (select 1 from public.viewings v where v.listing_id = p_listing and v.tenant_id = uid and v.status in ('scheduled','completed')) then
    v_reason := 'viewing';
  elsif exists (select 1 from public.applications a where a.listing_id = p_listing and a.tenant_id = uid and a.status = 'approved') then
    v_reason := 'application';
  else
    return null;
  end if;
  return jsonb_build_object('lat', l.lat, 'lng', l.lng, 'reason', v_reason);
end $f$;

revoke all on function public.listing_exact_location(uuid) from public, anon;
grant execute on function public.listing_exact_location(uuid) to authenticated;

commit;

-- ROLLBACK:
-- drop view if exists public.public_listing_pins, public.public_listing_surroundings;
-- drop function if exists public.listing_exact_location(uuid);
