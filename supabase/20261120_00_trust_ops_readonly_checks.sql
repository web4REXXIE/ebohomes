-- EboHomes 20261120_00: Phase 9.5 PREFLIGHT. READ ONLY. Changes nothing.
-- Run each query in the Supabase SQL editor BEFORE running 20261120_01_trust_operations.sql.
-- Send me the results if any answer is not what the comment says.

-- 1. Phase 9.4, 9.2 and holds tables this migration reads or links to. Expect 11 rows.
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('risk_alerts','risk_alert_events','risk_alert_evidence','risk_settings','listing_authority_claims','listing_authority_documents',
                     'listing_document_reviews','listing_authority_reviews','listing_authority_settings','property_holds','property_inspections')
order by 1;

-- 2. Functions this migration calls. Expect 4 rows (audit_write, eb_is_admin, notify_admins, notify_user).
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('audit_write','eb_is_admin','notify_admins','notify_user')
order by proname;

-- 3. staff_roles: the migration reads user_id and role. Expect 2 rows. If role shows USER-DEFINED that is fine (it is cast to text).
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'staff_roles' and column_name in ('user_id','role') order by 1;

-- 4. Who is an administrator and which roles they hold TODAY. Read this before ever turning the role gate on:
--    an administrator with no reviewer or super_admin role would be unable to work cases once the gate is on.
select p.id, p.full_name, coalesce(string_agg(r.role::text, ', ' order by r.role::text), '(no roles)') as roles
from public.profiles p left join public.staff_roles r on r.user_id = p.id
where p.role = 'admin' group by p.id, p.full_name order by p.full_name;

-- 5. Columns the overview counts. Expect 7 rows: id_document_url, role, selfie_url, verification_status (profiles) and listing_id, review_status, reviewed_at (property_inspections).
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'profiles' and column_name in ('role','verification_status','id_document_url','selfie_url'))
    or (table_name = 'property_inspections' and column_name in ('listing_id','review_status','reviewed_at')))
order by 1, 2;

-- 6. Nothing from Phase 9.5 exists yet. Expect 0.
select count(*) as phase_95_tables_already_present
from information_schema.tables
where table_schema = 'public' and table_name in ('trust_settings','trust_cases','trust_case_alerts','trust_case_events');

-- 7. How many alerts and authority decisions exist (so you know whether the reports will have data on day one).
select (select count(*) from public.risk_alerts) as risk_alerts,
       (select count(*) from public.listing_authority_reviews where decision in ('accepted','rejected','needs_evidence')) as authority_decisions,
       (select count(*) from public.property_inspections where reviewed_at is not null) as reviewed_inspections;
