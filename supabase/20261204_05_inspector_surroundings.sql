-- EboHomes 20261204_05: Phase 10.5 Step D - inspectors record surroundings; photos get a topic tag.
-- WHAT: (1) inspector_record_surroundings(): an inspector adds facts to THEIR submitted inspection (pending, never public),
--       (2) eb_inspection_register_file() gets an optional topic (set once at upload, never changed),
--       (3) my_inspection_staged_files() also returns the topic.
-- RULES: fixed answers only; notes must describe what was seen (safety and crime wording is refused);
--       facility distance is straight-line and computed by the server; the date is server time.
-- DOES NOT: publish anything. An administrator must publish every fact (Step C).
-- REQUIRES: 20261203_01/02, 20261204_02, public.eb_haversine_m, eb_form_text.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. register file, now with topic
drop function if exists public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text);

create or replace function public.eb_inspection_register_file(
  p_user uuid, p_job uuid, p_kind text, p_path text, p_name text, p_mime text, p_size bigint, p_sha256 text, p_method text,
  p_topic text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare j public.inspection_jobs; v_id uuid; v_max int; v_method text := coalesce(nullif(p_method, ''), 'unknown');
        v_topic text := nullif(btrim(coalesce(p_topic, '')), '');
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
  if v_topic is not null and v_topic not in ('general','road','drainage','flooding','street_lighting','water','electricity','network','facility') then
    v_topic := null;
  end if;

  select max_files_per_job into v_max from public.inspection_settings where id;
  if (select count(*) from public.inspection_evidence_files where job_id = p_job and discarded_at is null) >= coalesce(v_max, 30) then
    raise exception 'Too many files for this inspection.' using errcode = '22023';
  end if;
  if exists (select 1 from public.inspection_evidence_files where job_id = p_job and sha256 = p_sha256 and discarded_at is null) then
    raise exception 'You already added this exact file.' using errcode = '23505';
  end if;

  insert into public.inspection_evidence_files
    (job_id, listing_id, uploaded_by, kind, storage_path, original_name, mime_type, size_bytes, sha256, capture_method, topic)
  values (p_job, j.listing_id, p_user, p_kind, p_path, left(p_name, 200), p_mime, p_size, p_sha256, v_method, v_topic)
  returning id into v_id;

  insert into public.inspection_evidence_events (job_id, file_id, event, actor_id, meta)
  values (p_job, v_id, 'file_staged', p_user,
          jsonb_build_object('kind', p_kind, 'mime', p_mime, 'bytes', p_size, 'capture_method', v_method, 'topic', v_topic));
  return v_id;
end $f$;

revoke all on function public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.eb_inspection_register_file(uuid, uuid, text, text, text, text, bigint, text, text, text) to service_role;

-- ============================================================ 2. staged list now shows the topic
create or replace function public.my_inspection_staged_files(p_job uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'kind', f.kind, 'name', f.original_name, 'bytes', f.size_bytes,
           'capture_method', f.capture_method, 'topic', f.topic, 'uploaded_at', f.uploaded_at) order by f.uploaded_at), '[]'::jsonb)
  from public.inspection_evidence_files f
  where f.job_id = p_job and f.uploaded_by = auth.uid() and f.inspection_id is null and f.discarded_at is null and f.phase = 'initial'
$f$;

-- ============================================================ 3. inspector records surroundings facts
-- p_facts: [{category, answer, name?, note?, context?, facility_lat?, facility_lng?}, ...]  (1 to 40)
-- Returns how many NEW facts were saved. A fact already recorded for this job (same category, same name for facilities) is skipped,
-- so pressing retry never creates duplicates.
create or replace function public.inspector_record_surroundings(p_job uuid, p_facts jsonb)
returns int language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid();
  j public.inspection_jobs; i public.property_inspections; l record;
  x jsonb; v_cat text; v_ans text; v_name text; v_note text; v_ctx text;
  v_la double precision; v_lo double precision; v_dist numeric; v_id uuid; v_n int := 0; v_fac boolean;
  v_re text := '\y(crime|criminals?|robber(y|ies)|robbed|robbing|thie(f|ves)|theft|burglar\w*|kidnap\w*|murder\w*|violen(t|ce)|unsafe|dangerous|insecure|safe area|very safe|crime-free|armed|gangs?|cultists?|assault\w*|rape\w*)\y';
begin
  if uid is null or not exists (select 1 from public.inspectors where user_id = uid and status = 'active') then
    raise exception 'Only an active inspector can record surroundings.' using errcode = '42501';
  end if;
  select * into j from public.inspection_jobs where id = p_job for update;
  if not found or j.inspector_id is distinct from uid then
    raise exception 'This inspection is not assigned to you.' using errcode = '42501';
  end if;
  select * into i from public.property_inspections where job_id = p_job order by inspected_at desc limit 1;
  if not found or i.review_status <> 'submitted' then
    raise exception 'Surroundings can only be added to an inspection that is waiting for review.' using errcode = '22023';
  end if;
  if p_facts is null or jsonb_typeof(p_facts) <> 'array' or jsonb_array_length(p_facts) not between 1 and 40 then
    raise exception 'Send between 1 and 40 surroundings facts.' using errcode = '22023';
  end if;
  select lat::double precision as lat, lng::double precision as lng into l from public.listings where id = j.listing_id;

  for x in select * from jsonb_array_elements(p_facts) loop
    v_cat  := public.eb_form_text(x, 'category', 50);
    v_ans  := public.eb_form_text(x, 'answer', 50);
    v_name := public.eb_form_text(x, 'name', 120);
    v_note := public.eb_form_text(x, 'note', 300);
    v_ctx  := public.eb_form_text(x, 'context', 150);
    if v_cat is null or v_ans is null or not public.eb_surroundings_answer_ok(v_cat, v_ans) then
      raise exception 'That answer is not allowed for this category.' using errcode = '22023';
    end if;
    v_fac := v_cat like 'facility\_%' or v_cat = 'landmark';
    if v_fac then
      if v_name is null or char_length(v_name) < 2 then raise exception 'Enter the name of the place.' using errcode = '23514'; end if;
    else
      v_name := null;
    end if;
    if coalesce(v_name, '') ~* v_re or coalesce(v_note, '') ~* v_re or coalesce(v_ctx, '') ~* v_re then
      raise exception 'Notes must describe only what you saw. Do not make safety or crime claims.' using errcode = '23514';
    end if;

    v_la := case when v_fac and jsonb_typeof(x -> 'facility_lat') = 'number' then (x ->> 'facility_lat')::double precision end;
    v_lo := case when v_fac and jsonb_typeof(x -> 'facility_lng') = 'number' then (x ->> 'facility_lng')::double precision end;
    if (v_la is null) <> (v_lo is null) then v_la := null; v_lo := null; end if;
    if v_la is not null and not (v_la between 4 and 14 and v_lo between 2.5 and 15) then
      raise exception 'The place position must be inside Nigeria.' using errcode = '22023';
    end if;

    if exists (select 1 from public.listing_surroundings s
                where s.job_id = p_job and s.category = v_cat and s.review_status not in ('withdrawn','superseded')
                  and (not v_fac or lower(coalesce(s.name, '')) = lower(coalesce(v_name, '')))) then
      continue;
    end if;

    v_dist := null;
    if v_la is not null and l.lat is not null and l.lng is not null then
      v_dist := public.eb_haversine_m(l.lat, l.lng, v_la, v_lo);
    end if;

    insert into public.listing_surroundings
      (listing_id, category, answer, name, facility_lat, facility_lng, distance_m, distance_method, distance_computed_at,
       note, context, source, recorded_by, inspection_id, job_id)
    values
      (j.listing_id, v_cat, v_ans, v_name, v_la, v_lo, v_dist, case when v_dist is not null then 'straight_line' end,
       case when v_dist is not null then now() end, v_note, v_ctx, 'inspector', uid, i.id, p_job)
    returning id into v_id;

    insert into public.listing_surroundings_events (listing_id, fact_id, event, actor_id, meta)
    values (j.listing_id, v_id, 'fact_recorded', uid, jsonb_build_object('category', v_cat, 'source', 'inspector', 'inspection_id', i.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $f$;

revoke all on function public.inspector_record_surroundings(uuid, jsonb) from public, anon;
grant execute on function public.inspector_record_surroundings(uuid, jsonb) to authenticated;

commit;

-- ROLLBACK:
-- drop function if exists public.inspector_record_surroundings(uuid, jsonb);
-- (to go back to the 9-argument register function, drop the 10-argument one and run the Step A2 definition again)
