import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Users, Plus, Edit2, Eye, Search } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { formatCurrency } from '../lib/utils';
import { Customer } from '../types';
import { canWrite, isSalesperson } from '../lib/permissions';

export default function Customers() {
  const { t, lang } = useTranslation();
  const navigate = useNavigate();
  const { state, updateState, activeShipmentId } = useAppStore();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const hasWriteAccess = canWrite(currentUser, state.roles, 'customers');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Customer | null>(null);

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
      setShowEditModal(null);
    } else {
      const newCustomer: Customer = {
        id: uuidv4(),
        name,
        phone,
        cityId,
        salespersonId: isSpRole && currentUser?.salespersonId ? currentUser.salespersonId : salespersonId,
        carId,
        notes,
      };
      updateState({ customers: [...state.customers, newCustomer] });
      setShowAddModal(false);
    }

    setName('');
    setPhone('');
    setCityId('');
    setSalespersonId('');
    setCarId('');
    setNotes('');
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
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">👁 وضع القراءة فقط</span>
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

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#1E293B]">
              <tr>
                <th className="px-4 py-3">{t('name')}</th>
                <th className="px-4 py-3">{t('phone')}</th>
                <th className="px-4 py-3">{t('city')}</th>
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
                  <tr key={customer.id} className="hover:bg-[#f0fdfa] transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{customer.name}</td>
                    <td className="px-4 py-3" dir="ltr">{customer.phone}</td>
                    <td className="px-4 py-3">{state.cities.find(c => c.id === customer.cityId)?.name}</td>
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
                        <button onClick={() => navigate(`/customers/${customer.id}`)}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('view')}
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        {hasWriteAccess && <button onClick={() => openEditModal(customer)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
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
            <select required value={cityId} onChange={(e) => setCityId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            >
              <option value>{t('select')}</option>
              {state.cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('salesperson')}</label>
            <select required value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            >
              <option value>{t('select')}</option>
              {state.salespeople.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('car')}</label>
            <select value={carId} onChange={(e) => setCarId(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            >
              <option value>{t('select')}</option>
              {state.cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
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
    </motion.div>
  );
}
