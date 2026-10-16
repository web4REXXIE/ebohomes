-- EboHomes Phase 2: customer <-> EboHomes support messaging
-- Nothing in public.messages is deleted or edited.

begin;

create table if not exists public.support_threads (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.profiles(id),
  customer_role   text not null default 'tenant',
  category        text not null default 'general'
                  check (category in ('general','property','viewing','application',
                                      'payment','tenancy','maintenance','complaint','renewal')),
  subject         text not null check (char_length(btrim(subject)) between 1 and 120),
  listing_id      uuid references public.listings(id)     on delete set null,
  application_id  uuid references public.applications(id) on delete set null,
  tenancy_id      uuid references public.tenancies(id)    on delete set null,
  status          text not null default 'open' check (status in ('open','pending','closed')),
  assigned_to     uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create index if not exists support_threads_customer_idx on public.support_threads (customer_id, last_message_at desc);
create index if not exists support_threads_status_idx   on public.support_threads (status, last_message_at desc);
create index if not exists support_threads_app_idx      on public.support_threads (application_id) where application_id is not null;
create index if not exists support_threads_listing_idx  on public.support_threads (listing_id)     where listing_id is not null;

create table if not exists public.support_messages (
  id                      uuid primary key default gen_random_uuid(),
  thread_id               uuid not null references public.support_threads(id) on delete cascade,
  sender_id               uuid not null references public.profiles(id),
  sender_kind             text not null default 'customer' check (sender_kind in ('customer','staff')),
  message                 text not null check (char_length(btrim(message)) between 1 and 4000),
  flagged                 boolean not null default false,
  relayed_from_thread_id  uuid references public.support_threads(id) on delete set null,
  created_at              timestamptz not null default now(),
  read_at                 timestamptz
);

create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at);
create index if not exists support_messages_unread_idx on public.support_messages (sender_kind) where read_at is null;

create table if not exists public.support_message_originals (
  message_id uuid primary key references public.support_messages(id) on delete cascade
             deferrable initially deferred,
  original   text not null,
  created_at timestamptz not null default now()
);

-- Thread: set role from profile, verify the customer owns the context.
create or replace function public.support_threads_before_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_role text;
  v_ok boolean;
begin
  select role into v_role from public.profiles where id = new.customer_id;
  if v_role is null then
    raise exception 'Unknown customer' using errcode = '23503';
  end if;
  new.customer_role := case when v_role = 'landlord' then 'landlord' else 'tenant' end;
  new.status := 'open';
  new.assigned_to := case when public.is_admin() then new.assigned_to else null end;

  if auth.uid() is not null and not public.is_admin() then
    if new.customer_id is distinct from auth.uid() then
      raise exception 'You can only open conversations for yourself' using errcode = '42501';
    end if;

    if new.application_id is not null then
      select exists (
        select 1 from public.applications a
        where a.id = new.application_id
          and (a.tenant_id = auth.uid() or a.landlord_id = auth.uid())
      ) into v_ok;
      if not v_ok then
        raise exception 'That application is not yours' using errcode = '42501';
      end if;
      if new.listing_id is null then
        select a.listing_id into new.listing_id from public.applications a where a.id = new.application_id;
      end if;
    end if;

    if new.tenancy_id is not null then
      select exists (
        select 1 from public.tenancies t
        left join public.listings l on l.id = t.listing_id
        where t.id = new.tenancy_id
          and (t.tenant_id = auth.uid() or l.landlord_id = auth.uid())
      ) into v_ok;
      if not v_ok then
        raise exception 'That tenancy is not yours' using errcode = '42501';
      end if;
      if new.listing_id is null then
        select t.listing_id into new.listing_id from public.tenancies t where t.id = new.tenancy_id;
      end if;
    end if;

    if new.listing_id is not null and v_role = 'landlord' then
      select exists (
        select 1 from public.listings l
        where l.id = new.listing_id and l.landlord_id = auth.uid()
      ) into v_ok;
      if not v_ok then
        raise exception 'That listing is not yours' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.support_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Message: decide sender_kind from who is really sending.
create or replace function public.support_messages_kind()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_customer uuid;
begin
  select customer_id into v_customer from public.support_threads where id = new.thread_id;
  if v_customer is null then
    raise exception 'Conversation not found' using errcode = '23503';
  end if;

  if auth.uid() is null then
    new.sender_kind := case when new.sender_id = v_customer then 'customer' else 'staff' end;
    return new;
  end if;

  if new.sender_id is distinct from auth.uid() then
    raise exception 'Sender must be you' using errcode = '42501';
  end if;

  if new.sender_id = v_customer then
    new.sender_kind := 'customer';
  elsif public.is_admin() then
    new.sender_kind := 'staff';
  else
    raise exception 'You are not part of this conversation' using errcode = '42501';
  end if;

  new.flagged := false;
  new.read_at := null;
  if new.sender_kind = 'customer' then
    new.relayed_from_thread_id := null;
  end if;
  return new;
end;
$$;

-- Message: hide contact details; original goes to an admin-only table.
create or replace function public.support_messages_filter_contact()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.sender_kind = 'customer'
     and (
       new.message ~* '(\+?\d[\d\-\s\(\)]{7,}\d)'
       or new.message ~* '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
       or new.message ~* '(wa\.me|whatsapp|instagram\.com|t\.me)'
     )
  then
    insert into public.support_message_originals (message_id, original)
    values (new.id, new.message);
    new.message := 'This message was hidden because it may contain contact details. Please keep communication on EboHomes until your inspection is confirmed.';
    new.flagged := true;
  end if;
  return new;
end;
$$;

-- After insert: update the thread and notify the other side.
create or replace function public.support_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  t public.support_threads%rowtype;
  v_name text;
  v_admin uuid;
begin
  select * into t from public.support_threads where id = new.thread_id;

  update public.support_threads
     set last_message_at = new.created_at,
         status = case when new.sender_kind = 'customer' then 'open' else 'pending' end
   where id = new.thread_id;

  begin
    if new.sender_kind = 'staff' then
      perform public.notify_user(
        t.customer_id,
        'EboHomes Support replied',
        concat('New reply on "', t.subject, '".'),
        concat(case when t.customer_role = 'landlord' then '/dashboard/messages' else '/messages' end,
               '?thread=', t.id),
        'message');
    else
      select nullif(btrim(full_name), '') into v_name from public.profiles where id = t.customer_id;
      for v_admin in
        select p.id from public.profiles p
        where p.role = 'admin' and coalesce(p.status, 'active') not in ('suspended', 'banned')
      loop
        perform public.notify_user(
          v_admin,
          'New support message',
          concat(coalesce(v_name, 'A customer'), ' wrote in "', t.subject, '".'),
          concat('/admin/support?thread=', t.id),
          'message');
      end loop;
    end if;
  exception when others then
    raise warning 'support notification failed: %', sqlerrm;
  end;

  return new;
end;
$$;

create or replace function public.support_messages_update_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only the read status can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Triggers on the new tables
drop trigger if exists a00_support_threads_check on public.support_threads;
create trigger a00_support_threads_check
  before insert on public.support_threads
  for each row execute function public.support_threads_before_insert();

drop trigger if exists a05_support_threads_block_inactive on public.support_threads;
create trigger a05_support_threads_block_inactive
  before insert on public.support_threads
  for each row execute function public.block_inactive_users();

drop trigger if exists a10_support_threads_touch on public.support_threads;
create trigger a10_support_threads_touch
  before update on public.support_threads
  for each row execute function public.support_touch_updated_at();

drop trigger if exists a00_support_messages_block_inactive on public.support_messages;
create trigger a00_support_messages_block_inactive
  before insert on public.support_messages
  for each row execute function public.block_inactive_users();

drop trigger if exists a10_support_messages_kind on public.support_messages;
create trigger a10_support_messages_kind
  before insert on public.support_messages
  for each row execute function public.support_messages_kind();

drop trigger if exists a20_support_messages_filter on public.support_messages;
create trigger a20_support_messages_filter
  before insert on public.support_messages
  for each row execute function public.support_messages_filter_contact();

drop trigger if exists a00_support_messages_update_guard on public.support_messages;
create trigger a00_support_messages_update_guard
  before update on public.support_messages
  for each row execute function public.support_messages_update_guard();

drop trigger if exists zz_support_messages_after on public.support_messages;
create trigger zz_support_messages_after
  after insert on public.support_messages
  for each row execute function public.support_messages_after_insert();

-- Row level security
alter table public.support_threads           enable row level security;
alter table public.support_messages          enable row level security;
alter table public.support_message_originals enable row level security;

drop policy if exists "support_threads select" on public.support_threads;
create policy "support_threads select" on public.support_threads
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "support_threads insert" on public.support_threads;
create policy "support_threads insert" on public.support_threads
  for insert to authenticated
  with check (customer_id = auth.uid() or public.is_admin());

drop policy if exists "support_threads admin update" on public.support_threads;
create policy "support_threads admin update" on public.support_threads
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "support_threads admin delete" on public.support_threads;
create policy "support_threads admin delete" on public.support_threads
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "support_messages select" on public.support_messages;
create policy "support_messages select" on public.support_messages
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.support_threads t
               where t.id = thread_id and t.customer_id = auth.uid())
  );

drop policy if exists "support_messages insert" on public.support_messages;
create policy "support_messages insert" on public.support_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.is_admin()
      or exists (select 1 from public.support_threads t
                 where t.id = thread_id and t.customer_id = auth.uid())
    )
  );

drop policy if exists "support_messages mark read" on public.support_messages;
create policy "support_messages mark read" on public.support_messages
  for update to authenticated
  using (
    (sender_kind = 'staff' and exists (select 1 from public.support_threads t
                                       where t.id = thread_id and t.customer_id = auth.uid()))
    or (sender_kind = 'customer' and public.is_admin())
  )
  with check (
    (sender_kind = 'staff' and exists (select 1 from public.support_threads t
                                       where t.id = thread_id and t.customer_id = auth.uid()))
    or (sender_kind = 'customer' and public.is_admin())
  );

drop policy if exists "support_messages admin delete" on public.support_messages;
create policy "support_messages admin delete" on public.support_messages
  for delete to authenticated
  using (public.is_admin());

drop policy if exists "support_originals admin read" on public.support_message_originals;
create policy "support_originals admin read" on public.support_message_originals
  for select to authenticated
  using (public.is_admin());

-- Grants on new tables (anon gets nothing)
revoke all on public.support_threads           from anon, authenticated;
revoke all on public.support_messages          from anon, authenticated;
revoke all on public.support_message_originals from anon, authenticated;

grant select, insert, update, delete on public.support_threads  to authenticated;
grant select, insert, update, delete on public.support_messages to authenticated;
grant select                         on public.support_message_originals to authenticated;

-- Close NEW direct messages on the legacy table (old rows stay readable)
alter policy "Participants can send messages" on public.messages
  with check (auth.uid() = sender_id and public.is_admin());

create or replace function public.messages_block_direct_insert()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  raise exception 'Direct messages are closed. Please use EboHomes Support.' using errcode = '42501';
end;
$$;

drop trigger if exists a001_messages_block_direct_insert on public.messages;
create trigger a001_messages_block_direct_insert
  before insert on public.messages
  for each row execute function public.messages_block_direct_insert();

revoke select, insert, update, delete, references on public.messages from anon;

-- Unread count for badges: old inbox + new support inbox
create or replace function public.my_unread_message_count()
returns integer
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select
    (select count(*) from public.messages m
      where m.receiver_id = auth.uid() and m.read_at is null)::int
  + (select count(*) from public.support_messages sm
      where sm.read_at is null
        and (
          (sm.sender_kind = 'staff' and exists (
              select 1 from public.support_threads t
              where t.id = sm.thread_id and t.customer_id = auth.uid()))
          or (sm.sender_kind = 'customer' and public.is_admin())
        ))::int;
$$;

grant execute on function public.my_unread_message_count() to authenticated;

-- Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_threads') then
    alter publication supabase_realtime add table public.support_threads;
  end if;
end $$;

commit;