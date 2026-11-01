/*
# Supermarket Inventory & Expiry Tracking Schema

1. Overview
   This schema powers a supermarket inventory dashboard with expiry tracking,
   real-time stock updates, WhatsApp alerts for low stock and near-expiry items,
   and POS sale webhooks that decrement stock automatically.

2. New Tables
   - `categories`: Product categories (e.g. Dairy, Produce, Bakery).
   - `products`: Individual products with stock, price, expiry, and reorder thresholds.
   - `stock_movements`: Audit log of every stock change (sale, restock, adjustment, waste).
   - `alert_settings`: Single-row config for WhatsApp number, low-stock threshold, expiry window.
   - `alert_log`: History of alerts sent (low stock, near-expiry, expired).

3. Columns
   categories:
     - id (uuid PK)
     - name (text, unique)
     - color (text, hex color for UI badge)
     - created_at (timestamptz)

   products:
     - id (uuid PK)
     - name (text)
     - sku (text, unique)
     - barcode (text)
     - category_id (uuid FK -> categories)
     - unit (text, e.g. "pcs", "kg", "L")
     - stock_quantity (numeric, current on-hand)
     - min_stock_level (numeric, reorder point)
     - cost_price (numeric)
     - sell_price (numeric)
     - expiry_date (date, when the product expires)
     - batch_number (text)
     - location (text, shelf/bin location)
     - status (text: active | discontinued)
     - last_updated (timestamptz)
     - created_at (timestamptz)

   stock_movements:
     - id (uuid PK)
     - product_id (uuid FK -> products)
     - movement_type (text: sale | restock | adjustment | waste | initial)
     - quantity (numeric, positive for additions, negative for deductions)
     - reference (text, e.g. sale invoice or note)
     - note (text)
     - created_at (timestamptz)

   alert_settings:
     - id (uuid PK, always single row)
     - whatsapp_number (text, phone number in international format)
     - whatsapp_enabled (boolean, master toggle)
     - low_stock_threshold (integer, default items below this count trigger alert)
     - expiry_warning_days (integer, alert when expiry is within this many days)
     - daily_digest_enabled (boolean)
     - updated_at (timestamptz)

   alert_log:
     - id (uuid PK)
     - product_id (uuid FK -> products, nullable)
     - alert_type (text: low_stock | near_expiry | expired)
     - message (text)
     - channel (text: whatsapp | dashboard)
     - status (text: sent | failed | pending)
     - created_at (timestamptz)

4. Security
   - Single-tenant admin panel, no sign-in screen.
   - RLS enabled on all tables.
   - CRUD granted to anon + authenticated (intentionally shared data).
   - service_role granted for edge functions.

5. Indexes
   - products.sku (unique), products.expiry_date, products.category_id, products.status
   - stock_movements.product_id, stock_movements.created_at
   - alert_log.created_at, alert_log.product_id
*/

-- ======================== CATEGORIES ========================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text NOT NULL DEFAULT '#3b82f6',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE TO anon, authenticated USING (true);

-- ======================== PRODUCTS ========================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text UNIQUE NOT NULL,
  barcode text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'pcs',
  stock_quantity numeric(12,2) NOT NULL DEFAULT 0,
  min_stock_level numeric(12,2) NOT NULL DEFAULT 0,
  cost_price numeric(10,2) NOT NULL DEFAULT 0,
  sell_price numeric(10,2) NOT NULL DEFAULT 0,
  expiry_date date,
  batch_number text,
  location text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued')),
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_expiry_date ON products(expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON products TO service_role;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);

-- ======================== STOCK MOVEMENTS ========================
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('sale', 'restock', 'adjustment', 'waste', 'initial')),
  quantity numeric(12,2) NOT NULL,
  reference text,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON stock_movements(created_at);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stock_movements TO service_role;

DROP POLICY IF EXISTS "anon_select_movements" ON stock_movements;
CREATE POLICY "anon_select_movements" ON stock_movements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_movements" ON stock_movements;
CREATE POLICY "anon_insert_movements" ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_movements" ON stock_movements;
CREATE POLICY "anon_update_movements" ON stock_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_movements" ON stock_movements;
CREATE POLICY "anon_delete_movements" ON stock_movements FOR DELETE TO anon, authenticated USING (true);

-- ======================== ALERT SETTINGS ========================
CREATE TABLE IF NOT EXISTS alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_number text NOT NULL DEFAULT '',
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  low_stock_threshold integer NOT NULL DEFAULT 10,
  expiry_warning_days integer NOT NULL DEFAULT 7,
  daily_digest_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE alert_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_settings TO service_role;

DROP POLICY IF EXISTS "anon_select_alert_settings" ON alert_settings;
CREATE POLICY "anon_select_alert_settings" ON alert_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alert_settings" ON alert_settings;
CREATE POLICY "anon_insert_alert_settings" ON alert_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_alert_settings" ON alert_settings;
CREATE POLICY "anon_update_alert_settings" ON alert_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alert_settings" ON alert_settings;
CREATE POLICY "anon_delete_alert_settings" ON alert_settings FOR DELETE TO anon, authenticated USING (true);

-- ======================== ALERT LOG ========================
CREATE TABLE IF NOT EXISTS alert_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('low_stock', 'near_expiry', 'expired')),
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'dashboard' CHECK (channel IN ('whatsapp', 'dashboard')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_log_created_at ON alert_log(created_at);
CREATE INDEX IF NOT EXISTS idx_alert_log_product_id ON alert_log(product_id);

ALTER TABLE alert_log ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_log TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_log TO service_role;

DROP POLICY IF EXISTS "anon_select_alert_log" ON alert_log;
CREATE POLICY "anon_select_alert_log" ON alert_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_alert_log" ON alert_log;
CREATE POLICY "anon_insert_alert_log" ON alert_log FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_alert_log" ON alert_log;
CREATE POLICY "anon_update_alert_log" ON alert_log FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_alert_log" ON alert_log;
CREATE POLICY "anon_delete_alert_log" ON alert_log FOR DELETE TO anon, authenticated USING (true);

-- ======================== TRIGGER: update last_updated ========================
CREATE OR REPLACE FUNCTION update_product_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_product_timestamp ON products;
CREATE TRIGGER trigger_update_product_timestamp
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_product_timestamp();

-- ======================== SEED: default alert settings ========================
INSERT INTO alert_settings (id, whatsapp_number, whatsapp_enabled, low_stock_threshold, expiry_warning_days, daily_digest_enabled)
SELECT gen_random_uuid(), '', false, 10, 7, false
WHERE NOT EXISTS (SELECT 1 FROM alert_settings);

-- ======================== SEED: categories ========================
INSERT INTO categories (name, color)
SELECT 'Dairy', '#3b82f6'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Dairy');

INSERT INTO categories (name, color)
SELECT 'Produce', '#22c55e'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Produce');

INSERT INTO categories (name, color)
SELECT 'Bakery', '#f59e0b'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Bakery');

INSERT INTO categories (name, color)
SELECT 'Beverages', '#06b6d4'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Beverages');

INSERT INTO categories (name, color)
SELECT 'Snacks', '#ec4899'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Snacks');

INSERT INTO categories (name, color)
SELECT 'Frozen Foods', '#6366f1'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Frozen Foods');

INSERT INTO categories (name, color)
SELECT 'Household', '#78716c'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Household');

-- ======================== SEED: sample products ========================
INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Whole Milk 1L', 'DAIRY-001', '4006300003918', c.id, 'pcs', 48, 20, 0.89, 1.49, (CURRENT_DATE + 5)::date, 'BM-2026-001', 'A1-03', 'active'
FROM categories c WHERE c.name = 'Dairy'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DAIRY-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Greek Yogurt 500g', 'DAIRY-002', '4006300003925', c.id, 'pcs', 8, 15, 1.20, 2.99, (CURRENT_DATE + 3)::date, 'BM-2026-002', 'A1-04', 'active'
FROM categories c WHERE c.name = 'Dairy'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DAIRY-002');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Cheddar Cheese 200g', 'DAIRY-003', '4006300003932', c.id, 'pcs', 35, 12, 1.50, 3.49, (CURRENT_DATE + 20)::date, 'BM-2026-003', 'A1-05', 'active'
FROM categories c WHERE c.name = 'Dairy'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DAIRY-003');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Fresh Bananas', 'PROD-001', '2000000000017', c.id, 'kg', 52, 20, 0.40, 0.89, (CURRENT_DATE + 4)::date, 'BN-2026-001', 'B2-01', 'active'
FROM categories c WHERE c.name = 'Produce'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'PROD-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Organic Spinach 200g', 'PROD-002', '2000000000024', c.id, 'pcs', 5, 10, 0.80, 2.49, (CURRENT_DATE + 2)::date, 'SP-2026-001', 'B2-02', 'active'
FROM categories c WHERE c.name = 'Produce'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'PROD-002');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Tomatoes', 'PROD-003', '2000000000031', c.id, 'kg', 30, 15, 0.95, 2.29, (CURRENT_DATE + 6)::date, 'TM-2026-001', 'B2-03', 'active'
FROM categories c WHERE c.name = 'Produce'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'PROD-003');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Whole Wheat Bread 800g', 'BAKE-001', '3000000000011', c.id, 'pcs', 12, 15, 0.70, 1.99, (CURRENT_DATE + 1)::date, 'BR-2026-001', 'C3-01', 'active'
FROM categories c WHERE c.name = 'Bakery'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BAKE-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Croissants 6-pack', 'BAKE-002', '3000000000028', c.id, 'pcs', 25, 10, 1.10, 3.49, (CURRENT_DATE + 2)::date, 'CR-2026-001', 'C3-02', 'active'
FROM categories c WHERE c.name = 'Bakery'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BAKE-002');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Orange Juice 1L', 'BEVG-001', '5000000000015', c.id, 'pcs', 40, 20, 1.00, 2.29, (CURRENT_DATE + 30)::date, 'OJ-2026-001', 'D4-01', 'active'
FROM categories c WHERE c.name = 'Beverages'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BEVG-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Sparkling Water 6x500ml', 'BEVG-002', '5000000000022', c.id, 'pcs', 6, 8, 1.30, 3.49, (CURRENT_DATE + 90)::date, 'SW-2026-001', 'D4-02', 'active'
FROM categories c WHERE c.name = 'Beverages'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BEVG-002');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Potato Chips 150g', 'SNCK-001', '6000000000019', c.id, 'pcs', 60, 20, 0.50, 1.79, (CURRENT_DATE + 60)::date, 'PC-2026-001', 'E5-01', 'active'
FROM categories c WHERE c.name = 'Snacks'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'SNCK-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Frozen Pizza 400g', 'FRZN-001', '7000000000013', c.id, 'pcs', 18, 10, 1.40, 3.99, (CURRENT_DATE + 45)::date, 'FP-2026-001', 'F6-01', 'active'
FROM categories c WHERE c.name = 'Frozen Foods'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'FRZN-001');

INSERT INTO products (name, sku, barcode, category_id, unit, stock_quantity, min_stock_level, cost_price, sell_price, expiry_date, batch_number, location, status)
SELECT 'Paper Towels 4-pack', 'HOUS-001', '8000000000017', c.id, 'pcs', 22, 10, 1.50, 3.49, NULL, 'PT-2026-001', 'G7-01', 'active'
FROM categories c WHERE c.name = 'Household'
AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'HOUS-001');
