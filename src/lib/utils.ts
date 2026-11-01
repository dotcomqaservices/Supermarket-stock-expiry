export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / 86400000);
}

export type ExpiryStatus = 'expired' | 'critical' | 'warning' | 'fresh' | 'none';

export function getExpiryStatus(dateStr: string | null, warningDays: number = 7): ExpiryStatus {
  if (!dateStr) return 'none';
  const days = daysUntil(dateStr);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days === 0) return 'critical';
  if (days <= warningDays) return 'warning';
  return 'fresh';
}

export const expiryStatusConfig: Record<ExpiryStatus, { label: string; color: string; bg: string; text: string; border: string }> = {
  expired: {
    label: 'Expired',
    color: '#ef4444',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  critical: {
    label: 'Expires Today',
    color: '#ef4444',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  warning: {
    label: 'Expiring Soon',
    color: '#f59e0b',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  fresh: {
    label: 'Fresh',
    color: '#22c55e',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
  },
  none: {
    label: 'No Expiry',
    color: '#94a3b8',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    border: 'border-slate-200',
  },
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
