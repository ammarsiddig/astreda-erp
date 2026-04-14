import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { cn, formatDateTimeValue } from '../lib/utils';
import {
  LayoutDashboard, Package, Truck, ShoppingCart, Users, CreditCard,
  Receipt, Wallet, ArrowRightLeft, RefreshCw, BookOpen, BarChart3,
  Settings, Menu, X, Globe, UserCircle, PiggyBank, LogOut, History, Clock3,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { canView, getUserRole } from '../lib/permissions';
import { PageKey } from '../types';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import ToastContainer from './ToastContainer';
import ConnectionBanner from './ConnectionBanner';
import Modal from './Modal';

const navItems: { path: string; icon: any; labelKey: string; pageKey: PageKey }[] = [
  { path: '/', icon: LayoutDashboard, labelKey: 'dashboard', pageKey: 'dashboard' },
  { path: '/inventory', icon: Package, labelKey: 'inventory', pageKey: 'inventory' },
  { path: '/car-loading', icon: Truck, labelKey: 'carLoading', pageKey: 'carLoading' },
  { path: '/sales', icon: ShoppingCart, labelKey: 'sales', pageKey: 'sales' },
  { path: '/customers', icon: Users, labelKey: 'customers', pageKey: 'customers' },
  { path: '/payments', icon: CreditCard, labelKey: 'payments', pageKey: 'payments' },
  { path: '/expenses', icon: Receipt, labelKey: 'expenses', pageKey: 'expenses' },
  { path: '/salaries', icon: Wallet, labelKey: 'salaries', pageKey: 'salaries' },
  { path: '/general-transfers', icon: ArrowRightLeft, labelKey: 'generalTransfers', pageKey: 'generalTransfers' },
  { path: '/capital', icon: PiggyBank, labelKey: 'capitalManagement', pageKey: 'capital' },
  { path: '/account-transfers', icon: RefreshCw, labelKey: 'accountTransfers', pageKey: 'accountTransfers' },
  { path: '/ledger', icon: BookOpen, labelKey: 'financialLedger', pageKey: 'ledger' },
  { path: '/reports', icon: BarChart3, labelKey: 'reports', pageKey: 'reports' },
  { path: '/audit-log', icon: History, labelKey: 'auditLog', pageKey: 'auditLog' },
  { path: '/settings', icon: Settings, labelKey: 'settings', pageKey: 'settings' },
];

const navItemClass = 'flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 text-sm transition-colors duration-150';

function getRoleBadgeColor(roleName: string): string {
  if (roleName === 'مدير النظام') return 'bg-red-700 text-white';
  if (roleName === 'مدير') return 'bg-[#134e4a] text-white';
  if (roleName === 'محاسب') return 'bg-[#0c3531] text-white';
  if (roleName === 'مخزن') return 'bg-green-700 text-white';
  if (roleName === 'مندوب') return 'bg-[#134e4a] text-white';
  return 'bg-slate-600 text-white';
}

export default function Layout() {
  const { t, lang } = useTranslation();
  const { state, updateState, logout, manualSync, activeShipmentId, setActiveShipmentId } = useAppStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [pendingShipmentId, setPendingShipmentId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentUser = state.currentUser;
  const role = getUserRole(currentUser, state.roles);
  const visibleNavItems = navItems.filter(item => canView(currentUser, state.roles, item.pageKey));

  const toggleLanguage = () => {
    updateState({ language: lang === 'ar' ? 'en' : 'ar' });
  };

  const activeShipment = state.shipments.find((s) => s.id === activeShipmentId);

  const handleShipmentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPendingShipmentId(e.target.value);
  };

  const confirmShipmentChange = () => {
    if (!pendingShipmentId) return;
    setActiveShipmentId(pendingShipmentId);
    setPendingShipmentId(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const salespersonName = role?.isSalesperson && currentUser?.salespersonId
    ? state.salespeople.find(s => s.id === currentUser.salespersonId)?.name
    : null;

  const SidebarContent = ({ onNavClick }: { onNavClick?: () => void }) => (
    <>
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo-header.png" alt="أستريدا" className="w-9 h-9 object-contain" />
          <div>
            <h1 className="text-xl font-bold tracking-wide text-amber-400 leading-tight">أستريدا</h1>
            <p className="text-[10px] text-slate-400">نظام التوزيع</p>
          </div>
        </div>
        <div className="border-t border-slate-700 mt-4" />
      </div>
      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5">
          {visibleNavItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                onClick={onNavClick}
                className={({ isActive }) =>
                  cn(
                    navItemClass,
                    isActive
                      ? 'bg-[#134e4a] text-white font-medium'
                      : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                  )
                }
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span>{t(item.labelKey as any)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );

  return (
    <div className="flex h-screen bg-[#f0fdfa] font-sans text-slate-900 overflow-hidden" dir={lang === 'ar' ? 'rtl' : 'ltr'}>

      {/* Sidebar — Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-[#0c3531] text-white shadow-xl z-20 flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-30 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: lang === 'ar' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: lang === 'ar' ? '100%' : '-100%' }}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className={cn(
                'fixed top-0 bottom-0 w-64 bg-[#0c3531] text-white shadow-2xl z-40 flex flex-col',
                lang === 'ar' ? 'right-0' : 'left-0'
              )}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <img src="/logo-header.png" alt="أستريدا" className="w-8 h-8 object-contain" />
                  <div>
                    <h1 className="text-lg font-bold tracking-wide text-amber-400 leading-tight">أستريدا</h1>
                    <p className="text-[10px] text-slate-400">نظام التوزيع</p>
                  </div>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-300 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="border-t border-slate-700 mx-4 mb-2" />
              <nav className="flex-1 overflow-y-auto py-2">
                <ul className="space-y-0.5">
                  {visibleNavItems.map((item) => (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            navItemClass,
                            isActive
                              ? 'bg-[#134e4a] text-white font-medium'
                              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                          )
                        }
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        <span>{t(item.labelKey as any)}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar */}
        <header className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-3 flex items-center justify-between shadow-sm flex-shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Shipment selector — visible on all sizes */}
            <div className="flex items-center bg-amber-50 border border-amber-200 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 gap-1 sm:gap-1.5">
              <span className="text-[10px] sm:text-xs text-amber-600 font-medium whitespace-nowrap hidden sm:inline">{t('activeShipment')}:</span>
              <select
                value={activeShipment?.id || ''}
                onChange={handleShipmentChange}
                className="bg-transparent text-xs sm:text-sm font-semibold text-amber-700 focus:outline-none cursor-pointer max-w-[100px] sm:max-w-none"
              >
                {state.shipments.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Sync Status */}
            <SyncStatusIndicator onManualSync={manualSync} />

            <div className="flex items-center gap-2 bg-slate-50 text-slate-700 border border-slate-200 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium">
              <Clock3 className="w-3.5 h-3.5 text-[#134e4a]" />
              <span className="hidden sm:inline">{t('currentTime')}:</span>
              <span className="font-semibold text-[#134e4a]">{formatDateTimeValue(now, true)}</span>
            </div>

            {/* Language toggle */}
            <button
              onClick={toggleLanguage}
              className="flex items-center bg-[#f0fdfa] text-[#134e4a] border border-[#99f6e4] px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-[#ccfbf1] transition-colors"
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 rtl:ml-1 rtl:mr-0" />
              <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
            </button>

            {/* Role badge */}
            {role && currentUser && (
              <div className={cn('flex items-center px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium gap-1', getRoleBadgeColor(role.name))}>
                <UserCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">
                  {currentUser.name}
                  {salespersonName ? ` (${salespersonName})` : ''}
                  {' — '}
                  {role.name}
                </span>
              </div>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="flex items-center bg-red-50 text-red-600 border border-red-200 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium hover:bg-red-100 transition-colors gap-1"
              title={t('logout')}
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">{t('logout')}</span>
            </button>
          </div>
        </header>

        <ConnectionBanner />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[#f0fdfa]">
          <div className="p-4 sm:p-6 max-w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Shipment Change Confirmation */}
      <Modal isOpen={!!pendingShipmentId} onClose={() => setPendingShipmentId(null)} title={t('confirm')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('confirmShipmentChange')}</p>
          <p className="text-sm font-semibold text-slate-800">
            {state.shipments.find(s => s.id === pendingShipmentId)?.name}
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setPendingShipmentId(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >{t('cancel')}</button>
            <button onClick={confirmShipmentChange}
              className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
            >{t('confirm')}</button>
          </div>
        </div>
      </Modal>

      <ToastContainer />
    </div>
  );
}
