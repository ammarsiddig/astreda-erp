import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Receipt, Plus, Search, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/utils';
import { Expense } from '../types';
import { canWrite } from '../lib/permissions';

export default function Expenses() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const { showToast } = useToast();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'expenses');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Expense | null>(null);
  const [showViewModal, setShowViewModal] = useState<Expense | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Expense | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Filters
  const [filterFromDate, setFilterFromDate] = useState('');
  const [filterToDate, setFilterToDate] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const filteredExpenses = useMemo(() => {
    return state.expenses.filter(e => {
      if (e.shipmentId !== activeShipmentId) return false;
      if (filterFromDate && e.date < filterFromDate) return false;
      if (filterToDate && e.date > filterToDate) return false;
      if (filterCategory && e.categoryId !== filterCategory) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.expenses, activeShipmentId, filterFromDate, filterToDate, filterCategory]);

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !categoryId || !amount || !bankAccountId) return;

    const expenseAmount = Number(amount);
    const isEditing = !!showEditModal;
    const expenseId = isEditing ? showEditModal!.id : uuidv4();

    const newExpense: Expense = {
      id: expenseId,
      date,
      categoryId,
      description: notes,
      amount: expenseAmount,
      bankAccountId,
      shipmentId: activeShipmentId,
      notes,
    };

    let newLedger = [...state.ledger];

    if (isEditing) {
      // Reverse old effects
      const oldExpense = showEditModal!;
      newLedger = newLedger.filter(l => l.linkedId !== oldExpense.id);
    }

    // Apply new effects
    const newLedgerEntry = {
      id: uuidv4(),
      date,
      toAccount: bankAccountId,
      description: `مصروفات / Expense - ${state.expenseCategories.find(c => c.id === categoryId)?.name} ${notes ? `(${notes})` : ''}`,
      amountIn: 0,
      amountOut: expenseAmount,
      sourceModule: 'expense' as const,
      linkedId: expenseId,
      shipmentId: activeShipmentId,
    };

    updateState({
      expenses: isEditing
        ? state.expenses.map(e => e.id === expenseId ? newExpense : e)
        : [...state.expenses, newExpense],
      ledger: [...newLedger, newLedgerEntry],
    });

    showToast(isEditing ? t('updatedSuccessfully') : t('addedSuccessfully'));
    setShowAddModal(false);
    setShowEditModal(null);
    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setCategoryId('');
    setAmount('');
    setBankAccountId('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const openEditModal = (expense: Expense) => {
    setDate(expense.date);
    setCategoryId(expense.categoryId);
    setAmount(expense.amount);
    setBankAccountId(expense.bankAccountId);
    setNotes(expense.notes || '');
    setShowEditModal(expense);
  };

  const handleDeleteExpense = () => {
    if (!showDeleteConfirm) return;
    const expense = showDeleteConfirm;

    updateState({
      expenses: state.expenses.filter(e => e.id !== expense.id),
      ledger: state.ledger.filter(l => l.linkedId !== expense.id),
    });

    showToast(t('deletedSuccessfully'));
    setShowDeleteConfirm(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('expenses')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        {hasWriteAccess && <button onClick={() => setShowAddModal(true)}
          className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('recordExpense')}
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
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('category')}</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value="">{t('all')}</option>
            {state.expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
            <div key={expense.id} onClick={() => { setSelectedRowId(expense.id); setShowViewModal(expense); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedRowId === expense.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{expense.id}</p>
                  <p className="text-xs text-slate-700">{state.expenseCategories.find(c => c.id === expense.categoryId)?.name}</p>
                  <p className="text-xs text-slate-400">{format(new Date(expense.date), 'dd/MM/yyyy')}</p>
                </div>
                <span className="font-bold text-red-600 text-sm flex-shrink-0">{formatCurrency(expense.amount)}</span>
              </div>
              {expense.notes && <p className="text-xs text-slate-500 truncate">{expense.notes}</p>}
              <div className="flex justify-between items-center pt-1">
                <span className="text-xs text-slate-400">{state.bankAccounts.find(b => b.id === expense.bankAccountId)?.name}</span>
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(expense); }}
                    className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4"/>
                  </button>
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(expense); }}
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4"/>
                  </button>}
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(expense); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>}
                </div>
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
                <th className="px-4 py-3">{t('receiptNumber')}</th>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3">{t('category')}</th>
                <th className="px-4 py-3">{t('bankAccount')}</th>
                <th className="px-4 py-3">{t('notes')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('amount')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length > 0 ? filteredExpenses.map((expense) => (
                <tr key={expense.id} onClick={() => { setSelectedRowId(expense.id); setShowViewModal(expense); }} className={`transition-colors cursor-pointer ${selectedRowId === expense.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">{expense.id}</td>
                  <td className="px-4 py-3">{format(new Date(expense.date), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3">{state.expenseCategories.find(c => c.id === expense.categoryId)?.name}</td>
                  <td className="px-4 py-3">{state.bankAccounts.find(b => b.id === expense.bankAccountId)?.name}</td>
                  <td className="px-4 py-3 text-slate-500">{expense.notes}</td>
                  <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); setShowViewModal(expense); }}
                        className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                        title={t('view')}
                      >
                        <Eye className="w-4 h-4"/>
                      </button>
                      {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(expense); }}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title={t('edit')}
                      >
                        <Edit2 className="w-4 h-4"/>
                      </button>}
                      {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(expense); }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title={t('delete')}
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>}
                    </div>
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

      {/* Add/Edit Expense Modal */}
      <Modal isOpen={showAddModal || !!showEditModal} onClose={() => {
          setShowAddModal(false);
          setShowEditModal(null);
          resetForm();
        }}
        title={showEditModal ? t('edit') : t('recordExpense')}
      size="md"
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('category')}</label>
              <select required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                {state.expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')}</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
              <select required value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
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
                <p className="font-medium">{format(new Date(showViewModal.date), 'dd/MM/yyyy')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('category')}</label>
                <p className="font-medium">{state.expenseCategories.find(c => c.id === showViewModal.categoryId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('bankAccount')}</label>
                <p className="font-medium">{state.bankAccounts.find(b => b.id === showViewModal.bankAccountId)?.name}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('notes')}</label>
                <p className="font-medium">{showViewModal.notes || '-'}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('amount')}</label>
                <p className="font-bold text-lg text-red-600">{formatCurrency(showViewModal.amount)}</p>
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
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleDeleteExpense}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              {t('yes')}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
