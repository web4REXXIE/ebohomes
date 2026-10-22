-- EboHomes 20261105_01 (Phase 4B): independent key-handover confirmation that gates landlord payouts.
-- REQUIRES 20261104_01. Does NOT change tenancies, payments or any existing payout function.
-- It adds a trigger on landlord_payouts that blocks creating, approving or paying a payout unless the handover is complete.
-- Redefines two read-only functions from 4A (eb_my_payouts, eb_admin_payout_candidates) to include the hold reason.
-- ASSUMPTION: one handover per tenancy; a handover can be confirmed once EboHomes has bank-verified a payment for it.
begin;

create table if not exists public.tenancy_handovers (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.tenancies(id),
  tenant_id uuid not null references public.profiles(id),
  landlord_id uuid not null references public.profiles(id),
  status text not null default 'open' check (status in ('open','disputed','completed')),
  tenant_confirmed_at timestamptz,
  tenant_note text,
  landlord_confirmed_at timestamptz,
  landlord_note text,
  disputed_by uuid references public.profiles(id),
  disputed_role text check (disputed_role in ('tenant','landlord')),
  disputed_at timestamptz,
  dispute_note text,
  completed_at timestamptz,
  completed_via text check (completed_via in ('both_parties','admin_review')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'completed') = (completed_via is not null))
);

create table if not exists public.handover_events (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.tenancy_handovers(id),
  tenancy_id uuid not null,
  event text not null,
  actor_id uuid,
  actor_role text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists hev_tenancy on public.handover_events (tenancy_id, created_at);

create or replace function public.eb_handover_events_locked() returns trigger language plpgsql as $$
begin raise exception 'Handover events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists hev_immutable on public.handover_events;
create trigger hev_immutable before update or delete on public.handover_events
  for each row execute function public.eb_handover_events_locked();

alter table public.tenancy_handovers enable row level security;
alter table public.handover_events enable row level security;
revoke all on public.tenancy_handovers from anon, authenticated;
revoke all on public.handover_events from anon, authenticated;

-- internal: why a payout for this tenancy is on hold (null = handover complete)
create or replace function public.eb_handover_hold_reason(p_tenancy uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare h public.tenancy_handovers;
begin
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  if not found then return 'Waiting for the tenant and the landlord to confirm the key handover'; end if;
  if h.status = 'disputed' then return 'The handover is disputed and under EboHomes review'; end if;
  if h.status = 'completed' then return null; end if;
  if h.tenant_confirmed_at is not null and h.landlord_confirmed_at is null then return 'Waiting for the landlord to confirm the key handover'; end if;
  if h.landlord_confirmed_at is not null and h.tenant_confirmed_at is null then return 'Waiting for the tenant to confirm the key handover'; end if;
  return 'Waiting for the tenant and the landlord to confirm the key handover';
end;
$f$;
revoke all on function public.eb_handover_hold_reason(uuid) from public, anon, authenticated;

-- THE GATE: no payout may be created, approved or paid while the handover is incomplete or disputed
create or replace function public.eb_payout_handover_gate() returns trigger
language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r text;
begin
  if new.status in ('pending','approved','paid') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    r := public.eb_handover_hold_reason(new.tenancy_id);
    if r is not null then
      raise exception '%', 'Payout on hold: ' || r using errcode = '22023';
    end if;
  end if;
  return new;
end;
$f$;
drop trigger if exists zz_payout_handover_gate on public.landlord_payouts;
create trigger zz_payout_handover_gate before insert or update of status on public.landlord_payouts
  for each row execute function public.eb_payout_handover_gate();

-- TENANT or LANDLORD: confirm or dispute. Each person can only ever write their own side.
create or replace function public.eb_confirm_handover(p_tenancy uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid();
  t record; h public.tenancy_handovers; v_role text; v_other uuid;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('confirm','dispute') then raise exception 'Unknown action' using errcode = '22023'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'Keep the note under 500 characters' using errcode = '22023'; end if;
  if p_action = 'dispute' and (v_note is null or char_length(v_note) < 10) then
    raise exception 'Tell EboHomes what is wrong (at least 10 characters)' using errcode = '22023';
  end if;

  select tenant_id, landlord_id, tenancy_code into t from public.tenancies where id = p_tenancy;
  if not found or t.tenant_id is null or t.landlord_id is null or t.tenant_id = t.landlord_id then
    raise exception 'Tenancy not found' using errcode = 'P0002';
  end if;
  v_role := case when v = t.tenant_id then 'tenant' when v = t.landlord_id then 'landlord' else null end;
  if v_role is null then raise exception 'Only the tenant or the landlord of this tenancy can confirm the handover' using errcode = '42501'; end if;
  v_other := case when v_role = 'tenant' then t.landlord_id else t.tenant_id end;
  if not exists (select 1 from public.payment_submissions where tenancy_id = p_tenancy and status = 'verified') then
    raise exception 'The handover can be confirmed after EboHomes has verified the first payment' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenancy::text, 11));
  insert into public.tenancy_handovers (tenancy_id, tenant_id, landlord_id) values (p_tenancy, t.tenant_id, t.landlord_id)
    on conflict (tenancy_id) do nothing;
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy for update;
  if h.status = 'disputed' then raise exception 'The handover is under EboHomes review. Wait for the outcome' using errcode = '22023'; end if;

  if p_action = 'confirm' then
    if h.status = 'completed' or (v_role = 'tenant' and h.tenant_confirmed_at is not null) or (v_role = 'landlord' and h.landlord_confirmed_at is not null) then
      raise exception 'You have already confirmed the handover' using errcode = '22023';
    end if;
    if v_role = 'tenant' then
      update public.tenancy_handovers set tenant_confirmed_at = now(), tenant_note = v_note where id = h.id;
    else
      update public.tenancy_handovers set landlord_confirmed_at = now(), landlord_note = v_note where id = h.id;
    end if;
    insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note)
    values (h.id, p_tenancy, v_role || '_confirmed', v, v_role, v_note);
    select * into h from public.tenancy_handovers where id = h.id;
    if h.tenant_confirmed_at is not null and h.landlord_confirmed_at is not null then
      update public.tenancy_handovers set status = 'completed', completed_at = now(), completed_via = 'both_parties' where id = h.id;
      insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note)
      values (h.id, p_tenancy, 'handover_completed', v, v_role, 'Both parties confirmed');
      begin perform public.notify_user(t.tenant_id, 'Key handover confirmed', 'Both you and the landlord confirmed the handover.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_user(t.landlord_id, 'Key handover confirmed', 'Both you and the tenant confirmed the handover. EboHomes can now process your payout.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_admins('Handover completed', 'Both parties confirmed a handover. A payout can now be prepared.', '/admin/handovers', 'payment'); exception when others then null; end;
      return jsonb_build_object('ok', true, 'status', 'completed');
    end if;
    begin perform public.notify_user(v_other, 'Please confirm the key handover',
      case when v_role = 'tenant' then 'The tenant confirmed the handover. Please confirm once you have handed over the property.'
           else 'The landlord confirmed the handover. Please confirm once you have received the keys and the property.' end,
      '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
    return jsonb_build_object('ok', true, 'status', 'open');
  end if;

  -- dispute
  if h.status = 'completed' and exists (select 1 from public.landlord_payouts where tenancy_id = p_tenancy and status in ('paid','confirmed')) then
    raise exception 'A payout has already been sent for this tenancy. Contact EboHomes support' using errcode = '22023';
  end if;
  update public.tenancy_handovers
     set status = 'disputed', disputed_by = v, disputed_role = v_role, disputed_at = now(), dispute_note = v_note,
         completed_at = null, completed_via = null
   where id = h.id;
  insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note)
  values (h.id, p_tenancy, v_role || '_disputed', v, v_role, v_note);
  begin perform public.notify_user(v_other, 'Key handover disputed', 'The other party raised a concern about the handover. EboHomes is reviewing it and the payout is on hold.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
  begin perform public.notify_admins('Key handover DISPUTED', 'A handover dispute needs review. The payout is on hold.', '/admin/handovers', 'payment'); exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'disputed');
end;
$f$;

-- ADMIN: resolve a dispute (reviewer must not be the tenant or the landlord)
create or replace function public.eb_resolve_handover(p_tenancy uuid, p_outcome text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid(); h public.tenancy_handovers;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can resolve disputes' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('reset','admin_completed') then raise exception 'Unknown outcome' using errcode = '22023'; end if;
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy for update;
  if not found then raise exception 'Handover not found' using errcode = 'P0002'; end if;
  if v_admin = h.tenant_id or v_admin = h.landlord_id then raise exception 'You cannot resolve a dispute on your own tenancy' using errcode = '42501'; end if;
  if h.status <> 'disputed' then raise exception 'There is no open dispute to resolve' using errcode = '22023'; end if;
  if p_outcome = 'reset' and (v_note is null or char_length(v_note) < 10) then raise exception 'Write a clear explanation (at least 10 characters)' using errcode = '22023'; end if;
  if p_outcome = 'admin_completed' and (v_note is null or char_length(v_note) < 20) then raise exception 'Completing a handover after review needs a detailed note (at least 20 characters)' using errcode = '22023'; end if;

  if p_outcome = 'reset' then
    update public.tenancy_handovers
       set status = 'open', tenant_confirmed_at = null, tenant_note = null, landlord_confirmed_at = null, landlord_note = null,
           disputed_by = null, disputed_role = null, disputed_at = null, dispute_note = null,
           resolved_by = v_admin, resolved_at = now(), resolution_note = v_note
     where id = h.id;
    insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note) values (h.id, p_tenancy, 'dispute_reset', v_admin, 'admin', v_note);
  else
    update public.tenancy_handovers
       set status = 'completed', completed_at = now(), completed_via = 'admin_review',
           resolved_by = v_admin, resolved_at = now(), resolution_note = v_note
     where id = h.id;
    insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note) values (h.id, p_tenancy, 'completed_after_review', v_admin, 'admin', v_note);
  end if;
  begin perform public.notify_user(h.tenant_id, 'Handover dispute reviewed', 'EboHomes reviewed the handover dispute. Open the handover page to see the outcome.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
  begin perform public.notify_user(h.landlord_id, 'Handover dispute reviewed', 'EboHomes reviewed the handover dispute. Open the handover page to see the outcome.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', case when p_outcome = 'reset' then 'open' else 'completed' end);
end;
$f$;

-- TENANT or LANDLORD: handover state for one tenancy (never returns payout amounts or accounts)
create or replace function public.eb_my_handover(p_tenancy uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid(); t record; l record; h public.tenancy_handovers; v_role text; v_hold text; v_pay text; v_elig boolean;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select tenant_id, landlord_id, tenancy_code, listing_id into t from public.tenancies where id = p_tenancy;
  if not found then return jsonb_build_object('found', false); end if;
  v_role := case when v = t.tenant_id then 'tenant' when v = t.landlord_id then 'landlord' else null end;
  if v_role is null then return jsonb_build_object('found', false); end if;
  select title, location_text into l from public.listings where id = t.listing_id;
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  v_hold := public.eb_handover_hold_reason(p_tenancy);
  v_elig := exists (select 1 from public.payment_submissions where tenancy_id = p_tenancy and status = 'verified');
  v_pay := case
    when v_hold is not null then 'on_hold'
    when exists (select 1 from public.landlord_payouts where tenancy_id = p_tenancy and status in ('paid','confirmed')) then 'released'
    when exists (select 1 from public.landlord_payouts where tenancy_id = p_tenancy and status <> 'cancelled') then 'in_progress'
    else 'ready' end;
  return jsonb_build_object('found', true, 'role', v_role, 'tenancy_code', t.tenancy_code,
    'listing_title', l.title, 'location', l.location_text,
    'eligible', v_elig, 'status', coalesce(h.status, 'open'),
    'my_confirmed_at', case when v_role = 'tenant' then h.tenant_confirmed_at else h.landlord_confirmed_at end,
    'other_confirmed_at', case when v_role = 'tenant' then h.landlord_confirmed_at else h.tenant_confirmed_at end,
    'disputed_by_me', coalesce(h.disputed_by = v, false),
    'dispute_note', case when h.disputed_by = v then h.dispute_note end,
    'completed_at', h.completed_at, 'completed_via', h.completed_via,
    'resolution_note', h.resolution_note, 'resolved_at', h.resolved_at,
    'hold_reason', v_hold, 'payout_state', v_pay);
end;
$f$;

-- TENANT or LANDLORD: tenancies where a handover confirmation is relevant
create or replace function public.eb_my_handover_tasks()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'tenancy_id', t.id, 'tenancy_code', t.tenancy_code, 'listing_title', l.title,
      'role', case when t.tenant_id = auth.uid() then 'tenant' else 'landlord' end,
      'status', coalesce(h.status, 'open'),
      'my_confirmed_at', case when t.tenant_id = auth.uid() then h.tenant_confirmed_at else h.landlord_confirmed_at end,
      'other_confirmed_at', case when t.tenant_id = auth.uid() then h.landlord_confirmed_at else h.tenant_confirmed_at end,
      'hold_reason', public.eb_handover_hold_reason(t.id)) order by t.created_at desc)
    from public.tenancies t
    left join public.listings l on l.id = t.listing_id
    left join public.tenancy_handovers h on h.tenancy_id = t.id
    where (t.tenant_id = auth.uid() or t.landlord_id = auth.uid())
      and exists (select 1 from public.payment_submissions s where s.tenancy_id = t.id and s.status = 'verified')
  ), '[]'::jsonb));
end;
$f$;

-- ADMIN: handovers with full detail
create or replace function public.eb_admin_handovers(p_filter text default 'attention')
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select t.created_at as ts, jsonb_build_object(
      'tenancy_id', t.id, 'tenancy_code', t.tenancy_code, 'listing_title', l.title,
      'tenant_name', tp.full_name, 'landlord_name', lp.full_name,
      'state', case when h.id is null then 'waiting' when h.status = 'disputed' then 'disputed' when h.status = 'completed' then 'completed' else 'waiting' end,
      'tenant_confirmed_at', h.tenant_confirmed_at, 'tenant_note', h.tenant_note,
      'landlord_confirmed_at', h.landlord_confirmed_at, 'landlord_note', h.landlord_note,
      'disputed_role', h.disputed_role, 'disputed_at', h.disputed_at, 'dispute_note', h.dispute_note,
      'completed_at', h.completed_at, 'completed_via', h.completed_via, 'resolution_note', h.resolution_note,
      'hold_reason', public.eb_handover_hold_reason(t.id),
      'open_payouts', (select count(*) from public.landlord_payouts q where q.tenancy_id = t.id and q.status in ('pending','approved')),
      'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at, 'role', e.actor_role, 'by', ep.full_name, 'note', e.note) order by e.created_at)
                          from public.handover_events e left join public.profiles ep on ep.id = e.actor_id where e.handover_id = h.id), '[]'::jsonb)
    ) as j
    from public.tenancies t
    join public.profiles tp on tp.id = t.tenant_id
    join public.profiles lp on lp.id = t.landlord_id
    left join public.listings l on l.id = t.listing_id
    left join public.tenancy_handovers h on h.tenancy_id = t.id
    where exists (select 1 from public.payment_submissions s where s.tenancy_id = t.id and s.status = 'verified')
      and (p_filter = 'all'
        or (p_filter = 'attention' and h.status = 'disputed')
        or (p_filter = 'waiting' and (h.id is null or h.status = 'open'))
        or (p_filter = 'completed' and h.status = 'completed'))
    order by t.created_at desc limit 100
  ) x;
  return v;
end;
$f$;

-- REDEFINED from 4A (read-only): the landlord's payouts now include the hold reason
create or replace function public.eb_my_payouts()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'status', p.status, 'amount', p.amount, 'payout_code', p.payout_code,
      'bank_name', a.bank_name, 'masked', '******' || right(a.account_number, 4), 'account_name', a.account_name,
      'tenancy_id', p.tenancy_id, 'tenancy_code', t.tenancy_code, 'listing_title', l.title, 'payment_type', pay.type,
      'hold_reason', case when p.status in ('pending','approved') then public.eb_handover_hold_reason(p.tenancy_id) end,
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

-- REDEFINED from 4A (read-only): candidates now include the handover hold reason
create or replace function public.eb_admin_payout_candidates()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v jsonb;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x.j order by x.ts desc), '[]'::jsonb) into v from (
    select pay.confirmed_at as ts, jsonb_build_object(
      'payment_id', pay.id, 'amount', pay.amount, 'type', pay.type, 'confirmed_at', pay.confirmed_at,
      'tenancy_id', t.id, 'tenancy_code', t.tenancy_code, 'landlord_name', lp.full_name, 'tenant_name', tp.full_name,
      'has_account', public.eb_payout_current_account(t.landlord_id) is not null,
      'hold_reason', public.eb_handover_hold_reason(t.id)) as j
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

revoke all on function public.eb_payout_handover_gate() from public, anon, authenticated;
revoke all on function public.eb_confirm_handover(uuid, text, text) from public, anon;
revoke all on function public.eb_resolve_handover(uuid, text, text) from public, anon;
revoke all on function public.eb_my_handover(uuid) from public, anon;
revoke all on function public.eb_my_handover_tasks() from public, anon;
revoke all on function public.eb_admin_handovers(text) from public, anon;
revoke all on function public.eb_my_payouts() from public, anon;
revoke all on function public.eb_admin_payout_candidates() from public, anon;
grant execute on function public.eb_confirm_handover(uuid, text, text) to authenticated;
grant execute on function public.eb_resolve_handover(uuid, text, text) to authenticated;
grant execute on function public.eb_my_handover(uuid) to authenticated;
grant execute on function public.eb_my_handover_tasks() to authenticated;
grant execute on function public.eb_admin_handovers(text) to authenticated;
grant execute on function public.eb_my_payouts() to authenticated;
grant execute on function public.eb_admin_payout_candidates() to authenticated;

commit;

-- ROLLBACK (only if no handovers were recorded):
--   drop trigger if exists zz_payout_handover_gate on public.landlord_payouts;
--   drop function if exists public.eb_payout_handover_gate(), public.eb_confirm_handover(uuid, text, text),
--     public.eb_resolve_handover(uuid, text, text), public.eb_my_handover(uuid), public.eb_my_handover_tasks(),
--     public.eb_admin_handovers(text), public.eb_handover_hold_reason(uuid);
--   drop table if exists public.handover_events, public.tenancy_handovers;
--   (then re-run the eb_my_payouts and eb_admin_payout_candidates definitions from 20261104_01)