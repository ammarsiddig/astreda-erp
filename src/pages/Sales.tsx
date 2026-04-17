import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, Printer, Eye, Search, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import InvoiceModal from '../components/InvoiceModal';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { Invoice } from '../types';
import { canWrite, isSalesperson } from '../lib/permissions';
import { useToast } from '../components/Toast';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Sales() {
  const { t, lang } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const { showToast } = useToast();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const hasWriteAccess = canWrite(currentUser, state.roles, 'sales');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [showViewModal, setShowViewModal] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Invoice | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // O(1) lookup maps — avoids .find() inside render loops
  const customerMap  = useMemo(() => new Map(state.customers.map(c => [c.id, c])),    [state.customers]);
  const salespersonMap = useMemo(() => new Map(state.salespeople.map(s => [s.id, s])), [state.salespeople]);
  const cityMap      = useMemo(() => new Map(state.cities.map(c => [c.id, c])),        [state.cities]);
  const productMap   = useMemo(() => new Map(state.products.map(p => [p.id, p])),      [state.products]);

  const viewInvoice = useMemo(() => {
    return state.invoices.find(i => i.id === showViewModal);
  }, [state.invoices, showViewModal]);

  // Filters
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSalesperson, setFilterSalesperson] = useState('');
  const [filterPaymentType, setFilterPaymentType] = useState('');

  const filteredInvoices = useMemo(() => {
    return state.invoices.filter(inv => {
      if (inv.shipmentId !== activeShipmentId) return false;
      if (isSpRole && currentUser?.salespersonId && inv.salespersonId !== currentUser.salespersonId) return false;
      if (filterFromDate && inv.date < filterFromDate) return false;
      if (filterToDate && inv.date > filterToDate) return false;
      if (filterCity && inv.cityId !== filterCity) return false;
      if (filterSalesperson && inv.salespersonId !== filterSalesperson) return false;
      if (filterPaymentType && inv.paymentType !== filterPaymentType) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.invoices, activeShipmentId, filterFromDate, filterToDate, filterCity, filterSalesperson, filterPaymentType, isSpRole, currentUser]);

  const { items: sortedInvoices, requestSort: sortInvoices, sortConfig: invSortConfig } = useSortableData(filteredInvoices, { key: 'date', direction: 'desc' });

  const deleteInvoiceById = (invoice: Invoice) => {
    const txIds = new Set(
      state.inventoryTransactions.filter(t => t.referenceId === invoice.id || t.invoiceId === invoice.id).map(t => t.id)
    );
    updateState({
      invoices: state.invoices.filter(i => i.id !== invoice.id),
      inventoryTransactions: state.inventoryTransactions.filter(t => !txIds.has(t.id)),
      ledger: state.ledger.filter(e => e.linkedId !== invoice.id && e.referenceId !== invoice.id && (e as any).invoiceId !== invoice.id),
    });
  };

  const handleDeleteInvoice = () => {
    if (!showDeleteConfirm) return;
    deleteInvoiceById(showDeleteConfirm);
    showToast(t('deletedSuccessfully'));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(showDeleteConfirm.id); return n; });
    setShowDeleteConfirm(null);
  };

  const handleBulkDelete = () => {
    const toDelete = filteredInvoices.filter(i => selectedIds.has(i.id));
    const txIds = new Set(
      state.inventoryTransactions.filter(t => toDelete.some(inv => t.referenceId === inv.id || t.invoiceId === inv.id)).map(t => t.id)
    );
    const deletedIds = new Set(toDelete.map(i => i.id));
    updateState({
      invoices: state.invoices.filter(i => !deletedIds.has(i.id)),
      inventoryTransactions: state.inventoryTransactions.filter(t => !txIds.has(t.id)),
      ledger: state.ledger.filter(e => !deletedIds.has(e.linkedId!) && !deletedIds.has((e as any).referenceId) && !deletedIds.has((e as any).invoiceId)),
    });
    showToast(t('deletedSuccessfully'));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = filteredInvoices.length > 0 && filteredInvoices.every(i => selectedIds.has(i.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredInvoices.map(i => i.id)));
  };

  const handleOpenNewInvoice = () => {
    setInvoiceToEdit(null);
    setShowInvoiceModal(true);
  };

  const handleOpenEditInvoice = (invoice: Invoice) => {
    setInvoiceToEdit(invoice);
    setShowInvoiceModal(true);
  };

  const handlePrintInvoice = (invoice: Invoice) => {
    const customer = state.customers.find(c => c.id === invoice.customerId);
    const city = state.cities.find(c => c.id === invoice.cityId);
    const salesperson = state.salespeople.find(s => s.id === invoice.salespersonId);

    const linesHtml = invoice.lines.map((line, idx) => {
      const product = state.products.find(p => p.id === line.productId);
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:right">${product?.name || ''}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${new Intl.NumberFormat('en-US').format(line.qty)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:center">${new Intl.NumberFormat('en-US').format(line.unitPrice)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;text-align:left;font-weight:600">${new Intl.NumberFormat('en-US').format(line.total)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.id}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Cairo', sans-serif; direction: rtl; font-size: 11px; color: #1e293b; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; margin-bottom: 16px; }
    .company-name { font-size: 24px; font-weight: 800; color: #134e4a; }
    .company-sub { font-size: 10px; color: #64748b; margin-top: 3px; }
    .inv-meta { text-align: left; }
    .inv-num { font-size: 15px; font-weight: 700; color: #134e4a; }
    .inv-date { font-size: 10px; color: #64748b; margin-top: 3px; }
    .customer-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .info-label { font-size: 9px; color: #64748b; font-weight: 600; margin-bottom: 3px; letter-spacing: 0.3px; text-transform: uppercase; }
    .info-value { font-size: 13px; font-weight: 600; color: #1e293b; }
    .info-item { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: #134e4a; }
    th { padding: 8px 10px; font-size: 11px; font-weight: 600; color: white; }
    td { font-size: 11px; color: #334155; }
    .total-section { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #e2e8f0; padding-top: 12px; margin-bottom: 24px; }
    .total-label { font-size: 13px; font-weight: 700; color: #134e4a; }
    .total-value { font-size: 16px; font-weight: 800; color: #134e4a; }
    .footer { text-align: center; font-size: 10px; color: #64748b; padding-top: 12px; border-top: 1px solid #e2e8f0; }
  </style>
</head><body>
  <div class="header">
    <div>
      <div class="company-name">ASTREDA</div>
      <div class="company-sub">Frozen Food Distribution</div>
    </div>
    <div class="inv-meta">
      <div class="inv-num">#${invoice.id}</div>
      <div class="inv-date">${format(new Date(invoice.date), 'dd/MM/yyyy HH:mm')}</div>
    </div>
  </div>
  <div class="customer-section">
    <div>
      <div class="info-item">
        <div class="info-label">العميل</div>
        <div class="info-value">${customer?.name || ''}</div>
      </div>
    </div>
    <div>
      <div class="info-item">
        <div class="info-label">المدينة</div>
        <div class="info-value">${city?.name || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">المندوب</div>
        <div class="info-value">${salesperson?.name || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">نوع الدفع</div>
        <div class="info-value">${invoice.paymentType === 'cash' ? 'نقدي' : 'آجل'}</div>
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:right">المنتج</th>
        <th style="text-align:center">الكمية</th>
        <th style="text-align:center">سعر الوحدة</th>
        <th style="text-align:left">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div class="total-section">
    <span class="total-label">الإجمالي</span>
    <span class="total-value">${new Intl.NumberFormat('en-US').format(invoice.total)} SDG</span>
  </div>
  <div class="footer">شكراً لتعاملكم معنا</div>
</body></html>`;

    const w = window.open('', '', 'width=850,height=1000,scrollbars=1');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => { w.focus(); w.print(); };
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('sales')}</h1>
          {!hasWriteAccess && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>
          )}
        </div>
        {hasWriteAccess && <button onClick={handleOpenNewInvoice} className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm">
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('newInvoice')}
        </button>}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('fromDate')}</label>
          <input type="date" value={filterFromDate} onChange={(e) => setFilterFromDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('toDate')}</label>
          <input type="date" value={filterToDate} onChange={(e) => setFilterToDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('city')}</label>
          <SearchableSelect
            value={filterCity}
            onChange={(val) => setFilterCity(val)}
            options={[{ value: '', label: t('all') }, ...state.cities.map(c => ({ value: c.id, label: c.name }))]}
            placeholder={t('all')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('salesperson')}</label>
          <SearchableSelect
            value={filterSalesperson}
            onChange={(val) => setFilterSalesperson(val)}
            options={[{ value: '', label: t('all') }, ...state.salespeople.map(s => ({ value: s.id, label: s.name }))]}
            placeholder={t('all')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('paymentType')}</label>
          <select value={filterPaymentType} onChange={(e) => setFilterPaymentType(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value="">{t('all')}</option>
            <option value="cash">{t('cash')}</option>
            <option value="credit">{t('credit')}</option>
          </select>
        </div>
      </div>

      {/* Bulk-selection toolbar */}
      {hasWriteAccess && selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} {t('selected')}</span>
          <button onClick={() => setShowBulkDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />{t('deleteSelected')}
          </button>
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
      {/* Search & Sort Toolbar for Mobile */}
      <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortInvoices(e.target.value as any)}
            value={(invSortConfig?.key as string) || 'id'}
          >
            <option value="id">{t('invoiceNumber')}</option>
            <option value="date">{t('date')}</option>
            <option value="customerId">{t('customer')}</option>
            <option value="total">{t('total')}</option>
          </select>
        </div>
      </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedInvoices.length > 0 ? sortedInvoices.map((invoice, idx) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={invoice.id} onClick={() => { setSelectedRowId(invoice.id); setShowViewModal(invoice.id); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedIds.has(invoice.id) ? 'bg-red-50' : selectedRowId === invoice.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
              <div className="flex items-start gap-2">
                {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(invoice.id)} onChange={() => toggleSelect(invoice.id)} className="mt-1 w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6] flex-shrink-0" /></span>}
                <div className="flex-1 flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">#{invoice.id}</p>
                  <p className="text-xs text-slate-500">{customerMap.get(invoice.customerId)?.name}</p>
                  <p className="text-xs text-slate-400">{format(new Date(invoice.date), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="font-bold text-slate-900 text-sm">{formatCurrency(invoice.total)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t(invoice.paymentType)}
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-500">{salespersonMap.get(invoice.salespersonId)?.name}</span>
                <div className="flex gap-1">
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); handleOpenEditInvoice(invoice); }}
                    className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4"/>
                  </button>}
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(invoice.id); }}
                    className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Printer className="w-4 h-4"/>
                  </button>
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(invoice); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>}
                </div>
              </div>
              </div>
            </motion.div>
          )) : (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#1E293B] sticky top-0 z-10">
              <tr>
                {hasWriteAccess && <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('id')}><div className="flex items-center gap-1">{t('invoiceNumber')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'id'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('date')}><div className="flex items-center gap-1">{t('date')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'date'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('customerId')}><div className="flex items-center gap-1">{t('customer')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'customerId'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('salespersonId')}><div className="flex items-center gap-1">{t('salesperson')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'salespersonId'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('paymentType')}><div className="flex items-center gap-1">{t('paymentType')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'paymentType'}/></div></th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvoices('total')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('total')} <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'total'}/></div></th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedInvoices.length > 0 ? sortedInvoices.map((invoice, idx) => (
                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={invoice.id} onClick={() => { setSelectedRowId(invoice.id); setShowViewModal(invoice.id); }} className={`transition-colors cursor-pointer ${selectedIds.has(invoice.id) ? 'bg-red-50' : selectedRowId === invoice.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(invoice.id)} onChange={() => toggleSelect(invoice.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                  <td className="px-4 py-3 font-medium text-slate-900">{invoice.id}</td>
                  <td className="px-4 py-3">{format(new Date(invoice.date), 'dd/MM/yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{customerMap.get(invoice.customerId)?.name}</td>
                  <td className="px-4 py-3">{salespersonMap.get(invoice.salespersonId)?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700' }`}>
                      {t(invoice.paymentType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                    {formatCurrency(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-center flex justify-center gap-2">
                    {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); handleOpenEditInvoice(invoice); }}
                      className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                      title={t('edit')}
                    >
                      <Edit className="w-4 h-4"/>
                    </button>}
                    <button onClick={(e) => { e.stopPropagation(); setShowViewModal(invoice.id); }}
                      className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                      title={t('print')}
                    >
                      <Printer className="w-4 h-4"/>
                    </button>
                    {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(invoice); }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>}
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={hasWriteAccess ? 8 : 7} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvoiceModal && (
        <InvoiceModal isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)}
          invoiceToEdit={invoiceToEdit}
        />
      )}

      {/* View/Print Invoice Modal */}
      <Modal isOpen={!!showViewModal} onClose={() => setShowViewModal(null)} title={t('printInvoice')} size="2xl">
        {viewInvoice && (
          <div className="space-y-4" dir="rtl">
            {/* Preview */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-start bg-[#134e4a] text-white px-6 py-4">
                <div>
                  <h1 className="text-xl font-extrabold tracking-wide">ASTREDA</h1>
                  <p className="text-xs text-slate-300 mt-0.5">Frozen Food Distribution</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">#{viewInvoice.id}</p>
                  <p className="text-xs text-slate-300 mt-0.5">{format(new Date(viewInvoice.date), 'dd/MM/yyyy HH:mm')}</p>
                </div>
              </div>
              {/* Customer info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 px-6 py-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{t('customer')}</p>
                  <p className="text-sm font-bold text-slate-800">{customerMap.get(viewInvoice.customerId)?.name}</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('city')}</p>
                    <p className="text-sm font-semibold text-slate-800">{cityMap.get(viewInvoice.cityId)?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('salesperson')}</p>
                    <p className="text-sm font-semibold text-slate-800">{salespersonMap.get(viewInvoice.salespersonId)?.name}</p>
                  </div>
                </div>
              </div>
              {/* Lines table */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#134e4a] text-white text-xs uppercase">
                    <th className="px-4 py-2.5 text-right">{t('product')}</th>
                    <th className="px-4 py-2.5 text-center">{t('qty')}</th>
                    <th className="px-4 py-2.5 text-center">{t('unitPrice')}</th>
                    <th className="px-4 py-2.5 text-left">{t('total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewInvoice.lines.map((line, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{productMap.get(line.productId)?.name}</td>
                      <td className="px-4 py-2.5 text-center">{new Intl.NumberFormat('en-US').format(line.qty)}</td>
                      <td className="px-4 py-2.5 text-center">{new Intl.NumberFormat('en-US').format(line.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-left font-semibold">{new Intl.NumberFormat('en-US').format(line.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* Total */}
              <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-t-2 border-slate-200">
                <span className="text-sm font-bold text-slate-700">{t('total')}</span>
                <span className="text-lg font-extrabold text-[#134e4a]">{formatCurrency(viewInvoice.total)} SDG</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowViewModal(null)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
              >
                {t('close')}
              </button>
              <button onClick={() => handlePrintInvoice(viewInvoice)}
                className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
              >
                <Printer className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
                {t('print')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Single Delete Confirm */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          {showDeleteConfirm && <p className="font-semibold text-slate-800">#{showDeleteConfirm.id}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeleteInvoice} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Confirm */}
      <Modal isOpen={showBulkDeleteConfirm} onClose={() => setShowBulkDeleteConfirm(false)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')} ({selectedIds.size} {t('selected')})</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowBulkDeleteConfirm(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleBulkDelete} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
