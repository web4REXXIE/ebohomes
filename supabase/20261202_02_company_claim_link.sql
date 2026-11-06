-- EboHomes 20261202_02 (Phase 10.3, Step B): link a company claim to an approved company + public company profile data.
-- REQUIRES: 20261202_01_organizations.sql already run (and all of Phase 10.2).
-- WHAT:
--   1. listing_authority_claims.organization_id (nullable). Nothing is added to listings.
--   2. submit_listing_authority(): same function as 20261201_02, plus the company rule:
--        - a company_representative claim must come from the sender's OWN APPROVED company; the name and registration
--          number are copied from the company, not typed;
--        - a claim without a company is still accepted only while the listing's legacy transition has not ended;
--        - the property-specific "company authorization or appointment" document is still required. A verified company
--          never approves a property, and authority review runs exactly as before.
--   3. public_company(slug): public data of an APPROVED company only. No table is readable directly.
--   4. eb_public_company_logo_path(slug): internal, service key only, for the logo route in Step C.
-- NOT touched: listings, authority_status, reviews, tenancies, applications, payouts, the 10.2 gate itself.
-- Suspending a company never changes a listing or an accepted claim (no expiry or revocation until Phase 10.5).
-- One transaction. Back up first.
begin;

alter table public.listing_authority_claims
  add column if not exists organization_id uuid references public.organizations(id);
create index if not exists lac_organization on public.listing_authority_claims (organization_id) where organization_id is not null;

create or replace function public.submit_listing_authority(p_listing uuid, p_role text, p_situation text, p_owner_name text, p_owner_phone text, p_company_name text, p_company_cac text, p_note text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_uid uuid := auth.uid();
  l record; c public.listing_authority_claims; v_had boolean; v_missing text[]; v_changed boolean; v_last timestamptz;
  v_gate text; v_on text; v_op text; v_cn text; v_cc text; v_org public.organizations; v_orgid uuid; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
begin
  if v_uid is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select id, title, landlord_id, authority_status into l from public.listings where id = p_listing for update;
  if not found or l.landlord_id <> v_uid then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'submitted' then raise exception 'Already sent. EboHomes is reviewing this listing.' using errcode = '22023'; end if;
  if l.authority_status = 'on_hold' then raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023'; end if;
  if p_role is null or p_role not in ('owner','agent','manager','company_representative','other') then raise exception 'Choose your relationship to the property.' using errcode = '22023'; end if;
  if p_situation is null or p_situation not in ('sole_owner','co_owned','inherited','other') then raise exception 'Choose the property situation.' using errcode = '22023'; end if;


  -- Phase 10.2 gate: agents, managers and company representatives need an approved professional profile.
  v_gate := public.eb_authority_professional_gate(p_listing, v_uid, p_role);
  if v_gate = 'blocked_none' then
    raise exception 'Apply for a professional profile before sending this for review. Your draft is kept.' using errcode = '42501';
  elsif v_gate = 'blocked_pending' then
    raise exception 'Your professional profile is still being reviewed. You can keep editing your draft, but it can only be sent after approval.' using errcode = '42501';
  elsif v_gate = 'blocked_rejected' then
    raise exception 'Your professional application was not approved, so this cannot be sent for review. Update your application first.' using errcode = '42501';
  elsif v_gate = 'blocked_suspended' then
    raise exception 'Your professional profile is suspended. Please contact EboHomes.' using errcode = '42501';
  end if;

  v_on := case when p_role in ('agent','manager') then nullif(left(trim(coalesce(p_owner_name, '')), 200), '') end;
  v_op := case when p_role in ('agent','manager') then nullif(left(trim(coalesce(p_owner_phone, '')), 50), '') end;
  v_cn := case when p_role = 'company_representative' then nullif(left(trim(coalesce(p_company_name, '')), 200), '') end;
  v_cc := case when p_role = 'company_representative' then nullif(left(trim(coalesce(p_company_cac, '')), 50), '') end;

  -- Phase 10.3: a company claim must come from the person's own APPROVED company.
  -- Existing free-text company claims may still be sent while the listing's legacy transition has not ended.
  if p_role = 'company_representative' then
    select * into v_org from public.organizations where created_by = v_uid;
    if found and v_org.status = 'approved' then
      v_orgid := v_org.id;
      v_cn := v_org.name;
      v_cc := v_org.reg_number_norm;
    elsif found and v_org.status = 'suspended' then
      raise exception 'Your company profile is suspended. Please contact EboHomes. Your draft is kept.' using errcode = '42501';
    elsif v_gate = 'legacy_exemption' then
      v_orgid := null;
    elsif found then
      raise exception 'Your company is not approved yet. Once EboHomes approves it you can send this claim. Your draft is kept.' using errcode = '42501';
    else
      raise exception 'To act for a company, register it and wait for approval first. Your draft is kept.' using errcode = '42501';
    end if;
  end if;

  v_missing := public.eb_authority_missing(p_listing, p_role, v_on, v_op, v_cn,
    case when v_orgid is not null then coalesce(v_cc, 'none') else v_cc end, v_note);
  if cardinality(v_missing) > 0 then raise exception 'Still needed: %', array_to_string(v_missing, '; ') using errcode = '22023'; end if;

  select * into c from public.listing_authority_claims where listing_id = p_listing;
  v_had := found;

  if l.authority_status = 'accepted' and v_had then
    select max(decided_at) into v_last from public.listing_authority_reviews where listing_id = p_listing and decision in ('accepted','kept_unchanged');
    v_changed := c.claimed_role <> p_role or c.situation <> p_situation
      or public.eb_norm(c.owner_name) <> public.eb_norm(v_on) or public.eb_norm(c.owner_phone) <> public.eb_norm(v_op)
      or public.eb_norm(c.company_name) <> public.eb_norm(v_cn) or public.eb_norm(c.company_cac) <> public.eb_norm(v_cc)
      or public.eb_norm(c.declaration_note) <> public.eb_norm(v_note)
      or c.organization_id is distinct from v_orgid
      or exists (select 1 from public.listing_authority_documents d where d.listing_id = p_listing and (d.uploaded_at > v_last or d.withdrawn_at > v_last));
    if not v_changed then raise exception 'No change to send for review.' using errcode = '22023'; end if;
  end if;

  insert into public.listing_authority_claims (listing_id, claimed_role, situation, owner_name, owner_phone, company_name, company_cac, declaration_note, submitted_by, organization_id)
  values (p_listing, p_role, p_situation, v_on, v_op, v_cn, v_cc, v_note, v_uid, v_orgid)
  on conflict (listing_id) do update set claimed_role = excluded.claimed_role, situation = excluded.situation, owner_name = excluded.owner_name,
    owner_phone = excluded.owner_phone, company_name = excluded.company_name, company_cac = excluded.company_cac,
    declaration_note = excluded.declaration_note, submitted_by = excluded.submitted_by, organization_id = excluded.organization_id,
    submitted_at = now(), updated_at = now();

  perform set_config('eb.authority_write', '1', true);
  update public.listings set authority_status = 'submitted' where id = p_listing;
  perform set_config('eb.authority_write', '', true);

  insert into public.listing_authority_reviews (listing_id, decision, decided_by) values (p_listing, 'submitted', v_uid);
  delete from public.listing_authority_claim_drafts where listing_id = p_listing;
  if v_gate <> 'not_required' then
    insert into public.professional_events (user_id, event, from_status, to_status, actor_id, note)
    values (v_uid, 'authority_submitted', public.eb_professional_status(v_uid), public.eb_professional_status(v_uid), v_uid,
            concat('listing ', p_listing, '; basis ', v_gate));
  end if;
  if v_orgid is not null then
    insert into public.organization_events (organization_id, event, from_status, to_status, actor_id, note)
    values (v_orgid, 'claim_submitted', v_org.status, v_org.status, v_uid, concat('listing ', p_listing));
  end if;
  perform public.notify_admins('Authority evidence submitted', concat('Review the evidence for "', coalesce(l.title, 'a listing'), '".'), '/admin/listing-authority', 'general');
  return 'ok';
end $f$;

-- Public data for an approved company. Private details (business email, phone, address, registration number,
-- representative, documents) are never returned. Public contact fields are only what the company chose to publish.
create or replace function public.public_company(p_slug text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp' as $f$
declare o public.organizations;
begin
  if p_slug is null or length(p_slug) > 80 then return null; end if;
  select * into o from public.organizations where slug = lower(trim(p_slug)) and status = 'approved';
  if not found then return null; end if;
  return jsonb_build_object('name', o.name, 'slug', o.slug, 'description', o.description,
    'operating_locations', to_jsonb(o.operating_locations), 'services', to_jsonb(o.services),
    'areas_served', to_jsonb(o.areas_served), 'public_email', o.public_email, 'public_phone', o.public_phone,
    'has_logo', o.logo_path is not null, 'verified', true, 'approved_at', o.approved_at);
end $f$;

create or replace function public.eb_public_company_logo_path(p_slug text)
returns text language sql stable security definer set search_path to 'public','pg_temp' as $f$
  select o.logo_path from public.organizations o where o.slug = lower(trim(p_slug)) and o.status = 'approved'
$f$;

revoke all on function public.public_company(text), public.eb_public_company_logo_path(text) from public, anon, authenticated;
grant execute on function public.public_company(text) to anon, authenticated;
grant execute on function public.eb_public_company_logo_path(text) to service_role;

commit;

-- CHECK (read only, after running). Expect: 1 column, 2 functions, submit function mentions organizations.
-- select (select count(*) from information_schema.columns where table_schema='public' and table_name='listing_authority_claims' and column_name='organization_id') as column_should_be_1,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('public_company','eb_public_company_logo_path')) as functions_should_be_2,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='submit_listing_authority' and prosrc like '%organizations%') as submit_updated_should_be_1,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='submit_listing_authority') as submit_overloads_should_be_1;

-- ROLLBACK (restores the 10.2 submit function by re-running 20261201_02_professional_gate_and_drafts.sql section 3):
-- drop function if exists public.public_company(text), public.eb_public_company_logo_path(text);
-- alter table public.listing_authority_claims drop column if exists organization_id;
