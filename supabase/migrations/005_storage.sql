-- =============================================================================
-- 005_storage.sql  —  private file storage (Supabase Storage)
-- =============================================================================
-- vendor-docs : compliance uploads + logos. Path = {organization_id}/{random}.{ext}
--               Vendors can only touch their own folder. Staff can read all.
-- site-maps   : one site map per city. Path = {city_id}/{random}.{ext}
--               Any signed-in user can read; only admins can upload.
-- Both buckets are PRIVATE: files are only opened with short-lived signed links.
-- Limits: 10 MB, PDF / JPG / PNG (SVG allowed for logos only).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vendor-docs', 'vendor-docs', false, 10485760, array['application/pdf','image/jpeg','image/png','image/svg+xml']),
  ('site-maps',   'site-maps',   false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "vendor docs: own folder read" on storage.objects for select to authenticated
  using (bucket_id = 'vendor-docs' and ((storage.foldername(name))[1] = public.my_org_id()::text or public.is_staff()));
create policy "vendor docs: own folder upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-docs' and ((storage.foldername(name))[1] = public.my_org_id()::text or public.admin_ok()));
create policy "vendor docs: own folder delete" on storage.objects for delete to authenticated
  using (bucket_id = 'vendor-docs' and ((storage.foldername(name))[1] = public.my_org_id()::text or public.admin_ok()));

create policy "site maps: signed-in read" on storage.objects for select to authenticated
  using (bucket_id = 'site-maps');
create policy "site maps: admin write" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-maps' and public.admin_ok());
create policy "site maps: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'site-maps' and public.admin_ok());
create policy "site maps: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-maps' and public.admin_ok());
