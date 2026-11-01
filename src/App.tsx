import { useState, useMemo } from 'react';
import Sidebar, { type ViewName } from '@/components/Sidebar';
import ProductModal from '@/components/ProductModal';
import { useInventoryData } from '@/hooks/useInventoryData';
import { getExpiryStatus } from '@/lib/utils';
import type { Product } from '@/types/database';

import DashboardView from '@/views/DashboardView';
import InventoryView from '@/views/InventoryView';
import ExpiryView from '@/views/ExpiryView';
import MovementsView from '@/views/MovementsView';
import AlertsView from '@/views/AlertsView';
import SettingsView from '@/views/SettingsView';

export default function App() {
  const { products, categories, alertSettings, loading, error, reload } = useInventoryData();
  const [view, setView] = useState<ViewName>('dashboard');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const alertCount = useMemo(() => {
    if (!alertSettings) return 0;
    const warningDays = alertSettings.expiry_warning_days;
    return products.filter((p) => {
      if (p.status !== 'active') return false;
      const isLowStock = Number(p.stock_quantity) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0;
      const expiryStatus = getExpiryStatus(p.expiry_date, warningDays);
      return isLowStock || expiryStatus === 'expired' || expiryStatus === 'critical' || expiryStatus === 'warning';
    }).length;
  }, [products, alertSettings]);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setShowProductModal(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleCloseModal = () => {
    setShowProductModal(false);
    setEditingProduct(null);
  };

  const handleSaved = () => {
    handleCloseModal();
    reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
          <p className="mt-4 text-sm text-slate-500">Loading inventory...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-red-600">Connection Error</p>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <button
            onClick={reload}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar active={view} onNavigate={setView} alertCount={alertCount} />

      <main className="ml-64 p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          {view === 'dashboard' && (
            <DashboardView
              products={products}
              categories={categories}
              alertSettings={alertSettings}
              onNavigate={setView}
              onAddProduct={handleAddProduct}
              onAdjustStock={handleEditProduct}
            />
          )}
          {view === 'inventory' && (
            <InventoryView
              products={products}
              categories={categories}
              alertSettings={alertSettings}
              onAddProduct={handleAddProduct}
              onEditProduct={handleEditProduct}
            />
          )}
          {view === 'expiry' && (
            <ExpiryView
              products={products}
              alertSettings={alertSettings}
              onAdjustStock={handleEditProduct}
            />
          )}
          {view === 'movements' && (
            <MovementsView products={products} />
          )}
          {view === 'alerts' && (
            <AlertsView products={products} alertSettings={alertSettings} />
          )}
          {view === 'settings' && (
            <SettingsView
              alertSettings={alertSettings}
              categories={categories}
              onSettingsUpdated={reload}
            />
          )}
        </div>
      </main>

      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={handleCloseModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
