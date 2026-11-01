import { useState, useMemo } from 'react';
import { CalendarClock, CalendarX, AlertTriangle, ArrowDownUp, Package } from 'lucide-react';
import type { Product, AlertSettings } from '@/types/database';
import { getExpiryStatus, expiryStatusConfig, daysUntil, formatNumber, formatDate } from '@/lib/utils';
import StockAdjustModal from '@/components/StockAdjustModal';

interface ExpiryViewProps {
  products: Product[];
  alertSettings: AlertSettings | null;
  onAdjustStock: (product: Product) => void;
}

type Tab = 'all' | 'expired' | 'critical' | 'warning' | 'fresh';

export default function ExpiryView({ products, alertSettings, onAdjustStock }: ExpiryViewProps) {
  const [tab, setTab] = useState<Tab>('all');
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const warningDays = alertSettings?.expiry_warning_days ?? 7;

  const enriched = useMemo(() => {
    return products
      .filter((p) => p.status === 'active')
      .map((p) => ({
        product: p,
        status: getExpiryStatus(p.expiry_date, warningDays),
        daysLeft: daysUntil(p.expiry_date),
      }))
      .sort((a, b) => {
        const aDays = a.daysLeft ?? 9999;
        const bDays = b.daysLeft ?? 9999;
        return aDays - bDays;
      });
  }, [products, warningDays]);

  const counts = useMemo(() => {
    const c = { expired: 0, critical: 0, warning: 0, fresh: 0, none: 0 };
    for (const item of enriched) {
      c[item.status]++;
    }
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    if (tab === 'all') return enriched.filter((e) => e.status !== 'none');
    if (tab === 'fresh') return enriched.filter((e) => e.status === 'fresh');
    return enriched.filter((e) => e.status === tab);
  }, [enriched, tab]);

  const tabs: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'all', label: 'All Tracked', count: counts.expired + counts.critical + counts.warning + counts.fresh, color: 'text-slate-600' },
    { id: 'expired', label: 'Expired', count: counts.expired, color: 'text-red-600' },
    { id: 'critical', label: 'Expires Today', count: counts.critical, color: 'text-red-600' },
    { id: 'warning', label: 'Expiring Soon', count: counts.warning, color: 'text-amber-600' },
    { id: 'fresh', label: 'Fresh', count: counts.fresh, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Expiry Tracker</h1>
        <p className="text-sm text-slate-500">
          Alert window: {warningDays} days · {counts.expired + counts.critical + counts.warning} items need attention
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-red-600" />
            <span className="text-sm font-semibold text-red-700">Expired</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-700">{counts.expired}</p>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-semibold text-red-600">Critical</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-red-600">{counts.critical}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">Expiring Soon</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-amber-700">{counts.warning}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">Fresh</span>
          </div>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{counts.fresh}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-xs ${
              tab === t.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16">
            <Package className="h-12 w-12 text-slate-200" />
            <p className="mt-3 text-sm text-slate-400">No items in this category.</p>
          </div>
        ) : (
          filtered.map(({ product, status, daysLeft }) => {
            const eCfg = expiryStatusConfig[status];
            return (
              <div
                key={product.id}
                className={`flex items-center gap-4 rounded-xl border ${eCfg.border} ${eCfg.bg} px-4 py-3 transition-all hover:shadow-sm`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${eCfg.bg} border ${eCfg.border}`}>
                  {status === 'expired' || status === 'critical' ? (
                    <CalendarX className={`h-5 w-5 ${eCfg.text}`} />
                  ) : status === 'warning' ? (
                    <AlertTriangle className={`h-5 w-5 ${eCfg.text}`} />
                  ) : (
                    <Package className={`h-5 w-5 ${eCfg.text}`} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{product.name}</p>
                    <span className={`rounded-full ${eCfg.bg} ${eCfg.text} px-2 py-0.5 text-xs font-medium border ${eCfg.border}`}>
                      {eCfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {product.sku} · {formatNumber(Number(product.stock_quantity))} {product.unit} · {formatDate(product.expiry_date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-lg font-bold ${eCfg.text}`}>
                    {daysLeft !== null && daysLeft < 0
                      ? `${Math.abs(daysLeft)}d`
                      : daysLeft === 0
                      ? 'Today'
                      : `${daysLeft}d`}
                  </p>
                  <p className="text-xs text-slate-400">
                    {daysLeft !== null && daysLeft < 0 ? 'overdue' : 'remaining'}
                  </p>
                </div>
                <button
                  onClick={() => setAdjustProduct(product)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                >
                  <ArrowDownUp className="inline h-3.5 w-3.5" /> Adjust
                </button>
              </div>
            );
          })
        )}
      </div>

      {adjustProduct && (
        <StockAdjustModal
          product={adjustProduct}
          onClose={() => setAdjustProduct(null)}
          onDone={() => setAdjustProduct(null)}
        />
      )}
    </div>
  );
}
