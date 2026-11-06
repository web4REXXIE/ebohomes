-- EboHomes 20261203_03: Phase 10.4 Step B - inspection review v3.
-- WHAT: (1) per-file accept/reject with reasons, (2) approval rules checked in the database, (3) admin-requested
--       supplementary evidence (originals kept, inspection stays under review), (4) second-inspector enforcement
--       with a recorded waiver, (5) a log of every time an admin opens an evidence file.
-- DOES NOT: change the guard trigger, any review_status value, the public view, storage, or the old direct insert (Step E).
-- GPS and capture method are warnings for the reviewer. They never prove presence or authenticity.
-- REQUIRES: 20261203_01 and 20261203_02, plus the live admin_review_inspection (20261027_03).
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. supplement requests
create table if not exists public.inspection_supplement_requests (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  job_id uuid not null,
  requested_by uuid not null,
  reason text not null check (char_length(btrim(reason)) >= 10),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  fulfilled_by uuid,
  fulfilled_note text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text
);
create unique index if not exists inspection_supplement_one_open
  on public.inspection_supplement_requests (inspection_id) where fulfilled_at is null and cancelled_at is null;

alter table public.inspection_supplement_requests enable row level security;
revoke all on public.inspection_supplement_requests from anon, authenticated, public;
grant select on public.inspection_supplement_requests to authenticated;
drop policy if exists "Admins read supplement requests" on public.inspection_supplement_requests;
create policy "Admins read supplement requests" on public.inspection_supplement_requests for select to authenticated using (public.is_admin());
drop policy if exists "Inspectors read own supplement requests" on public.inspection_supplement_requests;
create policy "Inspectors read own supplement requests" on public.inspection_supplement_requests for select to authenticated
  using (exists (select 1 from public.inspection_jobs j where j.id = job_id and j.inspector_id = auth.uid()));

-- ============================================================ 2. log every admin open of an evidence file (SERVER ONLY)
create or replace function public.eb_inspection_log_open(p_admin uuid, p_file uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare fl public.inspection_evidence_files; i public.property_inspections;
begin
  if p_admin is null or not exists (select 1 from public.profiles where id = p_admin and role = 'admin') then
    raise exception 'Only an administrator can open evidence.' using errcode = '42501';
  end if;
  select * into fl from public.inspection_evidence_files where id = p_file;
  if not found then raise exception 'File not found.' using errcode = 'P0002'; end if;
  if fl.inspection_id is not null then
    select * into i from public.property_inspections where id = fl.inspection_id;
    if i.inspected_by = p_admin then raise exception 'You cannot open evidence of your own inspection.' using errcode = '42501'; end if;
  end if;
  insert into public.inspection_evidence_events (job_id, inspection_id, file_id, event, actor_id, meta)
  values (fl.job_id, fl.inspection_id, p_file, 'file_opened', p_admin, jsonb_build_object('sha256', fl.sha256));
  return fl.storage_path;
end $f$;

-- ============================================================ 3. per-file review
create or replace function public.admin_review_inspection_file(p_file uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); fl public.inspection_evidence_files; i public.property_inspections;
        v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only a reviewer can review evidence.' using errcode = '42501'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Unknown decision.' using errcode = '22023'; end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Write a reason of at least 5 characters.' using errcode = '23514';
  end if;
  select * into fl from public.inspection_evidence_files where id = p_file for update;
  if not found or fl.inspection_id is null or fl.discarded_at is not null then raise exception 'Only a submitted file can be reviewed.' using errcode = 'P0002'; end if;
  select * into i from public.property_inspections where id = fl.inspection_id;
  if i.inspected_by = uid then raise exception 'You cannot review your own inspection.' using errcode = '42501'; end if;
  if i.review_status <> 'submitted' then raise exception 'This inspection already has a final decision.' using errcode = '22023'; end if;
  if p_decision = 'accepted' and not exists (
       select 1 from public.inspection_evidence_events e where e.file_id = p_file and e.event = 'file_opened' and e.actor_id = uid) then
    raise exception 'Open the file before you accept it.' using errcode = '23514';
  end if;
  update public.inspection_evidence_files
     set review_status = p_decision, review_note = v_note, reviewed_by = uid, reviewed_at = now() where id = p_file;
  insert into public.inspection_evidence_events (job_id, inspection_id, file_id, event, actor_id, note, meta)
  values (fl.job_id, fl.inspection_id, p_file, 'file_' || p_decision, uid, v_note, jsonb_build_object('phase', fl.phase, 'sha256', fl.sha256));
  perform public.audit_write('inspection_file_' || p_decision, 'inspection', fl.inspection_id, null,
          jsonb_build_object('file_id', p_file, 'kind', fl.kind, 'phase', fl.phase), v_note);
  return 'ok';
end $f$;

-- ============================================================ 4. second inspector: waiver and check
create or replace function public.admin_waive_second_inspector(p_inspection uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); i public.property_inspections; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Write a reason of at least 10 characters.' using errcode = '23514'; end if;
  select * into i from public.property_inspections where id = p_inspection for update;
  if not found then raise exception 'Inspection not found.' using errcode = 'P0002'; end if;
  if i.inspected_by = uid then raise exception 'You cannot do this on your own inspection.' using errcode = '42501'; end if;
  if i.review_status <> 'submitted' then raise exception 'This inspection already has a final decision.' using errcode = '22023'; end if;
  insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, note)
  values (i.job_id, p_inspection, 'second_inspector_waived', uid, v_reason);
  perform public.audit_write('inspection_second_inspector_waived', 'inspection', p_inspection, null, jsonb_build_object('listing_id', i.listing_id), v_reason);
  return 'ok';
end $f$;

-- ============================================================ 5. what still blocks approval (empty list = may approve)
-- Evidence rules apply to inspections submitted through the new flow (integrity_level = 'hashed'). Legacy inspections have no files.
-- Second inspector (when the job asks for one): a DIFFERENT inspector has a submitted or approved hashed inspection of the same
-- listing within 30 days, or an admin recorded a waiver with a reason.
create or replace function public.eb_inspection_approval_blockers(p_inspection uuid)
returns text[] language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare i public.property_inspections; j public.inspection_jobs; r text[] := '{}';
        v_pending int; v_ph int; v_tot int; v_second boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Only a reviewer can check this.' using errcode = '42501'; end if;
  select * into i from public.property_inspections where id = p_inspection;
  if not found then raise exception 'Inspection not found.' using errcode = 'P0002'; end if;
  if i.inspected_by = auth.uid() then r := r || 'You cannot approve your own inspection.'; end if;

  if exists (select 1 from public.inspection_supplement_requests where inspection_id = p_inspection and fulfilled_at is null and cancelled_at is null) then
    r := r || 'Additional evidence was requested and has not arrived yet.';
  end if;

  if i.integrity_level = 'hashed' then
    select count(*) filter (where review_status = 'pending'),
           count(*) filter (where review_status = 'accepted' and kind = 'photo'),
           count(*) filter (where review_status = 'accepted')
      into v_pending, v_ph, v_tot
      from public.inspection_evidence_files where inspection_id = p_inspection and discarded_at is null;
    if v_pending > 0 then r := r || (v_pending::text || ' file(s) not reviewed yet.'); end if;
    if v_ph < 3 then r := r || 'At least 3 photographs must be accepted.'; end if;
    if v_tot < 3 then r := r || 'At least 3 evidence files must be accepted.'; end if;
  end if;

  if i.job_id is not null then
    select * into j from public.inspection_jobs where id = i.job_id;
    if found and j.needs_second_inspector then
      select exists (
        select 1 from public.property_inspections o
         where o.listing_id = i.listing_id and o.id <> i.id and o.inspected_by is distinct from i.inspected_by
           and o.integrity_level = 'hashed' and o.review_status in ('submitted','approved')
           and o.inspected_at between i.inspected_at - interval '30 days' and i.inspected_at + interval '30 days') into v_second;
      if not v_second and not exists (
           select 1 from public.inspection_evidence_events e where e.inspection_id = p_inspection and e.event = 'second_inspector_waived') then
        r := r || 'A second, different inspector must submit their own evidence, or an administrator must record why not.';
      end if;
      if exists (select 1 from public.property_inspections o
                  where o.listing_id = i.listing_id and o.id <> i.id and o.inspected_by = auth.uid()
                    and o.inspected_at between i.inspected_at - interval '30 days' and i.inspected_at + interval '30 days') then
        r := r || 'You took part in inspecting this property and cannot approve it.';
      end if;
    end if;
  end if;
  return r;
end $f$;

-- ============================================================ 6. admin_review_inspection v4 (same signature, same behaviour, plus the blockers)
create or replace function public.admin_review_inspection(
  p_inspection_id uuid, p_decision text, p_note text default null, p_public_summary text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare
  v_insp public.property_inspections%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_sum text := nullif(btrim(coalesce(p_public_summary, '')), '');
  v_block text[];
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only a reviewer can review an inspection' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected','reinspect') then
    raise exception 'Unknown decision: %', p_decision using errcode = '22023';
  end if;
  select * into v_insp from public.property_inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found' using errcode = 'P0002'; end if;
  if p_decision = 'approved' and v_sum is null then
    raise exception 'A public summary is required to approve an inspection' using errcode = '23514';
  end if;
  if p_decision = 'approved' then
    v_block := public.eb_inspection_approval_blockers(p_inspection_id);
    if coalesce(array_length(v_block, 1), 0) > 0 then
      raise exception 'Cannot approve yet: %', array_to_string(v_block, ' ') using errcode = '23514';
    end if;
  end if;
  update public.property_inspections
     set review_status = p_decision, review_note = v_note,
         public_summary = case when p_decision = 'approved' then v_sum else public_summary end
   where id = p_inspection_id;
  if p_decision <> 'approved' then
    update public.inspection_supplement_requests
       set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = 'Inspection decided: ' || p_decision
     where inspection_id = p_inspection_id and fulfilled_at is null and cancelled_at is null;
  end if;
  if p_decision = 'approved' then
    update public.listings set status = 'pending' where id = v_insp.listing_id and status = 'inspection_required';
  elsif p_decision = 'reinspect' then
    insert into public.inspection_jobs (listing_id, reason, needs_second_inspector, created_by)
    values (v_insp.listing_id, 'reinspection', true, auth.uid());
  end if;
  return 'ok';
end;
$function$;

-- ============================================================ 7. supplementary evidence
create or replace function public.admin_request_inspection_supplement(p_inspection uuid, p_reason text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); i public.property_inspections; v_reason text := nullif(btrim(coalesce(p_reason, '')), ''); v_id uuid; v_insp uuid;
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only a reviewer can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Say what is needed, at least 10 characters.' using errcode = '23514'; end if;
  select * into i from public.property_inspections where id = p_inspection for update;
  if not found then raise exception 'Inspection not found.' using errcode = 'P0002'; end if;
  if i.inspected_by = uid then raise exception 'You cannot review your own inspection.' using errcode = '42501'; end if;
  if i.review_status <> 'submitted' then raise exception 'This inspection already has a final decision.' using errcode = '22023'; end if;
  if i.job_id is null then raise exception 'This older inspection has no job, so more evidence cannot be added. Ask for a new inspection.' using errcode = '22023'; end if;
  begin
    insert into public.inspection_supplement_requests (inspection_id, job_id, requested_by, reason)
    values (p_inspection, i.job_id, uid, v_reason) returning id into v_id;
  exception when unique_violation then
    raise exception 'A request for more evidence is already open.' using errcode = '23505';
  end;
  insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, note, meta)
  values (i.job_id, p_inspection, 'supplement_requested', uid, v_reason, jsonb_build_object('request_id', v_id));
  perform public.audit_write('inspection_supplement_requested', 'inspection', p_inspection, null, jsonb_build_object('request_id', v_id), v_reason);
  begin
    perform public.notify_user(i.inspected_by, 'More evidence needed',
      'EboHomes asked for more evidence for an inspection you submitted. Open your inspections to add it.', '/inspector', 'inspection');
  exception when others then null;
  end;
  return v_id;
end $f$;

create or replace function public.admin_cancel_inspection_supplement(p_request uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); q public.inspection_supplement_requests; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null or not coalesce(public.is_admin(), false) then raise exception 'Only a reviewer can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'A reason is required.' using errcode = '23514'; end if;
  select * into q from public.inspection_supplement_requests where id = p_request for update;
  if not found or q.fulfilled_at is not null or q.cancelled_at is not null then raise exception 'That request is not open.' using errcode = 'P0002'; end if;
  update public.inspection_supplement_requests set cancelled_at = now(), cancelled_by = uid, cancel_reason = v_reason where id = p_request;
  insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, note, meta)
  values (q.job_id, q.inspection_id, 'supplement_cancelled', uid, v_reason, jsonb_build_object('request_id', p_request));
  perform public.audit_write('inspection_supplement_cancelled', 'inspection', q.inspection_id, null, jsonb_build_object('request_id', p_request), v_reason);
  return 'ok';
end $f$;

create or replace function public.my_inspection_supplement_requests()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object('request_id', q.id, 'job_id', q.job_id, 'inspection_id', q.inspection_id,
           'reason', q.reason, 'requested_at', q.requested_at) order by q.requested_at), '[]'::jsonb)
  from public.inspection_supplement_requests q
  join public.inspection_jobs j on j.id = q.job_id
  where j.inspector_id = auth.uid() and q.fulfilled_at is null and q.cancelled_at is null
$f$;

create or replace function public.my_supplement_staged_files(p_request uuid)
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'kind', f.kind, 'name', f.original_name, 'bytes', f.size_bytes,
           'capture_method', f.capture_method, 'uploaded_at', f.uploaded_at) order by f.uploaded_at), '[]'::jsonb)
  from public.inspection_supplement_requests q
  join public.inspection_evidence_files f on f.job_id = q.job_id
  where q.id = p_request and f.uploaded_by = auth.uid() and f.phase = 'supplement' and f.inspection_id is null and f.discarded_at is null
$f$;

-- Register one supplementary file (SERVER ONLY). The route has already read the bytes, checked the type and computed the SHA-256.
create or replace function public.eb_inspection_register_supplement_file(
  p_user uuid, p_request uuid, p_kind text, p_path text, p_name text, p_mime text, p_size bigint, p_sha256 text, p_method text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare q public.inspection_supplement_requests; j public.inspection_jobs; v_id uuid; v_max int; v_method text := coalesce(nullif(p_method, ''), 'unknown');
begin
  if not exists (select 1 from public.inspectors where user_id = p_user and status = 'active') then
    raise exception 'Only an active inspector can add evidence.' using errcode = '42501';
  end if;
  select * into q from public.inspection_supplement_requests where id = p_request for update;
  if not found or q.fulfilled_at is not null or q.cancelled_at is not null then raise exception 'This request for more evidence is not open.' using errcode = '22023'; end if;
  select * into j from public.inspection_jobs where id = q.job_id;
  if j.inspector_id is distinct from p_user then raise exception 'This inspection is not assigned to you.' using errcode = '42501'; end if;
  if p_kind not in ('photo','video') then raise exception 'Unknown file kind.' using errcode = '22023'; end if;
  if not ((p_kind = 'photo' and p_mime in ('image/jpeg','image/png','image/webp')) or (p_kind = 'video' and p_mime in ('video/mp4','video/webm'))) then
    raise exception 'This file type is not accepted.' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 or (p_kind = 'photo' and p_size > 10 * 1024 * 1024) or (p_kind = 'video' and p_size > 100 * 1024 * 1024) then
    raise exception 'This file is too large (photos up to 10 MB, videos up to 100 MB).' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Invalid file fingerprint.' using errcode = '22023'; end if;
  if p_path is null or left(p_path, length(p_user::text) + length(j.id::text) + 2) <> p_user::text || '/' || j.id::text || '/' then
    raise exception 'Invalid file location.' using errcode = '22023';
  end if;
  if v_method not in ('camera','gallery','unknown') then v_method := 'unknown'; end if;
  select max_files_per_job into v_max from public.inspection_settings where id;
  if (select count(*) from public.inspection_evidence_files where job_id = j.id and discarded_at is null) >= coalesce(v_max, 30) then
    raise exception 'Too many files for this inspection.' using errcode = '22023';
  end if;
  if exists (select 1 from public.inspection_evidence_files where job_id = j.id and sha256 = p_sha256 and discarded_at is null) then
    raise exception 'This exact file is already part of this inspection.' using errcode = '23505';
  end if;
  insert into public.inspection_evidence_files
    (job_id, listing_id, uploaded_by, kind, storage_path, original_name, mime_type, size_bytes, sha256, capture_method, phase)
  values (j.id, j.listing_id, p_user, p_kind, p_path, left(p_name, 200), p_mime, p_size, p_sha256, v_method, 'supplement')
  returning id into v_id;
  insert into public.inspection_evidence_events (job_id, inspection_id, file_id, event, actor_id, meta)
  values (j.id, q.inspection_id, v_id, 'file_staged', p_user, jsonb_build_object('phase', 'supplement', 'request_id', p_request, 'kind', p_kind, 'capture_method', v_method));
  return v_id;
end $f$;

-- Send the supplementary files. The inspection stays 'submitted' (under review) and the new files start as 'pending'.
create or replace function public.submit_inspection_supplement(p_request uuid, p_note text default null)
returns integer language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); q public.inspection_supplement_requests; j public.inspection_jobs; v_files uuid[]; v_n int;
        v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 1000);
begin
  if uid is null or not exists (select 1 from public.inspectors where user_id = uid and status = 'active') then
    raise exception 'Only an active inspector can do this.' using errcode = '42501';
  end if;
  select * into q from public.inspection_supplement_requests where id = p_request for update;
  if not found or q.fulfilled_at is not null or q.cancelled_at is not null then raise exception 'This request for more evidence is not open.' using errcode = '22023'; end if;
  select * into j from public.inspection_jobs where id = q.job_id;
  if j.inspector_id is distinct from uid then raise exception 'This inspection is not assigned to you.' using errcode = '42501'; end if;
  select array_agg(f.id), count(*) into v_files, v_n from public.inspection_evidence_files f
   where f.job_id = q.job_id and f.uploaded_by = uid and f.phase = 'supplement' and f.inspection_id is null and f.discarded_at is null;
  if coalesce(v_n, 0) < 1 then raise exception 'Add at least one file first.' using errcode = '23514'; end if;
  update public.inspection_evidence_files set inspection_id = q.inspection_id, submitted_at = now() where id = any(v_files);
  update public.inspection_supplement_requests set fulfilled_at = now(), fulfilled_by = uid, fulfilled_note = v_note where id = p_request;
  insert into public.inspection_evidence_events (job_id, inspection_id, event, actor_id, note, meta)
  values (q.job_id, q.inspection_id, 'supplement_submitted', uid, v_note, jsonb_build_object('request_id', p_request, 'files', v_n, 'request_reason', q.reason));
  perform public.audit_write('inspection_supplement_submitted', 'inspection', q.inspection_id, null, jsonb_build_object('request_id', p_request, 'files', v_n), v_note);
  return v_n;
end $f$;

-- ============================================================ 8. who may call what
revoke all on function public.eb_inspection_log_open(uuid, uuid) from public, anon, authenticated;
revoke all on function public.eb_inspection_register_supplement_file(uuid, uuid, text, text, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.eb_inspection_log_open(uuid, uuid) to service_role;
grant execute on function public.eb_inspection_register_supplement_file(uuid, uuid, text, text, text, text, bigint, text, text) to service_role;

revoke all on function public.admin_review_inspection_file(uuid, text, text) from public, anon;
revoke all on function public.admin_waive_second_inspector(uuid, text) from public, anon;
revoke all on function public.eb_inspection_approval_blockers(uuid) from public, anon;
revoke all on function public.admin_request_inspection_supplement(uuid, text) from public, anon;
revoke all on function public.admin_cancel_inspection_supplement(uuid, text) from public, anon;
revoke all on function public.my_inspection_supplement_requests() from public, anon;
revoke all on function public.my_supplement_staged_files(uuid) from public, anon;
revoke all on function public.submit_inspection_supplement(uuid, text) from public, anon;
revoke all on function public.admin_review_inspection(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_inspection_file(uuid, text, text) to authenticated;
grant execute on function public.admin_waive_second_inspector(uuid, text) to authenticated;
grant execute on function public.eb_inspection_approval_blockers(uuid) to authenticated;
grant execute on function public.admin_request_inspection_supplement(uuid, text) to authenticated;
grant execute on function public.admin_cancel_inspection_supplement(uuid, text) to authenticated;
grant execute on function public.my_inspection_supplement_requests() to authenticated;
grant execute on function public.my_supplement_staged_files(uuid) to authenticated;
grant execute on function public.submit_inspection_supplement(uuid, text) to authenticated;
grant execute on function public.admin_review_inspection(uuid, text, text, text) to authenticated;

commit;

-- ROLLBACK (restores the previous admin_review_inspection from 20261027_03 by re-running that function block):
-- drop function if exists public.eb_inspection_log_open(uuid, uuid), public.admin_review_inspection_file(uuid, text, text),
--   public.admin_waive_second_inspector(uuid, text), public.eb_inspection_approval_blockers(uuid),
--   public.admin_request_inspection_supplement(uuid, text), public.admin_cancel_inspection_supplement(uuid, text),
--   public.my_inspection_supplement_requests(), public.my_supplement_staged_files(uuid), public.submit_inspection_supplement(uuid, text),
--   public.eb_inspection_register_supplement_file(uuid, uuid, text, text, text, text, bigint, text, text);
-- drop table if exists public.inspection_supplement_requests;
