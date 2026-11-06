-- EboHomes 20261201_05 (Phase 10.2, Step E1): authority-expiry notices (30 / 14 / 7 days). NOTIFICATIONS ONLY.
-- REQUIRES: 20261201_03 already run (valid_until, revoked_at on listing_authority_claims).
-- RULES:
--   - Dates are Africa/Lagos calendar dates. valid_until is the LAST valid day.
--   - One notice per (listing, valid_until, interval). A renewed date starts a fresh set of notices.
--   - Only the tightest due interval is sent. Larger ones already passed are recorded as 'skipped'.
--   - Every attempt is counted. A failed notice is retried after 1 hour, up to 5 attempts, and never duplicated:
--     the notice and its status update succeed or fail together.
--   - No grace period. Nothing here changes a listing, tenancy, application, authority_status or the public label.
--   - Expiry is NOT enforced here (Phase 10.5).
-- One transaction. Back up first.
begin;

create table if not exists public.authority_expiry_notices (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  valid_until date not null,
  interval_days int not null check (interval_days in (30,14,7)),
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, valid_until, interval_days)
);
create index if not exists authority_expiry_notices_open_idx
  on public.authority_expiry_notices (status, last_attempt_at) where status in ('pending','failed');

create table if not exists public.authority_expiry_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  run_date date not null,
  trigger text not null default 'cron',
  created_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  skipped_count int not null default 0,
  note text
);

alter table public.authority_expiry_notices enable row level security;
alter table public.authority_expiry_runs enable row level security;
revoke all on public.authority_expiry_notices from anon, authenticated;
revoke all on public.authority_expiry_runs from anon, authenticated;

-- The job. Server only (service_role).
create or replace function public.eb_run_authority_expiry_notices(p_trigger text default 'cron')
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_run uuid; r record;
  n_new int := 0; n_sent int := 0; n_failed int := 0; n_skip int := 0; k int; v_left int; v_tight int;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('authority_expiry_notices', 1)) then
    return jsonb_build_object('ok', true, 'note', 'already_running');
  end if;

  insert into public.authority_expiry_runs (run_date, trigger) values (v_today, left(coalesce(p_trigger,'cron'), 40))
  returning id into v_run;

  -- 1. Open notices whose authorization changed (renewed date, revoked, no longer accepted, already past) are no longer relevant.
  update public.authority_expiry_notices n
     set status = 'skipped', last_error = 'superseded'
   where n.status in ('pending','failed')
     and not exists (
       select 1 from public.listing_authority_claims c join public.listings l on l.id = c.listing_id
        where c.listing_id = n.listing_id and c.valid_until = n.valid_until and c.revoked_at is null
          and l.authority_status = 'accepted' and c.valid_until >= v_today);
  get diagnostics k = row_count; n_skip := n_skip + k;

  -- 2. Create the notices that are due. Only the tightest due interval is 'pending'.
  with due as (
    select c.listing_id, c.valid_until, i.d,
           min(i.d) over (partition by c.listing_id, c.valid_until) as tight
      from public.listing_authority_claims c
      join public.listings l on l.id = c.listing_id
     cross join (values (30),(14),(7)) as i(d)
     where l.authority_status = 'accepted' and c.revoked_at is null and c.valid_until is not null
       and c.valid_until >= v_today and (c.valid_until - v_today) <= i.d)
  insert into public.authority_expiry_notices (listing_id, valid_until, interval_days, status, last_error)
  select listing_id, valid_until, d,
         case when d = tight then 'pending' else 'skipped' end,
         case when d <> tight then 'passed_by_later_interval' end
    from due
  on conflict (listing_id, valid_until, interval_days) do nothing;
  get diagnostics k = row_count; n_new := k;

  -- 3. Send. Retry failed ones after 1 hour, at most 5 attempts.
  for r in
    select n.id, n.listing_id, n.valid_until, n.interval_days, l.title, l.landlord_id
      from public.authority_expiry_notices n
      join public.listings l on l.id = n.listing_id
     where n.attempts < 5
       and (n.status = 'pending' or (n.status = 'failed' and n.last_attempt_at < now() - interval '1 hour'))
     order by n.valid_until, n.interval_days
     limit 500
  loop
    v_left := r.valid_until - v_today;
    v_tight := case when v_left <= 7 then 7 when v_left <= 14 then 14 else 30 end;
    if r.interval_days <> v_tight then
      update public.authority_expiry_notices set status = 'skipped', last_error = 'passed_by_later_interval' where id = r.id;
      n_skip := n_skip + 1;
      continue;
    end if;
    begin
      perform public.notify_user(
        r.landlord_id,
        case when v_left = 0 then 'Your property authority ends today' else 'Your property authority is ending soon' end,
        concat('The authority you submitted for "', coalesce(r.title, 'a listing'), '" is recorded as valid until ',
               to_char(r.valid_until, 'DD Mon YYYY'),
               case when v_left = 0 then ' (today).' else concat(' (', v_left, ' day', case when v_left = 1 then '' else 's' end, ' left).') end,
               ' To renew it, upload the renewed authorization document and send it for a fresh review. ',
               'Your listing, applications and tenancies are not changed by this notice.'),
        '/dashboard/authority/' || r.listing_id::text, 'general');
      update public.authority_expiry_notices
         set status = 'sent', sent_at = now(), attempts = attempts + 1, last_attempt_at = now(), last_error = null
       where id = r.id;
      n_sent := n_sent + 1;
    exception when others then
      update public.authority_expiry_notices
         set status = 'failed', attempts = attempts + 1, last_attempt_at = now(), last_error = left(sqlerrm, 300)
       where id = r.id;
      n_failed := n_failed + 1;
    end;
  end loop;

  update public.authority_expiry_runs
     set finished_at = now(), created_count = n_new, sent_count = n_sent, failed_count = n_failed, skipped_count = n_skip
   where id = v_run;
  return jsonb_build_object('ok', true, 'run_date', v_today, 'created', n_new, 'sent', n_sent, 'failed', n_failed, 'skipped', n_skip);
end $f$;

-- Admin troubleshooting: recent runs and notices
create or replace function public.admin_authority_expiry_log(p_limit int default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v_lim int := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  if auth.uid() is null or not public.eb_is_admin() then
    raise exception 'Only EboHomes administrators can do this' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'runs', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from
       (select started_at, finished_at, run_date, trigger, created_count, sent_count, failed_count, skipped_count
          from public.authority_expiry_runs order by started_at desc limit 30) x), '[]'::jsonb),
    'notices', coalesce((select jsonb_agg(to_jsonb(y) order by y.created_at desc) from
       (select n.listing_id, l.title as listing_title, n.valid_until, n.interval_days, n.status, n.attempts,
               n.last_attempt_at, n.sent_at, n.last_error, n.created_at
          from public.authority_expiry_notices n join public.listings l on l.id = n.listing_id
         order by n.created_at desc limit v_lim) y), '[]'::jsonb));
end $f$;

revoke all on function public.eb_run_authority_expiry_notices(text) from public, anon, authenticated;
grant execute on function public.eb_run_authority_expiry_notices(text) to service_role;
revoke all on function public.admin_authority_expiry_log(int) from public, anon;
grant execute on function public.admin_authority_expiry_log(int) to authenticated;

commit;

-- CHECK (read only). Expect 2, 2.
-- select (select count(*) from information_schema.tables where table_schema='public' and table_name in ('authority_expiry_notices','authority_expiry_runs')) as tables_should_be_2,
--        (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('eb_run_authority_expiry_notices','admin_authority_expiry_log')) as functions_should_be_2;

-- PREVIEW (read only, sends nothing): which accepted authorities end within 30 days?
-- select c.listing_id, c.valid_until, c.valid_until - (now() at time zone 'Africa/Lagos')::date as days_left
--   from public.listing_authority_claims c join public.listings l on l.id = c.listing_id
--  where l.authority_status='accepted' and c.revoked_at is null and c.valid_until is not null
--    and c.valid_until - (now() at time zone 'Africa/Lagos')::date between 0 and 30 order by c.valid_until;

-- ROLLBACK:
-- drop function if exists public.eb_run_authority_expiry_notices(text), public.admin_authority_expiry_log(int);
-- drop table if exists public.authority_expiry_runs, public.authority_expiry_notices;
