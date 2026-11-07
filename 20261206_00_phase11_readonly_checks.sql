-- EboHomes 20261206_00: Phase 11.2 READ-ONLY live-schema verification. CHANGES NOTHING.
-- Run ONE query at a time in the Supabase SQL Editor (it shows only the last result). Each returns a single JSON row.
-- Paste every result back. No implementation migration will be written until these are reviewed.
-- Secrets: none of these queries read keys or credentials.

-- ===== R1. applications: columns, constraints, indexes, triggers, policies, grants =====
select json_build_object(
  'columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='applications' order by ordinal_position) x),
  'constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.applications'::regclass) x),
  'indexes', (select coalesce(json_agg(x), '[]') from (select indexname, indexdef from pg_indexes where schemaname='public' and tablename='applications') x),
  'triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.applications'::regclass and not tgisinternal) x),
  'policies', (select coalesce(json_agg(x), '[]') from (select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='applications') x),
  'grants', (select coalesce(json_agg(x), '[]') from (select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='applications' and grantee in ('anon','authenticated')) x)
) as r1;

-- ===== R2. tenancies: same detail =====
select json_build_object(
  'statuses', (select coalesce(json_agg(x), '[]') from (select status, count(*) n from public.tenancies group by status) x),
  'columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='tenancies' order by ordinal_position) x),
  'constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.tenancies'::regclass) x),
  'indexes', (select coalesce(json_agg(x), '[]') from (select indexname, indexdef from pg_indexes where schemaname='public' and tablename='tenancies') x),
  'triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.tenancies'::regclass and not tgisinternal) x),
  'policies', (select coalesce(json_agg(x), '[]') from (select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename='tenancies') x),
  'grants', (select coalesce(json_agg(x), '[]') from (select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='tenancies' and grantee in ('anon','authenticated')) x)
) as r2;

-- ===== R3. listings and properties: status values, constraints, triggers, policies, grants =====
select json_build_object(
  'statuses', (select coalesce(json_agg(x), '[]') from (select status, count(*) n from public.listings group by status) x),
  'listing_columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='listings' order by ordinal_position) x),
  'property_columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='properties' order by ordinal_position) x),
  'check_constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.listings'::regclass and contype='c') x),
  'triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.listings'::regclass and not tgisinternal) x),
  'policies', (select coalesce(json_agg(x), '[]') from (select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' and tablename in ('listings','properties')) x),
  'grants', (select coalesce(json_agg(x), '[]') from (select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='listings' and grantee in ('anon','authenticated')) x)
) as r3;

-- ===== R4. Is there ANY unit concept? (policy section 3 needs unit-level reservation) =====
select json_build_object(
  'tables_named_unit', (select coalesce(json_agg(table_name), '[]') from information_schema.tables where table_schema='public' and table_name ilike '%unit%'),
  'unit_columns', (select coalesce(json_agg(x), '[]') from (select table_name, column_name from information_schema.columns where table_schema='public' and (column_name ilike '%unit%' or column_name ilike '%flat%' or column_name ilike '%room_count%') order by 1,2) x)
) as r4;

-- ===== R5. payments, rental_terms, payment_submissions, paystack_transactions =====
select json_build_object(
  'payments_columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='payments' order by ordinal_position) x),
  'payments_constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.payments'::regclass) x),
  'payments_indexes', (select coalesce(json_agg(x), '[]') from (select indexname, indexdef from pg_indexes where schemaname='public' and tablename='payments') x),
  'payments_triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.payments'::regclass and not tgisinternal) x),
  'policies', (select coalesce(json_agg(x), '[]') from (select tablename, policyname, cmd, qual, with_check from pg_policies where schemaname='public' and tablename in ('payments','rental_terms','payment_submissions','paystack_transactions','landlord_payouts','tenancy_handovers')) x)
) as r5;

-- ===== R6. Function definitions that decide behaviour (several exist only in production) =====
select json_agg(json_build_object('name', p.proname, 'def', pg_get_functiondef(p.oid))) as r6
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('listings_guard','listings_reedit_guard','tenancies_guard','eb_tenancy_guard','eb_terms_conflict_guard',
    'eb_terms_mark_rented','eb_complete_rental','eb_payment_verified_mark_rented','eb_handover_completed_mark_rented',
    'handle_tenancy_created','enforce_application_rules','admin_decide_application','eb_tenancy_role','eb_is_admin','is_admin',
    'payments_guard','payments_verify_guard','admin_review_payment','notify_trigger','notify_user','notify_admins');

-- ===== R7. WHICH rented rule is live: 20261109 (handover) vs 20261110 (verified payment) =====
select json_build_object(
  'triggers_present', (select coalesce(json_agg(x), '[]') from (
     select c.relname as on_table, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where not t.tgisinternal and t.tgname in ('zz_handover_mark_rented','zz_payment_mark_rented','z_eb_terms_mark_rented','a_eb_terms_conflict_guard','a_eb_tenancy_guard','a20_block_on_hold','a30_carry_viewing_interest')) x),
  'complete_rental_mentions_handover', (select position('tenancy_handovers' in pg_get_functiondef(oid)) > 0 from pg_proc where pronamespace='public'::regnamespace and proname='eb_complete_rental' limit 1),
  'complete_rental_mentions_payment_submissions', (select position('payment_submissions' in pg_get_functiondef(oid)) > 0 from pg_proc where pronamespace='public'::regnamespace and proname='eb_complete_rental' limit 1),
  'terms_mark_rented_sets_rented', (select position('set status = ''rented''' in pg_get_functiondef(oid)) > 0 from pg_proc where pronamespace='public'::regnamespace and proname='eb_terms_mark_rented' limit 1),
  'handle_tenancy_created_sets_rented', (select position('rented' in pg_get_functiondef(oid)) > 0 from pg_proc where pronamespace='public'::regnamespace and proname='handle_tenancy_created' limit 1)
) as r7;

-- ===== R8. Data integrity (counts and ids only, no personal data) =====
select json_build_object(
  'rented_listings_without_signed_terms', (select coalesce(json_agg(x), '[]') from (
     select l.id from public.listings l where l.status='rented'
     and not exists (select 1 from public.tenancies t join public.rental_terms r on r.tenancy_id=t.id and r.status='signed' where t.listing_id=l.id)) x),
  'rented_listings_without_verified_payment', (select coalesce(json_agg(x), '[]') from (
     select l.id from public.listings l where l.status='rented'
     and not exists (select 1 from public.tenancies t join public.payments p on p.tenancy_id=t.id and p.status='confirmed' and p.verified_by is not null where t.listing_id=l.id)) x),
  'listings_with_multiple_approved_applications', (select coalesce(json_agg(x), '[]') from (
     select listing_id, count(*) n from public.applications where status='approved' group by listing_id having count(*)>1) x),
  'duplicate_open_applications', (select coalesce(json_agg(x), '[]') from (
     select tenant_id, listing_id, count(*) n from public.applications where status in ('pending','info_requested','approved') group by 1,2 having count(*)>1) x),
  'listings_with_multiple_active_tenancies', (select coalesce(json_agg(x), '[]') from (
     select listing_id, count(*) n from public.tenancies where status='active' group by 1 having count(*)>1) x),
  'applications_landlord_not_listing_landlord', (select coalesce(json_agg(x), '[]') from (
     select a.id from public.applications a join public.listings l on l.id=a.listing_id where a.landlord_id is distinct from l.landlord_id) x),
  'tenancies_not_matching_application', (select coalesce(json_agg(x), '[]') from (
     select t.id from public.tenancies t join public.applications a on a.id=t.application_id
     where a.tenant_id is distinct from t.tenant_id or a.listing_id is distinct from t.listing_id) x),
  'open_applications_on_rented_listings', (select coalesce(json_agg(x), '[]') from (
     select a.id, a.status from public.applications a join public.listings l on l.id=a.listing_id
     where l.status='rented' and a.status in ('pending','info_requested','approved')) x),
  'active_tenancies_on_listings_still_public', (select coalesce(json_agg(x), '[]') from (
     select t.id, t.listing_id from public.tenancies t join public.listings l on l.id=t.listing_id
     where t.status='active' and l.status='approved'
     and not exists (select 1 from public.rental_terms r where r.tenancy_id=t.id and r.status='signed')) x)
) as r8;

-- ===== R9. Application status values actually stored =====
select coalesce(json_agg(x), '[]') as r9 from (select status, count(*) n from public.applications group by status) x;

-- ===== R10. Storage: buckets and who can read/write them =====
select json_build_object(
  'buckets', (select coalesce(json_agg(x), '[]') from (select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by name) x),
  'policies', (select coalesce(json_agg(x), '[]') from (select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage' and tablename='objects') x)
) as r10;

-- ===== R11. Tables with RLS disabled in public (should be none that hold user data) =====
select coalesce(json_agg(x), '[]') as r11 from (
  select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity order by 1) x;

-- ===== R12. Notification trigger wiring and recent notification types =====
select json_build_object(
  'notify_triggers', (select coalesce(json_agg(x), '[]') from (
     select c.relname as on_table, t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
     where not t.tgisinternal and t.tgfoid='public.notify_trigger'::regproc) x),
  'notification_columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type from information_schema.columns where table_schema='public' and table_name='notifications' order by ordinal_position) x)
) as r12;
