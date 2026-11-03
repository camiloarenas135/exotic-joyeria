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
import MinOrderBar from './components/MinOrderBar';
import WholesaleCartDrawer from './components/WholesaleCartDrawer';
import { useChannel } from './context/ChannelContext';

// El panel admin solo lo usan 2 personas: no se incluye en el bundle de la tienda
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const Mayoristas = lazy(() => import('./pages/Mayoristas'));
const MayoristasAcceso = lazy(() => import('./pages/MayoristasAcceso'));
const MisPedidos = lazy(() => import('./pages/MisPedidos'));
const Emprendedor = lazy(() => import('./pages/Emprendedor'));

function StoreLayout({ children }: { children: React.ReactNode }) {
  const { channel, notice, dismissNotice } = useChannel();
  const wholesale = channel === 'wholesale';
  return (
    <div className={`min-h-screen bg-ivory text-ink font-sans selection:bg-gold selection:text-ink ${wholesale ? 'pb-24' : ''}`}>
      <Header />
      <MobileDrawer />
      <Search />
      {wholesale ? <WholesaleCartDrawer /> : <Cart />}
      {!wholesale && <VIPClubForm />}
      {notice && (
        <div role="status" data-testid="channel-notice" className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button onClick={dismissNotice} aria-label="Cerrar aviso" className="size-11 -my-3 flex items-center justify-center">×</button>
          </div>
        </div>
      )}
      {/* key=canal: al cambiar de canal se desmonta todo lo de la página (nunca quedan precios del otro canal) */}
      <main id="contenido" key={`main-${channel}`}>{children}</main>
      <ProductDeepLink key={`deeplink-${channel}`} />
      <Footer />
      {wholesale ? <MinOrderBar /> : <WhatsAppButton />}
    </div>
  );
}

/** Páginas solo del detal (Kit Emprendedor): el mayorista vuelve al inicio. */
function RetailOnly({ children }: { children: React.ReactNode }) {
  const { channel, resolving } = useChannel();
  if (!resolving && channel === 'wholesale') return <Navigate to="/" replace />;
  return <>{children}</>;
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
      <Route path="/emprendedor" element={<StoreLayout><RetailOnly><Suspense fallback={null}><Emprendedor /></Suspense></RetailOnly></StoreLayout>} />
      <Route path="/mayoristas" element={<StoreLayout><Suspense fallback={null}><Mayoristas /></Suspense></StoreLayout>} />
      <Route path="/mayoristas/pedidos" element={<StoreLayout><Suspense fallback={null}><MisPedidos /></Suspense></StoreLayout>} />
      <Route path="/mayoristas/acceso"element={<StoreLayout><Suspense fallback={null}><MayoristasAcceso /></Suspense></StoreLayout>} />
      <Route path="*" element={<StoreLayout><NotFound /></StoreLayout>} />
    </Routes>
  );
}
