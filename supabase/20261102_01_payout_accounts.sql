-- EboHomes 20261102_01 (Phase 3A): protected landlord payout accounts.
-- REQUIRES the earlier migrations. Does NOT touch profiles, payments or any existing function.
-- Nobody can read or write these tables directly. Everything goes through the functions below.
-- ASSUMPTION: profiles.role = 'landlord' for landlords (admins use eb_is_admin()).
begin;

create table if not exists public.landlord_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references public.profiles(id),
  bank_name text not null check (char_length(bank_name) between 2 and 80),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null check (char_length(account_name) between 2 and 120),
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','cancelled')),
  name_match boolean not null default false,
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  effective_at timestamptz,
  check ((status = 'approved') = (effective_at is not null))
);
create unique index if not exists lpa_one_pending on public.landlord_payout_accounts (landlord_id) where status = 'pending_review';
create index if not exists lpa_landlord on public.landlord_payout_accounts (landlord_id, status, effective_at);

create table if not exists public.payout_account_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.landlord_payout_accounts(id),
  landlord_id uuid not null,
  event text not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pae_acc on public.payout_account_events (account_id, created_at);

create or replace function public.eb_payout_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'Payout account events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists pae_immutable on public.payout_account_events;
create trigger pae_immutable before update or delete on public.payout_account_events
  for each row execute function public.eb_payout_events_immutable();

alter table public.landlord_payout_accounts enable row level security;
alter table public.payout_account_events enable row level security;
revoke all on public.landlord_payout_accounts from anon, authenticated;
revoke all on public.payout_account_events from anon, authenticated;

create or replace function public.eb_name_tokens_match(p_profile text, p_account text)
returns boolean language sql immutable set search_path to 'pg_catalog','pg_temp'
as $$
  select coalesce(bool_and(position(w in lower(regexp_replace(coalesce(p_account, ''), '[^a-zA-Z ]', ' ', 'g'))) > 0), false)
  from unnest(string_to_array(trim(regexp_replace(lower(coalesce(p_profile, '')), '[^a-z ]', ' ', 'g')), ' ')) as w
  where w <> '' and char_length(w) > 1
$$;

-- LANDLORD: request a new account or a change
create or replace function public.eb_request_payout_account(p_bank text, p_number text, p_name text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid();
  pr record;
  v_bank text := trim(coalesce(p_bank, ''));
  v_num text := regexp_replace(coalesce(p_number, ''), '[\s-]', '', 'g');
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_recent int; v_id uuid; v_match boolean; v_has_current boolean;
begin
  if v is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select id, role, full_name into pr from public.profiles where id = v;
  if not found or pr.role is distinct from 'landlord' then
    raise exception 'Only landlords can add a payout account' using errcode = '42501';
  end if;
  if v_num !~ '^[0-9]{10}$' then raise exception 'The account number must be exactly 10 digits' using errcode = '22023'; end if;
  if char_length(v_bank) < 2 or char_length(v_bank) > 80 then raise exception 'Enter the bank name' using errcode = '22023'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Enter the account name' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v::text, 0));

  if exists (select 1 from public.landlord_payout_accounts where landlord_id = v and status = 'pending_review') then
    raise exception 'You already have a request waiting for review. Cancel it first to send a new one' using errcode = '22023';
  end if;
  if exists (select 1 from public.landlord_payout_accounts where landlord_id = v and status = 'approved' and effective_at > now()) then
    raise exception 'A change is already scheduled. Wait until it takes effect, or contact EboHomes' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.landlord_payout_accounts where landlord_id = v and requested_at > now() - interval '24 hours';
  if v_recent >= 3 then raise exception 'Too many requests today. Try again tomorrow' using errcode = '22023'; end if;
  if exists (select 1 from public.landlord_payout_accounts where landlord_id = v and status = 'approved' and effective_at <= now()
             and account_number = v_num and lower(bank_name) = lower(v_bank)) then
    raise exception 'That is already your payout account' using errcode = '22023';
  end if;

  v_match := public.eb_name_tokens_match(pr.full_name, v_name);
  insert into public.landlord_payout_accounts (landlord_id, bank_name, account_number, account_name, name_match)
  values (v, v_bank, v_num, v_name, v_match) returning id into v_id;
  insert into public.payout_account_events (account_id, landlord_id, event, actor_id) values (v_id, v, 'account_requested', v);

  select exists (select 1 from public.landlord_payout_accounts where landlord_id = v and status = 'approved' and effective_at <= now()) into v_has_current;
  begin
    perform public.notify_user(v, 'Payout account request received',
      case when v_has_current
        then 'A change to your payout account was requested. Your current account stays in use until EboHomes approves it and the waiting period ends. If you did not do this, contact EboHomes immediately.'
        else 'Your payout account was sent to EboHomes for review.' end,
      '/dashboard/payout-account', 'payment');
  exception when others then null; end;
  begin
    perform public.notify_admins('Payout account needs review', 'A landlord submitted a payout account for review.', '/admin/payout-accounts', 'payment');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$f$;

-- LANDLORD: cancel own pending request
create or replace function public.eb_cancel_payout_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.landlord_payout_accounts;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into a from public.landlord_payout_accounts where id = p_id and landlord_id = auth.uid() for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending_review' then raise exception 'Only a request waiting for review can be cancelled' using errcode = '22023'; end if;
  update public.landlord_payout_accounts set status = 'cancelled' where id = a.id;
  insert into public.payout_account_events (account_id, landlord_id, event, actor_id) values (a.id, a.landlord_id, 'request_cancelled', auth.uid());
  return jsonb_build_object('ok', true);
end;
$f$;

-- LANDLORD: own accounts, masked. Never returns a full account number.
create or replace function public.eb_my_payout_accounts()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); cur public.landlord_payout_accounts;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select * into cur from public.landlord_payout_accounts
   where landlord_id = v and status = 'approved' and effective_at <= now() order by effective_at desc limit 1;
  return jsonb_build_object('found', true,
    'current_id', cur.id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'bank_name', a.bank_name, 'masked', '******' || right(a.account_number, 4),
        'account_name', a.account_name, 'status', a.status, 'requested_at', a.requested_at, 'effective_at', a.effective_at,
        'review_note', case when a.status = 'rejected' then a.review_note end) order by a.requested_at desc)
      from (select * from public.landlord_payout_accounts where landlord_id = v order by requested_at desc limit 20) a
    ), '[]'::jsonb));
end;
$f$;

-- ADMIN: queue with full details
create or replace function public.eb_admin_payout_queue(p_filter text default 'pending')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select a.requested_at as ts, jsonb_build_object(
      'id', a.id, 'status', a.status, 'bank_name', a.bank_name, 'account_number', a.account_number, 'account_name', a.account_name,
      'name_match', a.name_match, 'requested_at', a.requested_at, 'effective_at', a.effective_at, 'review_note', a.review_note,
      'landlord_name', p.full_name, 'landlord_phone', p.phone, 'landlord_email', p.email,
      'has_current', exists (select 1 from public.landlord_payout_accounts c where c.landlord_id = a.landlord_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id),
      'current_masked', (select '******' || right(c.account_number, 4) || ' · ' || c.bank_name from public.landlord_payout_accounts c
                          where c.landlord_id = a.landlord_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id
                          order by c.effective_at desc limit 1),
      'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'by', ep.full_name, 'note', e.note) order by e.created_at)
                          from public.payout_account_events e left join public.profiles ep on ep.id = e.actor_id where e.account_id = a.id), '[]'::jsonb)
    ) as j
    from public.landlord_payout_accounts a join public.profiles p on p.id = a.landlord_id
    where p_filter = 'all'
       or (p_filter = 'scheduled' and a.status = 'approved' and a.effective_at > now())
       or (p_filter = 'pending' and a.status = 'pending_review')
    order by a.requested_at desc limit 100
  ) x;
  return v;
end;
$f$;

-- ADMIN: approve or reject (maker-checker: cannot review your own account)
create or replace function public.eb_review_payout_account(p_id uuid, p_action text, p_note text default null, p_attest jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  a public.landlord_payout_accounts;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_has_current boolean; v_eff timestamptz;
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can review payout accounts' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Unknown action' using errcode = '22023'; end if;
  perform 1;
  select * into a from public.landlord_payout_accounts where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if a.landlord_id = v_admin then raise exception 'You cannot review your own payout account' using errcode = '42501'; end if;
  if a.status <> 'pending_review' then raise exception 'This request is already % and cannot be reviewed again', a.status using errcode = '22023'; end if;

  if p_action = 'reject' then
    if v_note is null or char_length(v_note) < 5 then raise exception 'A clear reason for the landlord is required' using errcode = '22023'; end if;
    update public.landlord_payout_accounts set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note where id = a.id;
    insert into public.payout_account_events (account_id, landlord_id, event, actor_id, note) values (a.id, a.landlord_id, 'account_rejected', v_admin, v_note);
    begin
      perform public.notify_user(a.landlord_id, 'Payout account not approved', 'Open your payout account page to read the reason.', '/dashboard/payout-account', 'payment');
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  select exists (select 1 from public.landlord_payout_accounts c where c.landlord_id = a.landlord_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id) into v_has_current;
  if coalesce(p_attest->>'identity_matches', '') <> 'true' then
    raise exception 'You must confirm the account name matches the landlord''s verified identity' using errcode = '22023';
  end if;
  if v_has_current and coalesce(p_attest->>'confirmed_with_landlord', '') <> 'true' then
    raise exception 'You must confirm the landlord approved this change through a separate trusted channel' using errcode = '22023';
  end if;
  if not a.name_match and (v_note is null or char_length(v_note) < 10) then
    raise exception 'The account name does not match the landlord''s profile name. Explain in the note' using errcode = '22023';
  end if;

  v_eff := case when v_has_current then greatest(now(), a.requested_at + interval '24 hours') else now() end;
  update public.landlord_payout_accounts
     set status = 'approved', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note, effective_at = v_eff where id = a.id;
  insert into public.payout_account_events (account_id, landlord_id, event, actor_id, note)
  values (a.id, a.landlord_id, 'account_approved', v_admin, v_note);
  begin
    perform public.notify_user(a.landlord_id, 'Payout account approved',
      case when v_eff > now() then 'Your new payout account was approved and takes effect after a security waiting period. Your current account stays in use until then.'
           else 'Your payout account was approved.' end,
      '/dashboard/payout-account', 'payment');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'approved', 'effective_at', v_eff);
end;
$f$;

revoke all on function public.eb_request_payout_account(text, text, text) from public, anon;
revoke all on function public.eb_cancel_payout_request(uuid) from public, anon;
revoke all on function public.eb_my_payout_accounts() from public, anon;
revoke all on function public.eb_admin_payout_queue(text) from public, anon;
revoke all on function public.eb_review_payout_account(uuid, text, text, jsonb) from public, anon;
grant execute on function public.eb_request_payout_account(text, text, text) to authenticated;
grant execute on function public.eb_cancel_payout_request(uuid) to authenticated;
grant execute on function public.eb_my_payout_accounts() to authenticated;
grant execute on function public.eb_admin_payout_queue(text) to authenticated;
grant execute on function public.eb_review_payout_account(uuid, text, text, jsonb) to authenticated;

commit;

-- ROLLBACK (only if no real accounts were saved):
--   drop function if exists public.eb_request_payout_account(text, text, text), public.eb_cancel_payout_request(uuid),
--     public.eb_my_payout_accounts(), public.eb_admin_payout_queue(text), public.eb_review_payout_account(uuid, text, text, jsonb),
--     public.eb_name_tokens_match(text, text);
--   drop table if exists public.payout_account_events, public.landlord_payout_accounts;