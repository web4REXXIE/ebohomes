-- EboHomes Phase 3: Web Push
-- Safe to run more than once. Does not touch existing notifications.
begin;

-- 1. Make sure the push switch exists on notification_preferences
alter table public.notification_preferences
  add column if not exists push_enabled boolean not null default false;

-- 2. One row per browser/device that can receive push
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  constraint push_subscriptions_keys_len check (
    char_length(p256dh) between 1 and 256 and char_length(auth) between 1 and 256
  )
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;
-- People can see and remove their own devices. Saving goes through the
-- function below, so nobody can write a row that belongs to someone else.
grant select, delete on public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- 3. Save or refresh a device. If the same browser was used by someone else
-- before, the device moves to the person who is signed in now.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or char_length(p_endpoint) > 2048 then
    raise exception 'Invalid push endpoint' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Invalid push keys' using errcode = '22023';
  end if;

  insert into public.push_subscriptions
    (user_id, endpoint, p256dh, auth, user_agent, device_label, failure_count, updated_at)
  values
    (v_user, p_endpoint, p_p256dh, p_auth,
     left(p_user_agent, 400), left(p_device_label, 80), 0, now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        device_label = excluded.device_label,
        failure_count = 0,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;

-- 4. Delivery log: one row per notification already pushed. It stops the same
-- notification being sent twice if the webhook fires again. Only the server
-- (service role) can touch it.
create table if not exists public.push_deliveries (
  notification_id text primary key,
  created_at timestamptz not null default now()
);

alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon;
revoke all on public.push_deliveries from authenticated;

commit;