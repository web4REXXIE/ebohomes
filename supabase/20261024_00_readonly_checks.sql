-- EboHomes 20261024_00: READ-ONLY checks. Changes nothing.
-- Run ONE query at a time in the Supabase SQL Editor (it only shows the last result). Paste each result back.
-- Each query returns a single row, so nothing gets cut off.

-- Q1: tenancies table (statuses, columns, constraints, indexes)
select json_build_object(
  'statuses', (select coalesce(json_agg(x), '[]') from (select status, count(*) n from public.tenancies group by status) x),
  'columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, column_default from information_schema.columns where table_schema='public' and table_name='tenancies' order by ordinal_position) x),
  'constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.tenancies'::regclass) x),
  'indexes', (select coalesce(json_agg(x), '[]') from (select indexname, indexdef from pg_indexes where schemaname='public' and tablename='tenancies') x)
) as q1;

-- Q2: triggers on tenancies, rental_terms and applications
select json_build_object(
  'tenancies', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.tenancies'::regclass and not tgisinternal) x),
  'rental_terms', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.rental_terms'::regclass and not tgisinternal) x),
  'applications', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.applications'::regclass and not tgisinternal) x)
) as q2;

-- Q3: listings (statuses, status constraint, triggers)
select json_build_object(
  'statuses', (select coalesce(json_agg(x), '[]') from (select status, count(*) n from public.listings group by status) x),
  'constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.listings'::regclass and contype='c') x),
  'triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.listings'::regclass and not tgisinternal) x)
) as q3;

-- Q4: current production definitions of the functions this package would touch
select json_agg(json_build_object('name', p.proname, 'def', pg_get_functiondef(p.oid))) as q4
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('tenant_viewing_decision','handle_tenancy_created','eb_tenancy_guard','eb_tenancy_role');

-- Q5: payments table (needed before any Paystack-to-payments link; nothing is built on it yet)
select json_build_object(
  'columns', (select coalesce(json_agg(x), '[]') from (select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' and table_name='payments' order by ordinal_position) x),
  'constraints', (select coalesce(json_agg(x), '[]') from (select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='public.payments'::regclass) x),
  'triggers', (select coalesce(json_agg(x), '[]') from (select tgname, pg_get_triggerdef(oid) def from pg_trigger where tgrelid='public.payments'::regclass and not tgisinternal) x)
) as q5;

-- Q6: legacy check. Rented listings whose tenancy has NO signed terms
-- (these exist because the old trigger rented at tenancy creation).
select coalesce(json_agg(x), '[]') as q6 from (
  select l.id as listing_id, t.id as tenancy_id, t.status as tenancy_status
  from public.listings l
  join public.tenancies t on t.listing_id = l.id
  where l.status = 'rented'
    and not exists (select 1 from public.rental_terms r where r.tenancy_id = t.id and r.status = 'signed')
) x;

-- Q7: is the tenancy guard installed? (0 rows = not installed, 1 row = installed)
select tgname from pg_trigger where tgrelid='public.tenancies'::regclass and tgname='a_eb_tenancy_guard';

-- Q8: payment-related functions that exist only in production (not in the repo). Needed before the Paystack link is finalised.
select json_agg(json_build_object('name', p.proname, 'def', pg_get_functiondef(p.oid))) as q8
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname in ('payments_guard','admin_review_payment','get_receipt_v2','verify_receipt_v2','my_tenancies');

-- Q9: row level security policies on payments and rental_terms
select json_agg(json_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'using', qual, 'check', with_check)) as q9
from pg_policies where schemaname='public' and tablename in ('payments','rental_terms','tenancies');