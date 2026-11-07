-- EboHomes 20261207_01 (Phase 11.8)  *** PROPOSED. NOT EXECUTED. ***
-- Accepted offer -> pending tenancy + rental_terms v1 (atomic), 48h reservation, extend, cancel request, cancel, expiry sweep.
-- Needs 20261206_05 (rental_offers + eb_offer_* helpers).
-- Does NOT add a listing status. Does NOT change payments. Legacy tenancy creation (no offer) keeps working.
begin;

-- ===== A. Preflight =====
do $$
declare
  miss text;
  t_extra text;
  r_extra text;
  v_type text;
begin
  if to_regclass('public.rental_offers') is null or to_regprocedure('public.eb_offer_notify(uuid,text,text,text)') is null then
    raise exception 'STOPPED: run 20261206_05_rental_offers.sql first.';
  end if;

  select string_agg(c, ', ') into miss from unnest(array['application_id','listing_id','tenant_id','landlord_id','status','rent_amount','rent_period','start_date','end_date']) c
   where not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tenancies' and column_name=c);
  if miss is not null then raise exception 'STOPPED: public.tenancies is missing column(s): %. Tell Claude.', miss; end if;

  select string_agg(c, ', ') into miss from unnest(array['tenancy_id','version','status','rent_amount','deposit_amount','fees_amount','payment_schedule','notice_days','house_rules','tenant_accepted_at','landlord_accepted_at']) c
   where not exists (select 1 from information_schema.columns where table_schema='public' and table_name='rental_terms' and column_name=c);
  if miss is not null then raise exception 'STOPPED: public.rental_terms is missing column(s): %. Tell Claude.', miss; end if;

  select data_type into v_type from information_schema.columns where table_schema='public' and table_name='tenancies' and column_name='status';
  if v_type not in ('text', 'character varying') then
    raise exception 'STOPPED: tenancies.status is type %, not text. Tell Claude.', v_type;
  end if;

  select string_agg(column_name, ', ') into t_extra from information_schema.columns
   where table_schema='public' and table_name='tenancies' and is_nullable='NO' and column_default is null and is_identity='NO' and is_generated='NEVER'
     and column_name <> all (array['id','application_id','listing_id','tenant_id','landlord_id','status','rent_amount','rent_period','start_date','end_date']);
  if t_extra is not null then raise exception 'STOPPED: tenancies has required column(s) this migration does not fill: %. Tell Claude.', t_extra; end if;

  select string_agg(column_name, ', ') into r_extra from information_schema.columns
   where table_schema='public' and table_name='rental_terms' and is_nullable='NO' and column_default is null and is_identity='NO' and is_generated='NEVER'
     and column_name <> all (array['id','tenancy_id','version','status','rent_amount','deposit_amount','fees_amount','payment_schedule','notice_days','house_rules','tenant_accepted_at','landlord_accepted_at']);
  if r_extra is not null then raise exception 'STOPPED: rental_terms has required column(s) this migration does not fill: %. Tell Claude.', r_extra; end if;
end $$;

-- ===== B. Allow the new tenancy statuses (rebuilds the status CHECK as a superset; skips if none) =====
do $$
declare
  c record;
  vals text[];
  want text[] := array['pending','awaiting_payment','active','expired','cancelled','terminated','ended','completed'];
begin
  for c in select conname, pg_get_constraintdef(oid) as def from pg_constraint
            where conrelid = 'public.tenancies'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop
    select array_agg(distinct m[1]) into vals from regexp_matches(c.def, '''([a-z_]+)''', 'g') m;
    if vals is null or not ('active' = any(vals)) then continue; end if;
    if want <@ vals then continue; end if;
    select array_agg(distinct x) into vals from unnest(vals || want) x;
    execute format('alter table public.tenancies drop constraint %I', c.conname);
    execute format('alter table public.tenancies add constraint %I check (status = any (%L::text[]))', c.conname, vals);
  end loop;
end $$;

-- ===== C. Columns =====
alter table public.tenancies add column if not exists offer_id uuid references public.rental_offers(id) on delete restrict;
alter table public.tenancies add column if not exists reserved_until timestamptz;
alter table public.tenancies add column if not exists reservation_extensions int not null default 0;
alter table public.tenancies add column if not exists cancel_requested_at timestamptz;
alter table public.tenancies add column if not exists cancel_requested_by uuid;
alter table public.tenancies add column if not exists cancel_request_reason text;
alter table public.tenancies add column if not exists cancelled_at timestamptz;
alter table public.tenancies add column if not exists cancelled_by uuid;
alter table public.tenancies add column if not exists cancel_reason text;

create unique index if not exists tenancies_one_per_offer on public.tenancies (offer_id) where offer_id is not null;
create index if not exists tenancies_reservation_idx on public.tenancies (reserved_until) where status in ('pending', 'awaiting_payment');

-- ===== D. Insert guard: pending tenancies block the property; tenancies with a live offer must come from the offer =====
create or replace function public.eb_tenancy_offer_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (select 1 from public.tenancies t
              where t.listing_id = new.listing_id
                and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')) then
    raise exception 'This property already has a tenancy in progress.' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_offers o
              where o.listing_id = new.listing_id and o.status in ('offered', 'countered', 'accepted')
                and o.application_id is distinct from new.application_id) then
    raise exception 'Another applicant has an open rental offer for this property.' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_offers o
              where o.application_id = new.application_id and o.status in ('offered', 'countered', 'accepted'))
     and coalesce(current_setting('eb.offer_tenancy', true), '') = '' then
    raise exception 'This application has a rental offer. EboHomes creates the tenancy from the accepted offer.' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists b_eb_tenancy_offer_guard on public.tenancies;
create trigger b_eb_tenancy_offer_guard before insert on public.tenancies
  for each row execute function public.eb_tenancy_offer_guard();

-- ===== E. Create the pending tenancy from an accepted offer (staff) =====
create or replace function public.eb_create_tenancy_from_offer(p_offer uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o record;
  a record;
  l record;
  v_tid uuid;
  v_end date;
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can create a tenancy from an offer.' using errcode = '42501';
  end if;
  select application_id into o from public.rental_offers where id = p_offer;
  if not found then raise exception 'Offer not found.' using errcode = 'P0002'; end if;
  select listing_id into a from public.applications where id = o.application_id;
  select * into l from public.listings where id = a.listing_id for update;
  select * into a from public.applications where id = o.application_id for update;
  select * into o from public.rental_offers where id = p_offer for update;

  if o.status <> 'accepted' then
    raise exception 'Only an accepted offer can become a tenancy (current: %).', o.status using errcode = '22023';
  end if;
  if a.status <> 'approved' then
    raise exception 'The application is no longer approved (current: %).', a.status using errcode = '22023';
  end if;
  if l.status is distinct from 'approved' then
    raise exception 'The property is not open (listing status: %).', coalesce(l.status, 'unknown') using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies where application_id = o.application_id) then
    raise exception 'A tenancy already exists for this application.' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t where t.listing_id = o.listing_id
              and t.status not in ('ended', 'terminated', 'cancelled', 'expired', 'completed')) then
    raise exception 'This property already has a tenancy in progress.' using errcode = '22023';
  end if;

  v_end := (o.start_date + make_interval(months => o.duration_months))::date;
  perform set_config('eb.offer_tenancy', p_offer::text, true);
  insert into public.tenancies (application_id, listing_id, tenant_id, landlord_id, status, rent_amount, rent_period,
                                start_date, end_date, offer_id, reserved_until)
  values (o.application_id, o.listing_id, o.tenant_id, o.landlord_id, 'pending', o.rent_amount, o.rent_period,
          o.start_date, v_end, p_offer, now() + interval '48 hours')
  returning id into v_tid;
  perform set_config('eb.offer_tenancy', '', true);

  insert into public.rental_terms (tenancy_id, version, status, rent_amount, deposit_amount, fees_amount, payment_schedule,
                                   notice_days, house_rules, tenant_accepted_at, landlord_accepted_at)
  values (v_tid, 1, 'accepted', o.rent_amount, o.deposit_amount, o.fees_amount, o.payment_schedule,
          o.notice_days, o.house_rules, coalesce(o.responded_at, now()), coalesce(o.landlord_confirmed_at, o.created_at));

  perform public.eb_offer_notify(o.tenant_id, 'Your property is reserved for 48 hours',
    'EboHomes created your tenancy and reserved the property for 48 hours. Open your journey to see the agreement and next steps. Nothing is charged yet.',
    '/journey/' || o.application_id);
  perform public.eb_offer_notify(o.landlord_id, 'Tenancy created from the accepted offer',
    'EboHomes created a pending tenancy for your property. It is reserved for 48 hours while the agreement and first payment are completed.',
    '/dashboard/applications');
  perform public.eb_offer_event(o.application_id, 'tenancy_created_from_offer', 'admin', 'tenancy ' || v_tid);
  return v_tid;
end;
$function$;
revoke all on function public.eb_create_tenancy_from_offer(uuid) from public, anon;
grant execute on function public.eb_create_tenancy_from_offer(uuid) to authenticated;

-- ===== F. Extend the reservation (staff) =====
create or replace function public.eb_extend_reservation(p_tenancy uuid, p_hours int, p_reason text)
 returns timestamptz
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
  a record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new timestamptz;
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can extend a reservation.' using errcode = '42501';
  end if;
  if p_hours is null or p_hours not between 1 and 168 then
    raise exception 'Extend by 1 to 168 hours.' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 600 then
    raise exception 'Write a clear reason (10 to 600 characters).' using errcode = '22023';
  end if;
  select listing_id, application_id into t from public.tenancies where id = p_tenancy;
  if not found then raise exception 'Tenancy not found.' using errcode = 'P0002'; end if;
  perform 1 from public.listings where id = t.listing_id for update;
  select * into t from public.tenancies where id = p_tenancy for update;
  if t.offer_id is null or t.status not in ('pending', 'awaiting_payment') then
    raise exception 'Only a pending tenancy created from an offer can be extended (current: %).', t.status using errcode = '22023';
  end if;
  v_new := greatest(coalesce(t.reserved_until, now()), now()) + make_interval(hours => p_hours);
  update public.tenancies set reserved_until = v_new, reservation_extensions = reservation_extensions + 1 where id = p_tenancy;
  perform public.eb_offer_notify(t.tenant_id, 'Your reservation was extended',
    'EboHomes extended the time to complete your agreement and payment.', '/journey/' || t.application_id);
  perform public.eb_offer_event(t.application_id, 'reservation_extended', 'admin', p_hours || ' hours: ' || v_reason);
  return v_new;
end;
$function$;
revoke all on function public.eb_extend_reservation(uuid, int, text) from public, anon;
grant execute on function public.eb_extend_reservation(uuid, int, text) to authenticated;

-- ===== G. Tenant or landlord asks to cancel a pending tenancy =====
create or replace function public.eb_request_tenancy_cancel(p_tenancy uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_role text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 600 then
    raise exception 'Write a clear reason (10 to 600 characters).' using errcode = '22023';
  end if;
  select * into t from public.tenancies where id = p_tenancy for update;
  if not found or (t.tenant_id is distinct from auth.uid() and t.landlord_id is distinct from auth.uid()) then
    raise exception 'Tenancy not found.' using errcode = 'P0002';
  end if;
  if t.offer_id is null or t.status not in ('pending', 'awaiting_payment') then
    raise exception 'Only a pending tenancy can be cancelled this way. An active tenancy follows the termination process.' using errcode = '22023';
  end if;
  if t.cancel_requested_at is not null then
    raise exception 'A cancellation request is already waiting for EboHomes.' using errcode = '22023';
  end if;
  v_role := case when t.tenant_id = auth.uid() then 'tenant' else 'landlord' end;
  update public.tenancies set cancel_requested_at = now(), cancel_requested_by = auth.uid(), cancel_request_reason = v_role || ': ' || v_reason
   where id = p_tenancy;
  perform public.eb_offer_notify_admins('Cancellation requested', 'A ' || v_role || ' asked to cancel a pending tenancy. Review it under Reservations.');
  perform public.eb_offer_event(t.application_id, 'tenancy_cancel_requested', v_role, v_reason);
end;
$function$;
revoke all on function public.eb_request_tenancy_cancel(uuid, text) from public, anon;
grant execute on function public.eb_request_tenancy_cancel(uuid, text) to authenticated;

-- ===== H. Cancel a pending tenancy (staff). Frees the property. =====
create or replace function public.eb_cancel_pending_tenancy(p_tenancy uuid, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  t record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not coalesce(public.eb_is_admin(), false) then
    raise exception 'Only EboHomes staff can cancel a pending tenancy.' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 600 then
    raise exception 'Write a clear reason (10 to 600 characters).' using errcode = '22023';
  end if;
  select listing_id into t from public.tenancies where id = p_tenancy;
  if not found then raise exception 'Tenancy not found.' using errcode = 'P0002'; end if;
  perform 1 from public.listings where id = t.listing_id for update;
  select * into t from public.tenancies where id = p_tenancy for update;
  if t.offer_id is null or t.status not in ('pending', 'awaiting_payment') then
    raise exception 'Only a pending tenancy can be cancelled here (current: %). An active tenancy needs the termination process.', t.status using errcode = '22023';
  end if;
  if exists (select 1 from public.payments p where p.tenancy_id = p_tenancy and coalesce(p.status, '') not in ('rejected', 'failed', 'cancelled'))
     or exists (select 1 from public.payment_submissions s where s.tenancy_id = p_tenancy and coalesce(s.status, '') not in ('rejected', 'superseded')) then
    raise exception 'Payment evidence exists for this tenancy. Resolve the payment first, then cancel.' using errcode = '22023';
  end if;

  update public.tenancies
     set status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = v_reason, reserved_until = null
   where id = p_tenancy;
  update public.rental_terms set status = 'declined' where tenancy_id = p_tenancy and status in ('proposed', 'accepted', 'signed');
  update public.rental_offers
     set status = 'withdrawn', response_note = 'Tenancy cancelled: ' || v_reason, responded_at = now(), updated_at = now()
   where id = t.offer_id and status = 'accepted';

  perform public.eb_offer_notify(t.tenant_id, 'Your pending tenancy was cancelled',
    'EboHomes cancelled your pending tenancy. Nothing was charged. Open your journey to read why.', '/journey/' || t.application_id);
  perform public.eb_offer_notify(t.landlord_id, 'Pending tenancy cancelled',
    'EboHomes cancelled a pending tenancy for your property. The property is open again.', '/dashboard/applications');
  perform public.eb_offer_event(t.application_id, 'tenancy_cancelled', 'admin', v_reason);
end;
$function$;
revoke all on function public.eb_cancel_pending_tenancy(uuid, text) from public, anon;
grant execute on function public.eb_cancel_pending_tenancy(uuid, text) to authenticated;

-- ===== I. Expiry sweep (cron, service role) =====
-- Expires overdue reservations with NO signed agreement and NO payment evidence. Anything else is only flagged to staff.
create or replace function public.eb_expire_reservations()
 returns int
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  n int := 0;
  flagged int := 0;
begin
  for r in
    select t.id, t.listing_id, t.application_id, t.tenant_id, t.landlord_id, t.offer_id
      from public.tenancies t
     where t.offer_id is not null and t.status in ('pending', 'awaiting_payment') and t.reserved_until <= now()
     order by t.reserved_until
  loop
    perform 1 from public.listings where id = r.listing_id for update;
    perform 1 from public.tenancies where id = r.id and status in ('pending', 'awaiting_payment') and reserved_until <= now() for update;
    if not found then continue; end if;

    if exists (select 1 from public.rental_terms x where x.tenancy_id = r.id and x.status = 'signed')
       or exists (select 1 from public.payments p where p.tenancy_id = r.id and coalesce(p.status, '') not in ('rejected', 'failed', 'cancelled'))
       or exists (select 1 from public.payment_submissions s where s.tenancy_id = r.id and coalesce(s.status, '') not in ('rejected', 'superseded')) then
      flagged := flagged + 1;
      continue;
    end if;

    update public.tenancies set status = 'expired', cancelled_at = now(), cancel_reason = 'Reservation expired', reserved_until = null where id = r.id;
    update public.rental_terms set status = 'declined' where tenancy_id = r.id and status in ('proposed', 'accepted');
    update public.rental_offers set status = 'expired', response_note = 'Reservation expired', responded_at = now(), updated_at = now()
     where id = r.offer_id and status = 'accepted';
    n := n + 1;
    perform public.eb_offer_notify(r.tenant_id, 'Your reservation expired',
      'The 48 hour reservation ended before the agreement and payment were completed. Contact EboHomes if you still want this property.', '/journey/' || r.application_id);
    perform public.eb_offer_notify(r.landlord_id, 'Reservation expired',
      'A pending tenancy for your property expired. The property is open again.', '/dashboard/applications');
    perform public.eb_offer_event(r.application_id, 'reservation_expired', 'system', null);
  end loop;
  if n > 0 then
    perform public.eb_offer_notify_admins('Reservations expired', n || ' reservation(s) expired. The properties are open again.');
  end if;
  if flagged > 0 then
    perform public.eb_offer_notify_admins('Overdue reservations need review', flagged || ' reservation(s) are overdue but have a signed agreement or payment evidence. Extend or resolve them.');
  end if;
  return n;
end;
$function$;
revoke all on function public.eb_expire_reservations() from public, anon, authenticated;
grant execute on function public.eb_expire_reservations() to service_role;

-- ===== J. Tenant reads their own reservation (no column grants needed) =====
create or replace function public.eb_my_reservation(p_application uuid)
 returns table (tenancy_id uuid, status text, reserved_until timestamptz, cancel_requested boolean)
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $$
  select t.id, t.status::text, t.reserved_until, t.cancel_requested_at is not null
    from public.tenancies t
   where t.application_id = p_application and t.tenant_id = auth.uid()
     and t.offer_id is not null and t.status in ('pending', 'awaiting_payment')
   limit 1;
$$;
revoke all on function public.eb_my_reservation(uuid) from public, anon;
grant execute on function public.eb_my_reservation(uuid) to authenticated;

-- ===== K. Status hooks (never block the original action) =====
create or replace function public.eb_tenancy_on_listing_rented()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = 'rented' and old.status is distinct from 'rented' then
    begin
      update public.tenancies set status = 'active', reserved_until = null
       where listing_id = new.id and offer_id is not null and status in ('pending', 'awaiting_payment');
    exception when others then
      raise warning 'eb_tenancy_on_listing_rented failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists z_eb_tenancy_on_listing_rented on public.listings;
create trigger z_eb_tenancy_on_listing_rented after update of status on public.listings
  for each row execute function public.eb_tenancy_on_listing_rented();

create or replace function public.eb_tenancy_on_terms_signed()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  if new.status = 'signed' and old.status is distinct from 'signed' then
    begin
      update public.tenancies set status = 'awaiting_payment'
       where id = new.tenancy_id and offer_id is not null and status = 'pending';
    exception when others then
      raise warning 'eb_tenancy_on_terms_signed failed: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists z_eb_tenancy_on_terms_signed on public.rental_terms;
create trigger z_eb_tenancy_on_terms_signed after update of status on public.rental_terms
  for each row execute function public.eb_tenancy_on_terms_signed();

commit;

-- CHECK (read only): expect 7 functions, 2 triggers on tenancies/listings/rental_terms.
select proname from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('eb_create_tenancy_from_offer', 'eb_extend_reservation', 'eb_request_tenancy_cancel',
                  'eb_cancel_pending_tenancy', 'eb_expire_reservations', 'eb_my_reservation', 'eb_tenancy_offer_guard');
select tgname from pg_trigger where not tgisinternal
  and tgname in ('b_eb_tenancy_offer_guard', 'z_eb_tenancy_on_listing_rented', 'z_eb_tenancy_on_terms_signed');

-- ROLLBACK (only while no offer-created tenancy exists):
-- drop trigger if exists z_eb_tenancy_on_terms_signed on public.rental_terms;
-- drop trigger if exists z_eb_tenancy_on_listing_rented on public.listings;
-- drop trigger if exists b_eb_tenancy_offer_guard on public.tenancies;
-- drop function if exists public.eb_my_reservation(uuid);
-- drop function if exists public.eb_expire_reservations();
-- drop function if exists public.eb_cancel_pending_tenancy(uuid, text);
-- drop function if exists public.eb_request_tenancy_cancel(uuid, text);
-- drop function if exists public.eb_extend_reservation(uuid, int, text);
-- drop function if exists public.eb_create_tenancy_from_offer(uuid);
-- drop function if exists public.eb_tenancy_on_terms_signed();
-- drop function if exists public.eb_tenancy_on_listing_rented();
-- drop function if exists public.eb_tenancy_offer_guard();
