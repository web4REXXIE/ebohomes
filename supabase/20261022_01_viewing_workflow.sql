-- EboHomes batch 6 / file 1: viewing workflow (contact phone, admin response, activity history, tenant decision).
-- Additive: new columns, two new tables, replaced functions. No data is deleted.
-- Business rule change: only EboHomes admins approve / schedule / close viewings. Landlords become read-only.
begin;

-- ---------- 1. New columns on viewings ----------
alter table public.viewings
  add column if not exists admin_response text,
  add column if not exists admin_responded_at timestamptz,
  add column if not exists admin_responded_by uuid,
  add column if not exists proposed_at timestamptz,
  add column if not exists meeting_instructions text,
  add column if not exists contact_status text not null default 'not_attempted',
  add column if not exists tenant_decision text,
  add column if not exists tenant_decision_at timestamptz;

-- Drop whatever check constraint currently limits viewings.status (its name may differ from the default).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.viewings'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%' and pg_get_constraintdef(oid) like '%requested%'
       and pg_get_constraintdef(oid) not like '%contact_status%'
  loop
    execute format('alter table public.viewings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.viewings add constraint viewings_status_check
  check (status in ('requested', 'approved', 'reschedule_proposed', 'scheduled', 'completed', 'no_show', 'cancelled', 'rejected'));

alter table public.viewings drop constraint if exists viewings_contact_status_check;
alter table public.viewings add constraint viewings_contact_status_check
  check (contact_status in ('not_attempted', 'attempted', 'reached'));

alter table public.viewings drop constraint if exists viewings_tenant_decision_check;
alter table public.viewings add constraint viewings_tenant_decision_check
  check (tenant_decision is null or tenant_decision in ('interested', 'not_interested'));

drop index if exists public.viewings_one_open_per_application;
create unique index viewings_one_open_per_application
  on public.viewings (application_id)
  where status in ('requested', 'approved', 'reschedule_proposed', 'scheduled');

-- ---------- 2. Contact phone (private: tenant + admin only, never the landlord) ----------
create table if not exists public.viewing_contacts (
  viewing_id uuid primary key references public.viewings(id) on delete cascade,
  tenant_id uuid not null,
  phone text not null,
  updated_at timestamptz not null default now()
);
alter table public.viewing_contacts enable row level security;
revoke all on public.viewing_contacts from anon, authenticated;
grant select on public.viewing_contacts to authenticated;
drop policy if exists viewing_contacts_select on public.viewing_contacts;
create policy viewing_contacts_select on public.viewing_contacts for select to authenticated
  using (auth.uid() = tenant_id or public.eb_is_admin());

-- ---------- 3. Activity history ----------
create table if not exists public.viewing_events (
  id uuid primary key default gen_random_uuid(),
  viewing_id uuid not null references public.viewings(id) on delete cascade,
  application_id uuid,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  actor_role text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists viewing_events_viewing_idx on public.viewing_events (viewing_id, created_at desc);
alter table public.viewing_events enable row level security;
revoke all on public.viewing_events from anon, authenticated;
grant select on public.viewing_events to authenticated;
drop policy if exists viewing_events_select on public.viewing_events;
create policy viewing_events_select on public.viewing_events for select to authenticated
  using (
    public.eb_is_admin()
    or exists (select 1 from public.viewings v
               where v.id = viewing_events.viewing_id and (v.tenant_id = auth.uid() or v.landlord_id = auth.uid()))
  );

create or replace function public.eb_log_viewing_event(p_viewing uuid, p_type text, p_from text, p_to text, p_note text)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record; r text;
begin
  select application_id, tenant_id, landlord_id into v from public.viewings where id = p_viewing;
  if not found then return; end if;
  r := case when auth.uid() = v.tenant_id then 'tenant'
            when public.eb_is_admin() then 'admin'
            when auth.uid() = v.landlord_id then 'landlord'
            else 'system' end;
  insert into public.viewing_events (viewing_id, application_id, event_type, from_status, to_status, actor_id, actor_role, note)
  values (p_viewing, v.application_id, p_type, p_from, p_to, auth.uid(), r, nullif(trim(coalesce(p_note, '')), ''));
end;
$$;
revoke all on function public.eb_log_viewing_event(uuid, text, text, text, text) from public, anon, authenticated;

-- ---------- 4. Nigerian mobile number normaliser ----------
create or replace function public.eb_normalise_ng_phone(p text)
 returns text language plpgsql immutable
as $$
declare d text := regexp_replace(coalesce(p, ''), '[\s\-\(\)]', '', 'g');
begin
  if d ~ '^\+234[789][01][0-9]{8}$' then return d; end if;
  if d ~ '^234[789][01][0-9]{8}$' then return '+' || d; end if;
  if d ~ '^0[789][01][0-9]{8}$' then return '+234' || substr(d, 2); end if;
  return null;
end;
$$;

-- ---------- 5. Tenant requests a viewing (phone now required) ----------
drop function if exists public.request_viewing(uuid, timestamptz, text);

create or replace function public.request_viewing(p_application uuid, p_preferred timestamptz, p_note text, p_phone text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare a record; v_id uuid; v_title text; v_phone text := public.eb_normalise_ng_phone(p_phone);
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into a from public.applications where id = p_application;
  if not found or a.tenant_id <> auth.uid() then raise exception 'Application not found'; end if;
  if a.status not in ('pending', 'info_requested', 'approved') then
    raise exception 'A viewing can only be requested on an open or approved application';
  end if;
  if v_phone is null then raise exception 'Enter a valid Nigerian phone number, for example 0803 123 4567'; end if;
  if p_preferred is null then raise exception 'Choose the date and time you would like to view'; end if;
  if p_preferred < now() then raise exception 'Choose a date in the future'; end if;
  if exists (select 1 from public.viewings v where v.application_id = a.id
             and v.status in ('requested', 'approved', 'reschedule_proposed', 'scheduled')) then
    raise exception 'You already have an open viewing for this application';
  end if;
  insert into public.viewings (application_id, listing_id, tenant_id, landlord_id, preferred_at, tenant_note, updated_by)
  values (a.id, a.listing_id, a.tenant_id, a.landlord_id, p_preferred, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  insert into public.viewing_contacts (viewing_id, tenant_id, phone) values (v_id, a.tenant_id, v_phone);
  perform public.eb_log_viewing_event(v_id, 'viewing_requested', null, 'requested', p_note);
  select coalesce(nullif(trim(title), ''), 'a property') into v_title from public.listings where id = a.listing_id;
  perform public.notify_admins('Viewing requested',
    concat('An applicant asked to view "', coalesce(v_title, 'a property'), '". Respond from Viewings.'), '/admin/viewings', 'application');
  return v_id;
end;
$$;

-- ---------- 6. Admin responds: approve (with or without a time), reject, or propose another time ----------
create or replace function public.admin_respond_viewing(
  p_viewing uuid, p_action text, p_when timestamptz default null,
  p_message text default null, p_instructions text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v record;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_ins text := nullif(trim(coalesce(p_instructions, '')), '');
  v_new text; v_ev text; v_when_txt text;
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can respond to a viewing request' using errcode = '42501'; end if;
  if p_action not in ('approve', 'reject', 'propose') then raise exception 'Unknown action'; end if;
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if v.status not in ('requested', 'approved', 'reschedule_proposed', 'scheduled') then
    raise exception 'This viewing is already %', replace(v.status, '_', ' ');
  end if;
  if p_when is not null and p_when < now() then raise exception 'Choose a time in the future'; end if;
  if p_action = 'propose' and p_when is null then raise exception 'Choose the time you want to propose'; end if;
  if p_action = 'reject' and v_msg is null then raise exception 'Give the tenant a reason'; end if;
  if p_action = 'reject' and v.status = 'scheduled' then raise exception 'Use cancel for a viewing that is already scheduled'; end if;
  if p_action = 'approve' and p_when is null and v.status = 'scheduled' then raise exception 'Choose the new time'; end if;

  v_new := case p_action
             when 'approve' then case when p_when is null then 'approved' else 'scheduled' end
             when 'propose' then 'reschedule_proposed'
             else 'rejected' end;
  v_ev := case
            when p_action = 'reject' then 'request_rejected'
            when p_action = 'propose' then 'alternative_proposed'
            when p_when is null then 'request_approved'
            when v.status = 'scheduled' then 'appointment_rescheduled'
            else 'appointment_scheduled' end;

  update public.viewings
     set status = v_new,
         scheduled_for = case when v_new = 'scheduled' then p_when else scheduled_for end,
         proposed_at = case when v_new = 'reschedule_proposed' then p_when else null end,
         meeting_instructions = coalesce(v_ins, meeting_instructions),
         admin_response = v_msg,
         admin_responded_at = now(), admin_responded_by = auth.uid(),
         updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;

  perform public.eb_log_viewing_event(p_viewing, v_ev, v.status, v_new, v_msg);
  v_when_txt := case when p_when is null then '' else to_char(p_when at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI') end;

  perform public.notify_user(v.tenant_id,
    case v_new when 'scheduled' then 'Viewing scheduled' when 'approved' then 'Viewing request approved'
               when 'reschedule_proposed' then 'New viewing time proposed' else 'Viewing request not approved' end,
    case v_new when 'scheduled' then concat('Your viewing is confirmed for ', v_when_txt, '.')
               when 'approved' then 'EboHomes approved your request and will confirm a date and time shortly.'
               when 'reschedule_proposed' then concat('EboHomes proposed ', v_when_txt, '. Please accept or decline.')
               else 'EboHomes could not approve this viewing request. Open it to read why.' end,
    '/viewings', 'application');
  if v_new = 'scheduled' then
    perform public.notify_user(v.landlord_id, 'Viewing scheduled',
      concat('A viewing was set for ', v_when_txt, '.'), '/dashboard/viewings', 'application');
  end if;
end;
$$;

-- Old entry point kept so the existing admin Cases tab keeps working. Admin only.
create or replace function public.schedule_viewing(p_viewing uuid, p_when timestamptz, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.admin_respond_viewing(p_viewing, 'approve', p_when, p_note, null);
end;
$$;

-- ---------- 7. Tenant answers a proposed time ----------
create or replace function public.tenant_respond_proposal(p_viewing uuid, p_accept boolean, p_message text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record;
begin
  select * into v from public.viewings where id = p_viewing for update;
  if not found or v.tenant_id <> auth.uid() then raise exception 'Viewing not found'; end if;
  if v.status <> 'reschedule_proposed' or v.proposed_at is null then raise exception 'There is no proposed time to answer'; end if;
  if p_accept then
    update public.viewings set status = 'scheduled', scheduled_for = v.proposed_at, proposed_at = null,
           updated_by = auth.uid(), updated_at = now() where id = p_viewing;
    perform public.eb_log_viewing_event(p_viewing, 'proposal_accepted', v.status, 'scheduled', p_message);
    perform public.notify_admins('Proposed viewing time accepted', 'The tenant accepted your proposed time.', '/admin/viewings', 'application');
  else
    update public.viewings set status = 'requested', proposed_at = null, admin_response = null,
           updated_by = auth.uid(), updated_at = now() where id = p_viewing;
    perform public.eb_log_viewing_event(p_viewing, 'proposal_declined', v.status, 'requested', p_message);
    perform public.notify_admins('Proposed viewing time declined', 'The tenant declined your proposed time. Offer another.', '/admin/viewings', 'application');
  end if;
end;
$$;

-- ---------- 8. Admin closes out a viewing ----------
create or replace function public.complete_viewing(p_viewing uuid, p_outcome text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record;
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can record a viewing outcome' using errcode = '42501'; end if;
  if p_outcome not in ('completed', 'no_show') then raise exception 'Outcome must be completed or no_show'; end if;
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if v.status <> 'scheduled' then raise exception 'Only a scheduled viewing can be closed out'; end if;
  update public.viewings
     set status = p_outcome, outcome_note = nullif(trim(coalesce(p_note, '')), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  perform public.eb_log_viewing_event(p_viewing, case when p_outcome = 'completed' then 'viewing_completed' else 'viewing_missed' end,
    v.status, p_outcome, p_note);
  perform public.notify_user(v.tenant_id,
    case when p_outcome = 'completed' then 'Viewing completed' else 'Viewing missed' end,
    case when p_outcome = 'completed' then 'Your viewing is complete. Tell EboHomes whether you want to continue with renting.'
         else 'Your viewing was marked as missed. Ask for a new time if you still want to see the property.' end,
    '/viewings', 'application');
end;
$$;

-- ---------- 9. Cancel (tenant or admin; landlords can no longer cancel) ----------
create or replace function public.cancel_viewing(p_viewing uuid, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record; v_admin boolean := public.eb_is_admin();
begin
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if not (v_admin or auth.uid() = v.tenant_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v.status not in ('requested', 'approved', 'reschedule_proposed', 'scheduled') then
    raise exception 'This viewing is already %', replace(v.status, '_', ' ');
  end if;
  update public.viewings
     set status = 'cancelled', outcome_note = nullif(trim(coalesce(p_note, '')), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  perform public.eb_log_viewing_event(p_viewing, 'viewing_cancelled', v.status, 'cancelled', p_note);
  if auth.uid() <> v.tenant_id then
    perform public.notify_user(v.tenant_id, 'Viewing cancelled', 'EboHomes cancelled your viewing. You can request a new one.', '/viewings', 'application');
  else
    perform public.notify_admins('Viewing cancelled', 'A tenant cancelled a viewing.', '/admin/viewings', 'application');
  end if;
  if v.status = 'scheduled' then
    perform public.notify_user(v.landlord_id, 'Viewing cancelled', 'A scheduled viewing was cancelled.', '/dashboard/viewings', 'application');
  end if;
end;
$$;

-- ---------- 10. Admin records contact attempts ----------
create or replace function public.record_viewing_contact(p_viewing uuid, p_status text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record;
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can record contact' using errcode = '42501'; end if;
  if p_status not in ('not_attempted', 'attempted', 'reached') then raise exception 'Unknown contact status'; end if;
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  update public.viewings set contact_status = p_status, updated_by = auth.uid(), updated_at = now() where id = p_viewing;
  perform public.eb_log_viewing_event(p_viewing, 'contact_' || p_status, v.status, v.status, p_note);
end;
$$;

-- ---------- 11. Tenant decision after a completed viewing ----------
create or replace function public.tenant_viewing_decision(p_viewing uuid, p_interested boolean)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record; a_status text; v_title text;
begin
  select * into v from public.viewings where id = p_viewing for update;
  if not found or v.tenant_id <> auth.uid() then raise exception 'Viewing not found'; end if;
  if v.status <> 'completed' then raise exception 'You can decide once the viewing has been completed'; end if;
  if v.tenant_decision is not null then raise exception 'You have already recorded your decision'; end if;
  select status into a_status from public.applications where id = v.application_id;
  if coalesce(a_status, '') in ('withdrawn', 'rejected') then
    raise exception 'This application is closed, so a decision cannot be recorded';
  end if;
  update public.viewings
     set tenant_decision = case when p_interested then 'interested' else 'not_interested' end,
         tenant_decision_at = now(), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  perform public.eb_log_viewing_event(p_viewing, case when p_interested then 'tenant_interested' else 'tenant_declined' end,
    v.status, v.status, null);
  select coalesce(nullif(trim(title), ''), 'a property') into v_title from public.listings where id = v.listing_id;
  perform public.notify_admins(
    case when p_interested then 'Tenant wants to continue' else 'Tenant no longer interested' end,
    concat('A tenant who viewed "', coalesce(v_title, 'a property'), '" ',
           case when p_interested then 'wants to continue with renting. Review the application.' else 'is no longer interested.' end),
    '/admin/viewings', 'application');
end;
$$;

-- ---------- 12. Grants ----------
do $$
declare f text;
begin
  foreach f in array array[
    'request_viewing(uuid,timestamptz,text,text)',
    'admin_respond_viewing(uuid,text,timestamptz,text,text)',
    'schedule_viewing(uuid,timestamptz,text)',
    'tenant_respond_proposal(uuid,boolean,text)',
    'complete_viewing(uuid,text,text)',
    'cancel_viewing(uuid,text)',
    'record_viewing_contact(uuid,text,text)',
    'tenant_viewing_decision(uuid,boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;