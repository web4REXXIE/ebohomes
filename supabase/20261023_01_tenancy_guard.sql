-- EboHomes: tenancy creation guard
-- WHY: the Create Tenancy button only shows when the tenant confirmed interest, but nothing in the database
-- stops a tenancy being inserted without that. Inserting a tenancy also marks the listing as rented
-- (handle_tenancy_created), so a tenancy must not be created early.
-- WHAT IT DOES: a tenancy can only be inserted when
--   1. the application exists and is approved by EboHomes,
--   2. the tenant confirmed they want to proceed (applications.tenant_interest_at is set),
--   3. the tenancy matches the application (same tenant, property and landlord),
--   4. the listing is still approved (open for new tenants).
-- Inserts with no signed-in user (the SQL editor, service role, backfills) are not blocked.
-- It only checks NEW inserts. Existing tenancies are not touched. No data is changed.
-- RUN: step 1 first (read only). If it returns rows, tell me before running step 2.

-- STEP 1: preflight. Tenancies that would NOT pass the new rules (information only).
select t.id as tenancy_id, t.application_id, a.status as application_status,
       a.tenant_interest_at, l.status as listing_status
from public.tenancies t
left join public.applications a on a.id = t.application_id
left join public.listings l on l.id = t.listing_id
where a.id is null or a.status <> 'approved' or a.tenant_interest_at is null;

-- STEP 2: install the guard.
create or replace function public.eb_tenancy_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  v_listing_status text;
  v_listing_landlord uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select * into a from public.applications where id = new.application_id;
  if not found then
    raise exception 'A tenancy can only be created from an approved application.';
  end if;
  if a.status <> 'approved' then
    raise exception 'The application must be approved by EboHomes first (current: %).', a.status;
  end if;
  if a.tenant_interest_at is null then
    raise exception 'The tenant has not confirmed they want to proceed yet.';
  end if;
  if a.tenant_id is distinct from new.tenant_id or a.listing_id is distinct from new.listing_id then
    raise exception 'This tenancy does not match the application.';
  end if;

  select status, landlord_id into v_listing_status, v_listing_landlord
  from public.listings where id = new.listing_id;
  if v_listing_status is distinct from 'approved' then
    raise exception 'This property is not open for new tenants (listing status: %).', coalesce(v_listing_status, 'unknown');
  end if;
  if v_listing_landlord is distinct from new.landlord_id then
    raise exception 'The landlord on this tenancy does not own the property.';
  end if;

  return new;
end;
$function$;

drop trigger if exists a_eb_tenancy_guard on public.tenancies;
create trigger a_eb_tenancy_guard
  before insert on public.tenancies
  for each row execute function public.eb_tenancy_guard();

-- STEP 3 (check): this must list the trigger.
select tgname from pg_trigger where tgrelid = 'public.tenancies'::regclass and tgname = 'a_eb_tenancy_guard';

-- ROLLBACK (only if you need to undo it):
-- drop trigger if exists a_eb_tenancy_guard on public.tenancies;
-- drop function if exists public.eb_tenancy_guard();