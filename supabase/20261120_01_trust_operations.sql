-- EboHomes 20261120_01: Phase 9.5 - Trust Operations (investigation cases, one overview, reporting, role gate).
-- WHAT: new tables (cases, case-alert links, case history, trust settings), admin-only case functions,
--       one read-only overview function that counts REAL records, and an optional role gate for case work.
-- DOES NOT: approve, reject, hide, delete or unpublish any listing, change authority_status, touch identity status,
--       resolve or edit a risk alert, suspend any account, change applications or tenancies, or reveal any file.
--       Opening or closing an investigation case is a record-keeping step. It is never an approval decision.
-- BACKWARD COMPATIBLE: the role gate is OFF by default, so every administrator keeps working exactly as today.
--       Phase 9.1 to 9.4 functions and tables are not changed.
-- REQUIRES: 20261114_01 (authority tables), 20261027_03 (holds), 20261119_01 (risk alerts), and 20261120_00 checked.
-- ROLLBACK: at the bottom.
begin;

-- ============================================================ 1. settings (role gate, off by default)
create table if not exists public.trust_settings (
  id boolean primary key default true check (id),
  enforce_permissions boolean not null default false,
  updated_by uuid, updated_at timestamptz not null default now()
);
insert into public.trust_settings (id) values (true) on conflict do nothing;

-- ============================================================ 2. investigation cases
create sequence if not exists public.trust_case_seq;

create table if not exists public.trust_cases (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default ('INV-' || lpad(nextval('public.trust_case_seq')::text, 6, '0')),
  title text not null check (char_length(title) between 5 and 200),
  status text not null default 'open' check (status in ('open','investigating','info_requested','escalated','closed')),
  priority text not null default 'normal' check (priority in ('normal','high')),
  outcome text check (outcome in ('no_issue','inconclusive','action_taken_elsewhere','confirmed_violation')),
  subject_user_id uuid,                                   -- the account the case is about (never an automatic penalty)
  listing_id uuid references public.listings(id) on delete set null,
  listing_title text,                                     -- snapshot, so the case stays readable
  assigned_to uuid,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz, closed_by uuid, decision_note text,
  check ((status = 'closed') = (outcome is not null))
);
-- One active case per listing, so two administrators do not run the same investigation twice.
create unique index if not exists trust_cases_one_active_per_listing on public.trust_cases (listing_id) where status <> 'closed' and listing_id is not null;
create index if not exists trust_cases_queue_idx on public.trust_cases (status, opened_at);
create index if not exists trust_cases_user_idx on public.trust_cases (subject_user_id);

-- A link only RECORDS that an alert belongs to a case. It never changes the alert. Risk alerts are resolved in Risk Alerts.
create table if not exists public.trust_case_alerts (
  case_id uuid not null references public.trust_cases(id) on delete restrict,
  alert_id uuid not null references public.risk_alerts(id) on delete restrict,
  linked_by uuid, linked_at timestamptz not null default now(),
  primary key (case_id, alert_id)
);
create index if not exists trust_case_alerts_alert_idx on public.trust_case_alerts (alert_id);

-- History. "note" is INTERNAL. Only "info_requested" is a message the lister sees (landlord_visible = true).
create table if not exists public.trust_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.trust_cases(id) on delete restrict,
  actor_id uuid,
  event text not null check (event in ('opened','assigned','note','info_requested','escalated','alert_linked','closed','reopened')),
  note text,
  landlord_visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists trust_case_events_case_idx on public.trust_case_events (case_id, created_at);

-- ============================================================ 3. row security: admins read, nobody writes directly
do $$
declare t text;
begin
  foreach t in array array['trust_settings','trust_cases','trust_case_alerts','trust_case_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eb_is_admin())', t || '_admin_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ============================================================ 4. integrity: history cannot be edited or deleted
create or replace function public.trust_append_only_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  raise exception 'This record is part of the case history and cannot be edited or deleted.' using errcode = '42501';
end $f$;

drop trigger if exists aa_trust_case_events_guard on public.trust_case_events;
create trigger aa_trust_case_events_guard before update or delete on public.trust_case_events for each row execute function public.trust_append_only_guard();
drop trigger if exists aa_trust_case_alerts_guard on public.trust_case_alerts;
create trigger aa_trust_case_alerts_guard before update or delete on public.trust_case_alerts for each row execute function public.trust_append_only_guard();

create or replace function public.trust_cases_no_delete_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  raise exception 'Cases cannot be deleted. Close them instead.' using errcode = '42501';
end $f$;
drop trigger if exists aa_trust_cases_no_delete on public.trust_cases;
create trigger aa_trust_cases_no_delete before delete on public.trust_cases for each row execute function public.trust_cases_no_delete_guard();

-- ============================================================ 5. permissions (least privilege, optional, uses the EXISTING staff_roles)
-- Roles already in staff_roles: support, verifier, reviewer, finance, payout_approver, super_admin. No new role names.
-- Case work needs reviewer or super_admin ONLY when enforce_permissions is on. Off (default) = every administrator, as before.
create or replace function public.eb_staff_has_role(p_roles text[])
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare ok boolean := false;
begin
  if auth.uid() is null then return false; end if;
  begin
    select exists (select 1 from public.staff_roles r where r.user_id = auth.uid() and r.role::text = any (p_roles)) into ok;
  exception when others then ok := false;
  end;
  return coalesce(ok, false);
end $f$;

create or replace function public.eb_staff_can_case()
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare enforced boolean := false;
begin
  if auth.uid() is null or not public.eb_is_admin() then return false; end if;
  select enforce_permissions into enforced from public.trust_settings where id;
  if not coalesce(enforced, false) then return true; end if;
  return public.eb_staff_has_role(array['reviewer','super_admin']);
end $f$;

create or replace function public.admin_trust_my_access()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare enforced boolean := false;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  select enforce_permissions into enforced from public.trust_settings where id;
  return jsonb_build_object('enforced', coalesce(enforced, false), 'can_case', public.eb_staff_can_case(), 'is_super', public.eb_staff_has_role(array['super_admin']));
end $f$;

-- Only a super admin can turn the gate on or off. Turning it on cannot lock out the person who did it,
-- because a super admin always passes the case gate.
create or replace function public.admin_trust_set_enforcement(p_on boolean, p_reason text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare o boolean; v text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_has_role(array['super_admin']) then raise exception 'Only a super admin can change this.' using errcode = '42501'; end if;
  if p_on is null then raise exception 'Choose on or off.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'A reason is required.' using errcode = '22023'; end if;
  select enforce_permissions into o from public.trust_settings where id for update;
  update public.trust_settings set enforce_permissions = p_on, updated_by = auth.uid(), updated_at = now() where id;
  perform public.audit_write('trust_permissions_enforcement', 'settings', null, jsonb_build_object('enforced', o), jsonb_build_object('enforced', p_on), v);
end $f$;

-- ============================================================ 6. case functions (all server-side checks; an admin cannot act on a case about their own account)
-- Loads and LOCKS the case row, so two administrators acting at once are handled one after the other, never both.
create or replace function public.eb_case_load(p_case uuid)
returns public.trust_cases language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_case() then raise exception 'You do not have the role needed for investigation cases.' using errcode = '42501'; end if;
  select * into c from public.trust_cases where id = p_case for update;
  if not found then raise exception 'Case not found.' using errcode = 'P0002'; end if;
  if c.subject_user_id = auth.uid() then raise exception 'You cannot act on a case about your own account.' using errcode = '42501'; end if;
  return c;
end $f$;

create or replace function public.admin_case_open(p_title text, p_listing uuid, p_user uuid, p_alerts uuid[], p_priority text default 'normal', p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  t text := left(regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g'), 200);
  n text := nullif(trim(coalesce(p_note, '')), '');
  v_prio text := coalesce(p_priority, 'normal');
  v_listing uuid := p_listing; v_user uuid := p_user; v_ltitle text; v_id uuid; a uuid; ra record; lr record;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_case() then raise exception 'You do not have the role needed for investigation cases.' using errcode = '42501'; end if;
  if char_length(t) < 5 then raise exception 'Write a short title for the case.' using errcode = '22023'; end if;
  if v_prio not in ('normal','high') then raise exception 'Choose a priority.' using errcode = '22023'; end if;
  if p_alerts is not null and coalesce(array_length(p_alerts, 1), 0) > 20 then raise exception 'Invalid request: link at most 20 alerts.' using errcode = '22023'; end if;

  -- fill in the listing / account from the first linked alert when they were not given
  if p_alerts is not null then
    foreach a in array p_alerts loop
      select listing_id, user_id into ra from public.risk_alerts where id = a;
      if not found then raise exception 'Alert not found.' using errcode = 'P0002'; end if;
      v_listing := coalesce(v_listing, ra.listing_id);
      v_user := coalesce(v_user, ra.user_id);
    end loop;
  end if;
  if v_listing is not null then
    select landlord_id, title into lr from public.listings where id = v_listing;
    if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
    v_user := coalesce(v_user, lr.landlord_id);
    v_ltitle := left(lr.title, 200);
  end if;
  if v_listing is null and v_user is null then raise exception 'A case needs a listing, an account or a risk alert.' using errcode = '22023'; end if;
  if v_user = auth.uid() then raise exception 'You cannot act on a case about your own account.' using errcode = '42501'; end if;

  begin
    insert into public.trust_cases (title, priority, subject_user_id, listing_id, listing_title, opened_by)
    values (t, v_prio, v_user, v_listing, v_ltitle, auth.uid()) returning id into v_id;
  exception when unique_violation then
    raise exception 'Another open case already covers this listing. Add to that case instead.' using errcode = '22023';
  end;

  if p_alerts is not null then
    insert into public.trust_case_alerts (case_id, alert_id, linked_by) select v_id, x, auth.uid() from (select distinct unnest(p_alerts) as x) q on conflict do nothing;
  end if;
  insert into public.trust_case_events (case_id, actor_id, event, note) values (v_id, auth.uid(), 'opened', left(n, 2000));
  perform public.audit_write('trust_case_opened', 'trust_case', v_id, null, jsonb_build_object('status', 'open', 'listing_id', v_listing), n);
  return v_id;
end $f$;

create or replace function public.admin_case_assign(p_case uuid, p_assignee uuid default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v_to uuid := coalesce(p_assignee, auth.uid());
begin
  c := public.eb_case_load(p_case);
  if c.status = 'closed' then raise exception 'This case is already closed.' using errcode = '22023'; end if;
  if v_to <> auth.uid() and not exists (select 1 from public.profiles p where p.id = v_to and p.role = 'admin') then raise exception 'Choose an administrator.' using errcode = '22023'; end if;
  if v_to = c.subject_user_id then raise exception 'This case cannot be assigned to the account it is about.' using errcode = '22023'; end if;
  update public.trust_cases set assigned_to = v_to, status = case when status = 'open' then 'investigating' else status end, updated_at = now() where id = p_case;
  insert into public.trust_case_events (case_id, actor_id, event) values (p_case, auth.uid(), 'assigned');
end $f$;

create or replace function public.admin_case_add_note(p_case uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  c := public.eb_case_load(p_case);
  if v is null or char_length(v) < 5 then raise exception 'Write a short note.' using errcode = '22023'; end if;
  insert into public.trust_case_events (case_id, actor_id, event, note) values (p_case, auth.uid(), 'note', left(v, 2000));
  update public.trust_cases set updated_at = now() where id = p_case;
end $f$;

-- Sends the account holder a message. Say what is needed. Do not name other accounts or mention the investigation notes.
create or replace function public.admin_case_request_info(p_case uuid, p_message text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v text := nullif(trim(coalesce(p_message, '')), '');
begin
  c := public.eb_case_load(p_case);
  if c.status = 'closed' then raise exception 'This case is already closed.' using errcode = '22023'; end if;
  if c.subject_user_id is null then raise exception 'This case has no account to contact.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write the message the lister will see.' using errcode = '22023'; end if;
  update public.trust_cases set status = 'info_requested', assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_case;
  insert into public.trust_case_events (case_id, actor_id, event, note, landlord_visible) values (p_case, auth.uid(), 'info_requested', left(v, 2000), true);
  perform public.notify_user(c.subject_user_id, 'EboHomes needs more information', left(v, 500),
    case when c.listing_id is not null then '/dashboard/authority/' || c.listing_id else '/dashboard' end, 'general');
  perform public.audit_write('trust_case_info_requested', 'trust_case', c.id, jsonb_build_object('status', c.status), jsonb_build_object('status', 'info_requested'), v);
end $f$;

create or replace function public.admin_case_escalate(p_case uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  c := public.eb_case_load(p_case);
  if c.status = 'closed' then raise exception 'This case is already closed.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write why you are escalating this.' using errcode = '22023'; end if;
  update public.trust_cases set status = 'escalated', priority = 'high', assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_case;
  insert into public.trust_case_events (case_id, actor_id, event, note) values (p_case, auth.uid(), 'escalated', left(v, 2000));
  perform public.audit_write('trust_case_escalated', 'trust_case', c.id, jsonb_build_object('status', c.status), jsonb_build_object('status', 'escalated'), v);
  perform public.notify_admins('Investigation escalated', 'An administrator escalated an investigation case. Open Trust Operations to review it.', '/admin/operations?tab=cases', 'general');
end $f$;

-- Records that a risk alert belongs to this case. The alert itself is NOT changed.
create or replace function public.admin_case_link_alert(p_case uuid, p_alert uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; r public.risk_alerts; n int;
begin
  c := public.eb_case_load(p_case);
  if c.status = 'closed' then raise exception 'This case is already closed.' using errcode = '22023'; end if;
  select * into r from public.risk_alerts where id = p_alert;
  if not found then raise exception 'Alert not found.' using errcode = 'P0002'; end if;
  insert into public.trust_case_alerts (case_id, alert_id, linked_by) values (p_case, p_alert, auth.uid()) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.trust_case_events (case_id, actor_id, event, note) values (p_case, auth.uid(), 'alert_linked', r.ref);
    update public.trust_cases set updated_at = now() where id = p_case;
  end if;
end $f$;

-- Recording a decision changes NOTHING else: no listing, authority, identity, hold, account or risk-alert status.
-- It tells the administrator how many linked risk alerts are still open, because those are resolved in Risk Alerts.
create or replace function public.admin_case_close(p_case uuid, p_outcome text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v text := nullif(trim(coalesce(p_note, '')), ''); n int;
begin
  c := public.eb_case_load(p_case);
  if c.status = 'closed' then raise exception 'This case is already closed.' using errcode = '22023'; end if;
  if p_outcome is null or p_outcome not in ('no_issue','inconclusive','action_taken_elsewhere','confirmed_violation') then raise exception 'Choose a decision.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write the reason for your decision.' using errcode = '22023'; end if;
  update public.trust_cases set status = 'closed', outcome = p_outcome, closed_at = now(), closed_by = auth.uid(), decision_note = left(v, 2000),
         assigned_to = coalesce(assigned_to, auth.uid()), updated_at = now() where id = p_case;
  insert into public.trust_case_events (case_id, actor_id, event, note) values (p_case, auth.uid(), 'closed', left(p_outcome || ': ' || v, 2000));
  perform public.audit_write('trust_case_closed_' || p_outcome, 'trust_case', c.id, jsonb_build_object('status', c.status), jsonb_build_object('status', 'closed', 'outcome', p_outcome), v);
  select count(*) into n from public.trust_case_alerts l join public.risk_alerts a on a.id = l.alert_id where l.case_id = p_case and a.status <> 'resolved';
  return jsonb_build_object('linked_alerts_still_open', n);
end $f$;

create or replace function public.admin_case_reopen(p_case uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare c public.trust_cases; v text := nullif(trim(coalesce(p_note, '')), '');
begin
  c := public.eb_case_load(p_case);
  if c.status <> 'closed' then raise exception 'Only a closed case can be reopened.' using errcode = '22023'; end if;
  if v is null or char_length(v) < 5 then raise exception 'Write why you are reopening this.' using errcode = '22023'; end if;
  begin
    update public.trust_cases set status = 'investigating', outcome = null, closed_at = null, closed_by = null, decision_note = null, updated_at = now() where id = p_case;
  exception when unique_violation then
    raise exception 'Another open case already covers this listing. Add to that case instead.' using errcode = '22023';
  end;
  insert into public.trust_case_events (case_id, actor_id, event, note) values (p_case, auth.uid(), 'reopened', left(v, 2000));
  perform public.audit_write('trust_case_reopened', 'trust_case', c.id, jsonb_build_object('status', 'closed', 'outcome', c.outcome), jsonb_build_object('status', 'investigating'), v);
end $f$;

-- ============================================================ 7. one read-only overview, counted from real records
-- Nothing is invented. A count is a count of rows. Averages come with their sample size. Identity review time is not reported
-- because identity decisions are not time-stamped in a table this function can read.
create or replace function public.admin_trust_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare q jsonb; p jsonb; v_avg numeric; v_n int; v_oldest numeric; v_recent jsonb; v_req_auth int; v_req_risk int; v_req_case int;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then raise exception 'Invalid date range.' using errcode = '22023'; end if;

  select count(*) into v_req_auth from public.listings where authority_status = 'needs_evidence';
  select count(*) into v_req_risk from public.risk_alerts where status = 'info_requested';
  select count(*) into v_req_case from public.trust_cases where status = 'info_requested';

  q := jsonb_build_object(
    'identity_pending', (select count(*) from public.profiles where role = 'landlord' and verification_status = 'pending' and id_document_url is not null and selfie_url is not null),
    'authority_pending', (select count(*) from public.listings where authority_status = 'submitted'),
    'docs_unreviewed', (select count(*) from public.listing_authority_documents d join public.listings l on l.id = d.listing_id
                         where l.authority_status = 'submitted' and d.withdrawn_at is null
                           and not exists (select 1 from public.listing_document_reviews r where r.document_id = d.id and r.outcome <> 'opened')),
    'inspections_pending', (select count(*) from public.property_inspections where review_status = 'submitted'),
    'risk_open', (select count(*) from public.risk_alerts where status <> 'resolved' and severity in ('investigation','high')),
    'risk_high', (select count(*) from public.risk_alerts where status <> 'resolved' and severity = 'high'),
    'duplicates', (select count(*) from public.risk_alerts where status <> 'resolved' and severity <> 'info' and category in ('duplicate_property','multiple_accounts')),
    'cases_open', (select count(*) from public.trust_cases where status <> 'closed'),
    'cases_escalated', (select count(*) from public.trust_cases where status = 'escalated'),
    'holds_active', (select count(*) from public.property_holds where released_at is null),
    'evidence_requests', v_req_auth + v_req_risk + v_req_case
  );

  p := jsonb_build_object(
    'authority_accepted', (select count(*) from public.listing_authority_reviews where decision = 'accepted' and decided_at >= p_from and decided_at < p_to),
    'authority_rejected', (select count(*) from public.listing_authority_reviews where decision = 'rejected' and decided_at >= p_from and decided_at < p_to),
    'authority_needs_evidence', (select count(*) from public.listing_authority_reviews where decision = 'needs_evidence' and decided_at >= p_from and decided_at < p_to),
    'inspections_approved', (select count(*) from public.property_inspections where review_status = 'approved' and reviewed_at >= p_from and reviewed_at < p_to),
    'inspections_rejected', (select count(*) from public.property_inspections where review_status in ('rejected','reinspect') and reviewed_at >= p_from and reviewed_at < p_to),
    'risk_raised', (select count(*) from public.risk_alerts where detected_at >= p_from and detected_at < p_to),
    'risk_resolved', (select count(*) from public.risk_alerts where resolved_at >= p_from and resolved_at < p_to),
    'risk_false_positive', (select count(*) from public.risk_alerts where resolution = 'false_positive' and resolved_at >= p_from and resolved_at < p_to),
    'cases_opened', (select count(*) from public.trust_cases where opened_at >= p_from and opened_at < p_to),
    'cases_closed', (select count(*) from public.trust_cases where closed_at >= p_from and closed_at < p_to),
    'evidence_requests_sent',
        (select count(*) from public.listing_authority_reviews where decision = 'needs_evidence' and decided_at >= p_from and decided_at < p_to)
      + (select count(*) from public.risk_alert_events where event = 'info_requested' and created_at >= p_from and created_at < p_to)
      + (select count(*) from public.trust_case_events where event = 'info_requested' and created_at >= p_from and created_at < p_to)
  );

  -- authority review time: from the lister's latest submission before the decision, to the decision
  select avg(extract(epoch from (r.decided_at - s.ts)) / 3600.0), count(*) into v_avg, v_n
  from public.listing_authority_reviews r
  join lateral (select x.decided_at as ts from public.listing_authority_reviews x
                where x.listing_id = r.listing_id and x.decision = 'submitted' and x.decided_at <= r.decided_at
                order by x.decided_at desc limit 1) s on true
  where r.decision in ('accepted','rejected','needs_evidence') and r.decided_at >= p_from and r.decided_at < p_to;

  select extract(epoch from (now() - min(w))) / 86400.0 into v_oldest
  from (select (select max(r.decided_at) from public.listing_authority_reviews r where r.listing_id = l.id and r.decision = 'submitted') as w
        from public.listings l where l.authority_status = 'submitted') q2;

  select coalesce(jsonb_agg(jsonb_build_object('kind', k, 'at', ts, 'label', lbl, 'href', href) order by ts desc), '[]'::jsonb) into v_recent
  from (
    select * from (
      select 'Authority ' || replace(r.decision, '_', ' ') as k, r.decided_at as ts, coalesce(l.title, 'Listing') as lbl, '/admin/listing-authority?listing=' || r.listing_id as href
        from public.listing_authority_reviews r left join public.listings l on l.id = r.listing_id where r.decision in ('accepted','rejected','needs_evidence')
      union all
      select 'Inspection ' || replace(i.review_status, '_', ' '), i.reviewed_at, coalesce(l.title, 'Listing'), '/admin/inspections'
        from public.property_inspections i left join public.listings l on l.id = i.listing_id where i.review_status in ('approved','rejected','reinspect') and i.reviewed_at is not null
      union all
      select 'Risk alert resolved', a.resolved_at, coalesce(a.listing_title, a.ref), '/admin/risk' from public.risk_alerts a where a.resolved_at is not null
      union all
      select 'Case closed', c.closed_at, c.title, '/admin/operations?tab=cases' from public.trust_cases c where c.closed_at is not null
    ) u order by ts desc limit 12
  ) z;

  return jsonb_build_object('queues', q, 'period', p, 'authority_avg_hours', round(v_avg, 1), 'authority_avg_sample', coalesce(v_n, 0),
                            'oldest_authority_wait_days', round(v_oldest, 1), 'recent', v_recent);
end $f$;

-- ============================================================ 8. who may call what
revoke all on function public.trust_append_only_guard(), public.trust_cases_no_delete_guard(), public.eb_staff_has_role(text[]),
  public.eb_staff_can_case(), public.eb_case_load(uuid) from public, anon, authenticated;

revoke all on function public.admin_trust_my_access(), public.admin_trust_set_enforcement(boolean,text), public.admin_case_open(text,uuid,uuid,uuid[],text,text),
  public.admin_case_assign(uuid,uuid), public.admin_case_add_note(uuid,text), public.admin_case_request_info(uuid,text), public.admin_case_escalate(uuid,text),
  public.admin_case_link_alert(uuid,uuid), public.admin_case_close(uuid,text,text), public.admin_case_reopen(uuid,text), public.admin_trust_overview(timestamptz,timestamptz)
  from public, anon;
grant execute on function public.admin_trust_my_access(), public.admin_trust_set_enforcement(boolean,text), public.admin_case_open(text,uuid,uuid,uuid[],text,text),
  public.admin_case_assign(uuid,uuid), public.admin_case_add_note(uuid,text), public.admin_case_request_info(uuid,text), public.admin_case_escalate(uuid,text),
  public.admin_case_link_alert(uuid,uuid), public.admin_case_close(uuid,text,text), public.admin_case_reopen(uuid,text), public.admin_trust_overview(timestamptz,timestamptz)
  to authenticated;

commit;

-- CHECK (read only, run after the migration): expect 4 tables, 1 settings row with enforce_permissions = false, 11 functions.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('trust_settings','trust_cases','trust_case_alerts','trust_case_events')) as tables_should_be_4,
--        (select enforce_permissions from public.trust_settings) as enforced_should_be_false,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and (proname like 'admin_case_%' or proname in ('admin_trust_overview','admin_trust_my_access','admin_trust_set_enforcement'))) as functions_should_be_11;

-- ROLLBACK (only before real cases exist that you want to keep):
-- drop function if exists public.admin_trust_overview(timestamptz,timestamptz), public.admin_case_reopen(uuid,text), public.admin_case_close(uuid,text,text),
--   public.admin_case_link_alert(uuid,uuid), public.admin_case_escalate(uuid,text), public.admin_case_request_info(uuid,text), public.admin_case_add_note(uuid,text),
--   public.admin_case_assign(uuid,uuid), public.admin_case_open(text,uuid,uuid,uuid[],text,text), public.eb_case_load(uuid), public.admin_trust_set_enforcement(boolean,text),
--   public.admin_trust_my_access(), public.eb_staff_can_case(), public.eb_staff_has_role(text[]), public.trust_cases_no_delete_guard(), public.trust_append_only_guard();
-- drop table if exists public.trust_case_events, public.trust_case_alerts, public.trust_cases, public.trust_settings;
-- drop sequence if exists public.trust_case_seq;
