-- EboHomes 20261201_03 (Phase 10.2, Step C): authority validity dates, revocation fields, history. STORED ONLY.
-- REQUIRES: 20261201_01 and 20261201_02 already run.
-- WHAT:
--   1. listing_authority_claims gets: valid_from, valid_until, validity_basis, validity_recorded_by/at,
--      revoked_at, revoked_by, revoked_reason.
--   2. listing_authority_validity_events: append-only history (recorded, default_applied, override,
--      renewed, expired, revoked). Only 'recorded', 'default_applied' and 'override' are written in this step.
--   3. Trigger: when a review decision 'accepted' is inserted, the claim gets a default 12-month validity
--      (basis 'default_12_months'). An admin can then replace it with the document's stated date.
--   4. Backfill: claims already accepted in Phase 9.2 get 12 months counted from their acceptance date.
--   5. Admin functions: admin_set_authority_validity(), admin_authority_validity_history().
--      Lister function: my_authority_validity() (dates only, no notes).
-- NOT DONE HERE (Phase 10.5): any enforcement. Nothing reads these dates to block, hide, expire or unpublish anything.
--   No listing, tenancy, application or authority_status is changed by this file.
-- Dates are calendar dates in Africa/Lagos. A document's stated expiry is the last valid day.
-- One transaction. Back up first.
begin;

-- 1. columns ----------------------------------------------------------------------
alter table public.listing_authority_claims
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists validity_basis text,
  add column if not exists validity_recorded_by uuid,
  add column if not exists validity_recorded_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revoked_reason text;

do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'listing_authority_claims_validity_basis_chk') then
    alter table public.listing_authority_claims
      add constraint listing_authority_claims_validity_basis_chk
      check (validity_basis is null or validity_basis in ('document_stated','default_12_months','admin_exception'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'listing_authority_claims_validity_order_chk') then
    alter table public.listing_authority_claims
      add constraint listing_authority_claims_validity_order_chk
      check (valid_from is null or valid_until is null or valid_until > valid_from);
  end if;
end $c$;

create index if not exists listing_authority_claims_valid_until_idx
  on public.listing_authority_claims (valid_until) where valid_until is not null;

-- 2. history (append-only) --------------------------------------------------------
create table if not exists public.listing_authority_validity_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  event text not null check (event in ('recorded','default_applied','override','renewed','expired','revoked')),
  old_valid_until date,
  new_valid_until date,
  basis text,
  actor_id uuid,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists listing_authority_validity_events_listing_idx
  on public.listing_authority_validity_events (listing_id, created_at desc);
alter table public.listing_authority_validity_events enable row level security;
revoke all on public.listing_authority_validity_events from anon, authenticated;

create or replace function public.eb_validity_events_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  raise exception 'Validity history cannot be edited or deleted' using errcode = '42501';
end $f$;

drop trigger if exists aa_validity_events_guard on public.listing_authority_validity_events;
create trigger aa_validity_events_guard
  before update or delete on public.listing_authority_validity_events
  for each row execute function public.eb_validity_events_guard();

-- 3. default validity on acceptance -----------------------------------------------
create or replace function public.eb_authority_default_validity()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare v_today date := (now() at time zone 'Africa/Lagos')::date; v_old date; v_found boolean;
begin
  if new.decision <> 'accepted' then return new; end if;
  select valid_until into v_old from public.listing_authority_claims where listing_id = new.listing_id;
  v_found := found;
  if not v_found then return new; end if;

  update public.listing_authority_claims
     set valid_from = v_today,
         valid_until = (v_today + interval '12 months')::date,
         validity_basis = 'default_12_months',
         validity_recorded_by = new.decided_by,
         validity_recorded_at = now()
   where listing_id = new.listing_id;

  insert into public.listing_authority_validity_events (listing_id, event, old_valid_until, new_valid_until, basis, actor_id, note)
  values (new.listing_id, 'default_applied', v_old, (v_today + interval '12 months')::date, 'default_12_months',
          new.decided_by, 'Default 12-month validity applied on acceptance');
  return new;
end $f$;

drop trigger if exists zz_authority_default_validity on public.listing_authority_reviews;
create trigger zz_authority_default_validity
  after insert on public.listing_authority_reviews
  for each row execute function public.eb_authority_default_validity();

revoke all on function public.eb_authority_default_validity(), public.eb_validity_events_guard() from public, anon, authenticated;

-- 4. backfill: Phase 9.2 acceptances get 12 months from their acceptance date -----------
with last_accept as (
  select r.listing_id, max(r.decided_at) as at
    from public.listing_authority_reviews r
   where r.decision = 'accepted'
   group by r.listing_id
), upd as (
  update public.listing_authority_claims c
     set valid_from = (la.at at time zone 'Africa/Lagos')::date,
         valid_until = ((la.at at time zone 'Africa/Lagos')::date + interval '12 months')::date,
         validity_basis = 'default_12_months',
         validity_recorded_at = now()
    from last_accept la, public.listings l
   where la.listing_id = c.listing_id
     and l.id = c.listing_id
     and l.authority_status = 'accepted'
     and c.valid_until is null
  returning c.listing_id, c.valid_until
)
insert into public.listing_authority_validity_events (listing_id, event, new_valid_until, basis, note)
select listing_id, 'default_applied', valid_until, 'default_12_months',
       'Backfill: Phase 9.2 acceptance treated as valid for 12 months from its acceptance date'
  from upd;

-- 5. functions ------------------------------------------------------------------------
-- Admin: replace the validity with the document's stated date (or an explicit exception).
create or replace function public.admin_set_authority_validity(
  p_listing uuid, p_valid_until date, p_basis text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare
  v_uid uuid := auth.uid(); l record; c public.listing_authority_claims;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  v_note text := nullif(left(trim(coalesce(p_note,'')), 1000), '');
  v_from date; v_event text;
begin
  if v_uid is null or not public.eb_is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  if p_basis is null or p_basis not in ('document_stated','admin_exception') then
    raise exception 'Choose the basis: document_stated or admin_exception' using errcode = '22023';
  end if;
  if p_valid_until is null then raise exception 'Enter the expiry date' using errcode = '22023'; end if;
  if p_basis = 'admin_exception' and (v_note is null or length(v_note) < 5) then
    raise exception 'An exception needs a written reason of at least 5 characters' using errcode = '22023';
  end if;

  select id, landlord_id, authority_status into l from public.listings where id = p_listing for update;
  if not found then raise exception 'Listing not found' using errcode = 'P0002'; end if;
  if l.landlord_id = v_uid then raise exception 'You cannot record validity for your own listing' using errcode = '42501'; end if;

  select * into c from public.listing_authority_claims where listing_id = p_listing for update;
  if not found then raise exception 'This listing has no authority claim' using errcode = 'P0002'; end if;

  v_from := coalesce(c.valid_from, v_today);
  if p_valid_until <= v_from then raise exception 'The expiry date must be after the start date (%)', v_from using errcode = '22023'; end if;
  if p_valid_until > v_today + interval '5 years' then
    raise exception 'The expiry date is more than 5 years away. Check it.' using errcode = '22023';
  end if;

  v_event := case when c.valid_until is null then 'recorded' else 'override' end;

  update public.listing_authority_claims
     set valid_from = v_from, valid_until = p_valid_until, validity_basis = p_basis,
         validity_recorded_by = v_uid, validity_recorded_at = now()
   where listing_id = p_listing;

  insert into public.listing_authority_validity_events (listing_id, event, old_valid_until, new_valid_until, basis, actor_id, note)
  values (p_listing, v_event, c.valid_until, p_valid_until, p_basis, v_uid, v_note);

  begin
    perform public.audit_write('authority_validity_' || v_event, 'listing', p_listing,
      jsonb_build_object('valid_until', c.valid_until), jsonb_build_object('valid_until', p_valid_until, 'basis', p_basis), v_note);
  exception when others then null;
  end;
  return jsonb_build_object('ok', true, 'valid_from', v_from, 'valid_until', p_valid_until, 'basis', p_basis);
end $f$;

-- Admin: current validity plus history for one listing.
create or replace function public.admin_authority_validity_history(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare c public.listing_authority_claims;
begin
  if auth.uid() is null or not public.eb_is_admin() then raise exception 'Admin only' using errcode = '42501'; end if;
  select * into c from public.listing_authority_claims where listing_id = p_listing;
  return jsonb_build_object(
    'current', case when c.listing_id is null then null else jsonb_build_object(
      'valid_from', c.valid_from, 'valid_until', c.valid_until, 'basis', c.validity_basis,
      'recorded_at', c.validity_recorded_at, 'revoked_at', c.revoked_at, 'revoked_reason', c.revoked_reason) end,
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event', e.event, 'old_valid_until', e.old_valid_until, 'new_valid_until', e.new_valid_until,
        'basis', e.basis, 'actor_id', e.actor_id, 'note', e.note, 'created_at', e.created_at) order by e.created_at desc)
      from public.listing_authority_validity_events e where e.listing_id = p_listing), '[]'::jsonb));
end $f$;

-- Lister: their own listing's dates only. No notes, no admin names.
create or replace function public.my_authority_validity(p_listing uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $f$
declare v uuid := auth.uid(); l record; c public.listing_authority_claims;
begin
  if v is null then return jsonb_build_object('found', false); end if;
  select id, landlord_id, authority_status into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> v then return jsonb_build_object('found', false); end if;
  select * into c from public.listing_authority_claims where listing_id = p_listing;
  if not found or c.valid_until is null or l.authority_status <> 'accepted' then return jsonb_build_object('found', false); end if;
  return jsonb_build_object('found', true, 'valid_from', c.valid_from, 'valid_until', c.valid_until);
end $f$;

revoke all on function public.admin_set_authority_validity(uuid,date,text,text), public.admin_authority_validity_history(uuid),
  public.my_authority_validity(uuid) from public, anon;
grant execute on function public.admin_set_authority_validity(uuid,date,text,text), public.admin_authority_validity_history(uuid),
  public.my_authority_validity(uuid) to authenticated;

commit;

-- CHECK (read only). Expect: columns 8, table 1, triggers 2, functions 3,
-- and accepted_without_validity 0.
-- select
--  (select count(*) from information_schema.columns where table_schema='public' and table_name='listing_authority_claims'
--     and column_name in ('valid_from','valid_until','validity_basis','validity_recorded_by','validity_recorded_at','revoked_at','revoked_by','revoked_reason')) as columns_should_be_8,
--  (select count(*) from information_schema.tables where table_schema='public' and table_name='listing_authority_validity_events') as table_should_be_1,
--  (select count(*) from pg_trigger where not tgisinternal and tgname in ('aa_validity_events_guard','zz_authority_default_validity')) as triggers_should_be_2,
--  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
--     ('admin_set_authority_validity','admin_authority_validity_history','my_authority_validity')) as functions_should_be_3,
--  (select count(*) from public.listing_authority_claims c join public.listings l on l.id = c.listing_id
--     where l.authority_status='accepted' and c.valid_until is null) as accepted_without_validity_should_be_0;

-- ROLLBACK:
-- drop trigger if exists zz_authority_default_validity on public.listing_authority_reviews;
-- drop trigger if exists aa_validity_events_guard on public.listing_authority_validity_events;
-- drop function if exists public.admin_set_authority_validity(uuid,date,text,text), public.admin_authority_validity_history(uuid),
--   public.my_authority_validity(uuid), public.eb_authority_default_validity(), public.eb_validity_events_guard();
-- drop table if exists public.listing_authority_validity_events;
-- alter table public.listing_authority_claims drop constraint if exists listing_authority_claims_validity_basis_chk,
--   drop constraint if exists listing_authority_claims_validity_order_chk;
-- drop index if exists public.listing_authority_claims_valid_until_idx;
-- alter table public.listing_authority_claims drop column if exists valid_from, drop column if exists valid_until,
--   drop column if exists validity_basis, drop column if exists validity_recorded_by, drop column if exists validity_recorded_at,
--   drop column if exists revoked_at, drop column if exists revoked_by, drop column if exists revoked_reason;
