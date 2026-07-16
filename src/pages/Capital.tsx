import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { motion } from 'framer-motion';
import {
  Wallet, Plus, Printer, CheckCircle, XCircle,
  LayoutGrid, Table2, ChevronDown, ChevronUp,
  AlertTriangle, Users, TrendingUp,
  BarChart3, Building2, CreditCard, Trash2, Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { buildLedgerEntryId, computeBankBalance, formatCurrency, generateDatedId, getCurrentDateInputValue, getCurrentDateTimeValue } from '../lib/utils';
import type { CapitalContribution, GeneralTransfer, ManualProfitEntry, ManualProfitDistribution } from '../types';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';
import { canWrite } from '../lib/permissions';
import { upsertRecord } from '../lib/syncEngine';
import { computeExpenseDeduction } from '../lib/profitDistribution';

type Tab = 'investors' | 'distribution' | 'verification';

const fmtSAR = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' SAR';
const fmtSDG = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' SDG';
function getPartnerContributionStats(contributions: CapitalContribution[], partnerId: string) {
  const partnerContributions = contributions.filter(c => c.partnerId === partnerId);
  const capital = partnerContributions.reduce((sum, c) => sum + c.amountSAR, 0);
  return { capital };
}

export default function Capital() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'capital');
  const [activeTab, setActiveTab] = useState<Tab>('investors');
  const [selectedInvestorRowId, setSelectedInvestorRowId] = useState<string | null>(null);
  const [showContribModal, setShowContribModal] = useState(false);
  const [editingContribId, setEditingContribId] = useState<string | null>(null);
  const [showDeleteContribId, setShowDeleteContribId] = useState<string | null>(null);
  const [contribPartnerId, setContribPartnerId] = useState('');
  const [contribAmountSAR, setContribAmountSAR] = useState<number | ''>('');
  const [contribDate, setContribDate] = useState(getCurrentDateInputValue());
  const [contribNotes, setContribNotes] = useState('');
  const [capitalView, setCapitalView] = useState<'cards' | 'table'>('cards');
  const [expandedPartnerIds, setExpandedPartnerIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedPartnerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const [showDrawModal, setShowDrawModal] = useState(false);
  const [showDeleteDrawingId, setShowDeleteDrawingId] = useState<string | null>(null);
  const [selectedDrawIds, setSelectedDrawIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDrawConfirm, setShowBulkDeleteDrawConfirm] = useState(false);
  const [editingDrawId, setEditingDrawId] = useState<string | null>(null);
  const [drawPartnerId, setDrawPartnerId] = useState('');
  const [drawDate, setDrawDate] = useState(getCurrentDateInputValue());
  const [drawDescription, setDrawDescription] = useState('');
  const [drawExchangeRate, setDrawExchangeRate] = useState<number | ''>('');
  const [drawSplits, setDrawSplits] = useState<{ bankAccountId: string; amount: number }[]>([{ bankAccountId: '', amount: 0 }]);

  // ─── Profit distribution state ────────────────────────────────
  const [profitDraft, setProfitDraft] = useState<Record<string, { profit: string }>>({});
  const [distAddPartnerId, setDistAddPartnerId] = useState('');

  const activeShipment = state.shipments.find(s => s.id === activeShipmentId);
  const operatingPartners = useMemo(() => state.partners.filter(p => p.isOperatingPartner), [state.partners]);
  const contributions = useMemo(() =>
    (state.capitalContributions || []).filter(c => c.shipmentId === activeShipmentId),
    [state.capitalContributions, activeShipmentId]);
  const capitalReturns = useMemo(() =>
    state.generalTransfers.filter(t => t.shipmentId === activeShipmentId && (t.transferType === 'capital_return' || t.transferType === 'capital')),
    [state.generalTransfers, activeShipmentId]);
  const drawingTransfers = useMemo(() =>
    state.generalTransfers.filter(t => t.transferType === 'drawings' && t.shipmentId === activeShipmentId),
    [state.generalTransfers, activeShipmentId]);

  // Reset profit draft when active shipment changes
  useEffect(() => {
    setProfitDraft({});
    setDistAddPartnerId('');
  }, [activeShipmentId]);

  // Capital return amounts per partner for active shipment
  const capitalReturnByPartner = useMemo(() => {
    const map: Record<string, number> = {};
    capitalReturns.forEach(t => {
      const pid = t.beneficiaryPartnerId || t.partnerId;
      map[pid] = (map[pid] ?? 0) + t.amountSAR;
    });
    return map;
  }, [capitalReturns]);

  // Saved profit distribution for active shipment
  const savedDist = useMemo(() =>
    (state.manualProfitDistributions || []).find(d => d.shipmentId === activeShipmentId),
    [state.manualProfitDistributions, activeShipmentId]
  );

  // Auto-calculated expenses per partner from real expense records for the active shipment.
  // Only expenses that explicitly carry a partnerId are counted — no silent attribution.
  const expensesByPartner = useMemo(() => {
    const map: Record<string, number> = {};
    if (!activeShipmentId) return map;
    state.expenses.forEach(e => {
      if (e.shipmentId === activeShipmentId && e.partnerId) {
        map[e.partnerId] = (map[e.partnerId] ?? 0) + e.amount;
      }
    });
    return map;
  }, [state.expenses, activeShipmentId]);

  // Which partners to show in the distribution editor
  const distDisplayPartnerIds = useMemo(() => {
    const ids = new Set<string>();
    state.partners.filter(p => (capitalReturnByPartner[p.id] ?? 0) > 0).forEach(p => ids.add(p.id));
    state.partners.filter(p => (expensesByPartner[p.id] ?? 0) > 0).forEach(p => ids.add(p.id));
    (savedDist?.entries || []).forEach(e => ids.add(e.partnerId));
    Object.keys(profitDraft).forEach(id => ids.add(id));
    return ids;
  }, [state.partners, capitalReturnByPartner, expensesByPartner, savedDist, profitDraft]);

  const finalDistPartners = useMemo(() =>
    state.partners.filter(p => distDisplayPartnerIds.has(p.id)),
    [state.partners, distDisplayPartnerIds]
  );

  const unshownDistPartners = useMemo(() =>
    state.partners.filter(p => !distDisplayPartnerIds.has(p.id)),
    [state.partners, distDisplayPartnerIds]
  );
  // === TAB 1: Investor data per partner (capital tracking only) ===
  const investorData = useMemo(() => {
    if (!activeShipmentId) return [];
    const partnersWithContribs = new Set(contributions.map(c => c.partnerId));
    const partnerList = state.partners.filter(p => partnersWithContribs.has(p.id)).map(partner => ({
      partner,
      ...getPartnerContributionStats(contributions, partner.id),
    }));
    return partnerList.map(({ partner, capital }) => {
      const returned = capitalReturns.filter(t => t.beneficiaryPartnerId === partner.id).reduce((s, t) => s + t.amountSAR, 0);
      const remainingCapital = Math.max(0, capital - returned);
      const capitalStatus: 'returned' | 'pending' = remainingCapital === 0 ? 'returned' : 'pending';
      const transactions = [
        ...contributions.filter(c => c.partnerId === partner.id).map(c => ({ id: c.id, date: c.date, type: 'مساهمة' as const, sar: c.amountSAR, sdg: 0, desc: c.notes || 'مساهمة رأس مال', original: c })),
        ...capitalReturns.filter(t => t.beneficiaryPartnerId === partner.id).map(t => ({ id: t.id, date: t.date, type: 'إرجاع' as const, sar: -t.amountSAR, sdg: t.amountSDG, desc: t.description || '-', original: undefined })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return { partner, capital, returned, remainingCapital, capitalStatus, transactions };
    });
  }, [activeShipmentId, contributions, capitalReturns, state.partners]);

  const { items: sortedInvestorData, requestSort: sortInvestors, sortConfig: invSortConfig } = useSortableData(investorData, { key: 'partner.name' as any, direction: 'asc' });
  const { items: sortedDrawingTransfers, requestSort: sortDrawings, sortConfig: drawSortConfig } = useSortableData(drawingTransfers, { key: 'date', direction: 'desc' });

  const totalContributed = investorData.reduce((s, d) => s + d.capital, 0);
  const totalReturned = investorData.reduce((s, d) => s + d.returned, 0);
  const totalRemaining = totalContributed - totalReturned;

  // === TAB 3: Verification ===
  const verification = useMemo(() => {
    if (!activeShipmentId) return null;
    const totalSalesSDG = state.invoices.filter(i => i.shipmentId === activeShipmentId).reduce((s, i) => s + i.total, 0);
    const totalExpensesSDG = state.expenses.filter(e => e.shipmentId === activeShipmentId).reduce((s, e) => s + e.amount, 0);
    const totalSalariesSDG = state.salaries.filter(s2 => s2.shipmentId === activeShipmentId).reduce((s, sal) => s + sal.amount, 0);
    // تغذية رصيد is cash ARRIVING from outside (not earned by the shipment):
    // it enters the equation as a source, not as an outflow transfer.
    const totalInjectionsSDG = state.generalTransfers.filter(t =>
      t.shipmentId === activeShipmentId && t.transferType === 'cash_injection'
    ).reduce((s, t) => s + t.amountSDG, 0);
    const totalTransfersSDG = state.generalTransfers.filter(t =>
      t.shipmentId === activeShipmentId && t.transferType !== 'cash_injection'
    ).reduce((s, t) => s + t.amountSDG, 0);
    const shipmentLedger = state.ledger.filter(e => e.shipmentId === activeShipmentId);
    const cashBalanceSDG = state.bankAccounts.reduce((s, b) => s + computeBankBalance(b.id, shipmentLedger), 0);
    const totalCreditInvoices = state.invoices.filter(i => i.shipmentId === activeShipmentId && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const totalPaymentsCollected = state.payments.filter(p => p.shipmentId === activeShipmentId).reduce((s, p) => s + p.amount, 0);
    const uncollectedDebtSDG = totalCreditInvoices - totalPaymentsCollected;
    const diff = totalSalesSDG + totalInjectionsSDG - totalExpensesSDG - totalSalariesSDG - totalTransfersSDG - cashBalanceSDG - uncollectedDebtSDG;
    return { totalSalesSDG, totalInjectionsSDG, totalExpensesSDG, totalSalariesSDG, totalTransfersSDG, cashBalanceSDG, uncollectedDebtSDG, diff };
  }, [activeShipmentId, state]);

  // === HANDLERS ===
  const resetContribForm = () => {
    setContribPartnerId('');
    setContribAmountSAR('');
    setContribDate(getCurrentDateInputValue());
    setContribNotes('');
    setEditingContribId(null);
  };
  const handleSaveContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;
    if (!contribPartnerId || !contribAmountSAR || !activeShipmentId) return;
    if (editingContribId) {
      updateState({
        capitalContributions: (state.capitalContributions || []).map(c => 
          c.id === editingContribId
            ? { ...c, partnerId: contribPartnerId, amountSAR: Number(contribAmountSAR), date: contribDate, notes: contribNotes || undefined }
            : c
        )
      });
    } else {
      const newContrib: CapitalContribution = {
        id: generateDatedId('CC', contribDate, state.capitalContributions || []),
        partnerId: contribPartnerId, shipmentId: activeShipmentId,
        amountSAR: Number(contribAmountSAR), date: contribDate, notes: contribNotes || undefined,
      };
      updateState({ capitalContributions: [...(state.capitalContributions || []), newContrib] });
    }
    setShowContribModal(false); resetContribForm();
  };

  const openEditContrib = (c: CapitalContribution) => {
    setEditingContribId(c.id);
    setContribPartnerId(c.partnerId);
    setContribAmountSAR(c.amountSAR);
    setContribDate(c.date);
    setContribNotes(c.notes || '');
    setShowContribModal(true);
  };

  const handleDeleteContrib = () => {
    if (!hasWriteAccess || !showDeleteContribId) return;
    updateState({ capitalContributions: (state.capitalContributions || []).filter(c => c.id !== showDeleteContribId) });
    setShowDeleteContribId(null);
  };

  const resetDrawForm = () => {
    setDrawPartnerId(''); setDrawDate(getCurrentDateInputValue());
    setDrawDescription(''); setDrawExchangeRate('');
    setDrawSplits([{ bankAccountId: '', amount: 0 }]);
    setEditingDrawId(null);
  };

  const openEditDraw = (transfer: GeneralTransfer) => {
    if (!hasWriteAccess) return;
    setDrawPartnerId(transfer.partnerId);
    setDrawDate(transfer.date);
    setDrawDescription(transfer.description || '');
    setDrawExchangeRate(transfer.exchangeRate);
    setDrawSplits([...transfer.splits]);
    setEditingDrawId(transfer.id);
    setShowDrawModal(true);
  };

  const handleSaveDrawing = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;
    if (!activeShipmentId || !drawPartnerId) return;
    const validSplits = drawSplits.filter(s => s.bankAccountId && s.amount > 0);
    if (validSplits.length === 0) return;
    const totalSDG = validSplits.reduce((sum, s) => sum + s.amount, 0);
    const exRate = Number(drawExchangeRate) || 1;
    const amountSAR = totalSDG / exRate;
    const isEditing = !!editingDrawId;
    const drawId = isEditing ? editingDrawId! : generateDatedId('TR', drawDate, state.generalTransfers);
    const newTransfer: GeneralTransfer = {
      id: drawId, date: drawDate, partnerId: drawPartnerId,
      transferType: 'drawings', amountSDG: totalSDG, exchangeRate: exRate,
      amountSAR, splits: validSplits, description: drawDescription,
      shipmentId: activeShipmentId,
    };
    let newBankAccounts = [...state.bankAccounts];
    let newLedger = [...state.ledger];
    // If editing, reverse the old transfer first (same pattern as GeneralTransfers.tsx)
    if (isEditing) {
      const oldTransfer = state.generalTransfers.find(t => t.id === editingDrawId);
      if (oldTransfer) {
        oldTransfer.splits.forEach(split => {
          newBankAccounts = newBankAccounts.map(b =>
            b.id === split.bankAccountId ? { ...b, balance: b.balance + split.amount } : b
          );
        });
        newLedger = newLedger.filter(l => l.linkedId !== oldTransfer.id);
      }
    }
    // Deduct new amounts from bank accounts
    validSplits.forEach(split => {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === split.bankAccountId ? { ...b, balance: b.balance - split.amount } : b
      );
    });
    // Create new ledger entries (one per split, matching GeneralTransfers.tsx)
    const partnerName = state.partners.find(p => p.id === drawPartnerId)?.name || '';
    const newLedgerEntries = validSplits.map((split, index) => ({
      id: buildLedgerEntryId('general_transfer', drawId, index, activeShipmentId), date: drawDate, fromAccount: split.bankAccountId,
      description: `منصرفات الشركاء - ${partnerName}${drawDescription ? ` (${drawDescription})` : ''}`,
      amountIn: 0, amountOut: split.amount,
      sourceModule: 'general_transfer' as const,
      linkedId: drawId, shipmentId: activeShipmentId,
    }));
    updateState({
      generalTransfers: isEditing
        ? state.generalTransfers.map(t => t.id === drawId ? newTransfer : t)
        : [...state.generalTransfers, newTransfer],
      ledger: [...newLedger, ...newLedgerEntries],
      bankAccounts: newBankAccounts,
    });
    setShowDrawModal(false);
    resetDrawForm();
  };

  const handleDeleteDrawing = () => {
    if (!hasWriteAccess || !showDeleteDrawingId) return;
    updateState({
      generalTransfers: state.generalTransfers.filter(t => t.id !== showDeleteDrawingId),
      ledger: state.ledger.filter(l => l.linkedId !== showDeleteDrawingId),
    });
    setShowDeleteDrawingId(null);
  };

  const toggleSelectDraw = (id: string) => {
    setSelectedDrawIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const allDrawingsSelected = sortedDrawingTransfers.length > 0 && sortedDrawingTransfers.every(d => selectedDrawIds.has(d.id));
  const toggleSelectAllDrawings = () => {
    if (allDrawingsSelected) setSelectedDrawIds(new Set());
    else setSelectedDrawIds(new Set(sortedDrawingTransfers.map(d => d.id)));
  };
  const handleBulkDeleteDrawings = () => {
    const idsToDelete = selectedDrawIds;
    updateState({
      generalTransfers: state.generalTransfers.filter(t => !idsToDelete.has(t.id)),
      ledger: state.ledger.filter(l => !idsToDelete.has(l.linkedId)),
    });
    setSelectedDrawIds(new Set());
    setShowBulkDeleteDrawConfirm(false);
  };

  // === PROFIT DISTRIBUTION HANDLERS ===
  const getDistEntryDraft = (partnerId: string) => {
    const saved = savedDist?.entries.find(e => e.partnerId === partnerId);
    const draft = profitDraft[partnerId];
    return {
      profit: draft?.profit !== undefined ? draft.profit : (saved?.profit != null ? String(saved.profit) : ''),
    };
  };

  const handleDistDraftChange = (partnerId: string, value: string) => {
    if (!hasWriteAccess) return;
    setProfitDraft(prev => ({
      ...prev,
      [partnerId]: { profit: value },
    }));
  };

  const handleAddDistPartner = () => {
    if (!distAddPartnerId) return;
    if (!profitDraft[distAddPartnerId]) {
      setProfitDraft(prev => ({ ...prev, [distAddPartnerId]: { profit: '' } }));
    }
    setDistAddPartnerId('');
  };

  const handleSaveDistribution = () => {
    if (!hasWriteAccess || !activeShipmentId) return;
    const partnerIds = new Set([
      ...(savedDist?.entries.map(e => e.partnerId) ?? []),
      ...Object.keys(profitDraft),
      ...state.partners.filter(p => (capitalReturnByPartner[p.id] ?? 0) > 0).map(p => p.id),
      ...state.partners.filter(p => (expensesByPartner[p.id] ?? 0) > 0).map(p => p.id),
    ]);
    const entries: ManualProfitEntry[] = Array.from(partnerIds).map(pid => {
      const d = getDistEntryDraft(pid);
      const profitVal = d.profit.trim() === '' ? null : Number(d.profit);
      const expensesVal = expensesByPartner[pid] ?? 0;
      const capReturn = capitalReturnByPartner[pid] ?? 0;
      return { partnerId: pid, capitalReturn: capReturn, expenses: expensesVal, profit: profitVal };
    }).filter(e => e.capitalReturn > 0 || e.profit != null || e.expenses > 0);
    const newDist: ManualProfitDistribution = {
      shipmentId: activeShipmentId,
      savedAt: new Date().toISOString(),
      entries,
    };
    const existing = (state.manualProfitDistributions || []).filter(d => d.shipmentId !== activeShipmentId);
    updateState({ manualProfitDistributions: [...existing, newDist] });
    upsertRecord('manualProfitDistributions', newDist);
    setProfitDraft({});
  };

  const printInvestorTable = () => {
    const shipmentName = activeShipment?.name || '';
    const rows = investorData.map((d, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td>${d.partner.name}</td><td class="num">${fmtSAR(d.capital)}</td><td class="num">${fmtSAR(d.returned)}</td>
      <td class="num ${d.remainingCapital > 0 ? 'red' : 'green'}">${fmtSAR(d.remainingCapital)}</td>
      <td>${d.capitalStatus === 'returned' ? '🟢 مُرجَع' : '🔴 لم يُرجَع'}</td>
    </tr>`).join('');
    const totals = `<tr class="totals"><td>الإجمالي</td><td class="num">${fmtSAR(totalContributed)}</td><td class="num">${fmtSAR(totalReturned)}</td>
      <td class="num">${fmtSAR(totalRemaining)}</td><td></td></tr>`;
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>متابعة رأس المال</title>
      <style>body{font:10px/1.4 sans-serif;direction:rtl;margin:20px}h1{font-size:14px;text-align:center;margin-bottom:4px}
      .sub{text-align:center;font-size:11px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}th{background:#134e4a;color:#fff;font-size:9px}
      .alt{background:#f8f9fa}.num{text-align:left;font-family:monospace}.bold{font-weight:bold}
      .red{color:#dc2626}.green{color:#16a34a}.totals{background:#e2e8f0;font-weight:bold}</style></head>
      <body><h1>أستريدا للتوزيع — متابعة رأس المال</h1><div class="sub">${shipmentName} | ${format(new Date(),'dd/MM/yyyy HH:mm')}</div>
      <table><thead><tr><th>المساهم</th><th>رأس المال (SAR)</th><th>المُرجَع (SAR)</th><th>متبقي رأس مال</th><th>الحالة</th></tr></thead>
      <tbody>${rows}${totals}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // === RENDER ===
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'investors', label: 'المساهمون', icon: <Users className="w-4 h-4" /> },
    { key: 'distribution', label: 'توزيع الأرباح', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'verification', label: 'التحقق من الرسالة', icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const capitalStatusBadge = (status: string) => {
    if (status === 'returned') return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">🟢 مُرجَع</span>;
    return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">🔴 لم يُرجَع</span>;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#ccfbf1] rounded-xl"><Wallet className="w-6 h-6 text-[#134e4a]" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">رأس المال والتصفية</h1>
            <p className="text-sm text-slate-500">{activeShipment?.name || 'لا توجد رسالة نشطة'}</p>
          </div>
          {!hasWriteAccess && <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key ? 'border-[#134e4a] text-[#134e4a]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>{tab.icon}{tab.label}</button>
        ))}
      </div>

      {/* ═══════════ TAB 1: المساهمون ═══════════ */}
      {activeTab === 'investors' && (
        <div className="space-y-6">
          {/* View toggle + action */}
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="flex gap-2">
              <button onClick={() => setCapitalView('cards')} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${capitalView === 'cards' ? 'bg-[#134e4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <LayoutGrid className="w-4 h-4" />بطاقات</button>
              <button onClick={() => setCapitalView('table')} className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${capitalView === 'table' ? 'bg-[#134e4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                <Table2 className="w-4 h-4" />جدول</button>
            </div>
            <div className="flex gap-2">
              {capitalView === 'table' && (
                <button onClick={printInvestorTable} className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm font-semibold">
                  <Printer className="w-4 h-4" />طباعة</button>
              )}
              {hasWriteAccess && <button onClick={() => { resetContribForm(); setShowContribModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] text-sm font-semibold shadow-sm">
                <Plus className="w-4 h-4" />تسجيل مساهمة</button>
              }
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">إجمالي رأس المال المُجمَّع</p>
              <p className="text-xl font-bold text-slate-800">{fmtSAR(totalContributed)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">إجمالي ما تم إرجاعه (رأس مال فقط)</p>
              <p className="text-xl font-bold text-slate-800">{fmtSAR(totalReturned)}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">إجمالي المتبقي</p>
              <p className={`text-xl font-bold ${totalRemaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(totalRemaining)}</p>
            </div>
          </div>

          {investorData.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
              <p>لا توجد مساهمات مسجلة للرسالة النشطة</p>
            </div>
          ) : capitalView === 'cards' ? (
            /* ── Cards View ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {sortedInvestorData.map((d, idx) => {
                const initials = d.partner.name.split(' ').map(w => w[0]).slice(0, 2).join('');
                const isExpanded = expandedPartnerIds.has(d.partner.id);
                return (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={d.partner.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#134e4a] text-white flex items-center justify-center font-bold text-sm">{initials}</div>
                        <span className="font-bold text-slate-800">{d.partner.name}</span>
                      </div>
                      {capitalStatusBadge(d.capitalStatus)}
                    </div>
                    {/* Card body */}
                    <div className="px-4 py-3 space-y-3 text-sm">
                      <div className="space-y-1.5">
                        <div className="flex justify-between"><span className="text-slate-500">رأس المال</span><span className="font-semibold">{fmtSAR(d.capital)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">المُرجَع</span><span className="font-semibold">{fmtSAR(d.returned)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">متبقي رأس المال</span>
                          <span className={`font-bold ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(d.remainingCapital)}</span></div>
                      </div>
                    </div>
                    {/* Expandable transactions */}
                    <div className="border-t border-slate-100">
                      <button onClick={() => toggleExpanded(d.partner.id)}
                        className="w-full flex items-center justify-center gap-1 px-4 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors">
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        تفاصيل العمليات
                      </button>
                      {isExpanded && d.transactions.length > 0 && (
                        <div className="px-3 pb-3">
                          <table className="w-full text-xs">
                            <thead><tr className="text-slate-400 border-b border-slate-100">
                              <th className="py-1 text-right font-medium">التاريخ</th><th className="py-1 text-right font-medium">النوع</th>
                              <th className="py-1 text-left font-medium">SAR</th><th className="py-1 text-left font-medium">SDG</th>
                              <th className="py-1 text-right font-medium">الوصف</th>
                              {hasWriteAccess && <th className="py-1 text-center font-medium">إجراء</th>}
                            </tr></thead>
                            <tbody>{d.transactions.map((tx, i) => (
                              <tr key={i} className="border-b border-slate-50">
                                <td className="py-1">{format(new Date(tx.date), 'dd/MM')}</td>
                                <td className={`py-1 font-medium ${tx.type === 'مساهمة' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {tx.type} {tx.type === 'مساهمة' ? '↓' : '↑'}</td>
                                <td className={`py-1 text-left font-mono ${tx.sar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {tx.sar >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', {minimumFractionDigits:0,maximumFractionDigits:0}).format(tx.sar)}</td>
                                <td className="py-1 text-left font-mono text-slate-500">{tx.sdg > 0 ? new Intl.NumberFormat('en-US').format(tx.sdg) : '0'}</td>
                                <td className="py-1 text-slate-500 truncate max-w-[80px]" title={tx.desc}>{tx.desc}</td>
                                {hasWriteAccess && (
                                  <td className="py-1 text-center">
                                    {tx.type === 'مساهمة' && tx.original ? (
                                      <div className="flex justify-center gap-2">
                                        <button onClick={() => openEditContrib(tx.original as CapitalContribution)} className="text-slate-400 hover:text-[#14b8a6] transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => setShowDeleteContribId(tx.id)} className="text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                      </div>
                                    ) : null}
                                  </td>
                                )}
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            /* ── Table View ── */
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {sortedInvestorData.length > 0 ? sortedInvestorData.map((d, idx) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={d.partner.id} onClick={() => setSelectedInvestorRowId(d.partner.id)} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedInvestorRowId === d.partner.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{d.partner.name}</p>
                        <p className="text-xs text-slate-500">رأس المال: <span className="font-mono">{fmtSAR(d.capital)}</span></p>
                      </div>
                      {capitalStatusBadge(d.capitalStatus)}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">المُرجَع</span><span className="font-mono text-right">{fmtSAR(d.returned)}</span>
                      <span className={`font-mono font-bold text-right col-span-1 ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>متبقي رأس مال: {fmtSAR(d.remainingCapital)}</span>
                    </div>
                  </motion.div>
                )) : (
                  <p className="px-4 py-8 text-center text-slate-400 text-sm">لا توجد بيانات</p>
                )}
              </div>
      {/* Search & Sort Toolbar for Mobile */}
      {capitalView === 'table' && (
      <div className="md:hidden bg-white p-4 rounded-xl shadow-modern glass border-slate-200 mb-4">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-slate-50 border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortInvestors(e.target.value as any)}
            value={(invSortConfig?.key as string) || 'partner.name'}
          >
            <option value="partner.name">المساهم</option>
            <option value="capital">رأس المال</option>
            <option value="remainingCapital">متبقي رأس مال</option>
          </select>
        </div>
      </div>
      )}

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-right text-slate-600">
                  <thead className="text-xs text-white bg-[#134e4a]">
                    <tr>
                      <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvestors('partner.name' as any)}><div className="flex items-center gap-1">المساهم <SortIcon direction={invSortConfig?.direction!} active={(invSortConfig?.key as string) === 'partner.name'}/></div></th>
                      <th className="px-4 py-3 text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvestors('capital')}><div className="flex items-center justify-end rtl:justify-start gap-1">رأس المال (SAR) <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'capital'}/></div></th>
                      <th className="px-4 py-3 text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvestors('returned')}><div className="flex items-center justify-end rtl:justify-start gap-1">المُرجَع (SAR) <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'returned'}/></div></th>
                      <th className="px-4 py-3 text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortInvestors('remainingCapital')}><div className="flex items-center justify-end rtl:justify-start gap-1">متبقي رأس مال <SortIcon direction={invSortConfig?.direction!} active={invSortConfig?.key === 'remainingCapital'}/></div></th>
                      <th className="px-4 py-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedInvestorData.map((d, idx) => (
                      <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={d.partner.id} onClick={() => setSelectedInvestorRowId(d.partner.id)} className={`transition-colors cursor-pointer ${selectedInvestorRowId === d.partner.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{d.partner.name}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.capital)}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.returned)}</td>
                        <td className={`px-4 py-3 text-left font-mono font-bold ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(d.remainingCapital)}</td>
                        <td className="px-4 py-3 text-center">{capitalStatusBadge(d.capitalStatus)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                    <tr>
                      <td className="px-4 py-3">الإجمالي</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalContributed)}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalReturned)}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalRemaining)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB 2: توزيع الأرباح ═══════════ */}
      {activeTab === 'distribution' && (
        <div className="space-y-6 max-w-3xl mx-auto">
          {/* ── Profit Distribution Form ── */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#134e4a]" />توزيع الأرباح اليدوي
              </h3>
              <p className="text-xs text-slate-400">يتم توزيع الأرباح يدوياً — مرتبط بالرسالة النشطة: <strong>{activeShipment?.name || '—'}</strong></p>
            </div>

            {/* Add partner manually */}
            {hasWriteAccess && unshownDistPartners.length > 0 && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-600 mb-1">إضافة شخص للتوزيع</label>
                  <SearchableSelect
                    value={distAddPartnerId}
                    onChange={setDistAddPartnerId}
                    options={[{ value: '', label: 'اختر...' }, ...unshownDistPartners.map(p => ({ value: p.id, label: p.name }))]}
                    placeholder="اختر شريكاً"
                  />
                </div>
                <button
                  onClick={handleAddDistPartner}
                  disabled={!distAddPartnerId}
                  className="px-3 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] disabled:opacity-40 text-sm"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Per-partner input rows */}
            {finalDistPartners.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">لا يوجد شركاء لهذه الرسالة — أضف شريكاً أعلاه أو تأكد من تسجيل التحاويل</p>
            ) : (
              <div className="space-y-4">
                {finalDistPartners.map(partner => {
                  const d = getDistEntryDraft(partner.id);
                  const capReturn = capitalReturnByPartner[partner.id] ?? 0;
                  const profitNum = d.profit.trim() === '' ? null : Number(d.profit);
                  const expensesNum = expensesByPartner[partner.id] ?? 0;
                  const calc = computeExpenseDeduction(capReturn, profitNum, expensesNum);
                  return (
                    <div key={partner.id} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
                      <p className="font-semibold text-slate-800 text-sm">{partner.name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">إرجاع رأس المال (SAR)</label>
                          <input type="number" readOnly value={capReturn}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-500 cursor-not-allowed text-sm outline-none" />
                          <p className="text-xs text-slate-400 mt-0.5">من سجل التحاويل</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">الربح (SAR)</label>
                          <input type="number" min="0" step="0.01" value={d.profit}
                            onChange={e => handleDistDraftChange(partner.id, e.target.value)}
                            placeholder="اتركه فارغاً إن لم يُحدَّد"
                            disabled={!hasWriteAccess}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] text-sm outline-none disabled:bg-slate-100 disabled:cursor-not-allowed" />
                          <p className="text-xs text-slate-400 mt-0.5">فارغ = لم يُحدَّد بعد</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">المصاريف (SAR)</label>
                          <input type="number" readOnly value={expensesByPartner[partner.id] ?? 0}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-500 cursor-not-allowed text-sm outline-none" />
                          <p className="text-xs text-slate-400 mt-0.5">من سجل المصروفات</p>
                        </div>
                      </div>
                      <div className={`rounded-lg p-3 text-xs space-y-1.5 border ${calc.fromCapital > 0 ? 'bg-amber-50 border-amber-200' : 'bg-[#f0fdfa] border-[#99f6e4]'}`}>
                        {expensesNum > 0 && profitNum == null && (
                          <p className="font-medium text-slate-500">⚠️ الربح غير محدد — المصاريف لن تُخصم من رأس المال</p>
                        )}
                        {expensesNum > 0 && profitNum != null && (
                          <>
                            <p className="text-slate-600">مصاريف مخصومة من الربح: <span className="font-bold text-red-600">{fmtSAR(calc.fromProfit)}</span></p>
                            {calc.fromCapital > 0 && (
                              <p className="text-slate-600">مصاريف مخصومة من رأس المال (فائض): <span className="font-bold text-amber-700">{fmtSAR(calc.fromCapital)}</span></p>
                            )}
                          </>
                        )}
                        <div className="pt-1 border-t border-slate-200 grid grid-cols-2 gap-2">
                          <div><span className="text-slate-500">إرجاع رأس المال الصافي: </span><span className="font-bold text-[#134e4a]">{fmtSAR(calc.netCapitalReturn)}</span></div>
                          <div><span className="text-slate-500">الربح الصافي: </span>
                            {calc.netProfit == null ? <span className="italic text-slate-400">غير محدد</span> : <span className="font-bold text-[#134e4a]">{fmtSAR(calc.netProfit)}</span>}
                          </div>
                        </div>
                        <div className="pt-1 border-t border-slate-200">
                          <span className="text-slate-500">الإجمالي الصافي: </span>
                          {calc.netProfit == null
                            ? <span className="italic text-slate-400">غير محدد (رأس المال: {fmtSAR(calc.netCapitalReturn)})</span>
                            : <span className="font-bold text-slate-800">{fmtSAR(calc.netCapitalReturn + calc.netProfit)}</span>
                          }
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {hasWriteAccess && (
              <div className="pt-2 flex justify-end">
                <button onClick={handleSaveDistribution}
                  className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors text-sm font-medium">
                  حفظ التوزيع
                </button>
              </div>
            )}
            {savedDist && (
              <p className="text-xs text-slate-400 text-left rtl:text-right">
                آخر حفظ: {format(new Date(savedDist.savedAt), 'dd/MM/yyyy HH:mm')}
              </p>
            )}
          </div>

          {/* ── Drawings ── */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-[#134e4a] flex items-center gap-2"><CreditCard className="w-4 h-4" />منصرفات الشركاء</h3>
              <div className="flex items-center gap-2">
                {hasWriteAccess && selectedDrawIds.size > 0 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                    <span className="text-xs font-medium text-red-700">{selectedDrawIds.size} محدد</span>
                    <button onClick={() => setShowBulkDeleteDrawConfirm(true)} className="flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700 transition-colors">
                      <Trash2 className="w-3 h-3" />{t('deleteSelected')}
                    </button>
                  </div>
                )}
                {hasWriteAccess && <button onClick={() => { resetDrawForm(); setShowDrawModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] text-xs font-semibold shadow-sm">
                  <Plus className="w-3.5 h-3.5" />إضافة منصرف</button>
                }
              </div>
            </div>
            {drawingTransfers.length > 0 ? (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="md:hidden divide-y divide-slate-100">
                  {sortedDrawingTransfers.map((dt, idx) => (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={dt.id} className={`p-3 space-y-1 ${selectedDrawIds.has(dt.id) ? 'bg-red-50' : ''}`}>
                      {hasWriteAccess && <span onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedDrawIds.has(dt.id)} onChange={() => toggleSelectDraw(dt.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></span>}
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{state.partners.find(p => p.id === dt.partnerId)?.name}</p>
                          <p className="text-xs text-slate-400">{format(new Date(dt.date), 'dd/MM/yyyy HH:mm')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold">{fmtSDG(dt.amountSDG)}</p>
                          <p className="font-mono text-xs text-slate-500">{fmtSAR(dt.amountSAR)}</p>
                        </div>
                      </div>
                      {dt.description && <p className="text-xs text-slate-400">{dt.description}</p>}
                      {hasWriteAccess && (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => openEditDraw(dt)} className="p-1 text-slate-400 hover:text-[#14b8a6] rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setShowDeleteDrawingId(dt.id)} className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-white bg-[#134e4a]">
                      <tr>
                        {hasWriteAccess && <th className="px-3 py-2 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={allDrawingsSelected} onChange={toggleSelectAllDrawings} className="w-4 h-4 rounded border-slate-500 text-[#14b8a6] focus:ring-[#14b8a6]" /></th>}
                        <th className="px-3 py-2 text-right cursor-pointer hover:bg-[#0c3531]" onClick={() => sortDrawings('date')}>التاريخ <SortIcon direction={drawSortConfig?.direction!} active={drawSortConfig?.key === 'date'}/></th>
                        <th className="px-3 py-2 text-right">الشريك</th>
                        <th className="px-3 py-2 text-left cursor-pointer hover:bg-[#0c3531]" onClick={() => sortDrawings('amountSDG')}>المبلغ (SDG) <SortIcon direction={drawSortConfig?.direction!} active={drawSortConfig?.key === 'amountSDG'}/></th>
                        <th className="px-3 py-2 text-left cursor-pointer hover:bg-[#0c3531]" onClick={() => sortDrawings('amountSAR')}>المبلغ (SAR) <SortIcon direction={drawSortConfig?.direction!} active={drawSortConfig?.key === 'amountSAR'}/></th>
                        <th className="px-3 py-2 text-right">الوصف</th>
                        <th className="px-3 py-2 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedDrawingTransfers.map((dt, idx) => (
                        <motion.tr key={dt.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} className={`${selectedDrawIds.has(dt.id) ? 'bg-red-50' : idx % 2 === 1 ? 'bg-slate-50' : ''}`}>
                          {hasWriteAccess && <td className="px-3 py-2 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedDrawIds.has(dt.id)} onChange={() => toggleSelectDraw(dt.id)} className="w-4 h-4 rounded border-slate-300 text-[#14b8a6] focus:ring-[#14b8a6]" /></td>}
                          <td className="px-3 py-2">{format(new Date(dt.date), 'dd/MM/yyyy HH:mm')}</td>
                          <td className="px-3 py-2 font-semibold">{state.partners.find(p => p.id === dt.partnerId)?.name}</td>
                          <td className="px-3 py-2 text-left font-mono">{fmtSDG(dt.amountSDG)}</td>
                          <td className="px-3 py-2 text-left font-mono">{fmtSAR(dt.amountSAR)}</td>
                          <td className="px-3 py-2 text-slate-500">{dt.description || '-'}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex justify-center gap-1">
                              {hasWriteAccess && <button onClick={() => openEditDraw(dt)} className="p-1 text-slate-400 hover:text-[#14b8a6] rounded"><Edit2 className="w-3.5 h-3.5" /></button>}
                              {hasWriteAccess && <button onClick={() => setShowDeleteDrawingId(dt.id)} className="p-1 text-slate-400 hover:text-red-600 rounded"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <tr>
                        {hasWriteAccess && <td className="px-3 py-2"></td>}
                        <td className="px-3 py-2" colSpan={2}>الإجمالي</td>
                        <td className="px-3 py-2 text-left font-mono">{fmtSDG(drawingTransfers.reduce((s, t) => s + t.amountSDG, 0))}</td>
                        <td className="px-3 py-2 text-left font-mono">{fmtSAR(drawingTransfers.reduce((s, t) => s + t.amountSAR, 0))}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">لا توجد منصرفات مسجلة</p>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ TAB 3: التحقق من الرسالة ═══════════ */}
      {activeTab === 'verification' && verification && (
        <div className="space-y-6 max-w-3xl mx-auto">
          {/* Formula */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-[#134e4a] mb-4">معادلة التحقق</h3>
            <div className="space-y-2 text-sm font-mono">
              <div className="flex justify-between py-1"><span className="text-slate-600">إجمالي المبيعات (فواتير) (SDG)</span><span className="text-emerald-600 font-semibold">+ {fmtSDG(verification.totalSalesSDG)}</span></div>
              {verification.totalInjectionsSDG > 0 && (
                <div className="flex justify-between py-1"><span className="text-slate-600">+ تغذية رصيد (أموال خارجية) (SDG)</span><span className="text-emerald-600 font-semibold">+ {fmtSDG(verification.totalInjectionsSDG)}</span></div>
              )}
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي المصروفات (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalExpensesSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي الرواتب (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalSalariesSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي التحاويل العامة (عدا التغذية) (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalTransfersSDG)}</span></div>
              <div className="flex justify-between py-1 text-xs text-slate-400">(الكل يخصم من البنوك)</div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− الكاش المتوفر في الحسابات (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.cashBalanceSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي المديونية غير المحصلة (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.uncollectedDebtSDG)}</span></div>
              <div className="border-t-2 border-[#134e4a] pt-3 mt-2 flex justify-between font-bold text-base">
                <span>= الفرق</span><span className={Math.abs(verification.diff) < 1 ? 'text-emerald-700' : 'text-red-700'}>{fmtSDG(verification.diff)}</span>
              </div>
            </div>
          </div>

          {/* Result card */}
          {Math.abs(verification.diff) < 1 ? (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-8 text-center">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-emerald-700 mb-1">الرسالة صحيحة</h2>
              <p className="text-emerald-600">كل الأموال محاسبة ✅</p>
            </div>
          ) : (
            <div className="bg-red-50 border-2 border-red-300 rounded-2xl p-8 text-center">
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-red-700 mb-1">يوجد فرق {fmtSDG(verification.diff)}</h2>
              <p className="text-red-600">يرجى مراجعة البيانات ❌</p>
            </div>
          )}

          {/* Breakdown cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: <BarChart3 className="w-5 h-5 text-emerald-600" />, label: 'إجمالي المبيعات', value: fmtSDG(verification.totalSalesSDG), sub: 'من الفواتير', color: 'bg-emerald-50 border-emerald-200' },
              { icon: <CreditCard className="w-5 h-5 text-red-600" />, label: 'إجمالي المصروفات', value: fmtSDG(verification.totalExpensesSDG), sub: 'من المصروفات', color: 'bg-red-50 border-red-200' },
              { icon: <Users className="w-5 h-5 text-amber-600" />, label: 'إجمالي الرواتب', value: fmtSDG(verification.totalSalariesSDG), sub: 'من الرواتب', color: 'bg-amber-50 border-amber-200' },
              { icon: <TrendingUp className="w-5 h-5 text-[#134e4a]" />, label: 'إجمالي التحاويل العامة (عدا التغذية)', value: fmtSDG(verification.totalTransfersSDG), sub: 'الكل يخصم من البنوك', color: 'bg-[#f0fdfa] border-[#99f6e4]' },
              ...(verification.totalInjectionsSDG > 0 ? [{ icon: <TrendingUp className="w-5 h-5 text-emerald-600" />, label: 'تغذية رصيد', value: fmtSDG(verification.totalInjectionsSDG), sub: 'أموال خارجية تدخل البنوك', color: 'bg-emerald-50 border-emerald-200' }] : []),
              { icon: <Building2 className="w-5 h-5 text-[#134e4a]" />, label: 'الكاش في الحسابات', value: fmtSDG(verification.cashBalanceSDG), sub: 'أرصدة البنوك (رسالة نشطة)', color: 'bg-[#f0fdfa] border-[#99f6e4]' },
              { icon: <AlertTriangle className="w-5 h-5 text-orange-600" />, label: 'المديونية غير المحصلة', value: fmtSDG(verification.uncollectedDebtSDG), sub: 'فواتير آجلة − مدفوعات', color: 'bg-orange-50 border-orange-200' },
            ].map((card, i) => (
              <div key={i} className={`p-4 rounded-xl border ${card.color}`}>
                <div className="flex items-center gap-2 mb-2">{card.icon}<span className="text-sm font-semibold text-slate-700">{card.label}</span></div>
                <p className="text-lg font-bold text-slate-800 font-mono">{card.value}</p>
                <p className="text-xs text-slate-500 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-500 space-y-1">
            <p>المديونية غير المحصلة = إجمالي الفواتير الآجلة − إجمالي المدفوعات المحصلة</p>
            <p>الكاش = مجموع أرصدة جميع الحسابات البنكية للرسالة النشطة</p>
          </div>
        </div>
      )}

      {/* ═══════════ Contribution Modal ═══════════ */}
      <Modal isOpen={showContribModal} onClose={() => { setShowContribModal(false); resetContribForm(); }} title="تسجيل مساهمة جديدة">
        <form onSubmit={handleSaveContribution} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">المساهم</label>
            <SearchableSelect
              required
              value={contribPartnerId}
              onChange={(val) => setContribPartnerId(val)}
              options={state.partners.map(p => ({ value: p.id, label: p.name }))}
              placeholder="اختر المساهم..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">المبلغ (SAR)</label>
            <input type="number" min="0" step="0.01" value={contribAmountSAR} onChange={e => setContribAmountSAR(e.target.value ? Number(e.target.value) : '')} required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
            <input type="date" value={contribDate} onChange={e => setContribDate(e.target.value)} required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
            <input type="text" value={contribNotes} onChange={e => setContribNotes(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" placeholder="اختياري" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowContribModal(false); resetContribForm(); }}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm">حفظ المساهمة</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!showDeleteContribId} onClose={() => setShowDeleteContribId(null)} title="تأكيد الحذف">
        <div className="space-y-4">
          <p className="text-slate-600">هل أنت متأكد من حذف المساهمة؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setShowDeleteContribId(null)} className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg font-semibold hover:bg-slate-50">إلغاء</button>
            <button onClick={handleDeleteContrib} className="px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700">تأكيد الحذف</button>
          </div>
        </div>
      </Modal>

      {/* Drawing Modal */}
      <Modal isOpen={showDrawModal} onClose={() => { setShowDrawModal(false); resetDrawForm(); }} title={editingDrawId ? 'تعديل منصرف' : 'تسجيل منصرف جديد'}>
        <form onSubmit={handleSaveDrawing} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الشريك</label>
            <SearchableSelect
              required
              value={drawPartnerId}
              onChange={(val) => setDrawPartnerId(val)}
              options={operatingPartners.map(p => ({ value: p.id, label: p.name }))}
              placeholder="اختر الشريك..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
            <input type="date" value={drawDate} onChange={e => setDrawDate(e.target.value)} required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">سعر الصرف (جنيه/ريال)</label>
            <input type="number" min="0" step="0.01" value={drawExchangeRate} onChange={e => setDrawExchangeRate(e.target.value ? Number(e.target.value) : '')} required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" placeholder="مثال: 940" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الحسابات والمبالغ (SDG)</label>
            {drawSplits.map((split, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <SearchableSelect
                  required
                  value={split.bankAccountId}
                  onChange={(val) => { const ns = [...drawSplits]; ns[idx] = { ...ns[idx], bankAccountId: val }; setDrawSplits(ns); }}
                  options={state.bankAccounts.map(b => ({ value: b.id, label: b.name }))}
                  placeholder="الحساب..."
                  className="flex-1"
                />
                <input type="number" min="0" step="1" value={split.amount || ''} onChange={e => { const ns = [...drawSplits]; ns[idx] = { ...ns[idx], amount: Number(e.target.value) || 0 }; setDrawSplits(ns); }} required
                  className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#14b8a6] outline-none" placeholder="المبلغ" />
                {drawSplits.length > 1 && (
                  <button type="button" onClick={() => setDrawSplits(drawSplits.filter((_, i) => i !== idx))}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setDrawSplits([...drawSplits, { bankAccountId: '', amount: 0 }])}
              className="text-xs text-[#134e4a] hover:underline flex items-center gap-1 mt-1"><Plus className="w-3 h-3" />إضافة حساب</button>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">الوصف</label>
            <input type="text" value={drawDescription} onChange={e => setDrawDescription(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none" placeholder="اختياري" />
          </div>
          {drawSplits.some(s => s.amount > 0) && (
            <div className="bg-slate-50 p-3 rounded-lg text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-600">الإجمالي (SDG)</span><span className="font-bold">{fmtSDG(drawSplits.reduce((s, sp) => s + (sp.amount || 0), 0))}</span></div>
              {Number(drawExchangeRate) > 0 && <div className="flex justify-between"><span className="text-slate-600">ما يعادل (SAR)</span><span className="font-bold">{fmtSAR(drawSplits.reduce((s, sp) => s + (sp.amount || 0), 0) / Number(drawExchangeRate))}</span></div>}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowDrawModal(false); resetDrawForm(); }}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm">{editingDrawId ? 'تحديث' : 'حفظ'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Drawing Confirm */}
      <Modal isOpen={!!showDeleteDrawingId} onClose={() => setShowDeleteDrawingId(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDeleteDrawingId(null)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleDeleteDrawing} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>

      {/* Bulk Delete Drawings Confirm */}
      <Modal isOpen={showBulkDeleteDrawConfirm} onClose={() => setShowBulkDeleteDrawConfirm(false)} title={t('confirmDelete')} size="sm">
        <div className="space-y-4">
          <p className="text-slate-600">هل أنت متأكد من حذف {selectedDrawIds.size} منصرف؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowBulkDeleteDrawConfirm(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">{t('no')}</button>
            <button onClick={handleBulkDeleteDrawings} className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors">{t('yes')}</button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
