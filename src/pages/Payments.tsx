import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { DollarSign, Plus, Search, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { useToast } from '../components/Toast';
import { buildLedgerEntryId, dateTimeFromDateString, formatCurrency, generateId, getCurrentDateInputValue } from '../lib/utils';
import { Payment } from '../types';
import { canWrite } from '../lib/permissions';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Payments() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const { showToast } = useToast();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'payments');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Payment | null>(null);
  const [showViewModal, setShowViewModal] = useState<Payment | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Payment | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Filters
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');

  // Form State
  const [date, setDate] = useState(getCurrentDateInputValue());
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');

  // O(1) lookup maps — avoids .find() inside render loops
  const customerMap = useMemo(() => new Map(state.customers.map(c => [c.id, c])), [state.customers]);
  const bankAccountMap = useMemo(() => new Map(state.bankAccounts.map(b => [b.id, b])), [state.bankAccounts]);

  const filteredPayments = useMemo(() => {
    return state.payments.filter(p => {
      if (p.shipmentId !== activeShipmentId) return false;
      if (filterFromDate && p.date.slice(0, 10) < filterFromDate) return false;
      if (filterToDate && p.date.slice(0, 10) > filterToDate) return false;
      if (filterCustomer && p.customerId !== filterCustomer) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.payments, activeShipmentId, filterFromDate, filterToDate, filterCustomer]);

  const { items: sortedPayments, requestSort: sortPayments, sortConfig: paySortConfig } = useSortableData(filteredPayments, { key: 'date', direction: 'desc' });
  const totalFilteredAmount = useMemo(
    () => sortedPayments.reduce((sum, payment) => sum + payment.amount, 0),
    [sortedPayments]
  );

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !customerId || !amount || !bankAccountId) return;

    const paymentAmount = Number(amount);
    const isEditing = !!showEditModal;
    const paymentId = isEditing ? showEditModal!.id : generateId('PM', state.payments);

    const newPayment: Payment = {
      id: paymentId,
      date: dateTimeFromDateString(date),
      customerId,
      amount: paymentAmount,
      bankAccountId,
      shipmentId: activeShipmentId,
      notes,
    };

    let newLedger = [...state.ledger];

    if (isEditing) {
      // Reverse old effects
      const oldPayment = showEditModal!;
      newLedger = newLedger.filter(l => l.linkedId !== oldPayment.id);
    }

    // Apply new effects
    const newLedgerEntry = {
      id: buildLedgerEntryId('payment', paymentId, 0, activeShipmentId),
      date: dateTimeFromDateString(date),
      toAccount: bankAccountId,
      description: `سداد دفعة من عميل - ${state.customers.find(c => c.id === customerId)?.name} ${notes ? `(${notes})` : ''}`,
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
    });

    showToast(isEditing ? t('updatedSuccessfully') : t('addedSuccessfully'));
    setShowAddModal(false);
    setShowEditModal(null);
    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setCustomerId('');
    setAmount('');
    setBankAccountId('');
    setNotes('');
    setDate(getCurrentDateInputValue());
  };

  const openEditModal = (payment: Payment) => {
    setDate(payment.date.slice(0, 10));
    setCustomerId(payment.customerId);
    setAmount(payment.amount);
    setBankAccountId(payment.bankAccountId);
    setNotes(payment.notes || '');
    setShowEditModal(payment);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allSelected = filteredPayments.length > 0 && filteredPayments.every(p => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredPayments.map(p => p.id)));
  };

  const handleBulkDelete = () => {
    const ids = selectedIds;
    updateState({
      payments: state.payments.filter(p => !ids.has(p.id)),
      ledger: state.ledger.filter(l => !ids.has(l.linkedId!)),
    });
    showToast(t('deletedSuccessfully'));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const handleDeletePayment = () => {
    if (!showDeleteConfirm) return;
    const payment = showDeleteConfirm;

    updateState({
      payments: state.payments.filter(p => p.id !== payment.id),
      ledger: state.ledger.filter(l => l.linkedId !== payment.id),
    });

    showToast(t('deletedSuccessfully'));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(payment.id); return n; });
    setShowDeleteConfirm(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('payments')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        {hasWriteAccess && <button onClick={() => setShowAddModal(true)}
          className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('recordPayment')}
        </button>}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('customer')}</label>
          <SearchableSelect
            value={filterCustomer}
            onChange={(val) => setFilterCustomer(val)}
            options={[{ value: '', label: t('all') }, ...state.customers.map(c => ({ value: c.id, label: c.name }))]}
            placeholder={t('all')}
          />
        </div>
      </div>

      {/* Bulk-selection toolbar */}
      {hasWriteAccess && selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-red-700">{selectedIds.size} {t('selected')}</span>
          <button onClick={() => setShowBulkDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
            <Trash2 className="w-4 h-4" />{t('deleteSelected')}
          </button>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
      <div className="px-4 py-3 border-b border-slate-100 bg-emerald-50/60">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-slate-700">{t('total')}</span>
          <span className="font-bold text-emerald-700">{formatCurrency(totalFilteredAmount)}</span>
        </div>
      </div>
      {/* Search & Sort Toolbar for Mobile */}
      <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortPayments(e.target.value as any)}
            value={(paySortConfig?.key as string) || 'id'}
          >
            <option value="id">{t('receiptNumber')}</option>
            <option value="date">{t('date')}</option>
            <option value="customerId">{t('customer')}</option>
            <option value="bankAccountId">{t('bankAccount')}</option>
            <option value="amount">{t('amount')}</option>
          </select>
        </div>
      </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedPayments.length > 0 ? sortedPayments.map((payment, idx) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={payment.id} onClick={() => { setSelectedRowId(payment.id); setShowViewModal(payment); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedIds.has(payment.id) ? 'bg-red-50' : selectedRowId === payment.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
              {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(payment.id)} onChange={() => toggleSelect(payment.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></span>}
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{payment.id}</p>
                  <p className="text-xs text-slate-700">{customerMap.get(payment.customerId)?.name}</p>
                  <p className="text-xs text-slate-400">{format(new Date(payment.date), 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <span className="font-bold text-emerald-600 text-sm flex-shrink-0">{formatCurrency(payment.amount)}</span>
              </div>
              {payment.notes && <p className="text-xs text-slate-500 truncate">{payment.notes}</p>}
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-400">{bankAccountMap.get(payment.bankAccountId)?.name}</span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(payment); }}
                    className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4"/>
                  </button>
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(payment); }}
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4"/>
                  </button>}
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(payment); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>}
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
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortPayments('id')}><div className="flex items-center gap-1">{t('receiptNumber')} <SortIcon direction={paySortConfig?.direction!} active={paySortConfig?.key === 'id'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortPayments('date')}><div className="flex items-center gap-1">{t('date')} <SortIcon direction={paySortConfig?.direction!} active={paySortConfig?.key === 'date'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortPayments('customerId')}><div className="flex items-center gap-1">{t('customer')} <SortIcon direction={paySortConfig?.direction!} active={paySortConfig?.key === 'customerId'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortPayments('bankAccountId')}><div className="flex items-center gap-1">{t('bankAccount')} <SortIcon direction={paySortConfig?.direction!} active={paySortConfig?.key === 'bankAccountId'}/></div></th>
                <th className="px-4 py-3">{t('notes')}</th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortPayments('amount')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('amount')} <SortIcon direction={paySortConfig?.direction!} active={paySortConfig?.key === 'amount'}/></div></th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPayments.length > 0 ? sortedPayments.map((payment, idx) => (
                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={payment.id} onClick={() => { setSelectedRowId(payment.id); setShowViewModal(payment); }} className={`transition-colors cursor-pointer ${selectedIds.has(payment.id) ? 'bg-red-50' : selectedRowId === payment.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(payment.id)} onChange={() => toggleSelect(payment.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                  <td className="px-4 py-3 font-medium text-slate-900">{payment.id}</td>
                  <td className="px-4 py-3">{format(new Date(payment.date), 'dd/MM/yyyy HH:mm')}</td>
                  <td className="px-4 py-3">{customerMap.get(payment.customerId)?.name}</td>
                  <td className="px-4 py-3">{bankAccountMap.get(payment.bankAccountId)?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{payment.notes}</td>
                  <td className="px-4 py-3 font-bold text-emerald-600 text-right rtl:text-left">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setShowViewModal(payment); }}
                        className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                        title={t('view')}
                      >
                        <Eye className="w-4 h-4"/>
                      </button>
                      {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(payment); }}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title={t('edit')}
                      >
                        <Edit2 className="w-4 h-4"/>
                      </button>}
                      {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(payment); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('delete')}
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>}
                    </div>
                  </td>
                </motion.tr>
              )) : (
                <tr>
                  <td colSpan={hasWriteAccess ? 8 : 7} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
              )}
            </tbody>
            {sortedPayments.length > 0 && (
              <tfoot className="bg-emerald-50 border-t-2 border-emerald-200">
                <tr className="font-bold text-slate-900">
                  <td colSpan={hasWriteAccess ? 6 : 5} className="px-4 py-3">
                    {t('total')}
                  </td>
                  <td className="px-4 py-3 text-right rtl:text-left text-emerald-700">
                    {formatCurrency(totalFilteredAmount)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add/Edit Payment Modal */}
      <Modal isOpen={showAddModal || !!showEditModal} onClose={() => {
          setShowAddModal(false);
          setShowEditModal(null);
          resetForm();
        }}
        title={showEditModal ? t('edit') : t('recordPayment')}
      size="md"
      >
        <form onSubmit={handleSavePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('customer')}</label>
              <SearchableSelect
                required
                value={customerId}
                onChange={(val) => setCustomerId(val)}
                options={state.customers.map(c => ({ value: c.id, label: c.name }))}
                placeholder={t('select')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')}</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
              <SearchableSelect
                required
                value={bankAccountId}
                onChange={(val) => setBankAccountId(val)}
                options={state.bankAccounts.map(b => ({ value: b.id, label: b.name }))}
                placeholder={t('select')}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none resize-none h-20"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
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
      {/* View Modal */}
      <Modal isOpen={!!showViewModal} onClose={() => setShowViewModal(null)} title={t('view')} size="md">
        {showViewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('receiptNumber')}</label>
                <p className="font-medium">{showViewModal.id}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('date')}</label>
                <p className="font-medium">{format(new Date(showViewModal.date), 'dd/MM/yyyy HH:mm')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('customer')}</label>
                <p className="font-medium">{customerMap.get(showViewModal.customerId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('bankAccount')}</label>
                <p className="font-medium">{bankAccountMap.get(showViewModal.bankAccountId)?.name}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('notes')}</label>
                <p className="font-medium">{showViewModal.notes || '-'}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('amount')}</label>
                <p className="font-bold text-lg text-emerald-600">{formatCurrency(showViewModal.amount)}</p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowViewModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeletePayment} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
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
