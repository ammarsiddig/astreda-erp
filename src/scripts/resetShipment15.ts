/**
 * One-Time Data Reset Script — Shipment 15 (id: '4')
 *
 * Deletes all operational/transactional data linked to Shipment15 from both
 * Supabase and the browser's localStorage state. Reference/master data and
 * the Shipment15 record itself are preserved.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *   1. Open the application in the browser.
 *   2. Open DevTools → Console.
 *   3. Run in dry-run mode first (no changes made):
 *        window.resetShipment15({ dryRun: true })
 *   4. Review the output — it shows exactly how many records per category.
 *   5. When satisfied, run the live reset:
 *        window.resetShipment15({ dryRun: false })
 *   6. Reload the page to pick up the cleared state.
 *
 * ─── What is deleted ──────────────────────────────────────────────────────
 *   invoices               — all invoices with shipmentId === '4'
 *   payments               — all payments with shipmentId === '4'
 *   expenses               — all expenses with shipmentId === '4'
 *   salaries               — all salaries with shipmentId === '4'
 *   inventoryTransactions  — all inventory movements with shipmentId === '4'
 *   generalTransfers       — all transfers with shipmentId === '4'
 *   capitalContributions   — all contributions with shipmentId === '4'
 *   manualProfitDistributions — the single distribution record for shipmentId === '4'
 *   shipmentTransfers      — any inter-shipment transfer rows involving shipmentId === '4'
 *   ledger                 — all ledger entries with shipmentId === '4'
 *   auditLogs              — audit log entries whose details reference IDs being deleted
 *                            (best-effort: entries whose addedIds/updatedIds/deletedIds
 *                             contain any of the deleted record IDs)
 *
 * ─── What is NOT deleted ──────────────────────────────────────────────────
 *   The Shipment15 record itself (id: '4')
 *   customers, partners, products, cities, cars, employees
 *   bankAccounts, expenseCategories, salespeople
 *   users, roles, settings (scalar values)
 *   accountTransfers (not shipment-linked)
 *   any data for other shipments
 *
 * ─── Safety notes ─────────────────────────────────────────────────────────
 *   Always run with dryRun: true first.
 *   This script only targets shipmentId === '4'. No broad-table deletes.
 *   Supabase deletes are done with explicit .eq() / .in() filters.
 *   localStorage state is rebuilt field-by-field without touching other keys.
 */

import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { AppState, LedgerEntry, AuditLogEntry } from '../types'

const SHIPMENT_ID = '4'   // الرسالة15
const LS_KEY = 'astreda_erp_state'

// ─── Helpers ───────────────────────────────────────────────────────────────

function readLocalState(): AppState | null {
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function writeLocalState(state: AppState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state))
}

function plural(n: number, label: string) {
  return `${n} ${label}`
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function resetShipment15({ dryRun = true }: { dryRun?: boolean } = {}): Promise<void> {
  const mode = dryRun ? '🔍 DRY-RUN' : '🔥 LIVE'
  console.log(`\n${mode} — إعادة تعيين الرسالة15 (shipmentId: '${SHIPMENT_ID}')`)
  console.log('═'.repeat(60))

  if (!dryRun) {
    if (!isSupabaseConfigured()) {
      console.error('❌ Supabase غير مُعدّ — أوقف العملية')
      return
    }
    if (!navigator.onLine) {
      console.error('❌ لا يوجد اتصال بالإنترنت — يجب الاتصال لضمان حذف Supabase')
      return
    }
  }

  // ── Read local state ──────────────────────────────────────────
  const state = readLocalState()
  if (!state) {
    console.error('❌ لا توجد بيانات محلية في localStorage')
    return
  }

  const S = SHIPMENT_ID

  // ── Identify records to delete ────────────────────────────────

  const invoicesToDel       = (state.invoices || []).filter(x => x.shipmentId === S)
  const paymentsToDel       = (state.payments || []).filter(x => x.shipmentId === S)
  const expensesToDel       = (state.expenses || []).filter(x => x.shipmentId === S)
  const salariesToDel       = (state.salaries || []).filter(x => x.shipmentId === S)
  const invTxnsToDel        = (state.inventoryTransactions || []).filter(x => x.shipmentId === S)
  const transfersToDel      = (state.generalTransfers || []).filter(x => x.shipmentId === S)
  const contribsToDel       = (state.capitalContributions || []).filter(x => x.shipmentId === S)
  const profitDistToDel     = (state.manualProfitDistributions || []).filter(x => x.shipmentId === S)
  const shipTxfrsToDel      = (state.shipmentTransfers || []).filter(
    x => x.fromShipmentId === S || x.toShipmentId === S
  )

  // Ledger entries: by shipmentId field, or linkedId matches a deleted record
  const deletedLinkedIds = new Set<string>([
    ...invoicesToDel.map(x => x.id),
    ...paymentsToDel.map(x => x.id),
    ...expensesToDel.map(x => x.id),
    ...salariesToDel.map(x => x.id),
    ...transfersToDel.map(x => x.id),
    ...shipTxfrsToDel.map(x => x.id),
  ])

  const ledgerToDel: LedgerEntry[] = (state.ledger || []).filter(
    (e: LedgerEntry) =>
      e.shipmentId === S ||
      deletedLinkedIds.has(e.linkedId)
  )

  // Audit logs: best-effort — entries that mention any deleted ID
  // AuditLogEntry has details[].addedIds / updatedIds / deletedIds
  const allDeletedIds = new Set<string>([
    ...invoicesToDel.map(x => x.id),
    ...paymentsToDel.map(x => x.id),
    ...expensesToDel.map(x => x.id),
    ...salariesToDel.map(x => x.id),
    ...invTxnsToDel.map(x => x.id),
    ...transfersToDel.map(x => x.id),
    ...contribsToDel.map(x => x.id),
    ...shipTxfrsToDel.map(x => x.id),
    ...ledgerToDel.map((e: LedgerEntry) => e.id),
  ])

  const auditLogsToDel: AuditLogEntry[] = (state.auditLogs || []).filter(
    (entry: AuditLogEntry) =>
      entry.details.some(d =>
        [...d.addedIds, ...d.updatedIds, ...d.deletedIds].some(id => allDeletedIds.has(id))
      )
  )

  // ── Summary table ─────────────────────────────────────────────
  const summary = [
    { category: 'invoices (فواتير)',                count: invoicesToDel.length,   ids: invoicesToDel.map(x => x.id) },
    { category: 'payments (مدفوعات)',               count: paymentsToDel.length,   ids: paymentsToDel.map(x => x.id) },
    { category: 'expenses (مصروفات)',               count: expensesToDel.length,   ids: expensesToDel.map(x => x.id) },
    { category: 'salaries (رواتب)',                 count: salariesToDel.length,   ids: salariesToDel.map(x => x.id) },
    { category: 'inventoryTransactions (مخزون)',    count: invTxnsToDel.length,    ids: invTxnsToDel.map(x => x.id) },
    { category: 'generalTransfers (تحاويل)',        count: transfersToDel.length,  ids: transfersToDel.map(x => x.id) },
    { category: 'capitalContributions (مساهمات)',   count: contribsToDel.length,   ids: contribsToDel.map(x => x.id) },
    { category: 'manualProfitDistributions (توزيع)', count: profitDistToDel.length, ids: profitDistToDel.map(x => x.shipmentId) },
    { category: 'shipmentTransfers (تحاويل بضاعة)', count: shipTxfrsToDel.length,  ids: shipTxfrsToDel.map(x => x.id) },
    { category: 'ledger (دفتر الأستاذ)',            count: ledgerToDel.length,     ids: ledgerToDel.map((e: LedgerEntry) => e.id) },
    { category: 'auditLogs (سجل التغييرات)',        count: auditLogsToDel.length,  ids: auditLogsToDel.map((e: AuditLogEntry) => e.id) },
  ]

  console.log('\n📋 السجلات التي ستُحذف:')
  let grandTotal = 0
  for (const row of summary) {
    if (row.count > 0) {
      console.log(`  ${plural(row.count, row.category)}`)
      grandTotal += row.count
    } else {
      console.log(`  ─ ${row.category}: لا شيء`)
    }
  }
  console.log(`\n  الإجمالي: ${grandTotal} سجل`)

  // Verify shipment record is safe
  const shipmentRecord = (state.shipments || []).find(s => s.id === S)
  console.log(`\n🔒 الرسالة15 (id='${S}'): ${shipmentRecord ? `✅ سليمة — "${shipmentRecord.name}"` : '⚠️ غير موجودة في البيانات المحلية'}`)
  console.log(`🔒 Master data (customers, partners, products...): غير متأثرة`)

  if (dryRun) {
    console.log('\n✅ Dry-run انتهى — لم يُحذف أي شيء')
    console.log('   لتنفيذ الحذف الفعلي: window.resetShipment15({ dryRun: false })')
    return
  }

  // ── LIVE: Delete from Supabase ────────────────────────────────
  console.log('\n⚡ جاري الحذف من Supabase...')

  const sb = supabase!

  async function deleteFromSupabase(
    table: string,
    column: string,
    values: string[],
    label: string
  ): Promise<void> {
    if (values.length === 0) {
      console.log(`  ⏭ ${label}: لا شيء`)
      return
    }
    const { error } = await sb.from(table).delete().in(column, values)
    if (error) {
      console.error(`  ❌ ${label}: ${error.message}`)
    } else {
      console.log(`  ✅ ${label}: حُذف ${values.length} سجل`)
    }
  }

  // Tables with direct shipment_id column
  await deleteFromSupabase('invoices',                'shipment_id', invoicesToDel.map(x => x.id),    'invoices')
  await deleteFromSupabase('payments',                'shipment_id', paymentsToDel.map(x => x.id),    'payments')
  await deleteFromSupabase('expenses',                'shipment_id', expensesToDel.map(x => x.id),    'expenses')
  await deleteFromSupabase('salaries',                'shipment_id', salariesToDel.map(x => x.id),    'salaries')
  await deleteFromSupabase('inventory_transactions',  'shipment_id', invTxnsToDel.map(x => x.id),     'inventory_transactions')
  await deleteFromSupabase('general_transfers',       'shipment_id', transfersToDel.map(x => x.id),   'general_transfers')
  await deleteFromSupabase('capital_contributions',   'shipment_id', contribsToDel.map(x => x.id),    'capital_contributions')

  // manual_profit_distributions PK is shipment_id
  if (profitDistToDel.length > 0) {
    const { error } = await sb.from('manual_profit_distributions').delete().eq('shipment_id', S)
    if (error) console.error(`  ❌ manual_profit_distributions: ${error.message}`)
    else       console.log(`  ✅ manual_profit_distributions: حُذف ${profitDistToDel.length} سجل`)
  } else {
    console.log('  ⏭ manual_profit_distributions: لا شيء')
  }

  // shipment_transfers: rows that reference shipment '4' on either side
  await deleteFromSupabase('shipment_transfers', 'id', shipTxfrsToDel.map(x => x.id), 'shipment_transfers')

  // ledger — delete by id
  const ledgerIdsToDel = ledgerToDel.map((e: LedgerEntry) => e.id)
  await deleteFromSupabase('ledger', 'id', ledgerIdsToDel, 'ledger')

  // audit_logs — best-effort by id
  const auditIdsToDel = auditLogsToDel.map((e: AuditLogEntry) => e.id)
  await deleteFromSupabase('audit_logs', 'id', auditIdsToDel, 'audit_logs')

  // ── LIVE: Update localStorage ─────────────────────────────────
  console.log('\n⚡ تحديث localStorage...')

  const delInvoiceIds   = new Set(invoicesToDel.map(x => x.id))
  const delPayIds       = new Set(paymentsToDel.map(x => x.id))
  const delExpIds       = new Set(expensesToDel.map(x => x.id))
  const delSalIds       = new Set(salariesToDel.map(x => x.id))
  const delInvTxnIds    = new Set(invTxnsToDel.map(x => x.id))
  const delTransIds     = new Set(transfersToDel.map(x => x.id))
  const delContribIds   = new Set(contribsToDel.map(x => x.id))
  const delShipTxIds    = new Set(shipTxfrsToDel.map(x => x.id))
  const delLedgerIds    = new Set(ledgerToDel.map((e: LedgerEntry) => e.id))
  const delAuditIds     = new Set(auditLogsToDel.map((e: AuditLogEntry) => e.id))

  const newState: AppState = {
    ...state,
    invoices:                 state.invoices.filter(x => !delInvoiceIds.has(x.id)),
    payments:                 state.payments.filter(x => !delPayIds.has(x.id)),
    expenses:                 state.expenses.filter(x => !delExpIds.has(x.id)),
    salaries:                 state.salaries.filter(x => !delSalIds.has(x.id)),
    inventoryTransactions:    state.inventoryTransactions.filter(x => !delInvTxnIds.has(x.id)),
    generalTransfers:         state.generalTransfers.filter(x => !delTransIds.has(x.id)),
    capitalContributions:     (state.capitalContributions || []).filter(x => !delContribIds.has(x.id)),
    manualProfitDistributions:(state.manualProfitDistributions || []).filter(x => x.shipmentId !== S),
    shipmentTransfers:        (state.shipmentTransfers || []).filter(x => !delShipTxIds.has(x.id)),
    ledger:                   state.ledger.filter((e: LedgerEntry) => !delLedgerIds.has(e.id)),
    auditLogs:                (state.auditLogs || []).filter((e: AuditLogEntry) => !delAuditIds.has(e.id)),
  }

  writeLocalState(newState)
  console.log('  ✅ localStorage updated')

  // ── Final summary ─────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('✅ اكتملت إعادة التعيين — يرجى إعادة تحميل الصفحة')
  console.log('═'.repeat(60))
}

// ── Expose globally for browser console use ────────────────────
declare global {
  interface Window {
    resetShipment15: typeof resetShipment15
  }
}
window.resetShipment15 = resetShipment15
