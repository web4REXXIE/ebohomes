-- EboHomes 20261115_02: Phase 9.2 - a lister cannot send authority evidence again while it is already under review.
-- WHAT: adds one rule to submit_listing_authority. Nothing else changes. No listing, tenancy or application is touched.
-- ROLLBACK: re-run the submit_listing_authority function from 20261114_01.
begin;

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
  if l.authority_status = 'submitted' then raise exception 'Already sent. EboHomes is reviewing this listing.' using errcode = '22023'; end if;
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

commit;
