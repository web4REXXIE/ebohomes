-- EboHomes 20261206_05 (Phase 11.7)  *** PROPOSED. NOT EXECUTED. ***
-- Pre-tenancy rental offers: Application (approved) -> Offer -> tenant accepts. 11.8 turns an accepted offer into a pending tenancy.
-- DEFAULTS (change before running if you disagree):
--   * only EboHomes staff issue an offer; the application must be approved AND the tenant must have confirmed interest
--   * offer expires after 72 hours (staff can choose 24 hours to 14 days)
--   * landlord confirmation is automatic when the offer is within the advertised listing (monthly rent equal to the listed rent,
--     deposit not above the listed caution deposit, charges not above the listed service charge). Otherwise the landlord must confirm
--     before the tenant can see or accept it.
--   * tenant can counter (rent, deposit, start date, duration + a note); staff answer by issuing a new offer. Max 6 versions.
--   * one live offer per application, one ACCEPTED offer per listing (listing is the unit until a unit table exists)
-- DOES NOT touch tenancies, rental_terms, payments, listings or application statuses. Nothing is reserved by an accepted offer yet (11.8).
-- ROLLBACK at the bottom.
begin;

-- ===== A. Preflight: listing columns used for the "within advertised terms" check =====
do $$
declare missing text;
begin
  select string_agg(c, ', ') into missing
    from unnest(array['price_monthly', 'caution_deposit', 'service_charge']) c
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'listings' and column_name = c);
  if missing is not null then
    raise exception 'STOPPED: public.listings is missing column(s): %. Tell Claude which exist.', missing;
  end if;
end $$;

-- ===== B. Table =====
create table if not exists public.rental_offers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete restrict,
  listing_id uuid not null,
  tenant_id uuid not null,
  landlord_id uuid not null,
  version int not null check (version between 1 and 6),
  offered_by uuid not null,
  offered_by_role text not null check (offered_by_role in ('admin', 'tenant')),
  status text not null default 'offered'
    check (status in ('offered', 'countered', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded')),
  rent_amount numeric not null check (rent_amount > 0),
  rent_period text not null default 'monthly' check (rent_period in ('monthly', 'yearly')),
  duration_months int not null check (duration_months between 1 and 60),
  start_date date not null,
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  charges jsonb not null default '[]'::jsonb,
  fees_amount numeric not null default 0 check (fees_amount >= 0),
  payment_schedule text,
  notice_days int check (notice_days between 0 and 365),
  house_rules text,
  note text,
  response_note text,
  expires_at timestamptz not null,
  landlord_confirmed_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, version)
);

create unique index if not exists rental_offers_one_live_per_application
  on public.rental_offers (application_id) where status in ('offered', 'countered', 'accepted');
create unique index if not exists rental_offers_one_accepted_per_listing
  on public.rental_offers (listing_id) where status = 'accepted';
create index if not exists rental_offers_tenant_idx on public.rental_offers (tenant_id, status);
create index if not exists rental_offers_landlord_idx on public.rental_offers (landlord_id, status);
create index if not exists rental_offers_expiry_idx on public.rental_offers (expires_at) where status in ('offered', 'countered');

alter table public.rental_offers enable row level security;
revoke all on public.rental_offers from anon, authenticated;
grant select on public.rental_offers to authenticated;

-- A tenant never sees an EboHomes offer the landlord has not confirmed. They always see their own counter-offers.
drop policy if exists rental_offers_select_tenant on public.rental_offers;
create policy rental_offers_select_tenant on public.rental_offers for select to authenticated
  using (tenant_id = auth.uid() and (landlord_confirmed_at is not null or offered_by_role = 'tenant'));
drop policy if exists rental_offers_select_landlord on public.rental_offers;
create policy rental_offers_select_landlord on public.rental_offers for select to authenticated
  using (landlord_id = auth.uid());
drop policy if exists rental_offers_select_staff on public.rental_offers;
create policy rental_offers_select_staff on public.rental_offers for select to authenticated
  using (public.eb_is_admin());

-- ===== C. Internal helpers (never callable by users) =====
create or replace function public.eb_offer_charges_total(p jsonb)
 returns numeric
 language plpgsql
 immutable
 set search_path to 'public', 'pg_temp'
as $$
declare e jsonb; tot numeric := 0; n int := 0;
begin
  if p is null then return 0; end if;
  if jsonb_typeof(p) <> 'array' then
    raise exception 'Charges must be a list.' using errcode = '22023';
  end if;
  for e in select value from jsonb_array_elements(p) loop
    n := n + 1;
    if n > 8 then
      raise exception 'You can list up to 8 charges.' using errcode = '22023';
    end if;
    if jsonb_typeof(e) <> 'object'
       or char_length(btrim(coalesce(e->>'label', ''))) not between 2 and 60 then
      raise exception 'Each charge needs a name of 2 to 60 characters.' using errcode = '22023';
    end if;
    if coalesce(jsonb_typeof(e->'amount'), '') <> 'number'
       or (e->>'amount')::numeric <= 0 or (e->>'amount')::numeric > 100000000000 then
      raise exception 'Each charge needs an amount above zero.' using errcode = '22023';
    end if;
    tot := tot + (e->>'amount')::numeric;
  end loop;
  return tot;
end;
$$;
revoke all on function public.eb_offer_charges_total(jsonb) from public, anon, authenticated;

create or replace function public.eb_offer_event(p_app uuid, p_event text, p_role text, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.application_events (application_id, event, actor_id, actor_role, note)
  values (p_app, p_event, auth.uid(), p_role, p_note);
exception when others then null;  -- audit table from 11.4 may not exist yet; never block an offer step
end;
$$;
revoke all on function public.eb_offer_event(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.eb_offer_notify(p_user uuid, p_title text, p_message text, p_link text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.notify_user(p_user, p_title, p_message, p_link, 'application');
exception when others then null;  -- a failed notification must never undo an offer step
end;
$$;
revoke all on function public.eb_offer_notify(uuid, text, text, text) from public, anon, authenticated;

create or replace function public.eb_offer_notify_admins(p_title text, p_message text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.notify_admins(p_title, p_message, '/admin/offers', 'application');
exception when others then null;
end;
$$;
revoke all on function public.eb_offer_notify_admins(text, text) from public, anon, authenticated;

-- ===== D. Staff issue an offer (or a new version that replaces the open one) =====
create or replace function public.eb_issue_rental_offer(
  p_application uuid, p_rent numeric, p_period text, p_duration_months int, p_start date,
  p_deposit numeric, p_charges jsonb, p_schedule text, p_notice_days int, p_rules text, p_note text,
  p_hours int default 72)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  a record;
  l record;
  cur record;
  v_ver int;
  v_id uuid;
  v_fees numeric;
  v_hours int := coalesce(p_hours, 72);
  v_deposit numeric := coalesce(p_deposit, 0);
  v_matches boolean;
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can issue an offer.' using errcode = '42501';
  end if;
  if p_rent is null or p_rent <= 0 or p_rent > 100000000000 then
    raise exception 'Enter the rent.' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'yearly') then
    raise exception 'Choose monthly or yearly rent.' using errcode = '22023';
  end if;
  if p_duration_months is null or p_duration_months not between 1 and 60 then
    raise exception 'The rental length must be 1 to 60 months.' using errcode = '22023';
  end if;
  if p_start is null or p_start < current_date or p_start > current_date + 180 then
    raise exception 'Choose a start date within the next 180 days.' using errcode = '22023';
  end if;
  if v_deposit < 0 or v_deposit > 100000000000 then
    raise exception 'The deposit is not valid.' using errcode = '22023';
  end if;
  if p_notice_days is not null and p_notice_days not between 0 and 365 then
    raise exception 'The notice period must be 0 to 365 days.' using errcode = '22023';
  end if;
  if v_hours not between 24 and 336 then
    raise exception 'An offer must stay open for 24 hours to 14 days.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_schedule, '')) > 300 or char_length(coalesce(p_rules, '')) > 2000
     or char_length(coalesce(p_note, '')) > 600 then
    raise exception 'One of the text fields is too long.' using errcode = '22023';
  end if;
  v_fees := public.eb_offer_charges_total(coalesce(p_charges, '[]'::jsonb));

  select listing_id into a from public.applications where id = p_application;
  if not found then
    raise exception 'Application not found.' using errcode = 'P0002';
  end if;
  -- Same lock order as admin_decide_application: listing first, then the application.
  select * into l from public.listings where id = a.listing_id for update;
  select * into a from public.applications where id = p_application for update;

  if a.status <> 'approved' then
    raise exception 'An offer can only be made on an approved application (current: %).', a.status using errcode = '22023';
  end if;
  if a.tenant_interest_at is null then
    raise exception 'The tenant has not confirmed they want to proceed yet.' using errcode = '22023';
  end if;
  if l.status is distinct from 'approved' then
    raise exception 'This property is not open for new tenants (listing status: %).', coalesce(l.status, 'unknown') using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t
              where t.listing_id = a.listing_id
                and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')) then
    raise exception 'This property already has a tenancy in progress.' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_offers o
              where o.listing_id = a.listing_id and o.status = 'accepted' and o.application_id <> p_application) then
    raise exception 'Another tenant has already accepted an offer for this property.' using errcode = '22023';
  end if;

  select * into cur from public.rental_offers
   where application_id = p_application and status in ('offered', 'countered', 'accepted') for update;
  if found and cur.status = 'accepted' then
    raise exception 'The tenant already accepted an offer. It cannot be replaced.' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into v_ver from public.rental_offers where application_id = p_application;
  if v_ver > 6 then
    raise exception 'The limit of 6 offer versions was reached. Withdraw the offer or talk to the tenant.' using errcode = '22023';
  end if;
  if found then
    update public.rental_offers set status = 'superseded', responded_at = coalesce(responded_at, now()), updated_at = now()
     where id = cur.id;
  end if;

  v_matches := p_period = 'monthly'
    and p_rent = coalesce(l.price_monthly, -1)
    and v_deposit <= coalesce(l.caution_deposit, 0)
    and v_fees <= coalesce(l.service_charge, 0);

  insert into public.rental_offers (
    application_id, listing_id, tenant_id, landlord_id, version, offered_by, offered_by_role,
    rent_amount, rent_period, duration_months, start_date, deposit_amount, charges, fees_amount,
    payment_schedule, notice_days, house_rules, note, expires_at, landlord_confirmed_at)
  values (
    p_application, a.listing_id, a.tenant_id, a.landlord_id, v_ver, auth.uid(), 'admin',
    p_rent, p_period, p_duration_months, p_start, v_deposit, coalesce(p_charges, '[]'::jsonb), v_fees,
    nullif(btrim(coalesce(p_schedule, '')), ''), p_notice_days, nullif(btrim(coalesce(p_rules, '')), ''),
    nullif(btrim(coalesce(p_note, '')), ''), now() + make_interval(hours => v_hours),
    case when v_matches then now() end)
  returning id into v_id;

  if v_matches then
    perform public.eb_offer_notify(a.tenant_id, 'You have a rental offer',
      'EboHomes sent you a rental offer. Read it and accept, decline or send a counter-offer. Nothing is charged.',
      '/journey/' || p_application);
  else
    perform public.eb_offer_notify(a.landlord_id, 'Rental offer needs your confirmation',
      'EboHomes prepared a rental offer for your property that differs from your listing. Please confirm or decline it.',
      '/dashboard/applications');
  end if;
  perform public.eb_offer_event(p_application, 'offer_issued', 'admin', 'version ' || v_ver);
  return v_id;
end;
$function$;
revoke all on function public.eb_issue_rental_offer(uuid, numeric, text, int, date, numeric, jsonb, text, int, text, text, int) from public, anon;
grant execute on function public.eb_issue_rental_offer(uuid, numeric, text, int, date, numeric, jsonb, text, int, text, text, int) to authenticated;

-- ===== E. Landlord confirms or declines an offer that differs from the listing =====
create or replace function public.eb_landlord_confirm_offer(p_offer uuid, p_confirm boolean, p_note text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o record;
  a record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 600 then
    raise exception 'Keep the note under 600 characters.' using errcode = '22023';
  end if;
  select application_id into o from public.rental_offers where id = p_offer;
  if not found then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  select listing_id into a from public.applications where id = o.application_id;
  perform 1 from public.listings where id = a.listing_id for update;
  perform 1 from public.applications where id = o.application_id for update;
  select * into o from public.rental_offers where id = p_offer for update;
  if o.landlord_id is distinct from auth.uid() then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  if o.status <> 'offered' or o.offered_by_role <> 'admin' or o.landlord_confirmed_at is not null then
    raise exception 'This offer does not need your confirmation (current: %).', o.status using errcode = '22023';
  end if;
  if o.expires_at <= now() then
    update public.rental_offers set status = 'expired', responded_at = now(), updated_at = now() where id = p_offer;
    return;
  end if;

  if p_confirm then
    update public.rental_offers set landlord_confirmed_at = now(), updated_at = now() where id = p_offer;
    perform public.eb_offer_notify(o.tenant_id, 'You have a rental offer',
      'EboHomes sent you a rental offer. Read it and accept, decline or send a counter-offer. Nothing is charged.',
      '/journey/' || o.application_id);
    perform public.eb_offer_event(o.application_id, 'offer_landlord_confirmed', 'landlord', 'version ' || o.version);
  else
    update public.rental_offers
       set status = 'withdrawn', response_note = v_note, responded_at = now(), updated_at = now()
     where id = p_offer;
    perform public.eb_offer_notify_admins('Landlord declined an offer',
      'The landlord did not confirm the rental offer terms. Review the application and issue a new offer.');
    perform public.eb_offer_event(o.application_id, 'offer_landlord_declined', 'landlord', v_note);
  end if;
end;
$function$;
revoke all on function public.eb_landlord_confirm_offer(uuid, boolean, text) from public, anon;
grant execute on function public.eb_landlord_confirm_offer(uuid, boolean, text) to authenticated;

-- ===== F. Tenant accepts, declines or counters =====
-- Returns the offer id (or the new counter-offer id). Returns NULL when the offer had already expired.
create or replace function public.eb_respond_rental_offer(
  p_offer uuid, p_action text, p_note text default null, p_counter jsonb default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o record;
  a record;
  l record;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
  c_rent numeric;
  c_dep numeric;
  c_dur numeric;
  c_start date;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('accept', 'decline', 'counter') then
    raise exception 'Unknown action.' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 600 then
    raise exception 'Keep the note under 600 characters.' using errcode = '22023';
  end if;

  select application_id into o from public.rental_offers where id = p_offer;
  if not found then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  select listing_id into a from public.applications where id = o.application_id;
  select * into l from public.listings where id = a.listing_id for update;
  select * into a from public.applications where id = o.application_id for update;
  select * into o from public.rental_offers where id = p_offer for update;

  if o.tenant_id is distinct from auth.uid() then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  if o.status <> 'offered' or o.offered_by_role <> 'admin' then
    raise exception 'This offer is no longer open (current: %).', o.status using errcode = '22023';
  end if;
  if o.landlord_confirmed_at is null then
    raise exception 'This offer is not ready yet.' using errcode = '22023';
  end if;
  if o.expires_at <= now() then
    update public.rental_offers set status = 'expired', responded_at = now(), updated_at = now() where id = p_offer;
    return null;
  end if;

  if p_action = 'decline' then
    update public.rental_offers
       set status = 'declined', response_note = v_note, responded_at = now(), updated_at = now()
     where id = p_offer;
    perform public.eb_offer_notify(o.landlord_id, 'Rental offer declined', 'The applicant declined the rental offer.', '/dashboard/applications');
    perform public.eb_offer_notify_admins('Rental offer declined', 'A tenant declined a rental offer.');
    perform public.eb_offer_event(o.application_id, 'offer_declined', 'tenant', v_note);
    return p_offer;
  end if;

  if p_action = 'accept' then
    if a.status <> 'approved' then
      raise exception 'Your application is no longer approved (current: %).', a.status using errcode = '22023';
    end if;
    if l.status is distinct from 'approved' then
      raise exception 'This property is no longer open (listing status: %).', coalesce(l.status, 'unknown') using errcode = '22023';
    end if;
    if exists (select 1 from public.tenancies t
                where t.listing_id = o.listing_id
                  and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')) then
      raise exception 'This property already has a tenancy in progress.' using errcode = '22023';
    end if;
    if exists (select 1 from public.rental_offers x
                where x.listing_id = o.listing_id and x.status = 'accepted' and x.id <> o.id) then
      raise exception 'Another tenant has already accepted an offer for this property.' using errcode = '22023';
    end if;
    update public.rental_offers
       set status = 'accepted', response_note = v_note, responded_at = now(), updated_at = now()
     where id = p_offer;
    perform public.eb_offer_notify(o.landlord_id, 'Rental offer accepted',
      'The applicant accepted the rental offer. EboHomes will set up the tenancy and agreement next.', '/dashboard/applications');
    perform public.eb_offer_notify_admins('Rental offer accepted', 'A tenant accepted a rental offer. Set up the tenancy next.');
    perform public.eb_offer_event(o.application_id, 'offer_accepted', 'tenant', 'version ' || o.version);
    return p_offer;
  end if;

  -- counter
  if o.version >= 6 then
    raise exception 'The limit of 6 offer versions was reached. Contact EboHomes.' using errcode = '22023';
  end if;
  if v_note is null or char_length(v_note) < 10 then
    raise exception 'Explain your counter-offer in at least 10 characters.' using errcode = '22023';
  end if;
  if p_counter is null or jsonb_typeof(p_counter) <> 'object'
     or coalesce(jsonb_typeof(p_counter->'rent_amount'), '') <> 'number'
     or coalesce(jsonb_typeof(p_counter->'deposit_amount'), '') <> 'number'
     or coalesce(jsonb_typeof(p_counter->'duration_months'), '') <> 'number'
     or coalesce(jsonb_typeof(p_counter->'start_date'), '') <> 'string' then
    raise exception 'Enter the rent, deposit, start date and length for your counter-offer.' using errcode = '22023';
  end if;
  c_rent := (p_counter->>'rent_amount')::numeric;
  c_dep := (p_counter->>'deposit_amount')::numeric;
  c_dur := (p_counter->>'duration_months')::numeric;
  begin
    c_start := (p_counter->>'start_date')::date;
  exception when others then
    raise exception 'Enter a valid start date.' using errcode = '22023';
  end;
  if c_rent <= 0 or c_rent > 100000000000 or c_dep < 0 or c_dep > 100000000000
     or c_dur <> trunc(c_dur) or c_dur not between 1 and 60
     or c_start < current_date or c_start > current_date + 180 then
    raise exception 'The counter-offer values are not valid.' using errcode = '22023';
  end if;
  if c_rent = o.rent_amount and c_dep = o.deposit_amount and c_start = o.start_date and c_dur::int = o.duration_months then
    raise exception 'Change at least one term, or accept the offer as it is.' using errcode = '22023';
  end if;

  update public.rental_offers set status = 'superseded', responded_at = now(), updated_at = now() where id = p_offer;
  insert into public.rental_offers (
    application_id, listing_id, tenant_id, landlord_id, version, offered_by, offered_by_role, status,
    rent_amount, rent_period, duration_months, start_date, deposit_amount, charges, fees_amount,
    payment_schedule, notice_days, house_rules, note, expires_at)
  values (
    o.application_id, o.listing_id, o.tenant_id, o.landlord_id, o.version + 1, auth.uid(), 'tenant', 'countered',
    c_rent, o.rent_period, c_dur::int, c_start, c_dep, o.charges, o.fees_amount,
    o.payment_schedule, o.notice_days, o.house_rules, v_note, now() + interval '7 days')
  returning id into v_id;

  perform public.eb_offer_notify_admins('Counter-offer received', 'A tenant sent a counter-offer. Review it and issue a new offer.');
  perform public.eb_offer_notify(o.landlord_id, 'Counter-offer from the applicant',
    'The applicant sent a counter-offer. EboHomes will review it and come back to you if the terms change.', '/dashboard/applications');
  perform public.eb_offer_event(o.application_id, 'offer_countered', 'tenant', v_note);
  return v_id;
end;
$function$;
revoke all on function public.eb_respond_rental_offer(uuid, text, text, jsonb) from public, anon;
grant execute on function public.eb_respond_rental_offer(uuid, text, text, jsonb) to authenticated;

-- ===== G. Staff withdraw an open offer =====
create or replace function public.eb_withdraw_rental_offer(p_offer uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o record;
  a record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can withdraw an offer.' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 600 then
    raise exception 'Write a clear reason (10 to 600 characters).' using errcode = '22023';
  end if;
  select application_id into o from public.rental_offers where id = p_offer;
  if not found then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  select listing_id into a from public.applications where id = o.application_id;
  perform 1 from public.listings where id = a.listing_id for update;
  perform 1 from public.applications where id = o.application_id for update;
  select * into o from public.rental_offers where id = p_offer for update;
  if o.status not in ('offered', 'countered') then
    raise exception 'Only an open offer can be withdrawn (current: %). An accepted offer follows the tenancy process.', o.status using errcode = '22023';
  end if;
  update public.rental_offers
     set status = 'withdrawn', response_note = v_reason, responded_at = now(), updated_at = now()
   where id = p_offer;
  if o.landlord_confirmed_at is not null or o.offered_by_role = 'tenant' then
    perform public.eb_offer_notify(o.tenant_id, 'Rental offer withdrawn',
      'EboHomes withdrew the rental offer. Open your application to read why.', '/journey/' || o.application_id);
  end if;
  perform public.eb_offer_notify(o.landlord_id, 'Rental offer withdrawn', 'EboHomes withdrew a rental offer for your property.', '/dashboard/applications');
  perform public.eb_offer_event(o.application_id, 'offer_withdrawn', 'admin', v_reason);
end;
$function$;
revoke all on function public.eb_withdraw_rental_offer(uuid, text) from public, anon;
grant execute on function public.eb_withdraw_rental_offer(uuid, text) to authenticated;

-- ===== H. Expiry sweep (cron, service role). Expiry is also checked every time someone responds, so this only tidies up. =====
create or replace function public.eb_expire_rental_offers()
 returns int
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  n int := 0;
begin
  for r in
    with x as (
      update public.rental_offers
         set status = 'expired', responded_at = now(), updated_at = now()
       where status in ('offered', 'countered') and expires_at <= now()
       returning id, application_id, tenant_id, landlord_confirmed_at, offered_by_role)
    select * from x
  loop
    n := n + 1;
    if r.landlord_confirmed_at is not null or r.offered_by_role = 'tenant' then
      perform public.eb_offer_notify(r.tenant_id, 'Rental offer expired',
        'The rental offer expired. Contact EboHomes if you still want this property.', '/journey/' || r.application_id);
    end if;
  end loop;
  if n > 0 then
    perform public.eb_offer_notify_admins('Rental offers expired', n || ' rental offer(s) expired. Review the applications.');
  end if;
  return n;
end;
$function$;
revoke all on function public.eb_expire_rental_offers() from public, anon, authenticated;
grant execute on function public.eb_expire_rental_offers() to service_role;

commit;

-- CHECK (read only): expect 1 table, 2 unique indexes, 6 functions.
select to_regclass('public.rental_offers') as offers_table;
select indexname from pg_indexes where schemaname = 'public' and tablename = 'rental_offers'
  and indexname in ('rental_offers_one_live_per_application', 'rental_offers_one_accepted_per_listing');
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eb_issue_rental_offer', 'eb_landlord_confirm_offer', 'eb_respond_rental_offer',
                  'eb_withdraw_rental_offer', 'eb_expire_rental_offers', 'eb_offer_charges_total');

-- ROLLBACK (only if no offer exists yet; otherwise keep the table, it is the offer history):
-- drop function if exists public.eb_expire_rental_offers();
-- drop function if exists public.eb_withdraw_rental_offer(uuid, text);
-- drop function if exists public.eb_respond_rental_offer(uuid, text, text, jsonb);
-- drop function if exists public.eb_landlord_confirm_offer(uuid, boolean, text);
-- drop function if exists public.eb_issue_rental_offer(uuid, numeric, text, int, date, numeric, jsonb, text, int, text, text, int);
-- drop function if exists public.eb_offer_notify_admins(text, text);
-- drop function if exists public.eb_offer_notify(uuid, text, text, text);
-- drop function if exists public.eb_offer_event(uuid, text, text, text);
-- drop function if exists public.eb_offer_charges_total(jsonb);
-- drop table if exists public.rental_offers;
