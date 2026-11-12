-- EboHomes 20261211_04  *** PROPOSED. NOT EXECUTED. REVIEW FIRST. ***
-- WHAT: lets every notification also be sent by email.
--   1. notification_preferences.email_enabled (default ON, so everyone gets email unless they switch it off).
--   2. email_deliveries: one row per notification already emailed. It stops the same notification being emailed twice
--      if the webhook fires again, and records whether the send worked. Only the server (service role) can touch it.
-- DOES NOT: change notify_user, change any existing notification, or send anything by itself.
--   Security and verification notifications are emailed even if the person turned email off (same rule as in-app).
-- AFTER RUNNING: add a Supabase Database Webhook on public.notifications (INSERT) pointing to /api/email/webhook.
-- Safe to re-run.
begin;

-- ===== A. Preflight =====
do $$
begin
  if to_regclass('public.notifications') is null or to_regclass('public.notification_preferences') is null then
    raise exception 'STOPPED: notifications tables are missing. Tell Claude.';
  end if;
end $$;

-- ===== B. Email switch (existing rows get ON) =====
alter table public.notification_preferences
  add column if not exists email_enabled boolean not null default true;

-- ===== C. Delivery log =====
create table if not exists public.email_deliveries (
  notification_id text primary key,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed', 'skipped')),
  provider text,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_deliveries_failed_idx
  on public.email_deliveries (created_at) where status = 'failed';

alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from anon, authenticated;

commit;

-- ROLLBACK:
-- drop table if exists public.email_deliveries;
-- alter table public.notification_preferences drop column if exists email_enabled;
