-- EboHomes 20261205_03: Phase 10.6 Step D - admin queue, inspector suggestions, offer/accept/decline, return to queue, budget check, timers.
-- WHAT: the admin side and the inspector side of a tenant-requested remote inspection.
--   admin_remote_queue                - open requests with their deadlines, the remote budget and the cost of one inspection.
--   admin_remote_suggest_inspectors   - active inspectors ranked by area, current workload and past approved work. The admin decides.
--   admin_remote_offer                - offer a request to one inspector. Checks the property, the access time and the remote budget. Reserves the cost.
--   inspector_my_remote_offers        - the inspector's offers and booked visits. Access notes appear only after the inspector accepts.
--   inspector_respond_remote_offer    - accept (creates the remote job, books the visit) or decline with a reason.
--   admin_remote_return_to_queue      - take a request back from an inspector (declined, no-show, reassignment). A reason is required.
--   admin_remote_add_budget           - add money to the REMOTE budget ledger. The verification budget is never touched.
--   admin_remote_save_settings        - change deadlines, fair-use limits and the cost per inspection.
--   eb_run_remote_inspection_timers   - the deadlines: landlord silence, access time passed, offer expiry, escalation, unassigned timeout,
--                                       property no longer available, overdue visit. Called by cron (service role) or by an admin button.
-- NO FEES: nothing here takes money from a tenant. Budget is EboHomes' own money for remote inspections.
-- DOES NOT: release reports, pay inspectors, or touch applications, viewings, listings or the public view (Steps E and F).
-- REQUIRES: 20261205_01 and 20261205_02, inspection_jobs, inspectors (user_id, status, full_name, areas), property_inspections, is_admin(),
--           notify_user(), notify_admins(), audit_write().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. two more configurable deadlines
alter table public.remote_inspection_settings add column if not exists rescheduling_expiry_days int not null default 7;
alter table public.remote_inspection_settings add column if not exists visit_grace_hours int not null default 2;
alter table public.remote_inspection_settings drop constraint if exists remote_inspection_settings_resched_chk;
alter table public.remote_inspection_settings add constraint remote_inspection_settings_resched_chk check (rescheduling_expiry_days between 1 and 60);
alter table public.remote_inspection_settings drop constraint if exists remote_inspection_settings_grace_chk;
alter table public.remote_inspection_settings add constraint remote_inspection_settings_grace_chk check (visit_grace_hours between 1 and 72);

-- ============================================================ 2. internal helpers (nobody can call these directly)
create or replace function public.eb_remote_require_admin()
returns uuid language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  return auth.uid();
end $f$;
revoke all on function public.eb_remote_require_admin() from public, anon, authenticated;

-- audit that never blocks a timer run
create or replace function public.eb_remote_audit(p_action text, p_request uuid, p_old jsonb, p_new jsonb, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  perform public.audit_write(p_action, 'inspection_request', p_request, p_old, p_new, p_note);
exception when others then
  null;
end $f$;
revoke all on function public.eb_remote_audit(text, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- cancel the remote job of a request (only before it is submitted)
create or replace function public.eb_remote_cancel_job(p_job uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if p_job is null then return; end if;
  perform set_config('eb.remote_ok', '1', true);
  update public.inspection_jobs set status = 'cancelled' where id = p_job and status in ('requested','assigned');
  perform set_config('eb.remote_ok', '', true);
end $f$;
revoke all on function public.eb_remote_cancel_job(uuid) from public, anon, authenticated;

-- money still free in the REMOTE budget: allocations - expenses - what open requests have reserved
create or replace function public.eb_remote_budget_available()
returns numeric language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce((select sum(case kind when 'allocation' then amount else -amount end)
                     from public.inspection_budget_ledger where service_type = 'remote'), 0)
       - coalesce((select sum(budget_reserved) from public.inspection_requests where status in ('offered','scheduled','in_review')), 0)
$f$;
revoke all on function public.eb_remote_budget_available() from public, anon, authenticated;

-- ============================================================ 3. admin: the queue
create or replace function public.admin_remote_queue()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare s public.remote_inspection_settings; v_rows jsonb;
begin
  perform public.eb_remote_require_admin();
  select * into s from public.remote_inspection_settings where id;
  select coalesce(jsonb_agg(x order by x->>'sort', x->>'created_at'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'id', r.id, 'ref', r.ref, 'status', r.status, 'listing_id', r.listing_id, 'title', l.title, 'location_text', l.location_text,
      'landlord_response', r.landlord_response, 'landlord_due_at', r.landlord_due_at, 'landlord_time', r.landlord_time, 'landlord_note', r.landlord_note,
      'ready_at', r.ready_at, 'assign_due_at', r.assign_due_at, 'escalated_at', r.escalated_at,
      'offered_inspector', r.offered_inspector, 'inspector_name', i.full_name, 'offer_due_at', r.offer_due_at,
      'scheduled_for', r.scheduled_for, 'job_id', r.job_id, 'budget_reserved', r.budget_reserved,
      'sort', case r.status when 'ready_for_assignment' then '1' when 'offered' then '2' when 'scheduled' then '3' when 'awaiting_rescheduling' then '4' else '5' end,
      'created_at', r.created_at) as x
      from public.inspection_requests r
      left join public.listings l on l.id = r.listing_id
      left join public.inspectors i on i.user_id = r.offered_inspector
     where r.status in ('awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled')
  ) q;
  return jsonb_build_object('requests', v_rows, 'budget_available', public.eb_remote_budget_available(), 'cost_per_inspection', s.cost_per_inspection,
    'enforce_budget', s.enforce_budget, 'settings', to_jsonb(s) - 'updated_by');
end $f$;

-- ============================================================ 4. admin: who could do it (a suggestion; the admin decides)
create or replace function public.admin_remote_suggest_inspectors(p_request uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare r public.inspection_requests; l record; v jsonb;
begin
  perform public.eb_remote_require_admin();
  select * into r from public.inspection_requests where id = p_request;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  select location_text into l from public.listings where id = r.listing_id;
  select coalesce(jsonb_agg(x order by (x->>'area_match')::boolean desc, (x->>'declined_this')::boolean asc,
                            (x->>'workload')::int asc, (x->>'approved_work')::int desc), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'user_id', i.user_id, 'name', i.full_name, 'areas', i.areas,
      'area_match', coalesce((select bool_or(btrim(t) <> '' and position(lower(btrim(t)) in lower(coalesce(l.location_text, ''))) > 0)
                                from unnest(string_to_array(coalesce(i.areas, ''), ',')) t), false),
      'workload', (select count(*) from public.inspection_jobs j where j.inspector_id = i.user_id and j.status = 'assigned')
                + (select count(*) from public.inspection_requests o where o.offered_inspector = i.user_id and o.status = 'offered'),
      'approved_work', (select count(*) from public.property_inspections p where p.inspected_by = i.user_id and p.review_status = 'approved'),
      'declined_this', exists (select 1 from public.inspection_request_events e
                                where e.request_id = p_request and e.event in ('inspector_declined','offer_expired') and e.meta->>'inspector' = i.user_id::text)
    ) as x
    from public.inspectors i
    where i.status = 'active' and i.user_id <> r.tenant_id and i.user_id is distinct from r.landlord_id and i.user_id <> auth.uid()
  ) q;
  return v;
end $f$;

-- ============================================================ 5. admin: offer a request to one inspector
create or replace function public.admin_remote_offer(p_request uuid, p_inspector uuid, p_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := public.eb_remote_require_admin();
  r public.inspection_requests; s public.remote_inspection_settings; v_problem text; v_prev text; v_prev_insp uuid;
  v_due timestamptz; v_avail numeric; v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  select * into r from public.inspection_requests where id = p_request for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if r.status not in ('ready_for_assignment','offered') then
    raise exception 'This request is not waiting for an inspector.' using errcode = '22023';
  end if;
  v_prev := r.status; v_prev_insp := r.offered_inspector;
  if v_prev = 'offered' and (v_note is null or char_length(v_note) < 3) then
    raise exception 'Give a short reason for changing the inspector.' using errcode = '23514';
  end if;
  select * into s from public.remote_inspection_settings where id;

  v_problem := public.eb_remote_listing_problem(r.listing_id);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
  if r.landlord_time is null or r.landlord_time <= now() + make_interval(mins => s.inspector_accept_minutes) then
    raise exception 'The access time the landlord gave has passed or is too close. Wait for the landlord to give a new time.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inspectors where user_id = p_inspector and status = 'active') then
    raise exception 'Choose an active inspector.' using errcode = '22023';
  end if;
  if p_inspector = uid then raise exception 'You cannot assign an inspection to yourself.' using errcode = '42501'; end if;
  if p_inspector = r.tenant_id or p_inspector is not distinct from r.landlord_id then
    raise exception 'This inspector is the tenant or the landlord of this request.' using errcode = '42501';
  end if;

  -- the remote budget: EboHomes must not confirm an inspection it cannot fund
  v_avail := public.eb_remote_budget_available() + coalesce(r.budget_reserved, 0);
  if s.enforce_budget and s.cost_per_inspection > 0 and v_avail < s.cost_per_inspection then
    raise exception 'The remote inspection budget cannot cover this inspection. Add budget first.' using errcode = '23514';
  end if;

  v_due := now() + make_interval(mins => s.inspector_accept_minutes);
  update public.inspection_requests
     set status = 'offered', offered_inspector = p_inspector, offer_due_at = v_due, budget_reserved = s.cost_per_inspection, updated_at = now()
   where id = p_request;

  perform public.eb_remote_event(p_request, 'offered', uid, v_prev, 'offered', v_note,
    jsonb_build_object('inspector', p_inspector, 'previous_inspector', v_prev_insp, 'offer_due_at', v_due, 'reserved', s.cost_per_inspection));
  perform public.audit_write('remote_inspection_offered', 'inspection_request', p_request,
    jsonb_build_object('status', v_prev, 'inspector', v_prev_insp), jsonb_build_object('status', 'offered', 'inspector', p_inspector), v_note);

  perform public.notify_user(p_inspector, 'New inspection offer',
    'You have an inspection offer. Please accept or decline within ' || s.inspector_accept_minutes || ' minutes.', '/inspector', 'general');
  if v_prev_insp is not null and v_prev_insp <> p_inspector then
    perform public.notify_user(v_prev_insp, 'Inspection offer withdrawn', 'An inspection offered to you was given to someone else. You do not need to do anything.', '/inspector', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 6. inspector: see offers and booked visits
create or replace function public.inspector_my_remote_offers()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'ref', r.ref, 'status', r.status, 'title', l.title, 'location_text', l.location_text,
           'access_time', r.landlord_time, 'offer_due_at', r.offer_due_at, 'job_id', r.job_id,
           'access_note', case when r.status = 'scheduled' then r.landlord_note end) order by r.landlord_time), '[]'::jsonb)
    from public.inspection_requests r
    left join public.listings l on l.id = r.listing_id
   where r.offered_inspector = auth.uid() and r.status in ('offered','scheduled')
     and exists (select 1 from public.inspectors i where i.user_id = auth.uid() and i.status = 'active')
$f$;

-- ============================================================ 7. inspector: accept or decline
create or replace function public.inspector_respond_remote_offer(p_request uuid, p_decision text, p_reason text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid(); r public.inspection_requests; s public.remote_inspection_settings; v_job uuid; v_title text; v_when text;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300); v_problem text;
begin
  if uid is null or not exists (select 1 from public.inspectors where user_id = uid and status = 'active') then
    raise exception 'Only an active inspector can answer an offer.' using errcode = '42501';
  end if;
  if p_decision not in ('accept','decline') then raise exception 'Choose accept or decline.' using errcode = '22023'; end if;
  select * into r from public.inspection_requests where id = p_request for update;
  if not found or r.offered_inspector is distinct from uid or r.status <> 'offered' then
    raise exception 'This offer is no longer open.' using errcode = 'P0002';
  end if;
  if r.offer_due_at is not null and r.offer_due_at < now() then
    raise exception 'This offer has expired and went back to the queue.' using errcode = '22023';
  end if;
  select * into s from public.remote_inspection_settings where id;
  select title into v_title from public.listings where id = r.listing_id;

  if p_decision = 'accept' then
    v_problem := public.eb_remote_listing_problem(r.listing_id);
    if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
    if r.landlord_time is null or r.landlord_time <= now() then
      raise exception 'The access time has passed. The landlord must give a new time.' using errcode = '22023';
    end if;
    perform set_config('eb.remote_ok', '1', true);
    insert into public.inspection_jobs (listing_id, reason, needs_second_inspector, created_by, service_type, request_id)
    values (r.listing_id, 'Tenant-requested remote inspection ' || r.ref, false, uid, 'remote', r.id)
    returning id into v_job;
    update public.inspection_jobs set inspector_id = uid, status = 'assigned' where id = v_job;
    perform set_config('eb.remote_ok', '', true);

    update public.inspection_requests
       set status = 'scheduled', job_id = v_job, scheduled_for = r.landlord_time, offer_due_at = null, updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'inspector_accepted', uid, 'offered', 'scheduled', null,
      jsonb_build_object('inspector', uid, 'job_id', v_job, 'scheduled_for', r.landlord_time));
    perform public.audit_write('remote_inspection_accepted', 'inspection_request', p_request,
      jsonb_build_object('status', 'offered'), jsonb_build_object('status', 'scheduled', 'job_id', v_job), null);

    v_when := to_char(r.landlord_time at time zone s.timezone, 'Dy DD Mon, HH24:MI');
    perform public.notify_user(r.tenant_id, 'Your inspection is booked',
      'An EboHomes inspector will visit "' || coalesce(v_title, 'the property') || '" on ' || v_when || '. You will be told when the report is ready.', '/inspections', 'general');
    if r.landlord_id is not null then
      perform public.notify_user(r.landlord_id, 'Inspection booked',
        'An EboHomes inspector will visit "' || coalesce(v_title, 'your property') || '" on ' || v_when || '. Please make sure someone can let them in.', '/dashboard/inspection-requests', 'general');
    end if;
  else
    if v_reason is null or char_length(v_reason) < 3 then
      raise exception 'Say briefly why you cannot take this inspection.' using errcode = '23514';
    end if;
    update public.inspection_requests
       set status = 'ready_for_assignment', offered_inspector = null, offer_due_at = null, budget_reserved = 0, updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'inspector_declined', uid, 'offered', 'ready_for_assignment', v_reason, jsonb_build_object('inspector', uid));
    perform public.audit_write('remote_inspection_declined', 'inspection_request', p_request,
      jsonb_build_object('status', 'offered', 'inspector', uid), jsonb_build_object('status', 'ready_for_assignment'), v_reason);
    perform public.notify_admins('Inspector declined a remote inspection', r.ref || ' is back in the assignment queue.', '/admin/remote-inspections', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 8. admin: take a request back (declined later, no-show, reassignment)
create or replace function public.admin_remote_return_to_queue(p_request uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := public.eb_remote_require_admin();
  r public.inspection_requests; s public.remote_inspection_settings; v_prev text; v_job_status text; v_due timestamptz;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
begin
  if v_reason is null or char_length(v_reason) < 3 then raise exception 'Give the reason for taking this back.' using errcode = '23514'; end if;
  select * into r from public.inspection_requests where id = p_request for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if r.status not in ('offered','scheduled') then raise exception 'This request is not assigned to an inspector.' using errcode = '22023'; end if;
  if r.job_id is not null then
    select status into v_job_status from public.inspection_jobs where id = r.job_id;
    if v_job_status in ('submitted','reviewed') then
      raise exception 'The inspector already submitted a report, so this cannot be taken back.' using errcode = '22023';
    end if;
    perform public.eb_remote_cancel_job(r.job_id);
  end if;
  select * into s from public.remote_inspection_settings where id;
  v_prev := r.status;
  v_due := public.eb_add_working_minutes(now(), s.assign_timeout_hours * 60);
  update public.inspection_requests
     set status = 'ready_for_assignment', offered_inspector = null, offer_due_at = null, job_id = null, scheduled_for = null,
         budget_reserved = 0, assign_due_at = v_due, escalated_at = null, updated_at = now()
   where id = p_request;
  perform public.eb_remote_event(p_request, 'returned_to_queue', uid, v_prev, 'ready_for_assignment', v_reason,
    jsonb_build_object('inspector', r.offered_inspector, 'job_id', r.job_id, 'assign_due_at', v_due));
  perform public.audit_write('remote_inspection_returned', 'inspection_request', p_request,
    jsonb_build_object('status', v_prev, 'inspector', r.offered_inspector), jsonb_build_object('status', 'ready_for_assignment'), v_reason);
  if r.offered_inspector is not null then
    perform public.notify_user(r.offered_inspector, 'Inspection taken back', 'An inspection assigned to you was taken back by EboHomes. No visit is needed.', '/inspector', 'general');
  end if;
  if v_prev = 'scheduled' then
    perform public.notify_user(r.tenant_id, 'We are changing your inspector',
      'Your inspector can no longer do the visit. EboHomes is arranging another one and will confirm the time. Nothing was charged.', '/inspections', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 9. admin: the remote budget and the settings
create or replace function public.admin_remote_add_budget(p_amount numeric, p_note text)
returns numeric language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300); v_id uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'Enter an amount above zero.' using errcode = '22023'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Say where this money comes from.' using errcode = '23514'; end if;
  insert into public.inspection_budget_ledger (service_type, kind, amount, note, created_by) values ('remote', 'allocation', p_amount, v_note, uid) returning id into v_id;
  perform public.audit_write('remote_budget_added', 'inspection_budget', v_id, null, jsonb_build_object('amount', p_amount), v_note);
  return public.eb_remote_budget_available();
end $f$;

create or replace function public.admin_remote_save_settings(
  p_landlord_hours int, p_escalate_hours int, p_assign_hours int, p_accept_minutes int, p_cost numeric, p_enforce_budget boolean,
  p_max_open int, p_max_30 int, p_resched_days int, p_grace_hours int)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); o public.remote_inspection_settings;
begin
  select * into o from public.remote_inspection_settings where id;
  update public.remote_inspection_settings
     set landlord_response_hours = p_landlord_hours, escalate_after_hours = p_escalate_hours, assign_timeout_hours = p_assign_hours,
         inspector_accept_minutes = p_accept_minutes, cost_per_inspection = p_cost, enforce_budget = p_enforce_budget,
         max_open_per_tenant = p_max_open, max_requests_per_30_days = p_max_30, rescheduling_expiry_days = p_resched_days,
         visit_grace_hours = p_grace_hours, updated_by = uid, updated_at = now()
   where id;
  perform public.audit_write('remote_settings_changed', 'inspection_settings', uid,
    jsonb_build_object('landlord_hours', o.landlord_response_hours, 'escalate_hours', o.escalate_after_hours, 'assign_hours', o.assign_timeout_hours,
                       'accept_minutes', o.inspector_accept_minutes, 'cost', o.cost_per_inspection, 'enforce_budget', o.enforce_budget),
    jsonb_build_object('landlord_hours', p_landlord_hours, 'escalate_hours', p_escalate_hours, 'assign_hours', p_assign_hours,
                       'accept_minutes', p_accept_minutes, 'cost', p_cost, 'enforce_budget', p_enforce_budget), null);
  return 'ok';
exception when check_violation then
  raise exception 'One of the values is outside its allowed range. The escalation time must be shorter than the assignment timeout.' using errcode = '22023';
end $f$;

-- ============================================================ 10. the timers
create or replace function public.eb_run_remote_inspection_timers(p_trigger text default 'cron')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  s public.remote_inspection_settings; r public.inspection_requests;
  n_closed int := 0; n_silent int := 0; n_expired_ll int := 0; n_passed int := 0; n_offer int := 0; n_esc int := 0; n_unassigned int := 0; n_overdue int := 0;
  v_due timestamptz;
begin
  select * into s from public.remote_inspection_settings where id;

  -- 1. the property is no longer available (rented, suspended, withdrawn...): close the request
  for r in select * from public.inspection_requests q
            where q.status in ('awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled')
              and not exists (select 1 from public.listings l where l.id = q.listing_id and l.status = 'approved')
            for update skip locked loop
    perform public.eb_remote_cancel_job(r.job_id);
    update public.inspection_requests set status = 'closed', closed_reason = 'The property is no longer available', budget_reserved = 0, offer_due_at = null, updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'closed_property_unavailable', null, r.status, 'closed', null, jsonb_build_object('trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_closed', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'closed'), 'The property is no longer available');
    perform public.notify_user(r.tenant_id, 'Inspection cancelled', 'This property is no longer available, so the inspection will not go ahead. Nothing was charged.', '/inspections', 'general');
    if r.offered_inspector is not null and r.status in ('offered','scheduled') then
      perform public.notify_user(r.offered_inspector, 'Inspection cancelled', 'An inspection assigned to you was cancelled. No visit is needed.', '/inspector', 'general');
    end if;
    n_closed := n_closed + 1;
  end loop;

  -- 2. the landlord did not answer in time: wait for a new time, tenant is told
  for r in select * from public.inspection_requests q where q.status = 'awaiting_landlord' and q.landlord_due_at < now() for update skip locked loop
    update public.inspection_requests set status = 'awaiting_rescheduling', landlord_response = 'no_response', updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'landlord_no_response', null, r.status, 'awaiting_rescheduling', null, jsonb_build_object('trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_landlord_silent', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'awaiting_rescheduling'), null);
    perform public.notify_user(r.tenant_id, 'The landlord has not answered yet',
      'We are still waiting for the landlord to confirm access. You can wait or cancel. Nothing was charged.', '/inspections', 'general');
    if r.landlord_id is not null then
      perform public.notify_user(r.landlord_id, 'Please answer the inspection request', 'A prospective tenant is waiting for you to confirm access and a time.', '/dashboard/inspection-requests', 'general');
    end if;
    n_silent := n_silent + 1;
  end loop;

  -- 3. still no answer after the rescheduling period: the request expires
  for r in select * from public.inspection_requests q
            where q.status = 'awaiting_rescheduling' and q.updated_at < now() - make_interval(days => s.rescheduling_expiry_days) for update skip locked loop
    update public.inspection_requests set status = 'expired', closed_reason = 'The landlord did not respond in time', updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'expired_no_landlord', null, r.status, 'expired', null, jsonb_build_object('trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_expired', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'expired'), 'The landlord did not respond in time');
    perform public.notify_user(r.tenant_id, 'Inspection request closed', 'The landlord did not confirm access, so the request was closed. Nothing was charged. You can still apply or look at other properties.', '/inspections', 'general');
    n_expired_ll := n_expired_ll + 1;
  end loop;

  -- 4. the access time passed before an inspector was booked: ask the landlord for a new time
  for r in select * from public.inspection_requests q
            where q.status in ('ready_for_assignment','offered') and q.landlord_time < now() for update skip locked loop
    v_due := public.eb_add_working_minutes(now(), s.landlord_response_hours * 60);
    update public.inspection_requests
       set status = 'awaiting_rescheduling', landlord_response = 'pending', landlord_due_at = v_due, offered_inspector = null, offer_due_at = null,
           budget_reserved = 0, updated_at = now()
     where id = r.id;
    perform public.eb_remote_event(r.id, 'access_time_passed', null, r.status, 'awaiting_rescheduling', null, jsonb_build_object('inspector', r.offered_inspector, 'trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_time_passed', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'awaiting_rescheduling'), null);
    if r.landlord_id is not null then
      perform public.notify_user(r.landlord_id, 'Please give a new inspection time', 'The time you gave has passed before an inspector could be booked. Please choose a new time.', '/dashboard/inspection-requests', 'general');
    end if;
    perform public.notify_user(r.tenant_id, 'We need a new time from the landlord', 'The first time passed before an inspector was booked. We asked the landlord for a new one. Nothing was charged.', '/inspections', 'general');
    if r.offered_inspector is not null then
      perform public.notify_user(r.offered_inspector, 'Inspection offer withdrawn', 'The access time passed, so this offer was withdrawn.', '/inspector', 'general');
    end if;
    n_passed := n_passed + 1;
  end loop;

  -- 5. the inspector did not answer in time: back to the queue
  for r in select * from public.inspection_requests q where q.status = 'offered' and q.offer_due_at < now() for update skip locked loop
    update public.inspection_requests set status = 'ready_for_assignment', offered_inspector = null, offer_due_at = null, budget_reserved = 0, updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'offer_expired', null, r.status, 'ready_for_assignment', null, jsonb_build_object('inspector', r.offered_inspector, 'trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_offer_expired', r.id, jsonb_build_object('status', r.status, 'inspector', r.offered_inspector), jsonb_build_object('status', 'ready_for_assignment'), null);
    perform public.notify_user(r.offered_inspector, 'Inspection offer expired', 'You did not answer in time, so the offer went back to the queue.', '/inspector', 'general');
    perform public.notify_admins('Inspector did not answer an offer', r.ref || ' is back in the assignment queue.', '/admin/remote-inspections', 'general');
    n_offer := n_offer + 1;
  end loop;

  -- 6. waiting for an inspector too long: escalate once
  for r in select * from public.inspection_requests q
            where q.status = 'ready_for_assignment' and q.escalated_at is null and q.ready_at is not null
              and public.eb_add_working_minutes(q.ready_at, s.escalate_after_hours * 60) <= now() for update skip locked loop
    update public.inspection_requests set escalated_at = now(), updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'escalated', null, r.status, r.status, null, jsonb_build_object('trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_escalated', r.id, null, jsonb_build_object('escalated', true), null);
    perform public.notify_admins('Remote inspection still unassigned', r.ref || ' has been waiting for an inspector for ' || s.escalate_after_hours || ' working hours.', '/admin/remote-inspections', 'general');
    n_esc := n_esc + 1;
  end loop;

  -- 7. no inspector could be booked in time: the request expires
  for r in select * from public.inspection_requests q where q.status = 'ready_for_assignment' and q.assign_due_at < now() for update skip locked loop
    update public.inspection_requests set status = 'expired', closed_reason = 'No inspector could be assigned in time', budget_reserved = 0, updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'expired_unassigned', null, r.status, 'expired', null, jsonb_build_object('trigger', p_trigger));
    perform public.eb_remote_audit('remote_inspection_expired', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'expired'), 'No inspector could be assigned in time');
    perform public.notify_user(r.tenant_id, 'We could not book your inspection',
      'We could not find an inspector in time, so this request was closed. Nothing was charged. You are welcome to ask again.', '/inspections', 'general');
    if r.landlord_id is not null then
      perform public.notify_user(r.landlord_id, 'Inspection no longer needed', 'The requested inspection will not go ahead. You do not need to do anything.', '/dashboard/inspection-requests', 'general');
    end if;
    n_unassigned := n_unassigned + 1;
  end loop;

  -- 8. a booked visit is overdue and nothing was submitted: tell the admins once (they decide whether to take it back)
  for r in select * from public.inspection_requests q
            where q.status = 'scheduled' and q.scheduled_for + make_interval(hours => s.visit_grace_hours) < now()
              and not exists (select 1 from public.inspection_request_events e where e.request_id = q.id and e.event = 'visit_overdue') for update skip locked loop
    perform public.eb_remote_event(r.id, 'visit_overdue', null, r.status, r.status, null, jsonb_build_object('trigger', p_trigger));
    perform public.notify_admins('Remote inspection visit overdue', r.ref || ' was booked for a time that has passed and no report has arrived.', '/admin/remote-inspections', 'general');
    n_overdue := n_overdue + 1;
  end loop;

  return jsonb_build_object('ok', true, 'closed_unavailable', n_closed, 'landlord_silent', n_silent, 'expired_landlord', n_expired_ll,
    'time_passed', n_passed, 'offers_expired', n_offer, 'escalated', n_esc, 'expired_unassigned', n_unassigned, 'visits_overdue', n_overdue);
end $f$;

-- an admin can run the same timers from the queue page
create or replace function public.admin_remote_run_timers()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  perform public.eb_remote_require_admin();
  return public.eb_run_remote_inspection_timers('admin');
end $f$;

-- ============================================================ 11. who may call what
revoke all on function public.eb_run_remote_inspection_timers(text) from public, anon, authenticated;
grant execute on function public.eb_run_remote_inspection_timers(text) to service_role;

revoke all on function public.admin_remote_queue() from public, anon;
revoke all on function public.admin_remote_suggest_inspectors(uuid) from public, anon;
revoke all on function public.admin_remote_offer(uuid, uuid, text) from public, anon;
revoke all on function public.inspector_my_remote_offers() from public, anon;
revoke all on function public.inspector_respond_remote_offer(uuid, text, text) from public, anon;
revoke all on function public.admin_remote_return_to_queue(uuid, text) from public, anon;
revoke all on function public.admin_remote_add_budget(numeric, text) from public, anon;
revoke all on function public.admin_remote_save_settings(int, int, int, int, numeric, boolean, int, int, int, int) from public, anon;
revoke all on function public.admin_remote_run_timers() from public, anon;
grant execute on function public.admin_remote_queue() to authenticated;
grant execute on function public.admin_remote_suggest_inspectors(uuid) to authenticated;
grant execute on function public.admin_remote_offer(uuid, uuid, text) to authenticated;
grant execute on function public.inspector_my_remote_offers() to authenticated;
grant execute on function public.inspector_respond_remote_offer(uuid, text, text) to authenticated;
grant execute on function public.admin_remote_return_to_queue(uuid, text) to authenticated;
grant execute on function public.admin_remote_add_budget(numeric, text) to authenticated;
grant execute on function public.admin_remote_save_settings(int, int, int, int, numeric, boolean, int, int, int, int) to authenticated;
grant execute on function public.admin_remote_run_timers() to authenticated;

commit;

-- ROLLBACK (only while no request is offered or scheduled):
-- drop function if exists public.admin_remote_queue(), public.admin_remote_suggest_inspectors(uuid), public.admin_remote_offer(uuid, uuid, text),
--   public.inspector_my_remote_offers(), public.inspector_respond_remote_offer(uuid, text, text), public.admin_remote_return_to_queue(uuid, text),
--   public.admin_remote_add_budget(numeric, text), public.admin_remote_save_settings(int, int, int, int, numeric, boolean, int, int, int, int),
--   public.admin_remote_run_timers(), public.eb_run_remote_inspection_timers(text), public.eb_remote_budget_available(),
--   public.eb_remote_cancel_job(uuid), public.eb_remote_audit(text, uuid, jsonb, jsonb, text), public.eb_remote_require_admin();
-- alter table public.remote_inspection_settings drop column if exists rescheduling_expiry_days, drop column if exists visit_grace_hours;
