-- EboHomes 20261204_04: Phase 10.5 Step B2 - admin location and surroundings actions.
-- WHAT: review or correct a listing's pin; publish, flag, withdraw or correct a surroundings fact; set when a fact counts as old;
--       list old facts; one overview of a listing's location (pins, inspector distance, history, facts).
-- RULES: every action needs a reason and is audited. An admin cannot act on their own listing or on a fact they recorded.
--       A correction adds a NEW pending fact; a second administrator must publish it. Originals are never overwritten.
--       A pin or a fact is a claim until reviewed. "Admin-reviewed" means an administrator checked it, not that it is proven.
-- NOTE: moving a pin far enough on a listing with accepted authority reopens the authority check (existing rule, unchanged).
-- REQUIRES: 20261204_01, 20261204_02, 20261203_02 (eb_haversine_m), public.audit_write(), public.notify_user().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. mark a listing's pin as reviewed
create or replace function public.admin_review_listing_location(p_listing uuid, p_note text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); l public.listings; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can review a location.' using errcode = '42501'; end if;
  if v_note is null or char_length(v_note) < 10 then raise exception 'Write what you checked, at least 10 characters.' using errcode = '23514'; end if;
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = uid then raise exception 'You cannot review the location of your own listing.' using errcode = '42501'; end if;
  if l.lat is null or l.lng is null then raise exception 'This listing has no pin to review.' using errcode = '22023'; end if;

  perform set_config('eb.pin_admin_review', 'on', true);
  update public.listings set location_reviewed_by = uid, location_reviewed_at = now(), location_review_note = v_note where id = p_listing;
  perform set_config('eb.pin_admin_review', 'off', true);

  insert into public.listing_surroundings_events (listing_id, event, actor_id, note, meta)
  values (p_listing, 'pin_reviewed', uid, v_note, jsonb_build_object('lat', l.lat, 'lng', l.lng));
  perform public.audit_write('listing_location_reviewed', 'listing', p_listing, null::jsonb, jsonb_build_object('lat', l.lat, 'lng', l.lng), v_note);
  return 'ok';
end $f$;

-- ============================================================ 2. correct a listing's pin
create or replace function public.admin_correct_listing_pin(p_listing uuid, p_lat double precision, p_lng double precision, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); l public.listings; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_moved numeric;
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can correct a pin.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Write the reason, at least 10 characters.' using errcode = '23514'; end if;
  if p_lat is null or p_lng is null then raise exception 'Give both parts of the pin.' using errcode = '22023'; end if;
  select * into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = uid then raise exception 'You cannot correct the pin of your own listing.' using errcode = '42501'; end if;
  if l.lat is not null and l.lng is not null then
    v_moved := public.eb_haversine_m(l.lat::double precision, l.lng::double precision, p_lat, p_lng);
  end if;

  perform set_config('eb.pin_admin_review', 'on', true);
  update public.listings
     set lat = p_lat, lng = p_lng,
         location_reviewed_by = uid, location_reviewed_at = now(), location_review_note = 'Pin corrected: ' || left(v_reason, 400)
   where id = p_listing;
  perform set_config('eb.pin_admin_review', 'off', true);

  insert into public.listing_surroundings_events (listing_id, event, actor_id, note, meta)
  values (p_listing, 'pin_corrected', uid, v_reason,
          jsonb_build_object('from_lat', l.lat, 'from_lng', l.lng, 'to_lat', p_lat, 'to_lng', p_lng, 'moved_m', v_moved));
  perform public.audit_write('listing_pin_corrected', 'listing', p_listing,
          jsonb_build_object('lat', l.lat, 'lng', l.lng), jsonb_build_object('lat', p_lat, 'lng', p_lng, 'moved_m', v_moved), v_reason);
  begin
    perform public.notify_user(l.landlord_id, 'Location corrected',
      'EboHomes corrected the map pin of "' || coalesce(l.title, 'your listing') || '". Check it on your listing.', '/dashboard/listings', 'general');
  exception when others then null;
  end;
  return 'ok';
end $f$;

-- ============================================================ 3. publish, flag or withdraw a surroundings fact
create or replace function public.admin_review_surroundings_fact(p_fact uuid, p_action text, p_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); f public.listing_surroundings; o record; v_landlord uuid; v_note text := nullif(btrim(coalesce(p_note, '')), '');
        v_single boolean;
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can review this.' using errcode = '42501'; end if;
  if p_action not in ('publish','flag','withdraw') then raise exception 'Unknown action.' using errcode = '22023'; end if;
  select * into f from public.listing_surroundings where id = p_fact for update;
  if not found then raise exception 'Fact not found.' using errcode = 'P0002'; end if;
  select landlord_id into v_landlord from public.listings where id = f.listing_id;
  if v_landlord = uid then raise exception 'You cannot review facts about your own listing.' using errcode = '42501'; end if;
  if f.recorded_by = uid then raise exception 'You cannot review a fact you recorded.' using errcode = '42501'; end if;
  if f.review_status in ('withdrawn','superseded') then raise exception 'This fact is closed.' using errcode = '22023'; end if;
  v_single := f.category not like 'facility\_%' and f.category <> 'landmark';

  if p_action = 'publish' then
    if f.review_status not in ('pending','flagged') then raise exception 'Only a pending or flagged fact can be published.' using errcode = '22023'; end if;
    if v_single then
      for o in select id from public.listing_surroundings
                where listing_id = f.listing_id and category = f.category and review_status = 'published' and id <> f.id for update loop
        update public.listing_surroundings set review_status = 'superseded', superseded_by = f.id where id = o.id;
        insert into public.listing_surroundings_events (listing_id, fact_id, event, actor_id, meta)
        values (f.listing_id, o.id, 'fact_superseded', uid, jsonb_build_object('by', f.id));
      end loop;
    end if;
    if f.supersedes_id is not null then
      update public.listing_surroundings set review_status = 'superseded', superseded_by = f.id
       where id = f.supersedes_id and review_status in ('pending','published','flagged');
    end if;
    update public.listing_surroundings set review_status = 'published', reviewed_by = uid, reviewed_at = now(), review_note = v_note where id = p_fact;
  elsif p_action = 'flag' then
    if v_note is null or char_length(v_note) < 10 then raise exception 'Say what looks wrong, at least 10 characters.' using errcode = '23514'; end if;
    if f.review_status not in ('pending','published') then raise exception 'Only a pending or published fact can be flagged.' using errcode = '22023'; end if;
    update public.listing_surroundings set review_status = 'flagged', reviewed_by = uid, reviewed_at = now(), review_note = v_note where id = p_fact;
  else
    if v_note is null or char_length(v_note) < 5 then raise exception 'Write a reason of at least 5 characters.' using errcode = '23514'; end if;
    update public.listing_surroundings set review_status = 'withdrawn', reviewed_by = uid, reviewed_at = now(), review_note = v_note where id = p_fact;
  end if;

  insert into public.listing_surroundings_events (listing_id, fact_id, event, actor_id, note, meta)
  values (f.listing_id, p_fact, 'fact_' || case p_action when 'publish' then 'published' when 'flag' then 'flagged' else 'withdrawn' end, uid, v_note,
          jsonb_build_object('category', f.category, 'source', f.source));
  perform public.audit_write('surroundings_fact_' || p_action, 'listing', f.listing_id, null::jsonb,
          jsonb_build_object('fact_id', p_fact, 'category', f.category), v_note);
  return 'ok';
end $f$;

-- ============================================================ 4. propose a correction (a second administrator publishes it)
create or replace function public.admin_correct_surroundings_fact(p_fact uuid, p_answer text, p_name text, p_note text, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); f public.listing_surroundings; v_landlord uuid; v_id uuid;
        v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Write the reason, at least 10 characters.' using errcode = '23514'; end if;
  select * into f from public.listing_surroundings where id = p_fact for update;
  if not found then raise exception 'Fact not found.' using errcode = 'P0002'; end if;
  select landlord_id into v_landlord from public.listings where id = f.listing_id;
  if v_landlord = uid then raise exception 'You cannot correct facts about your own listing.' using errcode = '42501'; end if;
  if f.review_status in ('withdrawn','superseded') then raise exception 'This fact is closed.' using errcode = '22023'; end if;
  if p_answer is null or not public.eb_surroundings_answer_ok(f.category, p_answer) then raise exception 'That answer is not allowed for this category.' using errcode = '22023'; end if;

  -- The observation date and source stay those of the original: a correction does not make old information look new.
  insert into public.listing_surroundings
    (listing_id, category, answer, name, facility_lat, facility_lng, distance_m, distance_method, distance_computed_at, note, context,
     source, recorded_by, inspection_id, job_id, observed_at, review_status, supersedes_id)
  values
    (f.listing_id, f.category, p_answer, nullif(btrim(coalesce(p_name, '')), ''), f.facility_lat, f.facility_lng, f.distance_m, f.distance_method, f.distance_computed_at,
     left(nullif(btrim(coalesce(p_note, '')), ''), 300), f.context,
     f.source, uid, f.inspection_id, f.job_id, f.observed_at, 'pending', p_fact)
  returning id into v_id;

  insert into public.listing_surroundings_events (listing_id, fact_id, event, actor_id, note, meta)
  values (f.listing_id, v_id, 'fact_correction_proposed', uid, v_reason,
          jsonb_build_object('replaces', p_fact, 'old_answer', f.answer, 'new_answer', p_answer));
  perform public.audit_write('surroundings_fact_correction', 'listing', f.listing_id, jsonb_build_object('answer', f.answer),
          jsonb_build_object('fact_id', v_id, 'answer', p_answer), v_reason);
  return v_id;
end $f$;

-- ============================================================ 5. when does a fact count as old?
create or replace function public.admin_set_surroundings_stale_months(p_months int, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); v_old int; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can change this.' using errcode = '42501'; end if;
  if p_months is null or p_months not between 1 and 60 then raise exception 'Choose between 1 and 60 months.' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'A reason is required.' using errcode = '23514'; end if;
  select stale_months into v_old from public.surroundings_settings where id;
  update public.surroundings_settings set stale_months = p_months, updated_by = uid, updated_at = now() where id;
  insert into public.listing_surroundings_events (listing_id, event, actor_id, note, meta)
  values ('00000000-0000-0000-0000-000000000000'::uuid, 'stale_months_changed', uid, v_reason, jsonb_build_object('from', v_old, 'to', p_months));
  perform public.audit_write('surroundings_stale_months_changed', 'surroundings_settings', '00000000-0000-0000-0000-000000000000'::uuid,
          jsonb_build_object('months', v_old), jsonb_build_object('months', p_months), v_reason);
  return 'ok';
end $f$;

create or replace function public.admin_surroundings_stale()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v_out jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can see this.' using errcode = '42501'; end if;
  with old_facts as (
    select s.id, s.listing_id, s.category, s.name, s.observed_at, l.title
      from public.listing_surroundings s
      left join public.listings l on l.id = s.listing_id
     where s.review_status = 'published'
       and s.observed_at < now() - make_interval(months => (select st.stale_months from public.surroundings_settings st where st.id))
     order by s.observed_at
     limit 200)
  select coalesce(jsonb_agg(jsonb_build_object('fact_id', id, 'listing_id', listing_id, 'title', title, 'category', category,
           'name', name, 'observed_at', observed_at, 'age_days', (current_date - observed_at::date)) order by observed_at), '[]'::jsonb)
    into v_out from old_facts;
  return v_out;
end $f$;

-- ============================================================ 6. one overview of a listing's location (admins only)
create or replace function public.admin_listing_location_overview(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare l public.listings; i public.property_inspections; v_insp jsonb := null; v_moved boolean := false; v_hist jsonb; v_facts jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can see this.' using errcode = '42501'; end if;
  select * into l from public.listings where id = p_listing;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;

  select * into i from public.property_inspections where listing_id = p_listing order by inspected_at desc limit 1;
  if found then
    v_insp := jsonb_build_object(
      'inspection_id', i.id, 'inspected_at', i.inspected_at, 'review_status', i.review_status, 'integrity_level', i.integrity_level,
      'gps_lat', i.gps_lat, 'gps_lng', i.gps_lng, 'gps_accuracy_m', i.gps_accuracy_m,
      'distance_when_submitted_m', i.gps_distance_m, 'gps_flag', i.gps_flag, 'gps_threshold_m', i.gps_threshold_m,
      'distance_now_m', case when i.gps_lat is not null and i.gps_lng is not null and l.lat is not null and l.lng is not null
                             then public.eb_haversine_m(i.gps_lat::double precision, i.gps_lng::double precision, l.lat::double precision, l.lng::double precision) end);
    select exists (select 1 from public.listing_location_history h
                    where h.listing_id = p_listing and h.source = 'updated' and h.recorded_at > i.inspected_at) into v_moved;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('at', h.recorded_at, 'lat', h.lat, 'lng', h.lng, 'text', h.location_text,
           'moved_m', h.moved_m, 'source', h.source, 'by', h.recorded_by) order by h.recorded_at desc), '[]'::jsonb)
    into v_hist from (select * from public.listing_location_history where listing_id = p_listing order by recorded_at desc limit 20) h;

  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'category', s.category, 'answer', s.answer, 'name', s.name, 'note', s.note, 'context', s.context,
           'source', s.source, 'observed_at', s.observed_at, 'review_status', s.review_status, 'review_note', s.review_note, 'recorded_by', s.recorded_by,
           'supersedes_id', s.supersedes_id, 'facility_lat', s.facility_lat, 'facility_lng', s.facility_lng,
           'distance_m', case when s.facility_lat is not null and l.lat is not null and l.lng is not null
                              then public.eb_haversine_m(l.lat::double precision, l.lng::double precision, s.facility_lat, s.facility_lng) end,
           'distance_method', case when s.facility_lat is not null and l.lat is not null and l.lng is not null then 'straight_line' end,
           'is_stale', s.observed_at < now() - make_interval(months => (select st.stale_months from public.surroundings_settings st where st.id))
         ) order by s.created_at desc), '[]'::jsonb)
    into v_facts from public.listing_surroundings s where s.listing_id = p_listing and s.review_status <> 'superseded';

  return jsonb_build_object(
    'listing', jsonb_build_object('id', l.id, 'title', l.title, 'status', l.status, 'location_text', l.location_text, 'lat', l.lat, 'lng', l.lng,
                                  'landlord_id', l.landlord_id, 'reviewed_by', l.location_reviewed_by, 'reviewed_at', l.location_reviewed_at,
                                  'review_note', l.location_review_note),
    'inspection', v_insp,
    'pin_moved_since_inspection', v_moved,
    'history', v_hist,
    'facts', v_facts);
end $f$;

-- ============================================================ 7. who may call what
revoke all on function public.admin_review_listing_location(uuid, text) from public, anon;
revoke all on function public.admin_correct_listing_pin(uuid, double precision, double precision, text) from public, anon;
revoke all on function public.admin_review_surroundings_fact(uuid, text, text) from public, anon;
revoke all on function public.admin_correct_surroundings_fact(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_set_surroundings_stale_months(int, text) from public, anon;
revoke all on function public.admin_surroundings_stale() from public, anon;
revoke all on function public.admin_listing_location_overview(uuid) from public, anon;
grant execute on function public.admin_review_listing_location(uuid, text) to authenticated;
grant execute on function public.admin_correct_listing_pin(uuid, double precision, double precision, text) to authenticated;
grant execute on function public.admin_review_surroundings_fact(uuid, text, text) to authenticated;
grant execute on function public.admin_correct_surroundings_fact(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_set_surroundings_stale_months(int, text) to authenticated;
grant execute on function public.admin_surroundings_stale() to authenticated;
grant execute on function public.admin_listing_location_overview(uuid) to authenticated;

commit;

-- ROLLBACK:
-- drop function if exists public.admin_review_listing_location(uuid, text), public.admin_correct_listing_pin(uuid, double precision, double precision, text),
--   public.admin_review_surroundings_fact(uuid, text, text), public.admin_correct_surroundings_fact(uuid, text, text, text, text),
--   public.admin_set_surroundings_stale_months(int, text), public.admin_surroundings_stale(), public.admin_listing_location_overview(uuid);
