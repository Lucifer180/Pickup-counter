import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { MenuPage } from './pages/MenuPage';
import { PaymentPage } from './pages/PaymentPage';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <header className="topbar">
        <Link to="/" className="brand">
          Pickup Counter
        </Link>
        <span className="muted">Self-service snacks · pay by UPI · collect from locker</span>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/pay/:orderId" element={<PaymentPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  </StrictMode>,
);
