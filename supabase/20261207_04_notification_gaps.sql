-- EboHomes 20261207_04 (Phase 11.11)  *** PROPOSED. NOT EXECUTED. ***
-- 1. notification_failures + notify_user records a failed insert; eb_retry_failed_notifications retries it (max 5 tries, then one admin alert).
-- 2. notify_trigger replaced by ONE merged version (batch-5 EboHomes-decides wording + phase-4 payment wording) plus:
--    tenant "Application received"; tenant links go to /journey/<id>; no duplicate notices for accepted / system not_selected;
--    no "landlord created your tenancy" or admin "New tenancy" for offer-created tenancies; no second admin ping for Paystack payments.
-- Changes no data. Safe to re-run.
begin;

-- ===== A. Preflight =====
do $$
begin
  if to_regclass('public.notifications') is null or to_regclass('public.notification_preferences') is null then
    raise exception 'STOPPED: notifications tables are missing. Tell Claude.';
  end if;
  if to_regprocedure('public.notify_user(uuid,text,text,text,text)') is null
     or to_regprocedure('public.notify_admins(text,text,text,text)') is null
     or to_regprocedure('public.eb_is_admin()') is null then
    raise exception 'STOPPED: notify_user, notify_admins or eb_is_admin is missing. Tell Claude.';
  end if;
end $$;

-- ===== B. Failure log =====
create table if not exists public.notification_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  message text,
  link text,
  error text,
  attempts int not null default 1,
  last_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  gave_up_alerted boolean not null default false
);
create index if not exists notification_failures_open_idx on public.notification_failures (created_at) where resolved_at is null;

alter table public.notification_failures enable row level security;
revoke all on public.notification_failures from anon, authenticated;
grant select on public.notification_failures to authenticated;
drop policy if exists notification_failures_select_staff on public.notification_failures;
create policy notification_failures_select_staff on public.notification_failures for select to authenticated
  using (public.eb_is_admin());

-- ===== C. notify_user: same rules as 20261016_01, plus it records a failed insert =====
create or replace function public.notify_user(p_user uuid, p_title text, p_message text, p_link text, p_type text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_type text := coalesce(p_type, 'general');
  prefs public.notification_preferences%rowtype;
  v_at_insert boolean := false;
begin
  if p_user is null then
    return;
  end if;

  -- Security alerts and verification results are always delivered. Everything else respects saved preferences.
  if v_type not in ('security', 'verification') then
    select * into prefs from public.notification_preferences where user_id = p_user;
    if found then
      if not prefs.in_app_enabled then
        return;
      end if;
      if (v_type = 'message' and not prefs.messages)
         or (v_type in ('application', 'tenancy', 'payment') and not prefs.applications)
         or (v_type = 'listing' and not prefs.listings)
         or (v_type = 'renewal' and not prefs.renewals) then
        return;
      end if;
    end if;
  end if;

  -- Duplicate guard: skip an identical unread notification created in the last 10 seconds.
  if exists (
    select 1 from public.notifications n
     where n.user_id = p_user and n.type = v_type and n.title = p_title
       and n.message is not distinct from p_message and n.link is not distinct from p_link
       and n.read = false and n.created_at > now() - interval '10 seconds'
  ) then
    return;
  end if;

  v_at_insert := true;
  insert into public.notifications (user_id, type, title, message, link, read)
  values (p_user, v_type, p_title, p_message, p_link, false);
exception when others then
  raise warning 'notify_user failed for user %: %', p_user, sqlerrm;
  -- Only a failure of the insert itself is kept for a retry (preferences were already checked by then).
  if v_at_insert then
    begin
      insert into public.notification_failures (user_id, type, title, message, link, error)
      values (p_user, v_type, p_title, p_message, p_link, left(sqlerrm, 500));
    exception when others then
      null;
    end;
  end if;
end;
$function$;

-- ===== D. Retry (cron, service role) =====
create or replace function public.eb_retry_failed_notifications()
 returns int
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  n int := 0;
  g int := 0;
begin
  for r in
    select * from public.notification_failures
     where resolved_at is null and attempts < 5 and last_attempt_at < now() - interval '5 minutes'
     order by created_at
     limit 200
     for update skip locked
  loop
    begin
      insert into public.notifications (user_id, type, title, message, link, read)
      values (r.user_id, r.type, r.title, r.message, r.link, false);
      update public.notification_failures
         set resolved_at = now(), last_attempt_at = now(), attempts = attempts + 1
       where id = r.id;
      n := n + 1;
    exception when others then
      update public.notification_failures
         set attempts = attempts + 1, last_attempt_at = now(), error = left(sqlerrm, 500)
       where id = r.id;
    end;
  end loop;

  -- One alert for notices that could not be delivered after 5 tries.
  select count(*) into g from public.notification_failures where resolved_at is null and attempts >= 5 and not gave_up_alerted;
  if g > 0 then
    update public.notification_failures set gave_up_alerted = true where resolved_at is null and attempts >= 5 and not gave_up_alerted;
    perform public.notify_admins('Notifications could not be delivered',
      g || ' notification(s) failed after several tries. Check the notification_failures table.', '/admin/operations', 'general');
  end if;
  return n;
end;
$function$;
revoke all on function public.eb_retry_failed_notifications() from public, anon, authenticated;
grant execute on function public.eb_retry_failed_notifications() to service_role;

-- ===== E. notify_trigger: one merged version =====
create or replace function public.notify_trigger()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_actor uuid := auth.uid();
  v_title text;
  v_name text;
  v_role text;
  v_link text;
  v_tenant uuid;
  v_landlord uuid;
  v_amount text;
  v_app_link text;
begin
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;

  -- ======================= APPLICATIONS =======================
  if tg_table_name = 'applications' then
    v_tenant := (v_new->>'tenant_id')::uuid;
    v_landlord := (v_new->>'landlord_id')::uuid;
    v_app_link := '/journey/' || (v_new->>'id');
    select nullif(trim(l.title), '') into v_title from public.listings l where l.id = (v_new->>'listing_id')::uuid;
    v_title := coalesce(v_title, 'a property');

    if tg_op = 'INSERT' then
      perform public.notify_user(v_tenant, 'Application received',
        concat('EboHomes received your application for "', v_title, '". It is being reviewed. This is not an approval and nothing has been charged.'),
        v_app_link, 'application');
      perform public.notify_user(v_landlord, 'New application',
        concat('Someone applied for "', v_title, '". EboHomes will review it. You can add a recommendation.'),
        '/dashboard/applications', 'application');
      perform public.notify_admins('Application to review',
        concat('A new application for "', v_title, '" is waiting for review.'), '/admin/applications', 'application');
    else
      if v_new->>'status' is distinct from v_old->>'status' then
        if v_new->>'status' = 'accepted' then
          null; -- eb_complete_rental sends "Your rental is confirmed"
        elsif v_new->>'status' = 'not_selected' then
          -- Set by eb_complete_rental (system flag): it sends its own notice. An admin correction is announced here.
          if coalesce(current_setting('eb.system_transition', true), '') <> '1' then
            perform public.notify_user(v_tenant, 'Application not selected',
              concat('Your application for "', v_title, '" was not selected. This is not a rejection of you. Nothing was charged.'),
              v_app_link, 'application');
          end if;
        elsif v_new->>'status' = 'withdrawn' then
          if v_actor is distinct from v_landlord then
            perform public.notify_user(v_landlord, 'Application withdrawn',
              concat('An applicant withdrew their application for "', v_title, '".'), '/dashboard/applications', 'application');
          end if;
          perform public.notify_admins('Application withdrawn',
            concat('An applicant withdrew their application for "', v_title, '".'), '/admin/applications', 'application');
        elsif v_old->>'status' = 'info_requested' and v_new->>'status' = 'pending' then
          perform public.notify_admins('Applicant replied',
            concat('The applicant answered EboHomes'' question about "', v_title, '". It is ready to review again.'),
            '/admin/applications', 'application');
        elsif v_new->>'status' = 'info_requested' then
          perform public.notify_user(v_tenant, 'EboHomes has a question',
            concat('EboHomes needs more information about your application for "', v_title, '".'), v_app_link, 'application');
        elsif v_new->>'status' = 'approved' then
          perform public.notify_user(v_tenant, 'Application approved',
            concat('EboHomes approved your application for "', v_title, '". Next step: see the property in person before you pay anything.'),
            v_app_link, 'application');
          perform public.notify_user(v_landlord, 'Application approved by EboHomes',
            concat('EboHomes approved an application for "', v_title, '". We are waiting for the applicant to confirm they want to proceed.'),
            '/dashboard/applications', 'application');
        elsif v_new->>'status' = 'rejected' then
          perform public.notify_user(v_tenant, 'Application declined',
            concat('Your application for "', v_title, '" was not successful.'), v_app_link, 'application');
          perform public.notify_user(v_landlord, 'Application declined by EboHomes',
            concat('EboHomes declined an application for "', v_title, '".'), '/dashboard/applications', 'application');
        elsif v_new->>'status' = 'pending' and v_old->>'status' in ('approved', 'rejected', 'not_selected') then
          perform public.notify_user(v_tenant, 'Application back under review',
            concat('EboHomes is reviewing your application for "', v_title, '" again.'), v_app_link, 'application');
          perform public.notify_user(v_landlord, 'Application back under review',
            concat('EboHomes reopened an application for "', v_title, '" for review.'), '/dashboard/applications', 'application');
        else
          perform public.notify_user(v_tenant, 'Application update',
            concat('Your application for "', v_title, '" is now ', replace(coalesce(v_new->>'status', 'updated'), '_', ' '), '.'),
            v_app_link, 'application');
        end if;
      end if;

      if v_old->>'tenant_interest_at' is null and v_new->>'tenant_interest_at' is not null then
        perform public.notify_user(v_landlord, 'Applicant wants to proceed',
          concat('The applicant for "', v_title, '" confirmed they want to proceed.'), '/dashboard/applications', 'application');
        perform public.notify_admins('Applicant wants to proceed',
          concat('The applicant for "', v_title, '" confirmed they want to proceed. You can now make a rental offer.'), '/admin/offers', 'application');
      end if;

      if v_new->>'landlord_recommendation' is not null
         and (v_old->>'landlord_recommendation' is distinct from v_new->>'landlord_recommendation'
              or v_old->>'landlord_recommendation_note' is distinct from v_new->>'landlord_recommendation_note') then
        perform public.notify_admins('Landlord recommendation added',
          concat('The landlord added a recommendation on the application for "', v_title, '".'), '/admin/applications', 'application');
      end if;
    end if;

  -- ======================= LISTINGS =======================
  elsif tg_table_name = 'listings' then
    if tg_op = 'UPDATE'
       and v_new->>'status' is distinct from v_old->>'status'
       and v_actor is distinct from (v_new->>'landlord_id')::uuid then
      perform public.notify_user((v_new->>'landlord_id')::uuid, 'Listing update',
        concat('Your listing is now ', v_new->>'status', '.'), '/dashboard/listings', 'listing');
    end if;

  -- ======================= MESSAGES =======================
  elsif tg_table_name = 'messages' then
    if tg_op = 'INSERT' then
      select nullif(trim(p.full_name), '') into v_name from public.profiles p where p.id = (v_new->>'sender_id')::uuid;
      select p.role into v_role from public.profiles p where p.id = (v_new->>'receiver_id')::uuid;
      v_link := concat(case when v_role = 'landlord' then '/dashboard/messages' else '/messages' end, '?to=', v_new->>'sender_id');
      perform public.notify_user((v_new->>'receiver_id')::uuid, 'New message',
        concat(coalesce(v_name, 'Someone'), ' sent you a message.'), v_link, 'message');
    end if;

  -- ======================= RENEWALS =======================
  elsif tg_table_name = 'renewals' then
    if tg_op = 'INSERT' then
      perform public.notify_user((v_new->>'tenant_id')::uuid, 'Renewal offer',
        'Your landlord sent a renewal offer.', '/tenancies', 'renewal');
    elsif v_new->>'status' is distinct from v_old->>'status' then
      perform public.notify_user((v_new->>'landlord_id')::uuid, 'Renewal answered',
        concat('The tenant ', v_new->>'status', ' your renewal offer.'), '/dashboard/tenancies', 'renewal');
      if v_new->>'status' = 'accepted' then
        perform public.notify_admins('Renewal accepted',
          'A tenant accepted a renewal offer. Apply it to the tenancy so the new rent and end date show.', '/admin/cases', 'renewal');
      end if;
    end if;

  -- ======================= TENANCIES =======================
  elsif tg_table_name = 'tenancies' then
    -- A tenancy made from an accepted offer (offer_id set) is announced by eb_create_tenancy_from_offer. Only the old landlord-made path is announced here.
    if tg_op = 'INSERT' and v_new->>'offer_id' is null then
      select nullif(trim(l.title), '') into v_title from public.listings l where l.id = (v_new->>'listing_id')::uuid;
      v_title := coalesce(v_title, 'a property');
      perform public.notify_user((v_new->>'tenant_id')::uuid, 'Tenancy created',
        concat('Your landlord created your tenancy for "', v_title, '".',
               case when v_new->>'tenancy_code' is not null then concat(' Tenancy code: ', v_new->>'tenancy_code', '.') else '' end),
        '/tenancies', 'tenancy');
      perform public.notify_admins('New tenancy',
        concat('A tenancy was created for "', v_title, '". Check that the rental terms are agreed.'), '/admin/cases', 'tenancy');
    end if;

  -- ======================= PAYMENTS =======================
  elsif tg_table_name = 'payments' then
    select nullif(trim(l.title), '') into v_title from public.listings l where l.id = (v_new->>'listing_id')::uuid;
    v_title := coalesce(v_title, 'a property');
    v_amount := to_char(coalesce((v_new->>'amount')::numeric, 0), 'FM999,999,999,990');
    v_link := case when v_new->>'receipt_code' is not null then concat('/receipt/', v_new->>'receipt_code') else '/tenancies' end;

    if tg_op = 'INSERT' and v_new->>'status' = 'recorded' then
      if v_new->>'user_id' is not null and v_new->>'recorded_by' is distinct from v_new->>'user_id' then
        perform public.notify_user((v_new->>'user_id')::uuid, 'Payment recorded',
          concat('A ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' was recorded for "', v_title,
                 '". EboHomes has not verified it yet.'), v_link, 'payment');
      end if;
      -- An online (Paystack) payment already alerts admins from paystack-server.ts.
      if coalesce(v_new->>'source', '') <> 'paystack' then
        perform public.notify_admins('Payment to verify',
          concat('A ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' for "', v_title, '" is waiting for verification.'),
          '/admin/payments', 'payment');
      end if;
    elsif v_new->>'status' = 'confirmed' and v_new->>'verified_by' is not null
          and (tg_op = 'INSERT' or v_old->>'status' is distinct from 'confirmed' or v_old->>'verified_by' is null) then
      if v_new->>'user_id' is not null then
        perform public.notify_user((v_new->>'user_id')::uuid, 'Payment verified',
          concat('EboHomes verified the ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' for "', v_title, '".'),
          v_link, 'payment');
      end if;
      if v_new->>'recorded_by' is not null and v_new->>'recorded_by' is distinct from v_new->>'user_id' then
        perform public.notify_user((v_new->>'recorded_by')::uuid, 'Payment verified',
          concat('EboHomes verified the ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' you recorded for "', v_title, '".'),
          v_link, 'payment');
      end if;
    elsif tg_op = 'UPDATE' and v_new->>'status' = 'rejected' and v_old->>'status' is distinct from 'rejected' then
      if v_new->>'user_id' is not null then
        perform public.notify_user((v_new->>'user_id')::uuid, 'Payment rejected',
          concat('EboHomes rejected a ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' for "', v_title, '".',
                 case when nullif(trim(v_new->>'review_note'), '') is not null
                      then concat(' Reason: ', trim(v_new->>'review_note'), '.') else '' end),
          v_link, 'payment');
      end if;
    end if;

  -- ======================= LANDLORD VERIFICATION =======================
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE' and v_new->>'verification_status' is distinct from v_old->>'verification_status' then
      if v_new->>'verification_status' = 'verified' then
        perform public.notify_user((v_new->>'id')::uuid, 'Verification approved',
          'Your landlord verification was approved. Your account now shows as verified.', '/dashboard/verify', 'verification');
      elsif v_new->>'verification_status' = 'rejected' then
        perform public.notify_user((v_new->>'id')::uuid, 'Verification not approved',
          concat('Your landlord verification was not approved.',
                 case when nullif(trim(v_new->>'rejection_reason'), '') is not null
                      then concat(' Reason: ', trim(v_new->>'rejection_reason'), '.') else '' end,
                 ' You can update your details and submit again.'), '/dashboard/verify', 'verification');
      end if;
    end if;
  end if;

  return new;
exception when others then
  raise warning 'notify_trigger failed on %: %', tg_table_name, sqlerrm;
  return new;
end;
$function$;

commit;

-- CHECK (read only): expect 1 table, 3 functions.
select to_regclass('public.notification_failures') as failures_table;
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('notify_user', 'notify_trigger', 'eb_retry_failed_notifications');
-- Triggers that call notify_trigger (expect zz_notify_applications, _payments, _renewals, _tenancies, _profiles, and the messages/listings ones you have):
select c.relname, tg.tgname from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
 where tg.tgfoid = 'public.notify_trigger'::regproc and not tg.tgisinternal order by 1;
-- OPTIONAL (read only): links people actually have in their inbox, to spot a dead one.
-- select link, count(*) from public.notifications group by link order by 2 desc limit 60;

-- ROLLBACK:
-- drop function if exists public.eb_retry_failed_notifications();
-- drop table if exists public.notification_failures;
-- Re-run the notify_user block from 20261016_01 and the notify_trigger block from 2026_01_notifications_staff_legacy.sql
-- (or 20261021_phase4_payment_notification.sql, whichever was live: the function you saved before running this).
