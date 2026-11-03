import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendors en archivos propios: la caché del navegador sobrevive a los despliegues del código de la tienda
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'].some((p) => id.includes('node_modules/' + p + '/'))) return 'vendor-react';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (['motion', 'motion-dom', 'motion-utils', 'framer-motion'].some((p) => id.includes('node_modules/' + p + '/'))) return 'vendor-motion';
          return undefined;
        },
      },
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
