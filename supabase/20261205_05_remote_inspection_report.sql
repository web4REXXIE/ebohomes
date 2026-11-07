-- EboHomes 20261205_05: Phase 10.6 Step E2 - the tenant reads the private report of their own remote inspection.
-- WHAT:
--   (1) my_remote_inspection_report(request)  - the released report, for the tenant who asked for it and nobody else;
--   (2) eb_remote_report_file_path(user, file) - internal: the storage path of ONE accepted file of that tenant's released report.
--       Only the server route calls it. It writes a 'report_file_opened' line to the request history.
-- WHAT THE TENANT SEES: the verdict and reason, what was found (road, water, electricity, network, security, condition, environment),
--   whether rent and listing details matched, landmarks, the inspector's notes, the admin's optional message, and the ACCEPTED photos and videos.
-- WHAT THE TENANT NEVER SEES: the inspector's name, the person they met, GPS details, the admin's internal notes, rejected or unreviewed files, storage paths.
-- NO FEES. DOES NOT: publish anything, touch the public view, grant the Inspected badge, or show anything to the landlord.
-- REQUIRES: 20261205_01 to _04.
-- ROLLBACK: at the bottom.
begin;

create or replace function public.my_remote_inspection_report(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); r public.inspection_requests; i public.property_inspections; l record;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  select * into r from public.inspection_requests where id = p_request and tenant_id = uid;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  if r.status <> 'completed' or r.report_released_at is null then
    raise exception 'This report is not ready yet.' using errcode = '22023';
  end if;
  select * into i from public.property_inspections where job_id = r.job_id order by inspected_at desc limit 1;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  select title, location_text into l from public.listings where id = r.listing_id;

  return jsonb_build_object(
    'request_id', r.id, 'ref', r.ref, 'title', l.title, 'location_text', l.location_text,
    'visited_at', i.inspected_at, 'released_at', r.report_released_at, 'message', r.report_note,
    'verdict', i.verdict, 'verdict_reason', i.verdict_reason,
    'rent_matches', i.rent_matches, 'listing_matches', i.listing_matches,
    'neighborhood_type', i.neighborhood_type, 'nearby_landmarks', i.nearby_landmarks, 'notes', i.overall_notes,
    'findings', jsonb_build_array(
      jsonb_build_object('key', 'road',        'text', i.road_condition,    'matches', i.road_matches),
      jsonb_build_object('key', 'water',       'text', i.water_source,      'matches', i.water_matches),
      jsonb_build_object('key', 'electricity', 'text', i.electricity_notes, 'matches', i.electricity_matches),
      jsonb_build_object('key', 'network',     'text', i.network_notes,     'matches', i.network_matches),
      jsonb_build_object('key', 'security',    'text', i.security_notes,    'matches', i.security_matches),
      jsonb_build_object('key', 'condition',   'text', i.condition_notes,   'matches', i.condition_matches),
      jsonb_build_object('key', 'environment', 'text', i.environment_notes, 'matches', i.environment_matches)),
    'files', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.original_name, 'bytes', f.size_bytes) order by f.uploaded_at)
                         from public.inspection_evidence_files f
                        where f.inspection_id = i.id and f.discarded_at is null and f.review_status = 'accepted'), '[]'::jsonb));
end $f$;

-- internal: used only by the server route (service role). Returns null for anything that is not the caller's own, released, accepted file.
create or replace function public.eb_remote_report_file_path(p_uid uuid, p_file uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_path text; v_req uuid;
begin
  select f.storage_path, r.id into v_path, v_req
    from public.inspection_evidence_files f
    join public.inspection_jobs j on j.id = f.job_id
    join public.inspection_requests r on r.id = j.request_id and r.job_id = j.id
   where f.id = p_file and r.tenant_id = p_uid and r.status = 'completed' and r.report_released_at is not null
     and f.review_status = 'accepted' and f.discarded_at is null and f.inspection_id is not null;
  if v_path is null then return null; end if;
  perform public.eb_remote_event(v_req, 'report_file_opened', p_uid, null, null, null, jsonb_build_object('file_id', p_file));
  return v_path;
end $f$;

revoke all on function public.my_remote_inspection_report(uuid) from public, anon;
grant execute on function public.my_remote_inspection_report(uuid) to authenticated;
revoke all on function public.eb_remote_report_file_path(uuid, uuid) from public, anon, authenticated;

commit;

-- ROLLBACK:
-- drop function if exists public.my_remote_inspection_report(uuid), public.eb_remote_report_file_path(uuid, uuid);
