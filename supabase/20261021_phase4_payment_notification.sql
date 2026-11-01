-- EboHomes Phase 4: payment notification wording.
-- ONLY change: the payments branch of notify_trigger().
--   * recorded  -> "Payment recorded ... awaiting EboHomes verification"
--   * confirmed -> "Payment verified" (only when verified_by is set)
--   * rejected  -> "Payment rejected" with the review_note reason (new)
-- Everything else in the function is copied unchanged from 20261016_02.
-- BEFORE RUNNING: save the live definition
--   select pg_get_functiondef('public.notify_trigger'::regproc);
-- and confirm it matches 20261016_02, otherwise merge by hand.
-- The existing zz_notify_payments trigger (AFTER INSERT OR UPDATE) already calls this function.
begin;

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
  v_state text;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
  end if;

  -- ======================= APPLICATIONS =======================
  if tg_table_name = 'applications' then
    v_tenant := (v_new->>'tenant_id')::uuid;
    v_landlord := (v_new->>'landlord_id')::uuid;
    select nullif(trim(l.title), '') into v_title
    from public.listings l
    where l.id = (v_new->>'listing_id')::uuid;
    v_title := coalesce(v_title, 'a property');

    if tg_op = 'INSERT' then
      perform public.notify_user(v_landlord, 'New application',
        concat('Someone applied for "', v_title, '".'),
        '/dashboard/applications', 'application');
    else
      if v_new->>'status' is distinct from v_old->>'status' then
        if v_new->>'status' = 'withdrawn' then
          -- The tenant withdrew, so the landlord is the one to hear about it.
          if v_actor is distinct from v_landlord then
            perform public.notify_user(v_landlord, 'Application withdrawn',
              concat('An applicant withdrew their application for "', v_title, '".'),
              '/dashboard/applications', 'application');
          end if;
        elsif v_old->>'status' = 'info_requested' and v_new->>'status' = 'pending' then
          -- The tenant answered the landlord's question.
          perform public.notify_user(v_landlord, 'Applicant replied',
            concat('The applicant answered your question about "', v_title, '".'),
            '/dashboard/applications', 'application');
        elsif v_new->>'status' = 'info_requested' then
          perform public.notify_user(v_tenant, 'More information requested',
            concat('The landlord has a question about your application for "', v_title, '".'),
            '/applications', 'application');
        elsif v_new->>'status' = 'approved' then
          perform public.notify_user(v_tenant, 'Application accepted',
            concat('Your application for "', v_title, '" was accepted. Next step: see the property in person.'),
            '/applications', 'application');
        elsif v_new->>'status' = 'rejected' then
          perform public.notify_user(v_tenant, 'Application declined',
            concat('Your application for "', v_title, '" was not successful.'),
            '/applications', 'application');
        else
          perform public.notify_user(v_tenant, 'Application update',
            concat('Your application for "', v_title, '" is now ', replace(coalesce(v_new->>'status', 'updated'), '_', ' '), '.'),
            '/applications', 'application');
        end if;
      end if;

      -- Tenant confirmed interest (the status stays "approved")
      if v_old->>'tenant_interest_at' is null and v_new->>'tenant_interest_at' is not null then
        perform public.notify_user(v_landlord, 'Applicant wants to proceed',
          concat('The applicant for "', v_title, '" confirmed they want to proceed.'),
          '/dashboard/applications', 'application');
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

  -- ======================= MESSAGES =======================
  elsif tg_table_name = 'messages' then
    if tg_op = 'INSERT' then
      select nullif(trim(p.full_name), '') into v_name
      from public.profiles p
      where p.id = (v_new->>'sender_id')::uuid;
      select p.role into v_role
      from public.profiles p
      where p.id = (v_new->>'receiver_id')::uuid;

      v_link := concat(
        case when v_role = 'landlord' then '/dashboard/messages' else '/messages' end,
        '?to=', v_new->>'sender_id');

      perform public.notify_user((v_new->>'receiver_id')::uuid, 'New message',
        concat(coalesce(v_name, 'Someone'), ' sent you a message.'),
        v_link, 'message');
    end if;

  -- ======================= RENEWALS (unchanged) =======================
  elsif tg_table_name = 'renewals' then
    if tg_op = 'INSERT' then
      perform public.notify_user((v_new->>'tenant_id')::uuid, 'Renewal offer',
        'Your landlord sent a renewal offer.', '/tenancies', 'renewal');
    elsif v_new->>'status' is distinct from v_old->>'status' then
      perform public.notify_user((v_new->>'landlord_id')::uuid, 'Renewal answered',
        concat('The tenant ', v_new->>'status', ' your renewal offer.'), '/dashboard/tenancies', 'renewal');
    end if;

  -- ======================= TENANCIES =======================
  elsif tg_table_name = 'tenancies' then
    if tg_op = 'INSERT' then
      select nullif(trim(l.title), '') into v_title
      from public.listings l
      where l.id = (v_new->>'listing_id')::uuid;
      v_title := coalesce(v_title, 'a property');

      perform public.notify_user((v_new->>'tenant_id')::uuid, 'Tenancy created',
        concat('Your landlord created your tenancy for "', v_title, '".',
               case when v_new->>'tenancy_code' is not null
                    then concat(' Tenancy code: ', v_new->>'tenancy_code', '.')
                    else '' end),
        '/tenancies', 'tenancy');
    end if;

  -- ======================= PAYMENTS =======================
  elsif tg_table_name = 'payments' then
    -- The tenant (user_id) is told when a payment is recorded (awaiting
    -- verification), verified, or rejected. 'confirmed' only counts as verified
    -- when verified_by is set. The person who recorded it is not told.
    if v_new->>'user_id' is not null
       and v_new->>'recorded_by' is distinct from v_new->>'user_id'
       and (
         (tg_op = 'INSERT' and v_new->>'status' = 'recorded')
         or (tg_op = 'INSERT' and v_new->>'status' = 'confirmed' and v_new->>'verified_by' is not null)
         or (tg_op = 'UPDATE' and v_new->>'status' = 'confirmed'
             and v_new->>'verified_by' is not null
             and v_old->>'status' is distinct from 'confirmed')
         or (tg_op = 'UPDATE' and v_new->>'status' = 'rejected'
             and v_old->>'status' is distinct from 'rejected')
       ) then
      select nullif(trim(l.title), '') into v_title
      from public.listings l
      where l.id = (v_new->>'listing_id')::uuid;
      v_title := coalesce(v_title, 'a property');
      v_amount := to_char((v_new->>'amount')::numeric, 'FM999,999,999,990');
      v_state := case v_new->>'status'
                   when 'confirmed' then 'verified'
                   when 'rejected' then 'rejected'
                   else 'recorded' end;

      perform public.notify_user((v_new->>'user_id')::uuid,
        case v_state
          when 'verified' then 'Payment verified'
          when 'rejected' then 'Payment rejected'
          else 'Payment recorded' end,
        case v_state
          when 'verified' then
            concat('EboHomes verified a ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount,
                   ' for "', v_title, '".')
          when 'rejected' then
            concat('EboHomes rejected a ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount,
                   ' for "', v_title, '".',
                   case when nullif(trim(v_new->>'review_note'), '') is not null
                        then concat(' Reason: ', trim(v_new->>'review_note'), '.')
                        else '' end)
          else
            concat('A ', coalesce(v_new->>'type', 'payment'), ' payment of ₦', v_amount,
                   ' was recorded for "', v_title, '". It is awaiting EboHomes verification.')
        end,
        case when v_new->>'receipt_code' is not null
             then concat('/receipt/', v_new->>'receipt_code')
             else '/tenancies' end,
        'payment');
    end if;

  -- ======================= LANDLORD VERIFICATION =======================
  elsif tg_table_name = 'profiles' then
    if tg_op = 'UPDATE'
       and v_new->>'verification_status' is distinct from v_old->>'verification_status' then
      if v_new->>'verification_status' = 'verified' then
        perform public.notify_user((v_new->>'id')::uuid, 'Verification approved',
          'Your landlord verification was approved. Your account now shows as verified.',
          '/dashboard/verify', 'verification');
      elsif v_new->>'verification_status' = 'rejected' then
        perform public.notify_user((v_new->>'id')::uuid, 'Verification not approved',
          concat('Your landlord verification was not approved.',
                 case when nullif(trim(v_new->>'rejection_reason'), '') is not null
                      then concat(' Reason: ', trim(v_new->>'rejection_reason'), '.')
                      else '' end,
                 ' You can update your details and submit again.'),
          '/dashboard/verify', 'verification');
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