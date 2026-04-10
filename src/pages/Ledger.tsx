import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import SearchableSelect from '../components/SearchableSelect';
import { Printer, FileText } from 'lucide-react';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Ledger() {
  const { t } = useTranslation();
  const { state, activeShipmentId } = useAppStore();

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [showAllShipments, setShowAllShipments] = useState(false);

  // Account Statement modal state
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [stmtFromDate, setStmtFromDate] = useState('');
  const [stmtToDate, setStmtToDate] = useState('');
  const [stmtAccount, setStmtAccount] = useState('');
  const [stmtType, setStmtType] = useState<'all' | 'in' | 'out'>('all');

  const ledgerData = useMemo(() => {
    let filtered = [...state.ledger];

    if (!showAllShipments && activeShipmentId) {
      filtered = filtered.filter(entry => entry.shipmentId === activeShipmentId);
    }

    if (filterStartDate) filtered = filtered.filter(entry => entry.date >= filterStartDate);
    if (filterEndDate) filtered = filtered.filter(entry => entry.date <= filterEndDate);
    if (filterAccount) {
      filtered = filtered.filter(entry => entry.fromAccount === filterAccount || entry.toAccount === filterAccount);
    }
    if (filterModule) filtered = filtered.filter(entry => entry.sourceModule === filterModule);

    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = 0;
    return filtered.map(entry => {
      if (filterAccount) {
        if (entry.toAccount === filterAccount) {
          runningBalance += entry.amountIn;
          if (!entry.fromAccount) runningBalance -= entry.amountOut;
        }
        if (entry.fromAccount === filterAccount) {
          runningBalance -= entry.amountOut;
        }
      } else {
        runningBalance += entry.amountIn - entry.amountOut;
      }
      return { ...entry, balance: runningBalance };
    }).reverse();
  }, [state.ledger, filterStartDate, filterEndDate, filterAccount, filterModule, showAllShipments, activeShipmentId]);

  const { items: sortedLedgerData, requestSort, sortConfig } = useSortableData(ledgerData, { key: 'date', direction: 'desc' });

  const printAccountStatement = () => {
    if (!stmtFromDate || !stmtToDate) return;

    const shipmentName = state.shipments.find(s => s.id === activeShipmentId)?.name || 'الرسالة الحالية';
    const accountName = stmtAccount
      ? state.bankAccounts.find(b => b.id === stmtAccount)?.name || 'غير محدد'
      : 'جميع الحسابات';
    const fromDateStr = format(new Date(stmtFromDate), 'dd/MM/yyyy HH:mm');
    const toDateStr = format(new Date(stmtToDate), 'dd/MM/yyyy HH:mm');
    const printDateTime = format(new Date(), 'dd/MM/yyyy HH:mm');
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));

    // Opening balance: all ledger entries strictly before stmtFromDate (with shipment filter)
    let beforeEntries = state.ledger.filter(e => e.date < stmtFromDate);
    if (!showAllShipments && activeShipmentId) {
      beforeEntries = beforeEntries.filter(e => e.shipmentId === activeShipmentId);
    }
    let openingBalance = 0;
    if (stmtAccount) {
      beforeEntries.forEach(e => {
        if (e.toAccount === stmtAccount) {
          openingBalance += e.amountIn;
          if (!e.fromAccount) openingBalance -= e.amountOut;
        }
        if (e.fromAccount === stmtAccount) {
          openingBalance -= e.amountOut;
        }
      });
    } else {
      beforeEntries.forEach(e => {
        openingBalance += e.amountIn - e.amountOut;
      });
    }

    // Statement entries within range (with shipment filter)
    let stmtEntries = state.ledger
      .filter(e => {
        if (!showAllShipments && activeShipmentId && e.shipmentId !== activeShipmentId) return false;
        if (e.date < stmtFromDate || e.date > stmtToDate) return false;
        if (stmtAccount && e.fromAccount !== stmtAccount && e.toAccount !== stmtAccount) return false;
        return true;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (stmtType === 'in') stmtEntries = stmtEntries.filter(e => e.amountIn > 0);
    if (stmtType === 'out') stmtEntries = stmtEntries.filter(e => e.amountOut > 0);

    // Running balance per row
    let runBal = openingBalance;
    const entriesWithBalance = stmtEntries.map(e => {
      if (stmtAccount) {
        if (e.toAccount === stmtAccount) {
          runBal += e.amountIn;
          if (!e.fromAccount) runBal -= e.amountOut;
        }
        if (e.fromAccount === stmtAccount) {
          runBal -= e.amountOut;
        }
      } else {
        runBal += e.amountIn - e.amountOut;
      }
      return { ...e, runningBalance: runBal };
    });

    const totalIn = stmtEntries.reduce((s, e) => s + e.amountIn, 0);
    const totalOut = stmtEntries.reduce((s, e) => s + e.amountOut, 0);
    const closingBalance = entriesWithBalance.length > 0
      ? entriesWithBalance[entriesWithBalance.length - 1].runningBalance
      : openingBalance;

    const moduleLabel = (mod: string) => {
      const map: Record<string, string> = {
        sale_cash: 'مبيعات',
        payment: 'مدفوعات',
        expense: 'مصروفات',
        salary: 'رواتب',
        general_transfer: 'تحاويل',
        account_transfer: 'تحويل حساب',
      };
      return map[mod] || mod;
    };

    const getAccountName = (accountId?: string) => {
      if (!accountId) return '-';
      return state.bankAccounts.find(b => b.id === accountId)?.name || accountId;
    };

    const rowsHtml = entriesWithBalance.map((e, i) => {
      const acctDisplay = e.fromAccount
        ? getAccountName(e.fromAccount)
        : e.toAccount
        ? getAccountName(e.toAccount)
        : '-';
      return `
    <tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td class="center date">${format(new Date(e.date), 'dd/MM/yyyy HH:mm')}</td>
      <td class="desc">${e.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
      <td class="center"><span class="badge">${moduleLabel(e.sourceModule)}</span></td>
      <td class="center acct">${acctDisplay}</td>
      <td class="num in">${e.amountIn > 0 ? fmt(e.amountIn) : '—'}</td>
      <td class="num out">${e.amountOut > 0 ? fmt(e.amountOut) : '—'}</td>
      <td class="num bal">${fmt(e.runningBalance)}</td>
    </tr>`;
    }).join('');

    const emptyRow = `<tr><td colspan="7" style="text-align:center;padding:14px;color:#94a3b8;font-size:11px;">لا توجد معاملات في هذه الفترة</td></tr>`;

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>كشف الحساب المالي — أستريدا للتوزيع</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', Arial, sans-serif;
    direction: rtl;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-size: 10px;
  }

  /* Header */
  .header { text-align: center; margin-bottom: 8px; }
  .company  { font-size: 22px; font-weight: 900; color: #134e4a; letter-spacing: -0.5px; }
  .stmt-title { font-size: 13px; font-weight: 700; color: #1e40af; margin: 2px 0 6px; }
  .meta { font-size: 10.5px; color: #334155; margin-bottom: 2px; }
  .divider { border: none; border-top: 3px solid #134e4a; margin: 8px 0; }

  /* Opening balance */
  .opening-row {
    display: flex; justify-content: space-between; align-items: center;
    background: #dbeafe; border: 1px solid #93c5fd;
    border-radius: 6px; padding: 5px 10px;
    font-size: 12px; font-weight: 700; color: #1e3a8a;
    margin-bottom: 6px;
  }

  /* Table */
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  thead tr { background-color: #134e4a !important; }
  th {
    padding: 5px 4px; font-weight: 700; text-align: center;
    border: 1px solid #134e4a; color: #fff;
    background-color: #134e4a !important; font-size: 9.5px;
  }
  th.desc-h { text-align: right; }
  td { padding: 3px 4px; border: 1px solid #e2e8f0; vertical-align: middle; }
  tr.alt td { background-color: #f8fafc !important; }

  td.center { text-align: center; }
  td.date   { white-space: nowrap; text-align: center; }
  td.desc   { text-align: right; font-size: 9px; max-width: 170px; line-height: 1.3; }
  td.acct   { text-align: center; font-size: 8.5px; color: #475569; }
  td.num    { text-align: center; font-weight: 600; white-space: nowrap; }
  td.in     { color: #059669; }
  td.out    { color: #dc2626; }
  td.bal    { color: #134e4a; font-weight: 700; }

  .badge {
    display: inline-block;
    background: #e2e8f0; color: #475569;
    border-radius: 999px; padding: 1px 5px;
    font-size: 8px; white-space: nowrap;
  }

  /* Footer totals row */
  tfoot tr td {
    background-color: #1e293b !important;
    color: #fff;
    border: 1px solid #134e4a;
    font-size: 10px;
    font-weight: 900;
    text-align: center;
    padding: 5px 4px;
  }
  tfoot td.lbl { text-align: right; }
  tfoot td.in  { color: #6ee7b7; }
  tfoot td.out { color: #fca5a5; }
  tfoot td.bal { color: #fde68a; }

  /* Closing box */
  .closing-box {
    display: flex; justify-content: space-between; align-items: center;
    background: #134e4a; color: #fff;
    border-radius: 8px; padding: 8px 14px;
    margin-top: 8px;
  }
  .closing-label { font-size: 13px; font-weight: 700; }
  .closing-value { font-size: 20px; font-weight: 900; }

  /* Page footer */
  .page-footer {
    display: flex; justify-content: space-between; align-items: flex-end;
    margin-top: 10px; font-size: 8.5px; color: #94a3b8;
  }
</style>
</head>
<body>

<div class="header">
  <div class="company">أستريدا للتوزيع</div>
  <div class="stmt-title">كشف الحساب المالي</div>
  <div class="meta">الفترة من: <strong>${fromDateStr}</strong> &nbsp;إلى:&nbsp; <strong>${toDateStr}</strong></div>
  <div class="meta">الحساب: <strong>${accountName}</strong></div>
  <div class="meta">الرسالة: <strong>${shipmentName}</strong></div>
</div>

<hr class="divider" />

<div class="opening-row">
  <span>الرصيد الافتتاحي</span>
  <span>SDG &nbsp;${fmt(openingBalance)}</span>
</div>

<table>
  <thead>
    <tr>
      <th style="width:9%">التاريخ</th>
      <th class="desc-h" style="width:28%">الوصف</th>
      <th style="width:9%">المصدر</th>
      <th style="width:12%">الحساب</th>
      <th style="width:11%">وارد</th>
      <th style="width:11%">منصرف</th>
      <th style="width:12%">الرصيد</th>
    </tr>
  </thead>
  <tbody>
    ${rowsHtml || emptyRow}
  </tbody>
  <tfoot>
    <tr>
      <td colspan="4" class="lbl">الإجمالي</td>
      <td class="in">${fmt(totalIn)}</td>
      <td class="out">${fmt(totalOut)}</td>
      <td class="bal">${fmt(closingBalance)}</td>
    </tr>
  </tfoot>
</table>

<div class="closing-box">
  <span class="closing-label">الرصيد الختامي</span>
  <span class="closing-value">SDG &nbsp;${fmt(closingBalance)}</span>
</div>

<div class="page-footer">
  <span></span>
  <span>أستريدا للتوزيع — نظام إدارة التوزيع</span>
  <span>تاريخ الطباعة: ${printDateTime}</span>
</div>

<script>
  window.onload = function() {
    window.print();
    window.onafterprint = function() { window.close(); };
  };
<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-xl font-bold text-slate-800">{t('ledger')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStatementModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            كشف حساب
          </button>
          <button
            onClick={() => setShowAllShipments(v => !v)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
              showAllShipments
                ? 'bg-[#134e4a] text-white border-[#134e4a] hover:bg-[#0c3531]'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {showAllShipments ? 'جميع الرسائل' : state.shipments.find(s => s.id === activeShipmentId)?.name || t('activeShipment')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-modern glass border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('startDate')}</label>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('endDate')}</label>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('bankAccount')}</label>
          <SearchableSelect
            value={filterAccount}
            onChange={(val) => setFilterAccount(val)}
            options={[{ value: '', label: t('all') }, ...state.bankAccounts.map(b => ({ value: b.id, label: b.name }))]}
            placeholder={t('all')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('source')}</label>
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value="">{t('all')}</option>
            <option value="sale_cash">{t('sales')}</option>
            <option value="payment">{t('payments')}</option>
            <option value="expense">{t('expenses')}</option>
            <option value="salary">{t('salaries')}</option>
            <option value="general_transfer">{t('generalTransfers')}</option>
            <option value="account_transfer">{t('accountTransfers')}</option>
          </select>
        </div>
      </div>

      {/* Search & Sort Toolbar for Mobile */}
      <div className="md:hidden bg-white p-4 rounded-xl shadow-modern glass border-slate-200 mb-4">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-slate-50 border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => requestSort(e.target.value as any)}
            value={(sortConfig?.key as string) || 'id'}
          >
            <option value="id">رقم القيد</option>
            <option value="date">التاريخ</option>
            <option value="amountIn">الوارد</option>
            <option value="amountOut">المنصرف</option>
            <option value="balance">الرصيد</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-xl shadow-modern glass border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedLedgerData.length > 0 ? sortedLedgerData.map((entry, idx) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={entry.id} onClick={() => setSelectedRowId(entry.id)} className={`p-4 space-y-1 cursor-pointer transition-colors ${selectedRowId === entry.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900 leading-snug line-clamp-2">{entry.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{format(new Date(entry.date), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md flex-shrink-0">
                  {t(entry.sourceModule === 'sale_cash' ? 'sales' :
                     entry.sourceModule === 'payment' ? 'payments' :
                     entry.sourceModule === 'expense' ? 'expenses' :
                     entry.sourceModule === 'salary' ? 'salaries' :
                     entry.sourceModule === 'general_transfer' ? 'generalTransfers' :
                     'accountTransfers')}
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <div className="flex gap-3 text-xs">
                  {entry.amountIn > 0 && <span className="text-emerald-600 font-bold">+{formatCurrency(entry.amountIn)}</span>}
                  {entry.amountOut > 0 && <span className="text-red-600 font-bold">-{formatCurrency(entry.amountOut)}</span>}
                </div>
                {filterAccount && <span className="text-xs font-bold text-slate-700">{formatCurrency(entry.balance)}</span>}
              </div>
            </motion.div>
          )) : (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#134e4a] sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('date')}><div className="flex items-center gap-1">{t('date')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'date'}/></div></th>
                <th className="px-4 py-3">{t('description')}</th>
                <th className="px-4 py-3">{t('source')}</th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('amountIn')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('in')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'amountIn'}/></div></th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('amountOut')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('out')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'amountOut'}/></div></th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('balance')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('balance')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'balance'}/></div></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLedgerData.length > 0 ? sortedLedgerData.map((entry, idx) => (
                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }} key={entry.id} onClick={() => setSelectedRowId(entry.id)} className={`transition-colors cursor-pointer ${selectedRowId === entry.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  <td className="px-4 py-3">{format(new Date(entry.date), 'dd/MM/yyyy HH:mm')}</td>
                  <td className="px-4 py-3 text-slate-900 font-medium">{entry.description}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-xs">
                      {t(entry.sourceModule === 'sale_cash' ? 'sales' :
                         entry.sourceModule === 'payment' ? 'payments' :
                         entry.sourceModule === 'expense' ? 'expenses' :
                         entry.sourceModule === 'salary' ? 'salaries' :
                         entry.sourceModule === 'general_transfer' ? 'generalTransfers' :
                         'accountTransfers')}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-600 text-right rtl:text-left">
                    {entry.amountIn > 0 ? formatCurrency(entry.amountIn) : '-'}
                  </td>
                  <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">
                    {entry.amountOut > 0 ? formatCurrency(entry.amountOut) : '-'}
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                    {filterAccount ? formatCurrency(entry.balance) : '-'}
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Account Statement Modal */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#134e4a]" />
                <h2 className="text-base font-bold text-slate-800">كشف حساب</h2>
              </div>
              <button
                onClick={() => setShowStatementModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('fromDate')} <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={stmtFromDate}
                    onChange={(e) => setStmtFromDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('toDate')} <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={stmtToDate}
                    onChange={(e) => setStmtToDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
                <SearchableSelect
                  value={stmtAccount}
                  onChange={(val) => setStmtAccount(val)}
                  options={[{ value: '', label: t('allAccounts') }, ...state.bankAccounts.map(b => ({ value: b.id, label: b.name }))]}
                  placeholder={t('allAccounts')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('statementType')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'all', label: t('allTransactions') },
                    { value: 'in',  label: t('inOnly') },
                    { value: 'out', label: t('outOnly') },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setStmtType(opt.value as any)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
                        stmtType === opt.value
                          ? 'bg-[#134e4a] text-white border-[#134e4a]'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick summary preview */}
              {stmtFromDate && stmtToDate && (
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-xs text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>{t('account')}:</span>
                    <span className="font-medium text-slate-700">
                      {stmtAccount ? state.bankAccounts.find(b => b.id === stmtAccount)?.name : t('allAccounts')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('period')}:</span>
                    <span className="font-medium text-slate-700">
                      {format(new Date(stmtFromDate), 'dd/MM/yyyy HH:mm')} → {format(new Date(stmtToDate), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('shipment')}:</span>
                    <span className="font-medium text-slate-700">
                      {state.shipments.find(s => s.id === activeShipmentId)?.name || '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setShowStatementModal(false)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold text-sm transition-colors"
              >
                {t('close')}
              </button>
              <button
                onClick={printAccountStatement}
                disabled={!stmtFromDate || !stmtToDate}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
              >
                <Printer className="w-4 h-4" />
                {t('print')}
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
