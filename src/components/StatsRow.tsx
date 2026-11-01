import { Package, AlertTriangle, CalendarX, DollarSign } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface StatCardProps {
  icon: typeof Package;
  label: string;
  value: string;
  subValue?: string;
  variant: 'default' | 'warning' | 'danger' | 'success';
}

const variantConfig = {
  default: { bg: 'bg-slate-50', iconBg: 'bg-slate-100', iconColor: 'text-slate-600' },
  warning: { bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  danger: { bg: 'bg-red-50', iconBg: 'bg-red-100', iconColor: 'text-red-600' },
  success: { bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
};

function StatCard({ icon: Icon, label, value, subValue, variant }: StatCardProps) {
  const cfg = variantConfig[variant];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
          {subValue && <p className="mt-0.5 text-xs text-slate-400">{subValue}</p>}
        </div>
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${cfg.iconBg}`}>
          <Icon className={`h-6 w-6 ${cfg.iconColor}`} />
        </div>
      </div>
    </div>
  );
}

interface StatsRowProps {
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  expiringCount: number;
  expiredCount: number;
  inventoryValue: number;
}

export default function StatsRow({
  totalProducts,
  totalUnits,
  lowStockCount,
  expiringCount,
  expiredCount,
  inventoryValue,
}: StatsRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        icon={Package}
        label="Total Products"
        value={formatNumber(totalProducts)}
        subValue={`${formatNumber(totalUnits)} units in stock`}
        variant="default"
      />
      <StatCard
        icon={AlertTriangle}
        label="Low Stock"
        value={formatNumber(lowStockCount)}
        subValue={lowStockCount > 0 ? 'Needs restocking' : 'All well stocked'}
        variant={lowStockCount > 0 ? 'warning' : 'success'}
      />
      <StatCard
        icon={CalendarX}
        label="Expiring Soon"
        value={formatNumber(expiringCount + expiredCount)}
        subValue={expiredCount > 0 ? `${expiredCount} already expired` : 'Within alert window'}
        variant={expiredCount > 0 ? 'danger' : expiringCount > 0 ? 'warning' : 'success'}
      />
      <StatCard
        icon={DollarSign}
        label="Inventory Value"
        value={formatCurrency(inventoryValue)}
        subValue="At cost price"
        variant="success"
      />
    </div>
  );
}
