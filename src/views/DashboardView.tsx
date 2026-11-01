import { useMemo } from 'react';
import { Package, AlertTriangle, CalendarClock, TrendingUp, ArrowRight, Plus, ArrowDownUp } from 'lucide-react';
import type { Product, Category, AlertSettings } from '@/types/database';
import { getExpiryStatus, expiryStatusConfig, daysUntil, formatCurrency, formatNumber } from '@/lib/utils';
import StatsRow from '@/components/StatsRow';

interface DashboardViewProps {
  products: Product[];
  categories: Category[];
  alertSettings: AlertSettings | null;
  onNavigate: (view: 'dashboard' | 'inventory' | 'expiry' | 'movements' | 'alerts' | 'settings') => void;
  onAddProduct: () => void;
  onAdjustStock: (product: Product) => void;
}

export default function DashboardView({ products, categories, alertSettings, onNavigate, onAddProduct, onAdjustStock }: DashboardViewProps) {
  const stats = useMemo(() => {
    const warningDays = alertSettings?.expiry_warning_days ?? 7;
    let lowStock = 0;
    let expiringSoon = 0;
    let expired = 0;
    let totalUnits = 0;
    let inventoryValue = 0;

    for (const p of products) {
      if (p.status !== 'active') continue;
      totalUnits += Number(p.stock_quantity);
      inventoryValue += Number(p.stock_quantity) * Number(p.cost_price);
      if (Number(p.stock_quantity) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0) {
        lowStock++;
      }
      const status = getExpiryStatus(p.expiry_date, warningDays);
      if (status === 'expired') expired++;
      else if (status === 'critical' || status === 'warning') expiringSoon++;
    }

    return { lowStock, expiringSoon, expired, totalUnits, inventoryValue };
  }, [products, alertSettings]);

  const criticalItems = useMemo(() => {
    const warningDays = alertSettings?.expiry_warning_days ?? 7;
    return products
      .filter((p) => p.status === 'active')
      .map((p) => ({
        product: p,
        expiryStatus: getExpiryStatus(p.expiry_date, warningDays),
        daysLeft: daysUntil(p.expiry_date),
        isLowStock: Number(p.stock_quantity) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0,
      }))
      .filter((item) => item.isLowStock || item.expiryStatus === 'expired' || item.expiryStatus === 'critical' || item.expiryStatus === 'warning')
      .sort((a, b) => {
        if (a.expiryStatus === 'expired' && b.expiryStatus !== 'expired') return -1;
        if (b.expiryStatus === 'expired' && a.expiryStatus !== 'expired') return 1;
        const aDays = a.daysLeft ?? 999;
        const bDays = b.daysLeft ?? 999;
        return aDays - bDays;
      })
      .slice(0, 8);
  }, [products, alertSettings]);

  const categoryStats = useMemo(() => {
    return categories
      .map((cat) => {
        const catProducts = products.filter((p) => p.category_id === cat.id && p.status === 'active');
        const units = catProducts.reduce((sum, p) => sum + Number(p.stock_quantity), 0);
        const value = catProducts.reduce((sum, p) => sum + Number(p.stock_quantity) * Number(p.cost_price), 0);
        return { category: cat, count: catProducts.length, units, value };
      })
      .filter((c) => c.count > 0)
      .sort((a, b) => b.value - a.value);
  }, [products, categories]);

  const maxCategoryValue = Math.max(...categoryStats.map((c) => c.value), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-500">Real-time overview of your supermarket inventory</p>
        </div>
        <button
          onClick={onAddProduct}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      <StatsRow
        totalProducts={products.filter((p) => p.status === 'active').length}
        totalUnits={stats.totalUnits}
        lowStockCount={stats.lowStock}
        expiringCount={stats.expiringSoon}
        expiredCount={stats.expired}
        inventoryValue={stats.inventoryValue}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Critical Items */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-bold text-slate-800">Items Needing Attention</h2>
            </div>
            <button
              onClick={() => onNavigate('expiry')}
              className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          {criticalItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">Everything looks good — no critical items.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {criticalItems.map(({ product, expiryStatus, daysLeft, isLowStock }) => {
                const eCfg = expiryStatusConfig[expiryStatus];
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                      <p className="text-xs text-slate-400">{product.sku} · {formatNumber(Number(product.stock_quantity))} {product.unit} in stock</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {isLowStock && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          Low Stock
                        </span>
                      )}
                      {expiryStatus !== 'none' && expiryStatus !== 'fresh' && (
                        <span className={`rounded-full ${eCfg.bg} ${eCfg.text} px-2.5 py-0.5 text-xs font-medium`}>
                          {daysLeft !== null && daysLeft < 0
                            ? `${Math.abs(daysLeft)}d overdue`
                            : daysLeft === 0
                            ? 'Expires today'
                            : `${daysLeft}d left`}
                        </span>
                      )}
                      <button
                        onClick={() => onAdjustStock(product)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        title="Adjust stock"
                      >
                        <ArrowDownUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            <h2 className="text-sm font-bold text-slate-800">Value by Category</h2>
          </div>
          {categoryStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No products yet.</p>
          ) : (
            <div className="space-y-3">
              {categoryStats.map(({ category, count, value }) => (
                <div key={category.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.color }} />
                      <span className="text-xs font-medium text-slate-700">{category.name}</span>
                      <span className="text-xs text-slate-400">({count})</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-600">{formatCurrency(value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(value / maxCategoryValue) * 100}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <button
          onClick={() => onNavigate('inventory')}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Package className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Manage Inventory</p>
            <p className="text-xs text-slate-400">View and edit all products</p>
          </div>
        </button>
        <button
          onClick={() => onNavigate('expiry')}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
            <CalendarClock className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Expiry Tracker</p>
            <p className="text-xs text-slate-400">Monitor expiring products</p>
          </div>
        </button>
        <button
          onClick={() => onNavigate('movements')}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50">
            <TrendingUp className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Stock Movements</p>
            <p className="text-xs text-slate-400">Audit all stock changes</p>
          </div>
        </button>
      </div>
    </div>
  );
}
