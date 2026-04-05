import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Plus, Search, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { formatCurrency, generateId } from '../lib/utils';
import { GeneralTransfer, GeneralTransferType } from '../types';
import { canWrite } from '../lib/permissions';

export default function GeneralTransfers() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'generalTransfers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<GeneralTransfer | null>(null);
  const [showViewModal, setShowViewModal] = useState<GeneralTransfer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<GeneralTransfer | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterPartner, setFilterPartner] = useState('');
  const [filterType, setFilterType] = useState<GeneralTransferType | ''>('');

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [partnerId, setPartnerId] = useState('');
  const [transferType, setTransferType] = useState<GeneralTransferType>('capital_return');
  const [beneficiaryPartnerId, setBeneficiaryPartnerId] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [splits, setSplits] = useState<{ bankAccountId: string; amount: number }[]>([
    { bankAccountId: '', amount: 0 }
  ]);

  const operatingPartners = useMemo(() => state.partners.filter(p => p.isOperatingPartner), [state.partners]);

  const filteredTransfers = useMemo(() => {
    return state.generalTransfers.filter(t => {
      if (t.shipmentId !== activeShipmentId) return false;
      // Exclude capital contributions — those belong only to the Capital page
      if (t.transferType === 'capital_contribution') return false;
      if (t.transferType === 'capital' && t.amountSDG === 0) return false; // legacy contributions have SDG 0
      if (filterDate && !t.date.startsWith(filterDate)) return false;
      if (filterPartner && t.partnerId !== filterPartner) return false;
      if (filterType && t.transferType !== filterType) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.generalTransfers, activeShipmentId, filterDate, filterPartner, filterType]);

  const handleAddSplit = () => {
    setSplits([...splits, { bankAccountId: '', amount: 0 }]);
  };

  const handleSplitChange = (index: number, field: 'bankAccountId' | 'amount', value: any) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setSplits(newSplits);
  };

  const handleRemoveSplit = (index: number) => {
    if (splits.length > 1) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  const totalSplitsAmount = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  const amountSAR = totalSplitsAmount / (Number(exchangeRate) || 1);

  const handleSaveTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !exchangeRate || totalSplitsAmount <= 0) return;
    if (transferType === 'drawings' && !partnerId) return;
    if ((transferType === 'capital_return' || transferType === 'capital') && !beneficiaryPartnerId) return;

    const validSplits = splits.filter(s => s.bankAccountId && s.amount > 0);
    if (validSplits.length === 0) return;

    const isEditing = !!showEditModal;
    const transferId = isEditing ? showEditModal!.id : generateId('TR', state.generalTransfers.length);

    const newTransfer: GeneralTransfer = {
      id: transferId,
      date,
      partnerId: transferType === 'drawings' ? partnerId : (beneficiaryPartnerId || ''),
      transferType,
      beneficiaryPartnerId: (transferType === 'capital_return' || transferType === 'capital') ? beneficiaryPartnerId : undefined,
      amountSDG: totalSplitsAmount,
      exchangeRate: Number(exchangeRate),
      amountSAR,
      splits: validSplits,
      description,
      shipmentId: activeShipmentId,
    };

    let newLedger = [...state.ledger];

    if (isEditing) {
      newLedger = newLedger.filter(l => l.linkedId !== showEditModal!.id);
    }

    const partnerLabel = transferType === 'drawings'
      ? state.partners.find(p => p.id === partnerId)?.name
      : state.partners.find(p => p.id === beneficiaryPartnerId)?.name;

    const typeLabel = transferType === 'drawings' ? t('capitalTypeDrawings') : t('capitalReturn');

    const newLedgerEntries = validSplits.map(split => ({
      id: uuidv4(),
      date,
      fromAccount: split.bankAccountId,
      description: `${typeLabel} - ${partnerLabel} ${description ? `(${description})` : ''}`,
      amountIn: 0,
      amountOut: split.amount,
      sourceModule: 'general_transfer' as const,
      linkedId: transferId,
      shipmentId: activeShipmentId,
    }));

    updateState({
      generalTransfers: isEditing
        ? state.generalTransfers.map(t => t.id === transferId ? newTransfer : t)
        : [...state.generalTransfers, newTransfer],
      ledger: [...newLedger, ...newLedgerEntries],
    });

    setShowAddModal(false);
    setShowEditModal(null);
    resetForm();
  };

  const resetForm = () => {
    setPartnerId('');
    setBeneficiaryPartnerId('');
    setTransferType('capital_return');
    setDescription('');
    setSplits([{ bankAccountId: '', amount: 0 }]);
    setDate(new Date().toISOString().split('T')[0]);
    setExchangeRate('');
  };

  const openEditModal = (transfer: GeneralTransfer) => {
    setDate(transfer.date);
    setPartnerId(transfer.transferType === 'drawings' ? transfer.partnerId : '');
    setBeneficiaryPartnerId(transfer.beneficiaryPartnerId || transfer.partnerId || '');
    setTransferType(transfer.transferType === 'capital' ? 'capital_return' : (transfer.transferType || 'capital_return'));
    setExchangeRate(transfer.exchangeRate);
    setDescription(transfer.description || '');
    setSplits(transfer.splits);
    setShowEditModal(transfer);
  };

  const handleDeleteTransfer = () => {
    if (!showDeleteConfirm) return;
    const transfer = showDeleteConfirm;

    updateState({
      generalTransfers: state.generalTransfers.filter(t => t.id !== transfer.id),
      ledger: state.ledger.filter(l => l.linkedId !== transfer.id),
    });

    setShowDeleteConfirm(null);
  };

  const getTypeBadge = (type?: GeneralTransferType) => {
    if (type === 'capital_return' || type === 'capital') {
      return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-[#ccfbf1] text-[#134e4a]">{t('capitalReturn')}</span>;
    }
    if (type === 'drawings') {
      return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">{t('capitalTypeDrawings')}</span>;
    }
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">{t('general')}</span>;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('generalTransfers')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        {hasWriteAccess && <button onClick={() => setShowAddModal(true)}
          className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('recordTransfer')}
        </button>}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
          <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('partner')}</label>
          <select value={filterPartner} onChange={(e) => setFilterPartner(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value="">{t('all')}</option>
            {state.partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">{t('capitalType')}</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}
            className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
          >
            <option value="">{t('all')}</option>
            <option value="capital_return">{t('capitalReturn')}</option>
            <option value="drawings">{t('capitalTypeDrawings')}</option>
          </select>
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredTransfers.length > 0 ? filteredTransfers.map((transfer) => {
            const displayPartner = (transfer.transferType === 'capital_return' || transfer.transferType === 'capital')
              ? state.partners.find(p => p.id === (transfer.beneficiaryPartnerId || transfer.partnerId))?.name
              : state.partners.find(p => p.id === transfer.partnerId)?.name;
            return (
              <div key={transfer.id} onClick={() => { setSelectedRowId(transfer.id); setShowViewModal(transfer); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedRowId === transfer.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{displayPartner || transfer.id}</p>
                    <p className="text-xs text-slate-400">{format(new Date(transfer.date), 'dd/MM/yyyy')}</p>
                    <div className="mt-1">{getTypeBadge(transfer.transferType)}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-slate-900 text-sm">{formatCurrency(transfer.amountSDG)}</p>
                    <p className="text-xs text-emerald-600 font-mono">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(transfer.amountSAR)}</p>
                  </div>
                </div>
                {transfer.description && <p className="text-xs text-slate-500 truncate">{transfer.description}</p>}
                <div className="flex gap-1 pt-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(transfer); }} className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4"/></button>
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(transfer); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(transfer); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
                </div>
              </div>
            );
          }) : (
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
                <th className="px-4 py-3">{t('capitalType')}</th>
                <th className="px-4 py-3">{t('partner')}</th>
                <th className="px-4 py-3">{t('description')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('amount')} (SDG)</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('amount')} (SAR)</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransfers.length > 0 ? filteredTransfers.map((transfer) => {
                const displayPartner = (transfer.transferType === 'capital_return' || transfer.transferType === 'capital')
                  ? state.partners.find(p => p.id === (transfer.beneficiaryPartnerId || transfer.partnerId))?.name
                  : state.partners.find(p => p.id === transfer.partnerId)?.name;
                return (
                  <tr key={transfer.id} onClick={() => { setSelectedRowId(transfer.id); setShowViewModal(transfer); }} className={`transition-colors cursor-pointer ${selectedRowId === transfer.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{transfer.id}</td>
                    <td className="px-4 py-3">{format(new Date(transfer.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3">{getTypeBadge(transfer.transferType)}</td>
                    <td className="px-4 py-3">{displayPartner || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{transfer.description}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 text-right rtl:text-left">
                      {formatCurrency(transfer.amountSDG)}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-600 text-right rtl:text-left">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(transfer.amountSAR)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setShowViewModal(transfer); }}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('view')}
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(transfer); }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>}
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(transfer); }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
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
        size="lg"
      >
        <form onSubmit={handleSaveTransfer} className="space-y-4">
          {/* Auto-calculated total */}
          <div className="p-4 bg-[#f0fdfa] rounded-xl border border-[#99f6e4] flex justify-between items-center">
            <span className="text-sm font-medium text-[#134e4a]">إجمالي المبلغ (SDG)</span>
            <span className="font-bold text-[#134e4a] text-3xl">{formatCurrency(totalSplitsAmount)}</span>
          </div>

          {/* Transfer Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('capitalType')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransferType('capital_return')}
                className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  transferType === 'capital_return'
                    ? 'border-[#14b8a6] bg-[#f0fdfa] text-[#134e4a]'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                🏦 إرجاع رأس مال وأرباح
              </button>
              <button
                type="button"
                onClick={() => setTransferType('drawings')}
                className={`px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                  transferType === 'drawings'
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                💸 {t('capitalTypeDrawings')}
              </button>
            </div>
          </div>

          {/* Conditional partner/beneficiary fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {transferType === 'drawings' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الشريك</label>
                <select required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                >
                  <option value="">{t('select')}</option>
                  {operatingPartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('beneficiary')}</label>
                <select required value={beneficiaryPartnerId} onChange={(e) => setBeneficiaryPartnerId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                >
                  <option value="">{t('select')}</option>
                  {state.partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
          </div>

          {/* Bank accounts section */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <label className="block text-sm font-medium text-slate-700">دفع من الحسابات</label>
              <button
                type="button"
                onClick={handleAddSplit}
                className="text-sm text-[#134e4a] hover:underline flex items-center"
              >
                <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0" />
                إضافة حساب
              </button>
            </div>

            {splits.map((split, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <select
                    required
                    value={split.bankAccountId}
                    onChange={(e) => handleSplitChange(index, 'bankAccountId', e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                  >
                    <option value="">{t('bankAccount')}</option>
                    {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={split.amount || ''}
                    onChange={(e) => handleSplitChange(index, 'amount', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                    placeholder={t('amount')}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSplit(index)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* Exchange rate + SAR amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('exchangeRate')}</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                placeholder="أدخل سعر الصرف"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')} (SAR)</label>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center h-[46px]">
                <span className="font-bold text-emerald-600">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(amountSAR)}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('description')}</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none resize-none h-20"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowAddModal(false); setShowEditModal(null); resetForm(); }}
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
      <Modal isOpen={!!showViewModal} onClose={() => setShowViewModal(null)} title={t('view')} size="lg">
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
                <label className="block text-xs font-medium text-slate-500">{t('capitalType')}</label>
                <div>{getTypeBadge(showViewModal.transferType)}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">
                  {showViewModal.transferType === 'drawings' ? 'الشريك' : 'المستفيد (إرجاع رأس مال وأرباح)'}
                </label>
                <p className="font-medium">
                  {(showViewModal.transferType === 'capital_return' || showViewModal.transferType === 'capital')
                    ? state.partners.find(p => p.id === (showViewModal.beneficiaryPartnerId || showViewModal.partnerId))?.name
                    : state.partners.find(p => p.id === showViewModal.partnerId)?.name}
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500">{t('description')}</label>
                <p className="font-medium">{showViewModal.description || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('amount')} (SDG)</label>
                <p className="font-bold text-lg text-slate-900">{formatCurrency(showViewModal.amountSDG)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('amount')} (SAR)</label>
                <p className="font-bold text-lg text-emerald-600">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(showViewModal.amountSAR)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-500">تفاصيل الحسابات</label>
              <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-200">
                {showViewModal.splits.map((split, idx) => (
                  <div key={idx} className="p-2 flex justify-between text-sm">
                    <span>{state.bankAccounts.find(b => b.id === split.bankAccountId)?.name}</span>
                    <span className="font-medium">{formatCurrency(split.amount)}</span>
                  </div>
                ))}
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
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="lg">
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
