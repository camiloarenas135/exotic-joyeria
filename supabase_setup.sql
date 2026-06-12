-- ====================================================================
-- EXOTIC JOYERÍA — Script de Configuración de Permisos (Políticas RLS)
-- ====================================================================
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase
-- para solucionar todos los errores de permisos (código 42501).
-- ====================================================================

-- 1. Habilitar Row Level Security (RLS) en todas las tablas
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas existentes para evitar conflictos
DROP POLICY IF EXISTS "Permitir lectura pública de productos" ON public.products;
DROP POLICY IF EXISTS "Permitir insertar productos a administradores" ON public.products;
DROP POLICY IF EXISTS "Permitir actualizar productos a administradores" ON public.products;
DROP POLICY IF EXISTS "Permitir eliminar productos a administradores" ON public.products;

DROP POLICY IF EXISTS "Permitir registro de miembros VIP a cualquiera" ON public.vip_members;
DROP POLICY IF EXISTS "Permitir lectura de miembros VIP a administradores" ON public.vip_members;
DROP POLICY IF EXISTS "Permitir eliminar miembros VIP a administradores" ON public.vip_members;

DROP POLICY IF EXISTS "Permitir crear pedidos a cualquiera" ON public.orders;
DROP POLICY IF EXISTS "Permitir lectura de pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir actualizar pedidos a administradores" ON public.orders;
DROP POLICY IF EXISTS "Permitir eliminar pedidos a administradores" ON public.orders;

-- ==========================================
-- POLÍTICAS PARA LA TABLA 'products'
-- ==========================================

-- Permite que cualquier usuario (público / anon / cliente) pueda ver los productos del catálogo.
CREATE POLICY "Permitir lectura pública de productos"
ON public.products
FOR SELECT
TO public
USING (true);

-- Permite que solo los administradores autenticados puedan CREAR productos.
CREATE POLICY "Permitir insertar productos a administradores"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ACTUALIZAR productos (incluye actualizar stock/inventario).
CREATE POLICY "Permitir actualizar productos a administradores"
ON public.products
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ELIMINAR productos.
CREATE POLICY "Permitir eliminar productos a administradores"
ON public.products
FOR DELETE
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);


-- ==========================================
-- POLÍTICAS PARA LA TABLA 'vip_members'
-- ==========================================

-- Permite que cualquier persona (público / cliente) se registre en la lista VIP.
CREATE POLICY "Permitir registro de miembros VIP a cualquiera"
ON public.vip_members
FOR INSERT
TO public
WITH CHECK (true);

-- Permite que solo los administradores autenticados puedan VER la lista de miembros VIP.
CREATE POLICY "Permitir lectura de miembros VIP a administradores"
ON public.vip_members
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ELIMINAR miembros VIP.
CREATE POLICY "Permitir eliminar miembros VIP a administradores"
ON public.vip_members
FOR DELETE
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);


-- ==========================================
-- POLÍTICAS PARA LA TABLA 'orders'
-- ==========================================

-- Permite que cualquier persona pueda CREAR un pedido (proceso de checkout del cliente).
CREATE POLICY "Permitir crear pedidos a cualquiera"
ON public.orders
FOR INSERT
TO public
WITH CHECK (true);

-- Permite que solo los administradores autenticados puedan VER el historial de pedidos.
CREATE POLICY "Permitir lectura de pedidos a administradores"
ON public.orders
FOR SELECT
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ACTUALIZAR pedidos (para confirmar o cancelar).
CREATE POLICY "Permitir actualizar pedidos a administradores"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
)
WITH CHECK (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ELIMINAR pedidos.
CREATE POLICY "Permitir eliminar pedidos a administradores"
ON public.orders
FOR DELETE
TO authenticated
USING (
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);


-- ====================================================
-- POLÍTICAS DE ACCESO PARA EL ALMACENAMIENTO DE IMÁGENES
-- (Bucket: 'product-images' en storage.objects)
-- ====================================================

-- Limpiar políticas de Storage existentes para evitar duplicidad
DROP POLICY IF EXISTS "Permitir lectura pública de imágenes de productos" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subir imágenes de productos a administradores" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminar imágenes de productos a administradores" ON storage.objects;

-- Permite que cualquiera pueda VER las imágenes de los productos en la web.
CREATE POLICY "Permitir lectura pública de imágenes de productos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'product-images');

-- Permite que solo los administradores autenticados puedan SUBIR imágenes a la carpeta de productos.
CREATE POLICY "Permitir subir imágenes de productos a administradores"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images' AND
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);

-- Permite que solo los administradores autenticados puedan ELIMINAR imágenes de productos.
CREATE POLICY "Permitir eliminar imágenes de productos a administradores"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images' AND
  (auth.jwt() ->> 'email') IN (
    'kevinlgomez058@gmail.com',
    'camiloarenas135@gmail.com'
  )
);
