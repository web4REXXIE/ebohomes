-- EboHomes 20261205_01: Phase 10.6 Step A - foundation for Tenant-Requested Remote Inspection (System B).
-- DECISION (Option C): two separate systems. System A = EboHomes Property Verification (existing). System B = tenant-requested remote inspection.
-- WHAT: (1) a service_type on inspection jobs and on submitted inspections ('verification' or 'remote'), every existing row stays 'verification';
--       (2) settings, the tenant request table, an append-only request history; (3) a budget ledger and an inspector payout table, both kept
--       separate per service type; (4) guards so a remote inspection can never be assigned from the old admin page, approved as a property
--       verification, or count as the "second inspector" for a verification; (5) a working-hours helper for deadlines.
-- NO FEES: there is no price, no checkout, no tenant payment and no Paystack anywhere in this file. Tenants pay nothing for an inspection.
--       Money only moves at the existing rent step, after the tenant has decided.
-- DOES NOT: change any existing row, the public view, listings, applications, viewings or tenancy payments. Nothing in the app reads the new
--       tables yet. Browsers cannot write any of the new tables. Step B adds the functions that do.
-- REQUIRES: inspection_jobs, property_inspections, listings, is_admin(), eb_inspection_history_immutable() (20261203_01).
-- ORDER: run this SQL first, then deploy the changed admin page (the page filters on the new column).
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. service type on jobs and inspections
alter table public.inspection_jobs add column if not exists service_type text not null default 'verification';
alter table public.inspection_jobs add column if not exists request_id uuid;
alter table public.inspection_jobs drop constraint if exists inspection_jobs_service_type_chk;
alter table public.inspection_jobs add constraint inspection_jobs_service_type_chk check (service_type in ('verification','remote'));

alter table public.property_inspections add column if not exists service_type text not null default 'verification';
alter table public.property_inspections drop constraint if exists property_inspections_service_type_chk;
alter table public.property_inspections add constraint property_inspections_service_type_chk check (service_type in ('verification','remote'));

create index if not exists inspection_jobs_service_idx on public.inspection_jobs (service_type, status);
create index if not exists inspection_jobs_request_idx on public.inspection_jobs (request_id) where request_id is not null;

-- ============================================================ 2. settings (one row, every deadline configurable)
create table if not exists public.remote_inspection_settings (
  id boolean primary key default true check (id),
  landlord_response_hours int not null default 2 check (landlord_response_hours between 1 and 72),
  escalate_after_hours int not null default 2 check (escalate_after_hours between 1 and 72),
  assign_timeout_hours int not null default 4 check (assign_timeout_hours between 1 and 72),
  inspector_accept_minutes int not null default 30 check (inspector_accept_minutes between 5 and 1440),
  work_start time not null default '08:00',
  work_end time not null default '17:00',
  work_days int[] not null default '{1,2,3,4,5}',
  timezone text not null default 'Africa/Lagos',
  max_open_per_tenant int not null default 2 check (max_open_per_tenant between 1 and 10),
  max_requests_per_30_days int not null default 6 check (max_requests_per_30_days between 1 and 50),
  cost_per_inspection numeric(12,2) not null default 0 check (cost_per_inspection >= 0),
  enforce_budget boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint remote_inspection_settings_hours_chk check (work_end > work_start),
  constraint remote_inspection_settings_days_chk check (cardinality(work_days) between 1 and 7 and work_days <@ array[1,2,3,4,5,6,7]),
  constraint remote_inspection_settings_escalate_chk check (escalate_after_hours < assign_timeout_hours)
);
insert into public.remote_inspection_settings (id) values (true) on conflict do nothing;

-- ============================================================ 3. tenant requests (one row per request, never deleted)
create sequence if not exists public.inspection_request_seq;

create table if not exists public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('EBO-RI-' || lpad(nextval('public.inspection_request_seq')::text, 6, '0')),
  listing_id uuid not null,                 -- no foreign key on purpose: a deleted listing must never erase the request history
  tenant_id uuid not null,
  landlord_id uuid,                         -- who owned the listing when the request was made
  status text not null default 'awaiting_landlord' check (status in (
    'awaiting_landlord','awaiting_rescheduling','ready_for_assignment','offered','scheduled','in_review',
    'completed','cancelled','expired','access_refused','closed')),
  preferred_from timestamptz,
  preferred_to timestamptz,
  tenant_note text check (tenant_note is null or char_length(tenant_note) <= 500),
  landlord_response text not null default 'pending' check (landlord_response in ('pending','confirmed','refused','no_response')),
  landlord_due_at timestamptz,
  landlord_responded_at timestamptz,
  landlord_time timestamptz,                -- the time the landlord confirmed
  landlord_note text check (landlord_note is null or char_length(landlord_note) <= 500),
  ready_at timestamptz,                     -- when it became ready for assignment
  assign_due_at timestamptz,
  escalated_at timestamptz,
  offered_inspector uuid,
  offer_due_at timestamptz,
  job_id uuid,                              -- the current assignment (inspection_jobs)
  scheduled_for timestamptz,
  budget_reserved numeric(12,2) not null default 0 check (budget_reserved >= 0),
  closed_reason text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text,
  review_decision text check (review_decision is null or review_decision in ('released','rejected','reinspect')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  report_released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inspection_requests_status_idx on public.inspection_requests (status, created_at);
create index if not exists inspection_requests_tenant_idx on public.inspection_requests (tenant_id, created_at desc);
create index if not exists inspection_requests_listing_idx on public.inspection_requests (listing_id);
create index if not exists inspection_requests_landlord_idx on public.inspection_requests (landlord_id) where landlord_id is not null;
-- one open request per tenant per property
create unique index if not exists inspection_requests_one_open_uidx on public.inspection_requests (tenant_id, listing_id)
  where status not in ('completed','cancelled','expired','access_refused','closed');

create table if not exists public.inspection_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  event text not null,
  actor_id uuid,
  from_status text,
  to_status text,
  note text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists inspection_request_events_req_idx on public.inspection_request_events (request_id, created_at);

drop trigger if exists aa_insp_request_events_guard on public.inspection_request_events;
create trigger aa_insp_request_events_guard before update or delete on public.inspection_request_events
  for each row execute function public.eb_inspection_history_immutable();

-- ============================================================ 4. budgets (one ledger, separate per service type, never edited)
create table if not exists public.inspection_budget_ledger (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('verification','remote')),
  kind text not null check (kind in ('allocation','expense')),
  amount numeric(14,2) not null check (amount > 0),
  request_id uuid,
  job_id uuid,
  payout_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists inspection_budget_ledger_svc_idx on public.inspection_budget_ledger (service_type, created_at);

drop trigger if exists aa_insp_budget_ledger_guard on public.inspection_budget_ledger;
create trigger aa_insp_budget_ledger_guard before update or delete on public.inspection_budget_ledger
  for each row execute function public.eb_inspection_history_immutable();

-- ============================================================ 5. inspector payouts (manual at launch, one per job, never deleted)
create table if not exists public.inspection_payouts (
  id uuid primary key default gen_random_uuid(),
  service_type text not null check (service_type in ('verification','remote')),
  job_id uuid not null,
  inspection_id uuid,
  inspector_id uuid not null,
  amount numeric(12,2) not null check (amount >= 0),
  transport_amount numeric(12,2) not null default 0 check (transport_amount >= 0),
  total_amount numeric(12,2) generated always as (amount + transport_amount) stored,
  method text,
  destination_ref text,
  reference text,
  status text not null default 'payable' check (status in ('payable','paid','void')),
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  paid_by uuid,
  paid_at timestamptz,
  void_reason text,
  voided_by uuid,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
-- the same inspection can never be paid twice
create unique index if not exists inspection_payouts_one_per_job_uidx on public.inspection_payouts (job_id) where status <> 'void';
create unique index if not exists inspection_payouts_reference_uidx on public.inspection_payouts (reference) where reference is not null and status <> 'void';
create index if not exists inspection_payouts_inspector_idx on public.inspection_payouts (inspector_id, created_at);

create or replace function public.eb_inspection_payout_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare keys text[] := array['status','method','destination_ref','reference','paid_by','paid_at','void_reason','voided_by','voided_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Payout records are kept on record and cannot be deleted.' using errcode = '42501';
  end if;
  if (to_jsonb(new) - keys) is distinct from (to_jsonb(old) - keys) then
    raise exception 'The amounts and people on a payout record cannot be edited. Void it and record a new one.' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'payable' and new.status in ('paid','void')) or (old.status = 'paid' and new.status = 'void')) then
      raise exception 'A payout cannot move from % to %.', old.status, new.status using errcode = '42501';
    end if;
    if new.status = 'paid' and (new.paid_at is null or nullif(btrim(coalesce(new.reference, '')), '') is null or new.paid_by is null) then
      raise exception 'A paid payout needs a payment date, a reference and who paid it.' using errcode = '23514';
    end if;
    if new.status = 'void' and (nullif(btrim(coalesce(new.void_reason, '')), '') is null or new.voided_by is null) then
      raise exception 'Voiding a payout needs a reason and who voided it.' using errcode = '23514';
    end if;
  elsif old.status in ('paid','void') then
    raise exception 'A % payout cannot be changed.', old.status using errcode = '42501';
  end if;
  if new.status = 'void' then new.voided_at := coalesce(new.voided_at, now()); end if;
  return new;
end $f$;

drop trigger if exists aa_insp_payout_guard on public.inspection_payouts;
create trigger aa_insp_payout_guard before update or delete on public.inspection_payouts
  for each row execute function public.eb_inspection_payout_guard();

-- ============================================================ 6. separation guards
-- 6a. a remote inspection takes its type from its job
create or replace function public.eb_inspection_service_type_stamp()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.job_id is not null then
    select j.service_type into new.service_type from public.inspection_jobs j where j.id = new.job_id;
  end if;
  new.service_type := coalesce(new.service_type, 'verification');
  return new;
end $f$;
drop trigger if exists a00_insp_service_type_stamp on public.property_inspections;
create trigger a00_insp_service_type_stamp before insert on public.property_inspections
  for each row execute function public.eb_inspection_service_type_stamp();

-- 6b. a remote inspection is never approved or rejected as a property verification
create or replace function public.eb_remote_inspection_review_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.service_type is distinct from old.service_type then
    raise exception 'The inspection type cannot change.' using errcode = '42501';
  end if;
  if new.service_type = 'remote' and new.review_status is distinct from old.review_status then
    raise exception 'A remote inspection is reviewed on the Remote Inspections page, never as a property verification.' using errcode = '42501';
  end if;
  return new;
end $f$;
drop trigger if exists a00_remote_insp_review_guard on public.property_inspections;
create trigger a00_remote_insp_review_guard before update on public.property_inspections
  for each row execute function public.eb_remote_inspection_review_guard();

-- 6c. a remote job can only be created, assigned or cancelled by the remote inspection functions (they set eb.remote_ok for their own transaction).
--     The submission step is allowed through: it moves a job from assigned to submitted.
create or replace function public.eb_remote_job_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare ok boolean := coalesce(current_setting('eb.remote_ok', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.service_type = 'remote' and not ok then
      raise exception 'Remote inspections are created through the remote inspection request flow.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.service_type is distinct from old.service_type then
    raise exception 'The inspection type cannot change.' using errcode = '42501';
  end if;
  if old.request_id is not null and new.request_id is distinct from old.request_id then
    raise exception 'A job cannot be moved to another request.' using errcode = '42501';
  end if;
  if new.service_type = 'remote' and not ok then
    if new.inspector_id is distinct from old.inspector_id
       or (new.status is distinct from old.status and not (old.status = 'assigned' and new.status = 'submitted')) then
      raise exception 'A remote inspection can only be assigned, cancelled or changed on the Remote Inspections page.' using errcode = '42501';
    end if;
  end if;
  return new;
end $f$;
drop trigger if exists a00_remote_job_guard on public.inspection_jobs;
create trigger a00_remote_job_guard before insert or update on public.inspection_jobs
  for each row execute function public.eb_remote_job_guard();

-- 6d. a remote inspector's submission must never count as the "second inspector" of a property verification
--     (same function as before, with the two service_type conditions added)
create or replace function public.eb_inspection_approval_blockers(p_inspection uuid)
returns text[] language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare i public.property_inspections; j public.inspection_jobs; r text[] := '{}';
        v_pending int; v_ph int; v_tot int; v_second boolean;
begin
  if auth.uid() is null or not coalesce(public.is_admin(), false) then raise exception 'Only a reviewer can check this.' using errcode = '42501'; end if;
  select * into i from public.property_inspections where id = p_inspection;
  if not found then raise exception 'Inspection not found.' using errcode = 'P0002'; end if;
  if i.inspected_by = auth.uid() then r := r || 'You cannot approve your own inspection.'; end if;

  if exists (select 1 from public.inspection_supplement_requests where inspection_id = p_inspection and fulfilled_at is null and cancelled_at is null) then
    r := r || 'Additional evidence was requested and has not arrived yet.';
  end if;

  if i.integrity_level = 'hashed' then
    select count(*) filter (where review_status = 'pending'),
           count(*) filter (where review_status = 'accepted' and kind = 'photo'),
           count(*) filter (where review_status = 'accepted')
      into v_pending, v_ph, v_tot
      from public.inspection_evidence_files where inspection_id = p_inspection and discarded_at is null;
    if v_pending > 0 then r := r || (v_pending::text || ' file(s) not reviewed yet.'); end if;
    if v_ph < 3 then r := r || 'At least 3 photographs must be accepted.'; end if;
    if v_tot < 3 then r := r || 'At least 3 evidence files must be accepted.'; end if;
  end if;

  if i.job_id is not null then
    select * into j from public.inspection_jobs where id = i.job_id;
    if found and j.needs_second_inspector then
      select exists (
        select 1 from public.property_inspections o
         where o.listing_id = i.listing_id and o.id <> i.id and o.inspected_by is distinct from i.inspected_by
           and o.service_type = 'verification'
           and o.integrity_level = 'hashed' and o.review_status in ('submitted','approved')
           and o.inspected_at between i.inspected_at - interval '30 days' and i.inspected_at + interval '30 days') into v_second;
      if not v_second and not exists (
           select 1 from public.inspection_evidence_events e where e.inspection_id = p_inspection and e.event = 'second_inspector_waived') then
        r := r || 'A second, different inspector must submit their own evidence, or an administrator must record why not.';
      end if;
      if exists (select 1 from public.property_inspections o
                  where o.listing_id = i.listing_id and o.id <> i.id and o.inspected_by = auth.uid()
                    and o.service_type = 'verification'
                    and o.inspected_at between i.inspected_at - interval '30 days' and i.inspected_at + interval '30 days') then
        r := r || 'You took part in inspecting this property and cannot approve it.';
      end if;
    end if;
  end if;
  return r;
end $f$;

-- ============================================================ 7. working-hours helper (deadlines skip nights, weekends and non-working days)
create or replace function public.eb_add_working_minutes(p_from timestamptz, p_minutes int)
returns timestamptz language plpgsql stable set search_path to 'public','pg_temp'
as $f$
declare s public.remote_inspection_settings; t timestamp; remaining int := greatest(coalesce(p_minutes, 0), 0);
        day_end timestamp; avail int; guard int := 0;
begin
  select * into s from public.remote_inspection_settings where id;
  t := p_from at time zone s.timezone;
  loop
    guard := guard + 1;
    exit when guard > 400;
    if not (extract(isodow from t)::int = any (s.work_days)) or t::time >= s.work_end then
      t := date_trunc('day', t) + interval '1 day' + s.work_start;
      continue;
    end if;
    if t::time < s.work_start then
      t := date_trunc('day', t) + s.work_start;
    end if;
    day_end := date_trunc('day', t) + s.work_end;
    avail := floor(extract(epoch from (day_end - t)) / 60)::int;
    if remaining <= avail then
      t := t + make_interval(mins => remaining);
      exit;
    end if;
    remaining := remaining - avail;
    t := date_trunc('day', t) + interval '1 day' + s.work_start;
  end loop;
  return t at time zone s.timezone;
end $f$;
revoke all on function public.eb_add_working_minutes(timestamptz, int) from public, anon;
grant execute on function public.eb_add_working_minutes(timestamptz, int) to authenticated, service_role;

-- ============================================================ 8. access: admins read; a tenant reads only their own requests; nobody writes directly
alter table public.remote_inspection_settings enable row level security;
alter table public.inspection_requests enable row level security;
alter table public.inspection_request_events enable row level security;
alter table public.inspection_budget_ledger enable row level security;
alter table public.inspection_payouts enable row level security;

revoke all on public.remote_inspection_settings, public.inspection_requests, public.inspection_request_events,
              public.inspection_budget_ledger, public.inspection_payouts from anon, authenticated, public;
revoke all on sequence public.inspection_request_seq from anon, authenticated, public;
grant select on public.remote_inspection_settings, public.inspection_requests, public.inspection_request_events,
                public.inspection_budget_ledger, public.inspection_payouts to authenticated;

drop policy if exists "Admins read remote inspection settings" on public.remote_inspection_settings;
create policy "Admins read remote inspection settings" on public.remote_inspection_settings for select to authenticated using (public.is_admin());
drop policy if exists "Admins read inspection requests" on public.inspection_requests;
create policy "Admins read inspection requests" on public.inspection_requests for select to authenticated using (public.is_admin());
drop policy if exists "Tenants read own inspection requests" on public.inspection_requests;
create policy "Tenants read own inspection requests" on public.inspection_requests for select to authenticated using (tenant_id = auth.uid());
drop policy if exists "Admins read inspection request events" on public.inspection_request_events;
create policy "Admins read inspection request events" on public.inspection_request_events for select to authenticated using (public.is_admin());
drop policy if exists "Admins read inspection budget ledger" on public.inspection_budget_ledger;
create policy "Admins read inspection budget ledger" on public.inspection_budget_ledger for select to authenticated using (public.is_admin());
drop policy if exists "Admins read inspection payouts" on public.inspection_payouts;
create policy "Admins read inspection payouts" on public.inspection_payouts for select to authenticated using (public.is_admin());

commit;

-- ROLLBACK (only while no remote request exists):
-- drop trigger if exists a00_remote_job_guard on public.inspection_jobs;
-- drop trigger if exists a00_remote_insp_review_guard on public.property_inspections;
-- drop trigger if exists a00_insp_service_type_stamp on public.property_inspections;
-- drop function if exists public.eb_remote_job_guard(), public.eb_remote_inspection_review_guard(), public.eb_inspection_service_type_stamp(),
--   public.eb_inspection_payout_guard(), public.eb_add_working_minutes(timestamptz, int);
-- drop table if exists public.inspection_payouts, public.inspection_budget_ledger, public.inspection_request_events,
--   public.inspection_requests, public.remote_inspection_settings;
-- drop sequence if exists public.inspection_request_seq;
-- alter table public.inspection_jobs drop column if exists request_id, drop column if exists service_type;
-- alter table public.property_inspections drop column if exists service_type;
-- (eb_inspection_approval_blockers keeps working either way; to restore the old text, re-run it from 20261203_03.)
