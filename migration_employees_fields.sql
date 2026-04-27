-- =============================================
-- Migration: Add phone and job_title columns to employees
-- Run this ONCE in Supabase SQL Editor.
-- Fixes employee create/edit failing with:
--   "Could not find the 'job_title' column of 'employees' in the schema cache"
-- =============================================

ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title TEXT;
