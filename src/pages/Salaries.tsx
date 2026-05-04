import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { Plus, Edit2, Eye, Trash2, UserPlus, Printer } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { buildLedgerEntryId, dateTimeFromDateString, dateTimeFromDateStringPreservingTime, formatCurrency, generateDatedId, generateId, getCurrentDateInputValue, getCurrentMonthInputValue } from '../lib/utils';
import { Salary, Expense, Employee } from '../types';
import { canWrite } from '../lib/permissions';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Salaries() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'salaries');

  // === Tab ===
  const [activeTab, setActiveTab] = useState<'employees' | 'salaries' | 'advances'>('salaries');

  // === Employees tab state ===
  const [showEmpAddModal, setShowEmpAddModal] = useState(false);
  const [showEmpEditModal, setShowEmpEditModal] = useState<Employee | null>(null);
  const [showEmpDeleteConfirm, setShowEmpDeleteConfirm] = useState<Employee | null>(null);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empJobTitle, setEmpJobTitle] = useState('');
  const [empSearch, setEmpSearch] = useState('');

  const filteredEmployees = useMemo(() =>
    state.employees.filter(e =>
      !empSearch || e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      (e.jobTitle || '').toLowerCase().includes(empSearch.toLowerCase())
    ),
    [state.employees, empSearch]
  );

  const resetEmpForm = () => {
    setEmpName('');
    setEmpPhone('');
    setEmpJobTitle('');
  };

  const openEmpEdit = (emp: Employee) => {
    setEmpName(emp.name);
    setEmpPhone(emp.phone || '');
    setEmpJobTitle(emp.jobTitle || '');
    setShowEmpEditModal(emp);
  };

  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) return;
    if (showEmpEditModal) {
      updateState({
        employees: state.employees.map(em =>
          em.id === showEmpEditModal.id
            ? { ...em, name: empName.trim(), phone: empPhone.trim() || undefined, jobTitle: empJobTitle.trim() || undefined }
            : em
        ),
      });
      setShowEmpEditModal(null);
    } else {
      const newEmp: Employee = {
        id: generateId('EMP', state.employees),
        name: empName.trim(),
        phone: empPhone.trim() || undefined,
        jobTitle: empJobTitle.trim() || undefined,
      };
      updateState({ employees: [...state.employees, newEmp] });
      setShowEmpAddModal(false);
    }
    resetEmpForm();
  };

  const handleDeleteEmployee = () => {
    if (!showEmpDeleteConfirm) return;
    updateState({ employees: state.employees.filter(e => e.id !== showEmpDeleteConfirm.id) });
    setShowEmpDeleteConfirm(null);
  };

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
  const [date, setDate] = useState(getCurrentDateInputValue());
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<'salary' | 'allowance'>('salary');
  const [month, setMonth] = useState(getCurrentMonthInputValue());
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
  const [showAdvViewModal, setShowAdvViewModal] = useState<Expense | null>(null);
  const [showAdvEditModal, setShowAdvEditModal] = useState<Expense | null>(null);
  const [showAdvDeleteConfirm, setShowAdvDeleteConfirm] = useState<Expense | null>(null);
  const [selectedSalaryIds, setSelectedSalaryIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteSalaryConfirm, setShowBulkDeleteSalaryConfirm] = useState(false);
  const [selectedAdvanceIds, setSelectedAdvanceIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteAdvanceConfirm, setShowBulkDeleteAdvanceConfirm] = useState(false);

  // New/Edit advance form state
  const [advDate, setAdvDate] = useState(getCurrentDateInputValue());
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

  const { items: sortedSalaries, requestSort: sortSalaries, sortConfig: salSortConfig } = useSortableData(filteredSalaries, { key: 'date', direction: 'desc' });

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

  const { items: sortedAdvances, requestSort: sortAdvances, sortConfig: advSortConfig } = useSortableData(filteredAdvances, { key: 'date', direction: 'desc' });

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
    const salaryId = isEditing ? showEditModal!.id : generateDatedId('SA', date, state.salaries);
    const emp = state.employees.find(e => e.id === employeeId);
    const salaryDateTime = isEditing
      ? dateTimeFromDateStringPreservingTime(date, showEditModal!.date)
      : dateTimeFromDateString(date);

    let finalNotes = notes;
    if (autoSettle && totalOpenAdvances > 0 && openAdvancesForEmployee.length > 0) {
      const advNote = `مخصوم سلفيات: ${formatCurrency(totalOpenAdvances)}`;
      finalNotes = finalNotes ? `${finalNotes} | ${advNote}` : advNote;
    }

    const newSalary: Salary = {
      id: salaryId,
      date: salaryDateTime,
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
      id: buildLedgerEntryId('salary', salaryId, 0, activeShipmentId),
      date: salaryDateTime,
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
    setDate(getCurrentDateInputValue());
    setType('salary');
    setMonth(getCurrentMonthInputValue());
    setAutoSettle(true);
  };

  const openEditModal = (salary: Salary) => {
    setDate(salary.date.slice(0, 10));
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

  const toggleSelectSalary = (id: string) => {
    setSelectedSalaryIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allSalariesSelected = sortedSalaries.length > 0 && sortedSalaries.every(s => selectedSalaryIds.has(s.id));
  const toggleSelectAllSalaries = () => {
    if (allSalariesSelected) setSelectedSalaryIds(new Set());
    else setSelectedSalaryIds(new Set(sortedSalaries.map(s => s.id)));
  };
  const handleBulkDeleteSalaries = () => {
    const idsToDelete = selectedSalaryIds;
    updateState({
      salaries: state.salaries.filter(s => !idsToDelete.has(s.id)),
      ledger: state.ledger.filter(l => !idsToDelete.has(l.linkedId)),
    });
    setSelectedSalaryIds(new Set());
    setShowBulkDeleteSalaryConfirm(false);
  };

  // === Advance handlers ===
  const handleSettleAdvance = () => {
    if (!showSettleConfirm) return;
    const settleDate = getCurrentDateInputValue();
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
    const settleDate = getCurrentDateInputValue();
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
    setAdvDate(getCurrentDateInputValue());
    setAdvEmployee('');
    setAdvAmount('');
    setAdvBankAccountId('');
    setAdvNotes('');
  };

  const openAdvEdit = (adv: Expense) => {
    setAdvDate(adv.date.slice(0, 10));
    const emp = state.employees.find(e => e.name === adv.description);
    setAdvEmployee(emp?.id || '');
    setAdvAmount(adv.amount);
    setAdvBankAccountId(adv.bankAccountId);
    setAdvNotes(adv.notes || '');
    setShowAdvEditModal(adv);
  };

  const handleUpdateAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAdvEditModal || !advAmount || !advBankAccountId) return;
    const adv = showAdvEditModal;
    const emp = state.employees.find(em => em.id === advEmployee);
    const newDate = dateTimeFromDateStringPreservingTime(advDate, adv.date);
    const updatedExpense: Expense = {
      ...adv,
      date: newDate,
      description: emp?.name || adv.description,
      amount: Number(advAmount),
      bankAccountId: advBankAccountId,
      notes: advNotes,
    };
    const updatedLedger = state.ledger.map(l =>
      l.linkedId === adv.id
        ? {
            ...l,
            date: newDate,
            toAccount: advBankAccountId,
            description: `سلفية - ${emp?.name || adv.description}${advNotes ? ` (${advNotes})` : ''}`,
            amountOut: Number(advAmount),
          }
        : l
    );
    updateState({
      expenses: state.expenses.map(ex => ex.id === adv.id ? updatedExpense : ex),
      ledger: updatedLedger,
    });
    setShowAdvEditModal(null);
    resetAdvanceForm();
  };

  const handleDeleteAdvance = () => {
    if (!showAdvDeleteConfirm) return;
    updateState({
      expenses: state.expenses.filter(e => e.id !== showAdvDeleteConfirm.id),
      ledger: state.ledger.filter(l => l.linkedId !== showAdvDeleteConfirm.id),
    });
    setShowAdvDeleteConfirm(null);
  };

  const toggleSelectAdvance = (id: string) => {
    setSelectedAdvanceIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allAdvancesSelected = sortedAdvances.length > 0 && sortedAdvances.every(a => selectedAdvanceIds.has(a.id));
  const toggleSelectAllAdvances = () => {
    if (allAdvancesSelected) setSelectedAdvanceIds(new Set());
    else setSelectedAdvanceIds(new Set(sortedAdvances.map(a => a.id)));
  };
  const handleBulkDeleteAdvances = () => {
    const idsToDelete = selectedAdvanceIds;
    updateState({
      expenses: state.expenses.filter(e => !idsToDelete.has(e.id)),
      ledger: state.ledger.filter(l => !idsToDelete.has(l.linkedId)),
    });
    setSelectedAdvanceIds(new Set());
    setShowBulkDeleteAdvanceConfirm(false);
  };

  const printOpenAdvances = () => {
    const shipmentName = advFilterShipment
      ? state.shipments.find(s => s.id === advFilterShipment)?.name || 'الكل'
      : 'كل الرسائل';
    const employeeName = advFilterEmployee
      ? state.employees.find(em => em.id === advFilterEmployee)?.name || 'الكل'
      : 'كل الموظفين';

    const openAdv = allAdvances.filter(e => {
      if (advFilterShipment && e.shipmentId !== advFilterShipment) return false;
      if (advFilterEmployee) {
        const empName = state.employees.find(em => em.id === advFilterEmployee)?.name;
        if (e.description !== empName) return false;
      }
      return !e.settled;
    });

    // Group by employee name
    const byEmp: Record<string, { rows: typeof openAdv; total: number }> = {};
    openAdv.forEach(e => {
      if (!byEmp[e.description]) byEmp[e.description] = { rows: [], total: 0 };
      byEmp[e.description].rows.push(e);
      byEmp[e.description].total += e.amount;
    });

    const fmt = (n: number) => n.toLocaleString('ar-EG', { minimumFractionDigits: 0 });
    const grandTotal = openAdv.reduce((s, e) => s + e.amount, 0);
    const printDate = new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });

    const sectionsHtml = Object.entries(byEmp).map(([empName, { rows, total }], idx) => `
      <div class="emp-block${idx > 0 ? ' page-break' : ''}">
        <div class="emp-header">
          <div class="emp-name">${empName}</div>
          <div class="emp-total">إجمالي السلفيات: <span>${fmt(total)}</span></div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:15%">التاريخ</th>
              <th style="width:20%;text-align:right">المبلغ</th>
              <th style="width:25%">الحساب</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `
            <tr class="${i % 2 === 1 ? 'alt' : ''}">
              <td>${r.date.slice(0, 10)}</td>
              <td class="amount">${fmt(r.amount)}</td>
              <td>${state.bankAccounts.find(b => b.id === r.bankAccountId)?.name || '—'}</td>
              <td class="notes">${r.notes || '—'}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="text-align:right;font-weight:700;padding:6px 10px;">إجمالي ${empName}</td>
              <td class="amount" style="font-weight:900;font-size:12px">${fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `).join('');

    const summaryCards = Object.entries(byEmp).map(([empName, { total }]) => `
      <div class="summary-card">
        <div class="summary-name">${empName}</div>
        <div class="summary-amount">${fmt(total)}</div>
      </div>`).join('');

    const scriptTag = '<scr' + 'ipt>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</' + 'script>';
    const html = [
      '<!DOCTYPE html><html dir="rtl" lang="ar">',
      '<head><meta charset="UTF-8">',
      '<title>كشف السلفيات المفتوحة</title>',
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">',
      '<style>',
      '@page { size: A4 portrait; margin: 14mm; }',
      '* { box-sizing: border-box; margin: 0; padding: 0; }',
      "body { font-family: 'Cairo', sans-serif; direction: rtl; font-size: 11px; color: #1e293b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
      '.header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #134e4a; margin-bottom: 16px; }',
      '.company-name { font-size: 26px; font-weight: 900; color: #134e4a; letter-spacing: -0.5px; }',
      '.company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }',
      '.doc-meta { text-align: left; }',
      '.doc-title { font-size: 16px; font-weight: 800; color: #134e4a; }',
      '.doc-date { font-size: 10px; color: #64748b; margin-top: 3px; }',
      '.info-bar { display: flex; gap: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; }',
      '.info-item { display: flex; flex-direction: column; }',
      '.info-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px; }',
      '.info-value { font-size: 12px; font-weight: 700; color: #134e4a; }',
      '.summary-section { margin-bottom: 18px; }',
      '.summary-title { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }',
      '.summary-grid { display: flex; flex-wrap: wrap; gap: 8px; }',
      '.summary-card { background: #fff; border: 1px solid #e2e8f0; border-top: 3px solid #134e4a; border-radius: 6px; padding: 8px 12px; min-width: 130px; }',
      '.summary-name { font-size: 10px; color: #64748b; font-weight: 600; margin-bottom: 2px; }',
      '.summary-amount { font-size: 14px; font-weight: 900; color: #b91c1c; }',
      '.emp-block { margin-bottom: 20px; }',
      '.page-break { page-break-before: auto; }',
      '.emp-header { display: flex; justify-content: space-between; align-items: center; background: #134e4a; color: #fff; padding: 7px 12px; border-radius: 6px 6px 0 0; }',
      '.emp-name { font-size: 13px; font-weight: 800; }',
      '.emp-total { font-size: 11px; font-weight: 600; opacity: 0.9; }',
      '.emp-total span { font-weight: 900; font-size: 13px; }',
      'table { width: 100%; border-collapse: collapse; }',
      'thead tr { background: #0f4340 !important; }',
      'th { padding: 7px 10px; font-size: 10px; font-weight: 700; color: #fff; text-align: right; border: none; }',
      'td { padding: 6px 10px; font-size: 10.5px; color: #334155; border-bottom: 1px solid #f1f5f9; }',
      'tr.alt td { background: #f8fafc; }',
      'tfoot tr td { background: #f0fdf4 !important; border-top: 2px solid #134e4a; color: #134e4a; }',
      'td.amount { font-weight: 700; color: #b91c1c; text-align: right; }',
      'td.notes { color: #64748b; font-size: 10px; }',
      '.grand-total { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding: 12px 16px; background: #134e4a; border-radius: 8px; color: #fff; }',
      '.grand-label { font-size: 14px; font-weight: 700; }',
      '.grand-value { font-size: 20px; font-weight: 900; }',
      '.footer { text-align: center; font-size: 9px; color: #94a3b8; margin-top: 16px; padding-top: 10px; border-top: 1px solid #e2e8f0; }',
      '</style></head><body>',
      '<div class="header">',
      '  <div><div class="company-name">ASTREDA</div><div class="company-sub">Frozen Food Distribution</div></div>',
      `  <div class="doc-meta"><div class="doc-title">كشف السلفيات المفتوحة</div><div class="doc-date">${printDate}</div></div>`,
      '</div>',
      '<div class="info-bar">',
      `  <div class="info-item"><div class="info-label">الموظف</div><div class="info-value">${employeeName}</div></div>`,
      `  <div class="info-item"><div class="info-label">الرسالة</div><div class="info-value">${shipmentName}</div></div>`,
      `  <div class="info-item"><div class="info-label">عدد السلفيات</div><div class="info-value">${openAdv.length}</div></div>`,
      `  <div class="info-item"><div class="info-label">عدد الموظفين</div><div class="info-value">${Object.keys(byEmp).length}</div></div>`,
      '</div>',
      Object.keys(byEmp).length > 1 ? `<div class="summary-section"><div class="summary-title">ملخص السلفيات بالموظف</div><div class="summary-grid">${summaryCards}</div></div>` : '',
      sectionsHtml || '<p style="text-align:center;color:#94a3b8;padding:30px 0;font-size:13px">لا توجد سلفيات مفتوحة</p>',
      `<div class="grand-total"><span class="grand-label">الإجمالي الكلي</span><span class="grand-value">${fmt(grandTotal)}</span></div>`,
      '<div class="footer">طُبع بواسطة نظام أسترِدا &nbsp;|&nbsp; جميع المبالغ بالجنيه السوداني</div>',
      scriptTag,
      '</body></html>',
    ].join('\n');

    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleSaveAdvance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !advEmployee || !advAmount || !advBankAccountId) return;

    const advAmountNum = Number(advAmount);
    const emp = state.employees.find(e => e.id === advEmployee);
    const newExpenseId = generateDatedId('ADV', advDate, state.expenses);

    const newExpense: Expense = {
      id: newExpenseId,
      date: dateTimeFromDateString(advDate),
      categoryId: advancesCategoryId,
      description: emp?.name || '',
      amount: advAmountNum,
      bankAccountId: advBankAccountId,
      shipmentId: activeShipmentId,
      notes: advNotes,
      settled: false,
    };

    const newLedgerEntry = {
      id: buildLedgerEntryId('expense', newExpenseId, 0, activeShipmentId),
      date: dateTimeFromDateString(advDate),
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('staffManagement')}</h1>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
        {hasWriteAccess && (
          activeTab === 'employees' ? (
            <button
              onClick={() => setShowEmpAddModal(true)}
              className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors"
            >
              <UserPlus className="w-5 h-5 mr-2 rtl:ml-2 rtl:mr-0" />
              {t('addEmployee')}
            </button>
          ) : activeTab === 'salaries' ? (
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
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-6 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === 'employees'
              ? 'border-[#134e4a] text-[#134e4a]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t('employees')}
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">{state.employees.length}</span>
        </button>
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

      {activeTab === 'employees' ? (
        <>
          {/* Employees search */}
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <input
              type="text"
              placeholder={t('search')}
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
            />
          </div>

          {/* Employees Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                <div key={emp.id} className="p-4 flex justify-between items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{emp.name}</p>
                    {emp.jobTitle && <p className="text-xs text-slate-500">{emp.jobTitle}</p>}
                    {emp.phone && <p className="text-xs text-slate-400">{emp.phone}</p>}
                  </div>
                  {hasWriteAccess && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEmpEdit(emp)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => setShowEmpDeleteConfirm(emp)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              )) : (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                <thead className="text-xs text-white uppercase bg-[#1E293B] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">{t('name')}</th>
                    <th className="px-4 py-3">{t('jobTitle')}</th>
                    <th className="px-4 py-3">{t('phone')}</th>
                    {hasWriteAccess && <th className="px-4 py-3 text-center w-24">{t('action')}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.length > 0 ? filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-[#f0fdfa] transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">{emp.name}</td>
                      <td className="px-4 py-3 text-slate-500">{emp.jobTitle || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{emp.phone || '—'}</td>
                      {hasWriteAccess && (
                        <td className="px-4 py-3">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => openEmpEdit(emp)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title={t('edit')}><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => setShowEmpDeleteConfirm(emp)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title={t('delete')}><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )) : (
                    <tr><td colSpan={hasWriteAccess ? 4 : 3} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : activeTab === 'salaries' ? (
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
              <SearchableSelect
                value={filterEmployee}
                onChange={(val) => setFilterEmployee(val)}
                options={[{ value: '', label: t('all') }, ...state.employees.map(e => ({ value: e.id, label: e.name }))]}
                placeholder={t('all')}
              />
            </div>
          </div>

          {/* Bulk-selection toolbar */}
          {hasWriteAccess && selectedSalaryIds.size > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-red-700">{selectedSalaryIds.size} {t('selected')}</span>
              <button onClick={() => setShowBulkDeleteSalaryConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
                <Trash2 className="w-4 h-4" />{t('deleteSelected')}
              </button>
            </div>
          )}

          {/* Salaries Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          {/* Search & Sort Toolbar for Mobile */}
          <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
              <select 
                className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
                onChange={(e) => sortSalaries(e.target.value as any)}
                value={(salSortConfig?.key as string) || 'id'}
              >
                <option value="id">{t('receiptNumber')}</option>
                <option value="date">{t('date')}</option>
                <option value="employeeId">{t('employee')}</option>
                <option value="amount">{t('amount')}</option>
              </select>
            </div>
          </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedSalaries.length > 0 ? sortedSalaries.map((salary, idx) => (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={salary.id} onClick={() => { setSelectedSalaryRowId(salary.id); setShowViewModal(salary); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedSalaryIds.has(salary.id) ? 'bg-red-50' : selectedSalaryRowId === salary.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                  {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedSalaryIds.has(salary.id)} onChange={() => toggleSelectSalary(salary.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></span>}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{state.employees.find(e => e.id === salary.employeeId)?.name}</p>
                      <p className="text-xs text-slate-500">{salary.id} · {format(new Date(salary.date), 'dd/MM/yyyy HH:mm')}</p>
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
                    {hasWriteAccess && <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allSalariesSelected} onChange={toggleSelectAllSalaries} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalaries('id')}><div className="flex items-center gap-1">{t('receiptNumber')} <SortIcon direction={salSortConfig?.direction!} active={salSortConfig?.key === 'id'}/></div></th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalaries('date')}><div className="flex items-center gap-1">{t('date')} <SortIcon direction={salSortConfig?.direction!} active={salSortConfig?.key === 'date'}/></div></th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalaries('employeeId')}><div className="flex items-center gap-1">{t('employee')} <SortIcon direction={salSortConfig?.direction!} active={salSortConfig?.key === 'employeeId'}/></div></th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalaries('type')}><div className="flex items-center gap-1">{t('type')} <SortIcon direction={salSortConfig?.direction!} active={salSortConfig?.key === 'type'}/></div></th>
                    <th className="px-4 py-3">{t('month')}</th>
                    <th className="px-4 py-3">{t('bankAccount')}</th>
                    <th className="px-4 py-3">{t('notes')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalaries('amount')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('amount')} <SortIcon direction={salSortConfig?.direction!} active={salSortConfig?.key === 'amount'}/></div></th>
                    <th className="px-4 py-3 text-center">{t('action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedSalaries.length > 0 ? sortedSalaries.map((salary, idx) => (
                    <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={salary.id} onClick={() => { setSelectedSalaryRowId(salary.id); setShowViewModal(salary); }} className={`transition-colors cursor-pointer ${selectedSalaryIds.has(salary.id) ? 'bg-red-50' : selectedSalaryRowId === salary.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                      {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedSalaryIds.has(salary.id)} onChange={() => toggleSelectSalary(salary.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                      <td className="px-4 py-3 font-medium text-slate-900">{salary.id}</td>
                      <td className="px-4 py-3">{format(new Date(salary.date), 'dd/MM/yyyy HH:mm')}</td>
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
                    </motion.tr>
                  )) : (
                    <tr>
                      <td colSpan={hasWriteAccess ? 10 : 9} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td>
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
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">الموظف</label>
              <SearchableSelect
                value={advFilterEmployee}
                onChange={(val) => setAdvFilterEmployee(val)}
                options={[{ value: '', label: 'الكل' }, ...state.employees.map(e => ({ value: e.id, label: e.name }))]}
                placeholder="الكل"
              />
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
              <SearchableSelect
                value={advFilterShipment}
                onChange={(val) => setAdvFilterShipment(val)}
                options={[{ value: '', label: 'الكل' }, ...state.shipments.map(s => ({ value: s.id, label: s.name }))]}
                placeholder="الكل"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={printOpenAdvances}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800 font-semibold transition-colors"
            >
              <Printer className="w-4 h-4" />
              طباعة السلفيات المفتوحة
            </button>
          </div>
          </div>

          {/* Bulk-selection toolbar */}
          {hasWriteAccess && selectedAdvanceIds.size > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-red-700">{selectedAdvanceIds.size} {t('selected')}</span>
              <button onClick={() => setShowBulkDeleteAdvanceConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-colors">
                <Trash2 className="w-4 h-4" />{t('deleteSelected')}
              </button>
            </div>
          )}

          {/* Advances Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-visible">
          {/* Search & Sort Toolbar for Mobile */}
          <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
            <div className="flex items-center gap-2 justify-between">
              <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
              <select 
                className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
                onChange={(e) => sortAdvances(e.target.value as any)}
                value={(advSortConfig?.key as string) || 'id'}
              >
                <option value="id">رقم السند</option>
                <option value="date">التاريخ</option>
                <option value="description">الموظف</option>
                <option value="amount">المبلغ</option>
                <option value="settled">الحالة</option>
              </select>
            </div>
          </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {sortedAdvances.length > 0 ? sortedAdvances.map((adv, idx) => {
                const advCardClass = selectedAdvanceRowId === adv.id
                  ? 'bg-teal-50'
                  : adv.settled
                    ? 'bg-green-50 hover:bg-green-100'
                    : 'hover:bg-amber-50';
                return (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={adv.id} onClick={() => { setSelectedAdvanceRowId(adv.id); setShowAdvViewModal(adv); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedAdvanceIds.has(adv.id) ? 'bg-red-50' : advCardClass}`}>
                  {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedAdvanceIds.has(adv.id)} onChange={() => toggleSelectAdvance(adv.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></span>}
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{adv.description}</p>
                      <p className="text-xs text-slate-400">{format(new Date(adv.date), 'dd/MM/yyyy HH:mm')}</p>
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
                    <div className="flex gap-1">
                      {!adv.settled && (
                        <button onClick={(e) => { e.stopPropagation(); setShowSettleConfirm(adv.id); }} className="px-3 py-1 bg-[#134e4a] text-white text-xs rounded-lg hover:bg-[#0c3531] transition-colors font-semibold">تسوية</button>
                      )}
                      {hasWriteAccess && !adv.settled && (
                        <button onClick={(e) => { e.stopPropagation(); openAdvEdit(adv); }} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                      )}
                      {hasWriteAccess && (
                        <button onClick={(e) => { e.stopPropagation(); setShowAdvDeleteConfirm(adv); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                </motion.div>
                );
              }) : (
                <p className="px-4 py-8 text-center text-slate-400 text-sm">لا توجد بيانات</p>
              )}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                <thead className="text-xs text-white uppercase bg-[#1E293B] sticky top-0 z-10">
                  <tr>
                    {hasWriteAccess && <th className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allAdvancesSelected} onChange={toggleSelectAllAdvances} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortAdvances('date')}><div className="flex items-center gap-1">التاريخ <SortIcon direction={advSortConfig?.direction!} active={advSortConfig?.key === 'date'}/></div></th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortAdvances('description')}><div className="flex items-center gap-1">الموظف <SortIcon direction={advSortConfig?.direction!} active={advSortConfig?.key === 'description'}/></div></th>
                    <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortAdvances('amount')}><div className="flex items-center justify-end rtl:justify-start gap-1">المبلغ <SortIcon direction={advSortConfig?.direction!} active={advSortConfig?.key === 'amount'}/></div></th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortAdvances('bankAccountId')}><div className="flex items-center gap-1">الحساب <SortIcon direction={advSortConfig?.direction!} active={advSortConfig?.key === 'bankAccountId'}/></div></th>
                    <th className="px-4 py-3">الرسالة</th>
                    <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortAdvances('settled')}><div className="flex items-center gap-1">الحالة <SortIcon direction={advSortConfig?.direction!} active={advSortConfig?.key === 'settled'}/></div></th>
                    <th className="px-4 py-3">ملاحظات</th>
                    <th className="px-4 py-3 text-center w-32">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedAdvances.length > 0 ? sortedAdvances.map((adv, idx) => {
                    const advRowClass = selectedAdvanceRowId === adv.id
                      ? 'bg-teal-50'
                      : adv.settled
                        ? 'bg-green-50 hover:bg-green-100'
                        : 'hover:bg-amber-50';
                    return (
                    <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={adv.id} onClick={() => setSelectedAdvanceRowId(adv.id)} className={`transition-colors cursor-pointer ${selectedAdvanceIds.has(adv.id) ? 'bg-red-50' : advRowClass}`}>
                      {hasWriteAccess && <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedAdvanceIds.has(adv.id)} onChange={() => toggleSelectAdvance(adv.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                      <td className="px-4 py-3">{format(new Date(adv.date), 'dd/MM/yyyy HH:mm')}</td>
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
                        <div className="flex justify-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowAdvViewModal(adv); }}
                            className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                            title={t('view')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {!adv.settled && hasWriteAccess && (
                            <button
                              onClick={(e) => { e.stopPropagation(); openAdvEdit(adv); }}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              title={t('edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {hasWriteAccess && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowAdvDeleteConfirm(adv); }}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title={t('delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {!adv.settled && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowSettleConfirm(adv.id); }}
                              className="px-2 py-1 bg-[#134e4a] text-white text-xs rounded-lg hover:bg-[#0c3531] transition-colors font-semibold whitespace-nowrap"
                            >
                              تسوية
                            </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={hasWriteAccess ? 9 : 8} className="px-4 py-8 text-center text-slate-400">لا توجد بيانات</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ============ MODALS ============ */}

      {/* Add/Edit Employee Modal */}
      <Modal
        isOpen={showEmpAddModal || !!showEmpEditModal}
        onClose={() => { setShowEmpAddModal(false); setShowEmpEditModal(null); resetEmpForm(); }}
        title={showEmpEditModal ? t('editEmployee') : t('addEmployee')}
        size="sm"
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('name')} *</label>
            <input
              type="text"
              required
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('jobTitle')}</label>
            <input
              type="text"
              value={empJobTitle}
              onChange={(e) => setEmpJobTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('phone')}</label>
            <input
              type="tel"
              value={empPhone}
              onChange={(e) => setEmpPhone(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              dir="ltr"
            />
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowEmpAddModal(false); setShowEmpEditModal(null); resetEmpForm(); }}
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

      {/* Delete Employee Confirmation */}
      <Modal isOpen={!!showEmpDeleteConfirm} onClose={() => setShowEmpDeleteConfirm(null)} title={t('confirmDelete')} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">
            {t('areYouSure')} <strong>{showEmpDeleteConfirm?.name}</strong>؟
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowEmpDeleteConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleDeleteEmployee}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              {t('yes')}
            </button>
          </div>
        </div>
      </Modal>

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
              <SearchableSelect
                required
                value={employeeId}
                onChange={(val) => setEmployeeId(val)}
                options={state.employees.map(e => ({ value: e.id, label: e.name }))}
                placeholder={t('select')}
              />
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
                      <span>{format(new Date(adv.date), 'dd/MM/yyyy HH:mm')}</span>
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
                <p className="font-medium">{format(new Date(showViewModal.date), 'dd/MM/yyyy HH:mm')}</p>
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

      {/* View Advance Modal */}
      <Modal isOpen={!!showAdvViewModal} onClose={() => setShowAdvViewModal(null)} title="عرض سلفية" size="sm">
        {showAdvViewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('date')}</label>
                <p className="font-medium text-sm">{format(new Date(showAdvViewModal.date), 'dd/MM/yyyy HH:mm')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">الموظف</label>
                <p className="font-medium text-sm">{showAdvViewModal.description}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('amount')}</label>
                <p className="font-bold text-red-600">{formatCurrency(showAdvViewModal.amount)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('bankAccount')}</label>
                <p className="font-medium text-sm">{state.bankAccounts.find(b => b.id === showAdvViewModal.bankAccountId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">الرسالة</label>
                <p className="font-medium text-sm">{state.shipments.find(s => s.id === showAdvViewModal.shipmentId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">الحالة</label>
                <p className="font-medium text-sm">{showAdvViewModal.settled ? '✅ مُسوَّى' : '🔴 مفتوح'}</p>
              </div>
              {showAdvViewModal.notes && (
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-500">{t('notes')}</label>
                  <p className="font-medium text-sm">{showAdvViewModal.notes}</p>
                </div>
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button onClick={() => setShowAdvViewModal(null)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">{t('close')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Advance Modal */}
      <Modal
        isOpen={!!showAdvEditModal}
        onClose={() => { setShowAdvEditModal(null); resetAdvanceForm(); }}
        title="تعديل سلفية"
        size="md"
      >
        <form onSubmit={handleUpdateAdvance} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
              <input type="date" required value={advDate} onChange={(e) => setAdvDate(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الموظف</label>
              <SearchableSelect required value={advEmployee} onChange={(val) => setAdvEmployee(val)}
                options={state.employees.map(e => ({ value: e.id, label: e.name }))} placeholder={t('select')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">المبلغ</label>
              <input type="number" required min="1" step="1" value={advAmount} onChange={(e) => setAdvAmount(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">الحساب</label>
              <SearchableSelect required value={advBankAccountId} onChange={(val) => setAdvBankAccountId(val)}
                options={state.bankAccounts.map(b => ({ value: b.id, label: b.name }))} placeholder={t('select')} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
              <textarea value={advNotes} onChange={(e) => setAdvNotes(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none resize-none h-20" />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
            <button type="button" onClick={() => { setShowAdvEditModal(null); resetAdvanceForm(); }}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('cancel')}</button>
            <button type="submit"
              className="px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold shadow-sm transition-colors">{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Advance Confirmation */}
      <Modal isOpen={!!showAdvDeleteConfirm} onClose={() => setShowAdvDeleteConfirm(null)} title="حذف سلفية" size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">هل تريد حذف سلفية <strong>{showAdvDeleteConfirm?.description}</strong> بمبلغ <strong>{showAdvDeleteConfirm ? formatCurrency(showAdvDeleteConfirm.amount) : ''}</strong>؟</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowAdvDeleteConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeleteAdvance}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
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
              <SearchableSelect
                required
                value={advEmployee}
                onChange={(val) => setAdvEmployee(val)}
                options={state.employees.map(e => ({ value: e.id, label: e.name }))}
                placeholder={t('select')}
              />
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
              <SearchableSelect
                required
                value={advBankAccountId}
                onChange={(val) => setAdvBankAccountId(val)}
                options={state.bankAccounts.map(b => ({ value: b.id, label: b.name }))}
                placeholder={t('select')}
              />
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

      {/* Bulk Delete Salaries Confirm */}
      <Modal isOpen={showBulkDeleteSalaryConfirm} onClose={() => setShowBulkDeleteSalaryConfirm(false)} title={t('confirmDelete')} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">هل أنت متأكد من حذف {selectedSalaryIds.size} راتب/بدل؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBulkDeleteSalaryConfirm(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleBulkDeleteSalaries} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Advances Confirm */}
      <Modal isOpen={showBulkDeleteAdvanceConfirm} onClose={() => setShowBulkDeleteAdvanceConfirm(false)} title={t('confirmDelete')} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">هل أنت متأكد من حذف {selectedAdvanceIds.size} سلفية؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBulkDeleteAdvanceConfirm(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleBulkDeleteAdvances} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
