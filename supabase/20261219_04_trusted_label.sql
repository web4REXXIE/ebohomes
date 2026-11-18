-- EboHomes 20261219_04: Idea 16, the earned "Trusted" label (database part only).
-- RULE (decided by you, 18 Nov 2026): a landlord is Trusted when BOTH are true:
--   1. at least 3 handovers completed with BOTH sides confirmed (completed_via = 'both_parties'), and
--   2. no upheld finding against them (recorded by an admin, not lifted), and no dispute still open against them.
-- An open dispute only PAUSES the label. It is not a finding. Only an admin can record or lift a finding.
-- The label is calculated here. No screen, landlord or tenant can switch it on.
-- Handovers completed by admin review or by the 48-hour window passing do NOT count toward the 3.
-- HOW: one new table (admin-only, no direct access) and a few functions.
-- DOES NOT: touch tenancies, handovers, disputes, listings, payments, payouts or any existing policy or function.
-- REQUIRES: 20261105_01 (handovers), 20261020_3 (tenancy_disputes). Safe to re-run.
-- ROLLBACK: bottom of file.

begin;

-- PREFLIGHT
do $$
begin
  if to_regclass('public.tenancy_handovers') is null then raise exception 'Preflight failed: tenancy_handovers is missing (apply 20261105_01).'; end if;
  if to_regclass('public.tenancy_disputes') is null then raise exception 'Preflight failed: tenancy_disputes is missing (apply 20261020_3).'; end if;
  if to_regclass('public.tenancies') is null or to_regclass('public.listings') is null or to_regclass('public.profiles') is null then
    raise exception 'Preflight failed: tenancies, listings or profiles is missing.';
  end if;
  if to_regprocedure('public.eb_is_admin()') is null then raise exception 'Preflight failed: eb_is_admin() is missing.'; end if;
end $$;

-- 1. Upheld findings. Admin writes only through the two admin functions below.
create table if not exists public.landlord_upheld_findings (
  id uuid primary key default gen_random_uuid(),
  landlord_id uuid not null references public.profiles(id),
  source text not null check (source in ('handover', 'dispute', 'other')),
  source_id uuid,
  note text not null check (char_length(trim(note)) >= 20),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id),
  lift_note text,
  check ((lifted_at is null) = (lifted_by is null)),
  check (lifted_at is null or (lift_note is not null and char_length(trim(lift_note)) >= 20))
);
create index if not exists landlord_upheld_findings_landlord_idx on public.landlord_upheld_findings (landlord_id) where lifted_at is null;

alter table public.landlord_upheld_findings enable row level security;
-- No policies on purpose, and no table privileges. Everything goes through the functions below.
revoke all on table public.landlord_upheld_findings from public, anon, authenticated;

-- 2. The number needed lives in ONE place.
create or replace function public.eb_trusted_threshold() returns integer
language sql immutable as $f$ select 3 $f$;
revoke all on function public.eb_trusted_threshold() from public, anon, authenticated;

-- 3. Completed handovers confirmed by both sides.
create or replace function public.eb_trusted_completed_count(p_landlord uuid) returns integer
language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select count(*)::int from public.tenancy_handovers h
  where h.landlord_id = p_landlord and h.status = 'completed' and h.completed_via = 'both_parties'
$f$;
revoke all on function public.eb_trusted_completed_count(uuid) from public, anon, authenticated;

-- 4. Why the label is blocked right now. null = nothing blocks it.
create or replace function public.eb_trusted_blocker(p_landlord uuid) returns text
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if exists (select 1 from public.landlord_upheld_findings f where f.landlord_id = p_landlord and f.lifted_at is null) then
    return 'upheld_finding';
  end if;
  -- a handover dispute raised by the tenant, still open
  if exists (select 1 from public.tenancy_handovers h
              where h.landlord_id = p_landlord and h.status = 'disputed' and h.disputed_role is distinct from 'landlord') then
    return 'open_dispute';
  end if;
  -- a tenancy dispute raised by someone other than the landlord, still open
  if exists (select 1 from public.tenancy_disputes d join public.tenancies t on t.id = d.tenancy_id
              where t.landlord_id = p_landlord and d.status in ('open', 'under_review') and d.raised_by is distinct from p_landlord) then
    return 'open_dispute';
  end if;
  return null;
end;
$f$;
revoke all on function public.eb_trusted_blocker(uuid) from public, anon, authenticated;

-- 5. THE RULE. Used by every function below.
create or replace function public.eb_landlord_is_trusted(p_landlord uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp'
as $f$
  select p_landlord is not null
     and public.eb_trusted_completed_count(p_landlord) >= public.eb_trusted_threshold()
     and public.eb_trusted_blocker(p_landlord) is null
$f$;
revoke all on function public.eb_landlord_is_trusted(uuid) from public, anon, authenticated;

-- 6. Public: is this landlord Trusted? A yes/no only. No counts and no reasons are shown to the public.
create or replace function public.landlord_is_trusted(p_landlord uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp'
as $f$ select public.eb_landlord_is_trusted(p_landlord) $f$;
revoke all on function public.landlord_is_trusted(uuid) from public;
grant execute on function public.landlord_is_trusted(uuid) to anon, authenticated;

-- 7. Public: is the landlord of this listing Trusted?
create or replace function public.listing_landlord_trusted(p_listing uuid) returns boolean
language sql stable security definer set search_path to 'public','pg_temp'
as $f$ select coalesce((select public.eb_landlord_is_trusted(l.landlord_id) from public.listings l where l.id = p_listing), false) $f$;
revoke all on function public.listing_landlord_trusted(uuid) from public;
grant execute on function public.listing_landlord_trusted(uuid) to anon, authenticated;

-- 8. The signed-in landlord's own progress. Says "paused" but never says why.
create or replace function public.my_trust_progress() returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); n integer; need integer := public.eb_trusted_threshold(); blocked boolean;
begin
  if v is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  n := public.eb_trusted_completed_count(v);
  blocked := public.eb_trusted_blocker(v) is not null;
  return jsonb_build_object(
    'completed', n,
    'needed', need,
    'paused', blocked and n >= need,
    'trusted', n >= need and not blocked
  );
end;
$f$;
revoke all on function public.my_trust_progress() from public, anon;
grant execute on function public.my_trust_progress() to authenticated;

-- 9. Admin: record an upheld finding against a landlord. The label goes away straight away.
create or replace function public.eb_admin_record_upheld_finding(p_landlord uuid, p_source text, p_source_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); v_note text := trim(coalesce(p_note, '')); v_id uuid;
begin
  if v is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  if p_landlord is null or not exists (select 1 from public.profiles where id = p_landlord) then raise exception 'Landlord not found' using errcode = 'P0002'; end if;
  if p_source is null or p_source not in ('handover', 'dispute', 'other') then raise exception 'Unknown source' using errcode = '22023'; end if;
  if char_length(v_note) < 20 or char_length(v_note) > 1000 then raise exception 'Write a note of 20 to 1000 characters' using errcode = '22023'; end if;
  if p_source = 'handover' and not exists (select 1 from public.tenancy_handovers h where h.id = p_source_id and h.landlord_id = p_landlord) then
    raise exception 'That handover does not belong to this landlord' using errcode = '22023';
  end if;
  if p_source = 'dispute' and not exists (select 1 from public.tenancy_disputes d join public.tenancies t on t.id = d.tenancy_id where d.id = p_source_id and t.landlord_id = p_landlord) then
    raise exception 'That dispute does not belong to this landlord' using errcode = '22023';
  end if;
  if p_source = 'other' and p_source_id is not null then raise exception 'Leave the source id empty for "other"' using errcode = '22023'; end if;
  insert into public.landlord_upheld_findings (landlord_id, source, source_id, note, recorded_by)
  values (p_landlord, p_source, p_source_id, v_note, v) returning id into v_id;
  return v_id;
end;
$f$;
revoke all on function public.eb_admin_record_upheld_finding(uuid, text, uuid, text) from public, anon;
grant execute on function public.eb_admin_record_upheld_finding(uuid, text, uuid, text) to authenticated;

-- 10. Admin: lift a finding (for example, recorded by mistake). It stays on record, it just stops counting.
create or replace function public.eb_admin_lift_upheld_finding(p_finding uuid, p_note text)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); v_note text := trim(coalesce(p_note, ''));
begin
  if v is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  if char_length(v_note) < 20 or char_length(v_note) > 1000 then raise exception 'Write a note of 20 to 1000 characters' using errcode = '22023'; end if;
  update public.landlord_upheld_findings set lifted_at = now(), lifted_by = v, lift_note = v_note
   where id = p_finding and lifted_at is null;
  if not found then raise exception 'Finding not found or already lifted' using errcode = 'P0002'; end if;
end;
$f$;
revoke all on function public.eb_admin_lift_upheld_finding(uuid, text) from public, anon;
grant execute on function public.eb_admin_lift_upheld_finding(uuid, text) to authenticated;

-- 11. Admin: one landlord's trust picture, with the reason.
create or replace function public.eb_admin_landlord_trust(p_landlord uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Only EboHomes administrators can do this' using errcode = '42501'; end if;
  return jsonb_build_object(
    'completed', public.eb_trusted_completed_count(p_landlord),
    'needed', public.eb_trusted_threshold(),
    'blocker', public.eb_trusted_blocker(p_landlord),
    'trusted', public.eb_landlord_is_trusted(p_landlord),
    'findings', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'source', f.source, 'source_id', f.source_id, 'note', f.note, 'created_at', f.created_at,
        'lifted_at', f.lifted_at, 'lift_note', f.lift_note) order by f.created_at desc)
      from public.landlord_upheld_findings f where f.landlord_id = p_landlord), '[]'::jsonb)
  );
end;
$f$;
revoke all on function public.eb_admin_landlord_trust(uuid) from public, anon;
grant execute on function public.eb_admin_landlord_trust(uuid) to authenticated;

commit;

-- ======================= CHECKS TO RUN AFTER (SQL editor, read only) =======================
-- A. Function exists and is public-readable:
--    select public.landlord_is_trusted('00000000-0000-0000-0000-000000000000');          -- expect false
-- B. Table has RLS on and no policies:
--    select relrowsecurity from pg_class where oid = 'public.landlord_upheld_findings'::regclass;   -- expect true
--    select count(*) from pg_policies where tablename = 'landlord_upheld_findings';                   -- expect 0
-- C. Who has how many completed handovers (admin SQL editor only):
--    select landlord_id, count(*) from public.tenancy_handovers
--     where status = 'completed' and completed_via = 'both_parties' group by 1 order by 2 desc;
-- D. Pick a landlord id from C and confirm:
--    select public.landlord_is_trusted('<landlord id>');   -- true only with 3 or more AND nothing blocking
-- E. The table must NOT be readable by the public (run as the anon role in the API, or confirm in Table Editor that
--    no policies exist). Direct reads must fail.

-- ROLLBACK (removes the label completely; no other data is touched):
--   drop function if exists public.eb_admin_landlord_trust(uuid), public.eb_admin_lift_upheld_finding(uuid, text),
--     public.eb_admin_record_upheld_finding(uuid, text, uuid, text), public.my_trust_progress(),
--     public.listing_landlord_trusted(uuid), public.landlord_is_trusted(uuid), public.eb_landlord_is_trusted(uuid),
--     public.eb_trusted_blocker(uuid), public.eb_trusted_completed_count(uuid), public.eb_trusted_threshold();
--   drop table if exists public.landlord_upheld_findings;   -- only if it has no rows you need
