-- ROLLBACK for 20261022_01_viewing_workflow.sql. Only run if you must undo it.
-- Non-destructive: keeps the new columns and the two new tables (their data is kept). Restores the old rules.
-- AFTER this, re-run supabase/20261020_02_viewings_terms.sql once: it restores the old request_viewing(3 args), schedule/complete/cancel.
begin;

update public.viewings set status = 'requested' where status in ('approved', 'reschedule_proposed');
update public.viewings set status = 'cancelled' where status = 'rejected';

drop function if exists public.request_viewing(uuid, timestamptz, text, text);
drop function if exists public.admin_respond_viewing(uuid, text, timestamptz, text, text);
drop function if exists public.tenant_respond_proposal(uuid, boolean, text);
drop function if exists public.record_viewing_contact(uuid, text, text);
drop function if exists public.tenant_viewing_decision(uuid, boolean);

alter table public.viewings drop constraint if exists viewings_status_check;
alter table public.viewings add constraint viewings_status_check
  check (status in ('requested', 'scheduled', 'completed', 'no_show', 'cancelled'));

drop index if exists public.viewings_one_open_per_application;
create unique index viewings_one_open_per_application on public.viewings (application_id) where status in ('requested', 'scheduled');

commit;