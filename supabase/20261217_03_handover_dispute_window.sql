-- EboHomes 20261217_03: 48-hour dispute window before a landlord payout can be released.
-- RULE: the tenant confirms "I have the key". From that moment the tenant has 48 hours to raise a problem.
--       If nothing is raised, the payout becomes eligible even if the landlord never tapped confirm.
--       A dispute at any time still holds the payout. An admin still prepares, approves and pays by hand.
-- HOW: the payout gate (eb_handover_hold_reason) now reads the clock itself. It does not depend on the handover
--      status or on a scheduled job, so the money rule cannot be skipped.
-- CHANGES: 1 constraint (adds 'window_passed'), 3 new functions, 5 functions redefined from 20261105_01.
-- DOES NOT: touch tenancies, payments, payouts rows, or any other table data. Safe to re-run.
-- REQUIRES: 20261105_01 and 20261109_01 already applied.
-- ROLLBACK: bottom of file.

begin;

-- PREFLIGHT: stop with a clear message if the 4B handover functions are not there.
do $$
declare f text;
begin
  foreach f in array array['eb_handover_hold_reason','eb_confirm_handover','eb_my_handover','eb_admin_handovers','eb_admin_payout_candidates','notify_user','notify_admins'] loop
    if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f) then
      raise exception 'Preflight failed: function % is missing. Apply 20261105_01_handover.sql first.', f;
    end if;
  end loop;
  if to_regclass('public.tenancy_handovers') is null or to_regclass('public.handover_events') is null then
    raise exception 'Preflight failed: handover tables are missing. Apply 20261105_01_handover.sql first.';
  end if;
end $$;

-- 1. A handover can now also complete because the window passed with no problem.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.tenancy_handovers'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%both_parties%'
  loop
    execute format('alter table public.tenancy_handovers drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.tenancy_handovers
  add constraint tenancy_handovers_completed_via_chk
  check (completed_via in ('both_parties','admin_review','window_passed'));

-- 2. The window length lives in ONE place.
create or replace function public.eb_handover_window() returns interval
language sql immutable as $f$ select interval '48 hours' $f$;
revoke all on function public.eb_handover_window() from public, anon, authenticated;

-- 3. When may a payout for this tenancy be released? null = not yet / not at all.
--    admin_review: the moment the admin completed it.
--    otherwise:    tenant_confirmed_at + 48 hours (a landlord confirmation never starts or stops this clock).
create or replace function public.eb_handover_payout_eligible_at(p_tenancy uuid)
returns timestamptz language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare h public.tenancy_handovers;
begin
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  if not found or h.status = 'disputed' then return null; end if;
  if h.status = 'completed' and h.completed_via = 'admin_review' then return h.completed_at; end if;
  if h.tenant_confirmed_at is null then return null; end if;
  return h.tenant_confirmed_at + public.eb_handover_window();
end;
$f$;
revoke all on function public.eb_handover_payout_eligible_at(uuid) from public, anon, authenticated;

-- 4. THE GATE (redefined). null = the payout may go ahead.
create or replace function public.eb_handover_hold_reason(p_tenancy uuid)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare h public.tenancy_handovers; v_at timestamptz;
begin
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  if not found then return 'Waiting for the tenant to confirm they have the keys'; end if;
  if h.status = 'disputed' then return 'The handover is disputed and under EboHomes review'; end if;
  v_at := public.eb_handover_payout_eligible_at(p_tenancy);
  if v_at is null then return 'Waiting for the tenant to confirm they have the keys'; end if;
  if now() < v_at then
    return 'The tenant has until ' || to_char(v_at at time zone 'Africa/Lagos', 'DD Mon YYYY, HH24:MI') || ' (Lagos time) to raise a problem';
  end if;
  return null;
end;
$f$;
revoke all on function public.eb_handover_hold_reason(uuid) from public, anon, authenticated;

-- 5. TENANT or LANDLORD: confirm or dispute (redefined: messages, and the window is started by the tenant's confirmation).
create or replace function public.eb_confirm_handover(p_tenancy uuid, p_action text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid();
  t record; h public.tenancy_handovers; v_role text; v_other uuid; v_at_txt text;
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

    -- When the tenant has confirmed, the payout clock is running (48 hours from that confirmation).
    if h.tenant_confirmed_at is not null then
      v_at_txt := to_char((h.tenant_confirmed_at + public.eb_handover_window()) at time zone 'Africa/Lagos', 'DD Mon YYYY, HH24:MI');
    end if;

    -- Both confirmed: the handover record is complete. The payout is still held by the window, not by this status.
    if h.tenant_confirmed_at is not null and h.landlord_confirmed_at is not null then
      update public.tenancy_handovers set status = 'completed', completed_at = now(), completed_via = 'both_parties' where id = h.id;
      insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note)
      values (h.id, p_tenancy, 'handover_completed', v, v_role, 'Both parties confirmed');
      begin perform public.notify_user(t.tenant_id, 'Key handover confirmed', 'Both you and the landlord confirmed the handover. You can still raise a problem until ' || v_at_txt || ' (Lagos time).', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_user(t.landlord_id, 'Key handover confirmed', 'Both you and the tenant confirmed the handover. Your payout can be prepared after ' || v_at_txt || ' (Lagos time) if no problem is raised.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_admins('Handover completed', 'Both parties confirmed a handover. Payout eligible from ' || v_at_txt || ' (Lagos time).', '/admin/handovers', 'payment'); exception when others then null; end;
      return jsonb_build_object('ok', true, 'status', 'completed');
    end if;

    if v_role = 'tenant' then
      -- Tenant confirmed first: the 48-hour window starts now. The landlord is asked to confirm too, but is not required to.
      begin perform public.notify_user(t.tenant_id, 'You confirmed the key handover', 'You have until ' || v_at_txt || ' (Lagos time) to raise a problem. After that EboHomes can pay the landlord.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_user(t.landlord_id, 'The tenant confirmed the key handover', 'The tenant says they have the keys. Your payout can be prepared after ' || v_at_txt || ' (Lagos time) if no problem is raised. You can confirm your side too.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
    else
      -- Landlord confirmed first: the payout still waits for the tenant.
      begin perform public.notify_user(v_other, 'Please confirm the key handover', 'The landlord says the keys were handed over. Please confirm once you have received the keys and the property. The landlord payout waits for your confirmation.', '/tenancies/' || p_tenancy::text || '/handover', 'payment'); exception when others then null; end;
    end if;
    return jsonb_build_object('ok', true, 'status', 'open');
  end if;

  -- dispute (unchanged rule: allowed until a payout has actually been sent)
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
revoke all on function public.eb_confirm_handover(uuid, text, text) from public, anon;
grant execute on function public.eb_confirm_handover(uuid, text, text) to authenticated;

-- 6. The daily sweep: closes handovers whose window passed with no problem, so the record shows "completed"
--    (this also lets eb_complete_rental mark the listing rented when the landlord never tapped confirm).
--    The MONEY does not wait for this job: the gate in step 4 reads the clock directly.
create or replace function public.eb_sweep_handover_windows()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare r record; v_n int := 0;
begin
  for r in
    select id, tenancy_id, tenant_id, landlord_id from public.tenancy_handovers
     where status = 'open' and tenant_confirmed_at is not null
       and tenant_confirmed_at + public.eb_handover_window() <= now()
     for update skip locked
  loop
    update public.tenancy_handovers
       set status = 'completed', completed_at = now(), completed_via = 'window_passed'
     where id = r.id and status = 'open';
    if found then
      insert into public.handover_events (handover_id, tenancy_id, event, actor_id, actor_role, note)
      values (r.id, r.tenancy_id, 'window_passed', null, 'system', 'No problem was raised within the 48-hour window');
      begin perform public.notify_user(r.tenant_id, 'Key handover complete', 'The 48-hour window ended with no problem raised.', '/tenancies/' || r.tenancy_id::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_user(r.landlord_id, 'Key handover complete', 'The 48-hour window ended with no problem raised. EboHomes can now process your payout.', '/tenancies/' || r.tenancy_id::text || '/handover', 'payment'); exception when others then null; end;
      begin perform public.notify_admins('Payout eligible', 'A handover window passed with no problem. A payout can now be prepared.', '/admin/handovers', 'payment'); exception when others then null; end;
      v_n := v_n + 1;
    end if;
  end loop;
  return jsonb_build_object('completed', v_n);
end;
$f$;
revoke all on function public.eb_sweep_handover_windows() from public, anon, authenticated;
grant execute on function public.eb_sweep_handover_windows() to service_role;

-- 7. TENANT or LANDLORD: handover state for one tenancy (redefined: adds the window fields)
create or replace function public.eb_my_handover(p_tenancy uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid(); t record; l record; h public.tenancy_handovers; v_role text; v_hold text; v_pay text; v_elig boolean;
  v_at timestamptz; v_win text;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select tenant_id, landlord_id, tenancy_code, listing_id into t from public.tenancies where id = p_tenancy;
  if not found then return jsonb_build_object('found', false); end if;
  v_role := case when v = t.tenant_id then 'tenant' when v = t.landlord_id then 'landlord' else null end;
  if v_role is null then return jsonb_build_object('found', false); end if;
  select title, location_text into l from public.listings where id = t.listing_id;
  select * into h from public.tenancy_handovers where tenancy_id = p_tenancy;
  v_hold := public.eb_handover_hold_reason(p_tenancy);
  v_at := public.eb_handover_payout_eligible_at(p_tenancy);
  v_win := case when v_at is null then 'none' when now() < v_at then 'running' else 'passed' end;
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
    'hold_reason', v_hold, 'payout_state', v_pay,
    'payout_eligible_at', v_at, 'window_state', v_win);
end;
$f$;
revoke all on function public.eb_my_handover(uuid) from public, anon;
grant execute on function public.eb_my_handover(uuid) to authenticated;

-- 8. ADMIN: handovers with full detail (redefined: adds payout_eligible_at and window_state)
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
      'payout_eligible_at', public.eb_handover_payout_eligible_at(t.id),
      'window_state', case when public.eb_handover_payout_eligible_at(t.id) is null then 'none'
                           when now() < public.eb_handover_payout_eligible_at(t.id) then 'running' else 'passed' end,
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
revoke all on function public.eb_admin_handovers(text) from public, anon;
grant execute on function public.eb_admin_handovers(text) to authenticated;

-- 9. ADMIN: payout candidates (redefined: adds payout_eligible_at so the screen can say "Ready to pay from ...")
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
      'hold_reason', public.eb_handover_hold_reason(t.id),
      'payout_eligible_at', public.eb_handover_payout_eligible_at(t.id)) as j
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
revoke all on function public.eb_admin_payout_candidates() from public, anon;
grant execute on function public.eb_admin_payout_candidates() to authenticated;

commit;

-- CHECK 1 (read only): expect 'completed_via' check to list three values, and the 3 new functions to exist.
select pg_get_constraintdef(oid) from pg_constraint where conname = 'tenancy_handovers_completed_via_chk';
select proname from pg_proc where proname in ('eb_handover_window','eb_handover_payout_eligible_at','eb_sweep_handover_windows') order by 1;

-- CHECK 2 (read only): every verified-payment tenancy with its payout clock. Nothing is changed.
select t.tenancy_code, h.status, h.tenant_confirmed_at, h.landlord_confirmed_at,
       public.eb_handover_payout_eligible_at(t.id) as payout_eligible_at,
       public.eb_handover_hold_reason(t.id) as hold_reason
  from public.tenancies t left join public.tenancy_handovers h on h.tenancy_id = t.id
 where exists (select 1 from public.payment_submissions s where s.tenancy_id = t.id and s.status = 'verified')
 order by t.created_at desc limit 20;

-- ROLLBACK (restores the old "both must confirm" rule):
--   1. Re-run these five definitions from supabase/20261105_01_handover.sql: eb_handover_hold_reason, eb_confirm_handover,
--      eb_my_handover, eb_admin_handovers, eb_admin_payout_candidates (and re-run the revoke/grant lines under each).
--   2. drop function if exists public.eb_sweep_handover_windows(), public.eb_handover_payout_eligible_at(uuid), public.eb_handover_window();
--   3. Only if no handover has completed_via = 'window_passed':
--        alter table public.tenancy_handovers drop constraint if exists tenancy_handovers_completed_via_chk;
--        alter table public.tenancy_handovers add constraint tenancy_handovers_completed_via_check check (completed_via in ('both_parties','admin_review'));
