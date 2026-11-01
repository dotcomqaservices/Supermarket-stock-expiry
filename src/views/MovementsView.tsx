import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, ArrowDownUp, Trash2, ShoppingCart, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { StockMovement, MovementType } from '@/types/database';
import { formatNumber, formatDateTime } from '@/lib/utils';

interface MovementsViewProps {
  products: { id: string; name: string; sku: string }[];
}

const movementConfig: Record<MovementType, { label: string; icon: typeof TrendingUp; color: string; bg: string }> = {
  sale: { label: 'Sale', icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
  restock: { label: 'Restock', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  adjustment: { label: 'Adjustment', icon: ArrowDownUp, color: 'text-slate-600', bg: 'bg-slate-100' },
  waste: { label: 'Waste', icon: Trash2, color: 'text-red-600', bg: 'bg-red-50' },
  initial: { label: 'Initial', icon: RefreshCw, color: 'text-slate-500', bg: 'bg-slate-50' },
};

export default function MovementsView({ products }: MovementsViewProps) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [productFilter, setProductFilter] = useState<string>('');

  const productMap = useMemo(() => {
    const map = new Map<string, { name: string; sku: string }>();
    for (const p of products) {
      map.set(p.id, { name: p.name, sku: p.sku });
    }
    return map;
  }, [products]);

  useEffect(() => {
    loadMovements();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('stock-movements-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stock_movements' },
        (payload) => {
          const newMovement = payload.new as StockMovement;
          setMovements((prev) => [newMovement, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMovements = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      setError(error.message);
    } else {
      setMovements(data as StockMovement[]);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter && m.movement_type !== typeFilter) return false;
      if (productFilter && m.product_id !== productFilter) return false;
      return true;
    });
  }, [movements, typeFilter, productFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Stock Movements</h1>
        <p className="text-sm text-slate-500">Complete audit trail of every stock change · live</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">All Types</option>
          {Object.entries(movementConfig).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
        >
          <option value="">All Products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{filtered.length} records</span>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-slate-300" />
          <p className="mt-3 text-sm text-slate-400">Loading movements...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-600">Type</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Product</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Quantity</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Reference</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Note</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <p className="text-sm text-slate-400">No stock movements recorded yet.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const cfg = movementConfig[m.movement_type];
                    const Icon = cfg.icon;
                    const productInfo = productMap.get(m.product_id);
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full ${cfg.bg} ${cfg.color} px-2.5 py-1 text-xs font-medium`}>
                            <Icon className="h-3.5 w-3.5" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{productInfo?.name ?? 'Unknown product'}</p>
                          <p className="text-xs text-slate-400">{productInfo?.sku ?? m.product_id.slice(0, 8)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${Number(m.quantity) > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {Number(m.quantity) > 0 ? '+' : ''}{formatNumber(Number(m.quantity))}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {m.reference ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                          {m.note ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                          {formatDateTime(m.created_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
