begin;

alter table public.listing_authority_documents
  add column if not exists supersedes_id uuid references public.listing_authority_documents(id),
  add column if not exists description text;

create or replace function public.eb_authority_add_document(
  p_listing uuid, p_uploader uuid, p_doc_type text, p_path text, p_name text,
  p_mime text, p_size bigint, p_sha256 text, p_supersedes uuid, p_description text)
returns uuid language plpgsql security definer set search_path to 'public','pg_temp'
as $f$
declare l record; o record; v_id uuid;
begin
  select id, landlord_id, authority_status into l from public.listings where id = p_listing;
  if not found or l.landlord_id <> p_uploader then raise exception 'Listing not found.' using errcode = 'P0002'; end if;
  if l.authority_status = 'on_hold' then raise exception 'This listing is being reviewed by EboHomes. Please wait for them to contact you.' using errcode = '22023'; end if;
  if p_path !~ ('^' || p_uploader::text || '/' || p_listing::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$') then raise exception 'Invalid evidence file.' using errcode = '22023'; end if;
  if p_mime not in ('image/jpeg','image/png','image/webp','application/pdf') or p_size is null or p_size <= 0 or p_size > 10485760 then raise exception 'Invalid evidence file.' using errcode = '22023'; end if;
  if p_doc_type = 'other_supporting_document' and length(trim(coalesce(p_description, ''))) < 5 then raise exception 'Write a short description of this document.' using errcode = '22023'; end if;

  if p_supersedes is not null then
    select * into o from public.listing_authority_documents where id = p_supersedes;
    if not found or o.listing_id <> p_listing or o.withdrawn_at is not null then raise exception 'Document not found.' using errcode = 'P0002'; end if;
    if o.doc_type <> p_doc_type then raise exception 'Choose the same kind of document to replace it.' using errcode = '22023'; end if;
  end if;

  insert into public.listing_authority_documents (listing_id, uploaded_by, doc_type, storage_path, original_name, mime_type, size_bytes, sha256, supersedes_id, description)
  values (p_listing, p_uploader, p_doc_type, p_path, left(p_name, 200), p_mime, p_size, p_sha256, p_supersedes, left(nullif(trim(coalesce(p_description, '')), ''), 500))
  returning id into v_id;

  if p_supersedes is not null then
    update public.listing_authority_documents set withdrawn_at = now(), withdrawn_by = p_uploader where id = p_supersedes and withdrawn_at is null;
  end if;
  return v_id;
end $f$;

revoke all on function public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text,uuid,text) from public, anon, authenticated;
grant execute on function public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text,uuid,text) to service_role;

commit;

notify pgrst, 'reload schema';

-- ROLLBACK: drop function if exists public.eb_authority_add_document(uuid,uuid,text,text,text,text,bigint,text,uuid,text);
--           alter table public.listing_authority_documents drop column if exists supersedes_id, drop column if exists description;
