import type React from 'react';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import MobileDrawer from './components/MobileDrawer';
import Footer from './components/Footer';
import Cart from './components/Cart';
import Search from './components/Search';
import WhatsAppButton from './components/WhatsAppButton';
import VIPClubForm from './components/VIPClubForm';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import NotFound from './pages/NotFound';

// El panel admin solo lo usan 2 personas: no se incluye en el bundle de la tienda
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Mayoristas = lazy(() => import('./pages/Mayoristas'));
const Emprendedor = lazy(() => import('./pages/Emprendedor'));

function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ivory text-ink font-sans selection:bg-gold selection:text-ink">
      <Header />
      <MobileDrawer />
      <Search />
      <Cart />
      <VIPClubForm />
      <main id="contenido">{children}</main>
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin"
        element={
          <Suspense fallback={<div className="min-h-screen bg-white" />}>
            <AdminPanel />
          </Suspense>
        }
      />
      <Route path="/" element={<StoreLayout><Home /></StoreLayout>} />
      <Route path="/catalogo" element={<StoreLayout><CategoryPage mode="all" /></StoreLayout>} />
      <Route path="/buscar" element={<StoreLayout><CategoryPage mode="search" /></StoreLayout>} />
      <Route path="/categoria/:slug" element={<StoreLayout><CategoryPage mode="category" /></StoreLayout>} />
      <Route path="/emprendedor" element={<StoreLayout><Suspense fallback={null}><Emprendedor /></Suspense></StoreLayout>} />
      <Route path="/mayoristas" element={<StoreLayout><Suspense fallback={null}><Mayoristas /></Suspense></StoreLayout>} />
      <Route path="*" element={<StoreLayout><NotFound /></StoreLayout>} />
    </Routes>
  );
}
