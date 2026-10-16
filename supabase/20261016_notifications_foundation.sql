begin;

-- 1. read_at, filled automatically by a trigger
alter table public.notifications add column if not exists read_at timestamptz;

alter table public.notifications alter column user_id set not null;
alter table public.notifications alter column read set not null;

create or replace function public.notifications_set_read_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.read is true and old.read is distinct from true then
    new.read_at := now();
  elsif new.read is not true then
    new.read_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_set_read_at on public.notifications;
create trigger notifications_set_read_at
  before update of read on public.notifications
  for each row execute function public.notifications_set_read_at();

-- 2. Indexes
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read = false;

-- 3. Privileges: read own rows, update only the read column
revoke all on public.notifications from anon;
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

-- 4. Replace overlapping policies with a clean set
alter table public.notifications enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy %I on public.notifications', p.policyname);
  end loop;
end $$;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_select_admin on public.notifications
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5. Preferences (security alerts are always on, so no column for them)
create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true,
  messages boolean not null default true,
  applications boolean not null default true,
  listings boolean not null default true,
  renewals boolean not null default true,
  sound_enabled boolean not null default false,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

revoke all on public.notification_preferences from anon;
revoke all on public.notification_preferences from authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

create policy prefs_select_own on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy prefs_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy prefs_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;