-- EboHomes 20261212_01  *** REVIEW FIRST, THEN RUN IN THE SUPABASE SQL EDITOR ***
-- WHAT: one private row per person for a home address and one emergency contact.
-- WHO CAN READ: the person themself and EboHomes admins. Nobody else.
-- DOES NOT: change profiles, listings, applications or any existing rule. Safe to re-run.
begin;

create table if not exists public.profile_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  home_address text check (home_address is null or char_length(home_address) <= 300),
  city text check (city is null or char_length(city) <= 100),
  emergency_name text check (emergency_name is null or char_length(emergency_name) <= 120),
  emergency_phone text check (emergency_phone is null or char_length(emergency_phone) <= 30),
  emergency_relationship text check (emergency_relationship is null or char_length(emergency_relationship) <= 60),
  updated_at timestamptz not null default now()
);

alter table public.profile_contacts enable row level security;
revoke all on public.profile_contacts from anon;

drop policy if exists pc_own_select on public.profile_contacts;
drop policy if exists pc_own_insert on public.profile_contacts;
drop policy if exists pc_own_update on public.profile_contacts;
drop policy if exists pc_admin_select on public.profile_contacts;

create policy pc_own_select on public.profile_contacts for select to authenticated using (user_id = auth.uid());
create policy pc_own_insert on public.profile_contacts for insert to authenticated with check (user_id = auth.uid());
create policy pc_own_update on public.profile_contacts for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pc_admin_select on public.profile_contacts for select to authenticated using (public.is_admin());

commit;

-- ROLLBACK: drop table if exists public.profile_contacts;
