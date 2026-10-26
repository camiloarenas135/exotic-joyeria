-- Permite al admin subir banners del carrusel a la carpeta hero/ (antes solo products/).
drop policy if exists storage_product_images_insert_admin on storage.objects;
create policy storage_product_images_insert_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] in ('products', 'hero')
    and public.is_admin()
  );
