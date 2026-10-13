-- EboHomes: renewals security migration
-- REVIEW BEFORE RUNNING. Assumes these columns exist:
--   renewals:   id, tenancy_id, landlord_id, tenant_id, new_rent, new_end_date,
--               terms, status, created_at, responded_at
--   tenancies:  id, landlord_id, tenant_id, status
-- Assumes public.is_admin() exists and returns boolean.

begin;

-- 1. Privileges: remove anon access, TRUNCATE, DELETE, REFERENCES, TRIGGER.
revoke all on public.renewals from anon;
revoke all on public.renewals from authenticated;

grant select on public.renewals to authenticated;
grant insert (tenancy_id, landlord_id, tenant_id, new_rent, new_end_date, terms, status)
  on public.renewals to authenticated;
grant update (status) on public.renewals to authenticated;

-- 2. RLS on, and replace any existing policies with a clean set.
alter table public.renewals enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'renewals'
  loop
    execute format('drop policy %I on public.renewals', p.policyname);
  end loop;
end $$;

create policy renewals_select_parties on public.renewals
  for select to authenticated
  using (auth.uid() = landlord_id or auth.uid() = tenant_id or public.is_admin());

create policy renewals_insert_landlord on public.renewals
  for insert to authenticated
  with check (auth.uid() = landlord_id and status = 'offered');

create policy renewals_update_tenant_respond on public.renewals
  for update to authenticated
  using (auth.uid() = tenant_id and status = 'offered')
  with check (auth.uid() = tenant_id and status in ('accepted', 'declined'));

-- 3. Guard trigger: validates parties against the real tenancy and locks columns.
create or replace function public.renewals_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
begin
  if tg_op = 'INSERT' then
    select landlord_id, tenant_id, status into t
    from public.tenancies where id = new.tenancy_id;

    if not found then
      raise exception 'Tenancy not found';
    end if;
    if new.landlord_id is distinct from t.landlord_id
       or new.tenant_id is distinct from t.tenant_id then
      raise exception 'Renewal parties must match the tenancy';
    end if;
    if auth.uid() is not null and auth.uid() <> t.landlord_id then
      raise exception 'Only the tenancy landlord can offer a renewal';
    end if;
    if t.status <> 'active' then
      raise exception 'Renewals can only be offered on active tenancies';
    end if;
    if new.status <> 'offered' then
      raise exception 'New renewals must have status offered';
    end if;
    if new.new_rent is null or new.new_rent <= 0 then
      raise exception 'New rent must be positive';
    end if;
    if new.new_end_date is null or new.new_end_date <= current_date then
      raise exception 'New end date must be in the future';
    end if;
    new.responded_at := null;
    return new;
  end if;

  -- UPDATE
  if auth.uid() is not null then
    if new.tenancy_id   is distinct from old.tenancy_id
       or new.landlord_id  is distinct from old.landlord_id
       or new.tenant_id    is distinct from old.tenant_id
       or new.new_rent     is distinct from old.new_rent
       or new.new_end_date is distinct from old.new_end_date
       or new.terms        is distinct from old.terms
       or new.created_at   is distinct from old.created_at then
      raise exception 'Renewal terms cannot be changed';
    end if;
    if auth.uid() <> old.tenant_id then
      raise exception 'Only the tenant can respond to a renewal offer';
    end if;
    if old.status <> 'offered' or new.status not in ('accepted', 'declined') then
      raise exception 'Invalid renewal status change';
    end if;
    new.responded_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists renewals_guard_trg on public.renewals;
create trigger renewals_guard_trg
  before insert or update on public.renewals
  for each row execute function public.renewals_guard();

-- 4. Only one open offer per tenancy.
-- If this fails, you have duplicate open offers; resolve them first.
create unique index if not exists renewals_one_open_offer_per_tenancy
  on public.renewals (tenancy_id) where status = 'offered';

commit;