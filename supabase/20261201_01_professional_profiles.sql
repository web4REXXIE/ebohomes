-- EboHomes 20261201_01 (Phase 10.2, Step A): professional identity layer for agents and property managers.
-- WHAT: adds professional_profiles + professional_events + 6 functions. Nothing existing is changed.
-- NOT touched: profiles.role, landlord_id, listings, authority tables, submit_listing_authority, payouts, tenancies.
-- Approval here NEVER approves property authority. The submission gate comes in Step B.
-- REQUIRES: eb_is_admin(), eb_staff_has_role(), notify_user(), notify_admins(), audit_write(), trust_settings (all exist).
-- One transaction. Back up first.
begin;

-- 1. tables ---------------------------------------------------------
create table if not exists public.professional_profiles (
  user_id uuid primary key,
  kind text not null check (kind in ('agent','manager')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  licence_body text,
  licence_number text,
  licence_checked_at timestamptz,
  licence_checked_by uuid,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pp_status on public.professional_profiles (status, submitted_at);

create table if not exists public.professional_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists pe_user on public.professional_events (user_id, created_at);

create or replace function public.eb_professional_events_immutable()
returns trigger language plpgsql as $$
begin raise exception 'Professional events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists pe_immutable on public.professional_events;
create trigger pe_immutable before update or delete on public.professional_events
  for each row execute function public.eb_professional_events_immutable();

-- 2. row security: no direct access for anyone signed in; everything goes through functions
alter table public.professional_profiles enable row level security;
alter table public.professional_events enable row level security;
revoke all on public.professional_profiles from anon, authenticated;
revoke all on public.professional_events from anon, authenticated;

-- 3. helpers (internal) -----------------------------------------------
-- Current status for a user: 'none' when no application exists. Used by the Step B submission gate.
create or replace function public.eb_professional_status(p_user uuid)
returns text language sql stable security definer set search_path to 'public','pg_temp'
as $$ select coalesce((select status from public.professional_profiles where user_id = p_user), 'none') $$;

-- Staff permission: honours trust_settings.enforce_permissions like eb_staff_can_case()
create or replace function public.eb_staff_can_verify()
returns boolean language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare enforced boolean := false;
begin
  if auth.uid() is null or not public.eb_is_admin() then return false; end if;
  begin
    select enforce_permissions into enforced from public.trust_settings where id;
  exception when others then enforced := false;
  end;
  if not coalesce(enforced, false) then return true; end if;
  return public.eb_staff_has_role(array['verifier','super_admin']);
end $f$;

revoke all on function public.eb_professional_status(uuid), public.eb_staff_can_verify() from public, anon, authenticated;

-- 4. USER functions ------------------------------------------------------
-- Apply (or resubmit after a rejection, or update details while pending)
create or replace function public.professional_apply(p_kind text, p_licence_body text default null, p_licence_number text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v uuid := auth.uid();
  pr record; cur public.professional_profiles;
  v_body text := nullif(left(trim(coalesce(p_licence_body, '')), 120), '');
  v_num text := nullif(left(trim(coalesce(p_licence_number, '')), 60), '');
begin
  if v is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  if p_kind is null or p_kind not in ('agent','manager') then
    raise exception 'Choose agent or property manager.' using errcode = '22023';
  end if;
  select role into pr from public.profiles where id = v;
  if not found or pr.role is distinct from 'landlord' then
    raise exception 'Only a lister account can apply as a professional.' using errcode = '42501';
  end if;

  select * into cur from public.professional_profiles where user_id = v for update;

  if not found then
    insert into public.professional_profiles (user_id, kind, licence_body, licence_number)
    values (v, p_kind, v_body, v_num);
    insert into public.professional_events (user_id, event, from_status, to_status, actor_id)
    values (v, 'applied', null, 'pending', v);
    begin
      perform public.notify_admins('Professional application', 'An agent or property manager applied for review.', '/admin/professionals', 'general');
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;

  if cur.status = 'approved' then raise exception 'You are already approved.' using errcode = '22023'; end if;
  if cur.status = 'suspended' then
    raise exception 'Your professional profile is suspended. Please contact EboHomes.' using errcode = '42501';
  end if;

  -- pending: update details only. rejected: resubmit for a fresh review.
  update public.professional_profiles
     set kind = p_kind, licence_body = v_body, licence_number = v_num,
         licence_checked_at = null, licence_checked_by = null,
         status = 'pending', submitted_at = case when cur.status = 'rejected' then now() else cur.submitted_at end,
         updated_at = now()
   where user_id = v;
  insert into public.professional_events (user_id, event, from_status, to_status, actor_id)
  values (v, case when cur.status = 'rejected' then 'resubmitted' else 'details_updated' end, cur.status, 'pending', v);
  if cur.status = 'rejected' then
    begin
      perform public.notify_admins('Professional application resubmitted', 'An agent or property manager resubmitted for review.', '/admin/professionals', 'general');
    exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'status', 'pending');
end $f$;

-- Own professional profile (never exposes reviewer ids)
create or replace function public.professional_my()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); p public.professional_profiles;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select * into p from public.professional_profiles where user_id = v;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'kind', p.kind, 'status', p.status,
    'licence_body', p.licence_body, 'licence_number', p.licence_number,
    'licence_checked', p.licence_checked_at is not null,
    'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at,
    'decision_note', case when p.status in ('rejected','suspended') then p.decision_note end);
end $f$;

-- 5. ADMIN functions -----------------------------------------------------
create or replace function public.admin_professionals_list(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', p.user_id, 'kind', p.kind, 'status', p.status,
      'licence_body', p.licence_body, 'licence_number', p.licence_number,
      'licence_checked', p.licence_checked_at is not null,
      'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'decision_note', p.decision_note,
      'full_name', pf.full_name, 'email', pf.email,
      'identity_verified', (pf.verified is true or pf.verification_status = 'verified'),
      'is_self', p.user_id = auth.uid()
    ) order by p.submitted_at desc)
    from public.professional_profiles p
    left join public.profiles pf on pf.id = p.user_id
    where p_status is null or p.status = p_status
  ), '[]'::jsonb);
end $f$;

create or replace function public.admin_decide_professional(p_user uuid, p_decision text, p_note text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_admin uuid := auth.uid();
  cur public.professional_profiles; pf record;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_to text; v_msg text;
begin
  if v_admin is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  if not public.eb_staff_can_verify() then
    raise exception 'You do not have the role needed to review professionals.' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected','suspended','reinstated') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  if p_user = v_admin then
    raise exception 'You cannot review your own professional profile.' using errcode = '42501';
  end if;

  select * into cur from public.professional_profiles where user_id = p_user for update;
  if not found then raise exception 'Professional profile not found.' using errcode = 'P0002'; end if;

  if p_decision in ('rejected','suspended','reinstated') and (v_note is null or length(v_note) < 5) then
    raise exception 'A note of at least 5 characters is required.' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    if cur.status <> 'pending' then raise exception 'Only a pending application can be approved.' using errcode = '22023'; end if;
    select verified, verification_status into pf from public.profiles where id = p_user;
    if not found or not (pf.verified is true or pf.verification_status = 'verified') then
      raise exception 'Identity verification must be approved before the professional profile.' using errcode = '22023';
    end if;
    v_to := 'approved';
    v_msg := 'Your professional profile was approved. You can now submit property authority for new listings. Each property is still reviewed separately.';
  elsif p_decision = 'rejected' then
    if cur.status <> 'pending' then raise exception 'Only a pending application can be rejected.' using errcode = '22023'; end if;
    v_to := 'rejected';
    v_msg := 'Your professional application was not approved. Open it to see the reason and resubmit.';
  elsif p_decision = 'suspended' then
    if cur.status <> 'approved' then raise exception 'Only an approved profile can be suspended.' using errcode = '22023'; end if;
    v_to := 'suspended';
    v_msg := 'Your professional profile was suspended. Existing tenancies and applications are not affected. Contact EboHomes.';
  else -- reinstated
    if cur.status <> 'suspended' then raise exception 'Only a suspended profile can be reinstated.' using errcode = '22023'; end if;
    v_to := 'approved';
    v_msg := 'Your professional profile was reinstated.';
  end if;

  update public.professional_profiles
     set status = v_to, reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now()
   where user_id = p_user;
  insert into public.professional_events (user_id, event, from_status, to_status, actor_id, note)
  values (p_user, p_decision, cur.status, v_to, v_admin, v_note);

  begin
    perform public.audit_write('professional_' || p_decision, 'professional_profile', p_user,
      jsonb_build_object('status', cur.status), jsonb_build_object('status', v_to), v_note);
  exception when others then null; end;
  begin
    perform public.notify_user(p_user, 'Professional profile update', v_msg, '/dashboard/professional', 'general');
  exception when others then null; end;
  return v_to;
end $f$;

-- Mark the optional licence details as checked (or clear the mark). Never public.
create or replace function public.admin_mark_licence_checked(p_user uuid, p_checked boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare cur public.professional_profiles; v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  if not public.eb_staff_can_verify() then
    raise exception 'You do not have the role needed to review professionals.' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'You cannot review your own professional profile.' using errcode = '42501'; end if;
  select * into cur from public.professional_profiles where user_id = p_user for update;
  if not found then raise exception 'Professional profile not found.' using errcode = 'P0002'; end if;
  if cur.licence_number is null then raise exception 'No licence details were submitted.' using errcode = '22023'; end if;

  update public.professional_profiles
     set licence_checked_at = case when p_checked then now() end,
         licence_checked_by = case when p_checked then auth.uid() end,
         updated_at = now()
   where user_id = p_user;
  insert into public.professional_events (user_id, event, from_status, to_status, actor_id, note)
  values (p_user, case when p_checked then 'licence_checked' else 'licence_check_cleared' end, cur.status, cur.status, auth.uid(), v_note);
  begin
    perform public.audit_write('professional_licence_' || case when p_checked then 'checked' else 'cleared' end,
      'professional_profile', p_user, null, null, v_note);
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $f$;

-- History for one professional (admin)
create or replace function public.admin_professional_history(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'from_status', e.from_status,
           'to_status', e.to_status, 'actor_id', e.actor_id, 'note', e.note, 'created_at', e.created_at)
           order by e.created_at desc)
         from public.professional_events e where e.user_id = p_user), '[]'::jsonb);
end $f$;

-- 6. grants ---------------------------------------------------------------
revoke all on function
  public.professional_apply(text,text,text), public.professional_my(),
  public.admin_professionals_list(text), public.admin_decide_professional(uuid,text,text),
  public.admin_mark_licence_checked(uuid,boolean,text), public.admin_professional_history(uuid)
from public, anon;
grant execute on function
  public.professional_apply(text,text,text), public.professional_my(),
  public.admin_professionals_list(text), public.admin_decide_professional(uuid,text,text),
  public.admin_mark_licence_checked(uuid,boolean,text), public.admin_professional_history(uuid)
to authenticated;

commit;

-- CHECK (read only, after running). Expect: 2 tables, 8 functions.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('professional_profiles','professional_events')) as tables_should_be_2,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
--          ('eb_professional_status','eb_staff_can_verify','professional_apply','professional_my','admin_professionals_list',
--           'admin_decide_professional','admin_mark_licence_checked','admin_professional_history')) as functions_should_be_8;

-- ROLLBACK (only if nothing depends on it yet):
-- drop function if exists public.professional_apply(text,text,text), public.professional_my(),
--   public.admin_professionals_list(text), public.admin_decide_professional(uuid,text,text),
--   public.admin_mark_licence_checked(uuid,boolean,text), public.admin_professional_history(uuid),
--   public.eb_professional_status(uuid), public.eb_staff_can_verify(), public.eb_professional_events_immutable();
-- drop table if exists public.professional_events, public.professional_profiles;
