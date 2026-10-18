-- EboHomes batch 5 / file 2: viewings and rental terms / agreement tracking.
-- Adds new tables only. Every write goes through a function that checks who
-- the caller is. Nothing here moves money.
begin;

create or replace function public.eb_tenancy_role(p_tenancy uuid)
 returns text language plpgsql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
declare t record;
begin
  if auth.uid() is null then return null; end if;
  select landlord_id, tenant_id into t from public.tenancies where id = p_tenancy;
  if not found then return null; end if;
  if auth.uid() = t.tenant_id then return 'tenant'; end if;
  if auth.uid() = t.landlord_id then return 'landlord'; end if;
  if public.eb_is_admin() then return 'admin'; end if;
  return null;
end;
$$;
revoke all on function public.eb_tenancy_role(uuid) from public, anon;
grant execute on function public.eb_tenancy_role(uuid) to authenticated;

-- ============================ VIEWINGS ============================
create table if not exists public.viewings (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id),
  listing_id uuid not null,
  tenant_id uuid not null,
  landlord_id uuid not null,
  status text not null default 'requested'
    check (status in ('requested', 'scheduled', 'completed', 'no_show', 'cancelled')),
  preferred_at timestamptz,
  scheduled_for timestamptz,
  tenant_note text,
  staff_note text,
  outcome_note text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists viewings_one_open_per_application
  on public.viewings (application_id) where status in ('requested', 'scheduled');
create index if not exists viewings_tenant_idx on public.viewings (tenant_id, created_at desc);
create index if not exists viewings_landlord_idx on public.viewings (landlord_id, created_at desc);

alter table public.viewings enable row level security;
revoke all on public.viewings from anon, authenticated;
grant select on public.viewings to authenticated;
drop policy if exists viewings_select on public.viewings;
create policy viewings_select on public.viewings for select to authenticated
  using (auth.uid() = tenant_id or auth.uid() = landlord_id or public.eb_is_admin());

create or replace function public.request_viewing(p_application uuid, p_preferred timestamptz default null, p_note text default null)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare a record; v_id uuid; v_title text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into a from public.applications where id = p_application;
  if not found or a.tenant_id <> auth.uid() then raise exception 'Application not found'; end if;
  if a.status not in ('pending', 'info_requested', 'approved') then
    raise exception 'A viewing can only be requested on an open or approved application';
  end if;
  if p_preferred is not null and p_preferred < now() then raise exception 'Choose a date in the future'; end if;
  if exists (select 1 from public.viewings v where v.application_id = a.id and v.status in ('requested', 'scheduled')) then
    raise exception 'You already have an open viewing for this application';
  end if;
  insert into public.viewings (application_id, listing_id, tenant_id, landlord_id, preferred_at, tenant_note, updated_by)
  values (a.id, a.listing_id, a.tenant_id, a.landlord_id, p_preferred, nullif(trim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;
  select coalesce(nullif(trim(title), ''), 'a property') into v_title from public.listings where id = a.listing_id;
  perform public.notify_user(a.landlord_id, 'Viewing requested',
    concat('An applicant asked to view "', coalesce(v_title, 'a property'), '".'), '/dashboard/viewings', 'application');
  perform public.notify_admins('Viewing requested',
    concat('An applicant asked to view "', coalesce(v_title, 'a property'), '".'), '/admin/cases', 'application');
  return v_id;
end;
$$;

create or replace function public.schedule_viewing(p_viewing uuid, p_when timestamptz, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record; v_admin boolean := public.eb_is_admin();
begin
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if not (v_admin or auth.uid() = v.landlord_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v.status not in ('requested', 'scheduled') then raise exception 'This viewing is already %', v.status; end if;
  if p_when is null or p_when < now() then raise exception 'Choose a time in the future'; end if;
  update public.viewings
     set status = 'scheduled', scheduled_for = p_when, staff_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), staff_note),
         updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  perform public.notify_user(v.tenant_id, 'Viewing scheduled',
    concat('Your viewing is set for ', to_char(p_when at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI'), '.'), '/viewings', 'application');
  if v_admin and auth.uid() <> v.landlord_id then
    perform public.notify_user(v.landlord_id, 'Viewing scheduled',
      concat('A viewing was set for ', to_char(p_when at time zone 'Africa/Lagos', 'DD Mon YYYY HH24:MI'), '.'), '/dashboard/viewings', 'application');
  end if;
end;
$$;

create or replace function public.complete_viewing(p_viewing uuid, p_outcome text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record;
begin
  if p_outcome not in ('completed', 'no_show') then raise exception 'Outcome must be completed or no_show'; end if;
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if not (public.eb_is_admin() or auth.uid() = v.landlord_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v.status <> 'scheduled' then raise exception 'Only a scheduled viewing can be closed out'; end if;
  update public.viewings
     set status = p_outcome, outcome_note = nullif(trim(coalesce(p_note, '')), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  perform public.notify_user(v.tenant_id, case when p_outcome = 'completed' then 'Viewing completed' else 'Viewing missed' end,
    case when p_outcome = 'completed' then 'Your viewing was marked as completed.' else 'Your viewing was marked as missed. Ask for a new time if you still want to see the property.' end,
    '/viewings', 'application');
  perform public.notify_admins(case when p_outcome = 'completed' then 'Viewing completed' else 'Viewing missed' end,
    'A viewing was closed out.', '/admin/cases', 'application');
end;
$$;

create or replace function public.cancel_viewing(p_viewing uuid, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare v record; v_admin boolean := public.eb_is_admin();
begin
  select * into v from public.viewings where id = p_viewing for update;
  if not found then raise exception 'Viewing not found'; end if;
  if not (v_admin or auth.uid() in (v.tenant_id, v.landlord_id)) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if v.status not in ('requested', 'scheduled') then raise exception 'This viewing is already %', v.status; end if;
  update public.viewings
     set status = 'cancelled', outcome_note = nullif(trim(coalesce(p_note, '')), ''), updated_by = auth.uid(), updated_at = now()
   where id = p_viewing;
  if auth.uid() <> v.tenant_id then
    perform public.notify_user(v.tenant_id, 'Viewing cancelled', 'Your viewing was cancelled. You can request a new one.', '/viewings', 'application');
  end if;
  if auth.uid() <> v.landlord_id then
    perform public.notify_user(v.landlord_id, 'Viewing cancelled', 'A viewing was cancelled.', '/dashboard/viewings', 'application');
  end if;
  perform public.notify_admins('Viewing cancelled', 'A viewing was cancelled.', '/admin/cases', 'application');
end;
$$;

-- ======================= RENTAL TERMS / AGREEMENT =======================
create table if not exists public.rental_terms (
  id uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references public.tenancies(id),
  version int not null,
  proposed_by uuid not null,
  rent_amount numeric not null check (rent_amount > 0),
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  fees_amount numeric not null default 0 check (fees_amount >= 0),
  payment_schedule text,
  notice_days int check (notice_days between 0 and 365),
  house_rules text,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'declined', 'superseded', 'signed')),
  tenant_accepted_at timestamptz,
  landlord_accepted_at timestamptz,
  signed_reference text,
  signed_recorded_by uuid,
  signed_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenancy_id, version)
);
create unique index if not exists rental_terms_one_live_per_tenancy
  on public.rental_terms (tenancy_id) where status in ('proposed', 'accepted', 'signed');

alter table public.rental_terms enable row level security;
revoke all on public.rental_terms from anon, authenticated;
grant select on public.rental_terms to authenticated;
drop policy if exists rental_terms_select on public.rental_terms;
create policy rental_terms_select on public.rental_terms for select to authenticated
  using (public.eb_tenancy_role(tenancy_id) is not null);

create or replace function public.propose_rental_terms(
  p_tenancy uuid, p_rent numeric, p_deposit numeric, p_fees numeric,
  p_schedule text, p_notice_days int, p_rules text)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare r text := public.eb_tenancy_role(p_tenancy); cur record; v_ver int; v_id uuid; t record;
begin
  if coalesce(r, '') not in ('landlord', 'admin') then raise exception 'Only the landlord or EboHomes can propose terms' using errcode = '42501'; end if;
  select * into cur from public.rental_terms where tenancy_id = p_tenancy and status in ('proposed', 'accepted', 'signed') for update;
  if found and cur.status = 'signed' then
    raise exception 'A signed agreement is on record. Use a renewal to change terms.';
  end if;
  if found then update public.rental_terms set status = 'superseded', updated_at = now() where id = cur.id; end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.rental_terms where tenancy_id = p_tenancy;
  insert into public.rental_terms (tenancy_id, version, proposed_by, rent_amount, deposit_amount, fees_amount,
      payment_schedule, notice_days, house_rules, landlord_accepted_at)
  values (p_tenancy, v_ver, auth.uid(), p_rent, coalesce(p_deposit, 0), coalesce(p_fees, 0),
      nullif(trim(coalesce(p_schedule, '')), ''), p_notice_days, nullif(trim(coalesce(p_rules, '')), ''),
      case when r = 'landlord' then now() end)
  returning id into v_id;
  select tenant_id, landlord_id into t from public.tenancies where id = p_tenancy;
  perform public.notify_user(t.tenant_id, 'Rental terms to review',
    'Rental terms were proposed for your tenancy. Please read them and accept or decline.', '/tenancies/' || p_tenancy, 'tenancy');
  if r = 'admin' then
    perform public.notify_user(t.landlord_id, 'Rental terms to review',
      'EboHomes proposed rental terms for your tenancy. Please accept or decline.', '/dashboard/tenancies/' || p_tenancy, 'tenancy');
  end if;
  return v_id;
end;
$$;

create or replace function public.respond_rental_terms(p_terms uuid, p_accept boolean)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare x record; r text; t record;
begin
  select * into x from public.rental_terms where id = p_terms for update;
  if not found then raise exception 'Terms not found'; end if;
  r := public.eb_tenancy_role(x.tenancy_id);
  if coalesce(r, '') not in ('tenant', 'landlord') then raise exception 'Only the tenant or landlord can respond' using errcode = '42501'; end if;
  if x.status <> 'proposed' then raise exception 'These terms are already %', x.status; end if;
  select tenant_id, landlord_id into t from public.tenancies where id = x.tenancy_id;
  if not p_accept then
    update public.rental_terms set status = 'declined', updated_at = now() where id = p_terms;
    perform public.notify_user(case when r = 'tenant' then t.landlord_id else t.tenant_id end, 'Rental terms declined',
      'The other party declined the proposed rental terms.',
      case when r = 'tenant' then '/dashboard/tenancies/' else '/tenancies/' end || x.tenancy_id, 'tenancy');
    perform public.notify_admins('Rental terms declined', 'Proposed rental terms were declined.', '/admin/cases', 'tenancy');
    return;
  end if;
  if r = 'tenant' then update public.rental_terms set tenant_accepted_at = coalesce(tenant_accepted_at, now()), updated_at = now() where id = p_terms;
  else update public.rental_terms set landlord_accepted_at = coalesce(landlord_accepted_at, now()), updated_at = now() where id = p_terms;
  end if;
  update public.rental_terms set status = 'accepted', updated_at = now()
   where id = p_terms and tenant_accepted_at is not null and landlord_accepted_at is not null;
  if exists (select 1 from public.rental_terms where id = p_terms and status = 'accepted') then
    perform public.notify_admins('Rental terms accepted',
      'Both sides accepted the terms. Record the signed agreement once you have seen it.', '/admin/cases', 'tenancy');
    perform public.notify_user(t.tenant_id, 'Rental terms accepted', 'Both sides accepted the rental terms. EboHomes will record the signed agreement.', '/tenancies/' || x.tenancy_id, 'tenancy');
    perform public.notify_user(t.landlord_id, 'Rental terms accepted', 'Both sides accepted the rental terms. EboHomes will record the signed agreement.', '/dashboard/tenancies/' || x.tenancy_id, 'tenancy');
  end if;
end;
$$;

create or replace function public.record_signed_agreement(p_terms uuid, p_reference text)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare x record; t record; v_ref text := nullif(trim(coalesce(p_reference, '')), '');
begin
  if not public.eb_is_admin() then raise exception 'Only EboHomes staff can record a signed agreement' using errcode = '42501'; end if;
  if v_ref is null then raise exception 'Enter a reference for the signed agreement'; end if;
  select * into x from public.rental_terms where id = p_terms for update;
  if not found then raise exception 'Terms not found'; end if;
  if x.status <> 'accepted' then raise exception 'Both sides must accept the terms first (current: %)', x.status; end if;
  update public.rental_terms
     set status = 'signed', signed_reference = v_ref, signed_recorded_by = auth.uid(), signed_recorded_at = now(), updated_at = now()
   where id = p_terms;
  select tenant_id, landlord_id into t from public.tenancies where id = x.tenancy_id;
  perform public.notify_user(t.tenant_id, 'Agreement recorded', 'EboHomes recorded your signed rental agreement.', '/tenancies/' || x.tenancy_id, 'tenancy');
  perform public.notify_user(t.landlord_id, 'Agreement recorded', 'EboHomes recorded the signed rental agreement.', '/dashboard/tenancies/' || x.tenancy_id, 'tenancy');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'request_viewing(uuid,timestamptz,text)', 'schedule_viewing(uuid,timestamptz,text)',
    'complete_viewing(uuid,text,text)', 'cancel_viewing(uuid,text)',
    'propose_rental_terms(uuid,numeric,numeric,numeric,text,integer,text)',
    'respond_rental_terms(uuid,boolean)', 'record_signed_agreement(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

commit;