-- Migration: Add transfer_count column to account_transfers
-- Run this ONCE in the Supabase SQL Editor.
-- Fixes: saving new account transfer records was failing because
-- the transfer_count column was missing, causing every upsert to
-- be rejected by PostgreSQL with "column does not exist".

ALTER TABLE account_transfers
  ADD COLUMN IF NOT EXISTS transfer_count INTEGER NOT NULL DEFAULT 1;
