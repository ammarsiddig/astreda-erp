-- =============================================
-- Astrida ERP Database Schema
-- Matches the actual AppState TypeScript types exactly
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Master / Config Tables ──────────────────────────────────────

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE salespeople (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cars (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transfer_fee DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  shareholders_percent DECIMAL(5,2),
  management_fee_percent DECIMAL(5,2),
  management_fee_recipient_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_operating_partner BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Auth / RBAC ─────────────────────────────────────────────────

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_salesperson BOOLEAN DEFAULT false,
  is_default BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role_id TEXT REFERENCES roles(id),
  salesperson_id TEXT,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Transactional Tables ────────────────────────────────────────

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_id TEXT,
  salesperson_id TEXT,
  car_id TEXT,
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  debt DECIMAL(12,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shipment_id TEXT,
  product_id TEXT,
  type TEXT NOT NULL, -- 'receive','load','transfer','sell','return'
  from_location TEXT,
  to_location TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  reference_id TEXT,
  invoice_id TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  customer_id TEXT,
  salesperson_id TEXT,
  city_id TEXT,
  car_id TEXT,
  shipment_id TEXT,
  lines JSONB NOT NULL DEFAULT '[]', -- InvoiceLine[]
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'cash', -- 'cash' | 'credit'
  bank_account_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  customer_id TEXT,
  salesperson_id TEXT,
  city_id TEXT,
  shipment_id TEXT,
  bank_account_id TEXT,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category_id TEXT,
  description TEXT DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  bank_account_id TEXT,
  shipment_id TEXT,
  car_id TEXT,
  notes TEXT DEFAULT '',
  settled BOOLEAN DEFAULT false,
  settled_date TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE salaries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shipment_id TEXT,
  employee_id TEXT,
  type TEXT NOT NULL DEFAULT 'salary', -- 'salary' | 'allowance'
  bank_account_id TEXT,
  month TEXT DEFAULT '',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE general_transfers (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT DEFAULT '',
  shipment_id TEXT,
  partner_id TEXT,
  transfer_type TEXT, -- 'capital','capital_contribution','capital_return','drawings','profit_payment'
  beneficiary_partner_id TEXT,
  amount_sdg DECIMAL(12,2) NOT NULL DEFAULT 0,
  exchange_rate DECIMAL(12,4) NOT NULL DEFAULT 1,
  amount_sar DECIMAL(12,2) NOT NULL DEFAULT 0,
  splits JSONB NOT NULL DEFAULT '[]', -- {bankAccountId, amount}[]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE account_transfers (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'transfer', -- 'transfer' | 'opening_balance'
  from_bank_account_id TEXT,
  to_bank_account_id TEXT,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  transfer_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ledger (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  from_account TEXT,
  to_account TEXT,
  description TEXT DEFAULT '',
  amount_in DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_out DECIMAL(12,2) NOT NULL DEFAULT 0,
  source_module TEXT NOT NULL, -- 'payment','expense','salary','general_transfer','account_transfer','sale_cash'
  linked_id TEXT NOT NULL,
  reference_id TEXT,
  invoice_id TEXT,
  shipment_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE saved_settlements (
  shipment_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL,
  profit_by_partner JSONB NOT NULL DEFAULT '[]', -- {partnerId, profitSAR}[]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE capital_contributions (
  id TEXT PRIMARY KEY,
  partner_id TEXT,
  shipment_id TEXT,
  amount_sar DECIMAL(12,2) NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  notes TEXT,
  profit_rate DECIMAL(8,2),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE settlement_results (
  shipment_id TEXT PRIMARY KEY,
  saved_at TEXT NOT NULL,
  exchange_rate DECIMAL(12,4) NOT NULL DEFAULT 1,
  investors_profit_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  management_fee_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  partner_profits JSONB NOT NULL DEFAULT '[]',
  investor_profits JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipment_transfers (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  from_shipment_id TEXT NOT NULL,
  to_shipment_id TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit Log ──────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT 'Unknown',
  action TEXT NOT NULL, -- 'create' | 'update' | 'delete' | 'mixed'
  details JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── App Settings (scalar state fields) ─────────────────────────

CREATE TABLE app_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  language TEXT DEFAULT 'ar',
  user_role TEXT DEFAULT 'manager',
  exchange_rate DECIMAL(12,4) DEFAULT 1,
  management_fee_percent DECIMAL(5,2) DEFAULT 0,
  management_fee_recipient_id TEXT DEFAULT '1',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Sync Queue (for offline operations) ─────────────────────────

CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL, -- 'INSERT','UPDATE','DELETE'
  data JSONB,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX idx_customers_city ON customers(city_id);
CREATE INDEX idx_customers_salesperson ON customers(salesperson_id);
CREATE INDEX idx_inventory_txn_shipment ON inventory_transactions(shipment_id);
CREATE INDEX idx_inventory_txn_product ON inventory_transactions(product_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_shipment ON invoices(shipment_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_shipment ON payments(shipment_id);
CREATE INDEX idx_expenses_shipment ON expenses(shipment_id);
CREATE INDEX idx_salaries_shipment ON salaries(shipment_id);
CREATE INDEX idx_general_transfers_shipment ON general_transfers(shipment_id);
CREATE INDEX idx_ledger_source ON ledger(source_module);
CREATE INDEX idx_ledger_shipment ON ledger(shipment_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(status);

-- =============================================
-- Auto-update updated_at trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_salespeople BEFORE UPDATE ON salespeople FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_cities BEFORE UPDATE ON cities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_cars BEFORE UPDATE ON cars FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_bank_accounts BEFORE UPDATE ON bank_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_shipments BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_employees BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_partners BEFORE UPDATE ON partners FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_expense_categories BEFORE UPDATE ON expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_roles BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_customers BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_inventory_transactions BEFORE UPDATE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_invoices BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_payments BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_expenses BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_salaries BEFORE UPDATE ON salaries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_general_transfers BEFORE UPDATE ON general_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_account_transfers BEFORE UPDATE ON account_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_ledger BEFORE UPDATE ON ledger FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_saved_settlements BEFORE UPDATE ON saved_settlements FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_capital_contributions BEFORE UPDATE ON capital_contributions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_settlement_results BEFORE UPDATE ON settlement_results FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_shipment_transfers BEFORE UPDATE ON shipment_transfers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_app_settings BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_audit_logs BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- Row Level Security — allow all (customize later)
-- =============================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE salespeople ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE general_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON salespeople FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON cities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON cars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON bank_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON shipments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON partners FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON expense_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON roles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON invoices FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON salaries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON general_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON account_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ledger FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON saved_settlements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON capital_contributions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON settlement_results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON shipment_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON sync_queue FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Set REPLICA IDENTITY FULL on all tables
-- (Required for Supabase Realtime DELETE events to include the full OLD row)
-- =============================================
ALTER TABLE products REPLICA IDENTITY FULL;
ALTER TABLE salespeople REPLICA IDENTITY FULL;
ALTER TABLE cities REPLICA IDENTITY FULL;
ALTER TABLE cars REPLICA IDENTITY FULL;
ALTER TABLE bank_accounts REPLICA IDENTITY FULL;
ALTER TABLE shipments REPLICA IDENTITY FULL;
ALTER TABLE employees REPLICA IDENTITY FULL;
ALTER TABLE partners REPLICA IDENTITY FULL;
ALTER TABLE expense_categories REPLICA IDENTITY FULL;
ALTER TABLE roles REPLICA IDENTITY FULL;
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE customers REPLICA IDENTITY FULL;
ALTER TABLE inventory_transactions REPLICA IDENTITY FULL;
ALTER TABLE invoices REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE expenses REPLICA IDENTITY FULL;
ALTER TABLE salaries REPLICA IDENTITY FULL;
ALTER TABLE general_transfers REPLICA IDENTITY FULL;
ALTER TABLE account_transfers REPLICA IDENTITY FULL;
ALTER TABLE ledger REPLICA IDENTITY FULL;
ALTER TABLE saved_settlements REPLICA IDENTITY FULL;
ALTER TABLE capital_contributions REPLICA IDENTITY FULL;
ALTER TABLE settlement_results REPLICA IDENTITY FULL;
ALTER TABLE shipment_transfers REPLICA IDENTITY FULL;
ALTER TABLE app_settings REPLICA IDENTITY FULL;
ALTER TABLE audit_logs REPLICA IDENTITY FULL;

-- =============================================
-- Enable Realtime on transactional tables
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE salespeople;
ALTER PUBLICATION supabase_realtime ADD TABLE cities;
ALTER PUBLICATION supabase_realtime ADD TABLE cars;
ALTER PUBLICATION supabase_realtime ADD TABLE bank_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE employees;
ALTER PUBLICATION supabase_realtime ADD TABLE partners;
ALTER PUBLICATION supabase_realtime ADD TABLE expense_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE roles;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE salaries;
ALTER PUBLICATION supabase_realtime ADD TABLE general_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE account_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE ledger;
ALTER PUBLICATION supabase_realtime ADD TABLE saved_settlements;
ALTER PUBLICATION supabase_realtime ADD TABLE capital_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE settlement_results;
ALTER PUBLICATION supabase_realtime ADD TABLE shipment_transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;

-- =============================================
-- Insert singleton settings row
-- =============================================
INSERT INTO app_settings (id) VALUES ('singleton') ON CONFLICT DO NOTHING;
