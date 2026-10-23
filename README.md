# 💎 Exotic Joyería

Tienda en línea de joyería de lujo. Construida con React, Vite, Supabase y desplegada en Cloudflare.

## 🚀 Stack

| Tecnología | Uso |
|---|---|
| **React 19 + TypeScript** | UI |
| **Vite 6** | Bundler |
| **Tailwind CSS v4** | Estilos |
| **Supabase** | Base de datos + Autenticación |
| **Cloudflare (Workers Assets)** | Hosting + CDN |
| **react-router-dom** | Ruteo |
| **Motion** | Animaciones |

## ⚙️ Configuración local

**Requisitos previos:** Node.js 18+

1. Clona el repositorio:
   ```bash
   git clone https://github.com/tu-usuario/exotic-joyeria.git
   cd exotic-joyeria
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Copia el archivo de variables de entorno y rellena los valores:
   ```bash
   cp .env.example .env
   ```

   Edita `.env` con tus credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## 🌐 Deploy a Cloudflare

```bash
npm run build
npx wrangler deploy
```

Los headers de seguridad y caché están en `public/_headers`; el fallback SPA en `wrangler.jsonc`.

## 📁 Estructura del proyecto

```
src/
├── components/     # Componentes de la UI
│   ├── AdminPanel.tsx
│   ├── AdminCatalog.tsx
│   ├── AdminOrders.tsx
│   ├── Catalog.tsx
│   ├── Cart.tsx
│   ├── Header.tsx
│   ├── Footer.tsx
│   └── ...
├── context/
│   └── AppContext.tsx   # Estado global (carrito, búsqueda, etc.)
├── lib/
│   └── supabase.ts      # Cliente de Supabase
├── App.tsx
└── main.tsx
```

## 🔐 Variables de entorno

| Variable | Descripción |
|---|---|
| `VITE_SUPABASE_URL` | URL del proyecto en Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anónima de Supabase |

> ⚠️ **Nunca subas el archivo `.env` al repositorio.** Está excluido en `.gitignore`.

## 🛡️ Panel de Administración

Accede en `/admin`. Requiere autenticación con Google (correo autorizado).
