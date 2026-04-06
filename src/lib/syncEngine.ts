/**
 * Sync Engine — Cloud-First with Supabase
 *
 * Strategy:
 *  - Online: Supabase is the primary store → cache to localStorage
 *  - Offline: localStorage + queue → sync when back online
 *  - On app init: pull everything from Supabase first
 *  - On state change: write to Supabase first, then update localStorage cache
 *  - Realtime subscriptions keep local state in sync with remote changes
 */

import { supabase, isSupabaseConfigured } from './supabase'
import type { AppState } from '../types'

// ─── Table ↔ AppState key mapping ─────────────────────────────────

export interface TableMapping {
  table: string          // Supabase table name
  stateKey: keyof AppState
  toRow: (item: any) => Record<string, any>
  fromRow: (row: any) => any
  pkField?: string       // default 'id'
}

const camel2snake = (s: string) =>
  s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase()
const snake2camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

const objectToSnake = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    out[camel2snake(k)] = v
  }
  return out
}

const objectToCamel = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'updated_at') continue // strip sync metadata
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
  { table: 'shipments', stateKey: 'shipments', toRow: objectToSnake, fromRow: objectToCamel },
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
  {
    table: 'inventory_transactions', stateKey: 'inventoryTransactions',
    toRow: objectToSnake, fromRow: objectToCamel,
  },
  {
    table: 'invoices', stateKey: 'invoices',
    toRow: (inv) => ({
      ...objectToSnake(inv),
      lines: JSON.stringify(inv.lines),
    }),
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
    table: 'saved_settlements', stateKey: 'savedSettlements',
    pkField: 'shipment_id',
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
    table: 'settlement_results', stateKey: 'settlementResults',
    pkField: 'shipment_id',
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

// ─── Last-sync timestamp for incremental pulls ───────────────────

export const LAST_SYNC_KEY = 'astrida_last_sync_ts'
export const QUEUE_KEY_EXPORT = 'astrida_sync_queue'
export const STATE_CACHE_KEY = 'astreda_erp_state'

/**
 * Tables that are always pulled in full regardless of incremental-sync mode.
 * Add tables here when their rows may lack reliable `updated_at` tracking.
 */
export const ALWAYS_FULL_PULL_TABLES: readonly string[] = ['customers']

function getLastSyncTs(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY)
}

function setLastSyncTs(ts: string) {
  localStorage.setItem(LAST_SYNC_KEY, ts)
}

/**
 * Clear the incremental-sync timestamp, offline queue, and (optionally) the
 * local state cache so the next `pullFromCloud()` performs a full re-fetch.
 */
export const clearSyncState = (options?: { clearQueue?: boolean; clearCache?: boolean }): void => {
  localStorage.removeItem(LAST_SYNC_KEY)
  if (options?.clearQueue) localStorage.removeItem(QUEUE_KEY_EXPORT)
  if (options?.clearCache) localStorage.removeItem(STATE_CACHE_KEY)
  console.log('[sync] sync state cleared — next pull will be a full pull')
}

// ─── Sync Status ──────────────────────────────────────────────────

export interface SyncStatus {
  isOnline: boolean
  pendingChanges: number
  lastSynced: string | null
  isSyncing: boolean
}

let syncStatus: SyncStatus = {
  isOnline: navigator.onLine,
  pendingChanges: 0,
  lastSynced: null,
  isSyncing: false,
}

const listeners = new Set<(s: SyncStatus) => void>()

export const onSyncStatusChange = (cb: (s: SyncStatus) => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

export const getSyncStatus = (): SyncStatus => syncStatus

const updateStatus = (patch: Partial<SyncStatus>) => {
  syncStatus = { ...syncStatus, ...patch }
  listeners.forEach(cb => cb(syncStatus))
}

// ─── Offline Queue ────────────────────────────────────────────────

const QUEUE_KEY = QUEUE_KEY_EXPORT

interface QueueItem {
  id: string
  table: string
  pk: string
  op: 'UPSERT' | 'DELETE'
  data: Record<string, any>
  ts: string
}

const getQueue = (): QueueItem[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}

const saveQueue = (q: QueueItem[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q))
  updateStatus({ pendingChanges: q.length })
}

const enqueue = (item: Omit<QueueItem, 'id' | 'ts'>) => {
  const q = getQueue()
  // Deduplicate: replace existing entry for same table+pk+op
  const idx = q.findIndex(i => i.table === item.table && i.pk === item.pk)
  const entry: QueueItem = { ...item, id: crypto.randomUUID(), ts: new Date().toISOString() }
  if (idx !== -1) q[idx] = entry; else q.push(entry)
  saveQueue(q)
}

// ─── Helper ───────────────────────────────────────────────────────

function getMappingPk(table: string): string {
  const m = TABLE_MAPPINGS.find(t => t.table === table)
  return m?.pkField ?? 'id'
}

// ─── Echo Suppression ────────────────────────────────────────────
// When we write to Supabase, the realtime subscription echoes the
// change back. We suppress those echoes to avoid redundant state
// updates and potential write loops.

const recentWrites = new Map<string, number>() // "table:pk" → timestamp
const ECHO_TTL = 3000 // ignore echoes within 3s of our own write

function markWritten(table: string, pk: string) {
  recentWrites.set(`${table}:${pk}`, Date.now())
  // Cleanup old entries periodically
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

// ─── Flush offline queue (queue → Supabase) ───────────────────────

export const flushQueue = async (): Promise<void> => {
  if (!isSupabaseConfigured() || !navigator.onLine || syncStatus.isSyncing) return
  updateStatus({ isSyncing: true })

  const queue = getQueue()
  const done: string[] = []

  for (const item of queue) {
    try {
      if (item.op === 'UPSERT') {
        const { error } = await supabase!.from(item.table).upsert(item.data, { onConflict: getMappingPk(item.table) })
        if (error) throw error
      } else {
        const pkCol = getMappingPk(item.table)
        const { error } = await supabase!.from(item.table).delete().eq(pkCol, item.pk)
        if (error) throw error
      }
      done.push(item.id)
    } catch (e) {
      console.warn(`[sync] flush failed ${item.table}/${item.pk}:`, e)
    }
  }

  const remaining = queue.filter(i => !done.includes(i.id))
  saveQueue(remaining)
  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString(), pendingChanges: remaining.length })
}

// Keep backward-compatible alias
export const pushToCloud = flushQueue

// ─── Cloud-First Write (state change → Supabase first, fallback queue) ─

/**
 * Accepts the previous and current state and pushes diffs directly to
 * Supabase.  When offline the diffs go into the local queue instead.
 */
const cloudFirstDiff = async (prev: AppState, curr: AppState): Promise<void> => {
  // Process all changed tables in parallel for faster sync
  const tasks = TABLE_MAPPINGS.map(async (mapping) => {
    const key = mapping.stateKey
    const prevVal = key === 'settlementResults' ? prev.settlementResults : (prev as any)[key]
    const currVal = key === 'settlementResults' ? curr.settlementResults : (curr as any)[key]
    if (prevVal === currVal) return // reference equality = no change
    console.log(`[sync] diff detected: ${mapping.table} (${key})`)

    if (key === 'settlementResults') {
      const prevMap = (prevVal || {}) as Record<string, any>
      const currMap = (currVal || {}) as Record<string, any>

      // Batch upserts
      const upsertRows: Record<string, any>[] = []
      const upsertIds: string[] = []
      for (const sid of Object.keys(currMap)) {
        if (prevMap[sid] !== currMap[sid]) {
          upsertRows.push(mapping.toRow(currMap[sid]))
          upsertIds.push(sid)
        }
      }
      if (upsertRows.length > 0) {
        if (navigator.onLine && isSupabaseConfigured()) {
          try {
            const { error } = await supabase!.from(mapping.table).upsert(upsertRows, { onConflict: mapping.pkField ?? 'id' })
            if (error) throw error
            upsertIds.forEach(sid => markWritten(mapping.table, sid))
          } catch {
            upsertRows.forEach((row, i) => enqueue({ table: mapping.table, pk: upsertIds[i], op: 'UPSERT', data: row }))
          }
        } else {
          upsertRows.forEach((row, i) => enqueue({ table: mapping.table, pk: upsertIds[i], op: 'UPSERT', data: row }))
        }
      }

      // Deletes
      for (const sid of Object.keys(prevMap)) {
        if (!(sid in currMap)) {
          if (navigator.onLine && isSupabaseConfigured()) {
            try {
              const { error } = await supabase!.from(mapping.table).delete().eq(mapping.pkField ?? 'shipment_id', sid)
              if (error) throw error
              markWritten(mapping.table, sid)
            } catch { enqueue({ table: mapping.table, pk: sid, op: 'DELETE', data: {} }) }
          } else {
            enqueue({ table: mapping.table, pk: sid, op: 'DELETE', data: {} })
          }
        }
      }
    } else {
      const prevArr = (prevVal || []) as any[]
      const currArr = (currVal || []) as any[]
      const pkField = mapping.pkField ?? 'id'
      const pkGetter = (item: any) => pkField === 'shipment_id' ? item.shipmentId : item.id

      // Batch all upserts into a single call
      const upsertRows: Record<string, any>[] = []
      const upsertPks: string[] = []
      for (const item of currArr) {
        const pk = pkGetter(item)
        const prevItem = prevArr.find(p => pkGetter(p) === pk)
        if (!prevItem || prevItem !== item) {
          upsertRows.push(mapping.toRow(item))
          upsertPks.push(pk)
        }
      }

      if (upsertRows.length > 0) {
        console.log(`[sync] batch UPSERT ${mapping.table}: ${upsertRows.length} rows`)
        if (navigator.onLine && isSupabaseConfigured()) {
          try {
            const { error } = await supabase!.from(mapping.table).upsert(upsertRows, { onConflict: pkField })
            if (error) {
              console.error(`[sync] ❌ batch UPSERT ${mapping.table} failed:`, error.message)
              throw error
            }
            console.log(`[sync] ✅ batch UPSERT ${mapping.table}: ${upsertRows.length} rows OK`)
            upsertPks.forEach(pk => markWritten(mapping.table, pk))
          } catch (e: any) {
            console.error(`[sync] ❌ ${mapping.table} batch catch:`, e?.message || e)
            upsertRows.forEach((row, i) => enqueue({ table: mapping.table, pk: upsertPks[i], op: 'UPSERT', data: row }))
          }
        } else {
          console.log(`[sync] ⏳ offline, queued ${mapping.table}: ${upsertRows.length} rows`)
          upsertRows.forEach((row, i) => enqueue({ table: mapping.table, pk: upsertPks[i], op: 'UPSERT', data: row }))
        }
      }

      // Batch deletes
      const currIds = new Set(currArr.map(pkGetter))
      const deletePks = prevArr.filter(item => !currIds.has(pkGetter(item))).map(pkGetter)
      for (const pk of deletePks) {
        if (navigator.onLine && isSupabaseConfigured()) {
          try {
            const { error } = await supabase!.from(mapping.table).delete().eq(pkField, pk)
            if (error) throw error
            markWritten(mapping.table, pk)
          } catch { enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} }) }
        } else {
          enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
        }
      }
    }
  })

  await Promise.all(tasks)
}

// ─── Scalar settings keys tracked for cloud sync ────────────────────

const SCALAR_KEYS: (keyof AppState)[] = [
  'language', 'userRole', 'exchangeRate',
  'managementFeePercent', 'managementFeeRecipientId',
]

const pushScalarSettings = async (state: AppState): Promise<void> => {
  if (!navigator.onLine || !isSupabaseConfigured()) return
  try {
    const { error } = await supabase!.from('app_settings').upsert({
      id: 'singleton',
      language: state.language,
      user_role: state.userRole,
      exchange_rate: state.exchangeRate,
      management_fee_percent: state.managementFeePercent,
      management_fee_recipient_id: state.managementFeeRecipientId,
    }, { onConflict: 'id' })
    if (error) console.warn('[sync] scalar settings push failed:', error)
    else markWritten('app_settings', 'singleton')
  } catch (e) {
    console.warn('[sync] scalar settings push error:', e)
  }
}

// ─── Debounced auto-push (Cloud-First) ─────────────────────────────
// Batches rapid state changes and flushes after DEBOUNCE_MS of idle time.
// Gate: don't push state changes back to cloud until the initial pull completes.
// This prevents stale localStorage data from overwriting freshly-pulled cloud data.
let cloudReady = false
export const markCloudReady = () => { cloudReady = true }

// debouncedBase tracks the state at the START of the current debounce window.
// When the timer fires we diff base vs latest, then advance the base.

const DEBOUNCE_MS = 100

let debouncedBase: AppState | null = null
let pushTimeout: ReturnType<typeof setTimeout> | null = null

/** Signal that the next state change should push with 0ms debounce (instant). */
let _nextPushImmediate = false
export const requestImmediatePush = () => { _nextPushImmediate = true }

/** Can also be called externally to force-flush immediately. */
export const autoPush = (): void => {
  if (!debouncedBase) return
  scheduleDebouncedPush(debouncedBase, 0)
}

function scheduleDebouncedPush(base: AppState, delayMs: number = DEBOUNCE_MS) {
  if (pushTimeout) clearTimeout(pushTimeout)
  pushTimeout = setTimeout(() => {
    pushTimeout = null
    const curr = debouncedBase
    if (!curr || curr === base) return
    debouncedBase = curr  // advance base for next window
    console.log('[sync] debounced push firing')
    runDiffSerialized(base, curr)
    const scalarChanged = SCALAR_KEYS.some(k => (base as any)[k] !== (curr as any)[k])
    if (scalarChanged) {
      pushScalarSettings(curr).catch((e) => console.warn('[sync] scalar push error:', e))
    }
  }, delayMs)
}

export const onStateChange = (state: AppState) => {
  if (!isSupabaseConfigured()) return
  // Don't push until cloud pull is done — avoids re-uploading stale localStorage
  if (!cloudReady) {
    debouncedBase = state  // keep tracking latest, but don't diff/push
    return
  }

  if (!debouncedBase) {
    debouncedBase = state  // first call: initialise base, nothing to diff yet
    return
  }

  const base = debouncedBase
  debouncedBase = state  // always keep latest so the timer closure sees it
  const delay = _nextPushImmediate ? 0 : DEBOUNCE_MS
  _nextPushImmediate = false
  scheduleDebouncedPush(base, delay)
}

// Serialize diffs so concurrent flushes don't race each other
let diffQueue: Promise<void> = Promise.resolve()
function runDiffSerialized(prev: AppState, curr: AppState) {
  diffQueue = diffQueue.then(() =>
    cloudFirstDiff(prev, curr).then(() => {
      updateStatus({ lastSynced: new Date().toISOString() })
    })
  ).catch((e) => console.error('[sync] diff error:', e))
}

// ─── Pull (Supabase → local) — full table download ────────────────

export const pullFromCloud = async (
  applyToState: (updates: Partial<AppState>) => void
): Promise<boolean> => {
  if (!isSupabaseConfigured() || !navigator.onLine) return false

  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ])

  const lastSync = getLastSyncTs()
  const isIncremental = !!lastSync
  const timeoutMs = isIncremental ? 5000 : 10000

  console.log(`[sync] pull mode: ${isIncremental ? 'incremental since ' + lastSync : 'full'} | lastSyncTs=${lastSync ?? 'none'}`)
  const pullStartTs = new Date().toISOString()

  // Fetch ALL tables in parallel
  const results = await Promise.allSettled([
    ...TABLE_MAPPINGS.map(async (mapping) => {
      let query = supabase!.from(mapping.table).select('*')
      // Incremental: only fetch rows updated since last sync,
      // BUT always do a full pull for tables in ALWAYS_FULL_PULL_TABLES
      // (e.g. customers, which may lack reliable updated_at tracking)
      if (isIncremental && !ALWAYS_FULL_PULL_TABLES.includes(mapping.table)) {
        query = query.gte('updated_at', lastSync)
      }
      const { data, error } = await withTimeout(query, timeoutMs)
      if (error) { console.warn(`[sync] pull ${mapping.table}:`, error); return null }
      if (!data) return null
      if (isIncremental && ALWAYS_FULL_PULL_TABLES.includes(mapping.table)) {
        console.log(`[sync] ${mapping.table}: forced full pull (${data.length} rows)`)
      }
      return { mapping, data, isIncremental }
    }),
    (async () => {
      const { data } = await withTimeout(
        supabase!.from('app_settings').select('*').eq('id', 'singleton').single(),
        timeoutMs
      )
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
      // Debug: log customer count after pull
      if (mapping.table === 'customers') {
        console.log(`[sync] customers pulled: ${mapped.length} rows (mode: ${isIncremental ? 'incremental+forced-full' : 'full'})`)
      }
    }
  }

  if (pulledAny) {
    applyToState(bulkUpdate)
    // Save the timestamp so the next pull is incremental
    setLastSyncTs(pullStartTs)
  }
  updateStatus({ lastSynced: new Date().toISOString() })
  return pulledAny
}

// ─── Full push (overwrite Supabase from local) ────────────────────

export const fullPushToCloud = async (state: AppState): Promise<void> => {
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

  // Push scalar settings
  try {
    await supabase!.from('app_settings').upsert({
      id: 'singleton',
      language: state.language,
      user_role: state.userRole,
      exchange_rate: state.exchangeRate,
      management_fee_percent: state.managementFeePercent,
      management_fee_recipient_id: state.managementFeeRecipientId,
    }, { onConflict: 'id' })
  } catch { /* ignore */ }

  // Also flush the offline queue
  await flushQueue()

  updateStatus({ isSyncing: false, lastSynced: new Date().toISOString() })
}

// ─── Real-time Subscriptions ──────────────────────────────────────

// Batch multiple incoming realtime events into a single setState call.
// Without this, 5 tables updating at once = 5 re-renders of the entire app.
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
    for (const patch of patches) {
      merged = { ...merged, ...patch(merged) }
    }
    // Only send keys that actually changed
    const diff: Partial<AppState> = {}
    for (const k of Object.keys(merged) as (keyof AppState)[]) {
      if ((merged as any)[k] !== (base as any)[k]) {
        (diff as any)[k] = (merged as any)[k]
      }
    }
    if (Object.keys(diff).length > 0) applyToState(diff)
  }, REALTIME_BATCH_MS)
}

export const setupRealtimeSync = (
  applyToState: (updates: Partial<AppState>) => void,
  getState: () => AppState
): (() => void) => {
  if (!isSupabaseConfigured()) return () => {}

  let channel: ReturnType<typeof supabase.channel> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let disposed = false
  const MAX_RECONNECT_DELAY = 30_000 // 30s cap

  function createChannel() {
    if (disposed) return
    const tables = TABLE_MAPPINGS.map(m => m.table)
    console.log('[realtime] subscribing to tables:', tables)

    channel = supabase!.channel('astrida_realtime')

    // Subscribe to all data tables
    for (const mapping of TABLE_MAPPINGS) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: mapping.table },
        (payload) => {
          const key = mapping.stateKey
          const pkField = mapping.pkField ?? 'id'
          const pkGetter = (item: any) => pkField === 'shipment_id' ? item.shipmentId : item.id

          if (payload.eventType === 'DELETE') {
            console.log(`[realtime] DELETE ${mapping.table}`, payload.old)
            const deletedPk = (payload.old as any)?.[pkField]
            if (!deletedPk) {
              console.warn(`[realtime] DELETE ${mapping.table}: no PK in payload.old — ensure REPLICA IDENTITY FULL is set`)
              return
            }
            if (isEcho(mapping.table, String(deletedPk))) return
            console.log(`[realtime] applying DELETE ${mapping.table}/${deletedPk}`)
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

    // Subscribe to app_settings changes (scalar settings like language, exchangeRate)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      (payload) => {
        if (payload.eventType === 'DELETE') return
        const data = payload.new as any
        if (!data || data.id !== 'singleton') return
        if (isEcho('app_settings', 'singleton')) return
        console.log('[realtime] app_settings updated')
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
      console.log(`[realtime] channel status: ${status}`)
      if (status === 'SUBSCRIBED') {
        reconnectAttempts = 0
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        scheduleReconnect()
      }
    })
  }

  function scheduleReconnect() {
    if (disposed || reconnectTimer) return
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
    reconnectAttempts++
    console.log(`[realtime] reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      teardown()
      createChannel()
    }, delay)
  }

  function teardown() {
    if (channel) {
      try { supabase!.removeChannel(channel) } catch { /* ignore */ }
      channel = null
    }
  }

  // When phone wakes from sleep, reconnect + pull fresh data
  function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && !disposed) {
      console.log('[realtime] app became visible — reconnecting + pulling')
      teardown()
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      reconnectAttempts = 0
      createChannel()
      pullFromCloud(applyToState).catch(e => console.warn('[realtime] visibility pull failed:', e))
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

// ─── Direct record helpers (for explicit writes from components) ───

/**
 * Directly upsert a single record to Supabase.
 * Use this for critical writes (e.g. user edits) that must not be lost.
 */
export const upsertRecord = async (stateKey: keyof AppState, item: any): Promise<boolean> => {
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) { console.error(`[sync] no mapping for ${String(stateKey)}`); return false }
  const row = mapping.toRow(item)
  const pkField = mapping.pkField ?? 'id'
  const pk = row[pkField]
  console.log(`[sync] direct UPSERT ${mapping.table}/${pk}`, row)
  if (!navigator.onLine || !isSupabaseConfigured()) {
    enqueue({ table: mapping.table, pk: String(pk), op: 'UPSERT', data: row })
    return false
  }
  try {
    const { error } = await supabase!.from(mapping.table).upsert(row, { onConflict: pkField })
    if (error) {
      console.error(`[sync] direct UPSERT ${mapping.table}/${pk} failed:`, error.message)
      enqueue({ table: mapping.table, pk: String(pk), op: 'UPSERT', data: row })
      return false
    }
    console.log(`[sync] ✅ direct UPSERT ${mapping.table}/${pk} OK`)
    markWritten(mapping.table, String(pk))
    return true
  } catch (e: any) {
    console.error(`[sync] direct UPSERT ${mapping.table}/${pk} catch:`, e?.message || e)
    enqueue({ table: mapping.table, pk: String(pk), op: 'UPSERT', data: row })
    return false
  }
}

/**
 * Directly delete a single record from Supabase.
 */
export const deleteRecord = async (stateKey: keyof AppState, pk: string): Promise<boolean> => {
  const mapping = TABLE_MAPPINGS.find(m => m.stateKey === stateKey)
  if (!mapping) { console.error(`[sync] no mapping for ${String(stateKey)}`); return false }
  const pkField = mapping.pkField ?? 'id'
  console.log(`[sync] direct DELETE ${mapping.table}/${pk}`)
  if (!navigator.onLine || !isSupabaseConfigured()) {
    enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
    return false
  }
  try {
    const { error } = await supabase!.from(mapping.table).delete().eq(pkField, pk)
    if (error) {
      console.error(`[sync] direct DELETE ${mapping.table}/${pk} failed:`, error.message)
      enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
      return false
    }
    console.log(`[sync] ✅ direct DELETE ${mapping.table}/${pk} OK`)
    markWritten(mapping.table, pk)
    return true
  } catch (e: any) {
    console.error(`[sync] direct DELETE ${mapping.table}/${pk} catch:`, e?.message || e)
    enqueue({ table: mapping.table, pk, op: 'DELETE', data: {} })
    return false
  }
}

// ─── Fetch users from Supabase (for login) ─────────────────────────

export const fetchUsersFromCloud = async (): Promise<import('../types').User[] | null> => {
  if (!isSupabaseConfigured() || !navigator.onLine) return null
  try {
    const mapping = TABLE_MAPPINGS.find(m => m.stateKey === 'users')!
    const { data, error } = await supabase!.from(mapping.table).select('*')
    if (error || !data || data.length === 0) return null
    return data.map(mapping.fromRow)
  } catch {
    return null
  }
}

// ─── Keep-Alive Ping ──────────────────────────────────────────────
// Supabase free tier pauses the DB after ~5 minutes of inactivity.
// A lightweight ping every 4 minutes prevents cold starts.

let keepAliveTimer: ReturnType<typeof setInterval> | null = null

function startKeepAlive() {
  if (keepAliveTimer) return
  keepAliveTimer = setInterval(async () => {
    if (!navigator.onLine || !isSupabaseConfigured()) return
    try {
      await supabase!.from('app_settings').select('id').eq('id', 'singleton').single()
    } catch { /* ignore */ }
  }, 4 * 60 * 1000) // every 4 minutes
}

function stopKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null }
}

// ─── Network Monitoring ───────────────────────────────────────────

export const initNetworkMonitoring = (): void => {
  window.addEventListener('online', () => {
    updateStatus({ isOnline: true })
    flushQueue()
    startKeepAlive()
  })
  window.addEventListener('offline', () => {
    updateStatus({ isOnline: false })
    stopKeepAlive()
  })
  updateStatus({ isOnline: navigator.onLine, pendingChanges: getQueue().length })
  if (navigator.onLine) startKeepAlive()
}
