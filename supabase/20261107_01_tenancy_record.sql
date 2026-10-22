-- EboHomes 20261107_01 (Phase 5B): one read-only tenancy record for the tenant, the landlord and EboHomes admins.
-- REQUIRES 20261030_01, 20261101_01, 20261104_01 and 20261105_01. Changes no table, trigger or existing function.
-- Returns facts only: no evidence files, no review notes, no bank accounts, no confirmation codes.
--   Tenant:   own payments, handover, a one-line payout state (no payout amounts).
--   Landlord: verified payments only, handover, own payouts.
--   Admin:    everything above.
begin;

create or replace function public.eb_tenancy_record(p_tenancy uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid();
  t record; l record; h public.tenancy_handovers;
  v_role text; v_terms jsonb; v_terms_status text; v_pay jsonb; v_hand jsonb; v_payouts jsonb; v_ren jsonb;
  v_hold text; v_verified boolean; v_state text; v_tn text; v_ln text;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select id, tenant_id, landlord_id, tenancy_code, status, start_date, end_date, rent_amount, rent_period, listing_id, created_at
    into t from public.tenancies where id = p_tenancy;
  if not found then return jsonb_build_object('found', false); end if;
  v_role := case when v = t.tenant_id then 'tenant' when v = t.landlord_id then 'landlord' when public.eb_is_admin() then 'admin' else null end;
  if v_role is null then return jsonb_build_object('found', false); end if;

  select title, location_text into l from public.listings where id = t.listing_id;
  if v_role in ('landlord', 'admin') then select full_name into v_tn from public.profiles where id = t.tenant_id; end if;
  if v_role in ('tenant', 'admin') then select full_name into v_ln from public.profiles where id = t.landlord_id; end if;

  select jsonb_build_object('rent_amount', r.rent_amount, 'deposit_amount', r.deposit_amount, 'fees_amount', r.fees_amount,
           'payment_schedule', r.payment_schedule, 'notice_days', r.notice_days, 'house_rules', r.house_rules,
           'signed_reference', r.signed_reference, 'signed_at', r.signed_recorded_at)
    into v_terms from public.rental_terms r where r.tenancy_id = p_tenancy and r.status = 'signed' order by r.version desc limit 1;
  select r.status into v_terms_status from public.rental_terms r where r.tenancy_id = p_tenancy order by r.version desc limit 1;

  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v_pay from (
    select s.created_at as ts, jsonb_build_object(
      'id', s.id, 'type', s.payment_type, 'amount', s.amount_paid, 'status', s.status,
      'submitted_at', s.created_at,
      'verified_at', case when s.status = 'verified' then s.reviewed_at end,
      'confirmed_at', c.consumed_at,
      'receipt_code', case when p.status = 'confirmed' and p.verified_by is not null and (v_role <> 'tenant' or c.consumed_at is not null) then p.receipt_code end
    ) as j
    from public.payment_submissions s
    left join public.payments p on p.id = s.payment_id
    left join lateral (select cc.consumed_at from public.payment_confirmation_codes cc where cc.submission_id = s.id and cc.status = 'consumed' limit 1) c on true
    where s.tenancy_id = p_tenancy and s.status <> 'superseded' and (v_role <> 'landlord' or s.status = 'verified')
  ) x;

  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  if found then
    v_hand := jsonb_build_object('status', h.status, 'tenant_confirmed_at', h.tenant_confirmed_at, 'landlord_confirmed_at', h.landlord_confirmed_at,
      'disputed_at', h.disputed_at, 'disputed_role', h.disputed_role, 'completed_at', h.completed_at, 'completed_via', h.completed_via);
  end if;

  v_verified := exists (select 1 from public.payment_submissions where tenancy_id = p_tenancy and status = 'verified');
  v_hold := public.eb_handover_hold_reason(p_tenancy);
  v_state := case
    when not v_verified then 'not_ready'
    when v_hold is not null then 'on_hold'
    when exists (select 1 from public.landlord_payouts where tenancy_id = p_tenancy and status in ('paid','confirmed')) then 'released'
    when exists (select 1 from public.landlord_payouts where tenancy_id = p_tenancy and status <> 'cancelled') then 'in_progress'
    else 'ready' end;

  if v_role in ('landlord', 'admin') then
    select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'status', q.status, 'amount', q.amount, 'payout_code', q.payout_code,
             'created_at', q.created_at, 'paid_at', q.paid_at, 'landlord_responded_at', q.landlord_responded_at) order by q.created_at desc), '[]'::jsonb)
      into v_payouts from public.landlord_payouts q where q.tenancy_id = p_tenancy and q.status <> 'cancelled';
  else
    v_payouts := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status, 'new_rent', r.new_rent, 'new_end_date', r.new_end_date,
           'created_at', r.created_at, 'responded_at', r.responded_at,
           'applied', exists (select 1 from public.renewal_applied a where a.renewal_id = r.id)) order by r.created_at desc), '[]'::jsonb)
    into v_ren from public.renewals r where r.tenancy_id = p_tenancy;

  return jsonb_build_object('found', true, 'role', v_role,
    'tenancy', jsonb_build_object('id', t.id, 'code', t.tenancy_code, 'status', t.status, 'start_date', t.start_date, 'end_date', t.end_date,
                                  'rent_amount', t.rent_amount, 'rent_period', t.rent_period, 'created_at', t.created_at),
    'property', jsonb_build_object('title', l.title, 'location', l.location_text),
    'tenant_name', v_tn, 'landlord_name', v_ln,
    'terms', v_terms, 'terms_status', v_terms_status,
    'payments', v_pay, 'handover', v_hand,
    'payout_state', v_state, 'hold_reason', case when v_verified then v_hold end,
    'payouts', v_payouts, 'renewals', v_ren);
end;
$f$;

revoke all on function public.eb_tenancy_record(uuid) from public, anon;
grant execute on function public.eb_tenancy_record(uuid) to authenticated;

commit;

-- ROLLBACK:
--   drop function if exists public.eb_tenancy_record(uuid);