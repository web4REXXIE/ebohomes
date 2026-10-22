-- EboHomes 20261104_01 (Phase 4A): landlord payouts.
-- REQUIRES 20261030_01, 20261031_01, 20261101_01, 20261102_01.
-- Does NOT touch payments, payment_submissions, confirmation codes, payout accounts or any existing function.
-- Nobody can read or write these tables directly. Everything goes through the functions below.
-- ASSUMPTION: only 'rent' and 'deposit' payments are paid out to landlords.
-- NOT YET GATED ON KEY HANDOVER (Phase 4B).
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payout-proof', 'payout-proof', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

create table if not exists public.landlord_payouts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id),
  submission_id uuid not null references public.payment_submissions(id),
  tenancy_id uuid not null references public.tenancies(id),
  landlord_id uuid not null references public.profiles(id),
  payout_account_id uuid not null references public.landlord_payout_accounts(id),
  amount numeric(14,2) not null check (amount > 0),
  payment_amount numeric(14,2) not null,
  status text not null default 'pending' check (status in ('pending','approved','paid','confirmed','disputed','cancelled')),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 80),
  payout_code text unique,
  prepared_by uuid not null references public.profiles(id),
  prepared_at timestamptz not null default now(),
  prepare_note text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  paid_by uuid references public.profiles(id),
  paid_at timestamptz,
  bank_reference text,
  proof_path text,
  landlord_responded_at timestamptz,
  landlord_note text,
  created_at timestamptz not null default now()
);
create unique index if not exists lp_one_per_payment on public.landlord_payouts (payment_id) where status <> 'cancelled';
create index if not exists lp_landlord on public.landlord_payouts (landlord_id, created_at desc);
create index if not exists lp_status on public.landlord_payouts (status, created_at);

create table if not exists public.payout_events (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references public.landlord_payouts(id),
  event text not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pev_payout on public.payout_events (payout_id, created_at);

create or replace function public.eb_payout_events_locked() returns trigger language plpgsql as $$
begin raise exception 'Payout events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists pev_immutable on public.payout_events;
create trigger pev_immutable before update or delete on public.payout_events
  for each row execute function public.eb_payout_events_locked();

alter table public.landlord_payouts enable row level security;
alter table public.payout_events enable row level security;
revoke all on public.landlord_payouts from anon, authenticated;
revoke all on public.payout_events from anon, authenticated;

-- internal helper: the landlord's active approved account (not callable by users)
create or replace function public.eb_payout_current_account(p_landlord uuid)
returns uuid language sql stable security definer set search_path to 'public','pg_temp'
as $$
  select id from public.landlord_payout_accounts
   where landlord_id = p_landlord and status = 'approved' and effective_at <= now()
   order by effective_at desc limit 1
$$;
revoke all on function public.eb_payout_current_account(uuid) from public, anon, authenticated;

-- ADMIN: prepare a payout (maker)
create or replace function public.eb_prepare_payout(p_payment uuid, p_amount numeric, p_note text, p_key text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  pay public.payments; sub public.payment_submissions; t record; ex public.landlord_payouts;
  v_acc uuid; v_id uuid; v_amt numeric(14,2);
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can prepare payouts' using errcode = '42501';
  end if;
  if p_payment is null then raise exception 'Invalid payment' using errcode = '22023'; end if;
  if p_key is null or char_length(p_key) < 16 or char_length(p_key) > 80 then
    raise exception 'Invalid request key' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_payment::text, 7));

  select * into ex from public.landlord_payouts where idempotency_key = p_key;
  if found then
    if ex.payment_id <> p_payment then raise exception 'This request key was already used for another payment' using errcode = '22023'; end if;
    return jsonb_build_object('ok', true, 'already', true, 'id', ex.id);
  end if;

  select * into pay from public.payments where id = p_payment;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if pay.status is distinct from 'confirmed' or pay.verified_by is null then
    raise exception 'This payment has not been bank-verified' using errcode = '22023';
  end if;
  if pay.type not in ('rent','deposit') then
    raise exception 'Only rent and deposit payments are paid out to landlords' using errcode = '22023';
  end if;

  select * into sub from public.payment_submissions where payment_id = p_payment and status = 'verified' order by created_at desc limit 1;
  if not found then raise exception 'No verified submission is linked to this payment' using errcode = '22023'; end if;
  if not exists (select 1 from public.payment_confirmation_codes where submission_id = sub.id and status = 'consumed') then
    raise exception 'The tenant has not confirmed this payment yet' using errcode = '22023';
  end if;
  -- PHASE 4B: the key handover release rule will be checked here.

  select landlord_id, tenant_id into t from public.tenancies where id = pay.tenancy_id;
  if not found or t.landlord_id is null then raise exception 'Tenancy or landlord not found' using errcode = 'P0002'; end if;
  if v_admin = t.landlord_id or v_admin = t.tenant_id then
    raise exception 'You cannot prepare a payout for your own tenancy' using errcode = '42501';
  end if;
  if exists (select 1 from public.landlord_payouts where payment_id = p_payment and status <> 'cancelled') then
    raise exception 'A payout already exists for this payment' using errcode = '22023';
  end if;

  v_amt := round(p_amount, 2);
  if v_amt is null or v_amt <= 0 or v_amt > pay.amount then
    raise exception 'The payout amount must be more than zero and not more than the payment' using errcode = '22023';
  end if;
  if v_amt <> pay.amount and (v_note is null or char_length(v_note) < 10) then
    raise exception 'The amount differs from the payment. Explain the difference in the note' using errcode = '22023';
  end if;

  v_acc := public.eb_payout_current_account(t.landlord_id);
  if v_acc is null then raise exception 'The landlord has no active approved payout account' using errcode = '22023'; end if;

  insert into public.landlord_payouts (payment_id, submission_id, tenancy_id, landlord_id, payout_account_id, amount, payment_amount, idempotency_key, prepared_by, prepare_note)
  values (p_payment, sub.id, pay.tenancy_id, t.landlord_id, v_acc, v_amt, pay.amount, p_key, v_admin, v_note)
  returning id into v_id;
  insert into public.payout_events (payout_id, event, actor_id, note) values (v_id, 'payout_prepared', v_admin, v_note);
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

-- ADMIN: approve (checker, must differ from the preparer) or cancel
create or replace function public.eb_review_payout(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  p public.landlord_payouts; pay public.payments; v_tenant uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can review payouts' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('approve','cancel') then raise exception 'Unknown action' using errcode = '22023'; end if;
  select * into p from public.landlord_payouts where id = p_id for update;
  if not found then raise exception 'Payout not found' using errcode = 'P0002'; end if;
  select tenant_id into v_tenant from public.tenancies where id = p.tenancy_id;
  if v_admin = p.landlord_id or v_admin = v_tenant then
    raise exception 'You cannot act on a payout for your own tenancy' using errcode = '42501';
  end if;

  if p_action = 'cancel' then
    if p.status not in ('pending','approved') then raise exception 'Only a payout that has not been paid can be cancelled' using errcode = '22023'; end if;
    if v_note is null or char_length(v_note) < 5 then raise exception 'Write a reason for cancelling' using errcode = '22023'; end if;
    update public.landlord_payouts set status = 'cancelled' where id = p.id;
    insert into public.payout_events (payout_id, event, actor_id, note) values (p.id, 'payout_cancelled', v_admin, v_note);
    return jsonb_build_object('ok', true, 'status', 'cancelled');
  end if;

  if p.status <> 'pending' then raise exception 'This payout is already %', p.status using errcode = '22023'; end if;
  if p.prepared_by = v_admin then
    raise exception 'A different administrator must approve a payout you prepared' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p.payment_id;
  if pay.status is distinct from 'confirmed' or pay.verified_by is null then
    raise exception 'The linked payment is no longer bank-verified' using errcode = '22023';
  end if;
  if public.eb_payout_current_account(p.landlord_id) is distinct from p.payout_account_id then
    raise exception 'The landlord payout account changed. Cancel this payout and prepare it again' using errcode = '22023';
  end if;
  update public.landlord_payouts set status = 'approved', approved_by = v_admin, approved_at = now() where id = p.id;
  insert into public.payout_events (payout_id, event, actor_id, note) values (p.id, 'payout_approved', v_admin, v_note);
  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$f$;

-- ADMIN: record that the transfer was made (proof already uploaded)
create or replace function public.eb_mark_payout_paid(p_id uuid, p_reference text, p_proof_path text, p_attest jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  p public.landlord_payouts; v_tenant uuid; v_amt numeric; v_code text;
  v_ref text := trim(coalesce(p_reference, ''));
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can record payouts' using errcode = '42501';
  end if;
  select * into p from public.landlord_payouts where id = p_id for update;
  if not found then raise exception 'Payout not found' using errcode = 'P0002'; end if;
  select tenant_id into v_tenant from public.tenancies where id = p.tenancy_id;
  if v_admin = p.landlord_id or v_admin = v_tenant then
    raise exception 'You cannot act on a payout for your own tenancy' using errcode = '42501';
  end if;
  if p.status <> 'approved' then raise exception 'Only an approved payout can be marked as paid' using errcode = '22023'; end if;
  if char_length(v_ref) < 4 or char_length(v_ref) > 100 then raise exception 'Enter the transfer reference from the bank' using errcode = '22023'; end if;
  if p_proof_path is null or char_length(p_proof_path) > 200 or p_proof_path !~ '\.\.'
     and p_proof_path not like ('payouts/' || p.id::text || '/%') then
    raise exception 'Upload the proof of transfer first' using errcode = '22023';
  end if;
  if p_proof_path ~ '\.\.' then raise exception 'Upload the proof of transfer first' using errcode = '22023'; end if;
  if coalesce(p_attest->>'transferred_to_shown_account', '') <> 'true' then
    raise exception 'Confirm you sent the money to the account shown' using errcode = '22023';
  end if;
  begin v_amt := (p_attest->>'amount_sent')::numeric; exception when others then
    raise exception 'Enter the amount you sent' using errcode = '22023';
  end;
  if v_amt is distinct from p.amount then raise exception 'The amount sent must equal the payout amount' using errcode = '22023'; end if;
  if public.eb_payout_current_account(p.landlord_id) is distinct from p.payout_account_id then
    raise exception 'The landlord payout account changed. Cancel this payout and prepare it again' using errcode = '22023';
  end if;

  v_code := 'PO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  update public.landlord_payouts
     set status = 'paid', paid_by = v_admin, paid_at = now(), bank_reference = v_ref, proof_path = p_proof_path, payout_code = v_code
   where id = p.id;
  insert into public.payout_events (payout_id, event, actor_id, note) values (p.id, 'payout_paid', v_admin, v_ref);
  begin
    perform public.notify_user(p.landlord_id, 'Your rent payout was sent',
      'EboHomes sent your payout. Check your bank account, then confirm receipt on your payouts page.', '/dashboard/payouts', 'payment');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'paid', 'payout_code', v_code);
end;
$f$;

-- LANDLORD: confirm receipt or dispute
create or replace function public.eb_landlord_respond_payout(p_id uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare p public.landlord_payouts; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('confirm','dispute') then raise exception 'Unknown action' using errcode = '22023'; end if;
  select * into p from public.landlord_payouts where id = p_id and landlord_id = auth.uid() for update;
  if not found then raise exception 'Payout not found' using errcode = 'P0002'; end if;
  if p.status <> 'paid' then raise exception 'This payout is already % and cannot be answered again', p.status using errcode = '22023'; end if;
  if p_action = 'dispute' and (v_note is null or char_length(v_note) < 10) then
    raise exception 'Tell EboHomes what is wrong (at least 10 characters)' using errcode = '22023';
  end if;
  update public.landlord_payouts
     set status = case when p_action = 'confirm' then 'confirmed' else 'disputed' end,
         landlord_responded_at = now(), landlord_note = v_note
   where id = p.id;
  insert into public.payout_events (payout_id, event, actor_id, note)
  values (p.id, case when p_action = 'confirm' then 'landlord_confirmed' else 'landlord_disputed' end, auth.uid(), v_note);
  begin
    perform public.notify_admins(case when p_action = 'confirm' then 'Landlord confirmed a payout' else 'Landlord DISPUTED a payout' end,
      'Open Landlord Payouts to review it.', '/admin/payouts', 'payment');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', case when p_action = 'confirm' then 'confirmed' else 'disputed' end);
end;
$f$;

-- LANDLORD: own payouts (masked account, never a full number)
create or replace function public.eb_my_payouts()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'amount', p.amount, 'payout_code', p.payout_code,
      'bank_name', a.bank_name, 'masked', '******' || right(a.account_number, 4), 'account_name', a.account_name,
      'tenancy_code', t.tenancy_code, 'listing_title', l.title, 'payment_type', pay.type,
      'paid_at', p.paid_at, 'bank_reference', p.bank_reference, 'has_proof', p.proof_path is not null,
      'landlord_note', p.landlord_note, 'created_at', p.created_at) order by p.created_at desc)
    from public.landlord_payouts p
    join public.landlord_payout_accounts a on a.id = p.payout_account_id
    join public.payments pay on pay.id = p.payment_id
    left join public.tenancies t on t.id = p.tenancy_id
    left join public.listings l on l.id = t.listing_id
    where p.landlord_id = auth.uid() and p.status <> 'cancelled'
  ), '[]'::jsonb));
end;
$f$;

-- ADMIN or the landlord: path of the proof file (the server then makes a short signed link)
create or replace function public.eb_payout_proof_path(p_id uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare p public.landlord_payouts;
begin
  if auth.uid() is null then return null; end if;
  select * into p from public.landlord_payouts where id = p_id;
  if not found or p.proof_path is null then return null; end if;
  if public.eb_is_admin() then return p.proof_path; end if;
  if p.landlord_id = auth.uid() and p.status in ('paid','confirmed','disputed') then return p.proof_path; end if;
  return null;
end;
$f$;

-- ADMIN: payments ready for a payout
create or replace function public.eb_admin_payout_candidates()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select pay.confirmed_at as ts, jsonb_build_object(
      'payment_id', pay.id, 'amount', pay.amount, 'type', pay.type, 'confirmed_at', pay.confirmed_at,
      'tenancy_code', t.tenancy_code, 'landlord_name', lp.full_name, 'tenant_name', tp.full_name,
      'has_account', public.eb_payout_current_account(t.landlord_id) is not null) as j
    from public.payments pay
    join public.tenancies t on t.id = pay.tenancy_id
    join public.profiles lp on lp.id = t.landlord_id
    join public.profiles tp on tp.id = t.tenant_id
    where pay.status = 'confirmed' and pay.verified_by is not null and pay.type in ('rent','deposit')
      and exists (select 1 from public.payment_submissions s join public.payment_confirmation_codes c on c.submission_id = s.id and c.status = 'consumed'
                   where s.payment_id = pay.id and s.status = 'verified')
      and not exists (select 1 from public.landlord_payouts q where q.payment_id = pay.id and q.status <> 'cancelled')
    order by pay.confirmed_at desc nulls last limit 100
  ) x;
  return v;
end;
$f$;

-- ADMIN: payouts with full account details
create or replace function public.eb_admin_payouts(p_filter text default 'progress')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select p.created_at as ts, jsonb_build_object(
      'id', p.id, 'status', p.status, 'amount', p.amount, 'payment_amount', p.payment_amount, 'payout_code', p.payout_code,
      'landlord_name', lp.full_name, 'landlord_phone', lp.phone, 'tenancy_code', t.tenancy_code, 'payment_type', pay.type,
      'bank_name', a.bank_name, 'account_number', a.account_number, 'account_name', a.account_name,
      'account_is_current', coalesce(public.eb_payout_current_account(p.landlord_id) = p.payout_account_id, false),
      'prepared_by_name', pb.full_name, 'prepare_note', p.prepare_note, 'bank_reference', p.bank_reference,
      'paid_at', p.paid_at, 'has_proof', p.proof_path is not null, 'landlord_note', p.landlord_note, 'created_at', p.created_at,
      'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'by', ep.full_name, 'note', e.note) order by e.created_at)
                          from public.payout_events e left join public.profiles ep on ep.id = e.actor_id where e.payout_id = p.id), '[]'::jsonb)
    ) as j
    from public.landlord_payouts p
    join public.profiles lp on lp.id = p.landlord_id
    join public.landlord_payout_accounts a on a.id = p.payout_account_id
    join public.payments pay on pay.id = p.payment_id
    left join public.tenancies t on t.id = p.tenancy_id
    left join public.profiles pb on pb.id = p.prepared_by
    where p_filter = 'all'
       or (p_filter = 'progress' and p.status in ('pending','approved'))
       or (p_filter = 'done' and p.status in ('paid','confirmed','disputed'))
    order by p.created_at desc limit 100
  ) x;
  return v;
end;
$f$;

revoke all on function public.eb_prepare_payout(uuid, numeric, text, text) from public, anon;
revoke all on function public.eb_review_payout(uuid, text, text) from public, anon;
revoke all on function public.eb_mark_payout_paid(uuid, text, text, jsonb) from public, anon;
revoke all on function public.eb_landlord_respond_payout(uuid, text, text) from public, anon;
revoke all on function public.eb_my_payouts() from public, anon;
revoke all on function public.eb_payout_proof_path(uuid) from public, anon;
revoke all on function public.eb_admin_payout_candidates() from public, anon;
revoke all on function public.eb_admin_payouts(text) from public, anon;
grant execute on function public.eb_prepare_payout(uuid, numeric, text, text) to authenticated;
grant execute on function public.eb_review_payout(uuid, text, text) to authenticated;
grant execute on function public.eb_mark_payout_paid(uuid, text, text, jsonb) to authenticated;
grant execute on function public.eb_landlord_respond_payout(uuid, text, text) to authenticated;
grant execute on function public.eb_my_payouts() to authenticated;
grant execute on function public.eb_payout_proof_path(uuid) to authenticated;
grant execute on function public.eb_admin_payout_candidates() to authenticated;
grant execute on function public.eb_admin_payouts(text) to authenticated;

commit;

-- ROLLBACK (only if no payouts were created):
--   drop function if exists public.eb_prepare_payout(uuid, numeric, text, text), public.eb_review_payout(uuid, text, text),
--     public.eb_mark_payout_paid(uuid, text, text, jsonb), public.eb_landlord_respond_payout(uuid, text, text),
--     public.eb_my_payouts(), public.eb_payout_proof_path(uuid), public.eb_admin_payout_candidates(),
--     public.eb_admin_payouts(text), public.eb_payout_current_account(uuid);
--   drop table if exists public.payout_events, public.landlord_payouts;