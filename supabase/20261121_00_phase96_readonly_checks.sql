-- EboHomes 20261121_00: Phase 9.6 READ-ONLY CHECKS. Changes nothing. Run each query separately in the Supabase SQL editor
-- BEFORE running 20261121_01_phase96_integrity.sql. Send me the results of R1-R5 at least.

-- R1. Triggers on profiles, listings and the file history table (name, timing, function). Look for anything touching status / verified / role.
select c.relname as table_name, t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  and c.relname in ('profiles','listings','landlord_verification_file_history')
order by c.relname, t.tgname;

-- R2. The two unseen listing guards. Send me this output if it contains status rules.
select proname, pg_get_functiondef(oid) as definition
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('listings_guard','listings_reedit_guard','tenancies_guard');

-- R3. Update/insert policies on profiles. A permissive "update own row" policy with no column limit = users can write any column the triggers do not block.
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by cmd, policyname;

-- R4. Policies on listings, plus column-level update grants for signed-in users.
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'listings' order by cmd, policyname;

select grantee, privilege_type, column_name from information_schema.column_privileges
where table_schema = 'public' and table_name in ('profiles','listings')
  and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE')
order by table_name, grantee, column_name;

-- R5. Who can READ listings? Look for a select policy that does not limit to status = 'approved' (or owner / admin).
select policyname, roles, qual from pg_policies
where schemaname = 'public' and tablename = 'listings' and cmd in ('SELECT','ALL') order by policyname;

-- R6. Storage buckets. Expect ownership-docs and property-evidence to show public = false.
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by name;

-- R7. Storage policies: who can read, upload, replace (update) and delete files in each bucket.
select policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- R8. Audit tables: grants and policies. Signed-in users must NOT have update/delete on them.
select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and (table_name like '%audit%' or table_name in ('landlord_verification_file_history','risk_alert_events','risk_alert_evidence'))
  and grantee in ('anon','authenticated') order by table_name, grantee, privilege_type;

select tablename, policyname, cmd, roles from pg_policies
where schemaname = 'public' and (tablename like '%audit%' or tablename = 'landlord_verification_file_history') order by 1, 2;

-- R9. staff_roles: who can write it?
select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'staff_roles';
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'staff_roles' and grantee in ('anon','authenticated');

-- R10. Existing data that already breaks a Phase 9 rule. Every count should be 0.
select
 (select count(*) from public.profiles where verified is true and coalesce(verification_status,'') not in ('verified','approved')) as verified_flag_without_status,
 (select count(*) from public.profiles where verified is not true and verification_status in ('verified','approved')) as verified_status_without_flag,
 (select count(*) from public.listings where status = 'approved' and authority_status <> 'accepted'
    and id not in (select listing_id from public.listing_authority_legacy where resolved_at is null)) as approved_without_accepted_authority,
 (select count(*) from public.listings where status in ('approved','paused') and reviewed_at is null) as live_without_review_date;

-- R11. Do both risk systems hold rows? (They are not linked.)
select
 (select count(*) from public.risk_flags) as old_risk_flags,
 (select count(*) from public.listing_risk) as old_listing_risk,
 (select count(*) from public.risk_alerts) as new_risk_alerts;

-- R12. SECURITY DEFINER functions that anon or signed-in users can run. Review anything unexpected.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
order by anon_can_run desc, p.proname;

-- R13. What the 9.6 migration needs. Expect 3 function rows (audit_write, eb_is_admin, is_admin) and 1 table row.
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('audit_write','eb_is_admin','is_admin') order by 1;
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'landlord_verification_file_history';
