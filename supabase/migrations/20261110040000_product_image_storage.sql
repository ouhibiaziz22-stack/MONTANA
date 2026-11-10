-- Ensure product images remain publicly readable on existing projects.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public reads Montana storage" on storage.objects;
create policy "public reads Montana storage"
on storage.objects for select
using (bucket_id in ('product-images', 'homepage-images'));

drop policy if exists "admins manage Montana storage" on storage.objects;
create policy "admins manage Montana storage"
on storage.objects for all
using (bucket_id in ('product-images', 'homepage-images') and public.is_admin())
with check (bucket_id in ('product-images', 'homepage-images') and public.is_admin());

notify pgrst, 'reload schema';
