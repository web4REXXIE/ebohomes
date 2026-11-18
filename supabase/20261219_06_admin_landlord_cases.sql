-- EboHomes 20261219_06: Idea 16, lets an admin pick the handover or dispute a finding is about (read-only, admin only).
-- WHAT: one function, eb_admin_landlord_cases(landlord). Returns that landlord's recent handovers and tenancy disputes
--       (id, tenancy code, status, date) so the admin screen can link a finding to the real record.
-- DOES NOT: change any table, policy or existing function. Only an admin can run it. Safe to re-run.
-- REQUIRES: 20261219_04 (eb_is_admin is used the same way). ROLLBACK: drop function if exists public.eb_admin_landlord_cases(uuid);
begin;

create or replace function public.eb_admin_landlord_cases(p_landlord uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  return jsonb_build_object(
    'handovers', coalesce((select jsonb_agg(x.j order by x.ts desc) from (
        select h.created_at as ts, jsonb_build_object(
          'id', h.id, 'tenancy_code', t.tenancy_code, 'status', h.status, 'completed_via', h.completed_via,
          'disputed_at', h.disputed_at, 'created_at', h.created_at) as j
        from public.tenancy_handovers h join public.tenancies t on t.id = h.tenancy_id
        where h.landlord_id = p_landlord order by h.created_at desc limit 50) x), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(y.j order by y.ts desc) from (
        select d.created_at as ts, jsonb_build_object(
          'id', d.id, 'tenancy_code', t.tenancy_code, 'category', d.category, 'status', d.status, 'created_at', d.created_at) as j
        from public.tenancy_disputes d join public.tenancies t on t.id = d.tenancy_id
        where t.landlord_id = p_landlord order by d.created_at desc limit 50) y), '[]'::jsonb)
  );
end;
$f$;
revoke all on function public.eb_admin_landlord_cases(uuid) from public, anon;
grant execute on function public.eb_admin_landlord_cases(uuid) to authenticated;

commit;
