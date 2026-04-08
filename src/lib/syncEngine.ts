/**
 * Sync Engine v2 — Online-Only, Supabase as Single Source of Truth
 *
 * Design:
 *  1. On app load → pull everything from Supabase → render
 *  2. Every write → Supabase first → update local state on success
 *  3. Realtime subscriptions → instant cross-device updates
 *  4. Offline → block writes, show banner, retry on reconnect
 *  5. Toast confirms every write to user
 *  6. localStorage is ONLY a read cache for instant load
 */

import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './supabase'
import { addToast } from './toast'
import type { AppState } from '../types'

// Debounced save-success toast — collapses rapid per-table calls into one notification
let _saveSuccessTimer: ReturnType<typeof setTimeout> | null = null
function showSaveSuccess() {
  if (_saveSuccessTimer) clearTimeout(_saveSuccessTimer)
  _saveSuccessTimer = setTimeout(() => {
    addToast('success', '✅ تم الحفظ')
    _saveSuccessTimer = null
  }, 200)
}

// ─── Table ↔ AppState key mapping ─────────────────────────────────

export interface TableMapping {
  table: string
  stateKey: keyof AppState
  toRow: (item: any) => Record<string, any>
  fromRow: (row: any) => any
  pkField?: string  // default 'id'
}

const camel2snake = (s: string) =>
  s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase()
const snake2camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

const objectToSnake = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) out[camel2snake(k)] = v
  return out
}

const objectToCamel = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'updated_at') continue
    out[snake2camel(k)] = v
  }
  return out
}

// Auto-detect which column name the DB uses for shipment open/closed status.
// Some DBs still have is_active, others migrated to is_closed.
let _shipmentDbColumn: 'is_active' | 'is_closed' | null = null
let _probing = false

async function probeShipmentColumn(): Promise<void> {
  if (_shipmentDbColumn || _probing || !isSupabaseConfigured()) return
  _probing = true
  try {
    const { data } = await supabase!.from('shipments').select('*').limit(1)
    if (data && data.length > 0) {
      const row = data[0]
      if ('is_closed' in row) _shipmentDbColumn = 'is_closed'
      else if ('is_active' in row) _shipmentDbColumn = 'is_active'
    }
    // If table is empty, try inserting — just default to is_active
    if (!_shipmentDbColumn) _shipmentDbColumn = 'is_active'
  } catch {
    _shipmentDbColumn = 'is_active'
  }
  _probing = false
}

export const TABLE_MAPPINGS: TableMapping[] = [
  { table: 'products', stateKey: 'products', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'salespeople', stateKey: 'salespeople', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'cities', stateKey: 'cities', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'cars', stateKey: 'cars', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'bank_accounts', stateKey: 'bankAccounts', toRow: objectToSnake, fromRow: objectToCamel },
  {
    table: 'shipments', stateKey: 'shipments',
    toRow: (item: Record<string, any>) => {
      const row = objectToSnake(item)
      // Send whichever column the DB actually has
      if (_shipmentDbColumn === 'is_closed') {
        row.is_closed = !!item.isClosed
        delete row.is_active
      } else {
        // Default: is_active (original schema)
        row.is_active = !item.isClosed
        delete row.is_closed
      }
      return row
    },
    fromRow: (row: Record<string, any>) => {
      const obj = objectToCamel(row)
      // Detect which column the DB returned and remember it
      if ('isClosed' in obj) {
        _shipmentDbColumn = 'is_closed'
      } else if ('isActive' in obj) {
        _shipmentDbColumn = 'is_active'
        obj.isClosed = !obj.isActive
        delete obj.isActive
      }
      return obj
    },
  },
  { table: 'employees', stateKey: 'employees', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'partners', stateKey: 'partners', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'expense_categories', stateKey: 'expenseCategories', toRow: objectToSnake, fromRow: objectToCamel },
  {
    table: 'roles', stateKey: 'roles',
    toRow: (r) => ({
      id: r.id, name: r.name, name_en: r.nameEn,
      permissions: JSON.stringify(r.permissions),
      is_salesperson: r.isSalesperson, is_default: r.isDefault ?? false,
    }),
    fromRow: (row) => ({
      id: row.id, name: row.name, nameEn: row.name_en,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
      isSalesperson: row.is_salesperson, isDefault: row.is_default,
    }),
  },
  {
    table: 'users', stateKey: 'users',
    toRow: (u) => ({
      id: u.id, name: u.name, username: u.username, password: u.password,
      role_id: u.roleId, salesperson_id: u.salespersonId ?? null, is_active: u.isActive,
    }),
    fromRow: (row) => ({
      id: row.id, name: row.name, username: row.username, password: row.password,
      roleId: row.role_id, salespersonId: row.salesperson_id ?? undefined, isActive: row.is_active,
    }),
  },
  { table: 'customers', stateKey: 'customers', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'inventory_transactions', stateKey: 'inventoryTransactions', toRow: objectToSnake, fromRow: objectToCamel },
  {
    table: 'invoices', stateKey: 'invoices',
    toRow: (inv) => ({ ...objectToSnake(inv), lines: JSON.stringify(inv.lines) }),
    fromRow: (row) => {
      const obj = objectToCamel(row)
      obj.lines = typeof obj.lines === 'string' ? JSON.parse(obj.lines) : obj.lines
      return obj
    },
  },
  { table: 'payments', stateKey: 'payments', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'expenses', stateKey: 'expenses', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'salaries', stateKey: 'salaries', toRow: objectToSnake, fromRow: objectToCamel },
  {
    table: 'general_transfers', stateKey: 'generalTransfers',
    toRow: (t) => ({
      id: t.id, date: t.date, description: t.description,
      shipment_id: t.shipmentId, partner_id: t.partnerId,
      transfer_type: t.transferType, beneficiary_partner_id: t.beneficiaryPartnerId,
      amount_sdg: t.amountSDG, exchange_rate: t.exchangeRate, amount_sar: t.amountSAR,
      splits: JSON.stringify(t.splits),
    }),
    fromRow: (row) => ({
      id: row.id, date: row.date, description: row.description,
      shipmentId: row.shipment_id, partnerId: row.partner_id,
      transferType: row.transfer_type, beneficiaryPartnerId: row.beneficiary_partner_id,
      amountSDG: row.amount_sdg, exchangeRate: row.exchange_rate, amountSAR: row.amount_sar,
      splits: typeof row.splits === 'string' ? JSON.parse(row.splits) : row.splits,
    }),
  },
  { table: 'account_transfers', stateKey: 'accountTransfers', toRow: objectToSnake, fromRow: objectToCamel },
  { table: 'ledger', stateKey: 'ledger', toRow: objectToSnake, fromRow: objectToCamel },
  {
    table: 'saved_settlements', stateKey: 'savedSettlements', pkField: 'shipment_id',
    toRow: (s) => ({
      shipment_id: s.shipmentId, saved_at: s.savedAt,
      profit_by_partner: JSON.stringify(s.profitByPartner),
    }),
    fromRow: (row) => ({
      shipmentId: row.shipment_id, savedAt: row.saved_at,
      profitByPartner: typeof row.profit_by_partner === 'string' ? JSON.parse(row.profit_by_partner) : row.profit_by_partner,
    }),
  },
  {
    table: 'capital_contributions', stateKey: 'capitalContributions',
    toRow: (c) => ({
      id: c.id, partner_id: c.partnerId, shipment_id: c.shipmentId,
      amount_sar: c.amountSAR, date: c.date, notes: c.notes,
    }),
    fromRow: (row) => ({
      id: row.id, partnerId: row.partner_id, shipmentId: row.shipment_id,
      amountSAR: row.amount_sar, date: row.date, notes: row.notes,
    }),
  },
  {
    table: 'settlement_results', stateKey: 'settlementResults', pkField: 'shipment_id',
    toRow: (sr) => ({
      shipment_id: sr.shipmentId, saved_at: sr.savedAt,
      exchange_rate: sr.exchangeRate, investors_profit_percent: sr.investorsProfitPercent,
      management_fee_percent: sr.managementFeePercent,
      partner_profits: JSON.stringify(sr.partnerProfits),
      investor_profits: JSON.stringify(sr.investorProfits),
    }),
    fromRow: (row) => ({
      shipmentId: row.shipment_id, savedAt: row.saved_at,
      exchangeRate: row.exchange_rate, investorsProfitPercent: row.investors_profit_percent,
      managementFeePercent: row.management_fee_percent,
      partnerProfits: typeof row.partner_profits === 'string' ? JSON.parse(row.partner_profits) : row.partner_profits,
      investorProfits: typeof row.investor_profits === 'string' ? JSON.parse(row.investor_profits) : row.investor_profits,
    }),
  },
  {
    table: 'shipment_transfers', stateKey: 'shipmentTransfers',
    toRow: (st) => ({
      id: st.id, date: st.date,
      from_shipment_id: st.fromShipmentId, to_shipment_id: st.toShipmentId,
      items: JSON.stringify(st.items),
      total_amount: st.totalAmount, notes: st.notes,
    }),
    fromRow: (row) => ({
      id: row.id, date: row.date,
      fromShipmentId: row.from_shipment_id, toShipmentId: row.to_shipment_id,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      totalAmount: row.total_amount, notes: row.notes,
    }),
  },
]

// ─── Online Status (real connectivity check, not just navigator.onLine) ──

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  lastSynced: string | null
  pendingChanges: number
}

let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSynced: null,
  pendingChanges: 0,
}

const statusListeners = new Set<(s: SyncStatus) => void>()

export const onSyncStatusChange = (cb: (s: SyncStatus) => void) => {
  statusListeners.add(cb)
  return () => { statusListeners.delete(cb) }
}
export const getSyncStatus = (): SyncStatus => syncStatus

function updateStatus(patch: Partial<SyncStatus>) {
  syncStatus = { ...syncStatus, ...patch }
  statusListeners.forEach(cb => cb(syncStatus))
}

// Real connectivity: ping Supabase, not just browser event
let pingTimer: ReturnType<typeof setInterval> | null = null
let lastOnlineState = navigator.onLine
const PING_INTERVAL = 15_000  // 15s

async function checkRealConnectivity(): Promise<boolean> {
  if (!navigator.onLine) return false
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_settings?select=id&id=eq.singleton`,
      {
        headers: { 'apikey': supabaseAnonKey },
        signal: controller.signal,
      }
    )
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

export function initNetworkMonitoring(): void {
  const check = async () => {
    const wasOnline = syncStatus.isOnline
    const isOnline = await checkRealConnectivity()
    updateStatus({ isOnline })
    if (!wasOnline && isOnline) {
      console.log('[sync] back online — flushing queue + pulling')
      addToast('success', '✅ الاتصال عاد — جارٍ المزامنة...')
      await flushQueue()
    }
    if (wasOnline && !isOnline) {
      addToast('error', '⚠️ انقطع الاتصال — التعديلات لن تُحفظ حتى يعود', 5000)
    }
  }

  window.addEventListener('online', check)
  window.addEventListener('offline', () => {
    updateStatus({ isOnline: false })
    addToast('error', '⚠️ انقطع الاتصال — التعديلات لن تُحفظ حتى يعود', 5000)
  })

  // Periodic real check
  check()
  pingTimer = setInterval(check, PING_INTERVAL)
}

// ─── Offline Queue (only used when offline) ──────────────────────

const QUEUE_KEY = 'astrida_sync_queue'

interface QueueItem {
  id: string
  table: string
  pk: string
  op: 'UPSERT' | 'DELETE'
  data: Record<string, any>
  ts: string
  retries?: number
}

const MAX_RETRIES = 3

function getQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

function saveQueue(q: QueueItem[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  updateStatus({ pendingChanges: q.length })
}

function enqueue(item: Omit<QueueItem, 'id' | 'ts'>) {
  const q = getQueue()
  const idx = q.findIndex(i => i.table === item.table && i.pk === item.pk)
  const entry: QueueItem = { ...item, id: crypto.randomUUID(), ts: new Date().toISOString() }
  if (idx !== -1) q[idx] = entry; else q.push(entry)
  saveQueue(q)
}

export async function flushQueue(): Promise<void> {
  if (!isSupabaseConfigured() || !navigator.onLine) return
  let queue = getQueue()
  if (queue.length === 0) return

  // Drop items that have exceeded max retries (stuck / schema mismatch)
  const expired = queue.filter(i => (i.retries ?? 0) >= MAX_RETRIES)
  if (expired.length > 0) {
    console.warn(`[sync] dropping ${expired.length} queue items after ${MAX_RETRIES} failures:`,
      expired.map(i => `${i.table}/${i.pk}`))
    queue = queue.filter(i => (i.retries ?? 0) < MAX_RETRIES)
    saveQueue(queue)
    if (queue.length === 0) {
      updateStatus({ isSyncing: false, pendingChanges: 0 })
      return
    }
  }

  updateStatus({ isSyncing: true })
  const done: string[] = []

  for (const item of queue) {
    try {
      const mapping = TABLE_MAPPINGS.find(m => m.table === item.table)
      const pkCol = mapping?.pkField ?? 'id'
      if (item.op === 'UPSERT') {
        // Sanitize row: fix stale column names for shipments
        const row = { ...item.data }
        if (item.table === 'shipments') {
          if (_shipmentDbColumn === 'is_closed') {
            if ('is_active' in row) {
              row.is_closed = !row.is_active
              delete row.is_active
            }
          } else {
            if ('is_closed' in row) {
              row.is_active = !row.is_closed
              delete row.is_closed
            }
          }
        }
        const { error } = await supabase!.from(item.table).upsert(row, { onConflict: pkCol })
        if (error) throw error
      } else {
        const { error } = await supabase!.from(item.table).delete().eq(pkCol, item.pk)
        if (error) throw error
      }
      done.push(item.id)
    } catch (e) {
      console.warn(`[sync] flush failed ${item.table}/${item.pk}:`, e)
      // Increment retry counter
      item.retries = (item.retries ?? 0) + 1
    }
  }

  const remaining = queue.filter(i => !done.includes(i.id))
  saveQueue(remaining)
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString(), pendingChanges: remaining.length })

  if (done.length > 0) {
    addToast('success', `✅ تم مزامنة ${done.length} تعديل محلي`)
  }
  if (remaining.length > 0) {
    addToast('error', `⚠️ فشل مزامنة ${remaining.length} تعديل`)
  }
}

// ─── Echo Suppression ──────────────────────────────────────────────

const recentWrites = new Map<string, number>() // "table:pk" → timestamp
const ECHO_TTL = 3000

function markWritten(table: string, pk: string) {
  recentWrites.set(`${table}:${pk}`, Date.now())
  if (recentWrites.size > 500) {
    const now = Date.now()
    for (const [key, ts] of recentWrites) {
      if (now - ts > ECHO_TTL) recentWrites.delete(key)
    }
  }
}

function isEcho(table: string, pk: string): boolean {
  const ts = recentWrites.get(`${table}:${pk}`)
  if (!ts) return false
  if (Date.now() - ts < ECHO_TTL) return true
  recentWrites.delete(`${table}:${pk}`)
  return false
}

// ─── Write API: Supabase First ────────────────────────────────────
// Every write goes to Supabase FIRST. Only on success do we update local state.
// If offline, queue + toast warning.

export async function upsertRecord(stateKey: keyof AppState, item: any): Promise<boolean> {
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false

  // Ensure we know which DB column to use for shipments before building the row
  if (mapping.table === 'shipments' && !_shipmentDbColumn) await probeShipmentColumn()

  const row = mapping.toRow(item)
  const pkField = mapping.pkField ?? 'id'
  const pk = String(row[pkField])

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    enqueue({ table: mapping.table, pk, op: 'UPSERT', data: row })
    addToast('info', '📱 أنت غير متصل — سيتم حفظ التعديل عند عودة الاتصال')
    return false
  }

  try {
    if (mapping.table === 'shipments') console.log('[sync] shipment row:', JSON.stringify(row), 'dbCol:', _shipmentDbColumn)
    const { error } = await supabase!.from(mapping.table).upsert(row, { onConflict: pkField })
    if (error) throw error
    markWritten(mapping.table, pk)
    showSaveSuccess()
    return true
  } catch (e: any) {
    const msg = e?.message || e?.details || JSON.stringify(e)
    console.error(`[sync] UPSERT ${mapping.table}/${pk} failed:`, msg)
    enqueue({ table: mapping.table, pk, op: 'UPSERT', data: row })
    addToast('error', `❌ فشل الحفظ: ${mapping.table} — ${msg}`)
    return false
  }
}

export async function upsertRecords(stateKey: keyof AppState, items: any[]): Promise<boolean> {
  if (items.length === 0) return true
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false

  // Ensure we know which DB column to use for shipments before building rows
  if (mapping.table === 'shipments' && !_shipmentDbColumn) await probeShipmentColumn()

  const rows = items.map(mapping.toRow)
  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    rows.forEach(row => {
      const pk = String(row[pkField])
      enqueue({ table: mapping.table, pk, op: 'UPSERT', data: row })
    })
    addToast('info', '📱 أنت غير متصل — سيتم حفظ التعديلات عند عودة الاتصال')
    return false
  }

  try {
    if (mapping.table === 'shipments') console.log('[sync] shipment rows:', JSON.stringify(rows), 'dbCol:', _shipmentDbColumn)
    const { error } = await supabase!.from(mapping.table).upsert(rows, { onConflict: pkField })
    if (error) throw error
    rows.forEach(row => markWritten(mapping.table, String(row[pkField])))
    showSaveSuccess()
    return true
  } catch (e: any) {
    const msg = e?.message || e?.details || JSON.stringify(e)
    console.error(`[sync] batch UPSERT ${mapping.table} failed:`, msg)
    rows.forEach(row => {
      const pk = String(row[pkField])
      enqueue({ table: mapping.table, pk, op: 'UPSERT', data: row })
    })
    addToast('error', `❌ فشل الحفظ: ${mapping.table} — ${msg}`)
    return false
  }
}

export async function deleteRecord(stateKey: keyof AppState, pk: string): Promise<boolean> {
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false

  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
    addToast('info', '📱 أنت غير متصل — سيتم تنفيذ الحذف عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).delete().eq(pkField, pk)
    if (error) throw error
    markWritten(mapping.table, pk)
    addToast('success', '✅ تم الحذف')
    return true
  } catch (e: any) {
    console.error(`[sync] DELETE ${mapping.table}/${pk} failed:`, e?.message || e)
    enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
    addToast('error', '❌ فشل الحذف — سيُحاول مرة أخرى تلقائياً')
    return false
  }
}

export async function deleteRecords(stateKey: keyof AppState, pks: string[]): Promise<boolean> {
  if (pks.length === 0) return true
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false
  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    pks.forEach(pk => enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} }))
    addToast('info', '📱 أنت غير متصل — سيتم تنفيذ الحذف عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).delete().in(pkField, pks)
    if (error) throw error
    pks.forEach(pk => markWritten(mapping.table, pk))
    addToast('success', '✅ تم الحذف')
    return true
  } catch (e: any) {
    console.error(`[sync] batch DELETE ${mapping.table} failed:`, e?.message || e)
    pks.forEach(pk => enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} }))
    addToast('error', '❌ فشل الحذف — سيُحاول مرة أخرى تلقائياً')
    return false
  }
}

// Scalar settings (language, exchangeRate, etc.)
export async function pushScalarSettings(state: AppState): Promise<void> {
  if (!syncStatus.isOnline || !isSupabaseConfigured()) return
  try {
    const { error } = await supabase!.from('app_settings').upsert({
      id: 'singleton',
      language: state.language,
      user_role: state.userRole,
      exchange_rate: state.exchangeRate,
      management_fee_percent: state.managementFeePercent,
      management_fee_recipient_id: state.managementFeeRecipientId,
    }, { onConflict: 'id' })
    if (error) console.warn('[sync] scalar push failed:', error)
    else markWritten('app_settings', 'singleton')
  } catch (e) {
    console.warn('[sync] scalar push error:', e)
  }
}

// ─── Pull (Supabase → local) — full download ──────────────────────

export async function pullFromCloud(
  applyToState: (updates: Partial<AppState>) => void
): Promise<boolean> {
  if (!isSupabaseConfigured() || !navigator.onLine) return false

  updateStatus({ isSyncing: true })

  const results = await Promise.allSettled([
    ...TABLE_MAPPINGS.map(async (mapping) => {
      const { data, error } = await supabase!.from(mapping.table).select('*')
      if (error) { console.warn(`[sync] pull ${mapping.table}:`, error); return null }
      if (!data) return null
      return { mapping, data }
    }),
    (async () => {
      const { data } = await supabase!.from('app_settings').select('*').eq('id', 'singleton').single()
      return data ? { isScalar: true as const, data } : null
    })(),
  ])

  const bulkUpdate: Partial<AppState> = {}
  let pulledAny = false

  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue
    pulledAny = true

    if ('isScalar' in result.value) {
      const data = result.value.data
      bulkUpdate.language = data.language ?? 'ar'
      bulkUpdate.userRole = data.user_role ?? 'manager'
      bulkUpdate.exchangeRate = data.exchange_rate ?? 1
      bulkUpdate.managementFeePercent = data.management_fee_percent ?? 0
      bulkUpdate.managementFeeRecipientId = data.management_fee_recipient_id ?? '1'
    } else {
      const { mapping, data } = result.value
      const mapped = data.map(mapping.fromRow)
      if (mapping.stateKey === 'settlementResults') {
        const record: Record<string, any> = {}
        for (const sr of mapped) record[sr.shipmentId] = sr
        ;(bulkUpdate as any)[mapping.stateKey] = record
      } else {
        ;(bulkUpdate as any)[mapping.stateKey] = mapped
      }
    }
  }

  if (pulledAny) {
    applyToState(bulkUpdate)
  }
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString() })
  return pulledAny
}

// ─── Full Push (for migration/manual sync) ────────────────────────

export async function fullPushToCloud(state: AppState): Promise<void> {
  if (!isSupabaseConfigured() || !navigator.onLine) return
  updateStatus({ isSyncing: true })

  for (const mapping of TABLE_MAPPINGS) {
    try {
      let items: any[]
      if (mapping.stateKey === 'settlementResults') {
        items = Object.values(state.settlementResults || {})
      } else {
        items = (state as any)[mapping.stateKey] ?? []
      }
      if (!Array.isArray(items) || items.length === 0) continue
      const rows = items.map(mapping.toRow)
      const pkCol = mapping.pkField ?? 'id'
      const { error } = await supabase!.from(mapping.table).upsert(rows, { onConflict: pkCol })
      if (error) console.warn(`[sync] fullPush ${mapping.table}:`, error)
    } catch (e) {
      console.warn(`[sync] fullPush ${mapping.table} error:`, e)
    }
  }

  await flushQueue()
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString() })
}

// ─── Realtime Subscriptions ───────────────────────────────────────

const REALTIME_BATCH_MS = 50
let _realtimePatches: Array<(s: AppState) => Partial<AppState>> = []
let _realtimeBatchTimer: ReturnType<typeof setTimeout> | null = null

function queueRealtimePatch(
  patchFn: (s: AppState) => Partial<AppState>,
  applyToState: (updates: Partial<AppState>) => void,
  getState: () => AppState
) {
  _realtimePatches.push(patchFn)
  if (_realtimeBatchTimer) clearTimeout(_realtimeBatchTimer)
  _realtimeBatchTimer = setTimeout(() => {
    _realtimeBatchTimer = null
    const patches = _realtimePatches.splice(0)
    if (patches.length === 0) return
    const base = getState()
    let merged: AppState = base
    for (const patch of patches) merged = { ...merged, ...patch(merged) }
    const diff: Partial<AppState> = {}
    for (const k of Object.keys(merged) as (keyof AppState)[]) {
      if ((merged as any)[k] !== (base as any)[k]) (diff as any)[k] = (merged as any)[k]
    }
    if (Object.keys(diff).length > 0) applyToState(diff)
  }, REALTIME_BATCH_MS)
}

export function setupRealtimeSync(
  applyToState: (updates: Partial<AppState>) => void,
  getState: () => AppState
): () => void {
  if (!isSupabaseConfigured()) return () => {}

  let channel: ReturnType<typeof supabase.channel> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let disposed = false

  function createChannel() {
    if (disposed) return
    channel = supabase!.channel('astrida_realtime')

    for (const mapping of TABLE_MAPPINGS) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: mapping.table },
        (payload) => {
          const key = mapping.stateKey
          const pkField = mapping.pkField ?? 'id'
          const pkGetter = (item: any) => pkField === 'shipment_id' ? item.shipmentId : item.id

          if (payload.eventType === 'DELETE') {
            const deletedPk = (payload.old as any)?.[pkField]
            if (!deletedPk || isEcho(mapping.table, String(deletedPk))) return
            console.log(`[realtime] DELETE ${mapping.table}/${deletedPk}`)
            queueRealtimePatch(s => {
              if (key === 'settlementResults') {
                const record = { ...(s.settlementResults || {}) }
                delete record[deletedPk]
                return { settlementResults: record }
              }
              const arr = ((s as any)[key] || []) as any[]
              return { [key]: arr.filter((i: any) => pkGetter(i) !== deletedPk) } as any
            }, applyToState, getState)
            return
          }

          // INSERT or UPDATE
          const newItem = mapping.fromRow(payload.new)
          const pk = pkGetter(newItem)
          if (isEcho(mapping.table, String(pk))) return
          console.log(`[realtime] ${payload.eventType} ${mapping.table}/${pk}`)

          queueRealtimePatch(s => {
            if (key === 'settlementResults') {
              return { settlementResults: { ...(s.settlementResults || {}), [newItem.shipmentId]: newItem } }
            }
            const arr = ((s as any)[key] || []) as any[]
            const idx = arr.findIndex((i: any) => pkGetter(i) === pk)
            if (idx === -1) return { [key]: [...arr, newItem] } as any
            const updated = [...arr]
            updated[idx] = newItem
            return { [key]: updated } as any
          }, applyToState, getState)
        }
      )
    }

    // app_settings
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      (payload) => {
        if (payload.eventType === 'DELETE') return
        const data = payload.new as any
        if (!data || data.id !== 'singleton') return
        if (isEcho('app_settings', 'singleton')) return
        applyToState({
          language: data.language ?? 'ar',
          userRole: data.user_role ?? 'manager',
          exchangeRate: data.exchange_rate ?? 1,
          managementFeePercent: data.management_fee_percent ?? 0,
          managementFeeRecipientId: data.management_fee_recipient_id ?? '1',
        })
      }
    )

    channel.subscribe((status) => {
      console.log(`[realtime] channel: ${status}`)
      if (status === 'SUBSCRIBED') reconnectAttempts = 0
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') scheduleReconnect()
    })
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000)
    reconnectAttempts++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      teardown()
      createChannel()
    }, delay)
  }

  function teardown() {
    if (channel) {
      try { supabase!.removeChannel(channel) } catch {}
      channel = null
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && !disposed) {
      console.log('[realtime] app visible — reconnect + pull')
      teardown()
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      reconnectAttempts = 0
      createChannel()
      pullFromCloud(applyToState).catch(() => {})
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  createChannel()

  return () => {
    disposed = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    teardown()
  }
}

// ─── Fetch users (for login) ─────────────────────────────────────

export async function fetchUsersFromCloud(): Promise<import('../types').User[] | null> {
  if (!isSupabaseConfigured() || !navigator.onLine) return null
  try {
    const mapping = TABLE_MAPPINGS.find(m => m.stateKey === 'users')!
    const { data, error } = await supabase!.from(mapping.table).select('*')
    if (error || !data || data.length === 0) return null
    return data.map(mapping.fromRow)
  } catch { return null }
}

// ─── Backward-compatible exports (used by store) ─────────────────

export const clearSyncState = (_opts?: { clearQueue?: boolean; clearCache?: boolean }) => {
  localStorage.removeItem(QUEUE_KEY)
  updateStatus({ pendingChanges: 0 })
}
// No-ops kept for API compatibility
export const markCloudReady = () => {}
export const onStateChange = (_state: AppState) => {}
export const requestImmediatePush = () => {}
export const pushToCloud = flushQueue
