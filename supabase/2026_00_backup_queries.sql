-- READ-ONLY. Run BEFORE the batch 5 migrations and export the result as CSV. Keep the CSV.
-- It holds the live definitions that file 01 replaces, so you can restore them.
select 'FUNCTION' as kind, p.proname::text as name, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('notify_trigger', 'notify_user', 'enforce_application_rules', 'handle_tenancy_created', 'is_admin')
union all
select 'TRIGGER', c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
  and c.relname in ('applications', 'payments', 'renewals', 'tenancies')
union all
select 'POLICY', tablename || '.' || policyname,
       cmd || ' | using=' || coalesce(qual, '') || ' | check=' || coalesce(with_check, '')
from pg_policies where schemaname = 'public' and tablename = 'payments'
union all
select 'COLUMN_CHECK', table_name || '.' || column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'applications' and column_name in ('decided_by', 'decided_at', 'landlord_recommendation', 'case_ref'))
    or (table_name = 'payments' and column_name in ('verified_by', 'recorded_by', 'verified_at'))
    or (table_name = 'tenancies' and column_name in ('rent_amount', 'end_date', 'landlord_id', 'tenant_id', 'status')))
order by 1, 2;