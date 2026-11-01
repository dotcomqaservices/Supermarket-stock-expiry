import { useState, useMemo } from 'react';
import { Plus, Search, ArrowDownUp, Package, Filter } from 'lucide-react';
import type { Product, Category, AlertSettings } from '@/types/database';
import { getExpiryStatus, expiryStatusConfig, daysUntil, formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import StockAdjustModal from '@/components/StockAdjustModal';

interface InventoryViewProps {
  products: Product[];
  categories: Category[];
  alertSettings: AlertSettings | null;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
}

type SortField = 'name' | 'stock' | 'expiry' | 'value';
type SortDir = 'asc' | 'desc';

export default function InventoryView({ products, categories, alertSettings, onAddProduct, onEditProduct }: InventoryViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);

  const warningDays = alertSettings?.expiry_warning_days ?? 7;

  const filtered = useMemo(() => {
    let result = products;

    if (statusFilter) {
      result = result.filter((p) => p.status === statusFilter);
    }
    if (categoryFilter) {
      result = result.filter((p) => p.category_id === categoryFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? '').toLowerCase().includes(q) ||
          (p.location ?? '').toLowerCase().includes(q)
      );
    }

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'stock') cmp = Number(a.stock_quantity) - Number(b.stock_quantity);
      else if (sortField === 'expiry') {
        const aDays = daysUntil(a.expiry_date) ?? 9999;
        const bDays = daysUntil(b.expiry_date) ?? 9999;
        cmp = aDays - bDays;
      } else if (sortField === 'value') {
        cmp = Number(a.stock_quantity) * Number(a.cost_price) - Number(b.stock_quantity) * Number(b.cost_price);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [products, search, categoryFilter, statusFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="inline-block w-3" />;
    return <span className="text-emerald-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
          <p className="text-sm text-slate-500">{filtered.length} products · updates in real-time</p>
        </div>
        <button
          onClick={onAddProduct}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, SKU, barcode, location..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
          >
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
            <option value="">All</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="cursor-pointer px-4 py-3 font-semibold text-slate-600" onClick={() => toggleSort('name')}>
                  Product <SortIcon field="name" />
                </th>
                <th className="px-4 py-3 font-semibold text-slate-600">Category</th>
                <th className="cursor-pointer px-4 py-3 font-semibold text-slate-600" onClick={() => toggleSort('stock')}>
                  Stock <SortIcon field="stock" />
                </th>
                <th className="cursor-pointer px-4 py-3 font-semibold text-slate-600" onClick={() => toggleSort('expiry')}>
                  Expiry <SortIcon field="expiry" />
                </th>
                <th className="cursor-pointer px-4 py-3 font-semibold text-slate-600" onClick={() => toggleSort('value')}>
                  Value <SortIcon field="value" />
                </th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <Package className="mx-auto h-12 w-12 text-slate-200" />
                    <p className="mt-3 text-sm text-slate-400">No products found.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((product) => {
                  const expiryStatus = getExpiryStatus(product.expiry_date, warningDays);
                  const eCfg = expiryStatusConfig[expiryStatus];
                  const daysLeft = daysUntil(product.expiry_date);
                  const isLowStock = Number(product.stock_quantity) <= Number(product.min_stock_level) && Number(product.min_stock_level) > 0;
                  const cat = product.category;
                  const stockValue = Number(product.stock_quantity) * Number(product.cost_price);

                  return (
                    <tr key={product.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onEditProduct(product)}
                          className="block text-left"
                        >
                          <p className="font-medium text-slate-800 hover:text-emerald-600">{product.name}</p>
                          <p className="text-xs text-slate-400">{product.sku}{product.location ? ` · ${product.location}` : ''}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {cat ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                            {cat.name}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${isLowStock ? 'text-amber-600' : 'text-slate-700'}`}>
                            {formatNumber(Number(product.stock_quantity))}
                          </span>
                          <span className="text-xs text-slate-400">{product.unit}</span>
                          {isLowStock && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Low
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">min: {formatNumber(Number(product.min_stock_level))}</p>
                      </td>
                      <td className="px-4 py-3">
                        {product.expiry_date ? (
                          <div>
                            <span className={`inline-flex items-center rounded-full ${eCfg.bg} ${eCfg.text} px-2.5 py-0.5 text-xs font-medium`}>
                              {eCfg.label}
                            </span>
                            <p className="mt-0.5 text-xs text-slate-400">
                              {formatDate(product.expiry_date)}
                              {daysLeft !== null && daysLeft >= 0 && ` · ${daysLeft}d`}
                              {daysLeft !== null && daysLeft < 0 && ` · ${Math.abs(daysLeft)}d ago`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No expiry</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-700">{formatCurrency(stockValue)}</span>
                        <p className="text-xs text-slate-400">{formatCurrency(Number(product.sell_price))} retail</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setAdjustProduct(product)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                        >
                          <ArrowDownUp className="h-3.5 w-3.5" /> Adjust
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
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
