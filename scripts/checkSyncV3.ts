import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://prwvpcxwodidfijytfuh.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_mBWbKcJWrKQZBrp46uDIxg_x6G7rGPJ'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'public' },
})

type CheckResult = {
  name: string
  ok: boolean
  detail: string
}

async function checkSelect(name: string, table: string, columns: string): Promise<CheckResult> {
  const { error } = await supabase.from(table).select(columns).limit(1)
  if (error) {
    return { name, ok: false, detail: error.message }
  }
  return { name, ok: true, detail: `select ${columns} on ${table} ok` }
}

async function main() {
  const results: CheckResult[] = []

  const appSettings = await supabase
    .from('app_settings')
    .select('id, schema_version')
    .eq('id', 'singleton')
    .single()

  if (appSettings.error) {
    results.push({
      name: 'app_settings.schema_version',
      ok: false,
      detail: appSettings.error.message,
    })
  } else {
    const version = appSettings.data?.schema_version
    results.push({
      name: 'app_settings.schema_version',
      ok: version === 3,
      detail: `schema_version=${String(version)}`,
    })
  }

  results.push(await checkSelect('shipments.is_closed', 'shipments', 'id,is_closed'))
  results.push(
    await checkSelect(
      'capital_contributions.profit_rate',
      'capital_contributions',
      'id,profit_rate'
    )
  )
  results.push(
    await checkSelect(
      'inventory_transactions.transfer_columns',
      'inventory_transactions',
      'id,from_shipment_id,to_shipment_id'
    )
  )
  results.push(
    await checkSelect(
      'user_preferences.active_shipment_id',
      'user_preferences',
      'user_id,active_shipment_id'
    )
  )

  const failed = results.filter(r => !r.ok)

  console.log('Sync v3 schema check')
  for (const result of results) {
    const prefix = result.ok ? '[OK] ' : '[FAIL]'
    console.log(`${prefix} ${result.name}: ${result.detail}`)
  }

  if (failed.length > 0) {
    process.exitCode = 1
    return
  }

  console.log('All sync v3 checks passed.')
}

main().catch((error) => {
  console.error('Sync v3 check failed with exception:', error)
  process.exitCode = 1
})
