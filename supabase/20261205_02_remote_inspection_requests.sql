-- EboHomes 20261205_02: Phase 10.6 Step B - tenant request, tenant cancel, landlord access confirmation, and the read functions for both.
-- WHAT: five functions the app calls. Every rule is checked here, not in the browser. Tenants pay nothing and are asked for nothing.
--   tenant_request_remote_inspection  - a tenant asks for an inspection of an approved, available property. Needs no application and does not
--                                       create one or reserve the property. Fair-use limits (open requests, requests in 30 days) come from settings.
--   tenant_cancel_remote_inspection   - the tenant cancels before the report stage. A reason is required and kept.
--   landlord_respond_remote_inspection - the landlord confirms access and a time, or refuses with a reason. Only the listing owner can answer.
--   my_remote_inspection_requests     - what the tenant sees: progress only. Never the landlord's note, never the budget.
--   my_landlord_inspection_requests   - what the landlord sees: the property, the status and the time. Never the tenant, never any report.
-- DOES NOT: assign inspectors, check budgets, expire requests or release reports (Steps D and E), take any payment, or touch listings or applications.
-- REQUIRES: 20261205_01 (tables, settings, eb_add_working_minutes), listing_on_hold(), notify_user(), notify_admins(), audit_write().
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. internal helpers (nobody can call these directly)
create or replace function public.eb_remote_event(p_request uuid, p_event text, p_actor uuid, p_from text, p_to text, p_note text default null, p_meta jsonb default null)
returns void language sql security definer set search_path to 'public','pg_temp'
as $f$
  insert into public.inspection_request_events (request_id, event, actor_id, from_status, to_status, note, meta)
  values (p_request, p_event, p_actor, p_from, p_to, left(p_note, 500), p_meta)
$f$;
revoke all on function public.eb_remote_event(uuid, text, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- null means the property may be inspected; otherwise the reason, in words a tenant can read
create or replace function public.eb_remote_listing_problem(p_listing uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare l record;
begin
  select id, status into l from public.listings where id = p_listing;
  if not found then return 'This property was not found.'; end if;
  if l.status = 'rented' then return 'This property has been rented.'; end if;
  if l.status is distinct from 'approved' then return 'This property is not open for inspection requests right now.'; end if;
  if public.listing_on_hold(p_listing) then return 'This property is not open for inspection requests right now.'; end if;
  return null;
end $f$;
revoke all on function public.eb_remote_listing_problem(uuid) from public, anon, authenticated;

-- ============================================================ 2. tenant asks for an inspection
create or replace function public.tenant_request_remote_inspection(
  p_listing uuid, p_from timestamptz default null, p_to timestamptz default null, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid();
  s public.remote_inspection_settings; l record; v_problem text; v_id uuid; v_open int; v_recent int;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_due timestamptz;
begin
  if uid is null then raise exception 'Sign in to request an inspection.' using errcode = '42501'; end if;
  select * into s from public.remote_inspection_settings where id;
  select id, landlord_id, title into l from public.listings where id = p_listing;
  if not found then raise exception 'This property was not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = uid then raise exception 'You cannot request an inspection of your own property.' using errcode = '42501'; end if;
  v_problem := public.eb_remote_listing_problem(p_listing);
  if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;

  if (p_from is null) <> (p_to is null) then
    raise exception 'Give both the start and the end of your preferred time, or leave both empty.' using errcode = '22023';
  end if;
  if p_from is not null then
    if p_from < now() - interval '5 minutes' or p_from > now() + interval '60 days' then
      raise exception 'Choose a preferred time within the next 60 days.' using errcode = '22023';
    end if;
    if p_to <= p_from or p_to > p_from + interval '14 days' then
      raise exception 'The end of your preferred time must be after the start, and within 14 days of it.' using errcode = '22023';
    end if;
  end if;

  -- fair use: EboHomes pays for these, so each tenant has limits (set by an administrator)
  select count(*) into v_open from public.inspection_requests
   where tenant_id = uid and status not in ('completed','cancelled','expired','access_refused','closed');
  if v_open >= s.max_open_per_tenant then
    raise exception 'You already have % open inspection request(s). Wait for one to finish, or cancel it, before asking for another.', s.max_open_per_tenant using errcode = '23514';
  end if;
  select count(*) into v_recent from public.inspection_requests where tenant_id = uid and created_at > now() - interval '30 days';
  if v_recent >= s.max_requests_per_30_days then
    raise exception 'You have reached the limit of % inspection requests in 30 days. Please try again later.', s.max_requests_per_30_days using errcode = '23514';
  end if;
  if exists (select 1 from public.inspection_requests
              where tenant_id = uid and listing_id = p_listing
                and status not in ('completed','cancelled','expired','access_refused','closed')) then
    raise exception 'You already have an open inspection request for this property.' using errcode = '23505';
  end if;

  v_due := public.eb_add_working_minutes(now(), s.landlord_response_hours * 60);
  begin
    insert into public.inspection_requests (listing_id, tenant_id, landlord_id, preferred_from, preferred_to, tenant_note, landlord_due_at)
    values (p_listing, uid, l.landlord_id, p_from, p_to, v_note, v_due)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'You already have an open inspection request for this property.' using errcode = '23505';
  end;

  perform public.eb_remote_event(v_id, 'requested', uid, null, 'awaiting_landlord', null,
                                 jsonb_build_object('preferred_from', p_from, 'preferred_to', p_to, 'landlord_due_at', v_due));
  perform public.audit_write('remote_inspection_requested', 'inspection_request', v_id, null,
                             jsonb_build_object('listing_id', p_listing, 'landlord_due_at', v_due), null);

  perform public.notify_user(l.landlord_id, 'Someone asked to have your property inspected',
    'A prospective tenant asked for a free EboHomes inspection of "' || coalesce(l.title, 'your property') || '". Please confirm access and a time.',
    '/dashboard/inspection-requests', 'general');
  perform public.notify_user(uid, 'Inspection request sent',
    'We asked the landlord to confirm access and a time. Nothing is booked yet, and you will not be asked to pay for this.',
    '/inspections', 'general');
  return v_id;
end $f$;

-- ============================================================ 3. tenant cancels
create or replace function public.tenant_cancel_remote_inspection(p_request uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid(); r public.inspection_requests; v_prev text;
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300);
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 3 then
    raise exception 'Tell us briefly why you are cancelling.' using errcode = '23514';
  end if;
  select * into r from public.inspection_requests where id = p_request for update;
  if not found or r.tenant_id <> uid then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if r.status not in ('awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled') then
    raise exception 'This request can no longer be cancelled.' using errcode = '22023';
  end if;
  v_prev := r.status;

  if r.job_id is not null then
    perform set_config('eb.remote_ok', '1', true);
    update public.inspection_jobs set status = 'cancelled' where id = r.job_id and status in ('requested','assigned');
    perform set_config('eb.remote_ok', '', true);
  end if;

  update public.inspection_requests
     set status = 'cancelled', cancelled_by = uid, cancelled_at = now(), cancel_reason = v_reason,
         closed_reason = 'Cancelled by the tenant', budget_reserved = 0, offer_due_at = null, updated_at = now()
   where id = p_request;

  perform public.eb_remote_event(p_request, 'cancelled_by_tenant', uid, v_prev, 'cancelled', v_reason, null);
  perform public.audit_write('remote_inspection_cancelled', 'inspection_request', p_request,
                             jsonb_build_object('status', v_prev), jsonb_build_object('status', 'cancelled'), v_reason);

  if r.landlord_response = 'confirmed' and r.landlord_id is not null then
    perform public.notify_user(r.landlord_id, 'Inspection cancelled',
      'The requested inspection of your property was cancelled. You do not need to do anything.', '/dashboard/inspection-requests', 'general');
  end if;
  if r.offered_inspector is not null and v_prev in ('offered','scheduled') then
    perform public.notify_user(r.offered_inspector, 'Inspection cancelled',
      'An inspection assigned to you was cancelled. No visit is needed.', '/inspector', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 4. landlord confirms access or refuses
create or replace function public.landlord_respond_remote_inspection(
  p_request uuid, p_decision text, p_time timestamptz default null, p_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := auth.uid(); r public.inspection_requests; s public.remote_inspection_settings; v_owner uuid; v_title text; v_problem text;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500); v_prev text; v_due timestamptz;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_decision not in ('confirm','refuse') then raise exception 'Choose confirm or refuse.' using errcode = '22023'; end if;
  select * into r from public.inspection_requests where id = p_request for update;
  if not found or r.landlord_id is distinct from uid then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  select landlord_id, title into v_owner, v_title from public.listings where id = r.listing_id;
  if v_owner is distinct from uid then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if r.status not in ('awaiting_landlord','awaiting_rescheduling') then
    raise exception 'This request is no longer waiting for your answer.' using errcode = '22023';
  end if;
  select * into s from public.remote_inspection_settings where id;
  v_prev := r.status;

  if p_decision = 'confirm' then
    v_problem := public.eb_remote_listing_problem(r.listing_id);
    if v_problem is not null then raise exception '%', v_problem using errcode = '22023'; end if;
    if p_time is null or p_time < now() + interval '30 minutes' or p_time > now() + interval '30 days' then
      raise exception 'Choose a time between 30 minutes and 30 days from now when someone can let the inspector in.' using errcode = '22023';
    end if;
    v_due := public.eb_add_working_minutes(now(), s.assign_timeout_hours * 60);
    update public.inspection_requests
       set landlord_response = 'confirmed', landlord_responded_at = now(), landlord_time = p_time, landlord_note = v_note,
           status = 'ready_for_assignment', ready_at = now(), assign_due_at = v_due, updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'landlord_confirmed', uid, v_prev, 'ready_for_assignment', v_note,
                                   jsonb_build_object('landlord_time', p_time, 'assign_due_at', v_due));
    perform public.audit_write('remote_inspection_access_confirmed', 'inspection_request', p_request,
                               jsonb_build_object('status', v_prev), jsonb_build_object('status', 'ready_for_assignment', 'landlord_time', p_time), null);
    perform public.notify_user(r.tenant_id, 'The landlord confirmed access',
      'The landlord agreed to an inspection. EboHomes will now choose a local inspector and confirm your appointment.', '/inspections', 'general');
    perform public.notify_admins('Remote inspection ready for assignment',
      'The landlord confirmed access for ' || r.ref || '. Check the budget and assign an inspector.', '/admin/remote-inspections', 'general');
  else
    if v_note is null or char_length(v_note) < 3 then
      raise exception 'Say briefly why access cannot be given. EboHomes keeps this on record.' using errcode = '23514';
    end if;
    update public.inspection_requests
       set landlord_response = 'refused', landlord_responded_at = now(), landlord_note = v_note,
           status = 'access_refused', closed_reason = 'The landlord did not give access', updated_at = now()
     where id = p_request;
    perform public.eb_remote_event(p_request, 'landlord_refused', uid, v_prev, 'access_refused', v_note, null);
    perform public.audit_write('remote_inspection_access_refused', 'inspection_request', p_request,
                               jsonb_build_object('status', v_prev), jsonb_build_object('status', 'access_refused'), v_note);
    perform public.notify_user(r.tenant_id, 'Inspection not possible right now',
      'Access to the property could not be confirmed, so the inspection will not go ahead. Nothing was charged. You can still apply or look at other properties.',
      '/inspections', 'general');
  end if;
  return 'ok';
end $f$;

-- ============================================================ 5. what each person may see
create or replace function public.my_remote_inspection_requests()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'ref', r.ref, 'listing_id', r.listing_id, 'title', l.title, 'location_text', l.location_text,
           'status', r.status, 'preferred_from', r.preferred_from, 'preferred_to', r.preferred_to,
           'landlord_response', r.landlord_response, 'landlord_due_at', r.landlord_due_at,
           'landlord_time', r.landlord_time, 'scheduled_for', r.scheduled_for,
           'report_ready', r.report_released_at is not null,
           'cancel_reason', case when r.status = 'cancelled' then r.cancel_reason end,
           'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    from public.inspection_requests r
    left join public.listings l on l.id = r.listing_id
   where r.tenant_id = auth.uid()
$f$;

create or replace function public.my_landlord_inspection_requests()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'ref', r.ref, 'listing_id', r.listing_id, 'title', l.title, 'location_text', l.location_text,
           'status', r.status, 'landlord_response', r.landlord_response, 'landlord_due_at', r.landlord_due_at,
           'preferred_from', r.preferred_from, 'preferred_to', r.preferred_to,
           'landlord_time', r.landlord_time, 'scheduled_for', r.scheduled_for,
           'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    from public.inspection_requests r
    join public.listings l on l.id = r.listing_id and l.landlord_id = auth.uid()
   where r.landlord_id = auth.uid()
$f$;

-- ============================================================ 6. who may call what
revoke all on function public.tenant_request_remote_inspection(uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.tenant_cancel_remote_inspection(uuid, text) from public, anon;
revoke all on function public.landlord_respond_remote_inspection(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.my_remote_inspection_requests() from public, anon;
revoke all on function public.my_landlord_inspection_requests() from public, anon;
grant execute on function public.tenant_request_remote_inspection(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.tenant_cancel_remote_inspection(uuid, text) to authenticated;
grant execute on function public.landlord_respond_remote_inspection(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.my_remote_inspection_requests() to authenticated;
grant execute on function public.my_landlord_inspection_requests() to authenticated;

commit;

-- ROLLBACK:
-- drop function if exists public.tenant_request_remote_inspection(uuid, timestamptz, timestamptz, text),
--   public.tenant_cancel_remote_inspection(uuid, text), public.landlord_respond_remote_inspection(uuid, text, timestamptz, text),
--   public.my_remote_inspection_requests(), public.my_landlord_inspection_requests(),
--   public.eb_remote_listing_problem(uuid), public.eb_remote_event(uuid, text, uuid, text, text, text, jsonb);
