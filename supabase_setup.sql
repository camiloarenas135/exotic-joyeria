-- ====================================================================
-- EXOTIC JOYERÍA — Permisos RLS Reforzados & Corrección DB Linter
-- ====================================================================
-- Ejecuta este script completo en el SQL Editor del Dashboard de Supabase.
-- Limpia políticas permisivas antiguas y asegura el mínimo privilegio.
-- ====================================================================


-- ============================================================
-- FUNCIÓN AUXILIAR: is_admin()
-- Con `SET search_path = ''` para prevenir Search Path Mutability Attack (Lint 0011).
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  );
$$;

-- Revocar permisos de ejecución vía API RPC pública (Lints 0028 y 0029)
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated, public;


-- ====================================================================
-- TABLA: products
-- ====================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores (incluyendo las permisivas reportadas por el linter)
DROP POLICY IF EXISTS "Admins edit products"                           ON public.products;
DROP POLICY IF EXISTS "Permitir lectura pública de productos"           ON public.products;
DROP POLICY IF EXISTS "Permitir insertar productos a administradores"   ON public.products;
DROP POLICY IF EXISTS "Permitir actualizar productos a administradores" ON public.products;
DROP POLICY IF EXISTS "Permitir eliminar productos a administradores"   ON public.products;
DROP POLICY IF EXISTS "products_select_public"                         ON public.products;
DROP POLICY IF EXISTS "products_insert_admin"                         ON public.products;
DROP POLICY IF EXISTS "products_update_admin"                         ON public.products;
DROP POLICY IF EXISTS "products_delete_admin"                         ON public.products;

-- SELECT: cualquier visitante puede ver el catálogo
CREATE POLICY "products_select_public"
ON public.products
FOR SELECT
TO anon, authenticated
USING (true);

-- INSERT: solo admin
CREATE POLICY "products_insert_admin"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

-- UPDATE: solo admin
CREATE POLICY "products_update_admin"
ON public.products
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- DELETE: solo admin
CREATE POLICY "products_delete_admin"
ON public.products
FOR DELETE
TO authenticated
USING (public.is_admin());


-- ====================================================================
-- TABLA: vip_members
-- ====================================================================
ALTER TABLE public.vip_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view vip"                                      ON public.vip_members;
DROP POLICY IF EXISTS "Public join vip"                                      ON public.vip_members;
DROP POLICY IF EXISTS "Permitir registro de miembros VIP a cualquiera"      ON public.vip_members;
DROP POLICY IF EXISTS "Permitir lectura de miembros VIP a administradores"  ON public.vip_members;
DROP POLICY IF EXISTS "Permitir eliminar miembros VIP a administradores"    ON public.vip_members;
DROP POLICY IF EXISTS "vip_members_insert_public"                            ON public.vip_members;
DROP POLICY IF EXISTS "vip_members_select_admin"                             ON public.vip_members;
DROP POLICY IF EXISTS "vip_members_delete_admin"                             ON public.vip_members;

-- INSERT: clientes se registran con validación estricta de campos (Lint 0024 fix)
CREATE POLICY "vip_members_insert_public"
ON public.vip_members
FOR INSERT
TO anon, authenticated
WITH CHECK (
  name IS NOT NULL AND length(trim(name)) >= 2 AND
  whatsapp IS NOT NULL AND length(trim(whatsapp)) >= 8
);

-- SELECT: solo admin
CREATE POLICY "vip_members_select_admin"
ON public.vip_members
FOR SELECT
TO authenticated
USING (public.is_admin());

-- DELETE: solo admin
CREATE POLICY "vip_members_delete_admin"
ON public.vip_members
FOR DELETE
TO authenticated
USING (public.is_admin());


-- ====================================================================
-- TABLA: orders
-- ====================================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage orders"                         ON public.orders;
DROP POLICY IF EXISTS "Public create orders"                         ON public.orders;
DROP POLICY IF EXISTS "Permitir crear pedidos a cualquiera"          ON public.orders;
DROP POLICY IF EXISTS "Permitir lectura de pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir actualizar pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir eliminar pedidos a administradores"  ON public.orders;
DROP POLICY IF EXISTS "orders_insert_public"                         ON public.orders;
DROP POLICY IF EXISTS "orders_select_admin"                         ON public.orders;
DROP POLICY IF EXISTS "orders_update_admin"                         ON public.orders;
DROP POLICY IF EXISTS "orders_delete_admin"                         ON public.orders;

-- INSERT: clientes hacen pedidos con validación estricta (Lint 0024 fix)
CREATE POLICY "orders_insert_public"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  customer_name IS NOT NULL AND length(trim(customer_name)) >= 2 AND
  customer_phone IS NOT NULL AND length(trim(customer_phone)) >= 8 AND
  items IS NOT NULL AND
  total_amount IS NOT NULL AND total_amount >= 0 AND
  status = 'pending'
);

-- SELECT: solo admin
CREATE POLICY "orders_select_admin"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_admin());

-- UPDATE: solo admin
CREATE POLICY "orders_update_admin"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (
  public.is_admin() AND
  status IN ('pending', 'confirmed', 'cancelled')
);

-- DELETE: solo admin
CREATE POLICY "orders_delete_admin"
ON public.orders
FOR DELETE
TO authenticated
USING (public.is_admin());


-- ====================================================================
-- STORAGE: bucket 'product-images'
-- ====================================================================
DROP POLICY IF EXISTS "Permitir lectura pública de imágenes de productos"           ON storage.objects;
DROP POLICY IF EXISTS "Permitir subir imágenes de productos a administradores"      ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar imágenes de productos a administradores" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar imágenes de productos a administradores"   ON storage.objects;
DROP POLICY IF EXISTS "storage_product_images_select_public"                         ON storage.objects;
DROP POLICY IF EXISTS "storage_product_images_insert_admin"                         ON storage.objects;
DROP POLICY IF EXISTS "storage_product_images_update_admin"                         ON storage.objects;
DROP POLICY IF EXISTS "storage_product_images_delete_admin"                         ON storage.objects;

-- SELECT: cualquiera
CREATE POLICY "storage_product_images_select_public"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- INSERT: solo admin
CREATE POLICY "storage_product_images_insert_admin"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = 'products' AND
  public.is_admin()
);

-- UPDATE: solo admin
CREATE POLICY "storage_product_images_update_admin"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  public.is_admin()
)
WITH CHECK (
  bucket_id = 'product-images' AND
  public.is_admin()
);

-- DELETE: solo admin
CREATE POLICY "storage_product_images_delete_admin"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  public.is_admin()
);
