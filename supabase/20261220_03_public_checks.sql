-- EboHomes 20261220_03: public check dates for the listing page and the public landlord profile.
-- WHY: the listing page already calls listing_check_dates (idea 16), but that function was never in the repo, so the four
--      checks may show "could not load" on your live site. This file creates it, and adds landlord_public_checks for the profile.
-- WHAT:
--   1. listing_check_dates(listing)   -> identity_at, documents_reviewed, documents_at, authority_at   (approved listings only)
--   2. landlord_public_checks(landlord) -> counts and dates across the landlord's approved listings, plus completed rentals
-- SAFETY: READ-ONLY functions. They return only yes/no, counts and dates. No names, files, notes, phone numbers or reasons.
--         Nothing is changed in any table. Safe to re-run.
-- REQUIRES: listings, profiles, listing_authority_documents, listing_document_reviews, listing_authority_reviews,
--           public_listing_inspections, eb_trusted_completed_count (20261219_04) already exist.
-- ROLLBACK: bottom of file.

begin;

-- PREFLIGHT
do $$
declare t text;
begin
  foreach t in array array['listings','profiles','listing_authority_documents','listing_document_reviews','listing_authority_reviews','public_listing_inspections'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Preflight failed: % is missing.', t;
    end if;
  end loop;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'eb_trusted_completed_count') then
    raise exception 'Preflight failed: eb_trusted_completed_count is missing. Run 20261219_04_trusted_label.sql first.';
  end if;
end $$;

-- 1. Four-check dates for ONE listing (shape matches what the listing page reads).
create or replace function public.listing_check_dates(p_listing uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  l public.listings%rowtype;
  v_ident_ok boolean;
  v_ident_at timestamptz;
  v_docs_at timestamptz;
  v_auth_at timestamptz;
begin
  select * into l from public.listings where id = p_listing and status = 'approved';
  if not found then return null; end if;

  select (p.verification_status = 'verified' and p.verified is true), p.verification_reviewed_at
    into v_ident_ok, v_ident_at
    from public.profiles p where p.id = l.landlord_id;

  -- A current document whose latest review is "acceptable".
  select max(r.created_at) into v_docs_at
    from public.listing_authority_documents d
    join lateral (
      select r2.outcome, r2.created_at from public.listing_document_reviews r2
       where r2.document_id = d.id
         and r2.outcome in ('acceptable','unclear','concern','not_relevant')
       order by r2.created_at desc limit 1
    ) r on r.outcome = 'acceptable'
   where d.listing_id = p_listing and d.withdrawn_at is null;

  select max(a.decided_at) into v_auth_at
    from public.listing_authority_reviews a
   where a.listing_id = p_listing and a.decision in ('accepted','kept_unchanged')
     and l.authority_status = 'accepted';

  return jsonb_build_object(
    'identity_at', case when coalesce(v_ident_ok, false) then v_ident_at end,
    'documents_reviewed', v_docs_at is not null,
    'documents_at', v_docs_at,
    'authority_at', v_auth_at
  );
end;
$f$;
revoke all on function public.listing_check_dates(uuid) from public;
grant execute on function public.listing_check_dates(uuid) to anon, authenticated;

-- 2. Landlord-level summary for the public profile.
create or replace function public.landlord_public_checks(p_landlord uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_ident_ok boolean;
  v_ident_at timestamptz;
  v_since timestamptz;
  v_live int;
  v_docs int; v_docs_at timestamptz;
  v_auth int; v_auth_at timestamptz;
  v_insp int; v_insp_at timestamptz;
begin
  select (p.verification_status = 'verified' and p.verified is true),
         p.verification_reviewed_at,
         nullif(to_jsonb(p) ->> 'created_at', '')::timestamptz
    into v_ident_ok, v_ident_at, v_since
    from public.profiles p where p.id = p_landlord;
  if not found then return null; end if;

  select count(*)::int into v_live
    from public.listings l where l.landlord_id = p_landlord and l.status = 'approved';

  -- listings with at least one current document whose latest review is "acceptable"
  select count(distinct d.listing_id)::int, max(r.created_at) into v_docs, v_docs_at
    from public.listing_authority_documents d
    join public.listings l on l.id = d.listing_id and l.landlord_id = p_landlord and l.status = 'approved'
    join lateral (
      select r2.outcome, r2.created_at from public.listing_document_reviews r2
       where r2.document_id = d.id
         and r2.outcome in ('acceptable','unclear','concern','not_relevant')
       order by r2.created_at desc limit 1
    ) r on r.outcome = 'acceptable'
   where d.withdrawn_at is null;

  select count(*)::int into v_auth
    from public.listings l
   where l.landlord_id = p_landlord and l.status = 'approved' and l.authority_status = 'accepted';
  select max(a.decided_at) into v_auth_at
    from public.listing_authority_reviews a
    join public.listings l on l.id = a.listing_id
   where l.landlord_id = p_landlord and l.status = 'approved' and l.authority_status = 'accepted'
     and a.decision in ('accepted','kept_unchanged');

  select count(distinct pi.listing_id)::int, max(pi.inspected_at) into v_insp, v_insp_at
    from public.public_listing_inspections pi
    join public.listings l on l.id = pi.listing_id and l.landlord_id = p_landlord and l.status = 'approved';

  return jsonb_build_object(
    'identity_checked', coalesce(v_ident_ok, false),
    'identity_at', case when coalesce(v_ident_ok, false) then v_ident_at end,
    'member_since', v_since,
    'live_listings', v_live,
    'documents_listings', coalesce(v_docs, 0), 'documents_at', v_docs_at,
    'authority_listings', coalesce(v_auth, 0), 'authority_at', v_auth_at,
    'inspected_listings', coalesce(v_insp, 0), 'inspected_at', v_insp_at,
    'completed_rentals', public.eb_trusted_completed_count(p_landlord)
  );
end;
$f$;
revoke all on function public.landlord_public_checks(uuid) from public;
grant execute on function public.landlord_public_checks(uuid) to anon, authenticated;

commit;

-- AFTER RUNNING (optional check, replace the id with a real landlord id from your profiles table):
--   select public.landlord_public_checks('00000000-0000-0000-0000-000000000000');
--
-- ROLLBACK:
--   drop function if exists public.landlord_public_checks(uuid);
--   drop function if exists public.listing_check_dates(uuid);
