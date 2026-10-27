import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';
import { AppProvider } from './context/AppContext.tsx';
import { CategoriesProvider } from './context/CategoriesContext.tsx';
import { ChannelProvider } from './context/ChannelContext.tsx';
import { WholesaleCartProvider } from './context/WholesaleCartContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <ChannelProvider>
          <CategoriesProvider>
            <WholesaleCartProvider>
              <App />
            </WholesaleCartProvider>
          </CategoriesProvider>
        </ChannelProvider>
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
