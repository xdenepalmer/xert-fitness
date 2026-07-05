-- ============================================================================
-- XERT Fitness — Storage: public site-images bucket (coach photos etc.)
-- ============================================================================
-- Public read (photos are displayed on the site); uploads/edits admin-only.
-- Idempotent — safe to re-run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do update set public = true;

drop policy if exists "site_images_public_read"  on storage.objects;
drop policy if exists "site_images_admin_insert" on storage.objects;
drop policy if exists "site_images_admin_update" on storage.objects;
drop policy if exists "site_images_admin_delete" on storage.objects;

create policy "site_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'site-images');

create policy "site_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-images' and public.is_admin());

create policy "site_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-images' and public.is_admin())
  with check (bucket_id = 'site-images' and public.is_admin());

create policy "site_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-images' and public.is_admin());
