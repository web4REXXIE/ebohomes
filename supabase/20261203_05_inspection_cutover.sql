-- EboHomes 20261203_05: Phase 10.4 Step E - cutover. Direct writes to inspections close.
-- WHAT: (1) saves a copy of every policy it is about to drop, (2) drops INSERT and DELETE policies on property_inspections,
--       (3) drops browser write policies (INSERT/UPDATE/DELETE) on the OLD 'inspection-evidence' bucket,
--       (4) removes INSERT, DELETE and TRUNCATE rights on property_inspections from browser roles.
-- AFTER THIS: inspectors can only submit through submit_inspection and the checked upload routes. Old open tabs and old app
--       versions that insert directly will fail with a permission error and must reload. That is the planned cutover.
-- DOES NOT: touch reading (admins still view legacy files and inspections), UPDATE on property_inspections (admin summary edits
--       and the guard trigger keep working), the new 'inspection-files' bucket, the admin ALL policy, or any existing inspection.
-- SAFETY: an ALL-commands policy that mentions admin in its rule is left alone (the INSERT/DELETE revoke below still stops
--       direct inserts for everyone). Any other ALL policy stops the whole script with its name and changes nothing.
-- ROLLBACK: at the bottom.
begin;

create table if not exists public.inspection_cutover_policy_backup (
  saved_at timestamptz not null default now(),
  schemaname text, tablename text, policyname text, cmd text, roles text[], qual text, with_check text
);
alter table public.inspection_cutover_policy_backup enable row level security;
revoke all on public.inspection_cutover_policy_backup from anon, authenticated, public;

do $$
declare p record; v_all text;
begin
  select string_agg(schemaname || '.' || tablename || ' / ' || policyname, '; ') into v_all
    from pg_policies
   where cmd = 'ALL'
     and coalesce(qual, '') not ilike '%admin%'
     and ((schemaname = 'public' and tablename = 'property_inspections')
       or (schemaname = 'storage' and tablename = 'objects'
           and (coalesce(qual, '') ilike '%inspection-evidence%' or coalesce(with_check, '') ilike '%inspection-evidence%')));
  if v_all is not null then
    raise exception 'Stopped, nothing changed. A non-admin policy covering ALL commands exists: %. Send its definition so it can be split safely.', v_all;
  end if;

  for p in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check from pg_policies
     where (schemaname = 'public' and tablename = 'property_inspections' and cmd in ('INSERT', 'DELETE'))
        or (schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE')
            and (coalesce(qual, '') ilike '%inspection-evidence%' or coalesce(with_check, '') ilike '%inspection-evidence%'))
  loop
    insert into public.inspection_cutover_policy_backup (schemaname, tablename, policyname, cmd, roles, qual, with_check)
    values (p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text[], p.qual, p.with_check);
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

revoke insert, delete, truncate on public.property_inspections from anon, authenticated, public;

commit;

-- ROLLBACK (restores direct inserts; use only if the new flow is broken and cannot be fixed quickly):
-- grant insert, delete on public.property_inspections to authenticated;
-- Then run this query, copy the statements it prints, and run them to recreate the saved policies:
-- select format('create policy %I on %I.%I for %s to %s %s %s;', policyname, schemaname, tablename, lower(cmd),
--          array_to_string(roles, ','),
--          case when qual is not null then 'using (' || qual || ')' else '' end,
--          case when with_check is not null then 'with check (' || with_check || ')' else '' end)
--   from public.inspection_cutover_policy_backup;
