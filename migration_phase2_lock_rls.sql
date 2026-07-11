-- =====================================================================
-- SECURITY MIGRATION — PHASE 2: Lock RLS to authenticated sessions only
-- =====================================================================
-- DO NOT RUN THIS UNTIL every active user has logged in at least once on a
-- build that contains the Phase 1 background-auth change (commit that adds
-- ensureAuthSession). Until then, RLS must stay permissive or clients break.
--
-- What this does: replaces every "allow_all" policy (which trusts the public
-- anon key) with one that requires a real Supabase Auth session. After this,
-- the public anon key ALONE can no longer read or write your data.
--
-- Run in: Supabase Dashboard → SQL Editor (needs owner/service_role — the
-- public anon key cannot alter policies).
--
-- Rollback: re-run migration by recreating "allow_all" policies (see bottom).
-- =====================================================================

-- PRE-REQUISITE (do this FIRST, in Dashboard → Authentication → Providers → Email):
--   • Enable the "Email" provider.
--   • DISABLE "Confirm email" (accounts use synthetic <username>@astrida.local
--     addresses that can't receive mail; without this, sign-in fails).

DO $$
DECLARE t text;
DECLARE tbls text[] := ARRAY[
  'products','salespeople','cities','cars','bank_accounts','shipments',
  'employees','partners','expense_categories','roles','users','customers',
  'inventory_transactions','invoices','payments','expenses','salaries',
  'general_transfers','account_transfers','ledger','saved_settlements',
  'capital_contributions','settlement_results','shipment_transfers',
  'app_settings','audit_logs','sync_queue'
];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- Drop the permissive policy that trusts the public anon key
    EXECUTE format('DROP POLICY IF EXISTS "allow_all" ON public.%I;', t);
    -- Require an authenticated Supabase session for all access
    EXECUTE format(
      'CREATE POLICY "authenticated_all" ON public.%I '
      'FOR ALL TO authenticated USING (true) WITH CHECK (true);', t
    );
  END LOOP;
END $$;

-- Verify: every table should now show ONE policy, role = {authenticated}.
--   SELECT tablename, policyname, roles FROM pg_policies
--   WHERE schemaname = 'public' ORDER BY tablename;

-- =====================================================================
-- OPTIONAL HARDENING (recommended, after the above is confirmed working):
-- Prevent an authenticated user from reading other users' password hashes.
-- Requires the login flow to authenticate FIRST (see SECURITY_MIGRATION notes),
-- so only apply once that reorder is deployed.
-- =====================================================================
-- (left as a follow-up — do not apply blindly)

-- =====================================================================
-- ROLLBACK (if clients break — restores the previous permissive behavior):
-- =====================================================================
-- DO $$
-- DECLARE t text;
-- DECLARE tbls text[] := ARRAY[ /* same list as above */ ];
-- BEGIN
--   FOREACH t IN ARRAY tbls LOOP
--     EXECUTE format('DROP POLICY IF EXISTS "authenticated_all" ON public.%I;', t);
--     EXECUTE format('CREATE POLICY "allow_all" ON public.%I FOR ALL USING (true) WITH CHECK (true);', t);
--   END LOOP;
-- END $$;
