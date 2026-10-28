-- EboHomes 20261110_01: a property becomes 'rented' as soon as the tenant's payment is VERIFIED
-- (agreement signed + payment confirmed with verified_by set). Handover is no longer required.
-- Replaces eb_complete_rental from 20261109_01. Safe to run once in the Supabase SQL editor.
begin;

-- 1. The only function that marks a listing rented. It re-checks everything itself.
create or replace function public.eb_complete_rental(p_tenancy uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare t record;
begin
  select id, listing_id into t from public.tenancies where id = p_tenancy;
  if not found then return false; end if;
  perform 1 from public.listings where id = t.listing_id for update;
  if not exists (select 1 from public.rental_terms where tenancy_id = p_tenancy and status = 'signed') then return false; end if;
  if not exists (
    select 1 from public.payments
    where tenancy_id = p_tenancy and status = 'confirmed' and verified_by is not null and type in ('rent','deposit')
  ) then return false; end if;
  update public.listings set status = 'rented' where id = t.listing_id and status = 'approved';
  return true;
end;
$f$;
revoke all on function public.eb_complete_rental(uuid) from public, anon, authenticated;

-- 2. Runs the moment a payment becomes verified. A problem here must never undo the payment.
create or replace function public.eb_payment_verified_mark_rented()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
begin
  if new.tenancy_id is not null then
    begin
      perform public.eb_complete_rental(new.tenancy_id);
    exception when others then
      raise warning 'eb_complete_rental failed for tenancy %: %', new.tenancy_id, sqlerrm;
    end;
  end if;
  return new;
end;
$f$;

drop trigger if exists zz_payment_mark_rented on public.payments;
create trigger zz_payment_mark_rented
  after insert or update of status, verified_by on public.payments
  for each row
  when (new.status = 'confirmed' and new.verified_by is not null)
  execute function public.eb_payment_verified_mark_rented();

commit;

-- CHECK (expect 1 row):
select tgname from pg_trigger where tgname = 'zz_payment_mark_rented' and not tgisinternal;

-- OPTIONAL BACKFILL: marks rented any property that already has signed terms + a verified payment.
-- Run this separately, only if you want old paid tenancies fixed too.
-- select t.id, public.eb_complete_rental(t.id) from public.tenancies t
-- where exists (select 1 from public.payments p where p.tenancy_id = t.id and p.status = 'confirmed' and p.verified_by is not null);

-- ROLLBACK:
-- drop trigger if exists zz_payment_mark_rented on public.payments;
-- drop function if exists public.eb_payment_verified_mark_rented();