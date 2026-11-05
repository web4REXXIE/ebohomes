begin;
create or replace function public.profiles_doc_path_guard()
returns trigger language plpgsql set search_path to 'public','pg_temp'
as $f$
declare c text; v text;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  foreach c in array array['id_document_url','selfie_url','ownership_doc_url'] loop
    v := nullif(to_jsonb(new) ->> c, '');
    if v is not null and v is distinct from nullif(to_jsonb(old) ->> c, '')
       and v !~ ('^' || new.id::text || '/[A-Za-z0-9._-]+$') then
      raise exception 'Verification files must be your own uploads.' using errcode = '42501';
    end if;
  end loop;
  return new;
end $f$;
drop trigger if exists a05_profiles_doc_path_guard on public.profiles;
create trigger a05_profiles_doc_path_guard before update on public.profiles
  for each row execute function public.profiles_doc_path_guard();
commit;
-- ROLLBACK: drop trigger if exists a05_profiles_doc_path_guard on public.profiles;
--           drop function if exists public.profiles_doc_path_guard();
