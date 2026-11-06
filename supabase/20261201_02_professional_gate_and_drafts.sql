-- EboHomes 20261201_02 (Phase 10.2, Step B): server-side professional gate + draft authority claims.
-- REQUIRES: 20261201_01_professional_profiles.sql already run.
-- WHAT:
--   1. New table listing_authority_claim_drafts: saved, editable draft claims. A draft is NOT a claim:
--      it never touches listing_authority_claims, listings.authority_status, reviews or any public view.
--   2. eb_authority_professional_gate(): one rule used by both the submit function and the UI check.
--   3. submit_listing_authority(): same function as 20261115_02, plus the gate and the draft clean-up.
--   4. save_authority_draft(), my_authority_draft(), authority_submit_eligibility(), professional_log_blocked_submit().
-- RULES:
--   - owner / other claims are not gated (unchanged).
--   - agent / manager / company_representative claims: allowed if the profile is approved,
--     OR the listing has an unresolved legacy row whose deadline has not passed AND the profile is not rejected/suspended.
--   - rejected and suspended profiles are always blocked. Pending and no-profile are blocked after the deadline too.
--   - The gate only blocks SUBMISSION. It never changes a listing, tenancy or application. Protected listings stay live.
--   - Approval of a professional never sets authority_status.
-- One transaction. Back up first.
begin;

-- 1. drafts ------------------------------------------------------------------
create table if not exists public.listing_authority_claim_drafts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  saved_by uuid not null,
  claimed_role text check (claimed_role in ('owner','agent','manager','company_representative','other')),
  situation text check (situation in ('sole_owner','co_owned','inherited','other')),
  owner_name text, owner_phone text, company_name text, company_cac text, declaration_note text,
  updated_at timestamptz not null default now()
);
alter table public.listing_authority_claim_drafts enable row level security;
revoke all on public.listing_authority_claim_drafts from anon, authenticated;

-- 2. the gate (internal) -------------------------------------------------------
-- Returns: not_required | approved | legacy_exemption | blocked_none | blocked_pending | blocked_rejected | blocked_suspended
create or replace function public.eb_authority_professional_gate(p_listing uuid, p_user uuid, p_role text)
returns text language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare s text; in_legacy boolean;
begin
  if p_role is null or p_role not in ('agent','manager','company_representative') then return 'not_required'; end if;
  s := public.eb_professional_status(p_user);
  if s = 'approved' then return 'approved'; end if;
  if s = 'rejected' then return 'blocked_rejected'; end if;
  if s = 'suspended' then return 'blocked_suspended'; end if;
  select exists (select 1 from public.listing_authority_legacy g
                  where g.listing_id = p_listing and g.resolved_at is null and g.deadline > now()) into in_legacy;
  if in_legacy then return 'legacy_exemption'; end if;
  return case when s = 'pending' then 'blocked_pending' else 'blocked_none' end;
end $f$;
revoke all on function public.eb_authority_professional_gate(uuid,uuid,text) from public, anon, authenticated;

-- 3. submit (same as 20261115_02 + gate + draft clean-up) ----------------------------
create or replace function public.submit_listing_authority(p_listing uuid, p_role text, p_situation text, p_owner_name text, p_owner_phone text, p_company_name text, p_company_cac text, p_note text)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_uid uuid := auth.uid();
  l record; c public.listing_authority_claims; v_had boolean; v_missing text[]; v_changed boolean; v_last timestamptz;
  v_gate text; v_on text; v_op text; v_cn text; v_cc text; v_note text := nullif(left(trim(coalesce(p_note, '')), 1000), '');
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
  delete from public.listing_authority_claim_drafts where listing_id = p_listing;
  if v_gate <> 'not_required' then
    insert into public.professional_events (user_id, event, from_status, to_status, actor_id, note)
    values (v_uid, 'authority_submitted', public.eb_professional_status(v_uid), public.eb_professional_status(v_uid), v_uid,
            concat('listing ', p_listing, '; basis ', v_gate));
  end if;
  perform public.notify_admins('Authority evidence submitted', concat('Review the evidence for "', coalesce(l.title, 'a listing'), '".'), '/admin/listing-authority', 'general');
  return 'ok';
end $f$;

-- 4. USER functions ----------------------------------------------------------------
create or replace function public.save_authority_draft(p_listing uuid, p_role text, p_situation text, p_owner_name text,
  p_owner_phone text, p_company_name text, p_company_cac text, p_note text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record;
begin
  if v is null then raise exception 'Sign in to continue.' using errcode = '28000'; end if;
  select id, landlord_id, authority_status into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'on_hold' then
    raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023';
  end if;
  if p_role is not null and p_role not in ('owner','agent','manager','company_representative','other') then
    raise exception 'Choose your relationship to the property.' using errcode = '22023';
  end if;
  if p_situation is not null and p_situation not in ('sole_owner','co_owned','inherited','other') then
    raise exception 'Choose the property situation.' using errcode = '22023';
  end if;
  insert into public.listing_authority_claim_drafts
    (listing_id, saved_by, claimed_role, situation, owner_name, owner_phone, company_name, company_cac, declaration_note)
  values (p_listing, v, p_role, p_situation,
    nullif(left(trim(coalesce(p_owner_name,'')),200),''), nullif(left(trim(coalesce(p_owner_phone,'')),50),''),
    nullif(left(trim(coalesce(p_company_name,'')),200),''), nullif(left(trim(coalesce(p_company_cac,'')),50),''),
    nullif(left(trim(coalesce(p_note,'')),1000),''))
  on conflict (listing_id) do update set saved_by = excluded.saved_by, claimed_role = excluded.claimed_role,
    situation = excluded.situation, owner_name = excluded.owner_name, owner_phone = excluded.owner_phone,
    company_name = excluded.company_name, company_cac = excluded.company_cac,
    declaration_note = excluded.declaration_note, updated_at = now();
  return jsonb_build_object('ok', true);
end $f$;

create or replace function public.my_authority_draft(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record; d public.listing_authority_claim_drafts;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select id, landlord_id into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then return jsonb_build_object('found', false); end if;
  select * into d from public.listing_authority_claim_drafts where listing_id = p_listing;
  if not found then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'claimed_role', d.claimed_role, 'situation', d.situation,
    'owner_name', d.owner_name, 'owner_phone', d.owner_phone, 'company_name', d.company_name,
    'company_cac', d.company_cac, 'declaration_note', d.declaration_note, 'updated_at', d.updated_at);
end $f$;

-- For the UI: can this user send this role for review right now? (The submit function enforces it again.)
create or replace function public.authority_submit_eligibility(p_listing uuid, p_role text)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record; g text;
begin
  if v is null then return jsonb_build_object('allowed', false, 'code', 'signed_out'); end if;
  select id, landlord_id into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then return jsonb_build_object('allowed', false, 'code', 'not_found'); end if;
  g := public.eb_authority_professional_gate(p_listing, v, p_role);
  return jsonb_build_object('allowed', g not like 'blocked_%', 'code', g,
    'professional_status', public.eb_professional_status(v));
end $f$;

-- Best-effort record of a blocked attempt. The submit function cannot log it itself because a rejected call rolls back.
-- Verifies the block server-side, so it can only record real blocks. At most one record per listing per hour.
create or replace function public.professional_log_blocked_submit(p_listing uuid, p_role text)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record; g text; s text;
begin
  if v is null then return jsonb_build_object('logged', false); end if;
  select id, landlord_id into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then return jsonb_build_object('logged', false); end if;
  g := public.eb_authority_professional_gate(p_listing, v, p_role);
  if g not like 'blocked_%' then return jsonb_build_object('logged', false); end if;
  if exists (select 1 from public.professional_events e where e.user_id = v and e.event = 'authority_submit_blocked'
              and e.note like concat('listing ', p_listing, ';%') and e.created_at > now() - interval '1 hour') then
    return jsonb_build_object('logged', false);
  end if;
  s := public.eb_professional_status(v);
  insert into public.professional_events (user_id, event, from_status, to_status, actor_id, note)
  values (v, 'authority_submit_blocked', s, s, v, concat('listing ', p_listing, '; reason ', g));
  return jsonb_build_object('logged', true);
end $f$;

revoke all on function public.save_authority_draft(uuid,text,text,text,text,text,text,text), public.my_authority_draft(uuid),
  public.authority_submit_eligibility(uuid,text), public.professional_log_blocked_submit(uuid,text) from public, anon;
grant execute on function public.save_authority_draft(uuid,text,text,text,text,text,text,text), public.my_authority_draft(uuid),
  public.authority_submit_eligibility(uuid,text), public.professional_log_blocked_submit(uuid,text) to authenticated;

commit;

-- CHECK (read only). Expect 1 table, 5 functions.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name='listing_authority_claim_drafts') as table_should_be_1,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
--          ('eb_authority_professional_gate','save_authority_draft','my_authority_draft','authority_submit_eligibility','professional_log_blocked_submit')) as functions_should_be_5;

-- ROLLBACK: re-run submit_listing_authority from 20261115_02_no_resend_while_under_review.sql, then:
-- drop function if exists public.save_authority_draft(uuid,text,text,text,text,text,text,text), public.my_authority_draft(uuid),
--   public.authority_submit_eligibility(uuid,text), public.professional_log_blocked_submit(uuid,text),
--   public.eb_authority_professional_gate(uuid,uuid,text);
-- drop table if exists public.listing_authority_claim_drafts;
