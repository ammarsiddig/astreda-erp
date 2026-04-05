import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Plus, Edit2, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import { formatCurrency, generateId } from '../lib/utils';
import { Salary, Expense } from '../types';
import { canWrite } from '../lib/permissions';

export default function Salaries() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'salaries');

  // === Tab ===
  const [activeTab, setActiveTab] = useState<'salaries' | 'advances'>('salaries');

  // === Salaries tab state ===
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Salary | null>(null);
  const [showViewModal, setShowViewModal] = useState<Salary | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Salary | null>(null);
  const [selectedSalaryRowId, setSelectedSalaryRowId] = useState<string | null>(null);
  const [selectedAdvanceRowId, setSelectedAdvanceRowId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');

  // Salary form state
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<'salary' | 'allowance'>('salary');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState<number | ''>('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [notes, setNotes] = useState('');
  const [autoSettle, setAutoSettle] = useState(true);

  // === Advances tab state ===
  const [advFilterEmployee, setAdvFilterEmployee] = useState('');
  const [advFilterStatus, setAdvFilterStatus] = useState<'all' | 'open' | 'settled'>('all');
  const [advFilterShipment, setAdvFilterShipment] = useState(activeShipmentId || '');
  const [showSettleConfirm, setShowSettleConfirm] = useState<string | null>(null);
  const [showSettleAllConfirm, setShowSettleAllConfirm] = useState<string | null>(null);
  const [showNewAdvanceModal, setShowNewAdvanceModal] = useState(false);

  // New advance form state
  const [advDate, setAdvDate] = useState(new Date().toISOString().split('T')[0]);
  const [advEmployee, setAdvEmployee] = useState('');
  const [advAmount, setAdvAmount] = useState<number | ''>('');
  const [advBankAccountId, setAdvBankAccountId] = useState('');
  const [advNotes, setAdvNotes] = useState('');

  // === Computed ===
  const advancesCategoryId = useMemo(() =>
    state.expenseCategories.find(c => c.name === 'سلفيات')?.id || '3',
    [state.expenseCategories]
  );

  const filteredSalaries = useMemo(() => {
    return state.salaries.filter(s => {
      if (s.shipmentId !== activeShipmentId) return false;
      if (filterDate && !s.date.startsWith(filterDate)) return false;
      if (filterEmployee && s.employeeId !== filterEmployee) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.salaries, activeShipmentId, filterDate, filterEmployee]);

  const allAdvances = useMemo(() =>
    state.expenses.filter(e => e.categoryId === advancesCategoryId),
    [state.expenses, advancesCategoryId]
  );

  const filteredAdvances = useMemo(() => {
    return allAdvances.filter(e => {
      if (advFilterShipment && e.shipmentId !== advFilterShipment) return false;
      if (advFilterEmployee) {
        const emp = state.employees.find(emp => emp.id === advFilterEmployee);
        if (emp && e.description !== emp.name) return false;
      }
      if (advFilterStatus === 'open' && e.settled) return false;
      if (advFilterStatus === 'settled' && !e.settled) return false;
      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allAdvances, advFilterShipment, advFilterEmployee, advFilterStatus, state.employees]);

  // Per-employee open advances summary for current shipment filter
  const employeeOpenSummary = useMemo(() => {
    const openAdvances = allAdvances.filter(e => {
      if (advFilterShipment && e.shipmentId !== advFilterShipment) return false;
      return !e.settled;
    });
    const byEmployee: Record<string, number> = {};
    openAdvances.forEach(e => {
      byEmployee[e.description] = (byEmployee[e.description] || 0) + e.amount;
    });
    return byEmployee;
  }, [allAdvances, advFilterShipment]);

  const summaryEmployees = (Object.entries(employeeOpenSummary) as [string, number][]).filter(([, amt]) => amt > 0);

  // For salary form: open advances for selected employee in active shipment
  const openAdvancesForEmployee = useMemo(() => {
    if (!employeeId) return [];
    const emp = state.employees.find(e => e.id === employeeId);
    if (!emp) return [];
    return state.expenses.filter(e =>
      e.categoryId === advancesCategoryId &&
      e.shipmentId === activeShipmentId &&
      e.description === emp.name &&
      !e.settled
    );
  }, [employeeId, state.expenses, advancesCategoryId, activeShipmentId, state.employees]);

  const totalOpenAdvances = openAdvancesForEmployee.reduce((s, e) => s + e.amount, 0);
  const netSalary = amount !== '' ? Number(amount) - totalOpenAdvances : null;

  // === Salary handlers ===
  const handleSaveSalary = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !employeeId || !amount || !bankAccountId) return;

    const salaryAmount = Number(amount);
    const isEditing = !!showEditModal;
    const salaryId = isEditing ? showEditModal!.id : generateId('SA', state.salaries.length);
    const emp = state.employees.find(e => e.id === employeeId);

    let finalNotes = notes;
    if (autoSettle && totalOpenAdvances > 0 && openAdvancesForEmployee.length > 0) {
      const advNote = `مخصوم سلفيات: ${formatCurrency(totalOpenAdvances)}`;
      finalNotes = finalNotes ? `${finalNotes} | ${advNote}` : advNote;
    }

    const newSalary: Salary = {
      id: salaryId,
      date,
      employeeId,
      type,
      month,
      amount: salaryAmount,
      bankAccountId,
      shipmentId: activeShipmentId,
      notes: finalNotes,
    };

    let newLedger = [...state.ledger];

    if (isEditing) {
      const oldSalary = showEditModal!;
      newLedger = newLedger.filter(l => l.linkedId !== oldSalary.id);
    }

    const newLedgerEntry = {
      id: uuidv4(),
      date,
      toAccount: bankAccountId,
      description: `راتب / Salary - ${emp?.name} ${finalNotes ? `(${finalNotes})` : ''}`,
      amountIn: 0,
      amountOut: salaryAmount,
      sourceModule: 'salary' as const,
      linkedId: salaryId,
      shipmentId: activeShipmentId,
    };

    let newExpenses = [...state.expenses];
    if (autoSettle && openAdvancesForEmployee.length > 0) {
      const settleDate = date;
      const openIds = new Set(openAdvancesForEmployee.map(e => e.id));
      newExpenses = newExpenses.map(e =>
        openIds.has(e.id) ? { ...e, settled: true, settledDate: settleDate } : e
      );
    }

    updateState({
      salaries: isEditing
        ? state.salaries.map(s => s.id === salaryId ? newSalary : s)
        : [...state.salaries, newSalary],
      ledger: [...newLedger, newLedgerEntry],
      expenses: newExpenses,
    });

    setShowAddModal(false);
    setShowEditModal(null);
    resetForm();
  };

  const resetForm = () => {
    setEmployeeId('');
    setAmount('');
    setBankAccountId('');
    setNotes('');
    setDate(new Date().toISOString().split('T')[0]);
    setType('salary');
    setMonth(new Date().toISOString().slice(0, 7));
    setAutoSettle(true);
  };

  const openEditModal = (salary: Salary) => {
    setDate(salary.date);
    setEmployeeId(salary.employeeId);
    setType(salary.type);
    setMonth(salary.month);
    setAmount(salary.amount);
    setBankAccountId(salary.bankAccountId);
    setNotes(salary.notes || '');
    setShowEditModal(salary);
  };

  const handleDeleteSalary = () => {
    if (!showDeleteConfirm) return;
    const salary = showDeleteConfirm;
    updateState({
      salaries: state.salaries.filter(s => s.id !== salary.id),
      ledger: state.ledger.filter(l => l.linkedId !== salary.id),
    });
    setShowDeleteConfirm(null);
  };

  // === Advance handlers ===
  const handleSettleAdvance = () => {
    if (!showSettleConfirm) return;
    const settleDate = new Date().toISOString().split('T')[0];
    updateState({
      expenses: state.expenses.map(e =>
        e.id === showSettleConfirm ? { ...e, settled: true, settledDate: settleDate } : e
      ),
    });
    setShowSettleConfirm(null);
  };

  const handleSettleAll = () => {
    if (!showSettleAllConfirm) return;
    const employeeName = showSettleAllConfirm;
    const settleDate = new Date().toISOString().split('T')[0];
    updateState({
      expenses: state.expenses.map(e => {
        if (
          e.categoryId === advancesCategoryId &&
          e.description === employeeName &&
          (!advFilterShipment || e.shipmentId === advFilterShipment) &&
          !e.settled
        ) {
          return { ...e, settled: true, settledDate: settleDate };
        }
        return e;
      }),
    });
    setShowSettleAllConfirm(null);
  };

  const resetAdvanceForm = () => {
    setAdvDate(new Date().toISOString().split('T')[0]);
    setAdvEmployee('');
    setAdvAmount('');
    setAdvBankAccountId('');
    setAdvNotes('');
  };

  const handleSaveAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !advEmployee || !advAmount || !advBankAccountId) return;

    const advAmountNum = Number(advAmount);
    const emp = state.employees.find(e => e.id === advEmployee);
    const newExpenseId = generateId('EX', state.expenses.length);

    const newExpense: Expense = {
      id: newExpenseId,
      date: advDate,
      categoryId: advancesCategoryId,
      description: emp?.name || '',
      amount: advAmountNum,
      bankAccountId: advBankAccountId,
      shipmentId: activeShipmentId,
      notes: advNotes,
      settled: false,
    };

    const newLedgerEntry = {
      id: uuidv4(),
      date: advDate,
      toAccount: advBankAccountId,
      description: `سلفية - ${emp?.name || ''}${advNotes ? ` (${advNotes})` : ''}`,
      amountIn: 0,
      amountOut: advAmountNum,
      sourceModule: 'expense' as const,
      linkedId: newExpenseId,
      shipmentId: activeShipmentId,
    };

    updateState({
      expenses: [...state.expenses, newExpense],
      ledger: [...state.ledger, newLedgerEntry],
    });

    setShowNewAdvanceModal(false);
    resetAdvanceForm();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('salaries')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        {hasWriteAccess && (activeTab === 'salaries' ? (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" />
            {t('recordSalary')}
          </button>
        ) : (
          <button
            onClick={() => setShowNewAdvanceModal(true)}
            className="flex items-center px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" />
            سلفية جديدة
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('salaries')}
          className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
            activeTab === 'salaries'
              ? 'border-[#134e4a] text-[#134e4a]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          الرواتب
        </button>
        <button
          onClick={() => setActiveTab('advances')}
          className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'advances'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          السلفيات
          {summaryEmployees.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">
              {summaryEmployees.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'salaries' ? (
        <>
          {/* Salaries Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('employee')}</label>
              <select
                value={filterEmployee}
                onChange={(e) => setFilterEmployee(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
              >
                <option value="">{t('all')}</option>
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>

          {/* Salaries Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredSalaries.length > 0 ? filteredSalaries.map((salary) => (
                <div key={salary.id} onClick={() => setSelectedSalaryRowId(salary.id)} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedSalaryRowId === salary.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{state.employees.find(e => e.id === salary.employeeId)?.name}</p>
                      <p className="text-xs text-slate-500">{salary.id} · {format(new Date(salary.date), 'dd/MM/yyyy')}</p>
                      <p className="text-xs text-slate-400">{t(salary.type)} · {salary.month}</p>
                    </div>
                    <span className="font-bold text-red-600 text-sm flex-shrink-0">{formatCurrency(salary.amount)}</span>
                  </div>
                  {salary.notes && <p className="text-xs text-slate-500 truncate">{salary.notes}</p>}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs text-slate-400">{state.bankAccounts.find(b => b.id === salary.bankAccountId)?.name}</span>
                    <div className="flex gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setShowViewModal(salary); }} className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"><Eye className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(salary); }} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(salary); }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
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
                    <th className="px-4 py-3">{t('employee')}</th>
                    <th className="px-4 py-3">{t('type')}</th>
                    <th className="px-4 py-3">{t('month')}</th>
                    <th className="px-4 py-3">{t('bankAccount')}</th>
                    <th className="px-4 py-3">{t('notes')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">{t('amount')}</th>
                    <th className="px-4 py-3 text-center">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSalaries.length > 0 ? filteredSalaries.map((salary) => (
                    <tr key={salary.id} onClick={() => setSelectedSalaryRowId(salary.id)} className={`transition-colors cursor-pointer ${selectedSalaryRowId === salary.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">{salary.id}</td>
                      <td className="px-4 py-3">{format(new Date(salary.date), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3">{state.employees.find(e => e.id === salary.employeeId)?.name}</td>
                      <td className="px-4 py-3">{t(salary.type)}</td>
                      <td className="px-4 py-3">{salary.month}</td>
                      <td className="px-4 py-3">{state.bankAccounts.find(b => b.id === salary.bankAccountId)?.name}</td>
                      <td className="px-4 py-3 text-slate-500">{salary.notes}</td>
                      <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">
                        {formatCurrency(salary.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowViewModal(salary); }}
                            className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                            title={t('view')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditModal(salary); }}
                            className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title={t('edit')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(salary); }}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Advances Summary Bar */}
          {summaryEmployees.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-700 mb-3">السلفيات المفتوحة</p>
              <div className="flex flex-wrap gap-3">
                {summaryEmployees.map(([empName, total]) => (
                  <div key={empName} className="flex items-center gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-slate-700">{empName}</span>
                    <span className="text-sm font-bold text-red-600">{formatCurrency(total)}</span>
                    <button
                      onClick={() => setShowSettleAllConfirm(empName)}
                      className="text-xs px-2 py-0.5 bg-[#134e4a] text-white rounded hover:bg-[#0c3531] transition-colors font-medium"
                    >
                      تسوية الكل
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advances Filters */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">الموظف</label>
              <select
                value={advFilterEmployee}
                onChange={(e) => setAdvFilterEmployee(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              >
                <option value="">الكل</option>
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">الحالة</label>
              <select
                value={advFilterStatus}
                onChange={(e) => setAdvFilterStatus(e.target.value as 'all' | 'open' | 'settled')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              >
                <option value="all">الكل</option>
                <option value="open">مفتوح</option>
                <option value="settled">مُسوَّى</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">الرسالة</label>
              <select
                value={advFilterShipment}
                onChange={(e) => setAdvFilterShipment(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none text-sm"
              >
                <option value="">الكل</option>
                {state.shipments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* Advances Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredAdvances.length > 0 ? filteredAdvances.map((adv) => (
                <div key={adv.id} onClick={() => setSelectedAdvanceRowId(adv.id)} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedAdvanceRowId === adv.id ? 'bg-teal-50' : adv.settled ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-amber-50'}`}>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{adv.description}</p>
                      <p className="text-xs text-slate-400">{format(new Date(adv.date), 'dd/MM/yyyy')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="font-bold text-red-600 text-sm">{formatCurrency(adv.amount)}</span>
                      {adv.settled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">✅ مُسوَّى</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">🔴 مفتوح</span>
                      )}
                    </div>
                  </div>
                  {adv.notes && <p className="text-xs text-slate-500 truncate">{adv.notes}</p>}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs text-slate-400">{state.bankAccounts.find(b => b.id === adv.bankAccountId)?.name}</span>
                    {!adv.settled && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowSettleConfirm(adv.id); }}
                        className="px-3 py-1 bg-[#134e4a] text-white text-xs rounded-lg hover:bg-[#0c3531] transition-colors font-semibold"
                      >
                        تسوية
                      </button>
                    )}
                  </div>
                </div>
              )) : (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">لا توجد بيانات</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                <thead className="text-xs text-white uppercase bg-[#1E293B]">
                  <tr>
                    <th className="px-4 py-3">التاريخ</th>
                    <th className="px-4 py-3">الموظف</th>
                    <th className="px-4 py-3 text-right rtl:text-left">المبلغ</th>
                    <th className="px-4 py-3">الحساب</th>
                    <th className="px-4 py-3">الرسالة</th>
                    <th className="px-4 py-3">الحالة</th>
                    <th className="px-4 py-3">ملاحظات</th>
                    <th className="px-4 py-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdvances.length > 0 ? filteredAdvances.map((adv) => (
                    <tr key={adv.id} onClick={() => setSelectedAdvanceRowId(adv.id)} className={`transition-colors cursor-pointer ${selectedAdvanceRowId === adv.id ? 'bg-teal-50' : adv.settled ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-amber-50'}`}>
                      <td className="px-4 py-3">{format(new Date(adv.date), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{adv.description}</td>
                      <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">
                        {formatCurrency(adv.amount)}
                      </td>
                      <td className="px-4 py-3">{state.bankAccounts.find(b => b.id === adv.bankAccountId)?.name}</td>
                      <td className="px-4 py-3">{state.shipments.find(s => s.id === adv.shipmentId)?.name}</td>
                      <td className="px-4 py-3">
                        {adv.settled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ✅ مُسوَّى
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            🔴 مفتوح
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{adv.notes}</td>
                      <td className="px-4 py-3 text-center">
                        {!adv.settled && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowSettleConfirm(adv.id); }}
                            className="px-3 py-1 bg-[#134e4a] text-white text-xs rounded-lg hover:bg-[#0c3531] transition-colors font-semibold"
                          >
                            تسوية
                          </button>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============ MODALS ============ */}

      {/* Add/Edit Salary Modal */}
      <Modal
        isOpen={showAddModal || !!showEditModal}
        onClose={() => { setShowAddModal(false); setShowEditModal(null); resetForm(); }}
        title={showEditModal ? t('edit') : t('recordSalary')}
        size="md"
      >
        <form onSubmit={handleSaveSalary} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('employee')}</label>
              <select
                required
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>

            {/* Open advances info for selected employee */}
            {employeeId && openAdvancesForEmployee.length > 0 && (
              <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-semibold text-red-700">
                  السلفيات المفتوحة: <span className="font-bold">{formatCurrency(totalOpenAdvances)}</span>
                </p>
                <ul className="space-y-1">
                  {openAdvancesForEmployee.map(adv => (
                    <li key={adv.id} className="flex justify-between text-xs text-red-600">
                      <span>{format(new Date(adv.date), 'dd/MM/yyyy')}</span>
                      <span className="font-semibold">{formatCurrency(adv.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('type')}</label>
              <select
                required
                value={type}
                onChange={(e) => setType(e.target.value as 'salary' | 'allowance')}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="salary">{t('salary')}</option>
                <option value="allowance">{t('allowance')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('month')}</label>
              <input
                type="month"
                required
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('amount')}</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              />
              {employeeId && totalOpenAdvances > 0 && netSalary !== null && (
                <p className="mt-1 text-xs font-semibold text-green-700">
                  صافي الراتب: {formatCurrency(Math.max(0, netSalary))}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
              <select
                required
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none resize-none h-20"
              />
            </div>
            {employeeId && openAdvancesForEmployee.length > 0 && (
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSettle}
                    onChange={(e) => setAutoSettle(e.target.checked)}
                    className="w-4 h-4 accent-teal-600"
                  />
                  <span className="text-sm text-slate-700">تسوية السلفيات تلقائياً عند الحفظ</span>
                </label>
              </div>
            )}
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
                <label className="block text-xs font-medium text-slate-500">{t('employee')}</label>
                <p className="font-medium">{state.employees.find(e => e.id === showViewModal.employeeId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('type')}</label>
                <p className="font-medium">{t(showViewModal.type)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('month')}</label>
                <p className="font-medium">{showViewModal.month}</p>
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
              onClick={handleDeleteSalary}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              {t('yes')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Settle Single Advance Confirmation */}
      <Modal isOpen={!!showSettleConfirm} onClose={() => setShowSettleConfirm(null)} title="تسوية سلفية" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">هل تريد تسوية هذه السلفية مع الراتب؟</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowSettleConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleSettleAdvance}
              className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
            >
              تسوية
            </button>
          </div>
        </div>
      </Modal>

      {/* Settle All Confirmation */}
      <Modal isOpen={!!showSettleAllConfirm} onClose={() => setShowSettleAllConfirm(null)} title="تسوية الكل" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">
            هل تريد تسوية جميع السلفيات المفتوحة لـ <strong>{showSettleAllConfirm}</strong>؟
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowSettleAllConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleSettleAll}
              className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
            >
              تسوية الكل
            </button>
          </div>
        </div>
      </Modal>

      {/* New Advance Modal */}
      <Modal
        isOpen={showNewAdvanceModal}
        onClose={() => { setShowNewAdvanceModal(false); resetAdvanceForm(); }}
        title="سلفية جديدة"
        size="md"
      >
        <form onSubmit={handleSaveAdvance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
              <input
                type="date"
                required
                value={advDate}
                onChange={(e) => setAdvDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الموظف</label>
              <select
                required
                value={advEmployee}
                onChange={(e) => setAdvEmployee(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="">{t('select')}</option>
                {state.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">المبلغ</label>
              <input
                type="number"
                required
                min="1"
                step="1"
                value={advAmount}
                onChange={(e) => setAdvAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الحساب</label>
              <select
                required
                value={advBankAccountId}
                onChange={(e) => setAdvBankAccountId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
              >
                <option value="">{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <textarea
                value={advNotes}
                onChange={(e) => setAdvNotes(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none h-20"
              />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowNewAdvanceModal(false); resetAdvanceForm(); }}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold shadow-sm transition-colors"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
