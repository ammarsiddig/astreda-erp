import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Users, Plus, Edit2, Eye, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { generateId } from '../lib/utils';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { useToast } from '../components/Toast';
import { formatCurrency } from '../lib/utils';
import { Customer } from '../types';
import { canWrite, isSalesperson } from '../lib/permissions';

export default function Customers() {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { state, updateState, activeShipmentId } = useAppStore();
  const { showToast } = useToast();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const hasWriteAccess = canWrite(currentUser, state.roles, 'customers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Customer | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Customer | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState('');
  const [salespersonId, setSalespersonId] = useState('');
  const [carId, setCarId] = useState('');
  const [notes, setNotes] = useState('');

  const filteredCustomers = useMemo(() => {
    let list = state.customers;
    if (isSpRole && currentUser?.salespersonId) {
      list = list.filter(c => c.salespersonId === currentUser.salespersonId);
    }
    return list.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery)
    );
  }, [state.customers, searchQuery, isSpRole, currentUser]);

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();

    if (showEditModal) {
      const updatedCustomers = state.customers.map(c =>
        c.id === showEditModal.id ? { ...c, name, phone, cityId, salespersonId, carId, notes } : c
      );
      updateState({ customers: updatedCustomers });
      showToast(t('updatedSuccessfully'));
      setShowEditModal(null);
    } else {
      const newCustomer: Customer = {
        id: generateId('CU', state.customers),
        name,
        phone,
        cityId,
        salespersonId: isSpRole && currentUser?.salespersonId ? currentUser.salespersonId : salespersonId,
        carId,
        notes,
      };
      updateState({ customers: [...state.customers, newCustomer] });
      showToast(t('addedSuccessfully'));
      setShowAddModal(false);
    }

    setName('');
    setPhone('');
    setCityId('');
    setSalespersonId('');
    setCarId('');
    setNotes('');
  };

  const handleDeleteCustomer = () => {
    if (!showDeleteConfirm) return;
    updateState({ customers: state.customers.filter(c => c.id !== showDeleteConfirm.id) });
    showToast(t('deletedSuccessfully'));
    setShowDeleteConfirm(null);
    setSelectedIds(prev => { const n = new Set(prev); n.delete(showDeleteConfirm.id); return n; });
  };

  const handleBulkDelete = () => {
    updateState({ customers: state.customers.filter(c => !selectedIds.has(c.id)) });
    showToast(t('deletedSuccessfully'));
    setSelectedIds(new Set());
    setShowBulkDeleteConfirm(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = filteredCustomers.length > 0 && filteredCustomers.every(c => selectedIds.has(c.id));
  const toggleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
  };

  const openEditModal = (customer: Customer) => {
    setName(customer.name);
    setPhone(customer.phone);
    setCityId(customer.cityId);
    setSalespersonId(customer.salespersonId || '');
    setCarId(customer.carId || '');
    setNotes(customer.notes || '');
    setShowEditModal(customer);
  };

  const getCustomerDebt = (customerId: string) => {
    const invoices = state.invoices.filter(i => i.customerId === customerId && i.paymentType === 'credit' && i.shipmentId === activeShipmentId);
    const payments = state.payments.filter(p => p.customerId === customerId && p.shipmentId === activeShipmentId);
    const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    return totalInvoiced - totalPaid;
  };

  const getCustomerTotalSales = (customerId: string) => {
    return state.invoices
      .filter(i => i.customerId === customerId && i.shipmentId === activeShipmentId)
      .reduce((sum, inv) => sum + inv.total, 0);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('customers')}</h1>
          {!hasWriteAccess && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>
          )}
        </div>
        {hasWriteAccess && <button onClick={() => {
            setName('');
            setPhone('');
            setCityId('');
            setSalespersonId('');
            setCarId('');
            setNotes('');
            setShowAddModal(true);
          }}
          className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors shadow-sm"
        >
          <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0"/>
          {t('addCustomer')}
        </button>}
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 -translate-y-1/2 left-3 rtl:right-3 rtl:left-auto w-5 h-5 text-slate-400"/>
          <input type="text" placeholder={t('search')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 rtl:pr-10 rtl:pl-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
          />
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

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => {
            const debt = getCustomerDebt(customer.id);
            const totalSales = getCustomerTotalSales(customer.id);
            return (
              <div key={customer.id} onClick={() => { setSelectedRowId(customer.id); navigate(`/customers/${customer.id}`); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedIds.has(customer.id) ? 'bg-red-50' : selectedRowId === customer.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                <div className="flex justify-between items-start gap-2">
                  {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(customer.id)} onChange={() => toggleSelect(customer.id)} className="mt-1 w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6] flex-shrink-0" /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm truncate">{customer.name}</p>
                    <p className="text-xs text-slate-500" dir="ltr">{customer.phone}</p>
                    <p className="text-xs text-slate-400">{state.cities.find(c => c.id === customer.cityId)?.name}</p>
                    <p className="text-xs text-slate-400">{t('salesperson')}: {state.salespeople.find(s => s.id === customer.salespersonId)?.name || '-'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`text-sm font-bold ${debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(debt)}
                    </span>
                    <span className="text-xs text-slate-500">{t('debt')}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <div className="flex gap-3 text-xs text-slate-600">
                    <span className="font-medium">{t('totalPayments')}: <span className="text-emerald-600 font-bold">{formatCurrency(state.payments.filter(p => p.customerId === customer.id && p.shipmentId === activeShipmentId).reduce((sum, p) => sum + p.amount, 0))}</span></span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/customers/${customer.id}`); }}
                      className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <Eye className="w-4 h-4"/>
                    </button>
                    {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                      className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4"/>
                    </button>}
                    {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(customer); }}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4"/>
                    </button>}
                  </div>
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
                {hasWriteAccess && <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                <th className="px-4 py-3">{t('name')}</th>
                <th className="px-4 py-3">{t('phone')}</th>
                <th className="px-4 py-3">{t('city')}</th>
                <th className="px-4 py-3">{t('salesperson')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">إجمالي المبيعات</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('totalPayments')}</th>
                <th className="px-4 py-3 text-right rtl:text-left">{t('debt')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => {
                const debt = getCustomerDebt(customer.id);
                const totalSales = getCustomerTotalSales(customer.id);
                return (
                  <tr key={customer.id} onClick={() => { setSelectedRowId(customer.id); navigate(`/customers/${customer.id}`); }} className={`transition-colors cursor-pointer ${selectedIds.has(customer.id) ? 'bg-red-50' : selectedRowId === customer.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(customer.id)} onChange={() => toggleSelect(customer.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                    <td className="px-4 py-3 font-medium text-slate-900">{customer.name}</td>
                    <td className="px-4 py-3" dir="ltr">{customer.phone}</td>
                    <td className="px-4 py-3">{state.cities.find(c => c.id === customer.cityId)?.name}</td>
                    <td className="px-4 py-3 text-slate-600">{state.salespeople.find(s => s.id === customer.salespersonId)?.name || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700 text-right rtl:text-left">
                      {formatCurrency(totalSales)}
                    </td>
                    <td className="px-4 py-3 font-bold text-emerald-600 text-right rtl:text-left">
                      {formatCurrency(state.payments.filter(p => p.customerId === customer.id && p.shipmentId === activeShipmentId).reduce((sum, p) => sum + p.amount, 0))}
                    </td>
                    <td className={`px-4 py-3 font-bold text-right rtl:text-left ${debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(debt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/customers/${customer.id}`); }}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('view')}
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); openEditModal(customer); }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>}
                        {hasWriteAccess && <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(customer); }}
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
                  <td colSpan={hasWriteAccess ? 9 : 8} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showAddModal || !!showEditModal} onClose={() => {
          setShowAddModal(false);
          setShowEditModal(null);
        }}
        title={showEditModal ? t('editCustomer') : t('addCustomer')}
        size="lg"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')}</label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('phone')}</label>
            <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('city')}</label>
            <SearchableSelect
              required
              value={cityId}
              onChange={(val) => setCityId(val)}
              options={state.cities.map(c => ({ value: c.id, label: c.name }))}
              placeholder={t('select')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('salesperson')}</label>
            <SearchableSelect
              required
              value={salespersonId}
              onChange={(val) => setSalespersonId(val)}
              options={state.salespeople.map(s => ({ value: s.id, label: s.name }))}
              placeholder={t('select')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('car')}</label>
            <SearchableSelect
              value={carId}
              onChange={(val) => setCarId(val)}
              options={state.cars.map(c => ({ value: c.id, label: c.name }))}
              placeholder={t('select')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none resize-none h-20"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setShowEditModal(null);
              }}
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

      {/* Single Delete Confirm */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          {showDeleteConfirm && <p className="font-semibold text-slate-800">{showDeleteConfirm.name}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteConfirm(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeleteCustomer} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
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
