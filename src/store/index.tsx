import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AppState, AuditLogDetail, AuditLogEntry, Language, UserRole, Role, User } from '../types';
import { allPermissions, makePermissions } from '../lib/permissions';
import { getCurrentDateTimeValue, hashPassword, isPasswordHashed } from '../lib/utils';
import { setupRealtimeSync, initNetworkMonitoring, disposeNetworkMonitoring, pullFromCloud, flushQueue, fullPushToCloud, fetchUsersFromCloud, clearSyncState, pushScalarSettings, getSyncStatus, upsertRecords, deleteRecords, upsertRecord, TABLE_MAPPINGS, checkSchemaVersion, pushUserPreference, pullUserPreference, drainLegacyQueue } from '../lib/syncEngine';

const DEFAULT_ROLES: Role[] = [
  {
    id: 'role-sysadmin',
    name: 'مدير النظام',
    nameEn: 'System Administrator',
    permissions: allPermissions(true, true),
    isSalesperson: false,
    isDefault: true,
  },
  {
    id: 'role-manager',
    name: 'مدير',
    nameEn: 'Manager',
    permissions: allPermissions(true, true),
    isSalesperson: false,
    isDefault: true,
  },
  {
    id: 'role-accountant',
    name: 'محاسب',
    nameEn: 'Accountant',
    permissions: makePermissions({
      dashboard: { view: true, write: false },
      inventory: { view: true, write: false },
      carLoading: { view: true, write: false },
      sales: { view: true, write: false },
      customers: { view: true, write: false },
      payments: { view: true, write: true },
      expenses: { view: true, write: true },
      salaries: { view: true, write: true },
      generalTransfers: { view: true, write: true },
      accountTransfers: { view: true, write: true },
      ledger: { view: true, write: true },
      reports: { view: true, write: false },
      capital: { view: true, write: false },
      settings: { view: true, write: false },
    }),
    isSalesperson: false,
    isDefault: true,
  },
  {
    id: 'role-warehouse',
    name: 'مخزن',
    nameEn: 'Warehouse',
    permissions: makePermissions({
      dashboard: { view: true, write: false },
      inventory: { view: true, write: true },
      carLoading: { view: true, write: true },
      sales: { view: true, write: false },
      customers: { view: true, write: false },
      reports: { view: true, write: false },
    }),
    isSalesperson: false,
    isDefault: true,
  },
  {
    id: 'role-salesperson',
    name: 'مندوب',
    nameEn: 'Salesperson',
    permissions: makePermissions({
      dashboard: { view: false, write: false },
      inventory: { view: true, write: false },
      sales: { view: true, write: true },
      customers: { view: true, write: true },
      reports: { view: true, write: false },
    }),
    isSalesperson: true,
    isDefault: true,
  },
];

const DEFAULT_USERS: User[] = [
  // Passwords are SHA-256 hashes. Originals: sysadmin='admin@2025', others='1234'
  { id: 'user-sysadmin',   name: 'مدير النظام', username: 'sysadmin',   password: 'e7ec9cbf3dc1a42562a5e500d5768001933624ea8d8f3ea0602092c42d4bc857', roleId: 'role-sysadmin',   isActive: true },
  { id: 'user-admin',      name: 'المدير',       username: 'admin',      password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', roleId: 'role-manager',    isActive: true },
  { id: 'user-accountant', name: 'المحاسب',      username: 'accountant', password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', roleId: 'role-accountant', isActive: true },
  { id: 'user-warehouse',  name: 'المخزن',       username: 'warehouse',  password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', roleId: 'role-warehouse',  isActive: true },
  { id: 'user-ahmed',      name: 'أحمد ماهر',    username: 'ahmed',      password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', roleId: 'role-salesperson', salespersonId: '1', isActive: true },
  { id: 'user-hassan',     name: 'حسن',          username: 'hassan',     password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', roleId: 'role-salesperson', salespersonId: '2', isActive: true },
];

function mergeUsersWithDefaults(users: User[]): User[] {
  const merged = [...users];
  for (const defaultUser of DEFAULT_USERS) {
    const exists = merged.some(
      (user) => user.id === defaultUser.id || user.username === defaultUser.username
    );
    if (!exists) merged.unshift(defaultUser);
  }
  return merged;
}

const ACTIVE_SHIPMENT_STORAGE_KEY = 'astreda_active_shipment_id';

const initialState: AppState = {
  language: 'ar',
  userRole: 'manager',
  exchangeRate: 1,
  managementFeePercent: 0,
  managementFeeRecipientId: '1',
  products: [
    { id: '1', name: 'هوت دوق' },
    { id: '2', name: 'نجتس' },
    { id: '3', name: 'نجتس جبنة' },
    { id: '4', name: 'نجتس المرح' },
    { id: '5', name: 'بطاطس' },
    { id: '6', name: 'جوافة' },
    { id: '7', name: 'مانجو' },
    { id: '8', name: 'ذرة حلوة' },
    { id: '9', name: 'سمك فيليه' },
    { id: '10', name: 'بيرقر لحمة' },
    { id: '11', name: 'اصابع سمك' },
    { id: '12', name: 'اصابع دجاج' },
    { id: '13', name: 'شيش طاوق' },
    { id: '14', name: 'خضار' },
    { id: '15', name: 'موزاريلا' },
    { id: '16', name: 'مسحب رويال' },
    { id: '17', name: 'صدور' },
    { id: '18', name: 'استربس' },
    { id: '19', name: 'زنجر' },
    { id: '20', name: 'بيرقر فراخ' },
    { id: '21', name: 'مسحب امريكانا' },
    { id: '22', name: 'دبابيس' },
    { id: '23', name: 'افخاذ' },
    { id: '24', name: 'شرائح دجاج' },
    { id: '25', name: 'كفتة' },
  ],
  salespeople: [
    { id: '1', name: 'أحمد ماهر' },
    { id: '2', name: 'حسن' },
    { id: '3', name: 'عصام خليل' },
    { id: '4', name: 'السبكي' },
    { id: '5', name: 'امريكانا' },
    { id: '6', name: 'احمد حلفاوي' },
    { id: '7', name: 'احمد جبرة' },
  ],
  cities: [
    { id: '1', name: 'بورتسودان' },
    { id: '2', name: 'كسلا' },
    { id: '3', name: 'عطبرة' },
    { id: '4', name: 'القضارف' },
    { id: '5', name: 'حلفا الجديدة' },
    { id: '6', name: 'مدني' },
    { id: '7', name: 'شندي' },
    { id: '8', name: 'امدرمان' },
    { id: '9', name: 'الخرطوم بحري' },
    { id: '10', name: 'الخرطوم' },
  ],
  cars: [
    { id: '1', name: 'شرق' },
    { id: '2', name: 'شمال' },
    { id: '3', name: 'بورتسودان' },
  ],
  bankAccounts: [
    { id: '1', name: 'الخزينة', transferFee: 0 },
    { id: '2', name: 'فوري', transferFee: 0 },
    { id: '3', name: 'اوكاش', transferFee: 0 },
    { id: '4', name: 'عصام(بنكك)', transferFee: 0 },
    { id: '5', name: 'حسن(بنكك)', transferFee: 0 },
    { id: '6', name: 'خصومات', transferFee: 0 },
  ],
  shipments: [
    { id: '1', name: 'الرسالة12', isClosed: true, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '2', name: 'الرسالة13', isClosed: true, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '3', name: 'الرسالة14', isClosed: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '4', name: 'الرسالة15', isClosed: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
  ],
  employees: [
    { id: '1', name: 'أحمد ماهر' },
    { id: '2', name: 'حسن' },
    { id: '3', name: 'عصام خليل' },
    { id: '4', name: 'احمد جبرة' },
    { id: '5', name: 'ادريس' },
    { id: '6', name: 'السبكي' },
    { id: '7', name: 'صديق' },
    { id: '8', name: 'عمار' },
    { id: '9', name: 'جدو' },
    { id: '10', name: 'غفير' },
    { id: '11', name: 'مريم' },
  ],
  partners: [
    { id: '1', name: 'عصام', isOperatingPartner: true },
    { id: '2', name: 'محمد مدثر', isOperatingPartner: true },
    { id: '3', name: 'تحاويل عامه', isOperatingPartner: false },
    { id: '4', name: 'العربات', isOperatingPartner: false },
    { id: '5', name: 'الاهل', isOperatingPartner: false },
    { id: '6', name: 'د.نزار', isOperatingPartner: false },
    { id: '7', name: 'حسام', isOperatingPartner: false },
    { id: '8', name: 'مازن', isOperatingPartner: false },
    { id: '9', name: 'احمد جبرة', isOperatingPartner: false },
    { id: '10', name: 'حمادة كنه', isOperatingPartner: false },
    { id: '11', name: 'وائل', isOperatingPartner: false },
    { id: '12', name: 'عمر', isOperatingPartner: false },
    { id: '13', name: 'هيثم', isOperatingPartner: false },
    { id: '14', name: 'الارباح', isOperatingPartner: false },
  ],
  expenseCategories: [
    { id: '1', name: 'وقود' },
    { id: '2', name: 'راتب' },
    { id: '3', name: 'سلفيات' },
    { id: '4', name: 'صيانة عامة' },
    { id: '5', name: 'صيانة السيارة' },
    { id: '6', name: 'الكله' },
    { id: '7', name: 'مستلزمات المكتب' },
    { id: '8', name: 'الأتعاب' },
    { id: '9', name: 'منصرفات الطريق' },
    { id: '10', name: 'رسوم حكومية' },
    { id: '11', name: 'ضرائب' },
    { id: '12', name: 'البيت' },
    { id: '13', name: 'علاج' },
    { id: '14', name: 'خصومات البيع' },
    { id: '15', name: 'حوافز' },
    { id: '16', name: 'مصروفات اسبوعية' },
  ],
  customers: [],
  inventoryTransactions: [],
  invoices: [],
  payments: [],
  expenses: [],
  salaries: [],
  generalTransfers: [],
  accountTransfers: [],
  ledger: [],
  capitalContributions: [],
  manualProfitDistributions: [],
  shipmentTransfers: [],
  auditLogs: [],
  roles: DEFAULT_ROLES,
  users: DEFAULT_USERS,
  currentUser: null,
};

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateState: (updates: Partial<AppState>) => void;
  activeShipmentId: string | undefined;
  setActiveShipmentId: (id: string) => void;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  manualSync: () => Promise<void>;
  fullPush: () => Promise<void>;
  resetAndFullSync: () => Promise<void>;
  isCloudLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Centralized orphan ledger cleanup ─────────────────────────────
// Maps each ledger sourceModule to the state array that "owns" those entries.
// If a ledger entry's linkedId no longer exists in its owner array, it's orphaned.
const SOURCE_MODULE_TO_STATE_KEY: Record<string, keyof AppState> = {
  payment: 'payments',
  expense: 'expenses',
  salary: 'salaries',
  general_transfer: 'generalTransfers',
  account_transfer: 'accountTransfers',
  sale_cash: 'invoices',
  shipment_transfer: 'shipmentTransfers',
};

const NON_AUDITABLE_KEYS = new Set<keyof AppState>(['currentUser', 'auditLogs', 'ledger']);
const AUDIT_ID_LIMIT = 10;

function getAuditPk(key: keyof AppState, item: any): string {
  if (key === 'manualProfitDistributions') return String(item.shipmentId);
  return String(item.id ?? item.shipmentId ?? JSON.stringify(item));
}

function collectChangedFields(previousValue: any, nextValue: any): string[] {
  const keys = new Set([
    ...Object.keys(previousValue ?? {}),
    ...Object.keys(nextValue ?? {}),
  ]);
  // No cap — we want all changed fields so snapshots render complete diffs
  return Array.from(keys).filter((key) =>
    JSON.stringify(previousValue?.[key]) !== JSON.stringify(nextValue?.[key])
  );
}

function buildArrayAuditDetail(key: keyof AppState, previousValue: any[], nextValue: any[]): AuditLogDetail | null {
  const previousMap = new Map(previousValue.map((item) => [getAuditPk(key, item), item]));
  const nextMap = new Map(nextValue.map((item) => [getAuditPk(key, item), item]));

  const addedIds: string[] = [];
  const updatedIds: string[] = [];
  const deletedIds: string[] = [];
  const changedFields = new Set<string>();
  const snapshots: Record<string, { before?: Record<string, unknown>; after?: Record<string, unknown> }> = {};

  for (const [id, nextItem] of nextMap) {
    const previousItem = previousMap.get(id);
    if (!previousItem) {
      addedIds.push(id);
      // Store snapshot for every added record up to the limit
      if (addedIds.length <= AUDIT_ID_LIMIT) {
        snapshots[id] = { after: nextItem as Record<string, unknown> };
      }
      continue;
    }
    if (JSON.stringify(previousItem) !== JSON.stringify(nextItem)) {
      updatedIds.push(id);
      collectChangedFields(previousItem, nextItem).forEach((field) => changedFields.add(field));
      // Store full before+after snapshot for every updated record up to the limit
      if (updatedIds.length <= AUDIT_ID_LIMIT) {
        snapshots[id] = {
          before: previousItem as Record<string, unknown>,
          after: nextItem as Record<string, unknown>,
        };
      }
    }
  }

  for (const id of previousMap.keys()) {
    if (!nextMap.has(id)) {
      deletedIds.push(id);
      // Store full before snapshot for every deleted record up to the limit
      if (deletedIds.length <= AUDIT_ID_LIMIT) {
        snapshots[id] = { before: previousMap.get(id) as Record<string, unknown> };
      }
    }
  }

  if (addedIds.length === 0 && updatedIds.length === 0 && deletedIds.length === 0) return null;

  // Derive first before/after for legacy UI compat
  const firstUpdateId = updatedIds[0];
  const firstDeleteId = deletedIds[0];
  const firstAddId = addedIds[0];
  const firstBefore = firstUpdateId
    ? snapshots[firstUpdateId]?.before
    : firstDeleteId
    ? snapshots[firstDeleteId]?.before
    : undefined;
  const firstAfter = firstUpdateId
    ? snapshots[firstUpdateId]?.after
    : firstAddId
    ? snapshots[firstAddId]?.after
    : undefined;

  return {
    stateKey: String(key),
    addedIds: addedIds.slice(0, AUDIT_ID_LIMIT),
    updatedIds: updatedIds.slice(0, AUDIT_ID_LIMIT),
    deletedIds: deletedIds.slice(0, AUDIT_ID_LIMIT),
    changedFields: Array.from(changedFields),
    snapshots,
    before: firstBefore,
    after: firstAfter,
  };
}

function buildObjectAuditDetail(key: keyof AppState, previousValue: Record<string, any>, nextValue: Record<string, any>): AuditLogDetail | null {
  const previousKeys = new Set(Object.keys(previousValue ?? {}));
  const nextKeys = new Set(Object.keys(nextValue ?? {}));
  const addedIds: string[] = [];
  const updatedIds: string[] = [];
  const deletedIds: string[] = [];
  const changedFields = new Set<string>();

  for (const id of nextKeys) {
    if (!previousKeys.has(id)) {
      addedIds.push(id);
      continue;
    }
    if (JSON.stringify(previousValue[id]) !== JSON.stringify(nextValue[id])) {
      updatedIds.push(id);
      collectChangedFields(previousValue[id], nextValue[id]).forEach((field) => changedFields.add(field));
    }
  }

  for (const id of previousKeys) {
    if (!nextKeys.has(id)) deletedIds.push(id);
  }

  if (addedIds.length === 0 && updatedIds.length === 0 && deletedIds.length === 0) return null;

  return {
    stateKey: String(key),
    addedIds: addedIds.slice(0, AUDIT_ID_LIMIT),
    updatedIds: updatedIds.slice(0, AUDIT_ID_LIMIT),
    deletedIds: deletedIds.slice(0, AUDIT_ID_LIMIT),
    changedFields: Array.from(changedFields),
  };
}

function buildScalarAuditDetail(key: keyof AppState, previousValue: unknown, nextValue: unknown): AuditLogDetail | null {
  if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) return null;
  const before: Record<string, unknown> = { [String(key)]: previousValue };
  const after: Record<string, unknown> = { [String(key)]: nextValue };
  return {
    stateKey: String(key),
    addedIds: [],
    updatedIds: [],
    deletedIds: [],
    changedFields: [String(key)],
    before,
    after,
    // '_' is the conventional key for scalar (non-array) changes
    snapshots: { _: { before, after } },
  };
}

function createAuditLogEntry(prev: AppState, next: AppState, updates: Partial<AppState>): AuditLogEntry | null {
  const details: AuditLogDetail[] = [];

  for (const key of Object.keys(updates) as (keyof AppState)[]) {
    if (NON_AUDITABLE_KEYS.has(key)) continue;

    const previousValue = prev[key];
    const nextValue = next[key];
    let detail: AuditLogDetail | null = null;

    if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
      detail = buildArrayAuditDetail(key, previousValue, nextValue);
    } else if (
      previousValue &&
      nextValue &&
      typeof previousValue === 'object' &&
      typeof nextValue === 'object'
    ) {
      detail = buildObjectAuditDetail(
        key,
        previousValue as Record<string, any>,
        nextValue as Record<string, any>
      );
    } else {
      detail = buildScalarAuditDetail(key, previousValue, nextValue);
    }

    if (detail) details.push(detail);
  }

  if (details.length === 0) return null;

  const addedCount = details.reduce((sum, detail) => sum + detail.addedIds.length, 0);
  const updatedCount = details.reduce((sum, detail) => sum + detail.updatedIds.length, 0);
  const deletedCount = details.reduce((sum, detail) => sum + detail.deletedIds.length, 0);

  let action: AuditLogEntry['action'] = 'mixed';
  if (addedCount > 0 && updatedCount === 0 && deletedCount === 0) action = 'create';
  else if (deletedCount > 0 && addedCount === 0 && updatedCount === 0) action = 'delete';
  else if (updatedCount > 0 && addedCount === 0 && deletedCount === 0) action = 'update';

  return {
    id: crypto.randomUUID(),
    timestamp: getCurrentDateTimeValue(),
    userId: prev.currentUser?.id ?? null,
    userName: prev.currentUser?.name ?? 'Unknown',
    action,
    details,
  };
}

function cleanOrphanedLedger(st: AppState): AppState {
  if (!Array.isArray(st.ledger) || st.ledger.length === 0) return st;

  // Build lookup sets lazily per source module
  const idSets = new Map<string, Set<string>>();
  const getIdSet = (mod: string): Set<string> | null => {
    if (idSets.has(mod)) return idSets.get(mod)!;
    const key = SOURCE_MODULE_TO_STATE_KEY[mod];
    if (!key) return null;
    const arr = (st as any)[key];
    if (!Array.isArray(arr)) return null;
    const s = new Set<string>(arr.map((item: any) => item.id));
    idSets.set(mod, s);
    return s;
  };

  const deduped = new Map<string, typeof st.ledger[number]>();
  for (const entry of st.ledger) {
    deduped.set(entry.id, entry);
  }

  const cleaned = Array.from(deduped.values()).filter(entry => {
    const ids = getIdSet(entry.sourceModule);
    if (!ids) return true; // unknown module — keep
    return ids.has(entry.linkedId);
  });

  if (cleaned.length === st.ledger.length) return st; // nothing removed
  return { ...st, ledger: cleaned };
}

// Helper: read and patch localStorage cache (used as fallback when cloud is unavailable)
function loadFromLocalStorage(): AppState {
  const saved = localStorage.getItem('astreda_erp_state') || localStorage.getItem('americana_erp_state');
  if (!saved) return { ...initialState };

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...initialState, ...parsed };

    // Ensure roles & users always exist
    if (!Array.isArray(merged.roles) || merged.roles.length === 0) {
      merged.roles = DEFAULT_ROLES;
    } else {
      DEFAULT_ROLES.forEach(dr => {
        if (!merged.roles.find((r: Role) => r.id === dr.id)) merged.roles.unshift(dr);
      });
    }
    if (!Array.isArray(merged.users) || merged.users.length === 0) {
      merged.users = DEFAULT_USERS;
    } else {
      DEFAULT_USERS.forEach(du => {
        if (!merged.users.find((u: User) => u.id === du.id)) merged.users.unshift(du);
      });
    }
    if (merged.currentUser === undefined) merged.currentUser = null;
    if (!Array.isArray(merged.auditLogs)) merged.auditLogs = [];

    // Deep-patch partners
    if (Array.isArray(parsed.partners)) {
      merged.partners = parsed.partners.map((savedPartner: any) => {
        const seed = initialState.partners.find(p => p.id === savedPartner.id);
        return {
          ...seed, ...savedPartner,
          isOperatingPartner: savedPartner.isOperatingPartner !== undefined
            ? savedPartner.isOperatingPartner : seed?.isOperatingPartner ?? false,
        };
      });
    }

    if (merged.managementFeePercent === undefined) merged.managementFeePercent = initialState.managementFeePercent;
    if (!merged.managementFeeRecipientId) merged.managementFeeRecipientId = initialState.managementFeeRecipientId;

    // Deep-patch shipments + migrate legacy isActive → isClosed
    if (Array.isArray(parsed.shipments)) {
      merged.shipments = parsed.shipments.map((savedShipment: any) => {
        const s = {
          shareholdersPercent: 40,
          managementFeePercent: initialState.managementFeePercent,
          managementFeeRecipientId: initialState.managementFeeRecipientId,
          ...savedShipment,
        };
        // Migration: old data had isActive (true=active), new model uses isClosed (true=closed)
        if ('isActive' in s && !('isClosed' in s)) {
          s.isClosed = !s.isActive;
        }
        delete s.isActive;
        return s;
      });
    }

    // One-time migration: clean up corrupted capital_contribution records
    if (Array.isArray(merged.generalTransfers)) {
      const corruptedIds = new Set<string>();
      merged.generalTransfers = merged.generalTransfers.map((t: any) => {
        if (t.transferType === 'capital_contribution' && t.amountSDG > 0) {
          corruptedIds.add(t.id);
          return { ...t, amountSDG: 0 };
        }
        return t;
      });
      if (corruptedIds.size > 0 && Array.isArray(merged.ledger)) {
        merged.ledger = merged.ledger.filter((e: any) =>
          !(e.module === 'general_transfer' && corruptedIds.has(e.referenceId))
        );
      }
    }

    // Restore currentUser from localStorage
    const savedUser = localStorage.getItem('astreda_current_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        const freshUser = merged.users.find((u: any) => u.id === parsedUser.id);
        merged.currentUser = freshUser && freshUser.isActive ? freshUser : null;
        if (!merged.currentUser) localStorage.removeItem('astreda_current_user');
      } catch { merged.currentUser = null; }
    } else {
      merged.currentUser = null;
    }

    if (Array.isArray(merged.capitalContributions)) {
      // v3: profitRate comes from Supabase only — no localStorage overrides
    }

    return cleanOrphanedLedger(merged);
  } catch (e) {
    console.error('Failed to parse state from localStorage', e);
    return { ...initialState };
  }
}

// Helper: ensure default roles/users exist in cloud-pulled state
function ensureDefaults(state: AppState): AppState {
  const merged = { ...state };
  if (!Array.isArray(merged.auditLogs)) merged.auditLogs = [];
  if (!Array.isArray(merged.roles) || merged.roles.length === 0) {
    merged.roles = DEFAULT_ROLES;
  } else {
    DEFAULT_ROLES.forEach(dr => {
      if (!merged.roles.find((r: Role) => r.id === dr.id)) merged.roles.unshift(dr);
    });
  }
  if (!Array.isArray(merged.users) || merged.users.length === 0) {
    merged.users = DEFAULT_USERS;
  } else {
    DEFAULT_USERS.forEach(du => {
      if (!merged.users.find((u: User) => u.id === du.id)) merged.users.unshift(du);
    });
  }
  return merged;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Start with localStorage cache immediately (instant render)
  const [state, setState] = useState<AppState>(loadFromLocalStorage);
  const [isCloudLoading, setIsCloudLoading] = useState(true);

  // Keep a ref to latest state for realtime callbacks
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cloud updates are applied directly — no diff tracking needed.
  // ensureDefaults is applied inline so DEFAULT_ROLES/USERS survive every cloud
  // pull (initial load, visibilitychange, realtime), not just the first one.
  // v3: profitRate comes from Supabase directly — no localStorage merging.
  const cloudApply = useCallback((updates: Partial<AppState>) => {
    setState(prev => {
      const merged: any = { ...prev };
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'currentUser') continue;
        merged[key] = value;
      }
      merged.currentUser = prev.currentUser;
      return cleanOrphanedLedger(ensureDefaults(merged) as AppState);
    });
  }, []);

  // ── Cloud-First initialization with schema check ────────────────
  useEffect(() => {
    initNetworkMonitoring();
    drainLegacyQueue(); // one-time: migrate v2 offline queue into v3 WAL
    const cleanup = setupRealtimeSync(cloudApply, () => stateRef.current);

    (async () => {
      try {
        // Schema version gate: warn if DB hasn't been migrated
        const schemaOk = await checkSchemaVersion();
        if (!schemaOk) {
          console.error('[sync-v3] schema version mismatch — run migration_v3.sql');
        }
        const pulled = await pullFromCloud(cloudApply);
        if (pulled) {
          console.log('[sync-v3] ✅ data loaded from Supabase');
        }
        await flushQueue();
      } catch (e) {
        console.warn('[cloud-first] ⚠️ pull failed — using localStorage cache', e);
      } finally {
        setIsCloudLoading(false);
      }
    })();

    return () => {
      disposeNetworkMonitoring();
      cleanup();
    };
  }, [cloudApply]);

  // Save to localStorage as read-only cache (for next app load)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('astreda_erp_state', JSON.stringify(state));
    }, 500);

    document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = state.language;
  }, [state]);

  // updateState: local state update + automatic Supabase push for ALL data types
  // Pages do NOT need to call upsertRecord/deleteRecord manually — this handles it.
  const updateState = (updates: Partial<AppState>) => {
    // Capture prev state BEFORE updating for diff computation
    const prev = stateRef.current;

    // Compute final state: apply updates, protect currentUser, clean orphaned ledger
    const tentative = { ...prev, ...updates } as AppState;
    if (!('currentUser' in updates)) {
      tentative.currentUser = prev.currentUser;
    }
    const final_ = cleanOrphanedLedger(tentative);

    // If orphan cleanup removed extra ledger entries, include that in updates for diff
    if (final_.ledger !== tentative.ledger || (final_.ledger.length !== (updates as any).ledger?.length && 'ledger' in updates)) {
      updates = { ...updates, ledger: final_.ledger };
    } else if (final_.ledger.length < prev.ledger.length && !('ledger' in updates)) {
      // Orphans removed but caller didn't touch ledger — still need to diff
      updates = { ...updates, ledger: final_.ledger };
    }

    const auditEntry = createAuditLogEntry(prev, final_, updates);
    const auditedFinal = auditEntry
      ? {
          ...final_,
          auditLogs: [auditEntry, ...final_.auditLogs].slice(0, 500),
        }
      : final_;

    setState(() => auditedFinal);

    // Push new audit entry to cloud so all users see it (silent — table may not exist yet before migration)
    if (auditEntry) upsertRecord('auditLogs', auditEntry, true);

    // v3: profitRate is synced to Supabase directly — no localStorage overrides

    // Push scalar settings to cloud if any changed
    const scalarKeys = ['language', 'userRole', 'exchangeRate', 'managementFeePercent', 'managementFeeRecipientId'];
    if (scalarKeys.some(k => k in updates)) {
      pushScalarSettings({ ...prev, ...updates } as AppState);
    }

    // Auto-sync array and object changes to Supabase (fire-and-forget)
    for (const key of Object.keys(updates) as (keyof AppState)[]) {
      if (scalarKeys.includes(key) || key === 'currentUser' || key === 'auditLogs') continue;
      const newVal = (auditedFinal as any)[key];
      const oldVal = prev[key];

      // Array data — diff by primary key, push changes
      if (Array.isArray(newVal) && Array.isArray(oldVal)) {
        const mapping = TABLE_MAPPINGS.find(m => m.stateKey === key);
        if (!mapping) continue;
        const pkProp = mapping.pkField === 'shipment_id' ? 'shipmentId' : (mapping.pkField ?? 'id');
        const pkGetter = (item: any) => String(item[pkProp] ?? item.id);

        const oldMap = new Map<string, any>();
        for (const item of oldVal as any[]) oldMap.set(pkGetter(item), item);

        const newMap = new Map<string, any>();
        for (const item of newVal as any[]) newMap.set(pkGetter(item), item);

        // Find upserts (added or modified)
        const toUpsert: any[] = [];
        for (const [pk, item] of newMap) {
          const old = oldMap.get(pk);
          if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
            toUpsert.push(item);
          }
        }

        // Find deletes (removed)
        const toDelete: string[] = [];
        for (const pk of oldMap.keys()) {
          if (!newMap.has(pk)) toDelete.push(pk);
        }

        if (toUpsert.length > 0) upsertRecords(key, toUpsert);
        if (toDelete.length > 0) deleteRecords(key, toDelete);
      }
    }
  };

  // ── Active shipment selector (cloud-synced via user_preferences) ──
  const [activeShipmentId, setActiveShipmentIdLocal] = useState<string | undefined>(
    () => {
      // Start with localStorage for instant render, then cloud pull overrides it
      const savedShipmentId = localStorage.getItem(ACTIVE_SHIPMENT_STORAGE_KEY) || undefined;
      if (savedShipmentId && state.shipments.some(s => s.id === savedShipmentId && !s.isClosed)) return savedShipmentId;
      return state.shipments.find(s => !s.isClosed)?.id || state.shipments[0]?.id;
    }
  );

  // Wrap setter to also push to cloud
  const setActiveShipmentId = useCallback((id: string) => {
    setActiveShipmentIdLocal(id);
    localStorage.setItem(ACTIVE_SHIPMENT_STORAGE_KEY, id);
    // Push to cloud so other devices see this user's active shipment
    const userId = stateRef.current.currentUser?.id;
    if (userId) pushUserPreference(userId, { activeShipmentId: id });
  }, []);

  // On login / cloud init, pull user's preference from cloud
  useEffect(() => {
    const userId = state.currentUser?.id;
    if (!userId) return;
    pullUserPreference(userId).then(prefs => {
      const target = prefs?.activeShipmentId
        ? state.shipments.find(s => s.id === prefs.activeShipmentId && !s.isClosed)
        : null;
      if (target) {
        setActiveShipmentIdLocal(target.id);
        localStorage.setItem(ACTIVE_SHIPMENT_STORAGE_KEY, target.id);
      }
    }).catch(() => {});
  }, [state.currentUser?.id, state.shipments]);

  // If shipments list changes (e.g. cloud pull adds/removes/closes), ensure selection is still valid
  useEffect(() => {
    if (state.shipments.length === 0) return;
    const active = state.shipments.find(s => s.id === activeShipmentId);
    // Stay put if the active shipment still exists AND is open
    if (active && !active.isClosed) return;
    // Active shipment was deleted or just closed — jump to first open shipment
    const fallback = state.shipments.find(s => !s.isClosed)?.id || state.shipments[0]?.id;
    if (fallback) setActiveShipmentId(fallback);
  }, [state.shipments, activeShipmentId, setActiveShipmentId]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Cloud-First: fetch fresh users from Supabase before authenticating.
    // Resolve all async work (cloud fetch + hashing) before any setState call so
    // we can merge users + currentUser in a single update — no intermediate render
    // where currentUser is null and the sidebar flashes away.
    let users = mergeUsersWithDefaults(state.users || []);
    let cloudUsers: User[] | null = null;
    try {
      cloudUsers = await fetchUsersFromCloud();
      if (cloudUsers && cloudUsers.length > 0) users = mergeUsersWithDefaults(cloudUsers);
    } catch {
      // Fallback to local users if Supabase is unreachable
    }

    const hashedInput = await hashPassword(password);

    // Find user: compare against hashed password first, then fall back to
    // plaintext for legacy accounts that haven't been migrated yet.
    let user = users.find(u => u.username === username && u.password === hashedInput);
    let upgradedUsers: User[] | null = null;
    if (!user) {
      const legacyUser = users.find(
        u => u.username === username && !isPasswordHashed(u.password) && u.password === password
      );
      if (legacyUser) {
        // Upgrade the stored password to its hashed form transparently
        upgradedUsers = users.map(u =>
          u.id === legacyUser.id ? { ...u, password: hashedInput } : u
        );
        user = { ...legacyUser, password: hashedInput };
      }
    }

    if (!user) return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    if (!user.isActive) return { success: false, error: 'هذا الحساب غير نشط — تواصل مع المدير' };

    // Single setState: merge fresh users (if any) and currentUser together so
    // there is never a render where users changed but currentUser is still null.
    const finalUser = user;
    setState(prev => ({
      ...prev,
      ...(cloudUsers && cloudUsers.length > 0 ? { users } : {}),
      ...(upgradedUsers ? { users: upgradedUsers } : {}),
      currentUser: finalUser,
    }));
    localStorage.setItem('astreda_current_user', JSON.stringify(finalUser));
    return { success: true };
  };

  const logout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    localStorage.removeItem('astreda_current_user');
  };

  const manualSync = useCallback(async () => {
    await flushQueue();
    await pullFromCloud(cloudApply);
  }, [cloudApply]);

  const fullPush = useCallback(async () => {
    await fullPushToCloud(stateRef.current);
  }, []);

  const resetAndFullSync = useCallback(async () => {
    console.log('[store] resetAndFullSync: clearing sync state and performing full pull');
    // clearCache is false: we preserve the current local state so the UI stays
    // populated while the full pull runs in the background, avoiding a blank screen.
    clearSyncState({ clearQueue: true, clearCache: false });
    await pullFromCloud(cloudApply);
  }, [cloudApply]);

  // Memoize context value so consumers don't re-render when the provider's
  // own parent re-renders (or when unrelated sibling state changes occur).
  const contextValue = useMemo(
    () => ({ state, setState, updateState, activeShipmentId, setActiveShipmentId, login, logout, manualSync, fullPush, resetAndFullSync, isCloudLoading }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, activeShipmentId, isCloudLoading]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppStore must be used within an AppProvider');
  }
  return context;
};
