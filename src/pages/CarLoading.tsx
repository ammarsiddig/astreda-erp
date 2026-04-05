import React, { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Truck, Plus, Eye, Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { InventoryTransaction } from '../types';
import { canWrite } from '../lib/permissions';

export default function CarLoading() {
  const { t, lang } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'carLoading');
  const [selectedCarId, setSelectedCarId] = useState<string>(state.cars[0]?.id || '');
  const [showLoadModal, setShowLoadModal] = useState(false);

  // View/Edit/Delete State
  const [showViewModal, setShowViewModal] = useState<InventoryTransaction | null>(null);
  const [showEditModal, setShowEditModal] = useState<InventoryTransaction | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<InventoryTransaction | null>(null);

  // Edit State
  const [editDate, setEditDate] = useState('');
  const [editQty, setEditQty] = useState(0);
  const [editProductId, setEditProductId] = useState('');

  const openEditModal = (log: InventoryTransaction) => {
    if (!hasWriteAccess) return;
    setEditDate(log.date);
    setEditQty(log.qty);
    setEditProductId(log.productId);
    setShowEditModal(log);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;
    if (!showEditModal) return;

    const updatedTransactions = state.inventoryTransactions.map(t =>
      t.id === showEditModal.id
        ? { ...t, date: editDate, qty: editQty, productId: editProductId }
        : t
    );

    updateState({ inventoryTransactions: updatedTransactions });
    setShowEditModal(null);
  };

  const handleDelete = () => {
    if (!hasWriteAccess) return;
    if (!showDeleteConfirm) return;
    const updatedTransactions = state.inventoryTransactions.filter(t => t.id !== showDeleteConfirm.id);
    updateState({ inventoryTransactions: updatedTransactions });
    setShowDeleteConfirm(null);
  };

  // Load Stock State
  const [loadDate, setLoadDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadItems, setLoadItems] = useState<{ productId: string; qty: number }[]>([{ productId: '', qty: 0 }]);

  const carData = state.products.map(product => {
    const transactions = state.inventoryTransactions.filter(
      t => t.productId === product.id && t.shipmentId === activeShipmentId
    );

    const loaded = transactions
      .filter(t => t.type === 'load' && t.fromLocation === 'warehouse' && t.toLocation === selectedCarId)
      .reduce((sum, t) => sum + t.qty, 0);

    const transferredIn = transactions
      .filter(t => t.type === 'transfer' && t.toLocation === selectedCarId)
      .reduce((sum, t) => sum + t.qty, 0);

    const transferredOut = transactions
      .filter(t => t.type === 'transfer' && t.fromLocation === selectedCarId)
      .reduce((sum, t) => sum + t.qty, 0);

    const returned = transactions
      .filter(t => t.type === 'return' && t.fromLocation === selectedCarId && t.toLocation === 'warehouse')
      .reduce((sum, t) => sum + t.qty, 0);

    const sold = transactions
      .filter(t => t.type === 'sell' && t.fromLocation === selectedCarId)
      .reduce((sum, t) => sum + t.qty, 0);

    const currentStock = loaded + transferredIn - transferredOut - returned - sold;

    return {
      product,
      loaded: loaded + transferredIn,
      transferredOut,
      returned,
      sold,
      currentStock
    };
  }).filter(row => row.loaded > 0 || row.transferredOut > 0 || row.returned > 0 || row.sold > 0 || row.currentStock > 0);

  const handleLoadStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;
    if (!activeShipmentId || !selectedCarId) return;

    const newTransactions = loadItems.filter(item => item.productId && item.qty > 0).map(item => ({
      id: uuidv4(),
      date: loadDate,
      shipmentId: activeShipmentId,
      productId: item.productId,
      type: 'load' as const,
      fromLocation: 'warehouse',
      toLocation: selectedCarId,
      qty: item.qty,
    }));

    updateState({
      inventoryTransactions: [...state.inventoryTransactions, ...newTransactions]
    });
    setShowLoadModal(false);
    setLoadItems([{ productId: '', qty: 0 }]);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('carLoading')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        <div className="flex items-center space-x-4 rtl:space-x-reverse">
          <select value={selectedCarId} onChange={(e) => setSelectedCarId(e.target.value)}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none shadow-sm"
          >
            {state.cars.map(car => (
              <option key={car.id} value={car.id}>{car.name}</option>
            ))}
          </select>
          {hasWriteAccess && <button onClick={() => setShowLoadModal(true)}
            className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
            {t('addLoadingEntry')}
          </button>}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {carData.length > 0 ? carData.map((row) => (
            <div key={row.product.id} className="p-4 space-y-2">
              <p className="font-semibold text-slate-900 text-sm">{row.product.name}</p>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-50 rounded p-2 text-center">
                  <p className="text-slate-500 mb-0.5">{t('loadedQty')}</p>
                  <p className="font-bold">{new Intl.NumberFormat('en-US').format(row.loaded)}</p>
                </div>
                <div className="bg-slate-50 rounded p-2 text-center">
                  <p className="text-slate-500 mb-0.5">{t('soldQty')}</p>
                  <p className="font-bold text-emerald-600">{new Intl.NumberFormat('en-US').format(row.sold)}</p>
                </div>
                <div className={`rounded p-2 text-center ${row.currentStock < 0 ? 'bg-red-50' : 'bg-teal-50'}`}>
                  <p className="text-slate-500 mb-0.5">{t('remainingStock')}</p>
                  <p className={`font-bold ${row.currentStock < 0 ? 'text-red-600' : 'text-slate-700'}`}>{new Intl.NumberFormat('en-US').format(row.currentStock)}</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{t('transfer')} (Out): {new Intl.NumberFormat('en-US').format(row.transferredOut)}</span>
                <span>{t('returnedQty')}: {new Intl.NumberFormat('en-US').format(row.returned)}</span>
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
                <th className="px-4 py-4 font-semibold">{t('product')}</th>
                <th className="px-4 py-4 font-semibold text-center">{t('loadedQty')}</th>
                <th className="px-4 py-4 font-semibold text-center">{t('transfer')} (Out)</th>
                <th className="px-4 py-4 font-semibold text-center">{t('returnedQty')}</th>
                <th className="px-4 py-4 font-semibold text-center">{t('soldQty')}</th>
                <th className="px-4 py-4 font-semibold text-center bg-slate-100/50">{t('remainingStock')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {carData.length > 0 ? carData.map((row) => (
                <tr key={row.product.id} className="transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.product.name}</td>
                  <td className="px-4 py-3 text-center">{new Intl.NumberFormat('en-US').format(row.loaded)}</td>
                  <td className="px-4 py-3 text-center">{new Intl.NumberFormat('en-US').format(row.transferredOut)}</td>
                  <td className="px-4 py-3 text-center">{new Intl.NumberFormat('en-US').format(row.returned)}</td>
                  <td className="px-4 py-3 text-center text-emerald-600">{new Intl.NumberFormat('en-US').format(row.sold)}</td>
                  <td className={`px-4 py-3 text-center font-bold bg-slate-100/30 ${row.currentStock < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {new Intl.NumberFormat('en-US').format(row.currentStock)}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="font-bold text-slate-800">{t('loadingHistory')}</h2>
        </div>
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {state.inventoryTransactions
            .filter(t => t.shipmentId === activeShipmentId && t.type === 'load' && t.toLocation === selectedCarId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(log => (
              <div key={log.id} className="p-4 space-y-1 cursor-pointer" onClick={() => setShowViewModal(log)}>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{state.products.find(p => p.id === log.productId)?.name}</p>
                    <p className="text-xs text-slate-400">{format(new Date(log.date), 'dd/MM/yyyy')}</p>
                  </div>
                  <span className="font-bold text-slate-700 text-sm">{new Intl.NumberFormat('en-US').format(log.qty)}</span>
                </div>
                <div className="flex gap-1 pt-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(log); }} className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4"/></button>
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(log); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4"/></button>}
                  {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(log); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>}
                </div>
              </div>
            ))}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left rtl:text-right">
            <thead className="text-xs text-white uppercase bg-[#1E293B]">
              <tr>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3">{t('product')}</th>
                <th className="px-4 py-3 text-center">{t('qty')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.inventoryTransactions
                .filter(t => t.shipmentId === activeShipmentId && t.type === 'load' && t.toLocation === selectedCarId)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(log => (
                  <tr key={log.id} className="hover:bg-[#f0fdfa] cursor-pointer" onClick={() => setShowViewModal(log)}>
                    <td className="px-4 py-3 whitespace-nowrap">{format(new Date(log.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 font-medium">{state.products.find(p => p.id === log.productId)?.name}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">
                      {new Intl.NumberFormat('en-US').format(log.qty)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setShowViewModal(log); }}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('view')}
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(log); }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>}
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(log); }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showLoadModal} onClose={() => setShowLoadModal(false)} title={t('addLoadingEntry')} size="md">
        <form onSubmit={handleLoadStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
            <input type="date" required value={loadDate} onChange={(e) => setLoadDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">{t('products')}</label>
            {loadItems.map((item, index) => (
              <div key={index} className="flex gap-3">
                <select required value={item.productId} onChange={(e) => {
                    const newItems = [...loadItems];
                    newItems[index].productId = e.target.value;
                    setLoadItems(newItems);
                  }}
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                >
                  <option value="">{t('select')}</option>
                  {state.products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input type="number" required min="1" value={item.qty || ''} onChange={(e) => {
                    const newItems = [...loadItems];
                    newItems[index].qty = parseInt(e.target.value) || 0;
                    setLoadItems(newItems);
                  }}
                  className="w-24 px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
                  placeholder={t('qty')}
                />
                {index === loadItems.length - 1 && (
                  <button type="button" onClick={() => setLoadItems([...loadItems, { productId: '', qty: 0 }])}
                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setShowLoadModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors">
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={!!showViewModal} onClose={() => setShowViewModal(null)} title={t('viewDetails')} size="md">
        {showViewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500">{t('date')}</label>
                <p className="font-medium">{format(new Date(showViewModal.date), 'dd/MM/yyyy')}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500">{t('product')}</label>
                <p className="font-medium">{state.products.find(p => p.id === showViewModal.productId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500">{t('qty')}</label>
                <p className="font-medium">{new Intl.NumberFormat('en-US').format(showViewModal.qty)}</p>
              </div>
              <div>
                <label className="block text-xs text-slate-500">{t('car')}</label>
                <p className="font-medium">{state.cars.find(c => c.id === showViewModal.toLocation)?.name}</p>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <button onClick={() => setShowViewModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!showEditModal} onClose={() => setShowEditModal(null)} title={t('edit')} size="md">
        {showEditModal && (
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('product')}</label>
              <select required value={editProductId} onChange={(e) => setEditProductId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                {state.products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('qty')}</label>
              <input type="number" required min="1" value={editQty} onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setShowEditModal(null)}
                className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
              >
                {t('cancel')}
              </button>
              <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors">
                {t('save')}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirm */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('deleteConfirmMessage')}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button onClick={handleDelete} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">
              {t('delete')}
            </button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
