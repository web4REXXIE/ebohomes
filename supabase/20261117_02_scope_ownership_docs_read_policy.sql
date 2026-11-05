begin;
update storage.buckets
   set public = false, file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
 where id = 'property-evidence';
commit;
-- ROLLBACK: update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'property-evidence';
