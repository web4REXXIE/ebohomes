-- EboHomes 20261114_01: Phase 9.2 Drop A - listing authority foundation.
-- WHAT: new tables, review functions, legacy-transition functions, and a lock on listings.authority_status.
-- DOES NOT: block, hide or unpublish anything by itself. The approval gate and re-review triggers are Drop B.
-- REQUIRES: eb_is_admin(), notify_user(), notify_admins(), audit_write() (all already in your database).
-- ROLLBACK: at the bottom.
begin;

-- 1. listing column (written only by the functions below)
alter table public.listings
  add column if not exists authority_status text not null default 'not_submitted';
alter table public.listings drop constraint if exists listings_authority_status_chk;
alter table public.listings add constraint listings_authority_status_chk
  check (authority_status in ('not_submitted','submitted','needs_evidence','accepted','rejected','on_hold'));

-- 2. tables
create table if not exists public.listing_authority_claims (
  listing_id uuid primary key references public.listings(id) on delete restrict,
  claimed_role text not null check (claimed_role in ('owner','agent','manager','company_representative','other')),
  situation text not null check (situation in ('sole_owner','co_owned','inherited','other')),
  owner_name text, owner_phone text, company_name text, company_cac text, declaration_note text,
  submitted_by uuid, submitted_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.listing_authority_documents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  uploaded_by uuid not null,
  doc_type text not null check (doc_type in ('certificate_of_occupancy','registered_deed_of_assignment','land_title_or_recognised_title_evidence','tenancy_agreement','signed_authorization_letter','company_authorization_or_appointment','other_supporting_document')),
  storage_path text not null unique,
  original_name text, mime_type text not null, size_bytes bigint not null, sha256 text not null,
  uploaded_at timestamptz not null default now(),
  withdrawn_at timestamptz, withdrawn_by uuid
);
create index if not exists listing_authority_documents_listing_idx on public.listing_authority_documents (listing_id);
create index if not exists listing_authority_documents_sha_idx on public.listing_authority_documents (sha256);

create table if not exists public.listing_document_reviews (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.listing_authority_documents(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  reviewer_id uuid not null,
  outcome text not null check (outcome in ('opened','acceptable','unclear','concern','not_relevant')),
  note text, created_at timestamptz not null default now()
);
create index if not exists listing_document_reviews_listing_idx on public.listing_document_reviews (listing_id);

create table if not exists public.listing_authority_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  decision text not null check (decision in ('submitted','accepted','rejected','needs_evidence','on_hold','reopened','kept_unchanged','legacy_unpublished')),
  reason_code text, message text, internal_note text,
  checklist jsonb, owner_contact jsonb, baseline jsonb,
  decided_by uuid, decided_at timestamptz not null default now()
);
create index if not exists listing_authority_reviews_listing_idx on public.listing_authority_reviews (listing_id, decided_at desc);

create table if not exists public.listing_authority_settings (
  id boolean primary key default true check (id),
  gps_tolerance_m numeric not null default 100,
  transition_days int not null default 30,
  transition_started_at timestamptz,
  updated_by uuid, updated_at timestamptz not null default now()
);
insert into public.listing_authority_settings (id) values (true) on conflict do nothing;

create table if not exists public.listing_authority_legacy (
  listing_id uuid primary key references public.listings(id) on delete restrict,
  listing_status_at_snapshot text, protection_at_snapshot text,
  deadline timestamptz not null, resolved_at timestamptz, resolution text,
  created_at timestamptz not null default now()
);

-- 3. row security: admins read; nobody writes directly (all writes go through the functions below)
do $$
declare t text;
begin
  foreach t in array array['listing_authority_claims','listing_authority_documents','listing_document_reviews','listing_authority_reviews','listing_authority_settings','listing_authority_legacy'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.eb_is_admin())', t || '_admin_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- 4. lock: only the functions below may change listings.authority_status
create or replace function public.listings_authority_status_lock()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or coalesce(current_setting('eb.authority_write', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    new.authority_status := 'not_submitted';
  elsif new.authority_status is distinct from old.authority_status then
    raise exception 'Authority status can only be changed through the authority review.' using errcode = '42501';
  end if;
  return new;
end $f$;
drop trigger if exists aa_listings_authority_status_lock on public.listings;
create trigger aa_listings_authority_status_lock before insert or update on public.listings
  for each row execute function public.listings_authority_status_lock();

-- 5. helpers (internal)
create or replace function public.eb_norm(p text) returns text language sql immutable
as $f$ select lower(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g')) $f$;

create or replace function public.eb_authority_missing(p_listing uuid, p_role text, p_owner_name text, p_owner_phone text, p_company_name text, p_company_cac text, p_note text)
returns text[] language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare m text[] := '{}';
  function_dummy int;
begin
  if not exists (select 1 from public.listing_authority_documents where listing_id = p_listing and withdrawn_at is null) then
    m := m || 'At least one supporting document';
  end if;
  if p_role in ('agent','manager') then
    if not exists (select 1 from public.listing_authority_documents where listing_id = p_listing and withdrawn_at is null and doc_type = 'signed_authorization_letter') then m := m || 'Signed authorization letter from the owner'; end if;
    if public.eb_norm(p_owner_name) = '' then m := m || 'Owner full name'; end if;
    if public.eb_norm(p_owner_phone) = '' then m := m || 'Owner phone number'; end if;
  elsif p_role = 'company_representative' then
    if not exists (select 1 from public.listing_authority_documents where listing_id = p_listing and withdrawn_at is null and doc_type = 'company_authorization_or_appointment') then m := m || 'Company authorization or appointment document'; end if;
    if public.eb_norm(p_company_name) = '' then m := m || 'Company name'; end if;
    if public.eb_norm(p_company_cac) = '' then m := m || 'Company CAC number'; end if;
  elsif p_role = 'other' then
    if char_length(trim(coalesce(p_note, ''))) < 10 then m := m || 'A short explanation of your relationship to the property'; end if;
  end if;
  return m;
end $f$;

create or replace function public.eb_authority_protection(p_listing uuid)
returns text language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select case
    when exists (select 1 from public.tenancies t where t.listing_id = p_listing and t.status not in ('ended','terminated','cancelled','expired','completed')) then 'active_tenancy'
    when exists (select 1 from public.applications a where a.listing_id = p_listing and a.status in ('pending','info_requested','approved')
                 and not exists (select 1 from public.tenancies t2 where t2.application_id = a.id and t2.status in ('ended','terminated','cancelled','expired','completed'))) then 'active_application'
    else null end
$f$;

create or replace function public.eb_authority_legacy_rows()
returns table (listing_id uuid, title text, status text, landlord_id uuid, deadline timestamptz, reason text)
language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select x.listing_id, x.title, x.status, x.landlord_id, x.deadline,
    case
      when x.resolved then 'resolved'
      when x.protection = 'active_tenancy' then 'protected_tenancy'
      when x.protection = 'active_application' then 'protected_application'
      when x.deadline > now() then 'not_due'
      when x.status not in ('approved','paused','inspection_required') then 'not_live'
      else 'eligible' end
  from (
    select lg.listing_id, l.title, l.status, l.landlord_id, lg.deadline,
           public.eb_authority_protection(lg.listing_id) as protection,
           (lg.resolved_at is not null or l.authority_status = 'accepted') as resolved
    from public.listing_authority_legacy lg join public.listings l on l.id = lg.listing_id
  ) x
$f$;

revoke all on function public.eb_norm(text), public.eb_authority_missing(uuid,text,text,text,text,text,text), public.eb_authority_protection(uuid), public.eb_authority_legacy_rows() from public, anon, authenticated;

-- 6. landlord functions
create or replace function public.my_listing_authority(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare l record;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select id, landlord_id, authority_status into l from public.listings where id = p_listing;
  if not found or (l.landlord_id <> auth.uid() and not public.eb_is_admin()) then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'status', l.authority_status,
    'claim', (select jsonb_build_object('claimed_role', c.claimed_role, 'situation', c.situation, 'owner_name', c.owner_name, 'owner_phone', c.owner_phone,
                'company_name', c.company_name, 'company_cac', c.company_cac, 'declaration_note', c.declaration_note, 'submitted_at', c.submitted_at)
              from public.listing_authority_claims c where c.listing_id = p_listing),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'doc_type', d.doc_type, 'name', d.original_name, 'uploaded_at', d.uploaded_at, 'withdrawn_at', d.withdrawn_at) order by d.uploaded_at)
              from public.listing_authority_documents d where d.listing_id = p_listing), '[]'::jsonb),
    'last_message', (select jsonb_build_object('message', r.message, 'decision', r.decision, 'decided_at', r.decided_at)
              from public.listing_authority_reviews r
              where r.listing_id = p_listing and r.message is not null and r.decision = l.authority_status
              order by r.decided_at desc limit 1));
end $f$;

create or replace function public.eb_authority_add_document(p_listing uuid, p_uploader uuid, p_doc_type text, p_path text, p_name text, p_mime text, p_size bigint, p_sha256 text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare l record; v_id uuid;
begin
  select id, landlord_id, authority_status into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> p_uploader then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'on_hold' then raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023'; end if;
  if p_path !~ ('^' || p_uploader::text || '/' || p_listing::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then raise exception 'Invalid evidence file.' using errcode = '22023'; end if;
  if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf') or p_size is null or p_size <= 0 or p_size > 10485760 then raise exception 'Invalid evidence file.' using errcode = '22023'; end if;
  insert into public.listing_authority_documents (listing_id, uploaded_by, doc_type, storage_path, original_name, mime_type, size_bytes, sha256)
  values (p_listing, p_uploader, p_doc_type, p_path, left(p_name, 200), p_mime, p_size, p_sha256) returning id into v_id;
  return v_id;
end $f$;

create or replace function public.withdraw_authority_document(p_document uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare d record; l record;
begin
  if auth.uid() is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select * into d from public.listing_authority_documents where id = p_document;
  if not found then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  select landlord_id, authority_status into l from public.listings where id = d.listing_id;
  if l.landlord_id <> auth.uid() then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'on_hold' then raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023'; end if;
  update public.listing_authority_documents set withdrawn_at = now(), withdrawn_by = auth.uid() where id = p_document and withdrawn_at is null;
end $f$;

create or replace function public.submit_listing_authority(p_listing uuid, p_role text, p_situation text, p_owner_name text, p_owner_phone text, p_company_name text, p_company_cac text, p_note text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_uid uuid := auth.uid();
  l record; c public.listing_authority_claims; v_had boolean; v_missing text[]; v_changed boolean; v_last timestamptz;
  v_on text; v_op text; v_cn text; v_cc text; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  if v_uid is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select id, title, landlord_id, authority_status into l from public.listings where id = p_listing for update;
  if not found or l.landlord_id <> v_uid then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'on_hold' then raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023'; end if;
  if p_role is null or p_role not in ('owner','agent','manager','company_representative','other') then raise exception 'Choose your relationship to the property.' using errcode = '22023'; end if;
  if p_situation is null or p_situation not in ('sole_owner','co_owned','inherited','other') then raise exception 'Choose the property situation.' using errcode = '22023'; end if;

  v_on := case when p_role in ('agent','manager') then nullif(left(trim(coalesce(p_owner_name, '')), 200), '') end;
  v_op := case when p_role in ('agent','manager') then nullif(left(trim(coalesce(p_owner_phone, '')), 50), '') end;
  v_cn := case when p_role = 'company_representative' then nullif(left(trim(coalesce(p_company_name, '')), 200), '') end;
  v_cc := case when p_role = 'company_representative' then nullif(left(trim(coalesce(p_company_cac, '')), 50), '') end;

  v_missing := public.eb_authority_missing(p_listing, p_role, v_on, v_op, v_cn, v_cc, v_note);
  if cardinality(v_missing) > 0 then raise exception 'Still needed: %', array_to_string(v_missing, '; ') using errcode = '22023'; end if;

  select * into c from public.listing_authority_claims where listing_id = p_listing;
  v_had := found;

  if l.authority_status = 'accepted' and v_had then
    select max(decided_at) into v_last from public.listing_authority_reviews where listing_id = p_listing and decision in ('accepted','kept_unchanged');
    v_changed := c.claimed_role <> p_role or c.situation <> p_situation
      or public.eb_norm(c.owner_name) <> public.eb_norm(v_on) or public.eb_norm(c.owner_phone) <> public.eb_norm(v_op)
      or public.eb_norm(c.company_name) <> public.eb_norm(v_cn) or public.eb_norm(c.company_cac) <> public.eb_norm(v_cc)
      or public.eb_norm(c.declaration_note) <> public.eb_norm(v_note)
      or exists (select 1 from public.listing_authority_documents d where d.listing_id = p_listing and (d.uploaded_at > v_last or d.withdrawn_at > v_last));
    if not v_changed then raise exception 'No change to send for review.' using errcode = '22023'; end if;
  end if;

  insert into public.listing_authority_claims (listing_id, claimed_role, situation, owner_name, owner_phone, company_name, company_cac, declaration_note, submitted_by)
  values (p_listing, p_role, p_situation, v_on, v_op, v_cn, v_cc, v_note, v_uid)
  on conflict (listing_id) do update set claimed_role = excluded.claimed_role, situation = excluded.situation, owner_name = excluded.owner_name,
    owner_phone = excluded.owner_phone, company_name = excluded.company_name, company_cac = excluded.company_cac,
    declaration_note = excluded.declaration_note, submitted_by = excluded.submitted_by, submitted_at = now(), updated_at = now();

  perform set_config('eb.authority_write', '1', true);
  update public.listings set authority_status = 'submitted' where id = p_listing;
  perform set_config('eb.authority_write', '', true);

  insert into public.listing_authority_reviews (listing_id, decision, decided_by) values (p_listing, 'submitted', v_uid);
  perform public.notify_admins('Authority evidence submitted', concat('Review the evidence for "', coalesce(l.title, 'a listing'), '".'), '/admin/listing-authority', 'general');
  return 'ok';
end $f$;

-- 7. admin functions
create or replace function public.admin_review_authority_document(p_document uuid, p_outcome text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare d record; v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if p_outcome is null or p_outcome not in ('acceptable','unclear','concern','not_relevant') then raise exception 'Choose an outcome for this document.' using errcode = '22023'; end if;
  select * into d from public.listing_authority_documents where id = p_document;
  if not found or d.withdrawn_at is not null then raise exception 'Document not found.' using errcode = 'P0002'; end if;
  if p_outcome in ('unclear','concern') and (v_note is null or char_length(v_note) < 5) then raise exception 'Write a short note explaining your concern.' using errcode = '22023'; end if;
  if not exists (select 1 from public.listing_document_reviews where document_id = p_document and reviewer_id = auth.uid() and outcome = 'opened') then
    raise exception 'Record an Open file first. Tap Open file, then review it.' using errcode = '22023';
  end if;
  insert into public.listing_document_reviews (document_id, listing_id, reviewer_id, outcome, note) values (p_document, d.listing_id, auth.uid(), p_outcome, v_note);
end $f$;

create or replace function public.admin_decide_listing_authority(p_listing uuid, p_decision text, p_message text default null, p_internal_note text default null, p_checklist jsonb default null, p_owner_contact jsonb default null)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  l record; v_admin uuid := auth.uid();
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_int text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_unrev int; v_bad int; v_ok int; v_baseline jsonb;
begin
  if v_admin is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('accepted','rejected','needs_evidence','on_hold') then raise exception 'Choose a decision.' using errcode = '22023'; end if;
  select id, title, landlord_id, authority_status, location_text, property_type, lat, lng into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = v_admin then raise exception 'Only an administrator other than the lister can do this.' using errcode = '42501'; end if;
  if l.authority_status not in ('submitted','needs_evidence','on_hold','accepted') then raise exception 'There is nothing to decide for this listing yet.' using errcode = '22023'; end if;
  if p_decision = l.authority_status and p_decision <> 'on_hold' then raise exception 'This listing is already %.', replace(p_decision, '_', ' ') using errcode = '22023'; end if;

  if p_decision in ('rejected','needs_evidence') and (v_msg is null or char_length(v_msg) < 5) then raise exception 'Write a message the landlord will see.' using errcode = '22023'; end if;
  if p_decision = 'on_hold' and (v_int is null or char_length(v_int) < 5) then raise exception 'Write an internal note for a hold.' using errcode = '22023'; end if;

  if p_decision = 'accepted' then
    if p_checklist is null or coalesce(p_checklist->>'documents_reviewed','') <> 'true' or coalesce(p_checklist->>'name_matches','') <> 'true'
       or coalesce(p_checklist->>'authority_established','') <> 'true' or coalesce(p_checklist->>'duplicates_checked','') <> 'true' then
      raise exception 'Tick every item in the checklist before accepting.' using errcode = '22023';
    end if;
    with latest as (
      select d.id, (select r.outcome from public.listing_document_reviews r where r.document_id = d.id and r.outcome <> 'opened' order by r.created_at desc limit 1) as outcome
      from public.listing_authority_documents d where d.listing_id = p_listing and d.withdrawn_at is null)
    select count(*) filter (where outcome is null), count(*) filter (where outcome in ('unclear','concern')), count(*) filter (where outcome = 'acceptable') into v_unrev, v_bad, v_ok from latest;
    if v_unrev > 0 then raise exception '% document(s) still need a review.', v_unrev using errcode = '22023'; end if;
    if v_bad > 0 then raise exception '% document(s) are marked unclear or a concern. Resolve them or ask for more evidence.', v_bad using errcode = '22023'; end if;
    if v_ok = 0 then raise exception 'At least one document must be marked acceptable before accepting.' using errcode = '22023'; end if;
    v_baseline := jsonb_build_object('location_text', l.location_text, 'property_type', l.property_type, 'lat', l.lat, 'lng', l.lng);
  end if;

  perform set_config('eb.authority_write', '1', true);
  update public.listings set authority_status = p_decision where id = p_listing;
  perform set_config('eb.authority_write', '', true);

  insert into public.listing_authority_reviews (listing_id, decision, message, internal_note, checklist, owner_contact, baseline, decided_by)
  values (p_listing, p_decision, v_msg, v_int, case when p_decision = 'accepted' then p_checklist end, p_owner_contact, v_baseline, v_admin);

  if p_decision = 'accepted' then
    update public.listing_authority_legacy set resolved_at = now(), resolution = 'accepted' where listing_id = p_listing and resolved_at is null;
  end if;

  perform public.audit_write('listing_authority_' || p_decision, 'listing', p_listing, jsonb_build_object('authority_status', l.authority_status), jsonb_build_object('authority_status', p_decision), v_int);

  if p_decision <> 'on_hold' then
    perform public.notify_user(l.landlord_id,
      case p_decision when 'accepted' then 'Authority reviewed' when 'rejected' then 'Authority not accepted' else 'More evidence needed' end,
      coalesce(v_msg, case p_decision when 'accepted' then 'EboHomes reviewed the evidence you sent for this property.' else 'Open your listing to see what to do next.' end),
      '/dashboard/authority/' || p_listing, 'general');
  end if;
end $f$;

create or replace function public.admin_confirm_authority_unchanged(p_listing uuid, p_reason text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare l record; v_last record; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 5 then raise exception 'A reason is required.' using errcode = '22023'; end if;
  select id, landlord_id, authority_status into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.landlord_id = auth.uid() then raise exception 'Only an administrator other than the lister can do this.' using errcode = '42501'; end if;
  select decision, reason_code into v_last from public.listing_authority_reviews where listing_id = p_listing order by decided_at desc limit 1;
  if l.authority_status <> 'submitted' or v_last.decision is distinct from 'reopened' or v_last.reason_code is distinct from 'location_text' then
    raise exception 'There is nothing to decide for this listing yet.' using errcode = '22023';
  end if;
  perform set_config('eb.authority_write', '1', true);
  update public.listings set authority_status = 'accepted' where id = p_listing;
  perform set_config('eb.authority_write', '', true);
  insert into public.listing_authority_reviews (listing_id, decision, internal_note, decided_by) values (p_listing, 'kept_unchanged', v_reason, auth.uid());
  perform public.audit_write('listing_authority_kept_unchanged', 'listing', p_listing, jsonb_build_object('authority_status','submitted'), jsonb_build_object('authority_status','accepted'), v_reason);
end $f$;

create or replace function public.admin_set_gps_tolerance(p_metres numeric, p_reason text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_old numeric; v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  if p_metres is null or p_metres < 10 or p_metres > 2000 then raise exception 'Choose a distance between 10 and 2000 metres.' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'A reason is required.' using errcode = '22023'; end if;
  select gps_tolerance_m into v_old from public.listing_authority_settings where id;
  update public.listing_authority_settings set gps_tolerance_m = p_metres, updated_by = auth.uid(), updated_at = now() where id;
  perform public.audit_write('listing_authority_gps_tolerance', 'settings', null, jsonb_build_object('metres', v_old), jsonb_build_object('metres', p_metres), v_reason);
end $f$;

-- 8. legacy transition
create or replace function public.admin_authority_start_transition()
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare s record; n int; r record;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  select * into s from public.listing_authority_settings where id for update;
  if s.transition_started_at is not null then raise exception 'The transition has already started.' using errcode = '22023'; end if;
  insert into public.listing_authority_legacy (listing_id, listing_status_at_snapshot, protection_at_snapshot, deadline)
  select l.id, l.status, coalesce(public.eb_authority_protection(l.id), 'none'), now() + make_interval(days => s.transition_days)
  from public.listings l where l.status in ('approved','paused','inspection_required') and l.authority_status <> 'accepted'
  on conflict (listing_id) do nothing;
  get diagnostics n = row_count;
  update public.listing_authority_settings set transition_started_at = now(), updated_by = auth.uid(), updated_at = now() where id;
  for r in select l.landlord_id, l.id, l.title from public.listings l join public.listing_authority_legacy g on g.listing_id = l.id where g.resolved_at is null loop
    perform public.notify_user(r.landlord_id, 'Send your property authority evidence',
      concat('Please send evidence that you may list "', coalesce(r.title, 'your property'), '" within ', s.transition_days, ' days.'), '/dashboard/authority/' || r.id, 'general');
  end loop;
  perform public.audit_write('listing_authority_transition_started', 'settings', null, null, jsonb_build_object('listings', n, 'days', s.transition_days), null);
  return format('Transition started for %s listing(s).', n);
end $f$;

create or replace function public.admin_authority_legacy_preview()
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v_ids text; v_cnt int;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  select coalesce(string_agg(listing_id::text, ',' order by listing_id), ''), count(*) into v_ids, v_cnt from public.eb_authority_legacy_rows() where reason = 'eligible';
  return jsonb_build_object(
    'eligible_count', v_cnt,
    'preview_hash', md5(v_ids || ':' || v_cnt),
    'counts', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) n from public.eb_authority_legacy_rows() group by reason) q), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('listing_id', q.listing_id, 'title', q.title, 'status', q.status, 'deadline', q.deadline, 'reason', q.reason) order by q.ord)
       from (select r.*, row_number() over (order by (r.reason = 'eligible') desc, r.deadline) as ord from public.eb_authority_legacy_rows() r where r.reason <> 'resolved') q
       where q.ord <= 200), '[]'::jsonb));
end $f$;

create or replace function public.admin_authority_run_batch(p_expected_hash text, p_expected_count int, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_ids text; v_cnt int; r record; v_done int := 0; v_prot int := 0; v_res int := 0;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only an administrator can do this.' using errcode = '42501'; end if;
  select coalesce(string_agg(listing_id::text, ',' order by listing_id), ''), count(*) into v_ids, v_cnt from public.eb_authority_legacy_rows() where reason = 'eligible';
  if md5(v_ids || ':' || v_cnt) is distinct from p_expected_hash or v_cnt is distinct from p_expected_count then
    raise exception 'The preview is out of date. Reload it and check it again.' using errcode = '22023';
  end if;
  for r in select * from public.eb_authority_legacy_rows() where reason = 'eligible' loop
    perform 1 from public.listings where id = r.listing_id for update;
    if exists (select 1 from public.listings where id = r.listing_id and authority_status = 'accepted') then v_res := v_res + 1; continue; end if;
    if public.eb_authority_protection(r.listing_id) is not null then v_prot := v_prot + 1; continue; end if;
    update public.listings set status = 'pending' where id = r.listing_id;
    update public.listing_authority_legacy set resolved_at = now(), resolution = 'unpublished' where listing_id = r.listing_id and resolved_at is null;
    insert into public.listing_authority_reviews (listing_id, decision, internal_note, decided_by) values (r.listing_id, 'legacy_unpublished', nullif(trim(coalesce(p_note, '')), ''), auth.uid());
    perform public.audit_write('listing_authority_unpublished', 'listing', r.listing_id, jsonb_build_object('status', r.status), jsonb_build_object('status', 'pending'), nullif(trim(coalesce(p_note, '')), ''));
    perform public.notify_user(r.landlord_id, 'Your listing is unpublished', concat('"', coalesce(r.title, 'Your listing'), '" is hidden until you send authority evidence and EboHomes accepts it.'), '/dashboard/authority/' || r.listing_id, 'general');
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('unpublished', v_done, 'skipped_protected', v_prot, 'skipped_resolved', v_res);
end $f$;

-- 9. who may call what
revoke all on function public.my_listing_authority(uuid), public.withdraw_authority_document(uuid),
  public.submit_listing_authority(uuid,text,text,text,text,text,text,text),
  public.admin_review_authority_document(uuid,text,text), public.admin_decide_listing_authority(uuid,text,text,text,jsonb,jsonb),
  public.admin_confirm_authority_unchanged(uuid,text), public.admin_set_gps_tolerance(numeric,text),
  public.admin_authority_start_transition(), public.admin_authority_legacy_preview(), public.admin_authority_run_batch(text,int,text)
  from public, anon;
grant execute on function public.my_listing_authority(uuid), public.withdraw_authority_document(uuid),
  public.submit_listing_authority(uuid,text,text,text,text,text,text,text),
  public.admin_review_authority_document(uuid,text,text), public.admin_decide_listing_authority(uuid,text,text,text,jsonb,jsonb),
  public.admin_confirm_authority_unchanged(uuid,text), public.admin_set_gps_tolerance(numeric,text),
  public.admin_authority_start_transition(), public.admin_authority_legacy_preview(), public.admin_authority_run_batch(text,int,text)
  to authenticated;
revoke all on function public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text) to service_role;

commit;

-- CHECK (read only): should return 6 tables, 1 settings row, and the 12 functions.
-- select (select count(*) from information_schema.tables where table_name like 'listing_authority%' or table_name = 'listing_document_reviews') as tables,
--        (select count(*) from public.listing_authority_settings) as settings_rows,
--        (select count(*) from pg_proc where proname in ('my_listing_authority','submit_listing_authority','withdraw_authority_document','eb_authority_add_document','admin_review_authority_document','admin_decide_listing_authority','admin_confirm_authority_unchanged','admin_set_gps_tolerance','admin_authority_start_transition','admin_authority_legacy_preview','admin_authority_run_batch','listings_authority_status_lock')) as functions;

-- ROLLBACK (only if you must undo, and only before any real authority data exists):
-- drop trigger if exists aa_listings_authority_status_lock on public.listings;
-- drop function if exists public.listings_authority_status_lock();
-- drop function if exists public.my_listing_authority(uuid), public.withdraw_authority_document(uuid), public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text),
--   public.submit_listing_authority(uuid,text,text,text,text,text,text,text), public.admin_review_authority_document(uuid,text,text),
--   public.admin_decide_listing_authority(uuid,text,text,text,jsonb,jsonb), public.admin_confirm_authority_unchanged(uuid,text), public.admin_set_gps_tolerance(numeric,text),
--   public.admin_authority_start_transition(), public.admin_authority_legacy_preview(), public.admin_authority_run_batch(text,int,text),
--   public.eb_authority_legacy_rows(), public.eb_authority_protection(uuid), public.eb_authority_missing(uuid,text,text,text,text,text,text), public.eb_norm(text);
-- drop table if exists public.listing_authority_legacy, public.listing_authority_settings, public.listing_authority_reviews, public.listing_document_reviews, public.listing_authority_documents, public.listing_authority_claims;
-- alter table public.listings drop column if exists authority_status;
