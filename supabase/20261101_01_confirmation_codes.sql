-- EboHomes 20261101_01 (Phase 2B): single-use tenant confirmation codes.
-- REQUIRES 20261030_01 and 20261031_01.
-- Codes are issued ONLY by an admin AFTER bank verification. Only an HMAC hash is stored.
-- Does not change payments, payment_submissions, any trigger, or any existing function.
begin;

create table if not exists public.payment_confirmation_codes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.payment_submissions(id),
  tenant_id uuid not null references public.profiles(id),
  tenancy_id uuid not null references public.tenancies(id),
  payment_id uuid not null references public.payments(id),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active','consumed','superseded','expired','locked')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','sent','failed')),
  attempts int not null default 0,
  max_attempts int not null default 5,
  issued_by uuid not null references public.profiles(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  delivered_at timestamptz,
  consumed_at timestamptz
);
create unique index if not exists pcc_one_active on public.payment_confirmation_codes (submission_id) where status = 'active';
create unique index if not exists pcc_one_consumed on public.payment_confirmation_codes (submission_id) where status = 'consumed';
create index if not exists pcc_tenant on public.payment_confirmation_codes (tenant_id);

create table if not exists public.payment_code_events (
  id uuid primary key default gen_random_uuid(),
  code_id uuid references public.payment_confirmation_codes(id),
  submission_id uuid not null,
  event text not null,
  actor_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pce_sub on public.payment_code_events (submission_id, created_at);

create or replace function public.eb_code_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'Code events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists pce_immutable on public.payment_code_events;
create trigger pce_immutable before update or delete on public.payment_code_events
  for each row execute function public.eb_code_events_immutable();

-- No direct table access for anyone. Everything goes through the functions below.
alter table public.payment_confirmation_codes enable row level security;
alter table public.payment_code_events enable row level security;
revoke all on public.payment_confirmation_codes from anon, authenticated;
revoke all on public.payment_code_events from anon, authenticated;

-- ADMIN: issue a code (hash computed by the server; the database never sees the plaintext)
create or replace function public.eb_issue_confirmation_code(p_submission uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  s public.payment_submissions;
  pay public.payments;
  v_recent int; v_last timestamptz; v_id uuid; v_exp timestamptz := now() + interval '24 hours';
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can issue codes' using errcode = '42501';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid code hash' using errcode = '22023'; end if;

  select * into s from public.payment_submissions where id = p_submission for update;
  if not found then raise exception 'Submission not found' using errcode = 'P0002'; end if;
  if s.tenant_id = v_admin then raise exception 'You cannot issue a code for your own payment' using errcode = '42501'; end if;
  if s.status <> 'verified' or s.payment_id is null then
    raise exception 'Bank verification must be completed first' using errcode = '22023';
  end if;
  select * into pay from public.payments where id = s.payment_id;
  if pay.status is distinct from 'confirmed' or pay.verified_by is null then
    raise exception 'Bank verification must be completed first' using errcode = '22023';
  end if;
  if exists (select 1 from public.payment_confirmation_codes where submission_id = s.id and status = 'consumed') then
    raise exception 'This payment has already been confirmed by the tenant' using errcode = '22023';
  end if;

  select count(*), max(issued_at) into v_recent, v_last
    from public.payment_confirmation_codes where submission_id = s.id and issued_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'Code limit reached for today. Try again tomorrow' using errcode = '22023'; end if;
  if v_last is not null and v_last > now() - interval '2 minutes' then
    raise exception 'Wait two minutes before sending another code' using errcode = '22023';
  end if;

  update public.payment_confirmation_codes set status = 'superseded' where submission_id = s.id and status = 'active';
  insert into public.payment_confirmation_codes (submission_id, tenant_id, tenancy_id, payment_id, code_hash, issued_by, expires_at)
  values (s.id, s.tenant_id, s.tenancy_id, s.payment_id, p_hash, v_admin, v_exp) returning id into v_id;
  insert into public.payment_code_events (code_id, submission_id, event, actor_id) values (v_id, s.id, 'code_issued', v_admin);
  return jsonb_build_object('ok', true, 'code_id', v_id, 'expires_at', v_exp);
end;
$f$;

-- ADMIN: record whether the email actually went out
create or replace function public.eb_mark_code_delivery(p_code uuid, p_status text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.payment_confirmation_codes;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  if p_status not in ('sent','failed') then raise exception 'Invalid status' using errcode = '22023'; end if;
  select * into c from public.payment_confirmation_codes where id = p_code for update;
  if not found or c.status <> 'active' then raise exception 'Code not found' using errcode = 'P0002'; end if;
  update public.payment_confirmation_codes
     set delivery_status = p_status, delivered_at = case when p_status = 'sent' then now() else null end where id = c.id;
  insert into public.payment_code_events (code_id, submission_id, event, actor_id)
  values (c.id, c.submission_id, case when p_status = 'sent' then 'code_emailed' else 'code_email_failed' end, auth.uid());
  if p_status = 'sent' then
    begin
      perform public.notify_user(c.tenant_id, 'Your confirmation code was sent',
        'EboHomes emailed you a confirmation code. Enter it on your payment page to finish confirming your payment.',
        '/payment-confirmation/' || c.submission_id::text, 'payment');
    exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true);
end;
$f$;

-- TENANT: redeem. Returns ok:false (never raises) on a wrong code so the attempt counter commits.
create or replace function public.eb_redeem_confirmation_code(p_submission uuid, p_hash text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_user uuid := auth.uid();
  s record; c public.payment_confirmation_codes; v_fail int; v_att int;
begin
  if v_user is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;

  select tenant_id into s from public.payment_submissions where id = p_submission;
  if not found or s.tenant_id <> v_user then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  select count(*) into v_fail from public.payment_code_events
   where actor_id = v_user and event = 'redeem_failed' and created_at > now() - interval '15 minutes';
  if v_fail >= 10 then return jsonb_build_object('ok', false, 'reason', 'rate_limited'); end if;

  select * into c from public.payment_confirmation_codes where submission_id = p_submission and status = 'active' for update;
  if not found then
    if exists (select 1 from public.payment_confirmation_codes where submission_id = p_submission and status = 'consumed') then
      return jsonb_build_object('ok', false, 'reason', 'already_used');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'no_code');
  end if;
  if c.delivery_status <> 'sent' then return jsonb_build_object('ok', false, 'reason', 'no_code'); end if;

  if c.expires_at <= now() then
    update public.payment_confirmation_codes set status = 'expired' where id = c.id;
    insert into public.payment_code_events (code_id, submission_id, event, actor_id) values (c.id, c.submission_id, 'code_expired', v_user);
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if c.attempts >= c.max_attempts then
    update public.payment_confirmation_codes set status = 'locked' where id = c.id;
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  if c.code_hash = p_hash then
    update public.payment_confirmation_codes set status = 'consumed', consumed_at = now() where id = c.id;
    insert into public.payment_code_events (code_id, submission_id, event, actor_id) values (c.id, c.submission_id, 'tenant_confirmed', v_user);
    begin
      perform public.notify_user(v_user, 'Payment confirmed', 'You have confirmed your payment. Your receipt is on your payment page.',
        '/payment-confirmation/' || c.submission_id::text, 'payment');
    exception when others then null; end;
    begin
      perform public.notify_admins('Tenant confirmed payment', 'A tenant completed the confirmation code step.', '/admin/payment-submissions', 'payment');
    exception when others then null; end;
    return jsonb_build_object('ok', true);
  end if;

  v_att := c.attempts + 1;
  update public.payment_confirmation_codes set attempts = v_att, status = case when v_att >= c.max_attempts then 'locked' else 'active' end where id = c.id;
  insert into public.payment_code_events (code_id, submission_id, event, actor_id) values (c.id, c.submission_id, 'redeem_failed', v_user);
  return jsonb_build_object('ok', false, 'reason', case when v_att >= c.max_attempts then 'locked' else 'invalid' end,
                            'attempts_left', greatest(c.max_attempts - v_att, 0));
end;
$f$;

-- TENANT: progress for their own submission (never returns the code or its hash)
create or replace function public.eb_my_confirmation_state(p_submission uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare
  s public.payment_submissions; c public.payment_confirmation_codes; t record; l record; r text; v_state text;
begin
  if auth.uid() is null then return jsonb_build_object('found', false); end if;
  select * into s from public.payment_submissions where id = p_submission and tenant_id = auth.uid();
  if not found then return jsonb_build_object('found', false); end if;
  select tenancy_code, listing_id into t from public.tenancies where id = s.tenancy_id;
  select title, location_text into l from public.listings where id = t.listing_id;
  select * into c from public.payment_confirmation_codes where submission_id = s.id
   order by (status = 'consumed') desc, issued_at desc limit 1;

  if s.status in ('submitted','under_review') then v_state := 'awaiting_review';
  elsif s.status = 'needs_info' then v_state := 'needs_info';
  elsif s.status <> 'verified' then v_state := 'closed';
  elsif c.status = 'consumed' then v_state := 'confirmed';
  elsif c.status = 'locked' then v_state := 'locked';
  elsif c.status = 'expired' then v_state := 'code_expired';
  elsif c.status = 'active' and c.delivery_status = 'sent' and c.expires_at <= now() then v_state := 'code_expired';
  elsif c.status = 'active' and c.delivery_status = 'sent' then v_state := 'code_sent';
  else v_state := 'code_pending';
  end if;

  if v_state = 'confirmed' then select receipt_code into r from public.payments where id = s.payment_id; end if;
  return jsonb_build_object('found', true, 'state', v_state, 'tenancy_id', s.tenancy_id, 'tenancy_code', t.tenancy_code,
    'listing_title', l.title, 'location', l.location_text, 'payment_type', s.payment_type, 'amount', s.amount_paid,
    'reference', s.transaction_reference,
    'expires_at', case when v_state = 'code_sent' then c.expires_at end,
    'attempts_left', case when v_state = 'code_sent' then greatest(c.max_attempts - c.attempts, 0) end,
    'confirmed_at', case when v_state = 'confirmed' then c.consumed_at end,
    'receipt_code', r);
end;
$f$;

-- ADMIN: code status for the review page (no code, no hash)
create or replace function public.eb_admin_code_status(p_submission uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare c public.payment_confirmation_codes; n int;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select count(*) into n from public.payment_confirmation_codes where submission_id = p_submission and issued_at > now() - interval '24 hours';
  select * into c from public.payment_confirmation_codes where submission_id = p_submission
   order by (status = 'consumed') desc, issued_at desc limit 1;
  if c.id is null then return jsonb_build_object('exists', false, 'issued_24h', n); end if;
  return jsonb_build_object('exists', true, 'status', c.status, 'delivery_status', c.delivery_status, 'issued_at', c.issued_at,
    'expires_at', c.expires_at, 'attempts', c.attempts, 'consumed_at', c.consumed_at, 'issued_24h', n);
end;
$f$;

revoke all on function public.eb_issue_confirmation_code(uuid, text) from public, anon;
revoke all on function public.eb_mark_code_delivery(uuid, text) from public, anon;
revoke all on function public.eb_redeem_confirmation_code(uuid, text) from public, anon;
revoke all on function public.eb_my_confirmation_state(uuid) from public, anon;
revoke all on function public.eb_admin_code_status(uuid) from public, anon;
grant execute on function public.eb_issue_confirmation_code(uuid, text) to authenticated;
grant execute on function public.eb_mark_code_delivery(uuid, text) to authenticated;
grant execute on function public.eb_redeem_confirmation_code(uuid, text) to authenticated;
grant execute on function public.eb_my_confirmation_state(uuid) to authenticated;
grant execute on function public.eb_admin_code_status(uuid) to authenticated;

commit;

-- ROLLBACK (only if no codes were issued yet):
--   drop function if exists public.eb_issue_confirmation_code(uuid, text), public.eb_mark_code_delivery(uuid, text),
--     public.eb_redeem_confirmation_code(uuid, text), public.eb_my_confirmation_state(uuid), public.eb_admin_code_status(uuid);
--   drop table if exists public.payment_code_events, public.payment_confirmation_codes;