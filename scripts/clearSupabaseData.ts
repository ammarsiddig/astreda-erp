// Usage: npx tsx scripts/clearSupabaseData.ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://prwvpcxwodidfijytfuh.supabase.co'
const SUPABASE_KEY = 'sb_publishable_mBWbKcJWrKQZBrp46uDIxg_x6G7rGPJ'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// List of tables to clear (exclude roles, users, app_settings)
const tables = [
  'products',
  'salespeople',
  'cities',
  'cars',
  'bank_accounts',
  'shipments',
  'employees',
  'partners',
  'expense_categories',
  'customers',
  'inventory_transactions',
  'invoices',
  'payments',
  'expenses',
  'salaries',
  'general_transfers',
  'account_transfers',
  'ledger',
  'saved_settlements',
  'capital_contributions',
  'settlement_results',
  'shipment_transfers',
]

async function clearAll() {
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', '')
    if (error) {
      console.error(`Failed to clear ${table}:`, error.message)
    } else {
      console.log(`Cleared ${table}`)
    }
  }
  console.log('✅ All data cleared (except roles, users, app_settings)')
}

clearAll()
