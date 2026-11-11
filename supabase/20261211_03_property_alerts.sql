begin;

-- The alerts table (safe if it already exists) with the columns the app uses.
create table if not exists public.property_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  location text,
  property_type text,
  min_price numeric,
  max_price numeric,
  bedrooms integer,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.property_alerts add column if not exists active boolean not null default true;
alter table public.property_alerts add column if not exists created_at timestamptz not null default now();

-- People can only see and change their own alerts.
alter table public.property_alerts enable row level security;
drop policy if exists pa_own_select on public.property_alerts;
drop policy if exists pa_own_insert on public.property_alerts;
drop policy if exists pa_own_update on public.property_alerts;
drop policy if exists pa_own_delete on public.property_alerts;
create policy pa_own_select on public.property_alerts for select using (user_id = auth.uid());
create policy pa_own_insert on public.property_alerts for insert with check (user_id = auth.uid());
create policy pa_own_update on public.property_alerts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pa_own_delete on public.property_alerts for delete using (user_id = auth.uid());

-- When a listing becomes approved, tell everyone whose alert matches it (in-app notification).
-- A failure here can never block the approval.
create or replace function public.eb_notify_property_alerts()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare a record;
begin
  for a in
    select pa.user_id, pa.label
      from public.property_alerts pa
     where pa.active is not false
       and pa.user_id is distinct from new.landlord_id
       and (pa.location is null or trim(pa.location) = ''
            or position(lower(trim(pa.location)) in lower(coalesce(new.location_text, ''))) > 0)
       and (pa.property_type is null or pa.property_type = new.property_type)
       and (pa.min_price is null or new.price_monthly >= pa.min_price)
       and (pa.max_price is null or new.price_monthly <= pa.max_price)
       and (pa.bedrooms is null
            or (pa.bedrooms >= 4 and new.bedrooms >= pa.bedrooms)
            or (pa.bedrooms < 4 and new.bedrooms = pa.bedrooms))
     limit 500
  loop
    perform public.notify_user(
      a.user_id,
      'New property matches your alert',
      coalesce(nullif(a.label, ''), 'Your saved search') || ': ' || coalesce(new.title, 'A new property') || ' is now listed.',
      '/listing/' || new.id::text,
      'listing'
    );
  end loop;
  return new;
exception when others then
  raise warning 'eb_notify_property_alerts failed for listing %: %', new.id, sqlerrm;
  return new;
end $f$;

drop trigger if exists zz_notify_property_alerts on public.listings;
create trigger zz_notify_property_alerts
  after update of status on public.listings
  for each row
  when (old.status is distinct from new.status and new.status = 'approved')
  execute function public.eb_notify_property_alerts();

commit;
-- ROLLBACK: drop trigger if exists zz_notify_property_alerts on public.listings;
--           drop function if exists public.eb_notify_property_alerts();
