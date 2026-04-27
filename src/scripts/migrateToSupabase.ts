/**
 * Migration Script — pushes all localStorage data to Supabase
 * 
 * Usage: Open browser console and run:
 *   window.migrateAllData()
 *
 * Also provides window.testSync() for quick verification.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { TABLE_MAPPINGS } from '../lib/syncEngine'
import type { AppState } from '../types'

const BATCH_SIZE = 500 // Supabase max rows per upsert

async function migrateAllData(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('❌ Supabase غير مُعدّ — تحقق من ملف .env')
    return
  }
  if (!navigator.onLine) {
    console.error('❌ لا يوجد اتصال بالإنترنت')
    return
  }

  console.log('🚀 بدء نقل البيانات من localStorage إلى Supabase...')
  console.log('─────────────────────────────────────────────')

  // Read current state from localStorage
  const raw = localStorage.getItem('astreda_erp_state') || localStorage.getItem('americana_erp_state')
  if (!raw) {
    console.error('❌ لا توجد بيانات في localStorage')
    return
  }

  let state: AppState
  try {
    state = JSON.parse(raw)
  } catch {
    console.error('❌ فشل قراءة البيانات من localStorage')
    return
  }

  let success = 0
  let failed = 0
  let totalRows = 0

  for (const mapping of TABLE_MAPPINGS) {
    const key = mapping.stateKey
    let items: any[]
    items = (state as any)[key] ?? []

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`  ⏭ ${mapping.table}: فارغ`)
      continue
    }

    try {
      const rows = items.map(mapping.toRow)
      const pkCol = mapping.pkField ?? 'id'

      // Batch upsert for large tables
      let tableSuccess = true
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error } = await supabase!.from(mapping.table).upsert(batch, { onConflict: pkCol })
        if (error) {
          console.error(`  ❌ ${mapping.table} (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message)
          tableSuccess = false
          break
        }
      }

      if (tableSuccess) {
        console.log(`  ✅ ${mapping.table}: ${rows.length} سجل`)
        success++
        totalRows += rows.length
      } else {
        failed++
      }
    } catch (e: any) {
      console.error(`  ❌ ${mapping.table}:`, e.message)
      failed++
    }
  }

  // Push scalar settings
  try {
    const { error } = await supabase!.from('app_settings').upsert({
      id: 'singleton',
      language: state.language ?? 'ar',
      user_role: (state as any).userRole ?? 'manager',
      exchange_rate: state.exchangeRate ?? 1,
      management_fee_percent: state.managementFeePercent ?? 0,
      management_fee_recipient_id: state.managementFeeRecipientId ?? '1',
    }, { onConflict: 'id' })
    if (error) {
      console.error('  ❌ app_settings:', error.message)
      failed++
    } else {
      console.log('  ✅ app_settings: تم')
      success++
    }
  } catch (e: any) {
    console.error('  ❌ app_settings:', e.message)
    failed++
  }

  console.log('─────────────────────────────────────────────')
  console.log(`🎉 اكتمل النقل — جداول نجحت: ${success}, فشلت: ${failed}, إجمالي السجلات: ${totalRows}`)
  if (failed === 0) {
    console.log('✅ جميع البيانات تم نقلها بنجاح إلى Supabase!')
    console.log('💡 يمكنك الآن إعادة تحميل الصفحة — التطبيق سيسحب البيانات من Supabase مباشرة')
  }
}

async function testSync(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.error('❌ Supabase غير مُعدّ')
    return
  }
  if (!navigator.onLine) {
    console.error('❌ لا يوجد اتصال بالإنترنت')
    return
  }

  const TEST_ID = '__test_sync_001__'
  const TEST_NAME = 'منتج تجريبي — اختبار المزامنة'

  console.log('─── 1. إدخال منتج تجريبي ───')
  const { data: inserted, error: e1 } = await supabase!
    .from('products').upsert({ id: TEST_ID, name: TEST_NAME }, { onConflict: 'id' }).select().single()
  if (e1) { console.error('❌', e1.message); return }
  console.log('✅ تم الإدخال:', inserted)

  console.log('─── 2. التحقق ───')
  const { data: fetched, error: e2 } = await supabase!
    .from('products').select('*').eq('id', TEST_ID).single()
  if (e2) { console.error('❌', e2.message); return }
  console.log('✅ موجود:', fetched)

  console.log('─── 3. حذف ───')
  const { error: e3 } = await supabase!.from('products').delete().eq('id', TEST_ID)
  if (e3) { console.error('❌', e3.message); return }
  console.log('✅ تم الحذف')

  console.log('─── 4. تأكيد الحذف ───')
  const { data: check } = await supabase!.from('products').select('id').eq('id', TEST_ID)
  console.log(!check?.length ? '✅ تأكيد: محذوف' : '⚠️ لا يزال موجوداً')

  console.log('\n🎉 اختبار المزامنة مكتمل!')
}

// Re-migrate specific tables only
async function migrateTable(...tableNames: string[]): Promise<void> {
  if (!isSupabaseConfigured()) { console.error('❌ Supabase غير مُعدّ'); return }
  if (!navigator.onLine) { console.error('❌ لا يوجد اتصال'); return }

  const raw = localStorage.getItem('astreda_erp_state') || localStorage.getItem('americana_erp_state')
  if (!raw) { console.error('❌ لا توجد بيانات'); return }
  const state: AppState = JSON.parse(raw)

  for (const tableName of tableNames) {
    const mapping = TABLE_MAPPINGS.find(m => m.table === tableName)
    if (!mapping) { console.error(`❌ جدول غير موجود: ${tableName}`); continue }

    const key = mapping.stateKey
    let items: any[] = (state as any)[key] ?? []

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`  ⏭ ${tableName}: فارغ`); continue
    }

    const rows = items.map(mapping.toRow)
    const pkCol = mapping.pkField ?? 'id'
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await supabase!.from(tableName).upsert(batch, { onConflict: pkCol })
      if (error) { console.error(`  ❌ ${tableName}:`, error.message); break }
    }
    console.log(`  ✅ ${tableName}: ${rows.length} سجل`)
  }
  console.log('🎉 تم!')
}

// Expose to browser console
if (typeof window !== 'undefined') {
  (window as any).migrateAllData = migrateAllData;
  (window as any).testSync = testSync;
  (window as any).migrateTable = migrateTable;
}

export { migrateAllData, testSync, migrateTable }
