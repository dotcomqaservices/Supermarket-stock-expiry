import { useState, useEffect, useMemo } from 'react';
import { Bell, AlertTriangle, CalendarX, Package, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AlertLogEntry, AlertSettings, Product } from '@/types/database';
import { getExpiryStatus, daysUntil, formatNumber, formatDateTime } from '@/lib/utils';

interface AlertsViewProps {
  products: Product[];
  alertSettings: AlertSettings | null;
}

const alertConfig = {
  low_stock: { label: 'Low Stock', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  near_expiry: { label: 'Near Expiry', icon: CalendarX, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
  expired: { label: 'Expired', icon: CalendarX, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

export default function AlertsView({ products, alertSettings }: AlertsViewProps) {
  const [log, setLog] = useState<AlertLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLog();
  }, []);

  const loadLog = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('alert_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setError(error.message);
    } else {
      setLog(data as AlertLogEntry[]);
    }
    setLoading(false);
  };

  const warningDays = alertSettings?.expiry_warning_days ?? 7;

  const currentAlerts = useMemo(() => {
    return products
      .filter((p) => p.status === 'active')
      .map((p) => {
        const status = getExpiryStatus(p.expiry_date, warningDays);
        const isLowStock = Number(p.stock_quantity) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0;
        const dl = daysUntil(p.expiry_date);
        return { product: p, status, isLowStock, daysLeft: dl };
      })
      .filter((a) => a.isLowStock || a.status === 'expired' || a.status === 'critical' || a.status === 'warning')
      .sort((a, b) => {
        if (a.status === 'expired' && b.status !== 'expired') return -1;
        if (b.status === 'expired' && a.status !== 'expired') return 1;
        return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
      });
  }, [products, warningDays]);

  const sendTestAlert = async () => {
    setSending(true);
    setFeedback(null);
    setError(null);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-alerts`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'check_and_send' }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Alert check failed (${response.status}): ${body}`);
      }
      const result = await response.json();
      setFeedback(
        result.alerts_sent > 0
          ? `Sent ${result.alerts_sent} WhatsApp alert(s).`
          : 'No new alerts to send — all items are within safe thresholds, or WhatsApp is disabled in settings.'
      );
      loadLog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send alerts.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Alerts</h1>
          <p className="text-sm text-slate-500">Monitor and manage low stock and expiry alerts</p>
        </div>
        <button
          onClick={sendTestAlert}
          disabled={sending}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          {sending ? 'Checking...' : 'Check & Send Alerts'}
        </button>
      </div>

      {feedback && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Current Alerts */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-800">Current Alerts ({currentAlerts.length})</h2>
        </div>

        {currentAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-12 w-12 text-emerald-200" />
            <p className="mt-3 text-sm text-slate-400">No active alerts — everything is in good shape.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {currentAlerts.map(({ product, status, isLowStock, daysLeft }) => {
              const alertType = status === 'expired' ? 'expired' : status === 'critical' || status === 'warning' ? 'near_expiry' : 'low_stock';
              const cfg = alertConfig[alertType];
              const Icon = cfg.icon;
              return (
                <div
                  key={product.id}
                  className={`flex items-center gap-3 rounded-lg border ${cfg.border} ${cfg.bg} px-4 py-3`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${cfg.bg} border ${cfg.border}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      {product.sku} · {formatNumber(Number(product.stock_quantity))} {product.unit} in stock
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isLowStock && (
                      <span className={`rounded-full ${cfg.bg} ${cfg.color} px-2.5 py-0.5 text-xs font-medium border ${cfg.border}`}>
                        Low Stock
                      </span>
                    )}
                    {(status === 'expired' || status === 'critical' || status === 'warning') && (
                      <span className={`rounded-full ${cfg.bg} ${cfg.color} px-2.5 py-0.5 text-xs font-medium border ${cfg.border}`}>
                        {daysLeft !== null && daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Alert Log */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800">Alert History</h2>
          </div>
          <button onClick={loadLog} className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : log.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No alerts have been sent yet. Click "Check & Send Alerts" above.</p>
        ) : (
          <div className="space-y-1.5">
            {log.map((entry) => {
              const cfg = alertConfig[entry.alert_type];
              const Icon = cfg.icon;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-100 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                >
                  <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700">{entry.message}</p>
                    <p className="text-xs text-slate-400">{formatDateTime(entry.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.channel === 'whatsapp' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {entry.channel === 'whatsapp' ? 'WhatsApp' : 'Dashboard'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      entry.status === 'sent' ? 'bg-emerald-50 text-emerald-600' :
                      entry.status === 'failed' ? 'bg-red-50 text-red-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>
                      {entry.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
