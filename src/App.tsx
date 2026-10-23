/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Catalog from './components/Catalog';
import Footer from './components/Footer';
import Cart from './components/Cart';
import Search from './components/Search';
import WhatsAppButton from './components/WhatsAppButton';
import VIPClubForm from './components/VIPClubForm';

// El panel admin solo lo usan 2 personas: no se incluye en el bundle de la tienda
const AdminPanel = lazy(() => import('./components/AdminPanel'));

function StoreFront() {
  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-gold selection:text-white">
      <Header />
      <Search />
      <Cart />
      <main>
        <Catalog />
        <VIPClubForm />
      </main>
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
      <Route path="/*" element={<StoreFront />} />
    </Routes>
  );
}
