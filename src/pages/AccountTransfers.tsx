import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Plus, Search, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { formatCurrency, generateId } from '../lib/utils';
import { AccountTransfer } from '../types';
import { canWrite } from '../lib/permissions';

export default function AccountTransfers() {
  const { t } = useTranslation();
  const { state, updateState } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'accountTransfers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<AccountTransfer | null>(null);
  const [showViewModal, setShowViewModal] = useState<AccountTransfer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<AccountTransfer | null>(null);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterType, setFilterType] = useState('');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<'transfer' | 'opening_balance'>('transfer');
  const [fromBankAccountId, setFromBankAccountId] = useState('');
  const [toBankAccountId, setToBankAccountId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [transferFee, setTransferFee] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');

  const filteredTransfers = useMemo(() => {
    return state.accountTransfers.filter(t => {
      if (filterDate && !t.date.startsWith(filterDate)) return false;
      if (filterType && t.type !== filterType) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.accountTransfers, filterDate, filterType]);

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !toBankAccountId) return;
    if (type === 'transfer' && !fromBankAccountId) return;
    if (type === 'transfer' && fromBankAccountId === toBankAccountId) {
      alert('Cannot transfer to the same account');
      return;
    }

    const isEditing = !!showEditModal;
    const transferId = isEditing ? showEditModal!.id : generateId('MV', state.accountTransfers.length);

    const newTransfer: AccountTransfer = {
      id: transferId,
      date,
      type,
      fromBankAccountId: type === 'transfer' ? fromBankAccountId : undefined,
      toBankAccountId,
      amount: Number(amount),
      transferFee: Number(transferFee) || 0,
      notes,
    };

    let newBankAccounts = [...state.bankAccounts];
    let newLedger = [...state.ledger];

    if (isEditing) {
      // Reverse old effects
      const oldTransfer = showEditModal!;
      if (oldTransfer.type === 'transfer' && oldTransfer.fromBankAccountId) {
        newBankAccounts = newBankAccounts.map(b =>
          b.id === oldTransfer.fromBankAccountId ? { ...b, balance: b.balance + oldTransfer.amount + oldTransfer.transferFee } :
          b.id === oldTransfer.toBankAccountId ? { ...b, balance: b.balance - oldTransfer.amount } : b
        );
      } else {
        newBankAccounts = newBankAccounts.map(b =>
          b.id === oldTransfer.toBankAccountId ? { ...b, balance: b.balance - oldTransfer.amount } : b
        );
      }
      newLedger = newLedger.filter(l => l.linkedId !== oldTransfer.id);
    }

    // Apply new effects
    const transferAmount = Number(amount);
    const fee = Number(transferFee) || 0;

    if (type === 'transfer' && fromBankAccountId) {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === fromBankAccountId ? { ...b, balance: b.balance - (transferAmount + fee) } :
        b.id === toBankAccountId ? { ...b, balance: b.balance + transferAmount } : b
      );
    } else {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === toBankAccountId ? { ...b, balance: b.balance + transferAmount } : b
      );
    }

    const newLedgerEntries = [];
    if (type === 'transfer' && fromBankAccountId) {
      newLedgerEntries.push({
        id: uuidv4(),
        date,
        fromAccount: fromBankAccountId,
        toAccount: toBankAccountId,
        description: `تحويل بين الحسابات / Account Transfer ${notes ? `(${notes})` : ''}`,
        amountIn: 0,
        amountOut: transferAmount + fee,
        sourceModule: 'account_transfer' as const,
        linkedId: transferId,
      });
      newLedgerEntries.push({
        id: uuidv4(),
        date,
        fromAccount: fromBankAccountId,
        toAccount: toBankAccountId,
        description: `تحويل بين الحسابات / Account Transfer ${notes ? `(${notes})` : ''}`,
        amountIn: transferAmount,
        amountOut: 0,
        sourceModule: 'account_transfer' as const,
        linkedId: transferId,
      });
    } else {
      newLedgerEntries.push({
        id: uuidv4(),
        date,
        toAccount: toBankAccountId,
        description: `رصيد افتتاحي / Opening Balance ${notes ? `(${notes})` : ''}`,
        amountIn: transferAmount,
        amountOut: 0,
        sourceModule: 'account_transfer' as const,
        linkedId: transferId,
      });
    }

    updateState({
      accountTransfers: isEditing
        ? state.accountTransfers.map(t => t.id === transferId ? newTransfer : t)
        : [...state.accountTransfers, newTransfer],
      ledger: [...newLedger, ...newLedgerEntries],
      bankAccounts: newBankAccounts,
    });

    setShowAddModal(false);
    setShowEditModal(null);
    resetForm();
  };

  const resetForm = () => {
    setType('transfer');
    setFromBankAccountId('');
    setToBankAccountId('');
    setAmount('');
    setTransferFee(0);
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const openEditModal = (transfer: AccountTransfer) => {
    setDate(transfer.date);
    setType(transfer.type);
    setFromBankAccountId(transfer.fromBankAccountId || '');
    setToBankAccountId(transfer.toBankAccountId);
    setAmount(transfer.amount);
    setTransferFee(transfer.transferFee);
    setNotes(transfer.notes || '');
    setShowEditModal(transfer);
  };

  const handleDeleteTransfer = () => {
    if (!showDeleteConfirm) return;
    const transfer = showDeleteConfirm;

    let newBankAccounts = [...state.bankAccounts];
    if (transfer.type === 'transfer' && transfer.fromBankAccountId) {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === transfer.fromBankAccountId ? { ...b, balance: b.balance + transfer.amount + transfer.transferFee } :
        b.id === transfer.toBankAccountId ? { ...b, balance: b.balance - transfer.amount } : b
      );
    } else {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === transfer.toBankAccountId ? { ...b, balance: b.balance - transfer.amount } : b
      );
    }

    updateState({
      accountTransfers: state.accountTransfers.filter(t => t.id !== transfer.id),
      ledger: state.ledger.filter(l => l.linkedId !== transfer.id),
      bankAccounts: newBankAccounts,
    });

    setShowDeleteConfirm(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('accountTransfers')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">&#x1F441; وضع القراءة فقط</span>}
        </div>
        {hasWriteAccess && <button onClick={() => setShowAddModal(true)}
          className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('recordTransfer')}
        </button>}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('type')}</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value>{t('all')}</option>
            <option value="transfer">{t('transfer')}</option>
            <option value="opening_balance">{t('openingBalance')}</option>
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#1E293B]">
              <tr>
                <th className="px-4 py-3">{t('receiptNumber')}</th>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3">{t('type')}</th>
                <th className="px-4 py-3">{t('fromAccount')}</th>
                <th className="px-4 py-3">{t('toAccount')}</th>
                 <th className="px-4 py-3 text-right rtl:text-left">{t('amount')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('transferFee')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransfers.length > 0 ? filteredTransfers.map((transfer) => (
                <tr key={transfer.id} className="hover:bg-[#f0fdfa] transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{transfer.id}</td>
                  <td className="px-4 py-3">{format(new Date(transfer.date), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ transfer.type === 'opening_balance' ? 'bg-emerald-100 text-emerald-700' : 'bg-[#ccfbf1] text-[#134e4a]' }`}>
                      {t(transfer.type === 'opening_balance' ? 'openingBalance' : 'transfer')}
                    </span>
                  </td>
                  <td className="px-4 py-3">{transfer.fromBankAccountId ? state.bankAccounts.find(b => b.id === transfer.fromBankAccountId)?.name : '-'}</td>
                  <td className="px-4 py-3">{state.bankAccounts.find(b => b.id === transfer.toBankAccountId)?.name}</td>
                  <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                    {formatCurrency(transfer.amount)}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-right rtl:text-left">
                    {formatCurrency(transfer.transferFee)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => setShowViewModal(transfer)}
                        className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                        title={t('view')}
                      >
                        <Eye className="w-4 h-4"/>
                      </button>
                      {hasWriteAccess && <button onClick={() => openEditModal(transfer)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title={t('edit')}
                      >
                        <Edit2 className="w-4 h-4"/>
                      </button>}
                      {hasWriteAccess && <button onClick={() => setShowDeleteConfirm(transfer)}
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
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Transfer Modal */}
      <Modal isOpen={showAddModal || !!showEditModal} onClose={() => {
          setShowAddModal(false);
          setShowEditModal(null);
          resetForm();
        }}
        title={showEditModal ? t('edit') : t('recordTransfer')}
      size="md"
      >
        <form onSubmit={handleSaveTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('type')}</label>
              <select required value={type} onChange={(e) => setType(e.target.value as 'transfer' | 'opening_balance')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="transfer">{t('transfer')}</option>
                <option value="opening_balance">{t('openingBalance')}</option>
              </select>
            </div>

            {type === 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('fromAccount')}</label>
                <select required value={fromBankAccountId} onChange={(e) => {
                    setFromBankAccountId(e.target.value);
                    const bank = state.bankAccounts.find(b => b.id === e.target.value);
                    if (bank) setTransferFee(bank.transferFee);
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                >
                  <option value>{t('select')}</option>
                  {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('toAccount')}</label>
              <select required value={toBankAccountId} onChange={(e) => setToBankAccountId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value>{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')}</label>
              <input type="number" required min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>

            {type === 'transfer' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('transferFee')}</label>
                <input type="number" required min="0" step="0.01" value={transferFee} onChange={(e) => setTransferFee(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                />
              </div>
            )}

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
                <label className="block text-xs font-medium text-slate-500">{t('type')}</label>
                <p className="font-medium">{t(showViewModal.type === 'opening_balance' ? 'openingBalance' : 'transfer')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('fromAccount')}</label>
                <p className="font-medium">{showViewModal.fromBankAccountId ? state.bankAccounts.find(b => b.id === showViewModal.fromBankAccountId)?.name : '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('toAccount')}</label>
                <p className="font-medium">{state.bankAccounts.find(b => b.id === showViewModal.toBankAccountId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('transferFee')}</label>
                <p className="font-medium">{formatCurrency(showViewModal.transferFee)}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('notes')}</label>
                <p className="font-medium">{showViewModal.notes || '-'}</p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('amount')}</label>
                <p className="font-bold text-lg text-[#134e4a]">{formatCurrency(showViewModal.amount)}</p>
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
              onClick={handleDeleteTransfer}
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
