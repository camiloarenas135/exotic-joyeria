-- ====================================================================
-- EXOTIC JOYERÍA — Permisos RLS con Privilegio Mínimo
-- ====================================================================
-- Ejecuta este script completo en el SQL Editor del Dashboard de Supabase.
-- Reemplaza TODAS las políticas existentes desde cero.
-- ====================================================================


-- ============================================================
-- FUNCIÓN AUXILIAR: is_admin()
-- Centraliza la verificación de admin para no repetirla en cada política.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  );
$$;


-- ====================================================================
-- TABLA: products
-- Quién necesita qué:
--   - Público (anon):        SELECT (ver catálogo)
--   - Admin autenticado:     INSERT, UPDATE, DELETE
--   - Cliente autenticado:   Nada adicional
-- ====================================================================

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas anteriores
DROP POLICY IF EXISTS "Permitir lectura pública de productos"           ON public.products;
DROP POLICY IF EXISTS "Permitir insertar productos a administradores"   ON public.products;
DROP POLICY IF EXISTS "Permitir actualizar productos a administradores" ON public.products;
DROP POLICY IF EXISTS "Permitir eliminar productos a administradores"   ON public.products;

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

-- UPDATE: solo admin (incluye descuento de inventario al confirmar pedido)
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
-- Quién necesita qué:
--   - Público (anon):        INSERT (registrarse como cliente VIP)
--   - Admin autenticado:     SELECT, DELETE
--   - Nadie:                 UPDATE (no se usa en la app)
-- ====================================================================

ALTER TABLE public.vip_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir registro de miembros VIP a cualquiera"      ON public.vip_members;
DROP POLICY IF EXISTS "Permitir lectura de miembros VIP a administradores"  ON public.vip_members;
DROP POLICY IF EXISTS "Permitir eliminar miembros VIP a administradores"    ON public.vip_members;

-- INSERT: cualquier visitante puede registrarse (cliente en la web)
-- WITH CHECK restringe que solo se inserten los campos permitidos (name, whatsapp)
-- y que ninguno sea vacío
CREATE POLICY "vip_members_insert_public"
ON public.vip_members
FOR INSERT
TO anon, authenticated
WITH CHECK (
  name IS NOT NULL AND length(trim(name)) >= 2 AND
  whatsapp IS NOT NULL AND length(trim(whatsapp)) >= 8
);

-- SELECT: solo admin puede ver la lista de miembros
CREATE POLICY "vip_members_select_admin"
ON public.vip_members
FOR SELECT
TO authenticated
USING (public.is_admin());

-- DELETE: solo admin puede eliminar miembros
CREATE POLICY "vip_members_delete_admin"
ON public.vip_members
FOR DELETE
TO authenticated
USING (public.is_admin());

-- UPDATE: BLOQUEADO para todos (no se necesita en la app)
-- Al no crear una política UPDATE, RLS la deniega por defecto.


-- ====================================================================
-- TABLA: orders
-- Quién necesita qué:
--   - Público (anon):        INSERT (clientes hacen pedidos sin cuenta)
--   - Admin autenticado:     SELECT, UPDATE (confirmar/cancelar), DELETE
--   - Cliente:               No puede ver ni modificar pedidos propios
--                            (los ve por WhatsApp, no en la app)
-- ====================================================================

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir crear pedidos a cualquiera"          ON public.orders;
DROP POLICY IF EXISTS "Permitir lectura de pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir actualizar pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir eliminar pedidos a administradores"  ON public.orders;

-- INSERT: cualquier visitante puede crear un pedido
-- WITH CHECK asegura que el pedido tenga datos mínimos obligatorios
-- y que el status de entrada solo pueda ser 'pending' (no puede auto-confirmarse)
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

-- SELECT: solo admin puede ver todos los pedidos
CREATE POLICY "orders_select_admin"
ON public.orders
FOR SELECT
TO authenticated
USING (public.is_admin());

-- UPDATE: solo admin puede cambiar el estado (confirmar/cancelar)
-- WITH CHECK impide que el admin cambie a un estado inválido
CREATE POLICY "orders_update_admin"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (
  public.is_admin() AND
  status IN ('pending', 'confirmed', 'cancelled')
);

-- DELETE: solo admin puede eliminar pedidos del historial
CREATE POLICY "orders_delete_admin"
ON public.orders
FOR DELETE
TO authenticated
USING (public.is_admin());


-- ====================================================================
-- STORAGE: bucket 'product-images'
-- Quién necesita qué:
--   - Público (anon):        SELECT (ver imágenes en el catálogo)
--   - Admin autenticado:     INSERT (subir), UPDATE (reemplazar), DELETE
--   - Cliente:               Nada
-- ====================================================================

DROP POLICY IF EXISTS "Permitir lectura pública de imágenes de productos"           ON storage.objects;
DROP POLICY IF EXISTS "Permitir subir imágenes de productos a administradores"      ON storage.objects;
DROP POLICY IF EXISTS "Permitir actualizar imágenes de productos a administradores" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar imágenes de productos a administradores"   ON storage.objects;

-- SELECT: cualquiera puede ver las imágenes del catálogo
CREATE POLICY "storage_product_images_select_public"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-images');

-- INSERT: solo admin puede subir imágenes nuevas
-- La imagen debe ir dentro de la carpeta 'products/'
CREATE POLICY "storage_product_images_insert_admin"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND
  (storage.foldername(name))[1] = 'products' AND
  public.is_admin()
);

-- UPDATE: solo admin puede reemplazar/actualizar una imagen existente
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

-- DELETE: solo admin puede eliminar imágenes
CREATE POLICY "storage_product_images_delete_admin"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  public.is_admin()
);
