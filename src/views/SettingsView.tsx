import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, MessageCircle, Bell, Save, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AlertSettings, Category } from '@/types/database';

interface SettingsViewProps {
  alertSettings: AlertSettings | null;
  categories: Category[];
  onSettingsUpdated: () => void;
}

export default function SettingsView({ alertSettings, categories, onSettingsUpdated }: SettingsViewProps) {
  const [form, setForm] = useState<AlertSettings | null>(alertSettings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3b82f6');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);

  useEffect(() => {
    setForm(alertSettings);
  }, [alertSettings]);

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from('alert_settings')
      .update({
        whatsapp_number: form.whatsapp_number,
        whatsapp_enabled: form.whatsapp_enabled,
        low_stock_threshold: form.low_stock_threshold,
        expiry_warning_days: form.expiry_warning_days,
        daily_digest_enabled: form.daily_digest_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', form.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSaved(true);
      onSettingsUpdated();
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    setCatError(null);
    const { error: insertError } = await supabase
      .from('categories')
      .insert({ name: newCatName.trim(), color: newCatColor });
    if (insertError) {
      setCatError(insertError.message);
    } else {
      setNewCatName('');
      setNewCatColor('#3b82f6');
    }
    setCatSaving(false);
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Products in it will become uncategorized.')) return;
    await supabase.from('categories').delete().eq('id', id);
  };

  if (!form) {
    return (
      <div className="py-16 text-center">
        <SettingsIcon className="mx-auto h-8 w-8 animate-spin text-slate-300" />
        <p className="mt-3 text-sm text-slate-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500">Configure WhatsApp alerts, thresholds, and categories</p>
      </div>

      {/* WhatsApp Alert Settings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
            <MessageCircle className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">WhatsApp Alerts</h2>
            <p className="text-xs text-slate-400">Receive notifications for low stock and near-expiry items</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Enable WhatsApp Alerts</p>
              <p className="text-xs text-slate-400">Master switch for all WhatsApp notifications</p>
            </div>
            <button
              onClick={() => setForm({ ...form, whatsapp_enabled: !form.whatsapp_enabled })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                form.whatsapp_enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.whatsapp_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* WhatsApp Number */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">WhatsApp Number</label>
            <input
              type="tel"
              value={form.whatsapp_number}
              onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
              placeholder="e.g. +1234567890 (include country code)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">The phone number that will receive alert messages</p>
          </div>

          {/* Daily Digest Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Daily Digest</p>
              <p className="text-xs text-slate-400">Send a summary of all alerts once per day</p>
            </div>
            <button
              onClick={() => setForm({ ...form, daily_digest_enabled: !form.daily_digest_enabled })}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                form.daily_digest_enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  form.daily_digest_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Threshold Settings */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
            <Bell className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Alert Thresholds</h2>
            <p className="text-xs text-slate-400">Define when alerts should trigger</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Low Stock Threshold</label>
            <input
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={(e) => setForm({ ...form, low_stock_threshold: parseInt(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Products below this quantity trigger a low stock alert</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Expiry Warning (days)</label>
            <input
              type="number"
              min="1"
              value={form.expiry_warning_days}
              onChange={(e) => setForm({ ...form, expiry_warning_days: parseInt(e.target.value) || 1 })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">Alert when a product expires within this many days</p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Settings saved successfully!</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Category Management */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <SettingsIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Categories</h2>
            <p className="text-xs text-slate-400">Manage product categories</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New category name"
            className="min-w-40 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
          />
          <input
            type="color"
            value={newCatColor}
            onChange={(e) => setNewCatColor(e.target.value)}
            className="h-10 w-12 cursor-pointer rounded-lg border border-slate-300"
          />
          <button
            onClick={handleAddCategory}
            disabled={catSaving || !newCatName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        {catError && <p className="mb-3 text-sm text-red-600">{catError}</p>}

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5"
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <span className="text-sm font-medium text-slate-700">{cat.name}</span>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                className="text-slate-400 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Info */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="text-sm font-bold text-slate-800 mb-3">POS Sale Webhook</h2>
        <p className="text-sm text-slate-600 mb-3">
          Configure your POS system to send sale events to the webhook endpoint below. Each sale automatically decrements stock and logs a movement.
        </p>
        <div className="rounded-lg bg-white border border-slate-200 px-4 py-3 font-mono text-xs text-slate-700 break-all">
          POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/pos-webhook
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-emerald-600">View example payload</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-800 p-4 text-xs text-slate-200">
{`{
  "pos_id": "POS-001",
  "invoice": "INV-2026-0001",
  "items": [
    { "sku": "DAIRY-001", "quantity": 2 },
    { "sku": "BAKE-001", "quantity": 1 }
  ]
}`}
          </pre>
        </details>
      </div>
    </div>
  );
}
