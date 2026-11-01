export type ProductStatus = 'active' | 'discontinued';
export type MovementType = 'sale' | 'restock' | 'adjustment' | 'waste' | 'initial';
export type AlertType = 'low_stock' | 'near_expiry' | 'expired';
export type AlertChannel = 'whatsapp' | 'dashboard';
export type AlertStatus = 'sent' | 'failed' | 'pending';

export interface Category {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  unit: string;
  stock_quantity: number;
  min_stock_level: number;
  cost_price: number;
  sell_price: number;
  expiry_date: string | null;
  batch_number: string | null;
  location: string | null;
  status: ProductStatus;
  last_updated: string;
  created_at: string;
  category?: Category | null;
}

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: MovementType;
  quantity: number;
  reference: string | null;
  note: string | null;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku'> | null;
}

export interface AlertSettings {
  id: string;
  whatsapp_number: string;
  whatsapp_enabled: boolean;
  low_stock_threshold: number;
  expiry_warning_days: number;
  daily_digest_enabled: boolean;
  updated_at: string;
}

export interface AlertLogEntry {
  id: string;
  product_id: string | null;
  alert_type: AlertType;
  message: string;
  channel: AlertChannel;
  status: AlertStatus;
  created_at: string;
  product?: Pick<Product, 'id' | 'name' | 'sku'> | null;
}

export interface ProductInput {
  name: string;
  sku: string;
  barcode: string | null;
  category_id: string | null;
  unit: string;
  stock_quantity: number;
  min_stock_level: number;
  cost_price: number;
  sell_price: number;
  expiry_date: string | null;
  batch_number: string | null;
  location: string | null;
  status: ProductStatus;
}
