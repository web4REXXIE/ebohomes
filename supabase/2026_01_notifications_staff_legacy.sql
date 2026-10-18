-- EboHomes batch 5 / file 1: helpers, notification wording + admin alerts,
-- staff access to payments, review of legacy (landlord-made) decisions.
-- Safe to re-run. Changes no data. Needs batch-2 columns on applications
-- (decided_by, decided_at) only for the legacy-review function.
begin;

create or replace function public.eb_is_admin()
 returns boolean language plpgsql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
declare ok boolean := false;
begin
  if auth.uid() is null then return false; end if;
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') into ok;
  if ok then return true; end if;
  begin
    execute 'select coalesce(public.is_admin(), false)' into ok;
  exception when others then ok := false;
  end;
  return coalesce(ok, false);
end;
$$;
revoke all on function public.eb_is_admin() from public, anon;
grant execute on function public.eb_is_admin() to authenticated;

create or replace function public.notify_admins(p_title text, p_message text, p_link text, p_type text default 'general')
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'admin' loop
    perform public.notify_user(r.id, p_title, p_message, p_link, p_type);
  end loop;
end;
$$;
revoke all on function public.notify_admins(text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_trigger()
 returns trigger language plpgsql security definer
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
begin
  if tg_op = 'UPDATE' then v_old := to_jsonb(old); end if;

  -- ======================= APPLICATIONS =======================
  if tg_table_name = 'applications' then
    v_tenant := (v_new->>'tenant_id')::uuid;
    v_landlord := (v_new->>'landlord_id')::uuid;
    select nullif(trim(l.title), '') into v_title from public.listings l where l.id = (v_new->>'listing_id')::uuid;
    v_title := coalesce(v_title, 'a property');

    if tg_op = 'INSERT' then
      perform public.notify_user(v_landlord, 'New application',
        concat('Someone applied for "', v_title, '". EboHomes will review it. You can add a recommendation.'),
        '/dashboard/applications', 'application');
      perform public.notify_admins('Application to review',
        concat('A new application for "', v_title, '" is waiting for review.'), '/admin/applications', 'application');
    else
      if v_new->>'status' is distinct from v_old->>'status' then
        if v_new->>'status' = 'withdrawn' then
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
            concat('EboHomes needs more information about your application for "', v_title, '".'), '/applications', 'application');
        elsif v_new->>'status' = 'approved' then
          perform public.notify_user(v_tenant, 'Application approved',
            concat('EboHomes approved your application for "', v_title, '". Next step: see the property in person before you pay anything.'),
            '/applications', 'application');
          perform public.notify_user(v_landlord, 'Application approved by EboHomes',
            concat('EboHomes approved an application for "', v_title, '". We are waiting for the applicant to confirm they want to proceed.'),
            '/dashboard/applications', 'application');
        elsif v_new->>'status' = 'rejected' then
          perform public.notify_user(v_tenant, 'Application declined',
            concat('Your application for "', v_title, '" was not successful.'), '/applications', 'application');
          perform public.notify_user(v_landlord, 'Application declined by EboHomes',
            concat('EboHomes declined an application for "', v_title, '".'), '/dashboard/applications', 'application');
        elsif v_new->>'status' = 'pending' and v_old->>'status' in ('approved', 'rejected') then
          perform public.notify_user(v_tenant, 'Application back under review',
            concat('EboHomes is reviewing your application for "', v_title, '" again.'), '/applications', 'application');
          perform public.notify_user(v_landlord, 'Application back under review',
            concat('EboHomes reopened an application for "', v_title, '" for review.'), '/dashboard/applications', 'application');
        else
          perform public.notify_user(v_tenant, 'Application update',
            concat('Your application for "', v_title, '" is now ', replace(coalesce(v_new->>'status', 'updated'), '_', ' '), '.'),
            '/applications', 'application');
        end if;
      end if;

      if v_old->>'tenant_interest_at' is null and v_new->>'tenant_interest_at' is not null then
        perform public.notify_user(v_landlord, 'Applicant wants to proceed',
          concat('The applicant for "', v_title, '" confirmed they want to proceed.'), '/dashboard/applications', 'application');
        perform public.notify_admins('Applicant wants to proceed',
          concat('The applicant for "', v_title, '" confirmed they want to proceed.'), '/admin/applications', 'application');
      end if;

      if v_new->>'landlord_recommendation' is not null
         and (v_old->>'landlord_recommendation' is distinct from v_new->>'landlord_recommendation'
              or v_old->>'landlord_recommendation_note' is distinct from v_new->>'landlord_recommendation_note') then
        perform public.notify_admins('Landlord recommendation added',
          concat('The landlord added a recommendation on the application for "', v_title, '".'), '/admin/applications', 'application');
      end if;
    end if;

  -- ======================= LISTINGS (unchanged) =======================
  elsif tg_table_name = 'listings' then
    if tg_op = 'UPDATE'
       and v_new->>'status' is distinct from v_old->>'status'
       and v_actor is distinct from (v_new->>'landlord_id')::uuid then
      perform public.notify_user((v_new->>'landlord_id')::uuid, 'Listing update',
        concat('Your listing is now ', v_new->>'status', '.'), '/dashboard/listings', 'listing');
    end if;

  -- ======================= MESSAGES (unchanged) =======================
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
    if tg_op = 'INSERT' then
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
      perform public.notify_admins('Payment to verify',
        concat('A ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount, ' for "', v_title, '" is waiting for verification.'),
        '/admin/payments', 'payment');
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
    end if;

  -- ======================= LANDLORD VERIFICATION (unchanged) =======================
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

-- One notification trigger per table (replaces any older ones that call notify_trigger).
do $$
declare t record; tbl text;
begin
  foreach tbl in array array['applications', 'payments', 'renewals', 'tenancies'] loop
    for t in
      select tg.tgname from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
      where c.relnamespace = 'public'::regnamespace and c.relname = tbl
        and not tg.tgisinternal and tg.tgfoid = 'public.notify_trigger'::regproc
    loop
      execute format('drop trigger %I on public.%I', t.tgname, tbl);
    end loop;
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.notify_trigger()', 'zz_notify_' || tbl, tbl);
  end loop;
end $$;

-- Authorised staff can read the payments list (the old policy checked profiles.role only).
drop policy if exists payments_select_staff on public.payments;
create policy payments_select_staff on public.payments
  for select to authenticated using (public.eb_is_admin());

-- Legacy decisions: approved/declined by a landlord before EboHomes review existed.
create or replace function public.admin_review_legacy_decision(p_application uuid, p_action text, p_note text default null)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  a record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not public.eb_is_admin() then
    raise exception 'Only EboHomes staff can review decisions' using errcode = '42501';
  end if;
  if p_action not in ('ratify', 'reopen') then raise exception 'Unknown action: %', p_action; end if;

  select * into a from public.applications where id = p_application for update;
  if not found then raise exception 'Application not found'; end if;
  if a.status not in ('approved', 'rejected') or a.decided_by is not null then
    raise exception 'This is not a legacy landlord decision';
  end if;

  if p_action = 'ratify' then
    update public.applications
       set decided_by = auth.uid(), decided_at = now(),
           decision_note = nullif(concat_ws(' | ', nullif(a.decision_note, ''), case when v_note is not null then 'EboHomes review: ' || v_note end), ''),
           updated_at = now()
     where id = p_application;
  else
    if exists (select 1 from public.tenancies t where t.application_id = a.id) then
      raise exception 'A tenancy already exists for this application, so it cannot be reopened';
    end if;
    update public.applications
       set status = 'pending', decided_by = null, decided_at = null, decision_note = null, updated_at = now()
     where id = p_application;
  end if;
end;
$$;
revoke all on function public.admin_review_legacy_decision(uuid, text, text) from public, anon;
grant execute on function public.admin_review_legacy_decision(uuid, text, text) to authenticated;

commit;