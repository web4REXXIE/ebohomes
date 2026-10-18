-- READ-ONLY checks. Run in the Supabase SQL editor BEFORE 20261022_01_viewing_workflow.sql. Changes nothing.

-- 1. viewings columns
select column_name, data_type from information_schema.columns where table_schema='public' and table_name='viewings' order by ordinal_position;

-- 2. current check constraints on viewings
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.viewings'::regclass;

-- 3. existing viewing rows by status (expect only requested/scheduled/completed/no_show/cancelled)
select status, count(*) from public.viewings group by status;

-- 4. existing request_viewing signatures (expect exactly: request_viewing(p_application uuid, p_preferred timestamptz, p_note text))
select oid::regprocedure from pg_proc where proname='request_viewing' and pronamespace='public'::regnamespace;

-- 5. the inspection view the new code reads (needs at least listing_id)
select column_name from information_schema.columns where table_schema='public' and table_name='public_listing_inspections' order by ordinal_position;

-- 6. columns the new code reads on other tables (expect 24 rows)
select table_name, column_name from information_schema.columns
 where table_schema='public' and (
   (table_name='profiles' and column_name in ('id','full_name','phone','role')) or
   (table_name='applications' and column_name in ('id','status','listing_id','tenant_id','landlord_id')) or
   (table_name='listings' and column_name in ('id','title','description','location_text','price_monthly','service_charge','caution_deposit','property_type','bedrooms','bathrooms','amenities','photos','video_url','availability_date','status')))
 order by 1,2;

-- 7. helper functions the migration calls (expect 3 rows)
select proname from pg_proc where pronamespace='public'::regnamespace and proname in ('eb_is_admin','notify_user','notify_admins');

-- 8. RLS policies on viewings (expect viewings_select only)
select policyname, cmd from pg_policies where schemaname='public' and tablename='viewings';

-- 9. grants on viewings for anon/authenticated (expect authenticated: SELECT only)
select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='viewings' and grantee in ('anon','authenticated');