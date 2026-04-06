import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState, Language, UserRole, Role, User } from '../types';
import { allPermissions, makePermissions } from '../lib/permissions';
import { hashPassword, isPasswordHashed } from '../lib/utils';
import { onStateChange, setupRealtimeSync, initNetworkMonitoring, pullFromCloud, pushToCloud, flushQueue, fullPushToCloud, fetchUsersFromCloud, markCloudReady } from '../lib/syncEngine';

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
  ],
  shipments: [
    { id: '1', name: 'الرسالة12', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '2', name: 'الرسالة13', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '3', name: 'الرسالة14', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    { id: '4', name: 'الرسالة15', isActive: true, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
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
    { id: '10', name: 'وائل', isOperatingPartner: false },
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
  savedSettlements: [],
  capitalContributions: [],
  settlementResults: {},
  shipmentTransfers: [],
  roles: DEFAULT_ROLES,
  users: DEFAULT_USERS,
  currentUser: null,
};

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateState: (updates: Partial<AppState>) => void;
  activeShipmentId: string | undefined;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  manualSync: () => Promise<void>;
  fullPush: () => Promise<void>;
  isCloudLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

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

    // Deep-patch shipments
    if (Array.isArray(parsed.shipments)) {
      merged.shipments = parsed.shipments.map((savedShipment: any) => ({
        shareholdersPercent: 40,
        managementFeePercent: initialState.managementFeePercent,
        managementFeeRecipientId: initialState.managementFeeRecipientId,
        ...savedShipment,
      }));
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

    return merged;
  } catch (e) {
    console.error('Failed to parse state from localStorage', e);
    return { ...initialState };
  }
}

// Helper: ensure default roles/users exist in cloud-pulled state
function ensureDefaults(state: AppState): AppState {
  const merged = { ...state };
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

  // Flag: when true the state change came from cloud, so onStateChange should not push it back
  const isApplyingCloudRef = useRef(false);

  // Sync-safe updateState that won't overwrite currentUser from remote
  const syncApply = useCallback((updates: Partial<AppState>) => {
    isApplyingCloudRef.current = true;
    setState(prev => {
      const merged = { ...prev, ...updates };
      // Never let remote sync overwrite local auth session
      merged.currentUser = prev.currentUser;
      return merged;
    });
  }, []);

  // ── Cloud-First initialization ──────────────────────────────────
  useEffect(() => {
    initNetworkMonitoring();
    const cleanup = setupRealtimeSync(syncApply, () => stateRef.current);

    // Pull from Supabase in the background — app renders from localStorage cache instantly
    (async () => {
      try {
        const pulled = await pullFromCloud(syncApply);
        if (pulled) {
          console.log('[cloud-first] ✅ data loaded from Supabase');
          setState(prev => ensureDefaults(prev));
        }
        await flushQueue();
      } catch (e) {
        console.warn('[cloud-first] ⚠️ pull failed — using localStorage cache', e);
      } finally {
        markCloudReady();
        setIsCloudLoading(false);
      }
    })();

    return cleanup;
  }, [syncApply]);

  // Persist to localStorage (cache) AND notify sync engine on every state change
  // Debounce localStorage writes to avoid blocking the main thread
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Debounce localStorage save — heavy JSON.stringify on large state
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem('astreda_erp_state', JSON.stringify(state));
    }, 300);

    document.documentElement.dir = state.language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = state.language;
    // Skip pushing back to Supabase when the update itself came from the cloud
    if (isApplyingCloudRef.current) {
      isApplyingCloudRef.current = false;
      console.log('[store] cloud update applied — skipping onStateChange push');
      return;
    }
    onStateChange(state);
  }, [state]);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const activeShipmentId = state.shipments.find((s) => s.isActive)?.id;

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Cloud-First: fetch fresh users from Supabase before authenticating
    let users = state.users || [];
    try {
      const cloudUsers = await fetchUsersFromCloud();
      if (cloudUsers && cloudUsers.length > 0) {
        users = cloudUsers;
        // Update local state with fresh users
        setState(prev => ({ ...prev, users: cloudUsers }));
      }
    } catch {
      // Fallback to local users if Supabase is unreachable
    }

    const hashedInput = await hashPassword(password);

    // Find user: compare against hashed password first, then fall back to
    // plaintext for legacy accounts that haven't been migrated yet.
    let user = users.find(u => u.username === username && u.password === hashedInput);
    if (!user) {
      const legacyUser = users.find(
        u => u.username === username && !isPasswordHashed(u.password) && u.password === password
      );
      if (legacyUser) {
        // Upgrade the stored password to its hashed form transparently
        const upgradedUsers = users.map(u =>
          u.id === legacyUser.id ? { ...u, password: hashedInput } : u
        );
        setState(prev => ({ ...prev, users: upgradedUsers }));
        user = { ...legacyUser, password: hashedInput };
      }
    }

    if (!user) return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    if (!user.isActive) return { success: false, error: 'هذا الحساب غير نشط — تواصل مع المدير' };
    setState(prev => ({ ...prev, currentUser: user! }));
    localStorage.setItem('astreda_current_user', JSON.stringify(user));
    return { success: true };
  };

  const logout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    localStorage.removeItem('astreda_current_user');
  };

  const manualSync = useCallback(async () => {
    await flushQueue();
    await pullFromCloud(syncApply);
  }, [syncApply]);

  const fullPush = useCallback(async () => {
    await fullPushToCloud(stateRef.current);
  }, []);

  return (
    <AppContext.Provider value={{ state, setState, updateState, activeShipmentId, login, logout, manualSync, fullPush, isCloudLoading }}>
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
