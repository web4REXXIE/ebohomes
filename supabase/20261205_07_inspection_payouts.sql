-- EboHomes 20261205_07: Phase 10.6 Step F - inspector payout records (manual payouts) and the two separate budgets.
-- WHAT:
--   (1) admin_inspection_record_payout  - an admin approves the payment for ONE completed inspection job (creates a 'payable' record);
--   (2) admin_inspection_mark_paid       - after the admin has paid by hand: records method, reference and date, and books the expense in the right budget;
--   (3) admin_inspection_void_payout     - cancels a payout that has not been paid yet (reason required);
--   (4) admin_inspection_payouts_overview - both budgets, the work waiting for a payout record, and the payout history;
--   (5) admin_verification_add_budget    - money for the EboHomes Property Verification budget (the remote budget already has one).
-- RULES: inspectors are paid for valid completed work, never for a PASS. A FAIL or UNCERTAIN report is paid like any other.
--   Verification work is payable once it has a final review decision. Remote work is payable once the admin released the report.
--   In both: every submitted file reviewed, at least 3 accepted photographs, no open dispute, and the approving admin is not the inspector,
--   the tenant or the landlord. One payout per job (the database refuses a second). One payment reference is never used twice.
--   The two budgets never mix: each payout is booked in the ledger of its own service type. Nothing is ever deleted.
-- NO FEES, NO PAYSTACK. Nothing here touches a tenant's money, a rent payment or a landlord payout. Payments to inspectors are made by hand.
-- REQUIRES: 20261205_01 to _06.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. internal: may this job be paid? (raises a plain-words reason when it may not)
create or replace function public.eb_payout_target(p_job uuid, p_uid uuid, out o_inspection uuid, out o_inspector uuid, out o_service text, out o_request uuid)
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare j public.inspection_jobs; i public.property_inspections; r public.inspection_requests; v_pending int; v_photos int;
begin
  select * into j from public.inspection_jobs where id = p_job;
  if not found then raise exception 'Inspection job not found.' using errcode = 'P0002'; end if;
  if j.inspector_id is null then raise exception 'This job has no inspector.' using errcode = '22023'; end if;
  select * into i from public.property_inspections where job_id = p_job order by inspected_at desc limit 1;
  if not found then raise exception 'The inspector has not submitted work for this job.' using errcode = '22023'; end if;
  if j.inspector_id = p_uid or i.inspected_by = p_uid then raise exception 'You cannot approve a payment for your own work.' using errcode = '42501'; end if;

  select count(*) filter (where f.review_status = 'pending'), count(*) filter (where f.review_status = 'accepted' and f.kind = 'photo')
    into v_pending, v_photos
    from public.inspection_evidence_files f where f.inspection_id = i.id and f.discarded_at is null;
  if v_pending > 0 then raise exception 'Some submitted files have not been reviewed yet.' using errcode = '22023'; end if;
  if v_photos < 3 then raise exception 'The work needs at least 3 accepted photographs before it can be paid.' using errcode = '22023'; end if;

  if j.service_type = 'remote' then
    select * into r from public.inspection_requests where id = j.request_id and job_id = j.id;
    if not found or r.status <> 'completed' or r.report_released_at is null then
      raise exception 'The report has not been released, so this work is not approved yet.' using errcode = '22023';
    end if;
    if r.tenant_id = p_uid or r.landlord_id is not distinct from p_uid then
      raise exception 'You cannot approve a payment for a request you are involved in.' using errcode = '42501';
    end if;
    if exists (select 1 from public.inspection_disputes d where d.request_id = r.id and d.status = 'open') then
      raise exception 'This inspection is under dispute. Resolve the dispute first.' using errcode = '22023';
    end if;
    o_request := r.id;
  else
    if i.review_status = 'submitted' then raise exception 'This inspection has no final review decision yet.' using errcode = '22023'; end if;
  end if;
  o_inspection := i.id; o_inspector := j.inspector_id; o_service := j.service_type;
end $f$;
revoke all on function public.eb_payout_target(uuid, uuid) from public, anon, authenticated;

-- ============================================================ 2. approve a payout (one per job)
create or replace function public.admin_inspection_record_payout(p_job uuid, p_amount numeric, p_transport numeric default 0, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); t record; v_id uuid; v_transport numeric := coalesce(p_transport, 0);
begin
  if p_amount is null or p_amount < 0 or p_amount > 1000000000 or v_transport < 0 or v_transport > 1000000000 then
    raise exception 'Enter valid amounts.' using errcode = '22023';
  end if;
  if p_amount + v_transport <= 0 then raise exception 'The total must be above zero.' using errcode = '22023'; end if;
  perform 1 from public.inspection_jobs where id = p_job for update;
  select * into t from public.eb_payout_target(p_job, uid);
  insert into public.inspection_payouts (service_type, job_id, inspection_id, inspector_id, amount, transport_amount, approved_by)
  values (t.o_service, p_job, t.o_inspection, t.o_inspector, p_amount, v_transport, uid)
  returning id into v_id;
  perform public.audit_write('inspection_payout_approved', 'inspection_payout', v_id, null,
    jsonb_build_object('service_type', t.o_service, 'job_id', p_job, 'amount', p_amount, 'transport', v_transport), left(p_note, 300));
  return v_id;
exception when unique_violation then
  raise exception 'This inspection already has a payout record.' using errcode = '23505';
end $f$;

-- ============================================================ 3. the admin paid by hand: record how, when and the reference
create or replace function public.admin_inspection_mark_paid(p_payout uuid, p_method text, p_reference text, p_paid_at timestamptz default now(), p_destination text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  uid uuid := public.eb_remote_require_admin(); p public.inspection_payouts; t record;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), ''); v_dest text := left(nullif(btrim(coalesce(p_destination, '')), ''), 200);
begin
  if p_method not in ('bank_transfer','mobile_money','cash','other') then raise exception 'Choose how the inspector was paid.' using errcode = '22023'; end if;
  if v_ref is null or char_length(v_ref) < 3 then raise exception 'Enter the payment reference, at least 3 characters.' using errcode = '23514'; end if;
  if p_paid_at is null or p_paid_at > now() + interval '10 minutes' then raise exception 'The payment date cannot be in the future.' using errcode = '22023'; end if;
  select * into p from public.inspection_payouts where id = p_payout for update;
  if not found then raise exception 'Payout not found.' using errcode = 'P0002'; end if;
  if p.status <> 'payable' then raise exception 'This payout is already %.', p.status using errcode = '22023'; end if;
  select * into t from public.eb_payout_target(p.job_id, uid);   -- checked again: a dispute may have been opened since

  update public.inspection_payouts
     set status = 'paid', method = p_method, reference = left(v_ref, 100), destination_ref = v_dest, paid_by = uid, paid_at = p_paid_at
   where id = p_payout;
  insert into public.inspection_budget_ledger (service_type, kind, amount, request_id, job_id, payout_id, note, created_by)
  values (p.service_type, 'expense', p.total_amount, t.o_request, p.job_id, p_payout, 'Inspector payout ' || left(v_ref, 100), uid);
  if t.o_request is not null then
    update public.inspection_requests set budget_reserved = 0, updated_at = now() where id = t.o_request;   -- the reservation becomes the expense
  end if;
  perform public.audit_write('inspection_payout_paid', 'inspection_payout', p_payout, jsonb_build_object('status', 'payable'),
    jsonb_build_object('status', 'paid', 'service_type', p.service_type, 'total', p.total_amount, 'method', p_method), left(v_ref, 100));
  perform public.notify_user(p.inspector_id, 'Payment recorded', 'EboHomes recorded a payment of ₦' || to_char(p.total_amount, 'FM999,999,999,990.00') || ' for your inspection.', '/inspector', 'general');
  return 'ok';
exception when unique_violation then
  raise exception 'This payment reference was already used for another payout.' using errcode = '23505';
end $f$;

-- ============================================================ 4. cancel a payout that has not been paid
create or replace function public.admin_inspection_void_payout(p_payout uuid, p_reason text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); p public.inspection_payouts; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'Write the reason, at least 5 characters.' using errcode = '23514'; end if;
  select * into p from public.inspection_payouts where id = p_payout for update;
  if not found then raise exception 'Payout not found.' using errcode = 'P0002'; end if;
  if p.status <> 'payable' then raise exception 'Only a payout that has not been paid can be cancelled here. For a paid one, ask the finance owner.' using errcode = '22023'; end if;
  update public.inspection_payouts set status = 'void', void_reason = left(v_reason, 300), voided_by = uid where id = p_payout;
  perform public.audit_write('inspection_payout_voided', 'inspection_payout', p_payout, jsonb_build_object('status', 'payable'), jsonb_build_object('status', 'void'), v_reason);
  return 'ok';
end $f$;

-- ============================================================ 5. the verification budget (the remote budget already has admin_remote_add_budget)
create or replace function public.admin_verification_add_budget(p_amount numeric, p_note text)
returns numeric language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300); v_id uuid;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then raise exception 'Enter an amount above zero.' using errcode = '22023'; end if;
  if v_note is null or char_length(v_note) < 3 then raise exception 'Say where this money comes from.' using errcode = '23514'; end if;
  insert into public.inspection_budget_ledger (service_type, kind, amount, note, created_by) values ('verification', 'allocation', p_amount, v_note, uid) returning id into v_id;
  perform public.audit_write('verification_budget_added', 'inspection_budget', v_id, null, jsonb_build_object('amount', p_amount), v_note);
  return coalesce((select sum(case kind when 'allocation' then amount else -amount end) from public.inspection_budget_ledger where service_type = 'verification'), 0);
end $f$;

-- ============================================================ 6. the screen: budgets, work waiting for a payout, history
create or replace function public.admin_inspection_payouts_overview()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare uid uuid := public.eb_remote_require_admin(); s public.remote_inspection_settings; v_ready jsonb; v_hist jsonb; v_fin jsonb;
begin
  select * into s from public.remote_inspection_settings where id;
  select jsonb_build_object(
    'remote', jsonb_build_object(
      'allocated', coalesce((select sum(amount) from public.inspection_budget_ledger where service_type = 'remote' and kind = 'allocation'), 0),
      'spent', coalesce((select sum(amount) from public.inspection_budget_ledger where service_type = 'remote' and kind = 'expense'), 0),
      'available', public.eb_remote_budget_available()),
    'verification', jsonb_build_object(
      'allocated', coalesce((select sum(amount) from public.inspection_budget_ledger where service_type = 'verification' and kind = 'allocation'), 0),
      'spent', coalesce((select sum(amount) from public.inspection_budget_ledger where service_type = 'verification' and kind = 'expense'), 0))) into v_fin;

  select coalesce(jsonb_agg(x order by x->>'done_at' desc), '[]'::jsonb) into v_ready from (
    select jsonb_build_object('job_id', j.id, 'service_type', j.service_type, 'ref', r.ref, 'title', l.title, 'inspector_name', n.full_name,
             'verdict', i.verdict, 'done_at', coalesce(r.report_released_at, i.reviewed_at, i.inspected_at),
             'suggested_amount', case when j.service_type = 'remote' then s.cost_per_inspection else 0 end,
             'involved', (j.inspector_id = uid or r.tenant_id = uid or r.landlord_id is not distinct from uid)) as x
      from public.inspection_jobs j
      join lateral (select * from public.property_inspections p where p.job_id = j.id order by p.inspected_at desc limit 1) i on true
      left join public.inspection_requests r on r.id = j.request_id and r.job_id = j.id
      left join public.listings l on l.id = j.listing_id
      left join public.inspectors n on n.user_id = j.inspector_id
     where j.inspector_id is not null
       and not exists (select 1 from public.inspection_payouts p where p.job_id = j.id and p.status <> 'void')
       and ((j.service_type = 'remote' and r.status = 'completed' and r.report_released_at is not null
             and not exists (select 1 from public.inspection_disputes d where d.request_id = r.id and d.status = 'open'))
         or (j.service_type = 'verification' and i.integrity_level = 'hashed' and i.review_status <> 'submitted'))
     limit 100) q;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_hist from (
    select jsonb_build_object('id', p.id, 'service_type', p.service_type, 'job_id', p.job_id, 'inspector_name', n.full_name, 'ref', r.ref, 'title', l.title,
             'amount', p.amount, 'transport_amount', p.transport_amount, 'total_amount', p.total_amount, 'status', p.status,
             'method', p.method, 'reference', p.reference, 'paid_at', p.paid_at, 'approved_at', p.approved_at, 'void_reason', p.void_reason,
             'created_at', p.created_at) as x
      from public.inspection_payouts p
      left join public.inspection_jobs j on j.id = p.job_id
      left join public.inspection_requests r on r.id = j.request_id
      left join public.listings l on l.id = j.listing_id
      left join public.inspectors n on n.user_id = p.inspector_id
     order by p.created_at desc limit 100) q;

  return jsonb_build_object('finance', v_fin, 'ready', v_ready, 'payouts', v_hist);
end $f$;

-- ============================================================ 7. who may call what
revoke all on function public.admin_inspection_record_payout(uuid, numeric, numeric, text) from public, anon;
revoke all on function public.admin_inspection_mark_paid(uuid, text, text, timestamptz, text) from public, anon;
revoke all on function public.admin_inspection_void_payout(uuid, text) from public, anon;
revoke all on function public.admin_verification_add_budget(numeric, text) from public, anon;
revoke all on function public.admin_inspection_payouts_overview() from public, anon;
grant execute on function public.admin_inspection_record_payout(uuid, numeric, numeric, text) to authenticated;
grant execute on function public.admin_inspection_mark_paid(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.admin_inspection_void_payout(uuid, text) to authenticated;
grant execute on function public.admin_verification_add_budget(numeric, text) to authenticated;
grant execute on function public.admin_inspection_payouts_overview() to authenticated;

commit;

-- ROLLBACK (only while no payout exists):
-- drop function if exists public.eb_payout_target(uuid, uuid), public.admin_inspection_record_payout(uuid, numeric, numeric, text),
--   public.admin_inspection_mark_paid(uuid, text, text, timestamptz, text), public.admin_inspection_void_payout(uuid, text),
--   public.admin_verification_add_budget(numeric, text), public.admin_inspection_payouts_overview();
