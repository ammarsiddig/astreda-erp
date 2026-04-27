import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Plus, Edit2, Trash2, Shield, Users, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { generateSeedData } from '../lib/seedData';
import { canWrite } from '../lib/permissions';
import { ALL_PAGE_KEYS } from '../lib/permissions';
import type { User, Role, PagePermission, PageKey } from '../types';
import { upsertRecord, deleteRecord } from '../lib/syncEngine';
import { hashPassword } from '../lib/utils';

// Generic entity shape used by the settings CRUD handlers
type SettingsRecord = { id: string; [key: string]: unknown };

/**
 * Compute how expenses are deducted for a person.
 * Rules:
 *  - If profit is null/undefined → expenses do NOT touch capitalReturn
 *  - Expenses reduce profit first; if remainder remains, it reduces capitalReturn
 */
export function computeExpenseDeduction(
  capitalReturn: number,
  profit: number | null | undefined,
  expenses: number
): { netCapitalReturn: number; netProfit: number | null; fromProfit: number; fromCapital: number } {
  if (profit == null) {
    // No profit assigned — expenses must NOT reduce capital
    return { netCapitalReturn: capitalReturn, netProfit: null, fromProfit: 0, fromCapital: 0 };
  }
  const fromProfit = Math.min(expenses, profit);
  const remainder = expenses - fromProfit;
  const fromCapital = Math.min(remainder, capitalReturn);
  return {
    netProfit: profit - fromProfit,
    netCapitalReturn: capitalReturn - fromCapital,
    fromProfit,
    fromCapital,
  };
}

const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: 'لوحة التحكم',
  inventory: 'المخزون',
  carLoading: 'تحميل السيارات',
  sales: 'المبيعات',
  customers: 'العملاء',
  payments: 'المدفوعات',
  expenses: 'المصروفات',
  salaries: 'الرواتب',
  generalTransfers: 'التحاويل العامة',
  accountTransfers: 'المقاصة',
  ledger: 'الدفتر',
  reports: 'التقارير',
  capital: 'رأس المال',
  auditLog: '\u0633\u062c\u0644 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a',
  settings: 'الإعدادات',
};

export default function Settings() {
  const { t } = useTranslation();
  const { state, updateState, resetAndFullSync } = useAppStore();
  const hasSettingsWrite = canWrite(state.currentUser, state.roles, 'settings');
  const [activeTab, setActiveTab] = useState<'products' | 'salespeople' | 'cities' | 'cars' | 'bankAccounts' | 'expenseCategories' | 'partners' | 'shipments' | 'partnerSettings' | 'users' | 'roles'>('products');

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<SettingsRecord | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  // ─── Reset & Full Sync State ───────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // ─── User Management State ─────────────────────────────────────
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<{ name: string; username: string; password: string; roleId: string; salespersonId: string; isActive: boolean }>({
    name: '', username: '', password: '', roleId: '', salespersonId: '', isActive: true,
  });
  const [showUserPassword, setShowUserPassword] = useState(false);

  // ─── Role Management State ─────────────────────────────────────
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<{ name: string; nameEn: string; isSalesperson: boolean; permissions: PagePermission[] }>({
    name: '', nameEn: '', isSalesperson: false,
    permissions: ALL_PAGE_KEYS.map(k => ({ pageKey: k, canView: false, canWrite: false })),
  });

  const tabs = [
    { id: 'products', label: t('products') },
    { id: 'salespeople', label: t('salespeople') },
    { id: 'cities', label: t('cities') },
    { id: 'cars', label: t('cars') },
    { id: 'bankAccounts', label: t('bankAccounts') },
    { id: 'expenseCategories', label: t('expenseCategories') },
    { id: 'partners', label: t('partners') },
    { id: 'shipments', label: t('shipments') },
    { id: 'partnerSettings', label: t('partnerSettings') },
    ...(hasSettingsWrite ? [
      { id: 'users', label: t('manageUsers') },
      { id: 'roles', label: t('manageRoles') },
    ] : []),
  ];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSettingsWrite) return;
    if (activeTab === 'partnerSettings') return;
    const list = (state[activeTab as keyof typeof state] as unknown) as SettingsRecord[];

    if (editingItem) {
      const updatedList = list.map(item => item.id === editingItem.id ? { ...item, ...formData } : item);
      updateState({ [activeTab]: updatedList });
    } else {
      const newItem: SettingsRecord = { id: uuidv4(), ...formData };
      const newList = [...list, newItem];
      updateState({ [activeTab]: newList });
    }

    setShowModal(false);
    setEditingItem(null);
    setFormData({});
  };

  const handleDelete = (id: string) => {
    if (!hasSettingsWrite) return;
    if (window.confirm('Are you sure you want to delete this item?')) {
      const list = (state[activeTab as keyof typeof state] as unknown) as SettingsRecord[];
      updateState({ [activeTab]: list.filter(item => item.id !== id) });
    }
  };

  const openModal = (item?: object) => {
    if (!hasSettingsWrite) return;
    if (item) {
      setEditingItem(item as SettingsRecord);
      setFormData(item as Record<string, unknown>);
    } else {
      setEditingItem(null);
      setFormData({});
    }
    setShowModal(true);
  };

  const handleLoadSeedData = () => {
    if (!hasSettingsWrite) return;
    const ok = window.confirm('سيتم استبدال كل بيانات النظام الحالية ببيانات تجريبية. هل تريد المتابعة؟');
    if (!ok) return;
    updateState(generateSeedData());
    setActiveTab('products');
  };

  const renderFormFields = () => {
    // Type-safe accessors for the Record<string, unknown> formData
    const fStr = (key: string) => (formData[key] as string | undefined) ?? '';
    const fNum = (key: string) => Number(formData[key]) || 0;
    const fBool = (key: string) => Boolean(formData[key]);

    switch (activeTab) {
      case 'bankAccounts':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
              <input
                type="text"
                required
                value={fStr('name')}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('transferFee')}</label>
              <input
                type="number"
                required
                min="0"
                step="0.01"
                value={fNum('transferFee')}
                onChange={(e) => setFormData({ ...formData, transferFee: Number(e.target.value) })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
          </>
        );
      case 'shipments':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
              <input
                type="text"
                required
                value={fStr('name')}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                id="isClosed"
                checked={fBool('isClosed')}
                onChange={(e) => setFormData({ ...formData, isClosed: e.target.checked })}
                className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"
              />
              <label htmlFor="isClosed" className="ml-2 rtl:mr-2 text-sm font-medium text-slate-700">
                {t('closed')}
              </label>
            </div>
          </>
        );
      case 'partners':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
              <input
                type="text"
                required
                value={fStr('name')}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                id="isOperatingPartner"
                checked={fBool('isOperatingPartner')}
                onChange={(e) => setFormData({ ...formData, isOperatingPartner: e.target.checked })}
                className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"
              />
              <label htmlFor="isOperatingPartner" className="ml-2 rtl:mr-2 rtl:ml-0 text-sm font-medium text-slate-700">
                {t('isOperatingPartner')}
              </label>
            </div>
          </>
        );
      default:
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
            <input
              type="text"
              required
              value={fStr('name')}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
        );
    }
  };

  // ─── User Handlers ──────────────────────────────────────────────
  const openUserModal = (user?: User) => {
    if (!hasSettingsWrite) return;
    if (user) {
      setEditingUser(user);
      setUserForm({ name: user.name, username: user.username, password: user.password, roleId: user.roleId, salespersonId: user.salespersonId || '', isActive: user.isActive });
    } else {
      setEditingUser(null);
      setUserForm({ name: '', username: '', password: '', roleId: '', salespersonId: '', isActive: true });
    }
    setShowUserPassword(false);
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSettingsWrite) return;
    if (!userForm.name || !userForm.username || !userForm.password || !userForm.roleId) return;
    const selectedRole = state.roles.find(r => r.id === userForm.roleId);

    // Always store a hashed password. If the admin entered a new plaintext password,
    // hash it. If they left it unchanged while editing (already hashed), keep it.
    const { isPasswordHashed: checkHashed } = await import('../lib/utils');
    const storedPassword = checkHashed(userForm.password)
      ? userForm.password
      : await hashPassword(userForm.password);

    const newUser: User = {
      id: editingUser ? editingUser.id : uuidv4(),
      name: userForm.name,
      username: userForm.username,
      password: storedPassword,
      roleId: userForm.roleId,
      salespersonId: selectedRole?.isSalesperson ? userForm.salespersonId || undefined : undefined,
      isActive: userForm.isActive,
    };
    updateState({
      users: editingUser
        ? state.users.map(u => u.id === editingUser.id ? newUser : u)
        : [...state.users, newUser],
    });
    // Direct Supabase write — don't rely only on background diff
    upsertRecord('users', newUser);
    setShowUserModal(false);
  };

  const handleDeleteUser = (userId: string) => {
    if (!hasSettingsWrite) return;
    if (state.currentUser?.id === userId) return;
    if (userId === 'user-sysadmin') return;
    if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
      updateState({ users: state.users.filter(u => u.id !== userId) });
      deleteRecord('users', userId);
    }
  };

  // ─── Role Handlers ──────────────────────────────────────────────
  const openRoleModal = (role?: Role) => {
    if (!hasSettingsWrite) return;
    if (role) {
      setEditingRole(role);
      setRoleForm({
        name: role.name, nameEn: role.nameEn, isSalesperson: role.isSalesperson,
        permissions: ALL_PAGE_KEYS.map(k => {
          const existing = role.permissions.find(p => p.pageKey === k);
          return existing || { pageKey: k, canView: false, canWrite: false };
        }),
      });
    } else {
      setEditingRole(null);
      setRoleForm({
        name: '', nameEn: '', isSalesperson: false,
        permissions: ALL_PAGE_KEYS.map(k => ({ pageKey: k, canView: false, canWrite: false })),
      });
    }
    setShowRoleModal(true);
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSettingsWrite) return;
    if (!roleForm.name || !roleForm.nameEn) return;
    const newRole: Role = {
      id: editingRole ? editingRole.id : uuidv4(),
      name: roleForm.name,
      nameEn: roleForm.nameEn,
      isSalesperson: roleForm.isSalesperson,
      permissions: roleForm.permissions,
    };
    updateState({
      roles: editingRole
        ? state.roles.map(r => r.id === editingRole.id ? newRole : r)
        : [...state.roles, newRole],
    });
    upsertRecord('roles', newRole);
    setShowRoleModal(false);
  };

  const handleDeleteRole = (roleId: string) => {
    if (!hasSettingsWrite) return;
    if (roleId === 'role-sysadmin') return;
    const usersWithRole = state.users.filter(u => u.roleId === roleId);
    if (usersWithRole.length > 0) {
      window.alert('لا يمكن حذف هذا الدور لأنه مرتبط بمستخدمين');
      return;
    }
    if (window.confirm('هل أنت متأكد من حذف هذا الدور؟')) {
      updateState({ roles: state.roles.filter(r => r.id !== roleId) });
      deleteRecord('roles', roleId);
    }
  };

  const toggleRolePerm = (pageKey: PageKey, field: 'canView' | 'canWrite') => {
    if (!hasSettingsWrite) return;
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.map(p => {
        if (p.pageKey !== pageKey) return p;
        const newVal = !p[field];
        if (field === 'canWrite' && newVal) return { ...p, canView: true, canWrite: true };
        if (field === 'canView' && !newVal) return { ...p, canView: false, canWrite: false };
        return { ...p, [field]: newVal };
      }),
    }));
  };

  const list = (activeTab !== 'partnerSettings' && activeTab !== 'users' && activeTab !== 'roles') ? (state[activeTab as keyof typeof state] as any[]) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('settings')}</h1>
          {!hasSettingsWrite && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">
            {t('masterLists')}
          </div>
          <div className="flex flex-col">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-3 text-left rtl:text-right text-sm font-medium transition-colors border-l-4 rtl:border-r-4 rtl:border-l-0 ${
                  activeTab === tab.id
                    ? 'border-[#134e4a] bg-[#f0fdfa] text-[#134e4a]'
                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">

          {/* Partner Settings Tab */}
          {activeTab === 'partnerSettings' ? (
            <div className="space-y-6">
              {/* توزيع الأرباح — يتم إدارته من صفحة رأس المال */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center space-y-3">
                <p className="text-3xl">📊</p>
                <h2 className="text-lg font-bold text-slate-800">توزيع الأرباح</h2>
                <p className="text-sm text-slate-500">يتم إدارة توزيع الأرباح من صفحة رأس المال مباشرةً</p>
                <p className="text-xs text-slate-400">انتقل إلى <strong>رأس المال ← توزيع الأرباح</strong> لإدخال أو تعديل بيانات التوزيع لكل رسالة</p>
              </div>

              {/* Section B — Partners List with Operating Flag */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-5">
                  <h2 className="text-lg font-bold text-slate-800">قائمة الشركاء</h2>
                  {hasSettingsWrite && <button
                    onClick={() => { setActiveTab('partners'); openModal(); }}
                    className="flex items-center px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0" />
                    {t('add')}
                  </button>}
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {state.partners.map((partner) => (
                      <div key={partner.id} className="p-4 flex justify-between items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{partner.name}</p>
                          {partner.isOperatingPartner ? (
                            <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">شريك مشغِّل</span>
                          ) : (
                            <span className="inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">مساهم</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {hasSettingsWrite && <button onClick={() => { setActiveTab('partners'); openModal(partner); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>}
                          {hasSettingsWrite && <button onClick={() => { if (window.confirm('هل أنت متأكد؟')) { updateState({ partners: state.partners.filter(p => p.id !== partner.id) }); } }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                      <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">{t('name')}</th>
                          <th className="px-4 py-3 text-center">{t('isOperatingPartner')}</th>
                          <th className="px-4 py-3 text-center w-24">{t('action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.partners.map((partner) => (
                          <tr key={partner.id} className="hover:bg-[#f0fdfa] transition-colors">
                            <td className="px-4 py-3 font-medium text-slate-900">{partner.name}</td>
                            <td className="px-4 py-3 text-center">
                              {partner.isOperatingPartner ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">شريك مشغِّل</span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">مساهم</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center gap-2">
                                {hasSettingsWrite && <button
                                  onClick={() => { setActiveTab('partners'); openModal(partner); }}
                                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>}
                                {hasSettingsWrite && <button
                                  onClick={() => {
                                    if (window.confirm('هل أنت متأكد؟')) {
                                      updateState({ partners: state.partners.filter(p => p.id !== partner.id) });
                                    }
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'users' ? (
            /* ─── Users Management Tab ─── */
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Users className="w-5 h-5 text-[#134e4a]"/>إدارة المستخدمين</h2>
                  {hasSettingsWrite && <button onClick={() => openUserModal()} className="flex items-center px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors text-sm">
                    <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0"/>{t('add')}
                  </button>}
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {state.users.map(user => {
                      const role = state.roles.find(r => r.id === user.roleId);
                      const sp = user.salespersonId ? state.salespeople.find(s => s.id === user.salespersonId) : null;
                      return (
                        <div key={user.id} className="p-4 flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 text-sm">{user.name}</p>
                            <p className="font-mono text-xs text-slate-400">{user.username}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">{role?.name || '-'}</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{user.isActive ? 'نشط' : 'معطل'}</span>
                            </div>
                            {sp && <p className="text-xs text-slate-400 mt-0.5">{sp.name}</p>}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {hasSettingsWrite && (user.id !== 'user-sysadmin' || state.currentUser?.id === 'user-sysadmin') && <button onClick={() => openUserModal(user)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                            {hasSettingsWrite && state.currentUser?.id !== user.id && user.id !== 'user-sysadmin' && <button onClick={() => handleDeleteUser(user.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                      <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">الاسم</th>
                          <th className="px-4 py-3">اسم المستخدم</th>
                          <th className="px-4 py-3">الدور</th>
                          <th className="px-4 py-3">المندوب</th>
                          <th className="px-4 py-3 text-center">الحالة</th>
                          <th className="px-4 py-3 text-center w-24">{t('action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.users.map(user => {
                          const role = state.roles.find(r => r.id === user.roleId);
                          const sp = user.salespersonId ? state.salespeople.find(s => s.id === user.salespersonId) : null;
                          return (
                            <tr key={user.id} className="hover:bg-[#f0fdfa] transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500">{user.username}</td>
                              <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">{role?.name || '-'}</span></td>
                              <td className="px-4 py-3 text-slate-500">{sp?.name || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {user.isActive ? 'نشط' : 'معطل'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex justify-center gap-2">
                                  {hasSettingsWrite && (user.id !== 'user-sysadmin' || state.currentUser?.id === 'user-sysadmin') && <button onClick={() => openUserModal(user)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                                  {hasSettingsWrite && state.currentUser?.id !== user.id && user.id !== 'user-sysadmin' && (
                                    <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'roles' ? (
            /* ─── Roles Management Tab ─── */
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Shield className="w-5 h-5 text-[#134e4a]"/>إدارة الأدوار</h2>
                  {hasSettingsWrite && <button onClick={() => openRoleModal()} className="flex items-center px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors text-sm">
                    <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0"/>{t('add')}
                  </button>}
                </div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {state.roles.map(role => {
                      const userCount = state.users.filter(u => u.roleId === role.id).length;
                      return (
                        <div key={role.id} className="p-4 flex justify-between items-start gap-2">
                          <div>
                            <p className="font-medium text-slate-900 text-sm">{role.name}</p>
                            <p className="text-xs text-slate-400">{role.nameEn}</p>
                            <div className="flex gap-1 mt-1">
                              {role.isSalesperson && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">مندوب</span>}
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">{userCount} مستخدم</span>
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            {hasSettingsWrite && role.id !== 'role-sysadmin' && <button onClick={() => openRoleModal(role)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                            {hasSettingsWrite && role.id !== 'role-sysadmin' && <button onClick={() => handleDeleteRole(role.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                      <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3">الاسم</th>
                          <th className="px-4 py-3">الاسم (EN)</th>
                          <th className="px-4 py-3 text-center">دور مندوب</th>
                          <th className="px-4 py-3 text-center">المستخدمون</th>
                          <th className="px-4 py-3 text-center w-24">{t('action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {state.roles.map(role => {
                          const userCount = state.users.filter(u => u.roleId === role.id).length;
                          return (
                            <tr key={role.id} className="hover:bg-[#f0fdfa] transition-colors">
                              <td className="px-4 py-3 font-medium text-slate-900">{role.name}</td>
                              <td className="px-4 py-3 text-slate-500">{role.nameEn}</td>
                              <td className="px-4 py-3 text-center">
                                {role.isSalesperson ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">نعم</span> : <span className="text-slate-400">-</span>}
                              </td>
                              <td className="px-4 py-3 text-center font-medium">{userCount}</td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex justify-center gap-2">
                                  {hasSettingsWrite && role.id !== 'role-sysadmin' && <button onClick={() => openRoleModal(role)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                                  {hasSettingsWrite && role.id !== 'role-sysadmin' && <button onClick={() => handleDeleteRole(role.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Standard List Tab */
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-bold text-slate-800">
                  {tabs.find(t => t.id === activeTab)?.label}
                </h2>
                {hasSettingsWrite && <button
                  onClick={() => openModal()}
                  className="flex items-center px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors text-sm"
                >
                  <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0" />
                  {t('add')}
                </button>}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {list.length > 0 ? list.map((item) => (
                    <div key={item.id} className="p-4 flex justify-between items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                        {activeTab === 'bankAccounts' && item.transferFee && <p className="text-xs text-slate-400">{t('transferFee')}: {item.transferFee}</p>}
                        {activeTab === 'shipments' && (
                          <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${item.isClosed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {item.isClosed ? t('closed') : t('open')}
                          </span>
                        )}
                        {activeTab === 'partners' && (
                          <span className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${item.isOperatingPartner ? 'bg-[#ccfbf1] text-[#134e4a]' : 'bg-slate-100 text-slate-500'}`}>
                            {item.isOperatingPartner ? 'شريك مشغِّل' : 'مساهم'}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {hasSettingsWrite && <button onClick={() => openModal(item)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>}
                        {hasSettingsWrite && <button onClick={() => handleDelete(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>
                  )) : (
                    <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
                  )}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                    <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">{t('name')}</th>
                        {activeTab === 'bankAccounts' && <th className="px-4 py-3">{t('transferFee')}</th>}
                        {activeTab === 'shipments' && <th className="px-4 py-3">{t('status')}</th>}
                        {activeTab === 'partners' && <th className="px-4 py-3 text-center">{t('isOperatingPartner')}</th>}
                        <th className="px-4 py-3 text-center w-24">{t('action')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.length > 0 ? list.map((item) => (
                        <tr key={item.id} className="hover:bg-[#f0fdfa] transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                          {activeTab === 'bankAccounts' && <td className="px-4 py-3">{item.transferFee}</td>}
                          {activeTab === 'shipments' && (
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.isClosed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                {item.isClosed ? t('closed') : t('open')}
                              </span>
                            </td>
                          )}
                          {activeTab === 'partners' && (
                            <td className="px-4 py-3 text-center">
                              {item.isOperatingPartner ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-[#ccfbf1] text-[#134e4a]">شريك مشغِّل</span>
                              ) : (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">مساهم</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <div className="flex justify-center gap-2">
                              {hasSettingsWrite && <button
                                onClick={() => openModal(item)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>}
                              {hasSettingsWrite && <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>}
                            </div>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">بيانات النظام</h2>
            <p className="text-sm text-slate-500 mb-5">
              يمكنك تحميل مجموعة بيانات تجريبية جاهزة لتجربة النظام بالكامل (الرسالة15).
            </p>
            {hasSettingsWrite && <button
              type="button"
              onClick={handleLoadSeedData}
              className="px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-semibold transition-colors"
            >
              🔄 تحميل بيانات تجريبية
            </button>}
          </div>

          {/* ─── Reset & Full Sync ─── */}
          <div className="mt-6 bg-white rounded-xl shadow-sm border border-red-100 p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">{t('syncData')}</h2>
            <p className="text-sm text-slate-500 mb-5">{t('resetFullSyncDesc')}</p>
            {resetDone && (
              <p className="text-sm text-emerald-600 font-medium mb-3">✅ {t('resetFullSyncDone')}</p>
            )}
            {resetError && (
              <p className="text-sm text-red-600 font-medium mb-3">⚠️ {resetError}</p>
            )}
            <button
              type="button"
              disabled={isResetting}
              onClick={() => { setResetDone(false); setResetError(null); setShowResetConfirm(true); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
              {isResetting ? t('resetFullSyncRunning') : t('resetFullSync')}
            </button>
          </div>
        </div>
      </div>

      {/* ─── Reset & Full Sync Confirmation Modal ─── */}
      <Modal isOpen={showResetConfirm} onClose={() => setShowResetConfirm(false)} title={t('resetFullSync')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600 text-sm">{t('resetFullSyncConfirm')}</p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={async () => {
                setShowResetConfirm(false);
                setIsResetting(true);
                setResetDone(false);
                setResetError(null);
                try {
                  await resetAndFullSync();
                  setResetDone(true);
                } catch (err) {
                  setResetError(err instanceof Error ? err.message : t('errorOccurred'));
                } finally {
                  setIsResetting(false);
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('resetFullSync')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingItem ? t('edit') : t('add')} size="2xl">
        <form onSubmit={handleSave} className="space-y-4">
          {renderFormFields()}
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── User Modal ─── */}
      <Modal isOpen={showUserModal} onClose={() => setShowUserModal(false)} title={editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم'} size="2xl">
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الاسم الكامل</label>
              <input type="text" required value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اسم المستخدم</label>
              <input type="text" required value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none font-mono" dir="ltr"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">كلمة المرور</label>
              <div className="relative">
                <input type={showUserPassword ? 'text' : 'password'} required value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none font-mono" dir="ltr"/>
                <button type="button" onClick={() => setShowUserPassword(!showUserPassword)} className="absolute left-2 rtl:right-2 rtl:left-auto top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showUserPassword ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الدور</label>
              <SearchableSelect
                required
                value={userForm.roleId}
                onChange={(val) => setUserForm({ ...userForm, roleId: val })}
                options={state.roles.map(r => ({ value: r.id, label: r.name }))}
                placeholder={t('select')}
              />
            </div>
            {state.roles.find(r => r.id === userForm.roleId)?.isSalesperson && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">المندوب المرتبط</label>
                <SearchableSelect
                  value={userForm.salespersonId}
                  onChange={(val) => setUserForm({ ...userForm, salespersonId: val })}
                  options={[{ value: '', label: t('select') }, ...state.salespeople.map(s => ({ value: s.id, label: s.name }))]}
                  placeholder={t('select')}
                />
              </div>
            )}
            <div className="flex items-center pt-6">
              <input type="checkbox" id="userActive" checked={userForm.isActive} onChange={e => setUserForm({ ...userForm, isActive: e.target.checked })}
                className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"/>
              <label htmlFor="userActive" className="mr-2 rtl:ml-2 text-sm font-medium text-slate-700">حساب نشط</label>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={() => setShowUserModal(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('cancel')}</button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors">{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* ─── Role Modal ─── */}
      <Modal isOpen={showRoleModal} onClose={() => setShowRoleModal(false)} title={editingRole ? 'تعديل دور' : 'إضافة دور'} size="2xl">
        <form onSubmit={handleSaveRole} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اسم الدور (عربي)</label>
              <input type="text" required value={roleForm.name} onChange={e => setRoleForm({ ...roleForm, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">اسم الدور (English)</label>
              <input type="text" required value={roleForm.nameEn} onChange={e => setRoleForm({ ...roleForm, nameEn: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none" dir="ltr"/>
            </div>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="roleSp" checked={roleForm.isSalesperson} onChange={e => setRoleForm({ ...roleForm, isSalesperson: e.target.checked })}
              className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"/>
            <label htmlFor="roleSp" className="mr-2 rtl:ml-2 text-sm font-medium text-slate-700">دور مندوب (يُفلتر البيانات حسب المندوب المرتبط)</label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">صلاحيات الصفحات</label>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-right rtl:text-right font-medium text-slate-700">الصفحة</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-700">عرض</th>
                    <th className="px-4 py-2 text-center font-medium text-slate-700">تعديل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roleForm.permissions.map(perm => (
                    <tr key={perm.pageKey} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{PAGE_LABELS[perm.pageKey]}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={perm.canView} onChange={() => toggleRolePerm(perm.pageKey, 'canView')}
                          className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"/>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={perm.canWrite} onChange={() => toggleRolePerm(perm.pageKey, 'canWrite')}
                          className="w-4 h-4 text-[#134e4a] border-slate-300 rounded focus:ring-[#14b8a6]"/>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={() => setShowRoleModal(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('cancel')}</button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors">{t('save')}</button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
