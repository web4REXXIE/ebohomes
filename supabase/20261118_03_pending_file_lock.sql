begin;

create or replace function public.profiles_pending_file_lock()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
declare submitted boolean;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if not (old.id_document_url is distinct from new.id_document_url
       or old.selfie_url is distinct from new.selfie_url
       or old.ownership_doc_url is distinct from new.ownership_doc_url) then
    return new;
  end if;
  if old.role is distinct from 'landlord' then return new; end if;
  if old.verified is true or coalesce(old.verification_status, 'pending') <> 'pending' then return new; end if;

  -- "Submitted" = everything required is on file (the ownership document is optional).
  submitted := coalesce(trim(old.business_name), '') <> ''
           and coalesce(trim(old.business_address), '') <> ''
           and coalesce(old.id_document_type, '') <> ''
           and old.id_document_url is not null
           and old.selfie_url is not null
           and (old.account_type is distinct from 'company'
                or (coalesce(trim(old.cac_number), '') <> ''
                    and coalesce(trim(old.representative_name), '') <> ''
                    and coalesce(trim(old.representative_role), '') <> ''));
  if submitted then
    raise exception 'Your documents are being reviewed by EboHomes. You can change them after we decide.' using errcode = '22023';
  end if;
  return new;
end $f$;

drop trigger if exists a06_profiles_pending_file_lock on public.profiles;
create trigger a06_profiles_pending_file_lock before update on public.profiles
  for each row execute function public.profiles_pending_file_lock();

commit;
-- ROLLBACK: drop trigger if exists a06_profiles_pending_file_lock on public.profiles;
--           drop function if exists public.profiles_pending_file_lock();
