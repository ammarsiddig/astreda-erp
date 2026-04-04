import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Edit, Edit2, Trash2, Printer, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency } from '../lib/utils';
import InvoiceModal from '../components/InvoiceModal';
import Modal from '../components/Modal';
import { v4 as uuidv4 } from 'uuid';
import { Payment } from '../types';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, lang } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();

  const [activeTab, setActiveTab] = useState<'invoices' | 'payments'>('invoices');

  // Invoice Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<any>(null);
  const [showPrintModal, setShowPrintModal] = useState<string | null>(null);

  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [showDeletePaymentConfirm, setShowDeletePaymentConfirm] = useState<Payment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  const customer = state.customers.find(c => c.id === id);

  const invoices = useMemo(() => {
    return state.invoices.filter(i => i.customerId === id && i.shipmentId === activeShipmentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.invoices, id, activeShipmentId]);

  const payments = useMemo(() => {
    return state.payments.filter(p => p.customerId === id && p.shipmentId === activeShipmentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.payments, id, activeShipmentId]);

  const totalSales = useMemo(() => {
    return invoices.reduce((sum, inv) => sum + inv.total, 0);
  }, [invoices]);

  const totalPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const totalDebt = totalSales - totalPaid;

  if (!customer) {
    return <div>Customer not found</div>;
  }

  const handleOpenEditInvoice = (invoice: any) => {
    setInvoiceToEdit(invoice);
    setShowInvoiceModal(true);
  };

  const handleDeleteInvoice = (invoiceId: string) => {
    if (window.confirm(t('confirmDelete'))) {
      const invoice = state.invoices.find(i => i.id === invoiceId);
      if (!invoice) return;

      const invoiceTransactions = state.inventoryTransactions.filter(
        t => t.referenceId === invoice.id || t.invoiceId === invoice.id
      );

      const invoiceTransactionIds = new Set(invoiceTransactions.map(t => t.id));
      const updatedInventoryTransactions = state.inventoryTransactions.filter(
        t => !invoiceTransactionIds.has(t.id)
      );

      const updatedInvoices = state.invoices.filter(i => i.id !== invoice.id);

      const updatedCustomers = state.customers.map(c => {
        if (c.id !== invoice.customerId) return c;
        if (invoice.paymentType !== 'credit') return c;
        return { ...c, debt: (c.debt || 0) - invoice.total };
      });

      const invoiceLedgerEntries = state.ledger.filter(
        e => e.linkedId === invoice.id || e.referenceId === invoice.id || e.invoiceId === invoice.id
      );

      const updatedLedger = state.ledger.filter(
        e => e.linkedId !== invoice.id && e.referenceId !== invoice.id && e.invoiceId !== invoice.id
      );

      let updatedBankAccounts = state.bankAccounts;
      if (invoice.paymentType === 'cash' && invoice.bankAccountId) {
        const reversalAmount = invoiceLedgerEntries
          .filter(e => e.sourceModule === 'sale_cash' && e.toAccount === invoice.bankAccountId)
          .reduce((sum, e) => sum + e.amountIn - e.amountOut, 0);

        if (reversalAmount !== 0) {
          updatedBankAccounts = state.bankAccounts.map(b =>
            b.id === invoice.bankAccountId && typeof b.balance === 'number'
              ? { ...b, balance: b.balance - reversalAmount }
              : b
          );
        }
      }

      updateState({
        invoices: updatedInvoices,
        inventoryTransactions: updatedInventoryTransactions,
        customers: updatedCustomers,
        ledger: updatedLedger,
        bankAccounts: updatedBankAccounts,
      });
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmount(0);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setBankAccountId('');
    setPaymentNotes('');
    setEditingPayment(null);
  };

  const openEditPayment = (payment: Payment) => {
    setPaymentDate(payment.date);
    setPaymentAmount(payment.amount);
    setBankAccountId(payment.bankAccountId);
    setPaymentNotes(payment.notes || '');
    setEditingPayment(payment);
    setShowPaymentModal(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !bankAccountId) return;

    const isEditing = !!editingPayment;
    const paymentId = isEditing ? editingPayment!.id : `PM-${Date.now()}`;

    const newPayment: Payment = {
      id: paymentId,
      customerId: id!,
      amount: paymentAmount,
      date: paymentDate,
      bankAccountId,
      shipmentId: activeShipmentId,
      notes: paymentNotes,
      salespersonId: customer.salespersonId
    };

    let newBankAccounts = [...state.bankAccounts];
    let newLedger = [...state.ledger];

    if (isEditing) {
      // Reverse old effects (same pattern as Payments.tsx)
      const oldPayment = editingPayment!;
      newBankAccounts = newBankAccounts.map(b =>
        b.id === oldPayment.bankAccountId ? { ...b, balance: b.balance - oldPayment.amount } : b
      );
      newLedger = newLedger.filter(l => l.linkedId !== oldPayment.id);
    }

    // Apply new effects
    newBankAccounts = newBankAccounts.map(b =>
      b.id === bankAccountId ? { ...b, balance: b.balance + paymentAmount } : b
    );

    const newLedgerEntry = {
      id: uuidv4(),
      date: paymentDate,
      toAccount: bankAccountId,
      description: `سداد دفعة من عميل / Payment from ${customer.name}${paymentNotes ? ` (${paymentNotes})` : ''}`,
      amountIn: paymentAmount,
      amountOut: 0,
      sourceModule: 'payment' as const,
      linkedId: paymentId,
      shipmentId: activeShipmentId,
    };

    updateState({
      payments: isEditing
        ? state.payments.map(p => p.id === paymentId ? newPayment : p)
        : [...state.payments, newPayment],
      ledger: [...newLedger, newLedgerEntry],
      bankAccounts: newBankAccounts,
    });

    setShowPaymentModal(false);
    resetPaymentForm();
  };

  const handleDeletePayment = () => {
    if (!showDeletePaymentConfirm) return;
    const payment = showDeletePaymentConfirm;

    const newBankAccounts = state.bankAccounts.map(b =>
      b.id === payment.bankAccountId ? { ...b, balance: b.balance - payment.amount } : b
    );

    updateState({
      payments: state.payments.filter(p => p.id !== payment.id),
      ledger: state.ledger.filter(l => l.linkedId !== payment.id),
      bankAccounts: newBankAccounts,
    });

    setShowDeletePaymentConfirm(null);
  };

  // Calculate running balance for payments
  let runningBalance = totalSales;
  const paymentsWithBalance = [...payments].reverse().map(p => {
    runningBalance -= p.amount;
    return { ...p, balanceAfter: runningBalance };
  }).reverse();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/customers')}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowLeft className={`w-5 h-5 ${lang === 'ar' ? 'rotate-180' : ''}`}/>
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">{customer.name}</h1>
          <p className="text-sm text-slate-500">{customer.phone} - {state.cities.find(c => c.id === customer.cityId)?.name}</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500 mb-1">{t('totalSales')}</h3>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalSales)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500 mb-1">{t('totalPaid')}</h3>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-medium text-slate-500 mb-1">{t('totalPayments')}</h3>
          <p className="text-2xl font-bold text-[#F59E0B]">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-[#134e4a] p-6 rounded-xl shadow-sm text-white">
          <h3 className="text-sm font-medium text-slate-300 mb-1">{t('totalDebt')}</h3>
          <p className={`text-2xl font-bold ${totalDebt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatCurrency(totalDebt)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 rtl:space-x-reverse border-b border-slate-200">
        <button onClick={() => setActiveTab('invoices')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'invoices'
              ? 'border-[#134e4a] text-[#134e4a]'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          {t('invoices')}
        </button>
        <button onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'payments'
              ? 'border-[#134e4a] text-[#134e4a]'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          {t('payments')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {activeTab === 'invoices' && (
          <>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {invoices.length > 0 ? invoices.map((invoice) => (
                <div key={invoice.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">#{invoice.id}</p>
                      <p className="text-xs text-slate-400">{format(new Date(invoice.date), 'dd/MM/yyyy')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="font-bold text-slate-900 text-sm">{formatCurrency(invoice.total)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {t(invoice.paymentType)}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => handleOpenEditInvoice(invoice)} className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"><Edit className="w-4 h-4"/></button>
                    <button onClick={() => setShowPrintModal(invoice.id)} className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"><Printer className="w-4 h-4"/></button>
                    <button onClick={() => handleDeleteInvoice(invoice.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              )) : (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                <thead className="text-xs text-white uppercase bg-[#1E293B]">
                  <tr>
                    <th className="px-4 py-3">{t('invoiceNumber')}</th>
                    <th className="px-4 py-3">{t('date')}</th>
                    <th className="px-4 py-3">{t('paymentType')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{t('total')}</th>
                    <th className="px-4 py-3 text-center">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoices.length > 0 ? invoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-[#f0fdfa] transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{invoice.id}</td>
                      <td className="px-4 py-3">{format(new Date(invoice.date), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${ invoice.paymentType === 'cash' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700' }`}>
                          {t(invoice.paymentType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-3 text-center flex justify-center gap-2">
                        <button onClick={() => handleOpenEditInvoice(invoice)}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit className="w-4 h-4"/>
                        </button>
                        <button onClick={() => setShowPrintModal(invoice.id)}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('print')}
                        >
                          <Printer className="w-4 h-4"/>
                        </button>
                        <button onClick={() => handleDeleteInvoice(invoice.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
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
          </>
        )}

        {activeTab === 'payments' && (
          <div>
            <div className="p-4 border-b border-slate-200 flex justify-end">
              <button onClick={() => setShowPaymentModal(true)}
                className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0"/>
                {t('addPayment')}
              </button>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {paymentsWithBalance.length > 0 ? paymentsWithBalance.map((payment) => (
                <div key={payment.id} className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500">{format(new Date(payment.date), 'dd/MM/yyyy')}</p>
                      <p className="text-xs text-slate-400">{state.bankAccounts.find(b => b.id === payment.bankAccountId)?.name}</p>
                      {payment.notes && <p className="text-xs text-slate-500 truncate">{payment.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="font-bold text-emerald-600 text-sm">{formatCurrency(payment.amount)}</span>
                      <span className="text-xs text-slate-500">{t('balance')}: {formatCurrency(payment.balanceAfter)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openEditPayment(payment)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>
                    <button onClick={() => setShowDeletePaymentConfirm(payment)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                  </div>
                </div>
              )) : (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                <thead className="text-xs text-white uppercase bg-[#1E293B]">
                  <tr>
                    <th className="px-4 py-3">{t('date')}</th>
                    <th className="px-4 py-3">{t('bankAccount')}</th>
                    <th className="px-4 py-3">{t('notes')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{t('amount')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{t('balance')}</th>
                    <th className="px-4 py-3 text-center">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentsWithBalance.length > 0 ? paymentsWithBalance.map((payment) => (
                    <tr key={payment.id} className="hover:bg-[#f0fdfa] transition-colors">
                      <td className="px-4 py-3">{format(new Date(payment.date), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3">{state.bankAccounts.find(b => b.id === payment.bankAccountId)?.name}</td>
                      <td className="px-4 py-3">{payment.notes}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 text-right rtl:text-left">
                        {formatCurrency(payment.amount)}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                        {formatCurrency(payment.balanceAfter)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <button onClick={() => openEditPayment(payment)}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title={t('edit')}
                          >
                            <Edit2 className="w-4 h-4"/>
                          </button>
                          <button onClick={() => setShowDeletePaymentConfirm(payment)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('delete')}
                          >
                            <Trash2 className="w-4 h-4"/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showInvoiceModal && (
        <InvoiceModal isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)}
          invoiceToEdit={invoiceToEdit}
        />
      )}

      {/* Print Modal */}
      <Modal isOpen={!!showPrintModal} onClose={() => setShowPrintModal(null)} title={t('printInvoice')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('printInvoiceConfirm')}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowPrintModal(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button onClick={() => {
                window.open(`/print/invoice/${showPrintModal}`, '_blank');
                setShowPrintModal(null);
              }}
              className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors flex items-center"
            >
              <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0"/>
              {t('print')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Payment Confirmation Modal */}
      <Modal isOpen={!!showDeletePaymentConfirm} onClose={() => setShowDeletePaymentConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeletePaymentConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleDeletePayment}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              {t('yes')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Add/Edit Payment Modal */}
      <Modal isOpen={showPaymentModal} onClose={() => { setShowPaymentModal(false); resetPaymentForm(); }} title={editingPayment ? t('edit') : t('addPayment')} size="md">
        <form onSubmit={handleSavePayment} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
            <input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')}</label>
            <input type="number" required min="0.01" step="0.01" value={paymentAmount || ''} onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
            <select required value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            >
              <option value>{t('select')}</option>
              {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
            <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => { setShowPaymentModal(false); resetPaymentForm(); }}
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
    </motion.div>
  );
}
