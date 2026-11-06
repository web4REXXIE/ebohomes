-- EboHomes 20261203_02: Phase 10.4 Step A2 - evidence registration, server-checked inspection submit, job history.
-- WHAT: functions that (1) register an uploaded file with its server-computed SHA-256, (2) submit an inspection with every
--       rule checked in the database, (3) record who was assigned a job and when, (4) let admins change the GPS threshold.
-- DOES NOT: remove the old direct insert into property_inspections (that is Step E, after the new flow is live and tested),
--       review files (Step B), or change what the public sees.
-- GPS is a CLAIM from the device. The distance is a warning for the reviewer. It never proves anyone was at the property.
-- REQUIRES: 20261203_01 and the live guard trigger on property_inspections (20261027_03).
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. small helpers
create or replace function public.eb_haversine_m(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns numeric language sql immutable
as $f$
  select round((2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)
  ))))::numeric, 1)
$f$;

create or replace function public.eb_form_text(p_form jsonb, p_key text, p_max int default 2000)
returns text language sql immutable
as $f$ select left(nullif(btrim(case when jsonb_typeof(p_form -> p_key) = 'string' then p_form ->> p_key end), ''), p_max) $f$;

create or replace function public.eb_form_bool(p_form jsonb, p_key text)
returns boolean language sql immutable
as $f$ select case when jsonb_typeof(p_form -> p_key) = 'boolean' then (p_form ->> p_key)::boolean end $f$;

-- ============================================================ 2. register one uploaded file (SERVER ONLY, service key)
-- The upload route has already read the stored bytes, checked the real file type and computed the SHA-256.
create or replace function public.eb_inspection_register_file(
  p_user uuid, p_job uuid, p_kind text, p_path text, p_name text, p_mime text, p_size bigint, p_sha256 text, p_method text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare j public.inspection_jobs; v_id uuid; v_max int; v_method text := coalesce(nullif(p_method, ''), 'unknown');
begin
  if not exists (select 1 from public.inspectors where user_id = p_user and status = 'active') then
    raise exception 'Only an active inspector can add evidence.' using errcode = '42501';
  end if;
  select * into j from public.inspection_jobs where id = p_job for update;
  if not found or j.inspector_id is distinct from p_user then
    raise exception 'This inspection is not assigned to you.' using errcode = '42501';
  end if;
  if j.status <> 'assigned' then
    raise exception 'This inspection is not open for evidence.' using errcode = '22023';
  end if;
  if p_kind not in ('photo','video') then raise exception 'Unknown file kind.' using errcode = '22023'; end if;
  if not ((p_kind = 'photo' and p_mime in ('image/jpeg','image/png','image/webp'))
       or (p_kind = 'video' and p_mime in ('video/mp4','video/webm'))) then
    raise exception 'This file type is not accepted.' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0
     or (p_kind = 'photo' and p_size > 10 * 1024 * 1024)
     or (p_kind = 'video' and p_size > 100 * 1024 * 1024) then
    raise exception 'This file is too large (photos up to 10 MB, videos up to 100 MB).' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid file fingerprint.' using errcode = '22023'; end if;
  if p_path is null or left(p_path, length(p_user::text) + length(p_job::text) + 2) <> p_user::text || '/' || p_job::text || '/' then
    raise exception 'Invalid file location.' using errcode = '22023';
  end if;
  if v_method not in ('camera','gallery','unknown') then v_method := 'unknown'; end if;

  select max_files_per_job into v_max from public.inspection_settings where id;
  if (select count(*) from public.inspection_evidence_files where job_id = p_job and discarded_at is null) >= coalesce(v_max, 30) then
    raise exception 'Too many files for this inspection.' using errcode = '22023';
  end if;
  if exists (select 1 from public.inspection_evidence_files where job_id = p_job and sha256 = p_sha256 and discarded_at is null) then
    raise exception 'You already added this exact file.' using errcode = '23505';
  end if;

  insert into public.inspection_evidence_files
    (job_id, listing_id, uploaded_by, kind, storage_path, original_name, mime_type, size_bytes, sha256, capture_method)
  values (p_job, j.listing_id, p_user, p_kind, p_path, left(p_name, 200), p_mime, p_size, p_sha256, v_method)
  returning id into v_id;

  insert into public.inspection_evidence_events (job_id, file_id, event, actor_id, meta)
  values (p_job, v_id, 'file_staged', p_user,
          jsonb_build_object('kind', p_kind, 'mime', p_mime, 'bytes', p_size, 'capture_method', v_method));
  return v_id;
end $f$;

-- Discard a file that was never submitted (failed attempt, wrong photo). Returns the path so the route can remove the object.
create or replace function public.eb_inspection_discard_file(p_user uuid, p_file uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare fl public.inspection_evidence_files;
begin
  select * into fl from public.inspection_evidence_files where id = p_file for update;
  if not found or fl.uploaded_by <> p_user then raise exception 'File not found.' using errcode = 'P0002'; end if;
  if fl.inspection_id is not null then raise exception 'A submitted file cannot be removed.' using errcode = '42501'; end if;
  if fl.discarded_at is not null then return fl.storage_path; end if;
  update public.inspection_evidence_files set discarded_at = now() where id = p_file;
  insert into public.inspection_evidence_events (job_id, file_id, event, actor_id, meta)
  values (fl.job_id, p_file, 'file_discarded', p_user, jsonb_build_object('reason', 'not submitted'));
  return fl.storage_path;
end $f$;

-- ============================================================ 3. what the inspector sees on the submit screen
create or replace function public.my_inspection_staged_files(p_job uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'kind', f.kind, 'name', f.original_name, 'bytes', f.size_bytes,
           'capture_method', f.capture_method, 'uploaded_at', f.uploaded_at) order by f.uploaded_at), '[]'::jsonb)
  from public.inspection_evidence_files f
  where f.job_id = p_job and f.uploaded_by = auth.uid() and f.inspection_id is null and f.discarded_at is null and f.phase = 'initial'
$f$;

-- ============================================================ 4. submit an inspection (every rule checked here, not in the browser)
create or replace function public.submit_inspection(
  p_job uuid, p_gps_lat numeric, p_gps_lng numeric, p_gps_accuracy numeric, p_gps_fix_at timestamptz, p_form jsonb)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid();
  j public.inspection_jobs; l record; s public.inspection_settings;
  v_files uuid[]; v_paths text[]; v_photos int; v_total int; v_gallery int; v_camera int;
  v_dist numeric; v_flag text; v_id uuid; v_verdict text; v_reason text; v_claimant text; v_dups int;
begin
  if uid is null or not exists (select 1 from public.inspectors where user_id = uid and status = 'active') then
    raise exception 'Only an active inspector can submit an inspection.' using errcode = '42501';
  end if;
  select * into j from public.inspection_jobs where id = p_job for update;
  if not found or j.inspector_id is distinct from uid then
    raise exception 'This inspection is not assigned to you.' using errcode = '42501';
  end if;
  if j.status <> 'assigned' then
    raise exception 'This inspection has already been submitted or is closed.' using errcode = '22023';
  end if;
  if p_form is null or jsonb_typeof(p_form) <> 'object' then raise exception 'Invalid form.' using errcode = '22023'; end if;

  v_verdict := public.eb_form_text(p_form, 'verdict', 20);
  if v_verdict is null or v_verdict not in ('pass','fail','uncertain') then raise exception 'Choose PASS, FAIL or UNCERTAIN.' using errcode = '22023'; end if;
  v_reason := public.eb_form_text(p_form, 'verdict_reason', 2000);
  if v_reason is null then raise exception 'Give the reason for your verdict.' using errcode = '23514'; end if;
  v_claimant := public.eb_form_text(p_form, 'claimant_name', 200);
  if v_claimant is null then raise exception 'Enter the name of the person you met.' using errcode = '23514'; end if;

  if p_gps_lat is null or p_gps_lng is null or p_gps_lat not between -90 and 90 or p_gps_lng not between -180 and 180 then
    raise exception 'Capture your GPS location first.' using errcode = '22023';
  end if;
  if p_gps_accuracy is not null and (p_gps_accuracy < 0 or p_gps_accuracy > 100000) then p_gps_accuracy := null; end if;
  -- A fix time in the future or older than a day is not trusted; the server time is recorded separately anyway.
  if p_gps_fix_at is not null and (p_gps_fix_at > now() + interval '5 minutes' or p_gps_fix_at < now() - interval '1 day') then p_gps_fix_at := null; end if;

  select id, lat::double precision as lat, lng::double precision as lng into l from public.listings where id = j.listing_id;
  if not found then raise exception 'The listing no longer exists.' using errcode = 'P0002'; end if;
  select * into s from public.inspection_settings where id;

  if l.lat is null or l.lng is null then
    v_flag := 'no_pin'; v_dist := null;
  else
    v_dist := public.eb_haversine_m(p_gps_lat::double precision, p_gps_lng::double precision, l.lat, l.lng);
    v_flag := case when v_dist <= s.gps_threshold_m then 'within' else 'outside' end;
  end if;

  select array_agg(f.id order by f.uploaded_at), array_agg(f.storage_path order by f.uploaded_at),
         count(*) filter (where f.kind = 'photo'), count(*),
         count(*) filter (where f.capture_method = 'gallery'), count(*) filter (where f.capture_method = 'camera')
    into v_files, v_paths, v_photos, v_total, v_gallery, v_camera
    from public.inspection_evidence_files f
   where f.job_id = p_job and f.uploaded_by = uid and f.inspection_id is null and f.discarded_at is null and f.phase = 'initial';
  if coalesce(v_photos, 0) < 3 then raise exception 'Add at least 3 photographs as evidence.' using errcode = '23514'; end if;
  if coalesce(v_total, 0) < 3 then raise exception 'Add at least 3 evidence files.' using errcode = '23514'; end if;

  insert into public.property_inspections (
    listing_id, job_id, inspected_by, gps_lat, gps_lng, gps_accuracy_m, gps_fix_at, gps_distance_m, gps_threshold_m, gps_flag, integrity_level,
    claimant_name, claimant_relationship, claimant_id_seen, rent_matches, listing_matches, neighborhood_type, nearby_landmarks, overall_notes,
    verdict, verdict_reason, evidence_paths,
    road_condition, road_matches, water_source, water_matches, electricity_notes, electricity_matches, network_notes, network_matches,
    security_notes, security_matches, condition_notes, condition_matches, environment_notes, environment_matches)
  values (
    j.listing_id, p_job, uid, p_gps_lat, p_gps_lng, p_gps_accuracy, p_gps_fix_at, v_dist, s.gps_threshold_m, v_flag, 'hashed',
    v_claimant, public.eb_form_text(p_form, 'claimant_relationship', 100), coalesce(public.eb_form_bool(p_form, 'claimant_id_seen'), false),
    public.eb_form_bool(p_form, 'rent_matches'), public.eb_form_bool(p_form, 'listing_matches'),
    public.eb_form_text(p_form, 'neighborhood_type', 200), public.eb_form_text(p_form, 'nearby_landmarks', 1000), public.eb_form_text(p_form, 'overall_notes', 2000),
    v_verdict, v_reason, v_paths,
    public.eb_form_text(p_form, 'road_condition'), public.eb_form_bool(p_form, 'road_matches'),
    public.eb_form_text(p_form, 'water_source'), public.eb_form_bool(p_form, 'water_matches'),
    public.eb_form_text(p_form, 'electricity_notes'), public.eb_form_bool(p_form, 'electricity_matches'),
    public.eb_form_text(p_form, 'network_notes'), public.eb_form_bool(p_form, 'network_matches'),
    public.eb_form_text(p_form, 'security_notes'), public.eb_form_bool(p_form, 'security_matches'),
    public.eb_form_text(p_form, 'condition_notes'), public.eb_form_bool(p_form, 'condition_matches'),
    public.eb_form_text(p_form, 'environment_notes'), public.eb_form_bool(p_form, 'environment_matches'))
  returning id into v_id;
  -- (the existing guard trigger stamps inspected_by / inspected_at / review_status and marks the job as submitted)

  update public.inspection_evidence_files set inspection_id = v_id, submitted_at = now() where id = any(v_files);

  insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, meta)
  values (p_job, v_id, 'inspection_submitted', uid,
          jsonb_build_object('files', v_total, 'photos', v_photos, 'gallery_files', v_gallery, 'camera_files', v_camera,
                             'gps_flag', v_flag, 'gps_distance_m', v_dist, 'gps_threshold_m', s.gps_threshold_m, 'gps_accuracy_m', p_gps_accuracy));
  perform public.audit_write('inspection_submitted', 'inspection', v_id, null,
          jsonb_build_object('listing_id', j.listing_id, 'files', v_total, 'gps_flag', v_flag), null);

  -- The same file bytes seen in a DIFFERENT inspection are a signal for a reviewer, never an accusation. Fails open.
  begin
    select count(distinct o.inspection_id) into v_dups
      from public.inspection_evidence_files f
      join public.inspection_evidence_files o on o.sha256 = f.sha256 and o.id <> f.id and o.job_id <> f.job_id and o.discarded_at is null
     where f.id = any(v_files);
    if coalesce(v_dups, 0) > 0 then
      perform public.eb_risk_raise('manual_review', null, j.listing_id, 'inspection_dup:' || v_id::text,
        'One or more files in this inspection are byte-for-byte identical to files in another inspection. This can have an innocent cause. Compare the files before deciding.',
        public.eb_risk_ev('photo', 'inspection', v_id, 'Identical file in another inspection', v_dups::text || ' other inspection(s) share a file', 30), null);
      insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, meta)
      values (p_job, v_id, 'duplicate_file_flagged', null, jsonb_build_object('other_inspections', v_dups));
    end if;
  exception when others then
    null;
  end;
  return v_id;
end $f$;

-- ============================================================ 5. assignment history (also catches the existing admin page, which edits jobs directly)
create or replace function public.eb_inspection_job_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.inspector_id is distinct from old.inspector_id then
    if old.status in ('submitted','reviewed') and auth.uid() is not null then
      raise exception 'This inspection was already submitted, so it cannot be reassigned.' using errcode = '42501';
    end if;
    if new.inspector_id is not null and exists (
         select 1 from public.inspection_jobs o
          where o.id <> new.id and o.inspector_id = new.inspector_id and o.status <> 'cancelled'
            and coalesce(o.parent_job_id, o.id) = coalesce(new.parent_job_id, new.id)) then
      raise exception 'A second inspection must be done by a different inspector.' using errcode = '23514';
    end if;
    new.assigned_at := now();   -- server time, not the admin device clock
  end if;
  if new.status is distinct from old.status and old.status in ('submitted','reviewed') and new.status = 'assigned' and auth.uid() is not null then
    raise exception 'A submitted inspection cannot go back to assigned.' using errcode = '42501';
  end if;
  return new;
end $f$;

create or replace function public.eb_inspection_job_log()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if tg_op = 'INSERT' then
    insert into public.inspection_job_events (job_id, event, to_inspector, to_status, actor_id)
    values (new.id, 'created', new.inspector_id, new.status, auth.uid());
  elsif new.inspector_id is distinct from old.inspector_id or new.status is distinct from old.status then
    insert into public.inspection_job_events (job_id, event, from_inspector, to_inspector, from_status, to_status, actor_id)
    values (new.id,
            case when new.inspector_id is distinct from old.inspector_id then 'inspector_changed' else 'status_changed' end,
            old.inspector_id, new.inspector_id, old.status, new.status, auth.uid());
  end if;
  return new;
end $f$;

drop trigger if exists aa_insp_job_guard on public.inspection_jobs;
create trigger aa_insp_job_guard before update on public.inspection_jobs for each row execute function public.eb_inspection_job_guard();
drop trigger if exists zz_insp_job_log on public.inspection_jobs;
create trigger zz_insp_job_log after insert or update on public.inspection_jobs for each row execute function public.eb_inspection_job_log();

-- ============================================================ 6. admins can change the GPS warning distance (recorded)
create or replace function public.admin_set_inspection_gps_threshold(p_meters int, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_old int; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can change this.' using errcode = '42501'; end if;
  if p_meters is null or p_meters not between 20 and 5000 then raise exception 'Choose between 20 and 5000 metres.' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'A reason is required.' using errcode = '23514'; end if;
  select gps_threshold_m into v_old from public.inspection_settings where id;
  update public.inspection_settings set gps_threshold_m = p_meters, updated_by = auth.uid(), updated_at = now() where id;
  perform public.audit_write('inspection_gps_threshold_changed', 'inspection_settings', '00000000-0000-0000-0000-000000000000'::uuid,
          jsonb_build_object('metres', v_old), jsonb_build_object('metres', p_meters), v_reason);
  return 'ok';
end $f$;

-- ============================================================ 7. who may call what
revoke all on function public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.eb_inspection_discard_file(uuid, uuid) from public, anon, authenticated;
grant execute on function public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text) to service_role;
grant execute on function public.eb_inspection_discard_file(uuid, uuid) to service_role;

revoke all on function public.submit_inspection(uuid, numeric, numeric, numeric, timestamptz, jsonb) from public, anon;
revoke all on function public.my_inspection_staged_files(uuid) from public, anon;
revoke all on function public.admin_set_inspection_gps_threshold(int, text) from public, anon;
grant execute on function public.submit_inspection(uuid, numeric, numeric, numeric, timestamptz, jsonb) to authenticated;
grant execute on function public.my_inspection_staged_files(uuid) to authenticated;
grant execute on function public.admin_set_inspection_gps_threshold(int, text) to authenticated;

commit;

-- ROLLBACK:
-- drop trigger if exists aa_insp_job_guard on public.inspection_jobs;
-- drop trigger if exists zz_insp_job_log on public.inspection_jobs;
-- drop function if exists public.eb_inspection_job_guard(), public.eb_inspection_job_log(),
--   public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text), public.eb_inspection_discard_file(uuid, uuid),
--   public.my_inspection_staged_files(uuid), public.submit_inspection(uuid, numeric, numeric, numeric, timestamptz, jsonb),
--   public.admin_set_inspection_gps_threshold(int, text), public.eb_haversine_m(double precision, double precision, double precision, double precision),
--   public.eb_form_text(jsonb, text, int), public.eb_form_bool(jsonb, text);
