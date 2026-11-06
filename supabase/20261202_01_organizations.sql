-- EboHomes 20261202_01 (Phase 10.3, Step A): company (organization) identity, documents, history and review.
-- WHAT: adds organizations, organization_documents, organization_events and the functions around them.
-- NOT touched: profiles, listings, listing_authority_*, tenancies, applications, payouts, professional_*.
-- A verified company NEVER approves a property. Property authority stays a separate review (Step B links it).
-- REQUIRES: eb_is_admin(), eb_staff_can_verify(), eb_professional_status(), eb_norm(), notify_user(), notify_admins(), audit_write().
-- One transaction. Back up first.
begin;

-- 1. tables ---------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  slug text,
  name text,
  description text,
  logo_path text,
  business_email text, business_phone text, business_address text,
  public_email text, public_phone text,
  operating_locations text[] not null default '{}',
  services text[] not null default '{}',
  areas_served text[] not null default '{}',
  reg_type text check (reg_type is null or reg_type in ('rc','bn','it','other')),
  reg_number text,
  reg_number_norm text,
  rep_name text, rep_role text, rep_phone text,
  status text not null default 'draft' check (status in ('draft','pending_review','info_required','approved','rejected','suspended')),
  pending_changes jsonb,
  change_requested_at timestamptz,
  approved_at timestamptz,
  approved_without_reg_reason text,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewed_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists org_one_per_user on public.organizations (created_by);
create unique index if not exists org_slug_uq on public.organizations (slug) where slug is not null;
create index if not exists org_status_idx on public.organizations (status, submitted_at);
create index if not exists org_regnorm_idx on public.organizations (reg_number_norm) where reg_number_norm is not null;

create table if not exists public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null,
  doc_type text not null check (doc_type in ('registration_certificate','registration_status_report','representative_authorization','proof_of_address','other_supporting_document')),
  storage_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  sha256 text,
  uploaded_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  review_note text,
  reviewed_by uuid,
  reviewed_at timestamptz
);
create index if not exists org_docs_org on public.organization_documents (organization_id, uploaded_at);

create table if not exists public.organization_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event text not null,
  from_status text,
  to_status text,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists org_events_org on public.organization_events (organization_id, created_at);

create or replace function public.eb_organization_events_immutable()
returns trigger language plpgsql as $$
begin raise exception 'Organization events are append-only' using errcode = '42501'; end;
$$;
drop trigger if exists oe_immutable on public.organization_events;
create trigger oe_immutable before update or delete on public.organization_events
  for each row execute function public.eb_organization_events_immutable();

-- 2. row security: nobody signed in touches these tables directly -----------
alter table public.organizations enable row level security;
alter table public.organization_documents enable row level security;
alter table public.organization_events enable row level security;
revoke all on public.organizations, public.organization_documents, public.organization_events from anon, authenticated;

-- 3. internal helpers ---------------------------------------------------------
create or replace function public.eb_org_norm_reg(p_type text, p_num text)
returns text language plpgsql stable as $f$
declare s text := upper(regexp_replace(coalesce(p_num, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if s = '' then return null; end if;
  if p_type is null or p_type not in ('rc','bn','it','other') then
    raise exception 'Choose the type of registration number.' using errcode = '22023';
  end if;
  if p_type in ('rc','bn','it') then
    if s ~ '^[0-9]+$' then s := upper(p_type) || s; end if;
    if s !~ ('^' || upper(p_type) || '[0-9]{3,9}$') then
      raise exception 'Enter the registration number like %1234567.', upper(p_type) using errcode = '22023';
    end if;
  elsif length(s) < 3 or length(s) > 40 then
    raise exception 'The registration number looks wrong.' using errcode = '22023';
  end if;
  return s;
end $f$;

create or replace function public.eb_org_clean_list(p jsonb, p_max int, p_len int)
returns text[] language plpgsql immutable as $f$
declare r text[] := '{}'; x text; v text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return r; end if;
  for x in select jsonb_array_elements_text(p) loop
    v := left(trim(x), p_len);
    if v <> '' and not (v = any(r)) then r := r || v; end if;
    exit when cardinality(r) >= p_max;
  end loop;
  return r;
end $f$;

create or replace function public.eb_org_make_slug(p_name text)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
declare base text; s text; n int := 1;
begin
  base := trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'));
  base := left(base, 50);
  if base = '' then base := 'company'; end if;
  s := base;
  while exists (select 1 from public.organizations where slug = s) loop
    n := n + 1; s := base || '-' || n;
  end loop;
  return s;
end $f$;

revoke all on function public.eb_org_norm_reg(text,text), public.eb_org_clean_list(jsonb,int,int), public.eb_org_make_slug(text)
  from public, anon, authenticated;

-- 4. COMPANY (creator) functions ---------------------------------------------------
-- Save the company profile. Creates it on first save (status 'draft'). One company per account.
-- After approval, changes to name, registration number or logo wait for review; the approved version stays live.
create or replace function public.organization_save(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare
  v uuid := auth.uid(); pr record; o public.organizations; found_o boolean;
  v_name text := nullif(left(trim(coalesce(p->>'name', '')), 200), '');
  v_desc text := nullif(left(trim(coalesce(p->>'description', '')), 2000), '');
  v_email text := lower(nullif(left(trim(coalesce(p->>'business_email', '')), 200), ''));
  v_phone text := nullif(left(trim(coalesce(p->>'business_phone', '')), 40), '');
  v_addr text := nullif(left(trim(coalesce(p->>'business_address', '')), 400), '');
  v_pemail text := lower(nullif(left(trim(coalesce(p->>'public_email', '')), 200), ''));
  v_pphone text := nullif(left(trim(coalesce(p->>'public_phone', '')), 40), '');
  v_locs text[] := public.eb_org_clean_list(p->'operating_locations', 10, 80);
  v_svcs text[] := public.eb_org_clean_list(p->'services', 12, 60);
  v_areas text[] := public.eb_org_clean_list(p->'areas_served', 12, 80);
  v_type text := nullif(trim(coalesce(p->>'reg_type', '')), '');
  v_num text := nullif(left(trim(coalesce(p->>'reg_number', '')), 60), '');
  v_norm text;
  v_rn text := nullif(left(trim(coalesce(p->>'rep_name', '')), 200), '');
  v_rr text := nullif(left(trim(coalesce(p->>'rep_role', '')), 100), '');
  v_rp text := nullif(left(trim(coalesce(p->>'rep_phone', '')), 40), '');
  pc jsonb; v_changed boolean := false;
begin
  if v is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select role into pr from public.profiles where id = v;
  if not found or pr.role is distinct from 'landlord' then
    raise exception 'Only a lister account can register a company.' using errcode = '42501';
  end if;
  if v_type is not null and v_type not in ('rc','bn','it','other') then
    raise exception 'Choose the type of registration number.' using errcode = '22023';
  end if;
  v_norm := public.eb_org_norm_reg(v_type, v_num);
  if v_num is null then v_type := null; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The business email does not look right.' using errcode = '22023';
  end if;
  if v_pemail is not null and v_pemail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'The public email does not look right.' using errcode = '22023';
  end if;

  select * into o from public.organizations where created_by = v for update;
  found_o := found;

  if not found_o then
    if v_name is null or length(v_name) < 2 then raise exception 'Enter the company name.' using errcode = '22023'; end if;
    insert into public.organizations (created_by, name, description, business_email, business_phone, business_address,
      public_email, public_phone, operating_locations, services, areas_served, reg_type, reg_number, reg_number_norm,
      rep_name, rep_role, rep_phone)
    values (v, v_name, v_desc, v_email, v_phone, v_addr, v_pemail, v_pphone, v_locs, v_svcs, v_areas, v_type, v_num, v_norm,
      v_rn, v_rr, v_rp)
    returning * into o;
    insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
    values (o.id, 'created', null, 'draft', v);
    return jsonb_build_object('ok', true, 'status', 'draft');
  end if;

  if o.status = 'suspended' then
    raise exception 'Your company profile is suspended. Please contact EboHomes.' using errcode = '42501';
  end if;
  if o.status = 'pending_review' then
    raise exception 'EboHomes is reviewing your company. You can edit again if more information is requested.' using errcode = '22023';
  end if;
  if v_name is null or length(v_name) < 2 then raise exception 'Enter the company name.' using errcode = '22023'; end if;

  if o.status = 'approved' then
    -- name, registration type and number are material: they wait for review while the approved version stays live
    pc := coalesce(o.pending_changes, '{}'::jsonb) - 'name' - 'reg_type' - 'reg_number' - 'reg_number_norm';
    v_changed := v_name is distinct from o.name or v_norm is distinct from o.reg_number_norm or v_type is distinct from o.reg_type;
    if v_changed then
      pc := pc || jsonb_build_object('name', v_name, 'reg_type', v_type, 'reg_number', v_num, 'reg_number_norm', v_norm);
    end if;
    update public.organizations
       set description = v_desc, business_email = v_email, business_phone = v_phone, business_address = v_addr,
           public_email = v_pemail, public_phone = v_pphone, operating_locations = v_locs, services = v_svcs,
           areas_served = v_areas, rep_name = v_rn, rep_role = v_rr, rep_phone = v_rp,
           pending_changes = case when pc = '{}'::jsonb then null else pc end,
           change_requested_at = case when pc = '{}'::jsonb then null
                                      when v_changed then now() else coalesce(change_requested_at, now()) end,
           updated_at = now()
     where id = o.id;
    insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
    values (o.id, case when v_changed then 'change_requested' else 'details_updated' end, o.status, o.status, v);
    if v_changed then
      begin
        perform public.notify_admins('Company change to review', 'An approved company asked to change its name or registration details.', '/admin/organizations', 'general');
      exception when others then null; end;
    end if;
    return jsonb_build_object('ok', true, 'status', 'approved', 'change_pending', v_changed);
  end if;

  -- draft, info_required, rejected: edit directly. The person sends it with organization_submit().
  update public.organizations
     set name = v_name, description = v_desc, business_email = v_email, business_phone = v_phone, business_address = v_addr,
         public_email = v_pemail, public_phone = v_pphone, operating_locations = v_locs, services = v_svcs,
         areas_served = v_areas, reg_type = v_type, reg_number = v_num, reg_number_norm = v_norm,
         rep_name = v_rn, rep_role = v_rr, rep_phone = v_rp, updated_at = now()
   where id = o.id;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
  values (o.id, 'details_updated', o.status, o.status, v);
  return jsonb_build_object('ok', true, 'status', o.status);
end $f$;

-- Send for review
create or replace function public.organization_submit()
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v uuid := auth.uid(); o public.organizations; m text[] := '{}'; v_dup uuid;
begin
  if v is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select * into o from public.organizations where created_by = v for update;
  if not found then raise exception 'Create your company profile first.' using errcode = 'P0002'; end if;
  if o.status not in ('draft','info_required','rejected') then
    raise exception 'This cannot be sent for review right now.' using errcode = '22023';
  end if;

  if o.name is null then m := m || 'Company name'; end if;
  if o.description is null then m := m || 'Business description'; end if;
  if o.business_email is null then m := m || 'Business email'; end if;
  if o.business_phone is null then m := m || 'Business phone number'; end if;
  if o.business_address is null then m := m || 'Business address'; end if;
  if cardinality(o.operating_locations) = 0 then m := m || 'At least one operating location'; end if;
  if cardinality(o.services) = 0 then m := m || 'At least one service offered'; end if;
  if o.rep_name is null or o.rep_role is null or o.rep_phone is null then m := m || 'Primary authorized representative (name, role, phone)'; end if;
  if not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null and d.doc_type = 'representative_authorization') then
    m := m || 'Document showing the representative may act for the company';
  end if;
  if o.reg_number_norm is not null then
    if not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null and d.doc_type = 'registration_certificate') then
      m := m || 'Registration certificate';
    end if;
  elsif not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null
                     and d.doc_type in ('proof_of_address','other_supporting_document','registration_status_report')) then
    m := m || 'Supporting evidence of the business (you gave no registration number)';
  end if;
  if cardinality(m) > 0 then raise exception 'Still needed: %', array_to_string(m, '; ') using errcode = '22023'; end if;

  update public.organizations
     set status = 'pending_review', submitted_at = now(), updated_at = now()
   where id = o.id;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
  values (o.id, case when o.status = 'draft' then 'submitted' else 'resubmitted' end, o.status, 'pending_review', v);

  if o.reg_number_norm is not null then
    select x.id into v_dup from public.organizations x
     where x.reg_number_norm = o.reg_number_norm and x.id <> o.id and x.status in ('pending_review','info_required','approved','suspended') limit 1;
    if v_dup is not null then
      insert into public.organization_events (organization_id, event, actor_id, note)
      values (o.id, 'duplicate_registration_number', v, concat('same number as organization ', v_dup));
    end if;
  end if;
  begin
    perform public.notify_admins('Company application', 'A company applied for review.', '/admin/organizations', 'general');
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'status', 'pending_review');
end $f$;

-- Own company (the creator sees the private details, never reviewer ids)
create or replace function public.organization_my()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
declare v uuid := auth.uid(); o public.organizations;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select * into o from public.organizations where created_by = v;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'id', o.id, 'status', o.status, 'slug', o.slug, 'name', o.name,
    'description', o.description, 'has_logo', o.logo_path is not null,
    'business_email', o.business_email, 'business_phone', o.business_phone, 'business_address', o.business_address,
    'public_email', o.public_email, 'public_phone', o.public_phone,
    'operating_locations', to_jsonb(o.operating_locations), 'services', to_jsonb(o.services), 'areas_served', to_jsonb(o.areas_served),
    'reg_type', o.reg_type, 'reg_number', o.reg_number,
    'rep_name', o.rep_name, 'rep_role', o.rep_role, 'rep_phone', o.rep_phone,
    'change_pending', o.pending_changes is not null,
    'pending_name', o.pending_changes->>'name', 'pending_reg_number', o.pending_changes->>'reg_number',
    'pending_logo', (o.pending_changes ? 'logo_path'),
    'submitted_at', o.submitted_at, 'reviewed_at', o.reviewed_at,
    'decision_note', case when o.status in ('rejected','info_required','suspended') then o.decision_note end,
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'name', d.original_name,
        'uploaded_at', d.uploaded_at, 'withdrawn_at', d.withdrawn_at, 'status', d.status,
        'reason', case when d.status = 'rejected' then d.review_note end) order by d.uploaded_at)
      from public.organization_documents d where d.organization_id = o.id), '[]'::jsonb));
end $f$;

create or replace function public.organization_withdraw_document(p_doc uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare v uuid := auth.uid(); d public.organization_documents; o public.organizations;
begin
  if v is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select * into d from public.organization_documents where id = p_doc for update;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  select * into o from public.organizations where id = d.organization_id;
  if o.created_by <> v then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if o.status in ('pending_review','suspended') then
    raise exception 'You cannot change documents while EboHomes has this company.' using errcode = '22023';
  end if;
  if d.withdrawn_at is not null then return jsonb_build_object('ok', true); end if;
  update public.organization_documents set withdrawn_at = now() where id = p_doc;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (o.id, 'document_withdrawn', o.status, o.status, v, d.doc_type);
  return jsonb_build_object('ok', true);
end $f$;

-- 5. INTERNAL functions for the upload routes (service key only) --------------------
create or replace function public.eb_organization_add_document(p_org uuid, p_uploader uuid, p_doc_type text, p_path text,
  p_name text, p_mime text, p_size bigint, p_sha256 text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare o public.organizations; v_id uuid;
begin
  select * into o from public.organizations where id = p_org for update;
  if not found or o.created_by <> p_uploader then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if o.status in ('pending_review','suspended') then
    raise exception 'You cannot add documents while EboHomes has this company.' using errcode = '22023';
  end if;
  if (select count(*) from public.organization_documents where organization_id = p_org and withdrawn_at is null) >= 12 then
    raise exception 'Too many documents. Withdraw one first.' using errcode = '22023';
  end if;
  insert into public.organization_documents (organization_id, uploaded_by, doc_type, storage_path, original_name, mime_type, size_bytes, sha256)
  values (p_org, p_uploader, p_doc_type, p_path, left(p_name, 200), p_mime, p_size, p_sha256)
  returning id into v_id;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (p_org, 'document_added', o.status, o.status, p_uploader, p_doc_type);
  return v_id;
end $f$;

create or replace function public.eb_organization_set_logo(p_org uuid, p_uploader uuid, p_path text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare o public.organizations;
begin
  select * into o from public.organizations where id = p_org for update;
  if not found or o.created_by <> p_uploader then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if o.status in ('pending_review','suspended') then
    raise exception 'You cannot change the logo while EboHomes has this company.' using errcode = '22023';
  end if;
  if o.status = 'approved' then
    -- the approved logo stays live until an administrator approves the new one
    update public.organizations
       set pending_changes = coalesce(pending_changes, '{}'::jsonb) || jsonb_build_object('logo_path', p_path),
           change_requested_at = coalesce(change_requested_at, now()), updated_at = now()
     where id = p_org;
    insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
    values (p_org, 'change_requested', o.status, o.status, p_uploader);
    begin
      perform public.notify_admins('Company change to review', 'An approved company uploaded a new logo.', '/admin/organizations', 'general');
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'pending', true);
  end if;
  update public.organizations set logo_path = p_path, updated_at = now() where id = p_org;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id)
  values (p_org, 'logo_updated', o.status, o.status, p_uploader);
  return jsonb_build_object('ok', true, 'pending', false);
end $f$;

-- 6. ADMIN functions ------------------------------------------------------------------
create or replace function public.admin_organizations_list(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'status', o.status, 'reg_type', o.reg_type, 'reg_number', o.reg_number,
      'submitted_at', o.submitted_at, 'creator_name', pf.full_name, 'creator_email', pf.email,
      'identity_verified', (pf.verified is true or pf.verification_status = 'verified'),
      'is_self', o.created_by = auth.uid(),
      'docs_pending', (select count(*) from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null and d.status = 'pending'),
      'duplicate_reg', o.reg_number_norm is not null and exists (select 1 from public.organizations x where x.id <> o.id
          and x.reg_number_norm = o.reg_number_norm and x.status in ('pending_review','info_required','approved','suspended')),
      'similar_name', o.name is not null and exists (select 1 from public.organizations x where x.id <> o.id
          and public.eb_norm(x.name) = public.eb_norm(o.name) and x.status <> 'draft'),
      'change_pending', o.pending_changes is not null
    ) order by o.submitted_at desc nulls last)
    from public.organizations o
    left join public.profiles pf on pf.id = o.created_by
    where case when p_status is null then o.status <> 'draft'
               when p_status = 'changes' then o.status = 'approved' and o.pending_changes is not null
               else o.status = p_status end
  ), '[]'::jsonb);
end $f$;

create or replace function public.admin_organization_detail(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
declare o public.organizations; pf record;
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only an administrator can do this.' using errcode = '42501';
  end if;
  select * into o from public.organizations where id = p_id;
  if not found then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  select full_name, email, phone, verified, verification_status into pf from public.profiles where id = o.created_by;
  return jsonb_build_object('id', o.id, 'status', o.status, 'slug', o.slug, 'name', o.name, 'description', o.description,
    'logo_path', o.logo_path, 'pending_logo_path', o.pending_changes->>'logo_path',
    'business_email', o.business_email, 'business_phone', o.business_phone, 'business_address', o.business_address,
    'public_email', o.public_email, 'public_phone', o.public_phone,
    'operating_locations', to_jsonb(o.operating_locations), 'services', to_jsonb(o.services), 'areas_served', to_jsonb(o.areas_served),
    'reg_type', o.reg_type, 'reg_number', o.reg_number,
    'rep_name', o.rep_name, 'rep_role', o.rep_role, 'rep_phone', o.rep_phone,
    'pending_changes', o.pending_changes, 'change_requested_at', o.change_requested_at,
    'approved_without_reg_reason', o.approved_without_reg_reason, 'decision_note', o.decision_note,
    'submitted_at', o.submitted_at, 'reviewed_at', o.reviewed_at,
    'creator', jsonb_build_object('name', pf.full_name, 'email', pf.email, 'phone', pf.phone,
        'identity_verified', (pf.verified is true or pf.verification_status = 'verified'),
        'professional_status', public.eb_professional_status(o.created_by)),
    'is_self', o.created_by = auth.uid(),
    'duplicate_reg', o.reg_number_norm is not null and exists (select 1 from public.organizations x where x.id <> o.id
        and x.reg_number_norm = o.reg_number_norm and x.status in ('pending_review','info_required','approved','suspended')),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'name', d.original_name,
        'uploaded_at', d.uploaded_at, 'withdrawn_at', d.withdrawn_at, 'status', d.status, 'note', d.review_note) order by d.uploaded_at)
      from public.organization_documents d where d.organization_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('event', e.event, 'from_status', e.from_status, 'to_status', e.to_status,
        'note', e.note, 'created_at', e.created_at) order by e.created_at desc)
      from public.organization_events e where e.organization_id = o.id), '[]'::jsonb));
end $f$;

-- Path of one document, for the admin route. Every call is recorded as 'document_opened'.
create or replace function public.admin_organization_document_path(p_doc uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare d public.organization_documents; o public.organizations;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_verify() then raise exception 'You do not have the role needed to review companies.' using errcode = '42501'; end if;
  select * into d from public.organization_documents where id = p_doc;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  select * into o from public.organizations where id = d.organization_id;
  if o.created_by = auth.uid() then raise exception 'You cannot review your own company.' using errcode = '42501'; end if;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (o.id, 'document_opened', o.status, o.status, auth.uid(), d.doc_type);
  return d.storage_path;
end $f$;

create or replace function public.admin_review_organization_document(p_doc uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare d public.organization_documents; o public.organizations; v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_verify() then raise exception 'You do not have the role needed to review companies.' using errcode = '42501'; end if;
  if p_decision not in ('accepted','rejected') then raise exception 'Unknown decision.' using errcode = '22023'; end if;
  if p_decision = 'rejected' and (v_note is null or length(v_note) < 5) then
    raise exception 'A reason of at least 5 characters is required.' using errcode = '22023';
  end if;
  select * into d from public.organization_documents where id = p_doc for update;
  if not found or d.withdrawn_at is not null then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  select * into o from public.organizations where id = d.organization_id;
  if o.created_by = auth.uid() then raise exception 'You cannot review your own company.' using errcode = '42501'; end if;
  if o.status not in ('pending_review','approved') then
    raise exception 'Documents can only be reviewed while the company is under review or approved.' using errcode = '22023';
  end if;
  update public.organization_documents
     set status = p_decision, review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_doc;
  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (o.id, 'document_' || p_decision, o.status, o.status, auth.uid(), concat(d.doc_type, case when v_note is not null then ': ' || v_note end));
  begin
    perform public.audit_write('organization_document_' || p_decision, 'organization', o.id, null,
      jsonb_build_object('doc_type', d.doc_type), v_note);
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $f$;

-- Decide the application: approved | rejected | info_required | suspended | reinstated
create or replace function public.admin_decide_organization(p_id uuid, p_decision text, p_note text default null, p_reg_exception_reason text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare
  v_admin uuid := auth.uid(); o public.organizations; pf record;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_exc text := nullif(left(trim(coalesce(p_reg_exception_reason, '')), 1000), '');
  v_to text; v_msg text; v_slug text;
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_verify() then raise exception 'You do not have the role needed to review companies.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected','info_required','suspended','reinstated') then
    raise exception 'Unknown decision.' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_id for update;
  if not found then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if o.created_by = v_admin then raise exception 'You cannot review your own company.' using errcode = '42501'; end if;
  if p_decision <> 'approved' and (v_note is null or length(v_note) < 5) then
    raise exception 'A note of at least 5 characters is required.' using errcode = '22023';
  end if;

  if p_decision = 'approved' then
    if o.status <> 'pending_review' then raise exception 'Only an application under review can be approved.' using errcode = '22023'; end if;
    select verified, verification_status into pf from public.profiles where id = o.created_by;
    if not found or not (pf.verified is true or pf.verification_status = 'verified') then
      raise exception 'The person who registered the company must have verified identity first.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null
                    and d.doc_type = 'representative_authorization' and d.status = 'accepted') then
      raise exception 'Accept the document showing the representative may act for the company first.' using errcode = '22023';
    end if;
    if o.reg_number_norm is not null then
      if not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null
                      and d.doc_type = 'registration_certificate' and d.status = 'accepted') then
        raise exception 'Accept the registration certificate first.' using errcode = '22023';
      end if;
      if exists (select 1 from public.organizations x where x.id <> o.id and x.reg_number_norm = o.reg_number_norm and x.status in ('approved','suspended')) then
        raise exception 'Another approved company already uses this registration number. Resolve that first.' using errcode = '22023';
      end if;
    else
      if v_exc is null or length(v_exc) < 10 then
        raise exception 'This company gave no registration number. Record why you are approving it anyway (10+ characters).' using errcode = '22023';
      end if;
      if not exists (select 1 from public.organization_documents d where d.organization_id = o.id and d.withdrawn_at is null
                      and d.doc_type in ('proof_of_address','other_supporting_document','registration_status_report') and d.status = 'accepted') then
        raise exception 'Accept at least one supporting document of the business first.' using errcode = '22023';
      end if;
    end if;
    v_slug := coalesce(o.slug, public.eb_org_make_slug(o.name));
    v_to := 'approved';
    v_msg := 'Your company was approved. This does not approve any property. Each property is still reviewed separately.';
    update public.organizations
       set status = 'approved', slug = v_slug, approved_at = coalesce(approved_at, now()),
           approved_without_reg_reason = case when o.reg_number_norm is null then v_exc end,
           reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now()
     where id = o.id;
  elsif p_decision = 'rejected' then
    if o.status <> 'pending_review' then raise exception 'Only an application under review can be rejected.' using errcode = '22023'; end if;
    v_to := 'rejected';
    v_msg := 'Your company application was not approved. Open it to see the reason and send it again.';
    update public.organizations set status = v_to, reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now() where id = o.id;
  elsif p_decision = 'info_required' then
    if o.status <> 'pending_review' then raise exception 'Only an application under review can be sent back.' using errcode = '22023'; end if;
    v_to := 'info_required';
    v_msg := 'EboHomes needs more information about your company. Open it to see what is needed.';
    update public.organizations set status = v_to, reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now() where id = o.id;
  elsif p_decision = 'suspended' then
    if o.status <> 'approved' then raise exception 'Only an approved company can be suspended.' using errcode = '22023'; end if;
    v_to := 'suspended';
    v_msg := 'Your company profile was suspended. Existing tenancies and applications are not affected. Contact EboHomes.';
    update public.organizations set status = v_to, reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now() where id = o.id;
  else
    if o.status <> 'suspended' then raise exception 'Only a suspended company can be reinstated.' using errcode = '22023'; end if;
    v_to := 'approved';
    v_msg := 'Your company profile was reinstated.';
    update public.organizations set status = v_to, reviewed_by = v_admin, reviewed_at = now(), decision_note = v_note, updated_at = now() where id = o.id;
  end if;

  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (o.id, p_decision, o.status, v_to, v_admin, coalesce(v_note, v_exc));
  begin
    perform public.audit_write('organization_' || p_decision, 'organization', o.id,
      jsonb_build_object('status', o.status), jsonb_build_object('status', v_to), coalesce(v_note, v_exc));
  exception when others then null; end;
  begin
    perform public.notify_user(o.created_by, 'Company update', v_msg, '/dashboard/company', 'general');
  exception when others then null; end;
  return v_to;
end $f$;

-- Decide a pending change (name, registration number or logo) on an approved company
create or replace function public.admin_decide_organization_change(p_id uuid, p_decision text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $f$
declare
  v_admin uuid := auth.uid(); o public.organizations; pc jsonb;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
  v_name text; v_type text; v_num text; v_norm text; v_logo text;
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if not public.eb_staff_can_verify() then raise exception 'You do not have the role needed to review companies.' using errcode = '42501'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Unknown decision.' using errcode = '22023'; end if;
  if v_note is null or length(v_note) < 10 then
    raise exception 'Write a note of at least 10 characters about the evidence you checked.' using errcode = '22023';
  end if;
  select * into o from public.organizations where id = p_id for update;
  if not found then raise exception 'Company not found.' using errcode = 'P0002'; end if;
  if o.created_by = v_admin then raise exception 'You cannot review your own company.' using errcode = '42501'; end if;
  if o.status <> 'approved' or o.pending_changes is null then raise exception 'There is no change waiting for review.' using errcode = '22023'; end if;
  pc := o.pending_changes;

  if p_decision = 'approved' then
    v_name := case when pc ? 'name' then pc->>'name' else o.name end;
    v_type := case when pc ? 'reg_type' then pc->>'reg_type' else o.reg_type end;
    v_num := case when pc ? 'reg_number' then pc->>'reg_number' else o.reg_number end;
    v_norm := case when pc ? 'reg_number_norm' then pc->>'reg_number_norm' else o.reg_number_norm end;
    v_logo := case when pc ? 'logo_path' then pc->>'logo_path' else o.logo_path end;
    if v_norm is not null and exists (select 1 from public.organizations x where x.id <> o.id and x.reg_number_norm = v_norm and x.status in ('approved','suspended')) then
      raise exception 'Another approved company already uses this registration number.' using errcode = '22023';
    end if;
    update public.organizations
       set name = v_name, reg_type = v_type, reg_number = v_num, reg_number_norm = v_norm, logo_path = v_logo,
           approved_without_reg_reason = case when v_norm is null then coalesce(approved_without_reg_reason, v_note) else approved_without_reg_reason end,
           pending_changes = null, change_requested_at = null, reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
     where id = o.id;
  else
    update public.organizations
       set pending_changes = null, change_requested_at = null, reviewed_by = v_admin, reviewed_at = now(), updated_at = now()
     where id = o.id;
  end if;

  insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
  values (o.id, 'change_' || p_decision, o.status, o.status, v_admin, v_note);
  begin
    perform public.audit_write('organization_change_' || p_decision, 'organization', o.id, pc, null, v_note);
  exception when others then null; end;
  begin
    perform public.notify_user(o.created_by, 'Company update',
      case when p_decision = 'approved' then 'Your requested company changes were approved.' else 'Your requested company changes were not approved. ' || v_note end,
      '/dashboard/company', 'general');
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $f$;

-- 7. grants ------------------------------------------------------------------------------
revoke all on function
  public.organization_save(jsonb), public.organization_submit(), public.organization_my(), public.organization_withdraw_document(uuid),
  public.admin_organizations_list(text), public.admin_organization_detail(uuid), public.admin_organization_document_path(uuid),
  public.admin_review_organization_document(uuid,text,text), public.admin_decide_organization(uuid,text,text,text),
  public.admin_decide_organization_change(uuid,text,text)
from public, anon;
grant execute on function
  public.organization_save(jsonb), public.organization_submit(), public.organization_my(), public.organization_withdraw_document(uuid),
  public.admin_organizations_list(text), public.admin_organization_detail(uuid), public.admin_organization_document_path(uuid),
  public.admin_review_organization_document(uuid,text,text), public.admin_decide_organization(uuid,text,text,text),
  public.admin_decide_organization_change(uuid,text,text)
to authenticated;

revoke all on function
  public.eb_organization_add_document(uuid,uuid,text,text,text,text,bigint,text), public.eb_organization_set_logo(uuid,uuid,text)
from public, anon, authenticated;
grant execute on function
  public.eb_organization_add_document(uuid,uuid,text,text,text,text,bigint,text), public.eb_organization_set_logo(uuid,uuid,text)
to service_role;

commit;

-- CHECK (read only, after running). Expect: 3 tables, 14 functions, 1 trigger.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('organizations','organization_documents','organization_events')) as tables_should_be_3,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
--          ('eb_org_norm_reg','eb_org_clean_list','eb_org_make_slug','organization_save','organization_submit','organization_my',
--           'organization_withdraw_document','eb_organization_add_document','eb_organization_set_logo','admin_organizations_list',
--           'admin_organization_detail','admin_organization_document_path','admin_review_organization_document',
--           'admin_decide_organization','admin_decide_organization_change')) as functions_should_be_15,
--        (select count(*) from pg_trigger where not tgisinternal and tgname = 'oe_immutable') as trigger_should_be_1;

-- ROLLBACK (only if nothing depends on it yet):
-- drop table if exists public.organization_events, public.organization_documents, public.organizations;
-- drop function if exists public.eb_org_norm_reg(text,text), public.eb_org_clean_list(jsonb,int,int), public.eb_org_make_slug(text),
--   public.organization_save(jsonb), public.organization_submit(), public.organization_my(), public.organization_withdraw_document(uuid),
--   public.eb_organization_add_document(uuid,uuid,text,text,text,text,bigint,text), public.eb_organization_set_logo(uuid,uuid,text),
--   public.admin_organizations_list(text), public.admin_organization_detail(uuid), public.admin_organization_document_path(uuid),
--   public.admin_review_organization_document(uuid,text,text), public.admin_decide_organization(uuid,text,text,text),
--   public.admin_decide_organization_change(uuid,text,text), public.eb_organization_events_immutable();
