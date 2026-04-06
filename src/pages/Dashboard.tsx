import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { formatCurrency, computeBankBalance, computeShipmentBalance } from '../lib/utils';
import { motion } from 'framer-motion';
import { Wallet, Users, ShoppingCart, Receipt, TrendingUp, PieChart as PieChartIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Dashboard() {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { state, activeShipmentId } = useAppStore();
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
  const [showAllShipmentBalances, setShowAllShipmentBalances] = useState(false);

  // ── Memoized KPIs ──────────────────────────────────────────────
  const totalCash = useMemo(() =>
    state.bankAccounts.reduce((sum, acc) => sum + computeBankBalance(acc.id, state.ledger), 0),
    [state.bankAccounts, state.ledger]
  );

  const customerDebts = useMemo(() => {
    return state.customers.map(c => {
      const sales = state.invoices
        .filter(i => i.customerId === c.id && i.paymentType === 'credit')
        .reduce((s, i) => s + i.total, 0);
      const payments = state.payments
        .filter(p => p.customerId === c.id)
        .reduce((s, p) => s + p.amount, 0);
      return { ...c, debt: sales - payments };
    });
  }, [state.customers, state.invoices, state.payments]);

  const totalDebt = useMemo(() =>
    customerDebts.reduce((sum, c) => sum + Math.max(0, c.debt), 0),
    [customerDebts]
  );

  const activeShipmentSales = useMemo(() =>
    state.invoices
      .filter(i => i.shipmentId === activeShipmentId)
      .reduce((sum, i) => sum + i.total, 0),
    [state.invoices, activeShipmentId]
  );

  const activeShipmentExpenses = useMemo(() =>
    state.expenses
      .filter(e => e.shipmentId === activeShipmentId)
      .reduce((sum, e) => sum + e.amount, 0),
    [state.expenses, activeShipmentId]
  );

  // ── Bank Balances (total) ──────────────────────────────────────
  const bankBalances = useMemo(() =>
    state.bankAccounts.map(acc => ({
      ...acc,
      balance: computeBankBalance(acc.id, state.ledger),
    })),
    [state.bankAccounts, state.ledger]
  );

  // ── Per-Shipment Balances ──────────────────────────────────────
  const shipmentBalances = useMemo(() => {
    return state.shipments.map(shipment => {
      const accounts = state.bankAccounts.map(acc => ({
        ...acc,
        balance: computeShipmentBalance(shipment.id, acc.id, state.ledger),
      }));
      const total = accounts.reduce((sum, a) => sum + a.balance, 0);
      return { shipment, accounts, total };
    });
  }, [state.shipments, state.bankAccounts, state.ledger]);

  // ── Top Debtors ────────────────────────────────────────────────
  const debtors = useMemo(() =>
    customerDebts.filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 5),
    [customerDebts]
  );

  // ── Active Shipment Stats ──────────────────────────────────────
  const activeShipmentInvoices = useMemo(() =>
    state.invoices.filter(i => i.shipmentId === activeShipmentId),
    [state.invoices, activeShipmentId]
  );

  const totalSoldUnits = useMemo(() =>
    activeShipmentInvoices.reduce((sum, inv) =>
      sum + inv.lines.reduce((s, line) => s + line.qty, 0), 0),
    [activeShipmentInvoices]
  );

  // ── Charts Data ────────────────────────────────────────────────
  const salesByDay = useMemo(() => {
    const map = new Map<string, number>();
    activeShipmentInvoices.forEach(inv => {
      const day = inv.date.substring(0, 10);
      map.set(day, (map.get(day) || 0) + inv.total);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, total]) => ({ date: date.substring(5), total }));
  }, [activeShipmentInvoices]);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    state.expenses
      .filter(e => e.shipmentId === activeShipmentId)
      .forEach(e => {
        const catName = state.expenseCategories.find(c => c.id === e.categoryId)?.name || '?';
        map.set(catName, (map.get(catName) || 0) + e.amount);
      });
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [state.expenses, state.expenseCategories, activeShipmentId]);

  const PIE_COLORS = ['#14b8a6', '#f59e0b', '#ef4444', '#6366f1', '#22c55e', '#ec4899', '#8b5cf6', '#06b6d4'];

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-4 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">{t('dashboard')}</h1>
      </div>

      {/* Top Row - KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <KPICard title={t('totalCash')} value={totalCash} icon={Wallet} color="bg-emerald-500" border="border-t-emerald-500" />
        <KPICard title={t('totalDebt')} value={totalDebt} icon={Users} color="bg-red-500" border="border-t-red-500" />
        <KPICard title={t('totalSales')} value={activeShipmentSales} icon={ShoppingCart} color="bg-[#14b8a6]" border="border-t-[#14b8a6]" />
        <KPICard title={t('totalExpenses')} value={activeShipmentExpenses} icon={Receipt} color="bg-amber-500" border="border-t-amber-500" />
      </div>

      {/* Bank Balances — Total */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('bankBalances')} — {t('allShipmentBalance')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {bankBalances.map(bank => (
            <div key={bank.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 border-t-4 border-t-slate-300 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{bank.name}</span>
              <span className={`text-lg font-bold ${bank.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatCurrency(bank.balance)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Shipment Balances (collapsible) */}
      <div>
        <button
          onClick={() => setShowAllShipmentBalances(!showAllShipmentBalances)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 hover:text-slate-700 transition-colors"
        >
          {t('shipmentBalances')}
          {showAllShipmentBalances ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showAllShipmentBalances && (
          <div className="space-y-4">
            {shipmentBalances.map(({ shipment, accounts, total }) => (
              <div key={shipment.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 text-sm">{shipment.name}</span>
                    {shipment.isActive && (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded">{t('active')}</span>
                    )}
                  </div>
                  <span className={`font-bold text-sm ${total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(total)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
                  {accounts.map(acc => (
                    <div key={acc.id} className="text-center">
                      <span className="text-[10px] text-slate-400 font-medium">{acc.name}</span>
                      <p className={`text-sm font-bold ${acc.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(acc.balance)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts Row */}
      {(salesByDay.length > 0 || expensesByCategory.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {salesByDay.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#14b8a6]" />
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('salesTrend')}</h2>
              </div>
              <div className="p-4" style={{ direction: 'ltr' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={salesByDay}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={60} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    <Bar dataKey="total" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {expensesByCategory.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('expenseBreakdown')}</h2>
              </div>
              <div className="p-4" style={{ direction: 'ltr' }}>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={expensesByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                      {expensesByCategory.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Debtors */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('topDebtors')}</h2>
          </div>
          <div className="md:hidden divide-y divide-slate-100">
            {debtors.length > 0 ? debtors.map((debtor) => (
              <div key={debtor.id} onClick={() => { setSelectedDebtorId(debtor.id); navigate(`/customers/${debtor.id}`); }} className="px-4 py-3 flex justify-between items-center gap-2 cursor-pointer hover:bg-[#f0fdfa] transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm truncate">{debtor.name}</p>
                  <p className="text-xs text-slate-500">{state.cities.find(c => c.id === debtor.cityId)?.name}</p>
                </div>
                <span className="font-bold text-red-600 text-sm flex-shrink-0">{formatCurrency(debtor.debt)}</span>
              </div>
            )) : (
              <div className="px-4 py-8 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">{t('noData')}</p>
              </div>
            )}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right text-slate-500">
              <thead>
                <tr className="bg-[#1E293B] text-white text-xs uppercase">
                  <th className="px-4 py-3">{t('customer')}</th>
                  <th className="px-4 py-3">{t('city')}</th>
                  <th className="px-4 py-3 text-right rtl:text-left">{t('amountOwed')}</th>
                </tr>
              </thead>
              <tbody>
                {debtors.length > 0 ? debtors.map((debtor) => (
                  <tr key={debtor.id} onClick={() => { setSelectedDebtorId(debtor.id); navigate(`/customers/${debtor.id}`); }} className={`border-b border-slate-50 transition-colors cursor-pointer ${selectedDebtorId === debtor.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{debtor.name}</td>
                    <td className="px-4 py-3">{state.cities.find(c => c.id === debtor.cityId)?.name}</td>
                    <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(debtor.debt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Shipment Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('shipmentStats')}</h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-6">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('soldUnits')}</span>
              <span className="text-xl sm:text-3xl font-bold text-slate-800">{new Intl.NumberFormat('en-US').format(totalSoldUnits)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('totalInvoices')}</span>
              <span className="text-xl sm:text-3xl font-bold text-slate-800">{new Intl.NumberFormat('en-US').format(activeShipmentInvoices.length)}</span>
            </div>
            <div className="flex flex-col col-span-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t('daysRunning')}</span>
              <span className="text-xl sm:text-3xl font-bold text-slate-800">
                {new Intl.NumberFormat('en-US').format(activeShipmentInvoices.length > 0
                  ? Math.max(1, Math.ceil((new Date().getTime() - new Date(
                      [...activeShipmentInvoices].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0].date
                    ).getTime()) / (1000 * 3600 * 24)))
                  : 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function KPICard({ title, value, icon: Icon, color, border }: { title: string; value: number; icon: any; color: string; border: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-100 border-t-4 ${border} p-4 sm:p-5`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{formatCurrency(value)}</p>
        </div>
        <div className={`p-2 sm:p-2.5 rounded-lg ${color} text-white flex-shrink-0`}>
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
    </div>
  );
}
