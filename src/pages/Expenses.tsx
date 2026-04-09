import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Receipt, Plus, Search, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { useToast } from '../components/Toast';
import { formatCurrency, generateId } from '../lib/utils';
import { Expense } from '../types';
import { canWrite } from '../lib/permissions';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Expenses() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const { showToast } = useToast();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'expenses');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Expense | null>(null);
  const [showViewModal, setShowViewModal] = useState<Expense | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Expense | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
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

  const { items: sortedExpenses, requestSort: sortExpenses, sortConfig: expSortConfig } = useSortableData(filteredExpenses, { key: 'id', direction: 'desc' });

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !categoryId || !amount || !bankAccountId) return;

    const expenseAmount = Number(amount);
    const isEditing = !!showEditModal;
    const expenseId = isEditing ? showEditModal!.id : generateId('EX', state.expenses);

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

  const handleBulkDelete = () => {
    const ids = selectedIds;
    updateState({
      expenses: state.expenses.filter(e => !ids.has(e.id)),
      ledger: state.ledger.filter(l => !ids.has(l.linkedId!)),
    });
    showToast(t('deletedSuccessfully'));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = filteredExpenses.length > 0 && filteredExpenses.every(e => selectedIds.has(e.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
  };

  const handleDeleteExpense = () => {
    if (!showDeleteConfirm) return;
    const expense = showDeleteConfirm;

    updateState({
      expenses: state.expenses.filter(e => e.id !== expense.id),
      ledger: state.ledger.filter(l => l.linkedId !== expense.id),
    });

    showToast(t('deletedSuccessfully'));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(showDeleteConfirm.id); return n; });
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
          <SearchableSelect
            value={filterCategory}
            onChange={(val) => setFilterCategory(val)}
            options={[{ value: '', label: t('all') }, ...state.expenseCategories.map(c => ({ value: c.id, label: c.name }))]}
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

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Search & Sort Toolbar for Mobile */}
      <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortExpenses(e.target.value as any)}
            value={(expSortConfig?.key as string) || 'id'}
          >
            <option value="id">{t('receiptNumber')}</option>
            <option value="date">{t('date')}</option>
            <option value="categoryId">{t('category')}</option>
            <option value="bankAccountId">{t('bankAccount')}</option>
            <option value="amount">{t('amount')}</option>
          </select>
        </div>
      </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedExpenses.length > 0 ? sortedExpenses.map((expense, idx) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={expense.id} onClick={() => { setSelectedRowId(expense.id); setShowViewModal(expense); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedIds.has(expense.id) ? 'bg-red-50' : selectedRowId === expense.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
              {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(expense.id)} onChange={() => toggleSelect(expense.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></span>}
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">{expense.id}</p>
                  <p className="text-xs text-slate-700">{state.expenseCategories.find(c => c.id === expense.categoryId)?.name}</p>
                  <p className="text-xs text-slate-400">{format(new Date(expense.date), 'dd/MM/yyyy HH:mm')}</p>
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
            </motion.div>
          )) : (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#1E293B]">
              <tr>
                {hasWriteAccess && <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortExpenses('id')}><div className="flex items-center gap-1">{t('receiptNumber')} <SortIcon direction={expSortConfig?.direction!} active={expSortConfig?.key === 'id'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortExpenses('date')}><div className="flex items-center gap-1">{t('date')} <SortIcon direction={expSortConfig?.direction!} active={expSortConfig?.key === 'date'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortExpenses('categoryId')}><div className="flex items-center gap-1">{t('category')} <SortIcon direction={expSortConfig?.direction!} active={expSortConfig?.key === 'categoryId'}/></div></th>
                <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortExpenses('bankAccountId')}><div className="flex items-center gap-1">{t('bankAccount')} <SortIcon direction={expSortConfig?.direction!} active={expSortConfig?.key === 'bankAccountId'}/></div></th>
                <th className="px-4 py-3">{t('notes')}</th>
                <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortExpenses('amount')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('amount')} <SortIcon direction={expSortConfig?.direction!} active={expSortConfig?.key === 'amount'}/></div></th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedExpenses.length > 0 ? sortedExpenses.map((expense, idx) => (
                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={expense.id} onClick={() => { setSelectedRowId(expense.id); setShowViewModal(expense); }} className={`transition-colors cursor-pointer ${selectedIds.has(expense.id) ? 'bg-red-50' : selectedRowId === expense.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(expense.id)} onChange={() => toggleSelect(expense.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                  <td className="px-4 py-3 font-medium text-slate-900">{expense.id}</td>
                  <td className="px-4 py-3">{format(new Date(expense.date), 'dd/MM/yyyy HH:mm')}</td>
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
              <SearchableSelect
                required
                value={categoryId}
                onChange={(val) => setCategoryId(val)}
                options={state.expenseCategories.map(c => ({ value: c.id, label: c.name }))}
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
            <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeleteExpense} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
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
