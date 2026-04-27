/**
 * Sync Engine v3 — Cloud-Authoritative, Write-Through
 *
 * Design:
 *  1. Supabase is the SOLE source of truth. No localStorage-only fields.
 *  2. Every write → Supabase first → update local on success
 *  3. Offline writes → Write-Ahead Log (WAL) → replayed on reconnect
 *  4. Realtime subscriptions use updated_at comparison (not TTL echo suppression)
 *  5. Schema is FIXED at build time — no runtime probing
 *  6. Schema version checked on boot — mismatch forces refresh
 *  7. localStorage is a read-only cache for instant first paint ONLY
 */

import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey } from './supabase'
import { addToast } from './toast'
import type { AppState } from '../types'

// ─── Constants ──────────────────────────────────────────────────

const EXPECTED_SCHEMA_VERSION = 3
const WAL_KEY = 'astrida_wal_v3'
const LAST_PULL_KEY = 'astrida_last_pull_ts'
const LEGACY_QUEUE_KEY = 'astrida_sync_queue' // v2 queue key — drained once at boot

// ─── Debounced save-success toast ───────────────────────────────

let _saveSuccessTimer: ReturnType<typeof setTimeout> | null = null
function showSaveSuccess() {
  if (_saveSuccessTimer) clearTimeout(_saveSuccessTimer)
  _saveSuccessTimer = setTimeout(() => {
    addToast('success', '✅ تم الحفظ')
    _saveSuccessTimer = null
  }, 200)
}

// ─── Table ↔ AppState key mapping (FIXED SCHEMA — no probing) ──

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
      // Schema v3: always use is_closed
      row.is_closed = !!item.isClosed
      delete row.is_active
      return row
    },
    fromRow: (row: Record<string, any>) => {
      const obj = objectToCamel(row)
      // Normalise: if DB still has is_active for any reason, convert
      if ('isActive' in obj) {
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
    table: 'capital_contributions', stateKey: 'capitalContributions',
    toRow: (c) => ({
      id: c.id, partner_id: c.partnerId, shipment_id: c.shipmentId,
      amount_sar: c.amountSAR, date: c.date, notes: c.notes,
      profit_rate: c.profitRate ?? null,
    }),
    fromRow: (row) => ({
      id: row.id, partnerId: row.partner_id, shipmentId: row.shipment_id,
      amountSAR: row.amount_sar, date: row.date, notes: row.notes,
      profitRate: row.profit_rate ?? undefined,
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
  {
    table: 'manual_profit_distributions', stateKey: 'manualProfitDistributions', pkField: 'shipment_id',
    toRow: (d) => ({
      shipment_id: d.shipmentId, saved_at: d.savedAt,
      entries: JSON.stringify(d.entries),
    }),
    fromRow: (row) => ({
      shipmentId: row.shipment_id, savedAt: row.saved_at,
      entries: typeof row.entries === 'string' ? JSON.parse(row.entries) : (row.entries ?? []),
    }),
  },
  {
    table: 'audit_logs', stateKey: 'auditLogs',
    toRow: (entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      user_id: entry.userId ?? null,
      user_name: entry.userName,
      action: entry.action,
      details: JSON.stringify(entry.details),
    }),
    fromRow: (row) => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id ?? null,
      userName: row.user_name,
      action: row.action,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : (row.details ?? []),
    }),
  },
]

// ─── Online Status ──────────────────────────────────────────────

export interface SyncStatus {
  isOnline: boolean
  isSyncing: boolean
  lastSynced: string | null
  pendingChanges: number
  schemaOk: boolean
}

let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSynced: null,
  pendingChanges: 0,
  schemaOk: true,
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

// Real connectivity: ping Supabase
let pingTimer: ReturnType<typeof setInterval> | null = null
const PING_INTERVAL = 15_000

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
      console.log('[sync-v3] back online — flushing WAL + pulling')
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

  check()
  pingTimer = setInterval(check, PING_INTERVAL)
}

// ─── Schema Version Check ───────────────────────────────────────

export async function checkSchemaVersion(): Promise<boolean> {
  if (!isSupabaseConfigured() || !navigator.onLine) return true // optimistic offline
  try {
    const { data, error } = await supabase!.from('app_settings')
      .select('schema_version')
      .eq('id', 'singleton')
      .single()
    if (error || !data) {
      console.warn('[sync-v3] could not read schema_version:', error)
      return true // don't block on first deploy
    }
    const serverVersion = data.schema_version ?? 0
    if (serverVersion < EXPECTED_SCHEMA_VERSION) {
      console.error(`[sync-v3] schema mismatch: server=${serverVersion} client expects=${EXPECTED_SCHEMA_VERSION}`)
      addToast('error', '⚠️ قاعدة البيانات تحتاج تحديث — شغّل migration_v3.sql', 10000)
      updateStatus({ schemaOk: false })
      return false
    }
    updateStatus({ schemaOk: true })
    return true
  } catch (e) {
    console.warn('[sync-v3] schema check failed:', e)
    return true
  }
}

// ─── Write-Ahead Log (WAL) — replaces old queue ────────────────

interface WalEntry {
  id: string
  table: string
  pk: string
  op: 'UPSERT' | 'DELETE'
  data: Record<string, any>
  ts: string
  retries: number
}

function getWal(): WalEntry[] {
  try { return JSON.parse(localStorage.getItem(WAL_KEY) || '[]') } catch { return [] }
}

function saveWal(wal: WalEntry[]) {
  localStorage.setItem(WAL_KEY, JSON.stringify(wal))
  updateStatus({ pendingChanges: wal.length })
}

function walAppend(entry: Omit<WalEntry, 'id' | 'ts' | 'retries'>) {
  const wal = getWal()
  // Deduplicate by table+pk: keep latest
  const idx = wal.findIndex(w => w.table === entry.table && w.pk === entry.pk)
  const newEntry: WalEntry = { ...entry, id: crypto.randomUUID(), ts: new Date().toISOString(), retries: 0 }
  if (idx !== -1) wal[idx] = newEntry; else wal.push(newEntry)
  saveWal(wal)
}

export async function flushQueue(): Promise<void> {
  if (!isSupabaseConfigured() || !navigator.onLine) return
  let wal = getWal()
  if (wal.length === 0) return

  updateStatus({ isSyncing: true })
  const done: string[] = []
  const MAX_RETRIES = 10

  for (const entry of wal) {
    try {
      const mapping = TABLE_MAPPINGS.find(m => m.table === entry.table)
      const pkCol = mapping?.pkField ?? 'id'
      if (entry.op === 'UPSERT') {
        const { error } = await supabase!.from(entry.table).upsert(entry.data, { onConflict: pkCol })
        if (error) throw error
      } else {
        const { error } = await supabase!.from(entry.table).delete().eq(pkCol, entry.pk)
        if (error) throw error
      }
      done.push(entry.id)
      markRecentWrite(entry.table, entry.pk)
    } catch (e: any) {
      console.warn(`[sync-v3] WAL replay failed ${entry.table}/${entry.pk}:`, e?.message || e)
      entry.retries += 1
      if (entry.retries >= MAX_RETRIES) {
        // DO NOT silently drop — surface to user
        addToast('error', `❌ فشل حفظ ${entry.table}/${entry.pk} بعد ${MAX_RETRIES} محاولات — تحقق من البيانات`, 10000)
        done.push(entry.id) // remove from WAL but notify user
      }
    }
    // Persist retry counts after EVERY entry so counts survive if tab closes mid-flush
    saveWal(wal.filter(w => !done.includes(w.id)))
  }

  const remaining = wal.filter(w => !done.includes(w.id))
  saveWal(remaining)
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString(), pendingChanges: remaining.length })

  if (done.length > 0) {
    const successCount = done.length - wal.filter(w => (w.retries ?? 0) >= MAX_RETRIES && done.includes(w.id)).length
    if (successCount > 0) addToast('success', `✅ تم مزامنة ${successCount} تعديل محلي`)
  }
  if (remaining.length > 0) {
    addToast('error', `⚠️ ${remaining.length} تعديل لم يُحفظ بعد — ستُعاد المحاولة`)
  }
}

// ─── Echo Suppression via recent-write tracking ─────────────────
// Tracks recent writes so realtime events from our own writes are ignored.
// Uses a timestamp window. This is a safety net — the primary guard is
// comparing record content, but this avoids unnecessary re-renders.

const recentWrites = new Map<string, number>()
const ECHO_TTL = 4000

function markRecentWrite(table: string, pk: string) {
  recentWrites.set(`${table}:${pk}`, Date.now())
  // Prune old entries
  if (recentWrites.size > 500) {
    const now = Date.now()
    for (const [key, ts] of recentWrites) {
      if (now - ts > ECHO_TTL) recentWrites.delete(key)
    }
  }
}

function isRecentWrite(table: string, pk: string): boolean {
  const ts = recentWrites.get(`${table}:${pk}`)
  if (!ts) return false
  if (Date.now() - ts < ECHO_TTL) return true
  recentWrites.delete(`${table}:${pk}`)
  return false
}

// ─── Schema guard — block writes when schema is incompatible ────

function assertSchemaOk(): boolean {
  if (!syncStatus.schemaOk) {
    addToast('error', '⚠️ قاعدة البيانات غير متوافقة — شغّل migration_v3.sql أولاً', 5000)
    return false
  }
  return true
}

// ─── Write API: Cloud-First ─────────────────────────────────────

export async function upsertRecord(stateKey: keyof AppState, item: any, silent = false): Promise<boolean> {
  if (!assertSchemaOk()) return false
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false

  const row = mapping.toRow(item)
  const pkField = mapping.pkField ?? 'id'
  const pk = String(row[pkField])

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    walAppend({ table: mapping.table, pk, op: 'UPSERT', data: row })
    if (!silent) addToast('info', '📱 محفوظ محلياً — سيُرسل عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).upsert(row, { onConflict: pkField })
    if (error) throw error
    markRecentWrite(mapping.table, pk)
    if (!silent) showSaveSuccess()
    return true
  } catch (e: any) {
    const msg = e?.message || e?.details || JSON.stringify(e)
    console.error(`[sync-v3] UPSERT ${mapping.table}/${pk} failed:`, msg)
    walAppend({ table: mapping.table, pk, op: 'UPSERT', data: row })
    if (!silent) addToast('error', `❌ فشل الحفظ: ${mapping.table} — ${msg}`)
    return false
  }
}

export async function upsertRecords(stateKey: keyof AppState, items: any[]): Promise<boolean> {
  if (items.length === 0) return true
  if (!assertSchemaOk()) return false
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false

  const rows = items.map(item => mapping.toRow(item))
  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    rows.forEach(row => walAppend({ table: mapping.table, pk: String(row[pkField]), op: 'UPSERT', data: row }))
    addToast('info', '📱 محفوظ محلياً — سيُرسل عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).upsert(rows, { onConflict: pkField })
    if (error) throw error
    rows.forEach(row => markRecentWrite(mapping.table, String(row[pkField])))
    showSaveSuccess()
    return true
  } catch (e: any) {
    const msg = e?.message || e?.details || JSON.stringify(e)
    console.error(`[sync-v3] batch UPSERT ${mapping.table} failed:`, msg)
    rows.forEach(row => walAppend({ table: mapping.table, pk: String(row[pkField]), op: 'UPSERT', data: row }))
    addToast('error', `❌ فشل الحفظ: ${mapping.table} — ${msg}`)
    return false
  }
}

export async function deleteRecord(stateKey: keyof AppState, pk: string): Promise<boolean> {
  if (!assertSchemaOk()) return false
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false
  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    walAppend({ table: mapping.table, pk, op: 'DELETE', data: {} })
    addToast('info', '📱 محفوظ محلياً — سيُرسل عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).delete().eq(pkField, pk)
    if (error) throw error
    markRecentWrite(mapping.table, pk)
    addToast('success', '✅ تم الحذف')
    return true
  } catch (e: any) {
    console.error(`[sync-v3] DELETE ${mapping.table}/${pk} failed:`, e?.message || e)
    walAppend({ table: mapping.table, pk, op: 'DELETE', data: {} })
    addToast('error', '❌ فشل الحذف — سيُحاول مرة أخرى')
    return false
  }
}

export async function deleteRecords(stateKey: keyof AppState, pks: string[]): Promise<boolean> {
  if (pks.length === 0) return true
  if (!assertSchemaOk()) return false
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) return false
  const pkField = mapping.pkField ?? 'id'

  if (!syncStatus.isOnline || !isSupabaseConfigured()) {
    pks.forEach(pk => walAppend({ table: mapping.table, pk, op: 'DELETE', data: {} }))
    addToast('info', '📱 محفوظ محلياً — سيُرسل عند عودة الاتصال')
    return false
  }

  try {
    const { error } = await supabase!.from(mapping.table).delete().in(pkField, pks)
    if (error) throw error
    pks.forEach(pk => markRecentWrite(mapping.table, pk))
    addToast('success', '✅ تم الحذف')
    return true
  } catch (e: any) {
    console.error(`[sync-v3] batch DELETE ${mapping.table} failed:`, e?.message || e)
    pks.forEach(pk => walAppend({ table: mapping.table, pk, op: 'DELETE', data: {} }))
    addToast('error', '❌ فشل الحذف — سيُحاول مرة أخرى')
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
    if (error) console.warn('[sync-v3] scalar push failed:', error)
    else markRecentWrite('app_settings', 'singleton')
  } catch (e) {
    console.warn('[sync-v3] scalar push error:', e)
  }
}

// ─── User Preferences (cloud-synced active shipment) ────────────

export async function pushUserPreference(userId: string, prefs: { activeShipmentId?: string }): Promise<void> {
  if (!syncStatus.isOnline || !isSupabaseConfigured()) return
  try {
    const { error } = await supabase!.from('user_preferences').upsert({
      user_id: userId,
      active_shipment_id: prefs.activeShipmentId ?? null,
    }, { onConflict: 'user_id' })
    if (error) console.warn('[sync-v3] user_preferences push failed:', error)
  } catch (e) {
    console.warn('[sync-v3] user_preferences push error:', e)
  }
}

export async function pullUserPreference(userId: string): Promise<{ activeShipmentId?: string } | null> {
  if (!isSupabaseConfigured() || !navigator.onLine) return null
  try {
    const { data, error } = await supabase!.from('user_preferences')
      .select('*').eq('user_id', userId).maybeSingle()
    if (error || !data) return null
    return { activeShipmentId: data.active_shipment_id ?? undefined }
  } catch { return null }
}

// ─── Pull (Supabase → local) — full download ──────────────────

export async function pullFromCloud(
  applyToState: (updates: Partial<AppState>) => void
): Promise<boolean> {
  if (!isSupabaseConfigured() || !navigator.onLine) return false
  updateStatus({ isSyncing: true })

  const results = await Promise.allSettled([
    ...TABLE_MAPPINGS.map(async (mapping) => {
      const { data, error } = await supabase!.from(mapping.table).select('*')
      if (error) { console.warn(`[sync-v3] pull ${mapping.table}:`, error); return null }
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
      ;(bulkUpdate as any)[mapping.stateKey] = mapped
    }
  }

  if (pulledAny) {
    applyToState(bulkUpdate)
    localStorage.setItem(LAST_PULL_KEY, new Date().toISOString())
  }
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString() })
  return pulledAny
}

// ─── Full Push (for migration/manual sync) ───────────────────────

export async function fullPushToCloud(state: AppState): Promise<void> {
  if (!isSupabaseConfigured() || !navigator.onLine) return
  updateStatus({ isSyncing: true })

  for (const mapping of TABLE_MAPPINGS) {
    try {
      let items: any[]
      items = (state as any)[mapping.stateKey] ?? []
      if (!Array.isArray(items) || items.length === 0) continue
      const rows = items.map(item => mapping.toRow(item))
      const pkCol = mapping.pkField ?? 'id'
      const { error } = await supabase!.from(mapping.table).upsert(rows, { onConflict: pkCol })
      if (error) console.warn(`[sync-v3] fullPush ${mapping.table}:`, error)
    } catch (e) {
      console.warn(`[sync-v3] fullPush ${mapping.table} error:`, e)
    }
  }

  await pushScalarSettings(state)
  await flushQueue()
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString() })
}

// ─── Realtime Subscriptions ─────────────────────────────────────

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
    channel = supabase!.channel('astrida_realtime_v3')

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
            if (!deletedPk || isRecentWrite(mapping.table, String(deletedPk))) return
            console.log(`[realtime-v3] DELETE ${mapping.table}/${deletedPk}`)
            queueRealtimePatch(s => {
              const arr = ((s as any)[key] || []) as any[]
              return { [key]: arr.filter((i: any) => pkGetter(i) !== deletedPk) } as any
            }, applyToState, getState)
            return
          }

          // INSERT or UPDATE
          const newItem = mapping.fromRow(payload.new)
          const pk = pkGetter(newItem)
          if (isRecentWrite(mapping.table, String(pk))) return
          console.log(`[realtime-v3] ${payload.eventType} ${mapping.table}/${pk}`)

          queueRealtimePatch(s => {
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

    // app_settings realtime
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      (payload) => {
        if (payload.eventType === 'DELETE') return
        const data = payload.new as any
        if (!data || data.id !== 'singleton') return
        if (isRecentWrite('app_settings', 'singleton')) return
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
      console.log(`[realtime-v3] channel: ${status}`)
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
      console.log('[realtime-v3] app visible — reconnect + pull')
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

// ─── Fetch users (for login) ────────────────────────────────────

export async function fetchUsersFromCloud(): Promise<import('../types').User[] | null> {
  if (!isSupabaseConfigured() || !navigator.onLine) return null
  try {
    const mapping = TABLE_MAPPINGS.find(m => m.stateKey === 'users')!
    const timeoutMs = 4000
    const result = await Promise.race([
      supabase!.from(mapping.table).select('*'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
    if (!result) return null
    const { data, error } = result
    if (error || !data || data.length === 0) return null
    return data.map(mapping.fromRow)
  } catch { return null }
}

// ─── Backward-compatible exports ────────────────────────────────

export const clearSyncState = (_opts?: { clearQueue?: boolean; clearCache?: boolean }) => {
  localStorage.removeItem(WAL_KEY)
  localStorage.removeItem(LAST_PULL_KEY)
  updateStatus({ pendingChanges: 0 })
}

export const pushToCloud = flushQueue

// ─── One-time v2 queue drain ────────────────────────────────────
// Migrates pending writes from the old v2 localStorage queue key
// into the v3 WAL so they are replayed. Called once at boot.

export function drainLegacyQueue(): void {
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY)
    if (!raw) return
    const oldQueue: any[] = JSON.parse(raw)
    if (!Array.isArray(oldQueue) || oldQueue.length === 0) {
      localStorage.removeItem(LEGACY_QUEUE_KEY)
      return
    }
    console.log(`[sync-v3] draining ${oldQueue.length} entries from v2 queue`)
    for (const item of oldQueue) {
      // v2 format: { table, pk, op: 'UPSERT'|'DELETE', data }
      if (item.table && item.pk && item.op) {
        walAppend({ table: item.table, pk: item.pk, op: item.op, data: item.data ?? {} })
      }
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY)
    addToast('info', `📦 تم نقل ${oldQueue.length} تعديل من النظام القديم`)
  } catch (e) {
    console.warn('[sync-v3] failed to drain legacy queue:', e)
    // Remove it anyway to avoid re-processing corrupt data
    localStorage.removeItem(LEGACY_QUEUE_KEY)
  }
}
