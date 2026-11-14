-- EboHomes 20261213_01: Stage 2a. Estates and units (additive only).
-- WHY: a listing is the advertisement. A unit is the rentable thing. An estate holds units.
-- WHAT: creates estates and units, backfills ONE estate + ONE unit per existing listing.
-- DOES NOT: touch listings, applications, tenancies, offers, payments, triggers or existing policies.
-- ROLLBACK (bottom of file). Safe to re-run.

begin;

do $$
begin
  if to_regclass('public.listings') is null or to_regclass('public.properties') is null then
    raise exception 'listings or properties table is missing';
  end if;
  if to_regproc('public.is_admin()') is null then
    raise exception 'public.is_admin() is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'listings' and column_name = 'property_id') then
    raise exception 'listings.property_id is missing';
  end if;
end $$;

create table if not exists public.estates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  kind text not null default 'single_house'
    check (kind in ('single_house', 'block', 'estate', 'hostel')),
  address_text text,
  property_id uuid references public.properties(id) on delete set null,
  legacy_listing_id uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists estates_owner_idx on public.estates (owner_id);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  estate_id uuid not null references public.estates(id) on delete restrict,
  unit_label text not null check (char_length(btrim(unit_label)) between 1 and 20),
  floor_no int,
  group_label text,
  purpose text not null default 'rent' check (purpose in ('rent', 'sale')),
  status text not null default 'available'
    check (status in ('available', 'reserved', 'rented', 'off_market')),
  listing_id uuid unique references public.listings(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (estate_id, unit_label)
);
create index if not exists units_estate_idx on public.units (estate_id);

alter table public.estates enable row level security;
alter table public.units enable row level security;
revoke all on public.estates from anon, authenticated, public;
revoke all on public.units from anon, authenticated, public;
grant select on public.estates to authenticated;
grant select on public.units to authenticated;

drop policy if exists "Owners and admins read estates" on public.estates;
create policy "Owners and admins read estates" on public.estates
  for select to authenticated
  using (owner_id = auth.uid() or coalesce(public.is_admin(), false));

drop policy if exists "Owners and admins read units" on public.units;
create policy "Owners and admins read units" on public.units
  for select to authenticated
  using (exists (
    select 1 from public.estates e
    where e.id = units.estate_id
      and (e.owner_id = auth.uid() or coalesce(public.is_admin(), false))
  ));

-- Backfill: one estate per listing
insert into public.estates (owner_id, name, kind, address_text, property_id, legacy_listing_id)
select l.landlord_id,
       left(coalesce(nullif(btrim(l.title), ''), 'Untitled home'), 120),
       'single_house',
       l.location_text,
       l.property_id,
       l.id
from public.listings l
where l.landlord_id is not null
  and not exists (select 1 from public.estates e where e.legacy_listing_id = l.id);

-- Backfill: one unit per backfilled estate
insert into public.units (estate_id, unit_label, listing_id, status)
select e.id, '1', l.id,
       case when l.status = 'rented' then 'rented' else 'available' end
from public.estates e
join public.listings l on l.id = e.legacy_listing_id
where not exists (select 1 from public.units u where u.listing_id = l.id);

commit;

-- CHECK (read only): the three numbers should match.
select (select count(*) from public.listings) as listings,
       (select count(*) from public.estates where legacy_listing_id is not null) as estates,
       (select count(*) from public.units) as units;

-- ROLLBACK (only if needed; nothing else depends on these yet):
-- drop table if exists public.units;
-- drop table if exists public.estates;
