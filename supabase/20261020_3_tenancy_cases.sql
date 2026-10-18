-- EboHomes batch 5 / file 3: disputes, handover, maintenance, settlements, renewal apply.
-- New tables only, plus two functions that update tenancies when an admin
-- applies an accepted renewal. No money moves. Run after file 2.
begin;

-- ============================ DISPUTES ============================
create table if not exists public.tenancy_disputes (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id),
  raised_by uuid not null,
  category text not null check (category in ('payment', 'deposit', 'condition', 'maintenance', 'agreement', 'conduct', 'other')),
  summary text not null check (char_length(trim(summary)) >= 10),
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'closed')),
  resolution text,
  assigned_to uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenancy_disputes_tenancy_idx on public.tenancy_disputes (tenancy_id, created_at desc);

create table if not exists public.tenancy_dispute_events (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.tenancy_disputes(id),
  actor_id uuid,
  kind text not null check (kind in ('created', 'comment', 'status')),
  body text,
  created_at timestamptz not null default now()
);
create index if not exists tenancy_dispute_events_idx on public.tenancy_dispute_events (dispute_id, created_at);

alter table public.tenancy_disputes enable row level security;
alter table public.tenancy_dispute_events enable row level security;
revoke all on public.tenancy_disputes, public.tenancy_dispute_events from anon, authenticated;
grant select on public.tenancy_disputes, public.tenancy_dispute_events to authenticated;
drop policy if exists tenancy_disputes_select on public.tenancy_disputes;
create policy tenancy_disputes_select on public.tenancy_disputes for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);
drop policy if exists tenancy_dispute_events_select on public.tenancy_dispute_events;
create policy tenancy_dispute_events_select on public.tenancy_dispute_events for select to authenticated
  using (exists (select 1 from public.tenancy_disputes d where d.id = dispute_id and public.eb_tenancy_role(d.tenancy_id) is not null));

create or replace function public.eb_open_dispute(p_tenancy uuid, p_by uuid, p_category text, p_summary text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v_id uuid; t record;
begin
  insert into public.tenancy_disputes (tenancy_id, raised_by, category, summary)
  values (p_tenancy, p_by, p_category, trim(p_summary)) returning id into v_id;
  insert into public.tenancy_dispute_events (dispute_id, actor_id, kind, body) values (v_id, p_by, 'created', trim(p_summary));
  select tenant_id, landlord_id into t from public.tenancies where id = p_tenancy;
  if p_by is distinct from t.tenant_id then
    perform public.notify_user(t.tenant_id, 'Dispute opened', 'A dispute was opened on your tenancy.', '/tenancies/' || p_tenancy, 'tenancy');
  end if;
  if p_by is distinct from t.landlord_id then
    perform public.notify_user(t.landlord_id, 'Dispute opened', 'A dispute was opened on your tenancy.', '/dashboard/tenancies/' || p_tenancy, 'tenancy');
  end if;
  perform public.notify_admins('Dispute opened', 'A tenancy dispute needs review.', '/admin/cases', 'tenancy');
  return v_id;
end;
$$;
revoke all on function public.eb_open_dispute(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public.raise_dispute(p_tenancy uuid, p_category text, p_summary text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare r text := public.eb_tenancy_role(p_tenancy);
begin
  if coalesce(r, '') not in ('tenant', 'landlord') then raise exception 'Only the tenant or landlord can open a dispute' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_summary, ''))) < 10 then raise exception 'Describe the problem in at least 10 characters'; end if;
  if (select count(*) from public.tenancy_disputes where tenancy_id = p_tenancy and status in ('open', 'under_review')) >= 5 then
    raise exception 'This tenancy already has 5 open disputes';
  end if;
  return public.eb_open_dispute(p_tenancy, auth.uid(), p_category, p_summary);
end;
$$;

create or replace function public.add_dispute_comment(p_dispute uuid, p_body text)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare d record; r text; t record;
begin
  select * into d from public.tenancy_disputes where id = p_dispute for update;
  if not found then raise exception 'Dispute not found'; end if;
  r := public.eb_tenancy_role(d.tenancy_id);
  if r is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  if d.status not in ('open', 'under_review') then raise exception 'This dispute is %', d.status; end if;
  if char_length(trim(coalesce(p_body, ''))) < 2 then raise exception 'Write a comment'; end if;
  insert into public.tenancy_dispute_events (dispute_id, actor_id, kind, body) values (p_dispute, auth.uid(), 'comment', trim(p_body));
  update public.tenancy_disputes set updated_at = now() where id = p_dispute;
  select tenant_id, landlord_id into t from public.tenancies where id = d.tenancy_id;
  if auth.uid() <> t.tenant_id then perform public.notify_user(t.tenant_id, 'Dispute update', 'There is a new comment on your dispute.', '/tenancies/' || d.tenancy_id, 'tenancy'); end if;
  if auth.uid() <> t.landlord_id then perform public.notify_user(t.landlord_id, 'Dispute update', 'There is a new comment on your dispute.', '/dashboard/tenancies/' || d.tenancy_id, 'tenancy'); end if;
  if r <> 'admin' then perform public.notify_admins('Dispute update', 'A party commented on a dispute.', '/admin/cases', 'tenancy'); end if;
end;
$$;

create or replace function public.withdraw_dispute(p_dispute uuid, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare d record;
begin
  select * into d from public.tenancy_disputes where id = p_dispute for update;
  if not found or d.raised_by <> auth.uid() then raise exception 'Only the person who opened the dispute can withdraw it' using errcode = '42501'; end if;
  if d.status <> 'open' then raise exception 'Only an open dispute can be withdrawn. Ask EboHomes to close it.'; end if;
  update public.tenancy_disputes set status = 'closed', resolution = coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Withdrawn by the person who opened it.'),
         resolved_by = auth.uid(), resolved_at = now(), updated_at = now() where id = p_dispute;
  insert into public.tenancy_dispute_events (dispute_id, actor_id, kind, body) values (p_dispute, auth.uid(), 'status', 'Withdrawn by the person who opened it.');
  perform public.notify_admins('Dispute withdrawn', 'A dispute was withdrawn.', '/admin/cases', 'tenancy');
end;
$$;

create or replace function public.admin_update_dispute(p_dispute uuid, p_status text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare d record; t record; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can update disputes' using errcode = '42501'; end if;
  if p_status not in ('under_review', 'resolved', 'closed') then raise exception 'Unknown status'; end if;
  select * into d from public.tenancy_disputes where id = p_dispute for update;
  if not found then raise exception 'Dispute not found'; end if;
  if d.status in ('resolved', 'closed') then raise exception 'This dispute is already %', d.status; end if;
  if p_status in ('resolved', 'closed') and v_note is null then raise exception 'Write the outcome for both sides'; end if;
  update public.tenancy_disputes
     set status = p_status, assigned_to = coalesce(assigned_to, auth.uid()),
         resolution = case when p_status in ('resolved', 'closed') then v_note else resolution end,
         resolved_by = case when p_status in ('resolved', 'closed') then auth.uid() end,
         resolved_at = case when p_status in ('resolved', 'closed') then now() end,
         updated_at = now()
   where id = p_dispute;
  insert into public.tenancy_dispute_events (dispute_id, actor_id, kind, body)
  values (p_dispute, auth.uid(), 'status', concat('Status: ', replace(p_status, '_', ' '), coalesce(' - ' || v_note, '')));
  select tenant_id, landlord_id into t from public.tenancies where id = d.tenancy_id;
  perform public.notify_user(t.tenant_id, 'Dispute update', concat('Your dispute is now ', replace(p_status, '_', ' '), '.'), '/tenancies/' || d.tenancy_id, 'tenancy');
  perform public.notify_user(t.landlord_id, 'Dispute update', concat('Your dispute is now ', replace(p_status, '_', ' '), '.'), '/dashboard/tenancies/' || d.tenancy_id, 'tenancy');
end;
$$;

-- ============================ HANDOVER ============================
create table if not exists public.handover_records (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id),
  kind text not null check (kind in ('move_in', 'move_out')),
  status text not null default 'submitted' check (status in ('submitted', 'acknowledged', 'disputed')),
  submitted_by uuid not null,
  condition_notes text not null check (char_length(trim(condition_notes)) >= 5),
  keys_count int check (keys_count between 0 and 100),
  meter_readings text,
  submitted_at timestamptz not null default now(),
  responded_by uuid,
  responded_at timestamptz,
  response_note text,
  unique (tenancy_id, kind)
);
alter table public.handover_records enable row level security;
revoke all on public.handover_records from anon, authenticated;
grant select on public.handover_records to authenticated;
drop policy if exists handover_select on public.handover_records;
create policy handover_select on public.handover_records for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);

create or replace function public.submit_handover(p_tenancy uuid, p_kind text, p_notes text, p_keys int, p_meters text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare r text := public.eb_tenancy_role(p_tenancy); cur record; v_id uuid; t record;
begin
  if r is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  if p_kind not in ('move_in', 'move_out') then raise exception 'Unknown handover type'; end if;
  select * into cur from public.handover_records where tenancy_id = p_tenancy and kind = p_kind for update;
  if found and cur.status = 'acknowledged' then raise exception 'This handover was already acknowledged'; end if;
  if found and cur.status = 'submitted' and cur.submitted_by <> auth.uid() then
    raise exception 'The other party has already submitted. Acknowledge or dispute it instead.';
  end if;
  if found then
    update public.handover_records
       set condition_notes = trim(p_notes), keys_count = p_keys, meter_readings = nullif(trim(coalesce(p_meters, '')), ''),
           status = 'submitted', submitted_by = auth.uid(), submitted_at = now(),
           responded_by = null, responded_at = null, response_note = null
     where id = cur.id returning id into v_id;
  else
    insert into public.handover_records (tenancy_id, kind, submitted_by, condition_notes, keys_count, meter_readings)
    values (p_tenancy, p_kind, auth.uid(), trim(coalesce(p_notes, '')), p_keys, nullif(trim(coalesce(p_meters, '')), ''))
    returning id into v_id;
  end if;
  select tenant_id, landlord_id into t from public.tenancies where id = p_tenancy;
  if auth.uid() <> t.tenant_id then perform public.notify_user(t.tenant_id, 'Handover record to review', 'A handover record was submitted. Please check it and acknowledge or dispute it.', '/tenancies/' || p_tenancy, 'tenancy'); end if;
  if auth.uid() <> t.landlord_id then perform public.notify_user(t.landlord_id, 'Handover record to review', 'A handover record was submitted. Please check it and acknowledge or dispute it.', '/dashboard/tenancies/' || p_tenancy, 'tenancy'); end if;
  return v_id;
end;
$$;

create or replace function public.respond_handover(p_handover uuid, p_accept boolean, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare h record; r text; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into h from public.handover_records where id = p_handover for update;
  if not found then raise exception 'Handover record not found'; end if;
  r := public.eb_tenancy_role(h.tenancy_id);
  if coalesce(r, '') not in ('tenant', 'landlord') then raise exception 'Only the tenant or landlord can respond' using errcode = '42501'; end if;
  if h.submitted_by = auth.uid() then raise exception 'The other party must respond to your record'; end if;
  if h.status <> 'submitted' then raise exception 'This record is already %', h.status; end if;
  if not p_accept and (v_note is null or char_length(v_note) < 5) then raise exception 'Explain what is wrong'; end if;
  update public.handover_records
     set status = case when p_accept then 'acknowledged' else 'disputed' end,
         responded_by = auth.uid(), responded_at = now(), response_note = v_note
   where id = p_handover;
  if not p_accept then
    perform public.eb_open_dispute(h.tenancy_id, auth.uid(), 'condition',
      concat('Handover (', replace(h.kind, '_', ' '), ') disputed: ', v_note));
  else
    perform public.notify_user(h.submitted_by, 'Handover acknowledged', 'The other party acknowledged your handover record.',
      case when r = 'tenant' then '/dashboard/tenancies/' else '/tenancies/' end || h.tenancy_id, 'tenancy');
  end if;
end;
$$;

-- ============================ MAINTENANCE ============================
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id),
  raised_by uuid not null,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) >= 5),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed', 'cancelled')),
  landlord_note text,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maintenance_tenancy_idx on public.maintenance_requests (tenancy_id, created_at desc);
alter table public.maintenance_requests enable row level security;
revoke all on public.maintenance_requests from anon, authenticated;
grant select on public.maintenance_requests to authenticated;
drop policy if exists maintenance_select on public.maintenance_requests;
create policy maintenance_select on public.maintenance_requests for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);

create or replace function public.create_maintenance_request(p_tenancy uuid, p_title text, p_description text, p_priority text default 'normal')
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v_id uuid; t record;
begin
  if public.eb_tenancy_role(p_tenancy) is distinct from 'tenant' then raise exception 'Only the tenant can raise a maintenance request' using errcode = '42501'; end if;
  if (select count(*) from public.maintenance_requests where tenancy_id = p_tenancy and status in ('open', 'acknowledged', 'in_progress')) >= 10 then
    raise exception 'You already have 10 open requests on this tenancy';
  end if;
  insert into public.maintenance_requests (tenancy_id, raised_by, title, description, priority)
  values (p_tenancy, auth.uid(), trim(p_title), trim(p_description), coalesce(p_priority, 'normal')) returning id into v_id;
  select landlord_id into t from public.tenancies where id = p_tenancy;
  perform public.notify_user(t.landlord_id, 'Maintenance request', concat('A tenant reported: ', left(trim(p_title), 80), '.'), '/dashboard/tenancies/' || p_tenancy, 'tenancy');
  if p_priority = 'urgent' then perform public.notify_admins('Urgent maintenance request', 'A tenant raised an urgent maintenance request.', '/admin/cases', 'tenancy'); end if;
  return v_id;
end;
$$;

create or replace function public.maintenance_action(p_request uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare m record; r text; v_note text := nullif(trim(coalesce(p_note, '')), ''); t record;
begin
  select * into m from public.maintenance_requests where id = p_request for update;
  if not found then raise exception 'Request not found'; end if;
  r := public.eb_tenancy_role(m.tenancy_id);
  if r is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  select tenant_id, landlord_id into t from public.tenancies where id = m.tenancy_id;

  if p_action in ('acknowledge', 'start', 'resolve') then
    if coalesce(r, '') not in ('landlord', 'admin') then raise exception 'Only the landlord or EboHomes can do that' using errcode = '42501'; end if;
    if p_action = 'acknowledge' and m.status <> 'open' then raise exception 'Only an open request can be acknowledged'; end if;
    if p_action = 'start' and m.status not in ('open', 'acknowledged') then raise exception 'This request cannot be started from %', m.status; end if;
    if p_action = 'resolve' and m.status not in ('open', 'acknowledged', 'in_progress') then raise exception 'This request cannot be resolved from %', m.status; end if;
    if p_action = 'resolve' and v_note is null then raise exception 'Describe what was done'; end if;
    update public.maintenance_requests
       set status = case p_action when 'acknowledge' then 'acknowledged' when 'start' then 'in_progress' else 'resolved' end,
           landlord_note = coalesce(case when p_action <> 'resolve' then v_note end, landlord_note),
           resolution_note = case when p_action = 'resolve' then v_note else resolution_note end,
           resolved_at = case when p_action = 'resolve' then now() else resolved_at end,
           updated_at = now()
     where id = p_request;
    perform public.notify_user(t.tenant_id, 'Maintenance update',
      concat('Your request "', left(m.title, 60), '" is now ', case p_action when 'acknowledge' then 'acknowledged' when 'start' then 'in progress' else 'marked resolved. Please confirm' end, '.'),
      '/tenancies/' || m.tenancy_id, 'tenancy');
  elsif p_action in ('close', 'reopen', 'cancel') then
    if r is distinct from 'tenant' then raise exception 'Only the tenant can do that' using errcode = '42501'; end if;
    if p_action = 'close' and m.status <> 'resolved' then raise exception 'Only a resolved request can be closed'; end if;
    if p_action = 'reopen' and (m.status <> 'resolved' or v_note is null) then raise exception 'Reopen needs a resolved request and a reason'; end if;
    if p_action = 'cancel' and m.status not in ('open', 'acknowledged') then raise exception 'Only an open request can be cancelled'; end if;
    update public.maintenance_requests
       set status = case p_action when 'close' then 'closed' when 'reopen' then 'open' else 'cancelled' end,
           resolved_at = case when p_action = 'reopen' then null else resolved_at end,
           landlord_note = case when p_action = 'reopen' then concat_ws(' | ', landlord_note, 'Tenant reopened: ' || v_note) else landlord_note end,
           updated_at = now()
     where id = p_request;
    perform public.notify_user(t.landlord_id, 'Maintenance update',
      concat('Request "', left(m.title, 60), '": tenant ', case p_action when 'close' then 'confirmed it is fixed' when 'reopen' then 'says it is not fixed' else 'cancelled it' end, '.'),
      '/dashboard/tenancies/' || m.tenancy_id, 'tenancy');
  else
    raise exception 'Unknown action: %', p_action;
  end if;
end;
$$;

-- ============================ SETTLEMENTS ============================
-- Records the end-of-tenancy deposit figures and what each side agreed.
-- EboHomes does not hold, move or refund this money.
create table if not exists public.tenancy_settlements (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null unique references public.tenancies(id),
  proposed_by uuid not null,
  deposit_held numeric not null check (deposit_held >= 0),
  deductions numeric not null default 0 check (deductions >= 0),
  deduction_reason text,
  refund_due numeric generated always as (deposit_held - deductions) stored,
  status text not null default 'proposed'
    check (status in ('proposed', 'agreed', 'disputed', 'approved', 'refund_recorded', 'closed')),
  tenant_note text,
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  refund_reference text,
  refund_paid_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deductions <= deposit_held),
  check (deductions = 0 or char_length(trim(coalesce(deduction_reason, ''))) >= 5)
);
alter table public.tenancy_settlements enable row level security;
revoke all on public.tenancy_settlements from anon, authenticated;
grant select on public.tenancy_settlements to authenticated;
drop policy if exists settlements_select on public.tenancy_settlements;
create policy settlements_select on public.tenancy_settlements for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);

create or replace function public.propose_settlement(p_tenancy uuid, p_deposit numeric, p_deductions numeric, p_reason text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare r text := public.eb_tenancy_role(p_tenancy); cur record; v_id uuid; t record;
begin
  if coalesce(r, '') not in ('landlord', 'admin') then raise exception 'Only the landlord or EboHomes can propose a settlement' using errcode = '42501'; end if;
  select * into cur from public.tenancy_settlements where tenancy_id = p_tenancy for update;
  if found and cur.status in ('agreed', 'approved', 'refund_recorded', 'closed') then
    raise exception 'This settlement is already %', cur.status;
  end if;
  if found then
    update public.tenancy_settlements
       set proposed_by = auth.uid(), deposit_held = p_deposit, deductions = coalesce(p_deductions, 0),
           deduction_reason = nullif(trim(coalesce(p_reason, '')), ''), status = 'proposed',
           tenant_note = null, review_note = null, reviewed_by = null, reviewed_at = null, updated_at = now()
     where id = cur.id returning id into v_id;
  else
    insert into public.tenancy_settlements (tenancy_id, proposed_by, deposit_held, deductions, deduction_reason)
    values (p_tenancy, auth.uid(), p_deposit, coalesce(p_deductions, 0), nullif(trim(coalesce(p_reason, '')), ''))
    returning id into v_id;
  end if;
  select tenant_id, landlord_id into t from public.tenancies where id = p_tenancy;
  perform public.notify_user(t.tenant_id, 'Deposit settlement to review', 'A deposit settlement was proposed. Please check it and agree or dispute it.', '/tenancies/' || p_tenancy, 'tenancy');
  if r = 'admin' then perform public.notify_user(t.landlord_id, 'Deposit settlement proposed', 'EboHomes proposed a deposit settlement.', '/dashboard/tenancies/' || p_tenancy, 'tenancy'); end if;
  return v_id;
end;
$$;

create or replace function public.respond_settlement(p_settlement uuid, p_agree boolean, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare s record; t record; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into s from public.tenancy_settlements where id = p_settlement for update;
  if not found then raise exception 'Settlement not found'; end if;
  if public.eb_tenancy_role(s.tenancy_id) is distinct from 'tenant' then raise exception 'Only the tenant can respond' using errcode = '42501'; end if;
  if s.status <> 'proposed' then raise exception 'This settlement is already %', s.status; end if;
  if not p_agree and (v_note is null or char_length(v_note) < 5) then raise exception 'Explain why you disagree'; end if;
  update public.tenancy_settlements set status = case when p_agree then 'agreed' else 'disputed' end, tenant_note = v_note, updated_at = now() where id = p_settlement;
  select landlord_id into t from public.tenancies where id = s.tenancy_id;
  if p_agree then
    perform public.notify_user(t.landlord_id, 'Settlement agreed', 'The tenant agreed to the deposit settlement. EboHomes will review it.', '/dashboard/tenancies/' || s.tenancy_id, 'tenancy');
    perform public.notify_admins('Settlement to review', 'A deposit settlement was agreed and needs review.', '/admin/cases', 'tenancy');
  else
    perform public.notify_user(t.landlord_id, 'Settlement disputed', 'The tenant disputed the deposit settlement.', '/dashboard/tenancies/' || s.tenancy_id, 'tenancy');
    perform public.eb_open_dispute(s.tenancy_id, auth.uid(), 'deposit', concat('Deposit settlement disputed: ', v_note));
  end if;
end;
$$;

create or replace function public.admin_review_settlement(p_settlement uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare s record; t record; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can review settlements' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reopen') then raise exception 'Unknown action'; end if;
  select * into s from public.tenancy_settlements where id = p_settlement for update;
  if not found then raise exception 'Settlement not found'; end if;
  select tenant_id, landlord_id into t from public.tenancies where id = s.tenancy_id;
  if p_action = 'approve' then
    if s.status <> 'agreed' then raise exception 'Only an agreed settlement can be approved (current: %)', s.status; end if;
    update public.tenancy_settlements
       set status = case when refund_due = 0 then 'closed' else 'approved' end,
           review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     where id = p_settlement;
    perform public.notify_user(t.landlord_id, 'Settlement approved', 'EboHomes approved the settlement record. Pay any refund yourself, then record it.', '/dashboard/tenancies/' || s.tenancy_id, 'tenancy');
    perform public.notify_user(t.tenant_id, 'Settlement approved', 'EboHomes approved the settlement record. The landlord pays any refund directly. EboHomes does not hold this money.', '/tenancies/' || s.tenancy_id, 'tenancy');
  else
    if s.status not in ('agreed', 'disputed') then raise exception 'Only an agreed or disputed settlement can be reopened (current: %)', s.status; end if;
    if v_note is null then raise exception 'Tell both sides what to change'; end if;
    update public.tenancy_settlements
       set status = 'proposed', review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
     where id = p_settlement;
    perform public.notify_user(t.landlord_id, 'Settlement sent back', 'EboHomes asked for changes to the settlement. Please propose it again.', '/dashboard/tenancies/' || s.tenancy_id, 'tenancy');
    perform public.notify_user(t.tenant_id, 'Settlement under review', 'EboHomes is reviewing the settlement.', '/tenancies/' || s.tenancy_id, 'tenancy');
  end if;
end;
$$;

create or replace function public.record_settlement_refund(p_settlement uuid, p_reference text, p_paid_on date)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare s record; t record;
begin
  select * into s from public.tenancy_settlements where id = p_settlement for update;
  if not found then raise exception 'Settlement not found'; end if;
  if public.eb_tenancy_role(s.tenancy_id) is distinct from 'landlord' then raise exception 'Only the landlord can record the refund' using errcode = '42501'; end if;
  if s.status <> 'approved' then raise exception 'EboHomes must approve the settlement first (current: %)', s.status; end if;
  if char_length(trim(coalesce(p_reference, ''))) < 3 then raise exception 'Enter how and when you paid (reference)'; end if;
  if p_paid_on is null or p_paid_on > current_date then raise exception 'Enter the date you paid'; end if;
  update public.tenancy_settlements set status = 'refund_recorded', refund_reference = trim(p_reference), refund_paid_on = p_paid_on, updated_at = now() where id = p_settlement;
  select tenant_id into t from public.tenancies where id = s.tenancy_id;
  perform public.notify_user(t.tenant_id, 'Refund recorded', 'Your landlord says the refund was paid. Please confirm if you received it.', '/tenancies/' || s.tenancy_id, 'tenancy');
end;
$$;

create or replace function public.confirm_settlement_received(p_settlement uuid, p_received boolean, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare s record; t record; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into s from public.tenancy_settlements where id = p_settlement for update;
  if not found then raise exception 'Settlement not found'; end if;
  if public.eb_tenancy_role(s.tenancy_id) is distinct from 'tenant' then raise exception 'Only the tenant can confirm' using errcode = '42501'; end if;
  if s.status <> 'refund_recorded' then raise exception 'There is no recorded refund to confirm'; end if;
  select landlord_id into t from public.tenancies where id = s.tenancy_id;
  if p_received then
    update public.tenancy_settlements set status = 'closed', updated_at = now() where id = p_settlement;
    perform public.notify_user(t.landlord_id, 'Refund confirmed', 'The tenant confirmed they received the refund.', '/dashboard/tenancies/' || s.tenancy_id, 'tenancy');
  else
    if v_note is null or char_length(v_note) < 5 then raise exception 'Explain what is wrong'; end if;
    perform public.eb_open_dispute(s.tenancy_id, auth.uid(), 'deposit', concat('Tenant says the refund was not received: ', v_note));
  end if;
end;
$$;

-- ============================ RENEWAL APPLY ============================
create table if not exists public.renewal_applied (
  renewal_id uuid primary key references public.renewals(id),
  tenancy_id uuid not null,
  applied_by uuid not null,
  applied_at timestamptz not null default now(),
  previous_rent numeric,
  previous_end_date date,
  new_rent numeric,
  new_end_date date
);
alter table public.renewal_applied enable row level security;
revoke all on public.renewal_applied from anon, authenticated;
grant select on public.renewal_applied to authenticated;
drop policy if exists renewal_applied_select on public.renewal_applied;
create policy renewal_applied_select on public.renewal_applied for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);

create or replace function public.admin_apply_renewal(p_renewal uuid)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare rn record; t record;
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can apply a renewal' using errcode = '42501'; end if;
  select * into rn from public.renewals where id = p_renewal for update;
  if not found then raise exception 'Renewal not found'; end if;
  if rn.status <> 'accepted' then raise exception 'Only an accepted renewal can be applied (current: %)', rn.status; end if;
  if exists (select 1 from public.renewal_applied where renewal_id = p_renewal) then raise exception 'This renewal was already applied'; end if;
  select * into t from public.tenancies where id = rn.tenancy_id for update;
  if not found or t.status <> 'active' then raise exception 'The tenancy must be active to apply a renewal'; end if;
  insert into public.renewal_applied (renewal_id, tenancy_id, applied_by, previous_rent, previous_end_date, new_rent, new_end_date)
  values (p_renewal, rn.tenancy_id, auth.uid(), t.rent_amount, t.end_date, rn.new_rent, rn.new_end_date);
  update public.tenancies set rent_amount = rn.new_rent, end_date = rn.new_end_date where id = rn.tenancy_id;
  perform public.notify_user(t.tenant_id, 'Renewal applied', 'Your renewal is now on your tenancy record.', '/tenancies/' || rn.tenancy_id, 'renewal');
  perform public.notify_user(t.landlord_id, 'Renewal applied', 'The renewal is now on the tenancy record.', '/dashboard/tenancies/' || rn.tenancy_id, 'renewal');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'raise_dispute(uuid,text,text)', 'add_dispute_comment(uuid,text)', 'withdraw_dispute(uuid,text)',
    'admin_update_dispute(uuid,text,text)', 'submit_handover(uuid,text,text,integer,text)',
    'respond_handover(uuid,boolean,text)', 'create_maintenance_request(uuid,text,text,text)',
    'maintenance_action(uuid,text,text)', 'propose_settlement(uuid,numeric,numeric,text)',
    'respond_settlement(uuid,boolean,text)', 'admin_review_settlement(uuid,text,text)',
    'record_settlement_refund(uuid,text,date)', 'confirm_settlement_received(uuid,boolean,text)',
    'admin_apply_renewal(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;