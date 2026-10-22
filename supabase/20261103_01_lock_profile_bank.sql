-- EboHomes 20261103_01 (Phase 3B): the old bank columns on profiles become read-only for signed-in users.
-- bank_name, bank_account_name, bank_account_number cannot be changed from the browser.
-- account_type is NOT locked: it is the individual/company choice used by landlord verification.
-- RUN ONLY AFTER the updated profile and verify pages are deployed.
begin;

create or replace function public.eb_profiles_lock_bank()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
begin
  -- server-side service role and the SQL editor have no user session and are allowed
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.bank_name is not null or new.bank_account_name is not null or new.bank_account_number is not null then
      raise exception 'Payout account details are managed on the Payout account page' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.bank_name is distinct from old.bank_name
     or new.bank_account_name is distinct from old.bank_account_name
     or new.bank_account_number is distinct from old.bank_account_number then
    raise exception 'Payout account details are managed on the Payout account page' using errcode = '42501';
  end if;
  return new;
end;
$f$;

drop trigger if exists zz_profiles_lock_bank on public.profiles;
create trigger zz_profiles_lock_bank
  before insert or update on public.profiles
  for each row execute function public.eb_profiles_lock_bank();

commit;

-- ROLLBACK:
--   drop trigger if exists zz_profiles_lock_bank on public.profiles;
--   drop function if exists public.eb_profiles_lock_bank();