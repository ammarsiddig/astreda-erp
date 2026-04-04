import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { formatCurrency, computeBankBalance } from '../lib/utils';
import { motion } from 'framer-motion';
import { Wallet, Users, ShoppingCart, Receipt } from 'lucide-react';

export default function Dashboard() {
  const { t, lang } = useTranslation();
  const { state, activeShipmentId } = useAppStore();

  // Calculate KPIs
  const totalCash = state.bankAccounts.reduce(
    (sum, acc) => sum + computeBankBalance(acc.id, state.ledger),
    0
  );

  const totalDebt = state.customers.reduce((sum, c) => {
    const sales = state.invoices.filter(i => i.customerId === c.id && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const payments = state.payments.filter(p => p.customerId === c.id).reduce((s, p) => s + p.amount, 0);
    return sum + (sales - payments);
  }, 0);

  const activeShipmentSales = state.invoices
    .filter(i => i.shipmentId === activeShipmentId)
    .reduce((sum, i) => sum + i.total, 0);

  const activeShipmentExpenses = state.expenses
    .filter(e => e.shipmentId === activeShipmentId)
    .reduce((sum, e) => sum + e.amount, 0);

  // Bank Balances
  const bankBalances = state.bankAccounts.map(acc => ({
    ...acc,
    balance: computeBankBalance(acc.id, state.ledger),
  }));

  // Top Debtors
  const debtors = state.customers.map(c => {
    const sales = state.invoices.filter(i => i.customerId === c.id && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const payments = state.payments.filter(p => p.customerId === c.id).reduce((s, p) => s + p.amount, 0);
    return { ...c, debt: sales - payments };
  }).filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt).slice(0, 5);

  // Active Shipment Stats
  const activeShipmentInvoices = state.invoices.filter(i => i.shipmentId === activeShipmentId);
  const totalSoldUnits = activeShipmentInvoices.reduce((sum, inv) => {
    return sum + inv.lines.reduce((s, line) => s + line.qty, 0);
  }, 0);

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
        <KPICard title={t('totalSales')} value={activeShipmentSales} icon={ShoppingCart} color="bg-blue-500" border="border-t-blue-500" />
        <KPICard title={t('totalExpenses')} value={activeShipmentExpenses} icon={Receipt} color="bg-amber-500" border="border-t-amber-500" />
      </div>

      {/* Middle Row - Bank Balances */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">{t('bankBalances')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Debtors */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('topDebtors')}</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-500 min-w-[400px]">
            <thead>
              <tr className="bg-[#1E293B] text-white text-xs uppercase">
                <th className="px-4 py-3">{t('customer')}</th>
                <th className="px-4 py-3">{t('city')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('amountOwed')}</th>
              </tr>
            </thead>
            <tbody>
              {debtors.length > 0 ? debtors.map((debtor) => (
                <tr key={debtor.id} className="border-b border-slate-50 hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{debtor.name}</td>
                  <td className="px-4 py-3">{state.cities.find(c => c.id === debtor.cityId)?.name}</td>
                  <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">
                    {formatCurrency(debtor.debt)}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
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
                  ? Math.max(1, Math.ceil((new Date().getTime() - new Date(activeShipmentInvoices[0].date).getTime()) / (1000 * 3600 * 24)))
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
