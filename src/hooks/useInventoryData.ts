import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Product, Category, AlertSettings } from '@/types/database';

export function useInventoryData() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [alertSettings, setAlertSettings] = useState<AlertSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    const [productsRes, categoriesRes, settingsRes] = await Promise.all([
      supabase
        .from('products')
        .select('*, category:categories(*)')
        .order('name'),
      supabase.from('categories').select('*').order('name'),
      supabase.from('alert_settings').select('*').limit(1).maybeSingle(),
    ]);

    if (productsRes.error) {
      setError(productsRes.error.message);
      setLoading(false);
      return;
    }
    if (categoriesRes.error) {
      setError(categoriesRes.error.message);
      setLoading(false);
      return;
    }
    if (settingsRes.error) {
      setError(settingsRes.error.message);
      setLoading(false);
      return;
    }

    setProducts(productsRes.data as Product[]);
    setCategories(categoriesRes.data as Category[]);
    setAlertSettings(settingsRes.data as AlertSettings);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscriptions
  useEffect(() => {
    const channel = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newProduct = payload.new as Product;
            setProducts((prev) => {
              if (prev.some((p) => p.id === newProduct.id)) return prev;
              return [...prev, newProduct].sort((a, b) => a.name.localeCompare(b.name));
            });
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Product;
            setProducts((prev) =>
              prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
            );
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Product;
            setProducts((prev) => prev.filter((p) => p.id !== deleted.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setCategories((prev) => [...prev, payload.new as Category].sort((a, b) => a.name.localeCompare(b.name)));
          } else if (payload.eventType === 'UPDATE') {
            setCategories((prev) => prev.map((c) => (c.id === (payload.new as Category).id ? (payload.new as Category) : c)));
          } else if (payload.eventType === 'DELETE') {
            setCategories((prev) => prev.filter((c) => c.id !== (payload.old as Category).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'alert_settings' },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setAlertSettings(payload.new as AlertSettings);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { products, categories, alertSettings, loading, error, reload: loadData };
}
