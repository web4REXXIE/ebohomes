-- EboHomes 20261205_06: Phase 10.6 Step G - disputes on a released remote report, and instant closing when a property stops being available.
-- WHAT:
--   (1) inspection_disputes: a tenant can raise a concern about their released report (within 14 days); an admin can raise one too (for example
--       suspected fake evidence). Rows are kept for good and cannot be edited after they are resolved.
--   (2) tenant_dispute_remote_report / admin_remote_raise_dispute / my_remote_inspection_disputes / admin_remote_dispute_queue /
--       admin_remote_dispute_resolve. Three outcomes: the report stands, another visit, or the report is withdrawn. A reason is required.
--       The inspector, the tenant and the landlord of a request can never resolve its dispute.
--   (3) a trigger on listings: the moment an approved property becomes rented, suspended, withdrawn or anything else, its open pre-visit
--       remote requests are closed and the tenant is told. The timers already did this on a schedule; now it is immediate.
-- NO FEES. Nothing is charged or refunded. Does not publish anything, touch the Inspected badge, the public view, applications or viewings.
-- A payout still waiting to be paid is voided when a report is withdrawn or sent for another visit. A payout already paid is left alone and noted.
-- REQUIRES: 20261205_01 to _05.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. disputes (kept for good)
create table if not exists public.inspection_disputes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  raised_by uuid not null,
  raised_by_role text not null check (raised_by_role in ('tenant','admin')),
  reason text not null check (char_length(reason) between 10 and 1000),
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution is null or resolution in ('report_stands','another_visit','report_withdrawn')),
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),   -- internal, never shown to the tenant
  tenant_message text check (tenant_message is null or char_length(tenant_message) <= 500),       -- what the tenant is told
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inspection_disputes_request_idx on public.inspection_disputes (request_id, created_at);
create unique index if not exists inspection_disputes_one_open_uidx on public.inspection_disputes (request_id) where status = 'open';

create or replace function public.eb_inspection_disputes_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if tg_op = 'DELETE' then
    raise exception 'Dispute records are kept on record and cannot be deleted.' using errcode = '42501';
  end if;
  if old.status = 'resolved' then
    raise exception 'A resolved dispute cannot be changed.' using errcode = '42501';
  end if;
  if new.request_id is distinct from old.request_id or new.raised_by is distinct from old.raised_by
     or new.raised_by_role is distinct from old.raised_by_role or new.reason is distinct from old.reason or new.created_at is distinct from old.created_at then
    raise exception 'The details of a dispute cannot be edited.' using errcode = '42501';
  end if;
  return new;
end $f$;
drop trigger if exists aa_insp_disputes_guard on public.inspection_disputes;
create trigger aa_insp_disputes_guard before update or delete on public.inspection_disputes
  for each row execute function public.eb_inspection_disputes_guard();

alter table public.inspection_disputes enable row level security;
revoke all on public.inspection_disputes from anon, authenticated, public;
grant select on public.inspection_disputes to authenticated;
drop policy if exists "Admins read inspection disputes" on public.inspection_disputes;
create policy "Admins read inspection disputes" on public.inspection_disputes for select to authenticated using (public.is_admin());

-- ============================================================ 2. tenant: raise a concern about the released report
create or replace function public.tenant_dispute_remote_report(p_request uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := auth.uid(); r public.inspection_requests; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Tell us what is wrong, at least 10 characters.' using errcode = '23514'; end if;
  if char_length(v_reason) > 1000 then raise exception 'Please keep this under 1000 characters.' using errcode = '23514'; end if;
  select * into r from public.inspection_requests where id = p_request and tenant_id = uid for update;
  if not found then raise exception 'Report not found.' using errcode = 'P0002'; end if;
  if r.status <> 'completed' or r.report_released_at is null then raise exception 'There is no released report to raise a concern about.' using errcode = '22023'; end if;
  if r.report_released_at < now() - interval '14 days' then
    raise exception 'The 14 days to raise a concern about this report have passed. Please contact EboHomes support.' using errcode = '22023';
  end if;
  insert into public.inspection_disputes (request_id, raised_by, raised_by_role, reason) values (p_request, uid, 'tenant', v_reason);
  perform public.eb_remote_event(p_request, 'dispute_opened', uid, 'completed', 'completed', null, jsonb_build_object('by', 'tenant'));
  perform public.audit_write('remote_inspection_disputed', 'inspection_request', p_request, null, jsonb_build_object('by', 'tenant'), v_reason);
  perform public.notify_admins('Inspection report disputed', r.ref || ': the tenant raised a concern about the report.', '/admin/remote-inspection-disputes', 'general');
  return 'ok';
exception when unique_violation then
  raise exception 'You already have an open concern about this report. EboHomes is looking at it.' using errcode = '23505';
end $f$;

-- ============================================================ 3. admin: raise a concern (suspected fake evidence, a complaint received elsewhere)
create or replace function public.admin_remote_raise_dispute(p_ref text, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); r public.inspection_requests; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'Write the reason, at least 10 characters.' using errcode = '23514'; end if;
  if char_length(v_reason) > 1000 then raise exception 'Please keep this under 1000 characters.' using errcode = '23514'; end if;
  select * into r from public.inspection_requests where ref = upper(btrim(coalesce(p_ref, ''))) for update;
  if not found then raise exception 'No request has that reference.' using errcode = 'P0002'; end if;
  if r.status <> 'completed' or r.report_released_at is null then raise exception 'Only a request with a released report can be disputed.' using errcode = '22023'; end if;
  insert into public.inspection_disputes (request_id, raised_by, raised_by_role, reason) values (r.id, uid, 'admin', v_reason);
  perform public.eb_remote_event(r.id, 'dispute_opened', uid, 'completed', 'completed', null, jsonb_build_object('by', 'admin'));
  perform public.audit_write('remote_inspection_disputed', 'inspection_request', r.id, null, jsonb_build_object('by', 'admin'), v_reason);
  return 'ok';
exception when unique_violation then
  raise exception 'This report already has an open dispute.' using errcode = '23505';
end $f$;

-- ============================================================ 4. tenant: the status of their own concerns (never the internal note)
create or replace function public.my_remote_inspection_disputes()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', d.request_id, 'status', d.status, 'created_at', d.created_at,
           'resolved_at', d.resolved_at, 'tenant_message', d.tenant_message) order by d.created_at desc), '[]'::jsonb)
    from public.inspection_disputes d
    join public.inspection_requests r on r.id = d.request_id
   where r.tenant_id = auth.uid() and d.raised_by_role = 'tenant'
$f$;

-- ============================================================ 5. admin: the queue
create or replace function public.admin_remote_dispute_queue()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); v jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into v from (
    select jsonb_build_object(
      'id', d.id, 'request_id', r.id, 'ref', r.ref, 'title', l.title, 'location_text', l.location_text,
      'raised_by_role', d.raised_by_role, 'reason', d.reason, 'created_at', d.created_at,
      'inspector_name', n.full_name, 'verdict', i.verdict, 'released_at', r.report_released_at,
      'payout_status', (select p.status from public.inspection_payouts p where p.job_id = r.job_id and p.status <> 'void' limit 1),
      'involved', (j.inspector_id = uid or r.tenant_id = uid or r.landlord_id is not distinct from uid)) as x
      from public.inspection_disputes d
      join public.inspection_requests r on r.id = d.request_id
      left join public.inspection_jobs j on j.id = r.job_id
      left join lateral (select p.verdict from public.property_inspections p where p.job_id = r.job_id order by p.inspected_at desc limit 1) i on true
      left join public.listings l on l.id = r.listing_id
      left join public.inspectors n on n.user_id = j.inspector_id
     where d.status = 'open'
  ) q;
  return v;
end $f$;

-- ============================================================ 6. admin: resolve
create or replace function public.admin_remote_dispute_resolve(p_dispute uuid, p_resolution text, p_note text, p_tenant_message text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := public.eb_remote_require_admin();
  d public.inspection_disputes; r public.inspection_requests; j public.inspection_jobs; s public.remote_inspection_settings;
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_msg text := left(nullif(btrim(coalesce(p_tenant_message, '')), ''), 500);
  v_title text; v_paid boolean := false; v_due timestamptz;
begin
  if p_resolution not in ('report_stands','another_visit','report_withdrawn') then raise exception 'Choose an outcome.' using errcode = '22023'; end if;
  if v_note is null or char_length(v_note) < 5 then raise exception 'Write the reason, at least 5 characters.' using errcode = '23514'; end if;
  select * into d from public.inspection_disputes where id = p_dispute for update;
  if not found or d.status <> 'open' then raise exception 'This dispute is not open.' using errcode = '22023'; end if;
  select * into r from public.inspection_requests where id = d.request_id for update;
  select * into j from public.inspection_jobs where id = r.job_id;
  if j.inspector_id = uid or r.tenant_id = uid or r.landlord_id is not distinct from uid then
    raise exception 'You cannot decide this dispute because you are involved in it.' using errcode = '42501';
  end if;
  if r.status <> 'completed' then raise exception 'This request no longer has a released report.' using errcode = '22023'; end if;
  select title into v_title from public.listings where id = r.listing_id;

  if p_resolution <> 'report_stands' then
    -- a payout that is still waiting is cancelled; one that was already paid stays on record
    update public.inspection_payouts set status = 'void', void_reason = 'Dispute: ' || p_resolution, voided_by = uid
     where job_id = r.job_id and status = 'payable';
    v_paid := exists (select 1 from public.inspection_payouts where job_id = r.job_id and status = 'paid');
  end if;

  if p_resolution = 'report_stands' then
    null;
  elsif p_resolution = 'another_visit' then
    select * into s from public.remote_inspection_settings where id;
    v_due := public.eb_add_working_minutes(now(), s.assign_timeout_hours * 60);
    update public.inspection_requests
       set status = 'ready_for_assignment', review_decision = 'reinspect', report_released_at = null, report_note = null,
           job_id = null, offered_inspector = null, offer_due_at = null, scheduled_for = null, budget_reserved = 0,
           ready_at = now(), assign_due_at = v_due, escalated_at = null, updated_at = now()
     where id = r.id;
  else
    update public.inspection_requests
       set status = 'closed', review_decision = 'rejected', report_released_at = null, report_note = null,
           closed_reason = 'The report was withdrawn after a review', budget_reserved = 0, updated_at = now()
     where id = r.id;
  end if;

  update public.inspection_disputes
     set status = 'resolved', resolution = p_resolution, resolution_note = v_note, tenant_message = v_msg, resolved_by = uid, resolved_at = now()
   where id = p_dispute;

  perform public.eb_remote_event(r.id, 'dispute_resolved', uid, 'completed', case p_resolution when 'report_stands' then 'completed' when 'another_visit' then 'ready_for_assignment' else 'closed' end,
    v_note, jsonb_build_object('dispute_id', p_dispute, 'resolution', p_resolution, 'paid_payout_exists', v_paid));
  perform public.audit_write('remote_inspection_dispute_resolved', 'inspection_request', r.id, jsonb_build_object('status', 'completed'),
    jsonb_build_object('resolution', p_resolution, 'paid_payout_exists', v_paid), v_note);

  if d.raised_by_role = 'tenant' then
    perform public.notify_user(r.tenant_id,
      case p_resolution when 'report_stands' then 'Your concern was reviewed' when 'another_visit' then 'We are arranging another visit' else 'Your report was withdrawn' end,
      coalesce(v_msg, case p_resolution
        when 'report_stands' then 'EboHomes reviewed your concern about "' || coalesce(v_title, 'the property') || '" and the report stands.'
        when 'another_visit' then 'EboHomes will send another inspector to "' || coalesce(v_title, 'the property') || '". Nothing was charged.'
        else 'EboHomes withdrew the report for "' || coalesce(v_title, 'the property') || '". Nothing was charged. You are welcome to ask again.' end),
      '/inspections', 'general');
  elsif p_resolution <> 'report_stands' then
    perform public.notify_user(r.tenant_id, case p_resolution when 'another_visit' then 'We are arranging another visit' else 'Your report was withdrawn' end,
      coalesce(v_msg, 'EboHomes reviewed the report for "' || coalesce(v_title, 'the property') || '". Nothing was charged.'), '/inspections', 'general');
  end if;
  if p_resolution = 'report_withdrawn' and j.inspector_id is not null then
    perform public.notify_user(j.inspector_id, 'Inspection report withdrawn', 'EboHomes withdrew your report after a review. An administrator may contact you.', '/inspector', 'general');
  end if;
  return 'ok';
exception when unique_violation then
  raise exception 'The tenant already has a newer open request for this property. Choose "report withdrawn" instead.' using errcode = '23505';
end $f$;

-- ============================================================ 7. a property stops being available: close the open pre-visit requests at once
create or replace function public.eb_remote_listing_unavailable()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r public.inspection_requests;
begin
  for r in select * from public.inspection_requests q
            where q.listing_id = new.id and q.status in ('awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled')
            for update skip locked loop
    perform public.eb_remote_cancel_job(r.job_id);
    update public.inspection_requests set status = 'closed', closed_reason = 'The property is no longer available', budget_reserved = 0, offer_due_at = null, updated_at = now() where id = r.id;
    perform public.eb_remote_event(r.id, 'closed_property_unavailable', null, r.status, 'closed', null, jsonb_build_object('trigger', 'listing_status', 'listing_status', new.status));
    perform public.eb_remote_audit('remote_inspection_closed', r.id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'closed'), 'The property is no longer available');
    perform public.notify_user(r.tenant_id, 'Inspection cancelled', 'This property is no longer available, so the inspection will not go ahead. Nothing was charged.', '/inspections', 'general');
    if r.offered_inspector is not null and r.status in ('offered','scheduled') then
      perform public.notify_user(r.offered_inspector, 'Inspection cancelled', 'An inspection assigned to you was cancelled. No visit is needed.', '/inspector', 'general');
    end if;
  end loop;
  return new;
exception when others then
  return new;   -- a problem here must never block the listing change; the timers close these requests on their next run
end $f$;
revoke all on function public.eb_remote_listing_unavailable() from public, anon, authenticated;

drop trigger if exists zz_remote_listing_unavailable on public.listings;
create trigger zz_remote_listing_unavailable after update of status on public.listings
  for each row when (old.status = 'approved' and new.status is distinct from 'approved')
  execute function public.eb_remote_listing_unavailable();

-- ============================================================ 8. who may call what
revoke all on function public.tenant_dispute_remote_report(uuid, text) from public, anon;
revoke all on function public.admin_remote_raise_dispute(text, text) from public, anon;
revoke all on function public.my_remote_inspection_disputes() from public, anon;
revoke all on function public.admin_remote_dispute_queue() from public, anon;
revoke all on function public.admin_remote_dispute_resolve(uuid, text, text, text) from public, anon;
grant execute on function public.tenant_dispute_remote_report(uuid, text) to authenticated;
grant execute on function public.admin_remote_raise_dispute(text, text) to authenticated;
grant execute on function public.my_remote_inspection_disputes() to authenticated;
grant execute on function public.admin_remote_dispute_queue() to authenticated;
grant execute on function public.admin_remote_dispute_resolve(uuid, text, text, text) to authenticated;

commit;

-- ROLLBACK (only while no dispute exists):
-- drop trigger if exists zz_remote_listing_unavailable on public.listings;
-- drop function if exists public.eb_remote_listing_unavailable(), public.tenant_dispute_remote_report(uuid, text), public.admin_remote_raise_dispute(text, text),
--   public.my_remote_inspection_disputes(), public.admin_remote_dispute_queue(), public.admin_remote_dispute_resolve(uuid, text, text, text),
--   public.eb_inspection_disputes_guard();
-- drop table if exists public.inspection_disputes;
