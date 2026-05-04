-- =============================================
-- Migration: Add audit_logs table for cross-user change tracking
-- Run this ONCE in Supabase SQL Editor.
-- =============================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT,
  user_name TEXT NOT NULL DEFAULT 'Unknown',
  action TEXT NOT NULL, -- 'create' | 'update' | 'delete' | 'mixed'
  details JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_logs
  ALTER COLUMN timestamp TYPE TIMESTAMPTZ USING timestamp::timestamp AT TIME ZONE 'Africa/Khartoum',
  ALTER COLUMN timestamp SET DEFAULT NOW(),
  ALTER COLUMN timestamp SET NOT NULL;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'audit_logs'
      AND policyname = 'allow_all'
  ) THEN
    CREATE POLICY "allow_all" ON audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_audit_logs') THEN
    CREATE TRIGGER tr_audit_logs
      BEFORE UPDATE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE audit_logs REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE audit_logs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
