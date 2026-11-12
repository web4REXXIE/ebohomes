-- EboHomes 20261212_02  *** REVIEW FIRST, THEN RUN IN THE SUPABASE SQL EDITOR ***
-- Run 20261212_01_profile_contacts.sql first.
-- WHAT: lets an EboHomes administrator open a tenant's address and emergency contact from a tenancy.
-- Every time it is opened, a row is written to audit_events. If the audit row cannot be written,
-- nothing is returned (the contact is never shown without a record).
-- DOES NOT: change any table or existing function. Safe to re-run.
begin;

create or replace function public.eb_admin_tenant_contact(p_tenancy_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
declare
  v_tenant uuid;
  v_phone text;
  r public.profile_contacts%rowtype;
  v_found boolean;
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can do this' using errcode = '42501';
  end if;

  select t.tenant_id into v_tenant from public.tenancies t where t.id = p_tenancy_id;
  if v_tenant is null then
    raise exception 'Tenancy not found' using errcode = 'P0002';
  end if;

  select p.phone into v_phone from public.profiles p where p.id = v_tenant;

  select * into r from public.profile_contacts where user_id = v_tenant;
  v_found := found;

  insert into public.audit_events
    (actor_id, actor_role, action, object_type, object_id, reason, previous_state, new_state)
  values (
    auth.uid(), 'admin', 'tenant_contact_viewed', 'tenancy', p_tenancy_id,
    'Admin opened the tenant address and emergency contact',
    null,
    jsonb_build_object('tenant_id', v_tenant, 'had_contact_on_file', v_found)
  );

  return jsonb_build_object(
    'has_contact', v_found,
    'tenant_phone', v_phone,
    'home_address', r.home_address,
    'city', r.city,
    'emergency_name', r.emergency_name,
    'emergency_phone', r.emergency_phone,
    'emergency_relationship', r.emergency_relationship
  );
end;
$f$;

revoke all on function public.eb_admin_tenant_contact(uuid) from public, anon;
grant execute on function public.eb_admin_tenant_contact(uuid) to authenticated;

commit;

-- ROLLBACK: drop function if exists public.eb_admin_tenant_contact(uuid);
