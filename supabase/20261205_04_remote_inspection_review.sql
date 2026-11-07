-- EboHomes 20261205_04: Phase 10.6 Step E1 - the inspector's report reaches the tenant's request, and an admin decides what happens to it.
-- WHAT:
--   (1) when the assigned inspector submits a remote inspection, its request moves from 'scheduled' to 'in_review' and the admins are told;
--   (2) admin_remote_review_queue / admin_remote_review_detail  - what an admin needs to review a remote submission (admin only);
--   (3) admin_remote_review_decide - release the report to the tenant, ask for another visit, or reject the submission. Needs a second person:
--       the inspector, the tenant and the landlord of that request can never be the reviewer;
--   (4) the money held for a released inspection stays counted in the remote budget until the payout step (Step F) records the expense;
--   (5) PRIVACY FIX: a tenant could read their own request row straight from the table, including the landlord's note and the review notes.
--       That policy is removed. Tenants already use my_remote_inspection_requests(), which shows progress only.
-- NO FEES: nothing here touches a tenant's money. A released report is free.
-- DOES NOT: publish anything, grant or change the Inspected badge, touch the public view, listings, applications, viewings, risk flags,
--   or pay anyone. A remote inspection keeps review_status 'submitted' on purpose: the decision lives on the request.
-- REQUIRES: 20261205_01, _02 and _03; eb_inspection_approval_blockers(); notify_user(); notify_admins(); audit_write().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. what the tenant may be told with the report (optional, written by the reviewer)
alter table public.inspection_requests add column if not exists report_note text;
alter table public.inspection_requests drop constraint if exists inspection_requests_report_note_chk;
alter table public.inspection_requests add constraint inspection_requests_report_note_chk check (report_note is null or char_length(report_note) <= 500);

-- ============================================================ 2. submission moves the request to review
create or replace function public.eb_remote_job_submitted()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.inspection_requests; v_title text;
begin
  update public.inspection_requests set status = 'in_review', updated_at = now()
   where id = new.request_id and job_id = new.id and status = 'scheduled'
   returning * into r;
  if not found then return new; end if;

  perform public.eb_remote_event(r.id, 'inspector_submitted', new.inspector_id, 'scheduled', 'in_review', null, jsonb_build_object('job_id', new.id));
  perform public.eb_remote_audit('remote_inspection_submitted', r.id, jsonb_build_object('status', 'scheduled'), jsonb_build_object('status', 'in_review'), null);
  begin
    select title into v_title from public.listings where id = r.listing_id;
    perform public.notify_admins('Remote inspection ready for review', r.ref || ' was submitted. Check the evidence before the tenant sees anything.', '/admin/remote-inspection-reviews', 'general');
    perform public.notify_user(r.tenant_id, 'Your inspector has finished',
      'The visit to "' || coalesce(v_title, 'the property') || '" is done. EboHomes is checking the report before you can read it.', '/inspections', 'general');
  exception when others then
    null;   -- a notification problem must never block the inspector's submission
  end;
  return new;
end $f$;
revoke all on function public.eb_remote_job_submitted() from public, anon, authenticated;

drop trigger if exists zz_remote_job_submitted on public.inspection_jobs;
create trigger zz_remote_job_submitted after update of status on public.inspection_jobs
  for each row when (new.service_type = 'remote' and old.status = 'assigned' and new.status = 'submitted' and new.request_id is not null)
  execute function public.eb_remote_job_submitted();

-- ============================================================ 3. the remote budget keeps the money of a released inspection until Step F records the expense
create or replace function public.eb_remote_budget_available()
returns numeric language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce((select sum(case kind when 'allocation' then amount else -amount end)
                     from public.inspection_budget_ledger where service_type = 'remote'), 0)
       - coalesce((select sum(budget_reserved) from public.inspection_requests
                    where status in ('offered','scheduled','in_review') or (status = 'completed' and budget_reserved > 0)), 0)
$f$;
revoke all on function public.eb_remote_budget_available() from public, anon, authenticated;

-- ============================================================ 4. internal: the review submission of a request, and who may not review it
create or replace function public.eb_remote_review_target(p_request uuid, p_uid uuid, p_lock boolean default false)
returns public.property_inspections language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.inspection_requests; i public.property_inspections;
begin
  if p_lock then select * into r from public.inspection_requests where id = p_request for update;
  else select * into r from public.inspection_requests where id = p_request; end if;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if r.status <> 'in_review' then raise exception 'This request is not waiting for review.' using errcode = '22023'; end if;
  if r.job_id is null then raise exception 'No inspection is linked to this request.' using errcode = '22023'; end if;
  select * into i from public.property_inspections where job_id = r.job_id order by inspected_at desc limit 1;
  if not found then raise exception 'The inspector has not submitted a report yet.' using errcode = '22023'; end if;
  if i.inspected_by = p_uid or r.tenant_id = p_uid or r.landlord_id is not distinct from p_uid then
    raise exception 'You cannot review this inspection because you are involved in it.' using errcode = '42501';
  end if;
  return i;
end $f$;
revoke all on function public.eb_remote_review_target(uuid, uuid, boolean) from public, anon, authenticated;

-- ============================================================ 5. admin: the review queue
create or replace function public.admin_remote_review_queue()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); v jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'submitted_at'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', r.id, 'ref', r.ref, 'title', l.title, 'location_text', l.location_text,
      'inspector_name', n.full_name, 'submitted_at', i.inspected_at, 'verdict', i.verdict, 'gps_flag', i.gps_flag,
      'files_total', (select count(*) from public.inspection_evidence_files f where f.inspection_id = i.id and f.discarded_at is null),
      'files_pending', (select count(*) from public.inspection_evidence_files f where f.inspection_id = i.id and f.discarded_at is null and f.review_status = 'pending'),
      'extra_requested', exists (select 1 from public.inspection_supplement_requests s where s.inspection_id = i.id and s.fulfilled_at is null and s.cancelled_at is null),
      'involved', (i.inspected_by = uid or r.tenant_id = uid or r.landlord_id is not distinct from uid)) as x
      from public.inspection_requests r
      join lateral (select * from public.property_inspections p where p.job_id = r.job_id order by p.inspected_at desc limit 1) i on true
      left join public.listings l on l.id = r.listing_id
      left join public.inspectors n on n.user_id = i.inspected_by
     where r.status = 'in_review'
  ) q;
  return v;
end $f$;

-- ============================================================ 6. admin: everything about one submission (admins only, never shown to the tenant or landlord)
create or replace function public.admin_remote_review_detail(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); i public.property_inspections; r public.inspection_requests; l record;
begin
  i := public.eb_remote_review_target(p_request, uid);
  select * into r from public.inspection_requests where id = p_request;
  select title, location_text into l from public.listings where id = r.listing_id;
  return jsonb_build_object(
    'request', jsonb_build_object('id', r.id, 'ref', r.ref, 'title', l.title, 'location_text', l.location_text, 'scheduled_for', r.scheduled_for),
    'inspection', to_jsonb(i) - 'evidence_paths',
    'files', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'kind', f.kind, 'name', f.original_name, 'bytes', f.size_bytes, 'capture_method', f.capture_method, 'phase', f.phase,
        'uploaded_at', f.uploaded_at, 'review_status', f.review_status, 'review_note', f.review_note,
        'opened_by_me', exists (select 1 from public.inspection_evidence_events e where e.file_id = f.id and e.event = 'file_opened' and e.actor_id = uid),
        'duplicates', (select count(distinct o.job_id) from public.inspection_evidence_files o where o.sha256 = f.sha256 and o.job_id <> f.job_id and o.discarded_at is null))
        order by f.uploaded_at)
      from public.inspection_evidence_files f where f.inspection_id = i.id and f.discarded_at is null), '[]'::jsonb),
    'extra', (select jsonb_build_object('id', s.id, 'reason', s.reason, 'requested_at', s.requested_at)
                from public.inspection_supplement_requests s where s.inspection_id = i.id and s.fulfilled_at is null and s.cancelled_at is null limit 1),
    'blockers', to_jsonb(public.eb_inspection_approval_blockers(i.id)));
end $f$;

-- ============================================================ 7. admin: decide
-- released  : the tenant can read the report. Needs every file reviewed and at least 3 accepted photographs (the same blockers as a verification).
-- reinspect : the report is not good enough; the request goes back to the assignment queue for another visit. A reason is required.
-- rejected  : the submission is not accepted and the request is closed. A reason is required. Nothing is charged to anyone.
create or replace function public.admin_remote_review_decide(p_request uuid, p_decision text, p_note text default null, p_report_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := public.eb_remote_require_admin();
  r public.inspection_requests; i public.property_inspections; s public.remote_inspection_settings; v_block text[]; v_due timestamptz; v_title text;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_report text := left(nullif(btrim(coalesce(p_report_note, '')), ''), 500);
begin
  if p_decision not in ('released','reinspect','rejected') then raise exception 'Choose release, another visit or reject.' using errcode = '22023'; end if;
  if p_decision <> 'released' and (v_note is null or char_length(v_note) < 5) then
    raise exception 'Write the reason, at least 5 characters.' using errcode = '23514';
  end if;
  i := public.eb_remote_review_target(p_request, uid, true);
  select * into r from public.inspection_requests where id = p_request;
  select title into v_title from public.listings where id = r.listing_id;

  if p_decision = 'released' then
    v_block := public.eb_inspection_approval_blockers(i.id);
    if coalesce(array_length(v_block, 1), 0) > 0 then
      raise exception 'Cannot release yet: %', array_to_string(v_block, ' ') using errcode = '23514';
    end if;
    update public.inspection_requests
       set status = 'completed', review_decision = 'released', reviewed_by = uid, reviewed_at = now(), review_note = v_note,
           report_note = v_report, report_released_at = now(), updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'report_released', uid, 'in_review', 'completed', v_note, jsonb_build_object('inspection_id', i.id, 'verdict', i.verdict));
    perform public.audit_write('remote_inspection_released', 'inspection_request', p_request,
      jsonb_build_object('status', 'in_review'), jsonb_build_object('status', 'completed', 'inspection_id', i.id, 'verdict', i.verdict), v_note);
    perform public.notify_user(r.tenant_id, 'Your inspection report is ready',
      'The report for "' || coalesce(v_title, 'the property') || '" is ready. It is private to you.', '/inspections', 'general');
    if r.landlord_id is not null then
      perform public.notify_user(r.landlord_id, 'Inspection completed',
        'An EboHomes inspector visited "' || coalesce(v_title, 'your property') || '". Thank you for giving access. Nothing else is needed from you.', '/dashboard/inspection-requests', 'general');
    end if;
    perform public.notify_user(i.inspected_by, 'Inspection accepted', 'EboHomes accepted your inspection report.', '/inspector', 'general');
    return 'ok';
  end if;

  -- reinspect and rejected: any open request for more evidence is cancelled, like the verification review does
  update public.inspection_supplement_requests
     set cancelled_at = now(), cancelled_by = uid, cancel_reason = 'Remote inspection decided: ' || p_decision
   where inspection_id = i.id and fulfilled_at is null and cancelled_at is null;

  if p_decision = 'reinspect' then
    select * into s from public.remote_inspection_settings where id;
    v_due := public.eb_add_working_minutes(now(), s.assign_timeout_hours * 60);
    update public.inspection_requests
       set status = 'ready_for_assignment', review_decision = 'reinspect', reviewed_by = uid, reviewed_at = now(), review_note = v_note,
           job_id = null, offered_inspector = null, offer_due_at = null, scheduled_for = null, budget_reserved = 0,
           ready_at = now(), assign_due_at = v_due, escalated_at = null, updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'reinspection_required', uid, 'in_review', 'ready_for_assignment', v_note,
      jsonb_build_object('inspection_id', i.id, 'inspector', i.inspected_by, 'assign_due_at', v_due));
    perform public.audit_write('remote_inspection_reinspect', 'inspection_request', p_request,
      jsonb_build_object('status', 'in_review'), jsonb_build_object('status', 'ready_for_assignment'), v_note);
    perform public.notify_user(r.tenant_id, 'We need another visit',
      'The first visit to "' || coalesce(v_title, 'the property') || '" did not give a report we can stand behind. EboHomes is arranging another one. Nothing was charged.', '/inspections', 'general');
    perform public.notify_user(i.inspected_by, 'Inspection not accepted', 'EboHomes could not accept your report and will arrange another visit.', '/inspector', 'general');
  else
    update public.inspection_requests
       set status = 'closed', review_decision = 'rejected', reviewed_by = uid, reviewed_at = now(), review_note = v_note,
           closed_reason = 'The inspection could not be accepted', budget_reserved = 0, updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'report_rejected', uid, 'in_review', 'closed', v_note, jsonb_build_object('inspection_id', i.id, 'inspector', i.inspected_by));
    perform public.audit_write('remote_inspection_rejected', 'inspection_request', p_request,
      jsonb_build_object('status', 'in_review'), jsonb_build_object('status', 'closed'), v_note);
    perform public.notify_user(r.tenant_id, 'We could not complete your inspection',
      'We could not produce a report we can stand behind for "' || coalesce(v_title, 'the property') || '". Nothing was charged. You are welcome to ask again.', '/inspections', 'general');
    perform public.notify_user(i.inspected_by, 'Inspection not accepted', 'EboHomes could not accept your submission. An administrator may contact you.', '/inspector', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 8. privacy fix: tenants no longer read the request table directly
drop policy if exists "Tenants read own inspection requests" on public.inspection_requests;

-- ============================================================ 9. who may call what
revoke all on function public.eb_remote_review_target(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.admin_remote_review_queue() from public, anon;
revoke all on function public.admin_remote_review_detail(uuid) from public, anon;
revoke all on function public.admin_remote_review_decide(uuid, text, text, text) from public, anon;
grant execute on function public.admin_remote_review_queue() to authenticated;
grant execute on function public.admin_remote_review_detail(uuid) to authenticated;
grant execute on function public.admin_remote_review_decide(uuid, text, text, text) to authenticated;

commit;

-- ROLLBACK (only while no remote request is in review):
-- drop trigger if exists zz_remote_job_submitted on public.inspection_jobs;
-- drop function if exists public.eb_remote_job_submitted(), public.eb_remote_review_target(uuid, uuid, boolean),
--   public.admin_remote_review_queue(), public.admin_remote_review_detail(uuid), public.admin_remote_review_decide(uuid, text, text, text);
-- create policy "Tenants read own inspection requests" on public.inspection_requests for select to authenticated using (tenant_id = auth.uid());
-- alter table public.inspection_requests drop constraint if exists inspection_requests_report_note_chk, drop column if exists report_note;
-- (eb_remote_budget_available keeps working either way; to restore the old text, re-run it from 20261205_03.)
