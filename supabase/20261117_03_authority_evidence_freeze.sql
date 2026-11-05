begin;
create or replace function public.listing_authority_documents_guard()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare s text;
begin
  if tg_op = 'DELETE' then raise exception 'Evidence records cannot be deleted.' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['withdrawn_at','withdrawn_by']) is distinct from (to_jsonb(old) - array['withdrawn_at','withdrawn_by']) then
    raise exception 'Submitted evidence cannot be edited.' using errcode = '42501';
  end if;
  select authority_status into s from public.listings where id = new.listing_id;
  if s = 'submitted' then
    raise exception 'This listing is being reviewed by EboHomes. Evidence cannot be changed while it is under review.' using errcode = '22023';
  end if;
  return new;
end $f$;
drop trigger if exists aa_listing_authority_documents_guard on public.listing_authority_documents;
create trigger aa_listing_authority_documents_guard before insert or update or delete on public.listing_authority_documents
  for each row execute function public.listing_authority_documents_guard();
commit;
-- ROLLBACK: drop trigger if exists aa_listing_authority_documents_guard on public.listing_authority_documents;
--           drop function if exists public.listing_authority_documents_guard();
