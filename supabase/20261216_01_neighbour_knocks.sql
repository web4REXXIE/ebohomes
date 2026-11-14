-- EboHomes 20261216_01: Stage 5c. Neighbour knocks + public building read (additive only).
-- WHY: residents greet neighbours with stickers. Visitors and tenants must be able to open a live building page.
-- WHAT: adds neighbour_knocks, 4 functions, and read policies for buildings that have a live listing.
-- DOES NOT: touch listings, applications, tenancies, offers, payments or existing policies.
-- ROLLBACK at bottom. Safe to re-run.

begin;

do $$
begin
  if to_regclass('public.estates') is null or to_regclass('public.units') is null
     or to_regclass('public.tenancies') is null or to_regclass('public.listings') is null then
    raise exception 'estates, units, tenancies or listings table is missing';
  end if;
  if to_regprocedure('public.notify_user(uuid,text,text,text,text)') is null then
    raise exception 'public.notify_user is missing';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing';
  end if;
end $$;

-- 1. Is this building public? True when at least one of its units has a live (approved) listing.
create or replace function public.eb_estate_is_public(p_estate uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.units u
    join public.listings l on l.id = u.listing_id
    where u.estate_id = p_estate and l.status = 'approved'
  )
$fn$;

revoke all on function public.eb_estate_is_public(uuid) from public;
grant execute on function public.eb_estate_is_public(uuid) to anon, authenticated;

grant select on public.estates to anon;
grant select on public.units to anon;

drop policy if exists "Public reads live estates" on public.estates;
create policy "Public reads live estates" on public.estates
  for select to anon, authenticated
  using (public.eb_estate_is_public(id));

drop policy if exists "Public reads live units" on public.units;
create policy "Public reads live units" on public.units
  for select to anon, authenticated
  using (public.eb_estate_is_public(estate_id));

-- 2. Knocks
create table if not exists public.neighbour_knocks (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete cascade,
  from_user uuid not null,
  to_user uuid not null,
  from_unit uuid not null references public.units(id) on delete cascade,
  to_unit uuid not null references public.units(id) on delete cascade,
  sticker text not null check (sticker in ('knock', 'welcome', 'howfar')),
  created_at timestamptz not null default now()
);
create index if not exists neighbour_knocks_to_idx on public.neighbour_knocks (to_user, created_at desc);
create index if not exists neighbour_knocks_from_idx on public.neighbour_knocks (from_user, to_unit, created_at desc);

alter table public.neighbour_knocks enable row level security;
revoke all on public.neighbour_knocks from anon, authenticated, public;
grant select on public.neighbour_knocks to authenticated;

drop policy if exists "Sender, receiver and admins read knocks" on public.neighbour_knocks;
create policy "Sender, receiver and admins read knocks" on public.neighbour_knocks
  for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid() or coalesce(public.is_admin(), false));

-- 3. Internal: which unit in this building does this person live in? (active tenancy only)
create or replace function public.eb_my_unit(p_estate uuid, p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select u.id
    from public.units u
    join public.tenancies t on t.listing_id = u.listing_id
   where u.estate_id = p_estate
     and t.tenant_id = p_user
     and t.status = 'active'
   limit 1
$fn$;

revoke all on function public.eb_my_unit(uuid, uuid) from public, anon, authenticated;

-- 4. For the page: am I a resident here, and which doors are lived in? Non-residents get nothing.
create or replace function public.estate_resident_view(p_estate uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_me uuid;
  v_occ jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('resident', false, 'my_unit', null, 'occupied', '[]'::jsonb);
  end if;
  v_me := public.eb_my_unit(p_estate, v_uid);
  if v_me is null then
    return jsonb_build_object('resident', false, 'my_unit', null, 'occupied', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(u.id), '[]'::jsonb) into v_occ
    from public.units u
   where u.estate_id = p_estate
     and u.id <> v_me
     and exists (select 1 from public.tenancies t where t.listing_id = u.listing_id and t.status = 'active');
  return jsonb_build_object('resident', true, 'my_unit', v_me, 'occupied', v_occ);
end
$fn$;

revoke all on function public.estate_resident_view(uuid) from public, anon;
grant execute on function public.estate_resident_view(uuid) to authenticated;

-- 5. Send a knock. Residents only. Fixed stickers. One per door per day, 20 a day.
create or replace function public.send_knock(p_to_unit uuid, p_sticker text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_to record;
  v_my uuid;
  v_my_label text;
  v_target uuid;
begin
  if v_uid is null then
    raise exception 'Please log in first' using errcode = '42501';
  end if;
  if p_sticker is null or p_sticker not in ('knock', 'welcome', 'howfar') then
    raise exception 'Choose one of the stickers' using errcode = '22023';
  end if;

  select id, estate_id, listing_id into v_to from public.units where id = p_to_unit;
  if not found then
    raise exception 'That door was not found' using errcode = '22023';
  end if;

  v_my := public.eb_my_unit(v_to.estate_id, v_uid);
  if v_my is null then
    raise exception 'Only people who live in this building can send greetings' using errcode = '42501';
  end if;
  if v_my = p_to_unit then
    raise exception 'That is your own door' using errcode = '22023';
  end if;

  select t.tenant_id into v_target
    from public.tenancies t
   where t.listing_id = v_to.listing_id and t.status = 'active'
   limit 1;
  if v_target is null then
    raise exception 'Nobody lives there yet' using errcode = '22023';
  end if;
  if v_target = v_uid then
    raise exception 'That door is yours too' using errcode = '22023';
  end if;

  if exists (select 1 from public.neighbour_knocks
              where from_user = v_uid and to_unit = p_to_unit and created_at > now() - interval '24 hours') then
    raise exception 'You already knocked on this door today' using errcode = '22023';
  end if;
  if (select count(*) from public.neighbour_knocks
       where from_user = v_uid and created_at > now() - interval '24 hours') >= 20 then
    raise exception 'That is enough knocking for today' using errcode = '22023';
  end if;

  insert into public.neighbour_knocks (estate_id, from_user, to_user, from_unit, to_unit, sticker)
  values (v_to.estate_id, v_uid, v_target, v_my, p_to_unit, p_sticker);

  select unit_label into v_my_label from public.units where id = v_my;
  perform public.notify_user(
    v_target,
    'Knock knock',
    'A neighbour in unit ' || coalesce(v_my_label, '?') || ' sent you a greeting.',
    '/estate/' || v_to.estate_id,
    'tenancy'
  );
end
$fn$;

revoke all on function public.send_knock(uuid, text) from public, anon;
grant execute on function public.send_knock(uuid, text) to authenticated;

commit;

-- CHECK (read only): expect table_1 = 1, functions_4 = 4, policies_3 = 3.
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'neighbour_knocks') as table_1,
  (select count(*) from pg_proc where proname in ('eb_estate_is_public', 'eb_my_unit', 'estate_resident_view', 'send_knock')) as functions_4,
  (select count(*) from pg_policies where policyname in ('Public reads live estates', 'Public reads live units', 'Sender, receiver and admins read knocks')) as policies_3;

-- ROLLBACK (only if needed):
-- drop policy if exists "Public reads live estates" on public.estates;
-- drop policy if exists "Public reads live units" on public.units;
-- drop table if exists public.neighbour_knocks;
-- drop function if exists public.send_knock(uuid, text);
-- drop function if exists public.estate_resident_view(uuid);
-- drop function if exists public.eb_my_unit(uuid, uuid);
-- drop function if exists public.eb_estate_is_public(uuid);
