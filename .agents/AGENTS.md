# Exotic Joyería — Reglas del proyecto

Tienda en línea pequeña de joyería (oro laminado 18k). Los pedidos se cierran por WhatsApp y se guardan en Supabase.

## Stack real
- **Frontend:** React 19 + TypeScript + Vite 6 + Tailwind v4 + react-router-dom + motion. Sin backend propio.
- **Datos y auth:** Supabase (`bimkpnteulwsqxxdfopx`) usado directo desde el navegador con la anon key. Login solo Google.
- **Hosting:** Cloudflare Workers (assets). Headers en `public/_headers`, SPA en `wrangler.jsonc`. Despliegue automático desde `main`.
- **Solo existe producción.** No hay base de pruebas.

## Módulos
- Tienda pública: catálogo, carrito (pedido por WhatsApp), club VIP.
- Panel `/admin` (carga diferida): pedidos, catálogo, VIP, estadísticas. Solo `kevinlgomez058@gmail.com` y `camiloarenas135@gmail.com`.

## Reglas obligatorias
1. **Seguridad en el servidor.** Lo que protege es RLS, no la interfaz. `ADMIN_EMAILS` en `AdminPanel.tsx` solo oculta pantallas; el control real es `public.is_admin()`.
2. **Precios y totales no se confían al navegador.** Todo cálculo que afecte dinero (promoción, precio mayorista, total) debe resolverse en el servidor (función SQL), no en `Cart.tsx`.
3. **Datos sensibles nunca en tablas de lectura pública.** `products` es público: precios mayoristas y datos de negocio van en tablas aparte con RLS.
4. **Migraciones solo aditivas** (columnas/tablas nuevas, nada destructivo) y con respaldo antes. Aplicar con `apply_migration` y reflejar el cambio en `supabase_setup.sql`.
5. **Cada función `SECURITY DEFINER`** lleva `SET search_path = ''`, nombres calificados y `REVOKE EXECUTE` a `anon`/`public` si no debe ser pública. Ojo: `is_admin()` sí debe seguir ejecutable por `anon`/`authenticated` (lo usan las políticas).
6. **Storage:** las imágenes se suben como WebP liviano (ver `AdminCatalog.tsx`); las políticas de `product-images` exigen `is_admin()`.
7. **Enlaces y textos editables por admin** (banners, etc.): validar esquema (`https://`, `/`, `tel:`, `mailto:`); nunca `dangerouslySetInnerHTML`.
8. No exponer la `service_role` key ni secretos en el código.

## Verificación antes de dar algo por terminado
1. `npm run lint` (tsc) sin errores.
2. `npm run build` sin errores.
3. Si hubo cambios de base de datos: `get_advisors` (security y performance) sin avisos nuevos, y probar las políticas con los roles `anon`, `authenticated` sin permisos y admin.
4. Verificar en `https://exoticjoyeria.lat` tras el despliegue.

## Agentes y skills disponibles (`.agents/`)
- Agentes: `planner`, `security-reviewer`, `database-reviewer`, `react-reviewer`, `typescript-reviewer`, `silent-failure-hunter`.
- Reglas: `rules/common-security.md`, `rules/typescript-security.md`.
- Skills: `supabase`, `supabase-postgres-best-practices`, `production-audit`, `verification-loop`.
