-- =============================================
-- Migration V3: Schema Standardization for Sync Engine v3
-- Run this ONCE in Supabase SQL Editor BEFORE deploying the new client.
-- =============================================

-- 1. Shipments: standardize on is_closed, drop legacy is_active
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS is_closed BOOLEAN DEFAULT false;

-- COALESCE fallback = false because the original schema had `is_active BOOLEAN DEFAULT false`,
-- meaning NULL or false → not active → should be is_closed = true.
UPDATE shipments
SET is_closed = NOT COALESCE(is_active, false)
WHERE is_closed IS NULL OR is_active IS NOT NULL;

ALTER TABLE shipments DROP COLUMN IF EXISTS is_active;

-- 2. Capital contributions: ensure profit_rate column exists
ALTER TABLE capital_contributions ADD COLUMN IF NOT EXISTS profit_rate DECIMAL(8,2);

-- 3. Inventory transactions: add missing shipment transfer columns
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS from_shipment_id TEXT;
ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS to_shipment_id TEXT;

-- 4. App settings: add schema_version
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS schema_version INTEGER DEFAULT 0;

INSERT INTO app_settings (id, schema_version)
VALUES ('singleton', 3)
ON CONFLICT (id) DO UPDATE SET schema_version = 3;

-- 5. User preferences: per-user cloud-synced settings (e.g. active shipment)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_shipment_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_preferences'
      AND policyname = 'Allow all to user_preferences'
  ) THEN
    CREATE POLICY "Allow all to user_preferences"
      ON user_preferences FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_user_preferences') THEN
    CREATE TRIGGER tr_user_preferences
      BEFORE UPDATE ON user_preferences
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- 6. Drop unused server-side sync_queue table (offline queue is client-side only)
DROP TABLE IF EXISTS sync_queue;

-- =============================================
-- Done. Schema version is now 3.
-- =============================================
