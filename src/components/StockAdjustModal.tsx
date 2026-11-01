import { useState } from 'react';
import { X, ArrowDownUp, TrendingUp, TrendingDown, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Product, MovementType } from '@/types/database';

interface StockAdjustModalProps {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}

const movementTypes: { value: MovementType; label: string; icon: typeof Plus; sign: 'positive' | 'negative' | 'both' }[] = [
  { value: 'restock', label: 'Restock', icon: Plus, sign: 'positive' },
  { value: 'waste', label: 'Waste / Write-off', icon: Trash2, sign: 'negative' },
  { value: 'adjustment', label: 'Adjustment', icon: ArrowDownUp, sign: 'both' },
];

export default function StockAdjustModal({ product, onClose, onDone }: StockAdjustModalProps) {
  const [movementType, setMovementType] = useState<MovementType>('restock');
  const [quantity, setQuantity] = useState(0);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStock = Number(product.stock_quantity);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (quantity === 0) {
      setError('Quantity must be greater than zero.');
      setSaving(false);
      return;
    }

    const cfg = movementTypes.find((m) => m.value === movementType)!;
    const signedQty = cfg.sign === 'negative' ? -Math.abs(quantity) : cfg.sign === 'positive' ? Math.abs(quantity) : quantity;

    const newStock = currentStock + signedQty;
    if (newStock < 0) {
      setError(`Cannot reduce stock below zero. Current: ${currentStock}, attempted change: ${signedQty}.`);
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('products')
      .update({ stock_quantity: newStock })
      .eq('id', product.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const { error: movementError } = await supabase.from('stock_movements').insert({
      product_id: product.id,
      movement_type: movementType,
      quantity: signedQty,
      reference: reference.trim() || null,
      note: note.trim() || null,
    });

    if (movementError) {
      setError(movementError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onDone();
  };

  const cfg = movementTypes.find((m) => m.value === movementType)!;
  const Icon = cfg.icon;
  const projectedStock = currentStock + (cfg.sign === 'negative' ? -Math.abs(quantity) : cfg.sign === 'positive' ? Math.abs(quantity) : quantity);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-800">Adjust Stock</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                <p className="text-xs text-slate-400">{product.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Current Stock</p>
                <p className="text-lg font-bold text-slate-800">{currentStock} {product.unit}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Movement Type</label>
            <div className="grid grid-cols-3 gap-2">
              {movementTypes.map((m) => {
                const MIcon = m.icon;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMovementType(m.value)}
                    className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition-all ${
                      movementType === m.value
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <MIcon className="h-5 w-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Quantity ({product.unit})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
              placeholder="0"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reference (optional)</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
              placeholder="PO number, invoice, etc."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
              placeholder="Reason for adjustment..."
            />
          </div>

          <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${
            projectedStock < 0 ? 'bg-red-50' : 'bg-emerald-50'
          }`}>
            <span className="text-sm text-slate-600 flex items-center gap-2">
              {cfg.sign === 'positive' ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : 
               cfg.sign === 'negative' ? <TrendingDown className="h-4 w-4 text-red-500" /> :
               <Icon className="h-4 w-4 text-slate-500" />}
              Projected Stock
            </span>
            <span className={`text-lg font-bold ${
              projectedStock < 0 ? 'text-red-600' : 'text-emerald-700'
            }`}>
              {projectedStock} {product.unit}
            </span>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
