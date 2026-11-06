-- EboHomes 20261201_04 (Phase 10.2, Step D): property-specific authorized rent payees.
-- REQUIRES: 20261201_01, _02 and _03 already run.
-- WHAT:
--   1. property_authorized_payees: one row per request by an agent/manager/company representative to have rent
--      for ONE listing paid to their own account. It needs a rent-collection authorization document from the owner
--      and an admin approval. Separate from landlord_payout_accounts (which is not touched).
--   2. property_payee_events: append-only history.
--   3. Functions: request (server only, called by the upload route in Step F), cancel, my list (masked),
--      admin queue, admin review (approve / reject), admin revoke.
-- RULES:
--   - The property owner stays the default payee. No row = owner default. Owner-listed properties never use this table.
--   - Only for listings whose authority is ACCEPTED and whose claim is agent / manager / company_representative.
--   - Agents/managers need an APPROVED professional profile to request. Agents can only REQUEST. An admin approves.
--   - Admin must attest identity match and that the owner confirmed the authorization through a separate channel.
--   - A change waits at least 24 hours after request (same rule as payout accounts) while the old payee stays in force.
--   - The authorization document is stored in the private property-evidence bucket under payee/<user>/<listing>/...
--     It is NOT added to listing_authority_documents, so it cannot reopen, change or approve property authority.
--   - NOT CONNECTED TO PAYOUTS. No payout function reads this table. Nothing here moves money.
--   - Expiry of the listing's authority does not touch these rows in this phase (Phase 10.5).
-- One transaction. Back up first.
begin;

-- 1. table ---------------------------------------------------------------------------
create table if not exists public.property_authorized_payees (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  requested_by uuid not null references public.profiles(id),
  payee_kind text not null check (payee_kind in ('agent','company')),
  payee_name text not null check (char_length(payee_name) between 2 and 200),
  bank_name text not null check (char_length(bank_name) between 2 and 80),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null check (char_length(account_name) between 2 and 120),
  name_match boolean not null default false,
  authorization_path text not null unique,
  authorization_name text,
  authorization_mime text not null,
  authorization_size bigint not null,
  authorization_sha256 text not null,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','cancelled','revoked')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  owner_confirmed_at timestamptz,
  effective_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  revoked_reason text,
  check ((status in ('approved','revoked')) = (effective_at is not null))
);
create unique index if not exists ppayee_one_pending on public.property_authorized_payees (listing_id) where status = 'pending_review';
create index if not exists ppayee_listing on public.property_authorized_payees (listing_id, status, effective_at);
create index if not exists ppayee_account on public.property_authorized_payees (account_number);

create table if not exists public.property_payee_events (
  id uuid primary key default gen_random_uuid(),
  payee_id uuid not null references public.property_authorized_payees(id),
  listing_id uuid not null,
  event text not null,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ppayee_events_payee on public.property_payee_events (payee_id, created_at);

create or replace function public.eb_payee_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'Payee events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists ppayee_events_immutable on public.property_payee_events;
create trigger ppayee_events_immutable before update or delete on public.property_payee_events
  for each row execute function public.eb_payee_events_immutable();

alter table public.property_authorized_payees enable row level security;
alter table public.property_payee_events enable row level security;
revoke all on public.property_authorized_payees from anon, authenticated;
revoke all on public.property_payee_events from anon, authenticated;

-- 2. REQUEST (server only: the upload route stores the file first, then calls this) -----------
create or replace function public.eb_request_property_payee(
  p_listing uuid, p_requester uuid, p_kind text, p_payee_name text, p_bank text, p_number text, p_account_name text,
  p_path text, p_doc_name text, p_mime text, p_size bigint, p_sha256 text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  l record; c record; v_id uuid; v_status text; v_match boolean;
  v_bank text := trim(coalesce(p_bank,''));
  v_num text := regexp_replace(coalesce(p_number,''), '[\s-]', '', 'g');
  v_name text := regexp_replace(trim(coalesce(p_account_name,'')), '\s+', ' ', 'g');
  v_payee text := regexp_replace(trim(coalesce(p_payee_name,'')), '\s+', ' ', 'g');
begin
  select id, title, landlord_id, authority_status into l from public.listings where id = p_listing for update;
  if not found or l.landlord_id <> p_requester then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status <> 'accepted' then
    raise exception 'Rent can only be directed to a representative after EboHomes has accepted your authority for this property.' using errcode = '22023';
  end if;
  select claimed_role into c from public.listing_authority_claims where listing_id = p_listing;
  if not found or c.claimed_role not in ('agent','manager','company_representative') then
    raise exception 'This property is listed by its owner, so rent goes to the owner.' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('agent','company') then raise exception 'Choose who should receive the rent.' using errcode = '22023'; end if;
  if (p_kind = 'company') <> (c.claimed_role = 'company_representative') then
    raise exception 'The payee type does not match how you declared your relationship to this property.' using errcode = '22023';
  end if;
  if p_kind = 'agent' then
    v_status := public.eb_professional_status(p_requester);
    if v_status is distinct from 'approved' then
      raise exception 'You need an approved professional profile to request this.' using errcode = '42501';
    end if;
  end if;
  if char_length(v_payee) < 2 or char_length(v_payee) > 200 then raise exception 'Enter the name of the payee.' using errcode = '22023'; end if;
  if v_num !~ '^[0-9]{10}$' then raise exception 'The account number must be exactly 10 digits.' using errcode = '22023'; end if;
  if char_length(v_bank) < 2 or char_length(v_bank) > 80 then raise exception 'Enter the bank name.' using errcode = '22023'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Enter the account name.' using errcode = '22023'; end if;
  if p_path is null or p_path !~ ('^payee/' || p_requester::text || '/' || p_listing::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then
    raise exception 'Invalid authorization file.' using errcode = '22023';
  end if;
  if p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf')
     or p_size is null or p_size <= 0 or p_size > 10485760 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid authorization file.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_listing::text, 1));
  if exists (select 1 from public.property_authorized_payees where listing_id = p_listing and status = 'pending_review') then
    raise exception 'You already have a request waiting for review. Cancel it first to send a new one.' using errcode = '22023';
  end if;
  if exists (select 1 from public.property_authorized_payees where listing_id = p_listing and status = 'approved' and effective_at > now()) then
    raise exception 'A change is already scheduled. Wait until it takes effect, or contact EboHomes.' using errcode = '22023';
  end if;
  if (select count(*) from public.property_authorized_payees where listing_id = p_listing and requested_at > now() - interval '24 hours') >= 3 then
    raise exception 'Too many requests today. Try again tomorrow.' using errcode = '22023';
  end if;
  if exists (select 1 from public.property_authorized_payees where listing_id = p_listing and status = 'approved' and effective_at <= now()
             and account_number = v_num and lower(bank_name) = lower(v_bank)) then
    raise exception 'That is already the approved payee account for this property.' using errcode = '22023';
  end if;

  v_match := public.eb_name_tokens_match(v_payee, v_name);
  insert into public.property_authorized_payees
    (listing_id, requested_by, payee_kind, payee_name, bank_name, account_number, account_name, name_match,
     authorization_path, authorization_name, authorization_mime, authorization_size, authorization_sha256)
  values (p_listing, p_requester, p_kind, v_payee, v_bank, v_num, v_name, v_match,
          p_path, left(p_doc_name, 200), p_mime, p_size, p_sha256)
  returning id into v_id;
  insert into public.property_payee_events (payee_id, listing_id, event, actor_id) values (v_id, p_listing, 'payee_requested', p_requester);

  begin
    perform public.notify_user(p_requester, 'Rent payee request received',
      'Your request was sent to EboHomes for review. Rent for this property continues to go to the owner unless it is approved.',
      '/dashboard/authority/' || p_listing::text, 'payment');
  exception when others then null; end;
  begin
    perform public.notify_admins('Rent payee needs review', concat('A representative asked to receive rent for "', coalesce(l.title,'a listing'), '".'), '/admin/professionals', 'payment');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'id', v_id);
end $f$;

-- 3. LISTER: cancel own pending request ---------------------------------------------------------
create or replace function public.cancel_property_payee_request(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a public.property_authorized_payees;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into a from public.property_authorized_payees where id = p_id and requested_by = auth.uid() for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending_review' then raise exception 'Only a request waiting for review can be cancelled' using errcode = '22023'; end if;
  update public.property_authorized_payees set status = 'cancelled' where id = a.id;
  insert into public.property_payee_events (payee_id, listing_id, event, actor_id) values (a.id, a.listing_id, 'request_cancelled', auth.uid());
  return jsonb_build_object('ok', true);
end $f$;

-- 4. LISTER: own requests for one listing, masked --------------------------------------------------
create or replace function public.my_property_payees(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select id, landlord_id into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true,
    'current_id', (select a.id from public.property_authorized_payees a where a.listing_id = p_listing and a.status = 'approved' and a.effective_at <= now()
                    order by a.effective_at desc limit 1),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'payee_kind', a.payee_kind, 'payee_name', a.payee_name,
        'bank_name', a.bank_name, 'masked', '******' || right(a.account_number, 4), 'account_name', a.account_name,
        'status', a.status, 'requested_at', a.requested_at, 'effective_at', a.effective_at,
        'review_note', case when a.status = 'rejected' then a.review_note end) order by a.requested_at desc)
      from (select * from public.property_authorized_payees where listing_id = p_listing order by requested_at desc limit 20) a), '[]'::jsonb));
end $f$;

-- 5. ADMIN: queue with full details -----------------------------------------------------------------
create or replace function public.admin_property_payee_queue(p_filter text default 'pending')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select a.requested_at as ts, jsonb_build_object(
      'id', a.id, 'listing_id', a.listing_id, 'listing_title', l.title, 'status', a.status,
      'payee_kind', a.payee_kind, 'payee_name', a.payee_name, 'bank_name', a.bank_name,
      'account_number', a.account_number, 'account_name', a.account_name, 'name_match', a.name_match,
      'requested_at', a.requested_at, 'effective_at', a.effective_at, 'review_note', a.review_note,
      'requester_name', p.full_name, 'requester_phone', p.phone, 'requester_email', p.email,
      'professional_status', public.eb_professional_status(a.requested_by),
      'claimed_role', cl.claimed_role, 'owner_name', cl.owner_name, 'owner_phone', cl.owner_phone,
      'authority_status', l.authority_status,
      'authorization_path', a.authorization_path, 'authorization_name', a.authorization_name,
      'authorization_mime', a.authorization_mime,
      'account_used_elsewhere', (
         exists (select 1 from public.landlord_payout_accounts o where o.account_number = a.account_number and o.landlord_id <> a.requested_by and o.status in ('pending_review','approved'))
         or exists (select 1 from public.property_authorized_payees o where o.account_number = a.account_number and o.requested_by <> a.requested_by and o.status in ('pending_review','approved'))),
      'has_current', exists (select 1 from public.property_authorized_payees c where c.listing_id = a.listing_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id),
      'current_masked', (select '******' || right(c.account_number, 4) || ' · ' || c.bank_name from public.property_authorized_payees c
                          where c.listing_id = a.listing_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id
                          order by c.effective_at desc limit 1),
      'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'by', ep.full_name, 'note', e.note) order by e.created_at)
                          from public.property_payee_events e left join public.profiles ep on ep.id = e.actor_id where e.payee_id = a.id), '[]'::jsonb)
    ) as j
    from public.property_authorized_payees a
    join public.listings l on l.id = a.listing_id
    join public.profiles p on p.id = a.requested_by
    left join public.listing_authority_claims cl on cl.listing_id = a.listing_id
    where p_filter = 'all'
       or (p_filter = 'scheduled' and a.status = 'approved' and a.effective_at > now())
       or (p_filter = 'pending' and a.status = 'pending_review')
    order by a.requested_at desc limit 100
  ) x;
  return v;
end $f$;

-- 6. ADMIN: approve or reject ------------------------------------------------------------------------
create or replace function public.admin_review_property_payee(p_id uuid, p_action text, p_note text default null, p_attest jsonb default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid(); a public.property_authorized_payees; l record; v_status text;
  v_note text := nullif(trim(coalesce(p_note,'')), ''); v_has_current boolean; v_eff timestamptz;
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can review rent payees' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('approve','reject') then raise exception 'Unknown action' using errcode = '22023'; end if;
  select * into a from public.property_authorized_payees where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  select id, title, landlord_id, authority_status into l from public.listings where id = a.listing_id for update;
  if a.requested_by = v_admin or l.landlord_id = v_admin then raise exception 'You cannot review your own request' using errcode = '42501'; end if;
  if a.status <> 'pending_review' then raise exception 'This request is already % and cannot be reviewed again', a.status using errcode = '22023'; end if;

  if p_action = 'reject' then
    if v_note is null or char_length(v_note) < 5 then raise exception 'A clear reason for the requester is required' using errcode = '22023'; end if;
    update public.property_authorized_payees set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note where id = a.id;
    insert into public.property_payee_events (payee_id, listing_id, event, actor_id, note) values (a.id, a.listing_id, 'payee_rejected', v_admin, v_note);
    begin
      perform public.notify_user(a.requested_by, 'Rent payee request not approved', 'Open the property authority page to read the reason. Rent continues to go to the owner.', '/dashboard/authority/' || a.listing_id::text, 'payment');
    exception when others then null; end;
    begin perform public.audit_write('property_payee_rejected', 'listing', a.listing_id, null::jsonb, jsonb_build_object('payee_id', a.id), v_note);
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  -- approve
  if l.authority_status <> 'accepted' then
    raise exception 'The authority for this property is not currently accepted, so a payee cannot be approved' using errcode = '22023';
  end if;
  if a.payee_kind = 'agent' then
    v_status := public.eb_professional_status(a.requested_by);
    if v_status is distinct from 'approved' then raise exception 'The requester no longer has an approved professional profile' using errcode = '22023'; end if;
  end if;
  if coalesce(p_attest->>'identity_matches','') <> 'true' then
    raise exception 'Confirm that the account name matches the payee' using errcode = '22023';
  end if;
  if coalesce(p_attest->>'owner_confirmed','') <> 'true' then
    raise exception 'Confirm that the owner approved this through a separate trusted channel and that the signed authorization was checked' using errcode = '22023';
  end if;
  if v_note is null or char_length(v_note) < 10 then raise exception 'Write a note of at least 10 characters about how the owner was confirmed' using errcode = '22023'; end if;

  select exists (select 1 from public.property_authorized_payees c where c.listing_id = a.listing_id and c.status = 'approved' and c.effective_at <= now() and c.id <> a.id) into v_has_current;
  v_eff := case when v_has_current then greatest(now(), a.requested_at + interval '24 hours') else now() end;
  update public.property_authorized_payees
     set status = 'approved', reviewed_by = v_admin, reviewed_at = now(), review_note = v_note,
         owner_confirmed_at = now(), effective_at = v_eff
   where id = a.id;
  insert into public.property_payee_events (payee_id, listing_id, event, actor_id, note) values (a.id, a.listing_id, 'payee_approved', v_admin, v_note);
  begin
    perform public.notify_user(a.requested_by, 'Rent payee approved',
      case when v_eff > now() then 'Your request was approved and takes effect after a security waiting period.' else 'Your request was approved.' end,
      '/dashboard/authority/' || a.listing_id::text, 'payment');
  exception when others then null; end;
  begin perform public.audit_write('property_payee_approved', 'listing', a.listing_id, null::jsonb, jsonb_build_object('payee_id', a.id, 'effective_at', v_eff), v_note);
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'approved', 'effective_at', v_eff);
end $f$;

-- 7. ADMIN: revoke an approved payee -----------------------------------------------------------------------
create or replace function public.admin_revoke_property_payee(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_admin uuid := auth.uid(); a public.property_authorized_payees; v_reason text := nullif(trim(coalesce(p_reason,'')), '');
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'A reason of at least 5 characters is required' using errcode = '22023'; end if;
  select * into a from public.property_authorized_payees where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if a.status <> 'approved' then raise exception 'Only an approved payee can be revoked' using errcode = '22023'; end if;
  update public.property_authorized_payees set status = 'revoked', revoked_at = now(), revoked_by = v_admin, revoked_reason = v_reason where id = a.id;
  insert into public.property_payee_events (payee_id, listing_id, event, actor_id, note) values (a.id, a.listing_id, 'payee_revoked', v_admin, v_reason);
  begin
    perform public.notify_user(a.requested_by, 'Rent payee approval withdrawn', 'EboHomes withdrew the approval to receive rent for this property. Rent goes to the owner.', '/dashboard/authority/' || a.listing_id::text, 'payment');
  exception when others then null; end;
  begin perform public.audit_write('property_payee_revoked', 'listing', a.listing_id, null::jsonb, jsonb_build_object('payee_id', a.id), v_reason);
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'revoked');
end $f$;

-- 8. grants --------------------------------------------------------------------------------------------------
revoke all on function public.eb_request_property_payee(uuid,uuid,text,text,text,text,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.eb_request_property_payee(uuid,uuid,text,text,text,text,text,text,text,text,bigint,text) to service_role;
revoke all on function public.cancel_property_payee_request(uuid), public.my_property_payees(uuid),
  public.admin_property_payee_queue(text), public.admin_review_property_payee(uuid,text,text,jsonb),
  public.admin_revoke_property_payee(uuid,text) from public, anon;
grant execute on function public.cancel_property_payee_request(uuid), public.my_property_payees(uuid),
  public.admin_property_payee_queue(text), public.admin_review_property_payee(uuid,text,text,jsonb),
  public.admin_revoke_property_payee(uuid,text) to authenticated;
revoke all on function public.eb_payee_events_immutable() from public, anon, authenticated;

commit;

-- CHECK (read only). Expect tables 2, functions 6, payouts_untouched 0.
-- select
--  (select count(*) from information_schema.tables where table_schema='public' and table_name in ('property_authorized_payees','property_payee_events')) as tables_should_be_2,
--  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
--    ('eb_request_property_payee','cancel_property_payee_request','my_property_payees','admin_property_payee_queue','admin_review_property_payee','admin_revoke_property_payee')) as functions_should_be_6,
--  (select count(*) from pg_proc where pronamespace='public'::regnamespace and prosrc ilike '%property_authorized_payees%'
--     and proname not in ('eb_request_property_payee','cancel_property_payee_request','my_property_payees','admin_property_payee_queue','admin_review_property_payee','admin_revoke_property_payee')) as other_functions_using_it_should_be_0;

-- ROLLBACK (only if no real requests were saved):
-- drop function if exists public.eb_request_property_payee(uuid,uuid,text,text,text,text,text,text,text,text,bigint,text),
--   public.cancel_property_payee_request(uuid), public.my_property_payees(uuid), public.admin_property_payee_queue(text),
--   public.admin_review_property_payee(uuid,text,text,jsonb), public.admin_revoke_property_payee(uuid,text);
-- drop table if exists public.property_payee_events, public.property_authorized_payees;
-- drop function if exists public.eb_payee_events_immutable();
