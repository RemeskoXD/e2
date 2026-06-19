import React, { useEffect, useState } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import References from './pages/References';
import Kontakt from './pages/Kontakt';
import CategoryShop from './pages/CategoryShop';
import ProductDetail from './pages/ProductDetail';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import LegalTerms from './pages/LegalTerms';
import LegalPrivacy from './pages/LegalPrivacy';
import LegalCookies from './pages/LegalCookies';
import LegalWithdrawal from './pages/LegalWithdrawal';
import { CartProvider, useCart } from './context/CartContext';

import { Toaster } from 'react-hot-toast';
import AdminLayout from './components/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminProducts from './pages/admin/AdminProducts';
import AdminCategories from './pages/admin/AdminCategories';
import AdminFabricGroups from './pages/admin/AdminFabricGroups';
import AdminOrders from './pages/admin/AdminOrders';
import AdminOrderDetail from './pages/admin/AdminOrderDetail';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminImports from './pages/admin/AdminImports';
import AdminSettings from './pages/admin/AdminSettings';
import AdminBrackets from './pages/admin/AdminBrackets';
import AdminMeasureGuide from './pages/admin/AdminMeasureGuide';
import MeasureGuidePage from './pages/MeasureGuidePage';
import AboutPage from './pages/AboutPage';
import AdminHomepage from './pages/admin/AdminHomepage';
import AdminReviews from './pages/admin/AdminReviews';
import ReviewsAdmin from './pages/admin/ReviewsAdmin';

function parseProductId(path: string): string | null {
  const m = path.match(/^#\/produkt\/([^?]+)/);
  if (!m) return null;
  return m[1];
}

function parseAdminOrderId(path: string): number | null {
  const m = path.match(/^#\/admin\/orders\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function StorefrontRoutes({ currentPath }: { currentPath: string }) {
  const { itemCount } = useCart();
  const productId = parseProductId(currentPath);

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
      <Header cartCount={itemCount} currentPath={currentPath} />
      {currentPath === '#/' && <Home />}
      {currentPath === '#/reference' && <References />}
      {currentPath === '#/kontakt' && <Kontakt />}
      {currentPath.split('?')[0] === '#/kategorie' && <CategoryShop />}
      {productId != null && <ProductDetail productId={productId} />}
      {currentPath === '#/kosik' && <CartPage />}
      {currentPath === '#/checkout' && <CheckoutPage />}
      {currentPath === '#/obchodni-podminky' && <LegalTerms />}
      {currentPath === '#/ochrana-udaju' && <LegalPrivacy />}
      {currentPath === '#/cookies' && <LegalCookies />}
      {currentPath === '#/odstoupeni' && <LegalWithdrawal />}
      {currentPath === '#/jak-zamerit' && <MeasureGuidePage />}
      {currentPath === '#/o-nas' && <AboutPage />}
      <Footer />
    </div>
  );
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    // If user lands on /produkt/:slug directly (e.g. from Facebook share), rewrite to hash route
    if (window.location.pathname.startsWith('/produkt/')) {
      const newHash = '#' + window.location.pathname;
      window.history.replaceState(null, '', '/' + newHash);
      return newHash;
    }
    return window.location.hash || '#/';
  });

  useEffect(() => {
    const onHashChange = () => {
      setCurrentPath(window.location.hash || '#/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const isAdmin = currentPath.startsWith('#/admin');
  const adminOrderId = parseAdminOrderId(currentPath);

  if (isAdmin) {
    return (
      <HelmetProvider>
        <Toaster position="top-right" />
        <AdminLayout currentPath={currentPath}>
          {adminOrderId != null ? (
            <AdminOrderDetail orderId={adminOrderId} />
          ) : (
            <>
              {currentPath === '#/admin' && <AdminDashboard />}
              {currentPath === '#/admin/homepage' && <AdminHomepage />}
              {currentPath === '#/admin/reviews' && <AdminReviews />}
              {currentPath === '#/admin/product-reviews' && <ReviewsAdmin />}
              {currentPath === '#/admin/products' && <AdminProducts />}
              {currentPath === '#/admin/categories' && <AdminCategories />}
              {currentPath === '#/admin/fabric-groups' && <AdminFabricGroups />}
              {currentPath === '#/admin/imports' && <AdminImports />}
              {currentPath === '#/admin/orders' && <AdminOrders />}
              {currentPath === '#/admin/customers' && <AdminCustomers />}
              {currentPath === '#/admin/settings' && <AdminSettings />}
              {currentPath === '#/admin/brackets' && <AdminBrackets />}
              {currentPath === '#/admin/measure-guide' && <AdminMeasureGuide />}
            </>
          )}
        </AdminLayout>
      </HelmetProvider>
    );
  }

  return (
    <HelmetProvider>
      <Toaster position="top-right" />
      <CartProvider>
        <StorefrontRoutes currentPath={currentPath} />
      </CartProvider>
    </HelmetProvider>
  );
}
