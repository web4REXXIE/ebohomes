-- EboHomes 20261121_01 (Phase 9.6): integrity fixes. REVISED after R2/R3/R4.
-- Changes no existing row. Deletes nothing. One transaction. Back up first.
-- auth.uid() null = server key / SQL editor (unrestricted, as in your other guards).
-- Columns are read through to_jsonb() so a column that does not exist is simply ignored.
begin;

-- ===================================================================
-- C1. profiles: a signed-in user cannot change their own trust fields
--     (UPDATE only. Profile rows are created by the system, not by the browser.)
-- ===================================================================
create or replace function public.eb_profiles_trust_fields_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  k text;
  locked text[] := array['role','verified','status','rejection_reason','badge',
                         'payout_locked_until','verification_reviewed_by','verification_reviewed_at'];
begin
  if auth.uid() is null or public.eb_is_admin() then return new; end if;

  foreach k in array locked loop
    if (n->k) is distinct from (o->k) then
      raise exception 'Account verification and role are managed by EboHomes' using errcode = '42501';
    end if;
  end loop;

  -- A user may only put their own verification_status to 'pending' (submit / resubmit).
  if (n->'verification_status') is distinct from (o->'verification_status')
     and coalesce(n->>'verification_status','') <> 'pending' then
    raise exception 'Account verification is managed by EboHomes' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists a00_profiles_trust_fields_guard on public.profiles;
create trigger a00_profiles_trust_fields_guard
  before update on public.profiles
  for each row execute function public.eb_profiles_trust_fields_guard();

-- A verified LANDLORD who changes identity/business details goes back to 'pending'
-- (what the profile page already promises). Tenants are never affected.
-- Listings are NOT touched: identity is not authority.
create or replace function public.eb_profiles_reverify_on_identity_change()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
declare o jsonb := to_jsonb(old); n jsonb := to_jsonb(new); k text;
  watched text[] := array['full_name','business_name','business_address','cac_number'];
begin
  if auth.uid() is null or public.eb_is_admin() then return new; end if;
  if old.role is distinct from 'landlord' then return new; end if;
  if not (old.verified is true or old.verification_status = 'verified') then return new; end if;
  foreach k in array watched loop
    if (n->k) is distinct from (o->k) then
      new.verification_status := 'pending';
      new.verified := false;
      return new;
    end if;
  end loop;
  return new;
end $f$;

drop trigger if exists a10_profiles_reverify_on_identity_change on public.profiles;
create trigger a10_profiles_reverify_on_identity_change
  before update on public.profiles
  for each row execute function public.eb_profiles_reverify_on_identity_change();

-- ===================================================================
-- C2. listings: only the two gaps left after R2
--     (listings_guard already handles status, featured, reviewed_*, rejection_reason)
-- ===================================================================
create or replace function public.eb_listings_admin_fields_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null
     or coalesce(current_setting('eb.authority_write', true), '') = '1'
     or public.eb_is_admin() then
    return new;
  end if;

  if new.suspended_at is distinct from old.suspended_at
     or new.suspension_reason is distinct from old.suspension_reason then
    raise exception 'This listing detail is managed by EboHomes' using errcode = '42501';
  end if;

  if new.property_id is distinct from old.property_id
     and old.authority_status in ('submitted','accepted','on_hold') then
    raise exception 'The property cannot be changed while its authority is under review or accepted' using errcode = '42501';
  end if;
  return new;
end $f$;

drop trigger if exists a01_listings_admin_fields_guard on public.listings;
create trigger a01_listings_admin_fields_guard
  before update on public.listings
  for each row execute function public.eb_listings_admin_fields_guard();

-- ===================================================================
-- C3. Property Review decisions: locked, stale-safe, attributable
-- ===================================================================
create or replace function public.admin_review_listing(
  p_listing uuid, p_action text, p_reason text default null, p_expected_status text default null)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare l record; v_reason text := nullif(trim(coalesce(p_reason,'')), ''); v_new text;
begin
  if not public.eb_is_admin() then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_action not in ('approve','reject','suspend','reinstate') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;

  select id, landlord_id, status into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;

  if l.landlord_id = auth.uid() then
    raise exception 'You cannot review your own listing' using errcode = '42501';
  end if;
  if p_expected_status is not null and l.status is distinct from p_expected_status then
    raise exception 'This listing was changed by someone else. Refresh and try again.' using errcode = '40001';
  end if;
  if l.status = 'rented' then
    raise exception 'A rented listing cannot be reviewed here' using errcode = '22023';
  end if;
  if p_action in ('reject','suspend') and (v_reason is null or length(v_reason) < 5) then
    raise exception 'A reason of at least 5 characters is required' using errcode = '22023';
  end if;

  if p_action = 'approve' then
    if l.status not in ('pending','inspection_required') then
      raise exception 'Only a listing awaiting review can be approved' using errcode = '22023';
    end if;
    update public.listings
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = null
     where id = p_listing;                          -- existing publish gate still applies
    v_new := 'approved';
  elsif p_action = 'reject' then
    if l.status not in ('pending','inspection_required') then
      raise exception 'Only a listing awaiting review can be rejected' using errcode = '22023';
    end if;
    update public.listings
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = v_reason
     where id = p_listing;
    v_new := 'rejected';
  elsif p_action = 'suspend' then
    if l.status = 'suspended' then raise exception 'Already suspended' using errcode = '22023'; end if;
    update public.listings
       set status = 'suspended', suspension_reason = v_reason, suspended_at = now()
     where id = p_listing;
    v_new := 'suspended';
  else -- reinstate: back to review, never straight to approved
    if l.status <> 'suspended' then raise exception 'Only a suspended listing can be reinstated' using errcode = '22023'; end if;
    update public.listings
       set status = 'pending', suspension_reason = null, suspended_at = null
     where id = p_listing;
    v_new := 'pending';
  end if;

  begin
    perform public.audit_write('listing_review_' || p_action, 'listing', p_listing,
      jsonb_build_object('status', l.status), jsonb_build_object('status', v_new), v_reason);
  exception when others then null;                  -- audit never blocks the decision
  end;
  return v_new;
end $f$;

revoke all on function public.admin_review_listing(uuid, text, text, text) from public, anon;
grant execute on function public.admin_review_listing(uuid, text, text, text) to authenticated;

-- Audit every status change, whoever makes it (fails open)
create or replace function public.eb_listings_status_audit()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.status is distinct from old.status then
    begin
      perform public.audit_write('listing_status_changed', 'listing', new.id,
        jsonb_build_object('status', old.status), jsonb_build_object('status', new.status), null);
    exception when others then null;
    end;
  end if;
  return new;
end $f$;

drop trigger if exists zz_listings_status_audit on public.listings;
create trigger zz_listings_status_audit
  after update of status on public.listings
  for each row execute function public.eb_listings_status_audit();

-- ===================================================================
-- Verification file history is append-only for signed-in users
-- ===================================================================
create or replace function public.eb_verification_file_history_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  raise exception 'Verification file history cannot be edited or deleted' using errcode = '42501';
end $f$;

drop trigger if exists aa_verification_file_history_guard on public.landlord_verification_file_history;
create trigger aa_verification_file_history_guard
  before update or delete on public.landlord_verification_file_history
  for each row execute function public.eb_verification_file_history_guard();

commit;

-- CHECK (read only, after running). Expect 5 rows:
-- select tgname from pg_trigger where not tgisinternal and tgname in
--  ('a00_profiles_trust_fields_guard','a10_profiles_reverify_on_identity_change','a01_listings_admin_fields_guard',
--   'zz_listings_status_audit','aa_verification_file_history_guard');

-- ROLLBACK:
-- drop trigger if exists a00_profiles_trust_fields_guard on public.profiles;
-- drop trigger if exists a10_profiles_reverify_on_identity_change on public.profiles;
-- drop trigger if exists a01_listings_admin_fields_guard on public.listings;
-- drop trigger if exists zz_listings_status_audit on public.listings;
-- drop trigger if exists aa_verification_file_history_guard on public.landlord_verification_file_history;
-- drop function if exists public.eb_profiles_trust_fields_guard(), public.eb_profiles_reverify_on_identity_change(),
--   public.eb_listings_admin_fields_guard(), public.admin_review_listing(uuid,text,text,text),
--   public.eb_listings_status_audit(), public.eb_verification_file_history_guard();
