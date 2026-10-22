-- EboHomes 20261031_01 (Phase 2A): admin review of payment submissions.
-- REQUIRES 20261030_01_payment_submissions.sql.
-- WHAT: one transactional function, eb_review_submission, that an authenticated ADMIN calls (with their own session, so auth.uid() is the admin).
--   start_review | request_info | reject | verify
--   verify = the admin attests they checked the bank account. It then creates ONE payments row (status 'recorded') and confirms it through
--   the EXISTING admin_review_payment(), so payments_guard, payments_verify_guard, receipt codes, audit and notify triggers all run unchanged.
-- ALSO: events get a details column; tenants can no longer read event notes/actors/details (admin reads via the server).
-- DOES NOT: change payments, any trigger, admin_review_payment, receipts or RLS on existing tables.
-- DEPENDENCY NOT VISIBLE IN REPO: payments_verify_guard must set verified_by when admin_review_payment confirms. If it does not,
--   verify FAILS and rolls back (nothing is half-done). Test once with a real submission.
-- ROLLBACK: at the bottom.
begin;

alter table public.payment_submission_events add column if not exists details jsonb;

revoke select on public.payment_submission_events from authenticated;
grant select (id, submission_id, event, created_at) on public.payment_submission_events to authenticated;

create or replace function public.eb_review_submission(p_id uuid, p_action text, p_note text default null, p_attest jsonb default null)
returns jsonb
language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  s public.payment_submissions;
  t record;
  pay public.payments;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_pay uuid;
  v_mismatch boolean;
  v_received numeric;
  v_bankref text;
  v_new text;
  v_title text;
  v_msg text;
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can review payments' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('start_review','request_info','reject','verify') then
    raise exception 'Unknown review action' using errcode = '22023';
  end if;

  select * into s from public.payment_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if s.tenant_id = v_admin then raise exception 'You cannot review your own payment' using errcode = '42501'; end if;

  -- double-click / second admin: verifying an already verified submission changes nothing
  if p_action = 'verify' and s.status = 'verified' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'verified', 'payment_id', s.payment_id);
  end if;
  if s.status not in ('submitted','under_review') then
    raise exception 'This submission is already % and can no longer be reviewed', s.status using errcode = '22023';
  end if;
  if p_action = 'start_review' and s.status <> 'submitted' then
    raise exception 'This submission is already being reviewed' using errcode = '22023';
  end if;
  if p_action in ('request_info','reject') and (v_note is null or char_length(v_note) < 5) then
    raise exception 'A clear message for the tenant is required' using errcode = '22023';
  end if;

  if p_action = 'verify' then
    if p_attest is null
       or coalesce(p_attest->>'checked_bank_account', '') <> 'true'
       or coalesce(p_attest->>'correct_tenant_and_property', '') <> 'true' then
      raise exception 'You must confirm you checked the bank account and the tenant and property' using errcode = '22023';
    end if;
    begin
      v_received := (p_attest->>'amount_received')::numeric;
    exception when others then
      raise exception 'Enter the amount you saw in the bank account' using errcode = '22023';
    end;
    if v_received is distinct from s.amount_paid then
      raise exception 'The amount in the bank does not match the amount the tenant submitted. Request more information or reject instead' using errcode = '22023';
    end if;
    v_bankref := lower(regexp_replace(trim(coalesce(p_attest->>'bank_reference', '')), '\s+', '', 'g'));
    if v_bankref = '' or v_bankref <> s.reference_key then
      raise exception 'The reference you saw in the bank does not match the tenant''s transaction reference' using errcode = '22023';
    end if;
    v_mismatch := s.expected_amount is not null and s.expected_amount <> s.amount_paid;
    if v_mismatch and (coalesce(p_attest->>'mismatch_acknowledged', '') <> 'true' or v_note is null or char_length(v_note) < 10) then
      raise exception 'The amount differs from the signed agreement. Acknowledge it and explain in the note' using errcode = '22023';
    end if;

    select tenant_id, listing_id, status into t from public.tenancies where id = s.tenancy_id;
    if not found or t.tenant_id is distinct from s.tenant_id then raise exception 'Tenancy does not match this submission' using errcode = '42501'; end if;

    v_pay := s.payment_id;
    if v_pay is null then
      insert into public.payments (user_id, listing_id, tenancy_id, type, amount, status, reference, payment_method, source, recorded_by)
      values (s.tenant_id, t.listing_id, s.tenancy_id, s.payment_type, s.amount_paid, 'recorded', s.transaction_reference, s.payment_method, 'manual', v_admin)
      returning id into v_pay;
    end if;
    perform public.admin_review_payment(v_pay, 'confirmed', null);
    select * into pay from public.payments where id = v_pay;
    if pay.status is distinct from 'confirmed' or pay.verified_by is null then
      raise exception 'The payments guard did not record the verification, so nothing was changed' using errcode = 'P0001';
    end if;

    update public.payment_submissions
       set status = 'verified', payment_id = v_pay, reviewed_by = v_admin, reviewed_at = now(), review_note = v_note, updated_at = now()
     where id = s.id;
    insert into public.payment_submission_events (submission_id, event, actor_id, note, details)
    values (s.id, 'bank_verified', v_admin, v_note,
      jsonb_build_object('payment_id', v_pay, 'receipt_code', pay.receipt_code, 'amount', s.amount_paid, 'expected_amount', s.expected_amount,
        'mismatch', v_mismatch, 'attestation', jsonb_build_object('checked_bank_account', true, 'correct_tenant_and_property', true,
        'amount_received', v_received, 'bank_reference', trim(p_attest->>'bank_reference'))));
    v_title := 'Payment verified by EboHomes';
    v_msg := 'EboHomes checked the bank account and verified your payment. Your next step will appear on the payment page.';
    v_new := 'verified';
  else
    v_new := case p_action when 'start_review' then 'under_review' when 'request_info' then 'needs_info' else 'rejected' end;
    update public.payment_submissions
       set status = v_new, reviewed_by = v_admin, reviewed_at = now(),
           review_note = case when p_action = 'start_review' then review_note else v_note end, updated_at = now()
     where id = s.id;
    insert into public.payment_submission_events (submission_id, event, actor_id, note, details)
    values (s.id, case p_action when 'start_review' then 'review_started' when 'request_info' then 'info_requested' else 'rejected' end, v_admin, v_note, null);
    if p_action = 'request_info' then v_title := 'EboHomes needs more information'; v_msg := 'Open your payment page to read the message and send a correction.';
    elsif p_action = 'reject' then v_title := 'Payment submission not accepted'; v_msg := 'Open your payment page to read the reason. If you did pay, you can send a correction.';
    end if;
  end if;

  -- a notification problem must never undo or fake a payment decision
  if v_title is not null then
    begin
      perform public.notify_user(s.tenant_id, v_title, v_msg, '/tenancies/' || s.tenancy_id::text || '/pay', 'payment');
    exception when others then null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'status', v_new, 'payment_id', coalesce(v_pay, s.payment_id));
end;
$f$;
revoke all on function public.eb_review_submission(uuid, text, text, jsonb) from public, anon;
grant execute on function public.eb_review_submission(uuid, text, text, jsonb) to authenticated;

commit;

-- ROLLBACK:
--   drop function if exists public.eb_review_submission(uuid, text, text, jsonb);
--   (the details column and the narrower tenant grant can stay)