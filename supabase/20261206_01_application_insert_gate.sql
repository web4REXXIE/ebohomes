-- EboHomes 20261206_01 (Phase 11.3)  *** PROPOSED. NOT EXECUTED. Run 20261206_00 first and review R8/R1/R3. ***
-- WHY: the application form checks eligibility only in the browser. The repo shows no server-side gate on INSERT except
--      a20_block_on_hold, no unique index on open applications, and no check that landlord_id / tenant_id are genuine.
-- WHAT IT DOES
--   A. Preflight: STOPS (changes nothing) if existing data would violate the new rules. Fix those rows first (R8 lists them).
--   B. BEFORE INSERT trigger a15_application_insert_gate on public.applications. A new application is accepted only when:
--        - tenant_id = the signed-in user, and the user is not the listing's landlord,
--        - applications.landlord_id = listings.landlord_id (cannot be mis-routed to another landlord),
--        - the listing is 'approved' (so paused, rented, reserved, rejected, suspended, pending are all refused),
--        - no live tenancy exists on the listing,
--        - message and application_data are within size limits (server-side, not only in the form).
--      Inserts with no signed-in user (SQL editor, service role) are not blocked, same convention as the other guards.
--   C. Unique indexes: one open application per tenant per listing; one approved application per listing.
--   D. Lookup indexes on applications(listing_id,status), (tenant_id), (landlord_id).
-- DOES NOT: change enforce_application_rules, admin_decide_application, any existing trigger, policy, status value or data.
--           Existing applications are not touched. Rejected and withdrawn applications stay outside the unique rules,
--           so tenants can re-apply (policy section 9).
-- ERROR CODES (already understood by lib/application-form.ts classifySubmitError, so no app change is needed):
--   23503 = property no longer available; 42501 = not permitted; 23505 = duplicate (from the unique index).
-- ROLLBACK: at the bottom.

begin;

-- ===== A. Preflight =====
do $$
declare n_dup int; n_multi int; n_mismatch int;
begin
  select count(*) into n_dup from (
    select 1 from public.applications where status in ('pending','info_requested','approved')
    group by tenant_id, listing_id having count(*) > 1) x;
  select count(*) into n_multi from (
    select 1 from public.applications where status = 'approved' group by listing_id having count(*) > 1) x;
  select count(*) into n_mismatch from public.applications a
    join public.listings l on l.id = a.listing_id where a.landlord_id is distinct from l.landlord_id;
  if n_dup > 0 then
    raise exception 'STOPPED: % tenant/listing pairs have more than one open application. Resolve them first (R8 duplicate_open_applications).', n_dup;
  end if;
  if n_multi > 0 then
    raise exception 'STOPPED: % listings have more than one approved application. Resolve them first (R8 listings_with_multiple_approved_applications).', n_multi;
  end if;
  -- Informational only: the new trigger checks NEW rows, so existing mismatches do not block this file.
  if n_mismatch > 0 then
    raise notice 'NOTE: % existing applications have a landlord_id that differs from the listing landlord. Review them (R8 applications_landlord_not_listing_landlord).', n_mismatch;
  end if;
end $$;

-- ===== B. Insert gate =====
create or replace function public.eb_application_insert_gate()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  l record;
begin
  if v_uid is null then
    return new;
  end if;

  if new.tenant_id is distinct from v_uid then
    raise exception 'You can only apply for yourself.' using errcode = '42501';
  end if;

  select id, status, landlord_id into l from public.listings where id = new.listing_id;
  if not found then
    raise exception 'This property is no longer available for applications.' using errcode = '23503';
  end if;
  if l.landlord_id = v_uid then
    raise exception 'You cannot apply to your own listing.' using errcode = '42501';
  end if;
  if new.landlord_id is distinct from l.landlord_id then
    raise exception 'This application does not match the property owner.' using errcode = '42501';
  end if;
  if l.status is distinct from 'approved' then
    raise exception 'This property is not open for applications (listing status: %).', coalesce(l.status, 'unknown') using errcode = '23503';
  end if;
  if exists (
    select 1 from public.tenancies t
    where t.listing_id = new.listing_id
      and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')
  ) then
    raise exception 'This property already has a tenancy in progress.' using errcode = '23503';
  end if;

  if new.message is not null and char_length(btrim(new.message)) > 1000 then
    raise exception 'The message is too long.' using errcode = '22001';
  end if;
  if new.application_data is not null
     and (jsonb_typeof(new.application_data) <> 'object' or octet_length(new.application_data::text) > 4000) then
    raise exception 'The application details are not valid.' using errcode = '22023';
  end if;

  return new;
end;
$function$;
revoke all on function public.eb_application_insert_gate() from public, anon, authenticated;

drop trigger if exists a15_application_insert_gate on public.applications;
create trigger a15_application_insert_gate
  before insert on public.applications
  for each row execute function public.eb_application_insert_gate();

-- ===== C. Unique rules (partial, so re-applying after rejection or withdrawal stays allowed) =====
create unique index if not exists applications_one_open_per_tenant_listing
  on public.applications (tenant_id, listing_id)
  where status in ('pending', 'info_requested', 'approved');

create unique index if not exists applications_one_approved_per_listing
  on public.applications (listing_id)
  where status = 'approved';

-- ===== D. Lookup indexes =====
create index if not exists applications_listing_status_idx on public.applications (listing_id, status);
create index if not exists applications_tenant_idx on public.applications (tenant_id);
create index if not exists applications_landlord_idx on public.applications (landlord_id);

commit;

-- CHECK (read only): expect 1 trigger row and 5 index rows.
select tgname from pg_trigger where tgrelid = 'public.applications'::regclass and tgname = 'a15_application_insert_gate';
select indexname from pg_indexes where schemaname = 'public' and tablename = 'applications'
  and indexname in ('applications_one_open_per_tenant_listing', 'applications_one_approved_per_listing',
                    'applications_listing_status_idx', 'applications_tenant_idx', 'applications_landlord_idx');

-- ROLLBACK (only if needed):
-- drop trigger if exists a15_application_insert_gate on public.applications;
-- drop function if exists public.eb_application_insert_gate();
-- drop index if exists public.applications_one_open_per_tenant_listing;
-- drop index if exists public.applications_one_approved_per_listing;
-- drop index if exists public.applications_listing_status_idx;
-- drop index if exists public.applications_tenant_idx;
-- drop index if exists public.applications_landlord_idx;
