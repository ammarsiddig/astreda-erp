import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { ShoppingCart, Plus, Printer, Eye, Search, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import InvoiceModal from '../components/InvoiceModal';
import Modal from '../components/Modal';
import { Invoice } from '../types';
import { canWrite, isSalesperson } from '../lib/permissions';

export default function Sales() {
  const { t, lang } = useTranslation();
  const { state, activeShipmentId } = useAppStore();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const hasWriteAccess = canWrite(currentUser, state.roles, 'sales');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);
  const [showViewModal, setShowViewModal] = useState<string | null>(null);

  const viewInvoice = useMemo(() => {
    return state.invoices.find(i => i.id === showViewModal);
  }, [state.invoices, showViewModal]);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterSalesperson, setFilterSalesperson] = useState('');
  const [filterPaymentType, setFilterPaymentType] = useState('');

  const filteredInvoices = useMemo(() => {
    return state.invoices.filter(inv => {
      if (inv.shipmentId !== activeShipmentId) return false;
      if (isSpRole && currentUser?.salespersonId && inv.salespersonId !== currentUser.salespersonId) return false;
      if (filterDate && !inv.date.startsWith(filterDate)) return false;
      if (filterCity && inv.cityId !== filterCity) return false;
      if (filterSalesperson && inv.salespersonId !== filterSalesperson) return false;
      if (filterPaymentType && inv.paymentType !== filterPaymentType) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.invoices, activeShipmentId, filterDate, filterCity, filterSalesperson, filterPaymentType, isSpRole, currentUser]);

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
    .company-name { font-size: 24px; font-weight: 800; color: #0f2444; }
    .company-sub { font-size: 10px; color: #64748b; margin-top: 3px; }
    .inv-meta { text-align: left; }
    .inv-num { font-size: 15px; font-weight: 700; color: #0f2444; }
    .inv-date { font-size: 10px; color: #64748b; margin-top: 3px; }
    .customer-section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
    .info-label { font-size: 9px; color: #64748b; font-weight: 600; margin-bottom: 3px; letter-spacing: 0.3px; text-transform: uppercase; }
    .info-value { font-size: 13px; font-weight: 600; color: #1e293b; }
    .info-item { margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    thead tr { background: #0f2444; }
    th { padding: 8px 10px; font-size: 11px; font-weight: 600; color: white; }
    td { font-size: 11px; color: #334155; }
    .total-section { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #e2e8f0; padding-top: 12px; margin-bottom: 24px; }
    .total-label { font-size: 13px; font-weight: 700; color: #0f2444; }
    .total-value { font-size: 16px; font-weight: 800; color: #0f2444; }
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
      <div class="inv-date">${format(new Date(invoice.date), 'dd/MM/yyyy')}</div>
    </div>
  </div>
  <div class="customer-section">
    <div>
      <div class="info-item">
        <div class="info-label">العميل / Customer</div>
        <div class="info-value">${customer?.name || ''}</div>
      </div>
    </div>
    <div>
      <div class="info-item">
        <div class="info-label">المدينة / City</div>
        <div class="info-value">${city?.name || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">المندوب / Salesperson</div>
        <div class="info-value">${salesperson?.name || ''}</div>
      </div>
      <div class="info-item">
        <div class="info-label">نوع الدفع / Payment Type</div>
        <div class="info-value">${invoice.paymentType === 'cash' ? 'نقدي / Cash' : 'آجل / Credit'}</div>
      </div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:right">المنتج / Product</th>
        <th style="text-align:center">الكمية / Qty</th>
        <th style="text-align:center">سعر الوحدة / Unit Price</th>
        <th style="text-align:left">الإجمالي / Total</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>
  <div class="total-section">
    <span class="total-label">الإجمالي / Total</span>
    <span class="total-value">${new Intl.NumberFormat('en-US').format(invoice.total)} SDG</span>
  </div>
  <div class="footer">شكراً لتعاملكم معنا — Thank you for your business</div>
</body></html>`;

    const w = window.open('', '', 'width=850,height=1000,scrollbars=1');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.onload = () => { w.focus(); w.print(); };
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('sales')}</h1>
          {!hasWriteAccess && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">👁 وضع القراءة فقط</span>
          )}
        </div>
        {hasWriteAccess && <button onClick={handleOpenNewInvoice} className="flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-sm transition-colors shadow-sm">
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('newInvoice')}
        </button>}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('city')}</label>
          <select value={filterCity} onChange={(e) => setFilterCity(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          >
            <option value>{t('all')}</option>
            {state.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('salesperson')}</label>
          <select value={filterSalesperson} onChange={(e) => setFilterSalesperson(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          >
            <option value>{t('all')}</option>
            {state.salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('paymentType')}</label>
          <select value={filterPaymentType} onChange={(e) => setFilterPaymentType(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
          >
            <option value>{t('all')}</option>
            <option value="cash">{t('cash')}</option>
            <option value="credit">{t('credit')}</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600 min-w-[600px]">
            <thead className="text-xs text-white uppercase bg-[#1E293B]">
              <tr>
                <th className="px-4 py-3">{t('invoiceNumber')}</th>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3">{t('customer')}</th>
                <th className="px-4 py-3">{t('salesperson')}</th>
                <th className="px-4 py-3">{t('paymentType')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('total')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.length > 0 ? filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{invoice.id}</td>
                  <td className="px-4 py-3">{format(new Date(invoice.date), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3">{state.customers.find(c => c.id === invoice.customerId)?.name}</td>
                  <td className="px-4 py-3">{state.salespeople.find(s => s.id === invoice.salespersonId)?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700' }`}>
                      {t(invoice.paymentType)}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                    {formatCurrency(invoice.total)}
                  </td>
                  <td className="px-4 py-3 text-center flex justify-center gap-2">
                    {hasWriteAccess && <button onClick={() => handleOpenEditInvoice(invoice)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title={t('edit')}
                    >
                      <Edit className="w-4 h-4"/>
                    </button>}
                    <button onClick={() => setShowViewModal(invoice.id)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title={t('print')}
                    >
                      <Printer className="w-4 h-4"/>
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
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
              <div className="flex justify-between items-start bg-[#0F2444] text-white px-6 py-4">
                <div>
                  <h1 className="text-xl font-extrabold tracking-wide">ASTREDA</h1>
                  <p className="text-xs text-slate-300 mt-0.5">Frozen Food Distribution</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold">#{viewInvoice.id}</p>
                  <p className="text-xs text-slate-300 mt-0.5">{format(new Date(viewInvoice.date), 'dd/MM/yyyy')}</p>
                </div>
              </div>
              {/* Customer info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 px-6 py-4 border-b border-slate-100">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">العميل / Customer</p>
                  <p className="text-sm font-bold text-slate-800">{state.customers.find(c => c.id === viewInvoice.customerId)?.name}</p>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">المدينة / City</p>
                    <p className="text-sm font-semibold text-slate-800">{state.cities.find(c => c.id === viewInvoice.cityId)?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">المندوب / Salesperson</p>
                    <p className="text-sm font-semibold text-slate-800">{state.salespeople.find(s => s.id === viewInvoice.salespersonId)?.name}</p>
                  </div>
                </div>
              </div>
              {/* Lines table */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-slate-800 text-white text-xs uppercase">
                    <th className="px-4 py-2.5 text-right">المنتج</th>
                    <th className="px-4 py-2.5 text-center">الكمية</th>
                    <th className="px-4 py-2.5 text-center">سعر الوحدة</th>
                    <th className="px-4 py-2.5 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewInvoice.lines.map((line, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{state.products.find(p => p.id === line.productId)?.name}</td>
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
                <span className="text-sm font-bold text-slate-700">الإجمالي / Total</span>
                <span className="text-lg font-extrabold text-[#0F2444]">{formatCurrency(viewInvoice.total)} SDG</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowViewModal(null)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
              >
                {t('close')}
              </button>
              <button onClick={() => handlePrintInvoice(viewInvoice)}
                className="flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold shadow-sm transition-colors"
              >
                <Printer className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
                {t('print')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
