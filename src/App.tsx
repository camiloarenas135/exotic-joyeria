import type React from 'react';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import Header from './components/Header';
import MobileDrawer from './components/MobileDrawer';
import Footer from './components/Footer';
import Cart from './components/Cart';
import Search from './components/Search';
import WhatsAppButton from './components/WhatsAppButton';
import VIPClubForm from './components/VIPClubForm';
import Home from './pages/Home';
import CatalogPage from './pages/CatalogPage';
import ProductDeepLink from './components/ProductDeepLink';
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
      <ProductDeepLink />
      <Footer />
      <WhatsAppButton />
    </div>
  );
}

const SLUG_RE = /^[a-z0-9-]{1,60}$/;

/** /categoria/:slug es el nombre anterior: redirige para siempre a /coleccion/:slug conservando query y hash. */
function LegacyCategoryRedirect() {
  const { slug = '' } = useParams();
  const { search, hash } = useLocation();
  if (!SLUG_RE.test(slug)) return <StoreLayout><NotFound /></StoreLayout>;
  return <Navigate replace to={{ pathname: `/coleccion/${encodeURIComponent(slug)}`, search, hash }} />;
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
      <Route path="/catalogo" element={<StoreLayout><CatalogPage mode="all" /></StoreLayout>} />
      <Route path="/promociones" element={<StoreLayout><CatalogPage mode="promos" /></StoreLayout>} />
      <Route path="/buscar" element={<StoreLayout><CatalogPage mode="search" /></StoreLayout>} />
      <Route path="/coleccion/:slug" element={<StoreLayout><CatalogPage mode="category" /></StoreLayout>} />
      <Route path="/categoria/:slug" element={<LegacyCategoryRedirect />} />
      <Route path="/emprendedor" element={<StoreLayout><Suspense fallback={null}><Emprendedor /></Suspense></StoreLayout>} />
      <Route path="/mayoristas" element={<StoreLayout><Suspense fallback={null}><Mayoristas /></Suspense></StoreLayout>} />
      <Route path="*" element={<StoreLayout><NotFound /></StoreLayout>} />
    </Routes>
  );
}
