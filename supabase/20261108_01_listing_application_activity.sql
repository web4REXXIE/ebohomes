-- EboHomes 20261108_01: tell tenants when ANOTHER application is in progress on a property.
-- WHY: tenants can only read their own applications (row security), so the property card and property page cannot
--      see whether someone else has applied. This adds ONE read-only yes/no answer per property.
-- WHAT IT RETURNS: for each approved (live) listing: other_in_progress = true when a DIFFERENT person has an
--      application that is pending, info_requested or approved and has not produced an ended tenancy.
--      It returns no names, no counts, no dates and no application details.
-- DOES NOT: change any table, row, trigger or policy. It does not reserve or block anything.
--      Double-booking is stopped by the existing guards from 20261024_02, not by this function.
-- ROLLBACK: drop function if exists public.listing_application_activity(uuid[]);

create or replace function public.listing_application_activity(p_listing_ids uuid[])
returns table (listing_id uuid, other_in_progress boolean)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select l.id as listing_id,
         exists (
           select 1
           from public.applications a
           where a.listing_id = l.id
             and a.status in ('pending', 'info_requested', 'approved')
             and a.tenant_id is distinct from auth.uid()
             and not exists (
               select 1 from public.tenancies t
               where t.application_id = a.id
                 and t.status in ('ended', 'terminated', 'cancelled', 'expired')
             )
         ) as other_in_progress
  from public.listings l
  where l.id = any (p_listing_ids)
    and l.status = 'approved'
    and cardinality(p_listing_ids) <= 100;
$function$;

revoke all on function public.listing_application_activity(uuid[]) from public;
grant execute on function public.listing_application_activity(uuid[]) to anon, authenticated;

-- CHECK (read only): must return 1 row.
select proname from pg_proc where proname = 'listing_application_activity';