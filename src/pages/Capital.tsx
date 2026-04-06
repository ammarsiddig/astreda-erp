import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { useTranslation } from '../hooks/useTranslation';
import { motion } from 'framer-motion';
import {
  Wallet, Plus, Printer, CheckCircle, XCircle,
  LayoutGrid, Table2, ChevronDown, ChevronUp, Save,
  AlertTriangle, Users, TrendingUp,
  BarChart3, Building2, CreditCard, Trash2, Edit2
} from 'lucide-react';
import { format } from 'date-fns';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { formatCurrency, generateId, computeBankBalance } from '../lib/utils';
import { v4 as uuidv4 } from 'uuid';
import type { CapitalContribution, GeneralTransfer, SettlementResult } from '../types';
import { canWrite } from '../lib/permissions';

type Tab = 'investors' | 'settlement' | 'verification';

const fmtSAR = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + ' SAR';
const fmtSDG = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' SDG';
const fmtPct = (v: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
const roundDownToNearest10 = (amount: number) => Math.floor(amount / 10) * 10;

function getLastExchangeRate(transfers: { exchangeRate: number; date: string }[]): number | null {
  const sorted = [...transfers].filter(t => t.exchangeRate > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted.length > 0 ? sorted[0].exchangeRate : null;
}

export default function Capital() {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const hasWriteAccess = canWrite(state.currentUser, state.roles, 'capital');
  const [activeTab, setActiveTab] = useState<Tab>('investors');
  const [selectedInvestorRowId, setSelectedInvestorRowId] = useState<string | null>(null);
  const [showContribModal, setShowContribModal] = useState(false);
  const [contribPartnerId, setContribPartnerId] = useState('');
  const [contribAmountSAR, setContribAmountSAR] = useState<number | ''>('');
  const [contribDate, setContribDate] = useState(new Date().toISOString().split('T')[0]);
  const [contribNotes, setContribNotes] = useState('');
  const [capitalView, setCapitalView] = useState<'cards' | 'table'>('cards');
  const [expandedPartnerIds, setExpandedPartnerIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedPartnerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const autoExchangeRate = getLastExchangeRate(state.generalTransfers);
  const [settlementExRateOverride, setSettlementExRateOverride] = useState<number | ''>('');
  const [investorsPctOverride, setInvestorsPctOverride] = useState<number | ''>('');
  const [mgmtFeePctOverride, setMgmtFeePctOverride] = useState<number | ''>('');

  const [showDrawModal, setShowDrawModal] = useState(false);
  const [editingDrawId, setEditingDrawId] = useState<string | null>(null);
  const [drawPartnerId, setDrawPartnerId] = useState('');
  const [drawDate, setDrawDate] = useState(new Date().toISOString().split('T')[0]);
  const [drawDescription, setDrawDescription] = useState('');
  const [drawExchangeRate, setDrawExchangeRate] = useState<number | ''>('');
  const [drawSplits, setDrawSplits] = useState<{ bankAccountId: string; amount: number }[]>([{ bankAccountId: '', amount: 0 }]);

  const activeShipment = state.shipments.find(s => s.id === activeShipmentId);
  const operatingPartners = useMemo(() => state.partners.filter(p => p.isOperatingPartner), [state.partners]);
  const contributions = useMemo(() =>
    (state.capitalContributions || []).filter(c => c.shipmentId === activeShipmentId),
    [state.capitalContributions, activeShipmentId]);
  const capitalReturns = useMemo(() =>
    state.generalTransfers.filter(t => t.shipmentId === activeShipmentId && t.transferType === 'capital_return'),
    [state.generalTransfers, activeShipmentId]);
  const profitPayments = useMemo(() =>
    state.generalTransfers.filter(t => t.shipmentId === activeShipmentId && t.transferType === 'profit_payment'),
    [state.generalTransfers, activeShipmentId]);
  const drawingTransfers = useMemo(() =>
    state.generalTransfers.filter(t => t.transferType === 'drawings' && t.shipmentId === activeShipmentId),
    [state.generalTransfers, activeShipmentId]);
  const savedSettlement = activeShipmentId ? (state.settlementResults || {})[activeShipmentId] : undefined;

  // === TAB 1: Investor data per partner (live profit calculation) ===
  const liveExchangeRate = autoExchangeRate ?? 0;
  const liveProfitCalc = useMemo(() => {
    if (!activeShipmentId || liveExchangeRate === 0) return null;
    const shipmentLedger = state.ledger.filter(e => e.shipmentId === activeShipmentId);
    const cashBalanceSDG = state.bankAccounts.reduce((s, b) => s + computeBankBalance(b.id, shipmentLedger), 0);
    const drawingsSDG = drawingTransfers.reduce((s, t) => s + t.amountSDG, 0);
    const totalCreditInvoices = state.invoices.filter(i => i.shipmentId === activeShipmentId && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const totalPaymentsCollected = state.payments.filter(p => p.shipmentId === activeShipmentId).reduce((s, p) => s + p.amount, 0);
    const receivablesSDG = Math.max(0, totalCreditInvoices - totalPaymentsCollected);
    const grossProfitSDG = cashBalanceSDG + drawingsSDG + receivablesSDG;
    const grossProfitSAR = grossProfitSDG / liveExchangeRate;
    const investorsPct = activeShipment?.shareholdersPercent ?? 40;
    const investorShareSAR = grossProfitSAR * investorsPct / 100;
    const totalCapitalSAR = contributions.reduce((s, c) => s + c.amountSAR, 0);
    return { investorShareSAR, totalCapitalSAR };
  }, [activeShipmentId, liveExchangeRate, state.ledger, state.bankAccounts, state.invoices, state.payments, drawingTransfers, contributions, activeShipment]);

  const investorData = useMemo(() => {
    if (!activeShipmentId) return [];
    const partnersWithContribs = new Set(contributions.map(c => c.partnerId));
    return state.partners.filter(p => partnersWithContribs.has(p.id)).map(partner => {
      const capital = contributions.filter(c => c.partnerId === partner.id).reduce((s, c) => s + c.amountSAR, 0);
      const returned = capitalReturns.filter(t => t.beneficiaryPartnerId === partner.id).reduce((s, t) => s + t.amountSAR, 0);
      const remainingCapital = Math.max(0, capital - returned);
      const profitEntitled = liveProfitCalc && liveProfitCalc.totalCapitalSAR > 0
        ? liveProfitCalc.investorShareSAR * (capital / liveProfitCalc.totalCapitalSAR)
        : 0;
      const profitEntitledRounded = roundDownToNearest10(profitEntitled);
      const profitPaid = profitPayments.filter(t => t.beneficiaryPartnerId === partner.id).reduce((s, t) => s + t.amountSAR, 0);
      const profitRemaining = Math.max(0, profitEntitled - profitPaid);
      const totalDue = remainingCapital + profitRemaining;
      let status: 'complete' | 'profit_pending' | 'not_returned' = 'not_returned';
      if (remainingCapital === 0 && profitRemaining === 0) status = 'complete';
      else if (remainingCapital === 0 && profitRemaining > 0) status = 'profit_pending';
      const transactions = [
        ...contributions.filter(c => c.partnerId === partner.id).map(c => ({ date: c.date, type: 'مساهمة' as const, sar: c.amountSAR, sdg: 0, desc: c.notes || 'مساهمة رأس مال' })),
        ...capitalReturns.filter(t => t.beneficiaryPartnerId === partner.id).map(t => ({ date: t.date, type: 'إرجاع' as const, sar: -t.amountSAR, sdg: t.amountSDG, desc: t.description || '-' })),
        ...profitPayments.filter(t => t.beneficiaryPartnerId === partner.id).map(t => ({ date: t.date, type: 'أرباح' as const, sar: -t.amountSAR, sdg: t.amountSDG, desc: t.description || '-' })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return { partner, capital, returned, remainingCapital, profitEntitled, profitEntitledRounded, profitPaid, profitRemaining, totalDue, status, transactions };
    });
  }, [activeShipmentId, contributions, capitalReturns, profitPayments, liveProfitCalc, state.partners]);

  const totalContributed = investorData.reduce((s, d) => s + d.capital, 0);
  const totalReturned = investorData.reduce((s, d) => s + d.returned, 0);
  const totalRemaining = totalContributed - totalReturned;

  // === TAB 2: Settlement calculations ===
  const settlementCalc = useMemo(() => {
    if (!activeShipmentId) return null;
    const exchangeRate = settlementExRateOverride !== '' ? Number(settlementExRateOverride) : (autoExchangeRate ?? 0);
    const noExRate = exchangeRate === 0;
    const investorsPct = investorsPctOverride !== '' ? Number(investorsPctOverride) : (activeShipment?.shareholdersPercent ?? 40);
    const partnersPct = 100 - investorsPct;
    const mgmtFeePct = mgmtFeePctOverride !== '' ? Number(mgmtFeePctOverride) : (activeShipment?.managementFeePercent ?? 20);
    const mgmtFeeRecipientId = activeShipment?.managementFeeRecipientId || '1';
    const shipmentLedger = state.ledger.filter(e => e.shipmentId === activeShipmentId);
    const cashBalanceSDG = state.bankAccounts.reduce((s, b) => s + computeBankBalance(b.id, shipmentLedger), 0);
    const drawingsSDG = drawingTransfers.reduce((s, t) => s + t.amountSDG, 0);
    const totalCreditInvoices = state.invoices.filter(i => i.shipmentId === activeShipmentId && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const totalPaymentsCollected = state.payments.filter(p => p.shipmentId === activeShipmentId).reduce((s, p) => s + p.amount, 0);
    const receivablesSDG = Math.max(0, totalCreditInvoices - totalPaymentsCollected);
    const grossProfitSDG = cashBalanceSDG + drawingsSDG + receivablesSDG;
    const grossProfitSAR = exchangeRate > 0 ? grossProfitSDG / exchangeRate : 0;
    const investorsShareSAR = grossProfitSAR * investorsPct / 100;
    const totalCapitalSAR = contributions.reduce((s, c) => s + c.amountSAR, 0);
    const investorShares = state.partners.filter(p => contributions.some(c => c.partnerId === p.id)).map(partner => {
      const cap = contributions.filter(c => c.partnerId === partner.id).reduce((s, c) => s + c.amountSAR, 0);
      const pct = totalCapitalSAR > 0 ? (cap / totalCapitalSAR) * 100 : 0;
      const rawProfit = investorsShareSAR * pct / 100;
      const profit = roundDownToNearest10(rawProfit);
      return { partner, capital: cap, pct, profit };
    });
    const totalRoundedInvestorProfits = investorShares.reduce((s, r) => s + r.profit, 0);
    const investorRoundingRemainder = investorsShareSAR - totalRoundedInvestorProfits;
    const partnersShareSAR = grossProfitSAR * partnersPct / 100;
    const managementFeeSAR = partnersShareSAR * mgmtFeePct / 100;
    const remainingForPartners = (partnersShareSAR - managementFeeSAR) + investorRoundingRemainder;
    const perPartnerSAR = operatingPartners.length > 0 ? remainingForPartners / operatingPartners.length : 0;
    const partnerSummaries = operatingPartners.map(partner => {
      const investorEntry = investorShares.find(r => r.partner.id === partner.id);
      const investorProfit = investorEntry?.profit || 0;
      const capitalAmount = investorEntry?.capital || 0;
      const drawings = drawingTransfers.filter(t => t.partnerId === partner.id).reduce((s, t) => s + t.amountSAR, 0);
      const fee = partner.id === mgmtFeeRecipientId ? managementFeeSAR : 0;
      const total = perPartnerSAR + fee + investorProfit + capitalAmount - drawings;
      return { partner, partnerShare: perPartnerSAR, fee, investorProfit, capital: capitalAmount, drawings, total };
    });
    const regularInvestors = investorShares.filter(r => !r.partner.isOperatingPartner);
    return {
      exchangeRate, noExRate, investorsPct, partnersPct, mgmtFeePct, mgmtFeeRecipientId,
      cashBalanceSDG, drawingsSDG, receivablesSDG, grossProfitSDG, grossProfitSAR,
      investorsShareSAR, totalRoundedInvestorProfits, investorRoundingRemainder, totalCapitalSAR, investorShares,
      partnersShareSAR, managementFeeSAR, remainingForPartners, perPartnerSAR,
      partnerSummaries, regularInvestors,
    };
  }, [activeShipmentId, state, contributions, drawingTransfers, operatingPartners,
      settlementExRateOverride, autoExchangeRate, investorsPctOverride, mgmtFeePctOverride, activeShipment]);

  // === TAB 3: Verification ===
  const verification = useMemo(() => {
    if (!activeShipmentId) return null;
    const totalSalesSDG = state.invoices.filter(i => i.shipmentId === activeShipmentId).reduce((s, i) => s + i.total, 0);
    const totalExpensesSDG = state.expenses.filter(e => e.shipmentId === activeShipmentId).reduce((s, e) => s + e.amount, 0);
    const totalSalariesSDG = state.salaries.filter(s2 => s2.shipmentId === activeShipmentId).reduce((s, sal) => s + sal.amount, 0);
    const totalTransfersSDG = state.generalTransfers.filter(t =>
      t.shipmentId === activeShipmentId
    ).reduce((s, t) => s + t.amountSDG, 0);
    const shipmentLedger = state.ledger.filter(e => e.shipmentId === activeShipmentId);
    const cashBalanceSDG = state.bankAccounts.reduce((s, b) => s + computeBankBalance(b.id, shipmentLedger), 0);
    const totalCreditInvoices = state.invoices.filter(i => i.shipmentId === activeShipmentId && i.paymentType === 'credit').reduce((s, i) => s + i.total, 0);
    const totalPaymentsCollected = state.payments.filter(p => p.shipmentId === activeShipmentId).reduce((s, p) => s + p.amount, 0);
    const uncollectedDebtSDG = totalCreditInvoices - totalPaymentsCollected;
    const diff = totalSalesSDG - totalExpensesSDG - totalSalariesSDG - totalTransfersSDG - cashBalanceSDG - uncollectedDebtSDG;
    return { totalSalesSDG, totalExpensesSDG, totalSalariesSDG, totalTransfersSDG, cashBalanceSDG, uncollectedDebtSDG, diff };
  }, [activeShipmentId, state]);

  // === HANDLERS ===
  const resetContribForm = () => { setContribPartnerId(''); setContribAmountSAR(''); setContribDate(new Date().toISOString().split('T')[0]); setContribNotes(''); };
  const handleSaveContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;
    if (!contribPartnerId || !contribAmountSAR || !activeShipmentId) return;
    const newContrib: CapitalContribution = {
      id: generateId('CC', (state.capitalContributions || []).length),
      partnerId: contribPartnerId, shipmentId: activeShipmentId,
      amountSAR: Number(contribAmountSAR), date: contribDate, notes: contribNotes || undefined,
    };
    updateState({ capitalContributions: [...(state.capitalContributions || []), newContrib] });
    setShowContribModal(false); resetContribForm();
  };

  const handleSaveSettlement = () => {
    if (!hasWriteAccess) return;
    if (!activeShipmentId || !settlementCalc) return;
    const result: SettlementResult = {
      shipmentId: activeShipmentId, savedAt: new Date().toISOString(),
      exchangeRate: settlementCalc.exchangeRate,
      investorsProfitPercent: settlementCalc.investorsPct,
      managementFeePercent: settlementCalc.mgmtFeePct,
      partnerProfits: settlementCalc.partnerSummaries.map(ps => ({ partnerId: ps.partner.id, profit: ps.partnerShare + ps.fee })),
      investorProfits: settlementCalc.investorShares.map(is => ({ partnerId: is.partner.id, profit: is.profit })),
    };
    updateState({ settlementResults: { ...(state.settlementResults || {}), [activeShipmentId]: result } });
  };

  const resetDrawForm = () => {
    setDrawPartnerId(''); setDrawDate(new Date().toISOString().split('T')[0]);
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
    const drawId = isEditing ? editingDrawId! : generateId('TR', state.generalTransfers.length);
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
    const newLedgerEntries = validSplits.map(split => ({
      id: uuidv4(), date: drawDate, fromAccount: split.bankAccountId,
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

  const handleDeleteDrawing = (drawId: string) => {
    if (!hasWriteAccess) return;
    if (!window.confirm(t('deleteConfirmMessage'))) return;
    const transfer = state.generalTransfers.find(t => t.id === drawId);
    if (!transfer) return;
    let newBankAccounts = [...state.bankAccounts];
    transfer.splits.forEach(split => {
      newBankAccounts = newBankAccounts.map(b =>
        b.id === split.bankAccountId ? { ...b, balance: b.balance + split.amount } : b
      );
    });
    updateState({
      generalTransfers: state.generalTransfers.filter(t => t.id !== transfer.id),
      ledger: state.ledger.filter(l => l.linkedId !== transfer.id),
      bankAccounts: newBankAccounts,
    });
  };

  const printInvestorTable = () => {
    const shipmentName = activeShipment?.name || '';
    const rows = investorData.map((d, i) => `<tr class="${i % 2 === 1 ? 'alt' : ''}">
      <td>${d.partner.name}</td><td class="num">${fmtSAR(d.capital)}</td><td class="num">${fmtSAR(d.returned)}</td>
      <td class="num ${d.remainingCapital > 0 ? 'red' : 'green'}">${fmtSAR(d.remainingCapital)}</td>
      <td class="num">${liveProfitCalc ? fmtSAR(d.profitEntitled) : '⚠️ لا يوجد سعر صرف'}</td>
      <td class="num">${fmtSAR(d.profitPaid)}</td><td class="num">${fmtSAR(d.profitRemaining)}</td>
      <td class="num bold">${fmtSAR(d.totalDue)}</td>
      <td>${d.status === 'complete' ? '🟢 مكتمل' : d.status === 'profit_pending' ? '🟡 أرباح معلقة' : '🔴 لم يُرجَع'}</td>
    </tr>`).join('');
    const totals = `<tr class="totals"><td>الإجمالي</td><td class="num">${fmtSAR(totalContributed)}</td><td class="num">${fmtSAR(totalReturned)}</td>
      <td class="num">${fmtSAR(totalRemaining)}</td><td class="num">${fmtSAR(investorData.reduce((s,d)=>s+d.profitEntitled,0))}</td>
      <td class="num">${fmtSAR(investorData.reduce((s,d)=>s+d.profitPaid,0))}</td><td class="num">${fmtSAR(investorData.reduce((s,d)=>s+d.profitRemaining,0))}</td>
      <td class="num bold">${fmtSAR(investorData.reduce((s,d)=>s+d.totalDue,0))}</td><td></td></tr>`;
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>متابعة رأس المال</title>
      <style>body{font:10px/1.4 sans-serif;direction:rtl;margin:20px}h1{font-size:14px;text-align:center;margin-bottom:4px}
      .sub{text-align:center;font-size:11px;color:#555;margin-bottom:12px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}th{background:#134e4a;color:#fff;font-size:9px}
      .alt{background:#f8f9fa}.num{text-align:left;font-family:monospace}.bold{font-weight:bold}
      .red{color:#dc2626}.green{color:#16a34a}.totals{background:#e2e8f0;font-weight:bold}</style></head>
      <body><h1>أستريدا للتوزيع — متابعة رأس المال</h1><div class="sub">${shipmentName} | ${format(new Date(),'dd/MM/yyyy')}</div>
      <table><thead><tr><th>المساهم</th><th>رأس المال (SAR)</th><th>المُرجَع (SAR)</th><th>متبقي رأس مال</th>
      <th>أرباح مستحقة</th><th>أرباح مدفوعة</th><th>أرباح متبقية</th><th>الإجمالي المستحق</th><th>الحالة</th></tr></thead>
      <tbody>${rows}${totals}</tbody></table></body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  const printSettlement = () => {
    if (!settlementCalc) return;
    const sc = settlementCalc;
    const shipmentName = activeShipment?.name || '';
    const investorRows = sc.investorShares.map((r, i) => `<tr class="${i%2===1?'alt':''}"><td>${r.partner.name}</td><td class="n">${fmtSAR(r.capital)}</td><td class="n">${fmtPct(r.pct)}</td><td class="n">${fmtSAR(r.profit)}</td></tr>`).join('');
    const partnerBlocks = sc.partnerSummaries.map(ps => {
      const lines = [
        ps.fee > 0 ? `<div class="line"><span>نسبة الإدارة</span><span class="g">+ ${fmtSAR(ps.fee)}</span></div>` : '',
        `<div class="line"><span>نصيبه من أرباح الشركاء</span><span class="g">+ ${fmtSAR(ps.partnerShare)}</span></div>`,
        ps.investorProfit > 0 ? `<div class="line"><span>نصيبه كمساهم</span><span class="g">+ ${fmtSAR(ps.investorProfit)}</span></div>` : '',
        ps.capital > 0 ? `<div class="line"><span>رأس ماله</span><span class="g">+ ${fmtSAR(ps.capital)}</span></div>` : '',
        ps.drawings > 0 ? `<div class="line"><span>منصرفاته</span><span class="r">- ${fmtSAR(ps.drawings)}</span></div>` : '',
        `<div class="total-line"><span>= الإجمالي المستحق</span><span>${fmtSAR(ps.total)}</span></div>`,
      ].filter(Boolean).join('');
      return `<div class="partner-block"><h3>${ps.partner.name}</h3>${lines}</div>`;
    }).join('');
    const regRows = sc.regularInvestors.map((r, i) => `<tr class="${i%2===1?'alt':''}"><td>${r.partner.name}</td><td class="n">${fmtSAR(r.capital)}</td><td class="n">${fmtSAR(r.profit)}</td><td class="n bold">${fmtSAR(r.capital + r.profit)}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تصفية الرسالة</title>
      <style>body{font:10px/1.5 sans-serif;direction:rtl;margin:20px;color:#1e293b}h1{font-size:14px;text-align:center}
      .sub{text-align:center;font-size:10px;color:#555;margin-bottom:16px}h2{font-size:12px;background:#134e4a;color:#fff;padding:4px 8px;margin:12px 0 6px}
      h3{font-size:11px;border-bottom:2px solid #134e4a;padding-bottom:2px;margin:8px 0 4px}
      table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #ccc;padding:3px 6px;text-align:right}
      th{background:#134e4a;color:#fff;font-size:9px}.alt{background:#f8f9fa}.n{text-align:left;font-family:monospace}.bold{font-weight:bold}
      .line{display:flex;justify-content:space-between;padding:2px 0;border-bottom:1px dotted #e2e8f0;font-size:10px}
      .total-line{display:flex;justify-content:space-between;padding:4px 0;border-top:2px double #134e4a;font-weight:bold;font-size:11px;margin-top:4px}
      .g{color:#16a34a}.r{color:#dc2626}.partner-block{background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:8px;margin-bottom:8px}
      .summary-box{background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:6px 10px;margin-bottom:6px}
      .note{font-size:9px;color:#92400e;margin-top:6px}
      .totals{background:#e2e8f0;font-weight:bold}</style></head>
      <body><h1>أستريدا للتوزيع — تصفية الرسالة</h1>
      <div class="sub">${shipmentName} | سعر الصرف: ${sc.exchangeRate} | ${format(new Date(),'dd/MM/yyyy')}</div>
      <h2>أ — الربح الخام</h2>
      <div class="summary-box"><div class="line"><span>الكاش المتوفر (SDG)</span><span>${fmtSDG(sc.cashBalanceSDG)}</span></div>
      <div class="line"><span>+ منصرفات الشركاء (SDG)</span><span>${fmtSDG(sc.drawingsSDG)}</span></div>
      <div class="line"><span>+ المديونية (أموال غير محصلة) (SDG)</span><span>${fmtSDG(sc.receivablesSDG)}</span></div>
      <div class="total-line"><span>= الربح الخام (SDG)</span><span>${fmtSDG(sc.grossProfitSDG)}</span></div>
      <div class="total-line"><span>= الربح الخام (SAR)</span><span>${fmtSAR(sc.grossProfitSAR)}</span></div></div>
      <h2>ب — توزيع أرباح المساهمين (${fmtPct(sc.investorsPct)})</h2>
      <div class="summary-box"><div class="line"><span>حصة المساهمين بعد التقريب</span><span>${fmtSAR(sc.totalRoundedInvestorProfits)}</span></div></div>
      <table><thead><tr><th>المساهم</th><th>رأس المال</th><th>النسبة%</th><th>الربح (SAR)</th></tr></thead><tbody>${investorRows}
      <tr class="totals"><td>الإجمالي</td><td class="n">${fmtSAR(sc.totalCapitalSAR)}</td><td class="n">100%</td><td class="n">${fmtSAR(sc.totalRoundedInvestorProfits)}</td></tr></tbody></table>
      <div class="note">* الأرباح مقربة لأقرب 10 ريال — الفرق (${fmtSAR(sc.investorRoundingRemainder)}) أضيف لحصة الشركاء</div>
      <h2>ج — توزيع أرباح الشركاء (${fmtPct(sc.partnersPct)})</h2>
      <div class="summary-box"><div class="line"><span>حصة الشركاء</span><span>${fmtSAR(sc.partnersShareSAR)}</span></div>
      <div class="line"><span>نسبة الإدارة (${fmtPct(sc.mgmtFeePct)})</span><span>- ${fmtSAR(sc.managementFeeSAR)}</span></div>
      <div class="line"><span>المتبقي للتوزيع</span><span>${fmtSAR(sc.remainingForPartners)}</span></div>
      <div class="line"><span>نصيب كل شريك</span><span>${fmtSAR(sc.perPartnerSAR)}</span></div></div>
      ${partnerBlocks}
      <h2>د — ملخص المساهمين العاديين</h2>
      <table><thead><tr><th>المساهم</th><th>رأس المال (SAR)</th><th>الأرباح (SAR)</th><th>الإجمالي المستحق (SAR)</th></tr></thead>
      <tbody>${regRows}<tr class="totals"><td>الإجمالي</td><td class="n">${fmtSAR(sc.regularInvestors.reduce((s,r)=>s+r.capital,0))}</td>
      <td class="n">${fmtSAR(sc.regularInvestors.reduce((s,r)=>s+r.profit,0))}</td>
      <td class="n bold">${fmtSAR(sc.regularInvestors.reduce((s,r)=>s+r.capital+r.profit,0))}</td></tr></tbody></table>
      </body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // === RENDER ===
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'investors', label: 'المساهمون', icon: <Users className="w-4 h-4" /> },
    { key: 'settlement', label: 'تصفية الرسالة', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'verification', label: 'التحقق من الرسالة', icon: <CheckCircle className="w-4 h-4" /> },
  ];

  const statusBadge = (status: string) => {
    if (status === 'complete') return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">🟢 مكتمل</span>;
    if (status === 'profit_pending') return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-700">🟡 أرباح معلقة</span>;
    return <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-700">🔴 لم يُرجَع</span>;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" dir="rtl">
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
              <p className="text-xs text-slate-500 mb-1">إجمالي ما تم إرجاعه</p>
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
              {investorData.map(d => {
                const initials = d.partner.name.split(' ').map(w => w[0]).slice(0, 2).join('');
                const isExpanded = expandedPartnerIds.has(d.partner.id);
                return (
                  <div key={d.partner.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#134e4a] text-white flex items-center justify-center font-bold text-sm">{initials}</div>
                        <span className="font-bold text-slate-800">{d.partner.name}</span>
                      </div>
                      {statusBadge(d.status)}
                    </div>
                    {/* Card body */}
                    <div className="px-4 py-3 space-y-3 text-sm">
                      <div className="space-y-1.5 border-b border-slate-100 pb-3">
                        <div className="flex justify-between"><span className="text-slate-500">رأس المال</span><span className="font-semibold">{fmtSAR(d.capital)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">المُرجَع</span><span className="font-semibold">{fmtSAR(d.returned)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">متبقي رأس المال</span>
                          <span className={`font-bold ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(d.remainingCapital)}</span></div>
                      </div>
                      <div className="space-y-1.5 border-b border-slate-100 pb-3">
                        <div className="flex justify-between"><span className="text-slate-500">الأرباح المستحقة</span>
                          <span className="font-semibold">{liveProfitCalc ? fmtSAR(d.profitEntitledRounded) : <span className="text-amber-500 text-xs">⚠️ أدخل سعر الصرف في تصفية الشركاء</span>}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">الأرباح المدفوعة</span><span className="font-semibold">{fmtSAR(d.profitPaid)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">الأرباح المتبقية</span><span className="font-semibold">{fmtSAR(d.profitRemaining)}</span></div>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="font-bold text-slate-700">الإجمالي المستحق</span>
                        <span className="font-bold text-lg text-[#134e4a]">{fmtSAR(d.totalDue)}</span>
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
                            </tr></thead>
                            <tbody>{d.transactions.map((tx, i) => (
                              <tr key={i} className="border-b border-slate-50">
                                <td className="py-1">{format(new Date(tx.date), 'dd/MM')}</td>
                                <td className={`py-1 font-medium ${tx.type === 'مساهمة' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {tx.type} {tx.type === 'مساهمة' ? '↓' : '↑'}</td>
                                <td className={`py-1 text-left font-mono ${tx.sar >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {tx.sar >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', {minimumFractionDigits:0,maximumFractionDigits:0}).format(tx.sar)}</td>
                                <td className="py-1 text-left font-mono text-slate-500">{tx.sdg > 0 ? new Intl.NumberFormat('en-US').format(tx.sdg) : '0'}</td>
                                <td className="py-1 text-slate-500 truncate max-w-[80px]">{tx.desc}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Table View ── */
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {investorData.length > 0 ? investorData.map(d => (
                  <div key={d.partner.id} onClick={() => setSelectedInvestorRowId(d.partner.id)} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedInvestorRowId === d.partner.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{d.partner.name}</p>
                        <p className="text-xs text-slate-500">رأس المال: <span className="font-mono">{fmtSAR(d.capital)}</span></p>
                      </div>
                      {statusBadge(d.status)}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <span className="text-slate-500">المُرجَع</span><span className="font-mono text-right">{fmtSAR(d.returned)}</span>
                      <span className="text-slate-500">متبقي رأس مال</span><span className={`font-mono font-bold text-right ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(d.remainingCapital)}</span>
                      <span className="text-slate-500">أرباح مستحقة</span><span className="font-mono text-right">{liveProfitCalc ? fmtSAR(d.profitEntitled) : <span className="text-amber-500">⚠️</span>}</span>
                      <span className="text-slate-500">أرباح مدفوعة</span><span className="font-mono text-right">{fmtSAR(d.profitPaid)}</span>
                      <span className="text-slate-500">الإجمالي المستحق</span><span className="font-mono font-bold text-right">{fmtSAR(d.totalDue)}</span>
                    </div>
                  </div>
                )) : (
                  <p className="px-4 py-8 text-center text-slate-400 text-sm">لا توجد بيانات</p>
                )}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-right text-slate-600">
                  <thead className="text-xs text-white bg-[#134e4a]">
                    <tr>
                      <th className="px-4 py-3">المساهم</th><th className="px-4 py-3 text-left">رأس المال (SAR)</th>
                      <th className="px-4 py-3 text-left">المُرجَع (SAR)</th><th className="px-4 py-3 text-left">متبقي رأس مال</th>
                      <th className="px-4 py-3 text-left">أرباح مستحقة</th><th className="px-4 py-3 text-left">أرباح مدفوعة</th>
                      <th className="px-4 py-3 text-left">أرباح متبقية</th><th className="px-4 py-3 text-left">الإجمالي المستحق</th>
                      <th className="px-4 py-3 text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {investorData.map(d => (
                      <tr key={d.partner.id} onClick={() => setSelectedInvestorRowId(d.partner.id)} className={`transition-colors cursor-pointer ${selectedInvestorRowId === d.partner.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{d.partner.name}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.capital)}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.returned)}</td>
                        <td className={`px-4 py-3 text-left font-mono font-bold ${d.remainingCapital > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtSAR(d.remainingCapital)}</td>
                        <td className="px-4 py-3 text-left font-mono">{liveProfitCalc ? fmtSAR(d.profitEntitled) : <span className="text-amber-500 text-xs">⚠️ أدخل سعر الصرف</span>}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.profitPaid)}</td>
                        <td className="px-4 py-3 text-left font-mono">{fmtSAR(d.profitRemaining)}</td>
                        <td className="px-4 py-3 text-left font-mono font-bold">{fmtSAR(d.totalDue)}</td>
                        <td className="px-4 py-3 text-center">{statusBadge(d.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                    <tr>
                      <td className="px-4 py-3">الإجمالي</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalContributed)}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalReturned)}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(totalRemaining)}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(investorData.reduce((s,d)=>s+d.profitEntitled,0))}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(investorData.reduce((s,d)=>s+d.profitPaid,0))}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(investorData.reduce((s,d)=>s+d.profitRemaining,0))}</td>
                      <td className="px-4 py-3 text-left font-mono">{fmtSAR(investorData.reduce((s,d)=>s+d.totalDue,0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB 2: تصفية الشركاء ═══════════ */}
      {activeTab === 'settlement' && settlementCalc && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Exchange rate */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-4">
              <label className="text-sm font-semibold text-slate-700">سعر الصرف:</label>
              <input type="number" min="0" step="0.01"
                value={settlementExRateOverride !== '' ? settlementExRateOverride : (autoExchangeRate ?? '')}
                onChange={e => setSettlementExRateOverride(e.target.value ? Number(e.target.value) : '')}
                className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#14b8a6] outline-none" />
              <span className="text-xs text-slate-400">جنيه/ريال</span>
              {autoExchangeRate && <span className="text-xs text-slate-400">(مأخوذ تلقائياً من آخر تحويل عام)</span>}
            </div>
            {settlementCalc.noExRate && (
              <div className="mt-2 flex items-center gap-2 text-amber-600 text-sm"><AlertTriangle className="w-4 h-4" />لم يتم تسجيل سعر صرف</div>
            )}
          </div>

          {/* Drawings Table */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-[#134e4a] flex items-center gap-2"><CreditCard className="w-4 h-4" />منصرفات الشركاء</h3>
              {hasWriteAccess && <button onClick={() => { resetDrawForm(); setShowDrawModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] text-xs font-semibold shadow-sm">
                <Plus className="w-3.5 h-3.5" />إضافة منصرف</button>
              }
            </div>
            {drawingTransfers.length > 0 ? (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {drawingTransfers.map(dt => (
                    <div key={dt.id} className="p-3 space-y-1">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{state.partners.find(p => p.id === dt.partnerId)?.name}</p>
                          <p className="text-xs text-slate-400">{format(new Date(dt.date), 'dd/MM/yyyy')}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-bold">{fmtSDG(dt.amountSDG)}</p>
                          <p className="font-mono text-xs text-[#134e4a]">{fmtSAR(dt.amountSAR)}</p>
                        </div>
                      </div>
                      {dt.description && <p className="text-xs text-slate-500">{dt.description}</p>}
                      {hasWriteAccess && (
                        <div className="flex gap-1 pt-1">
                          <button onClick={() => openEditDraw(dt)} className="p-1 text-slate-400 hover:text-[#14b8a6] rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteDrawing(dt.id)} className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-white bg-[#134e4a]">
                      <tr>
                        <th className="px-3 py-2 text-right">التاريخ</th>
                        <th className="px-3 py-2 text-right">الشريك</th>
                        <th className="px-3 py-2 text-left">المبلغ (SDG)</th>
                        <th className="px-3 py-2 text-left">المبلغ (SAR)</th>
                        <th className="px-3 py-2 text-right">الوصف</th>
                        <th className="px-3 py-2 text-center">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {drawingTransfers.map((dt, i) => (
                        <tr key={dt.id} className={i % 2 === 1 ? 'bg-slate-50' : ''}>
                          <td className="px-3 py-2">{format(new Date(dt.date), 'dd/MM/yyyy')}</td>
                          <td className="px-3 py-2 font-semibold">{state.partners.find(p => p.id === dt.partnerId)?.name}</td>
                          <td className="px-3 py-2 text-left font-mono">{fmtSDG(dt.amountSDG)}</td>
                          <td className="px-3 py-2 text-left font-mono">{fmtSAR(dt.amountSAR)}</td>
                          <td className="px-3 py-2 text-slate-500">{dt.description || '-'}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex justify-center gap-1">
                              {hasWriteAccess && <button onClick={() => openEditDraw(dt)} className="p-1 text-slate-400 hover:text-[#14b8a6] rounded transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>}
                              {hasWriteAccess && <button onClick={() => handleDeleteDrawing(dt.id)} className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <tr>
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

          {/* Section أ — Gross Profit */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-[#134e4a] mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" />أ — الربح الخام</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-1"><span className="text-slate-600">الكاش المتوفر (بنوك + خزينة) (SDG)</span><span className="font-semibold">{fmtSDG(settlementCalc.cashBalanceSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">+ منصرفات الشركاء (SDG)</span><span className="font-semibold">{fmtSDG(settlementCalc.drawingsSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">+ المديونية (أموال غير محصلة) (SDG)</span><span className="font-semibold">{fmtSDG(settlementCalc.receivablesSDG)}</span></div>
              <div className="border-t-2 border-[#134e4a] pt-2 flex justify-between font-bold"><span>= الربح الخام (SDG)</span><span>{fmtSDG(settlementCalc.grossProfitSDG)}</span></div>
              <div className="flex justify-between font-bold text-[#134e4a]"><span>= الربح الخام (SAR) = SDG ÷ سعر الصرف</span><span>{fmtSAR(settlementCalc.grossProfitSAR)}</span></div>
            </div>
          </div>

          {/* Section ب — Shareholders */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-[#134e4a] mb-4 flex items-center gap-2"><Users className="w-4 h-4" />ب — توزيع أرباح المساهمين</h3>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <label className="text-sm text-slate-600">نسبة المساهمين من الربح:</label>
              <div className="flex items-center gap-1">
                <input type="number" min="0" max="100" step="1"
                  value={investorsPctOverride !== '' ? investorsPctOverride : (activeShipment?.shareholdersPercent ?? 40)}
                  onChange={e => setInvestorsPctOverride(e.target.value ? Number(e.target.value) : '')}
                  className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-[#14b8a6] outline-none" />
                <span className="text-sm text-slate-500">%</span>
              </div>
              <span className="text-sm text-slate-500">حصة المساهمين بعد التقريب = {fmtSAR(settlementCalc.totalRoundedInvestorProfits)}</span>
            </div>
            <p className="text-sm text-slate-500 mb-2">إجمالي رأس المال الكلي: <span className="font-bold text-slate-800">{fmtSAR(settlementCalc.totalCapitalSAR)}</span></p>
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-slate-100">
                {settlementCalc.investorShares.map(r => (
                  <div key={r.partner.id} className="p-3 flex justify-between items-center text-sm">
                    <span className="font-semibold text-slate-900">{r.partner.name}</span>
                    <div className="text-right">
                      <p className="font-mono text-xs text-slate-500">{fmtSAR(r.capital)} — {fmtPct(r.pct)}</p>
                      <p className="font-mono font-bold text-[#134e4a]">{fmtSAR(r.profit)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-white bg-[#134e4a]">
                    <tr><th className="px-3 py-2 text-right">المساهم</th><th className="px-3 py-2 text-left">رأس المال</th><th className="px-3 py-2 text-left">النسبة%</th><th className="px-3 py-2 text-left">الربح (SAR)</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {settlementCalc.investorShares.map((r, i) => (
                      <tr key={r.partner.id} className={i % 2 === 1 ? 'bg-slate-50' : ''}>
                        <td className="px-3 py-2 font-semibold">{r.partner.name}</td>
                        <td className="px-3 py-2 text-left font-mono">{fmtSAR(r.capital)}</td>
                        <td className="px-3 py-2 text-left font-mono">{fmtPct(r.pct)}</td>
                        <td className="px-3 py-2 text-left font-mono font-bold text-[#134e4a]">{fmtSAR(r.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <tr><td className="px-3 py-2">الإجمالي</td><td className="px-3 py-2 text-left font-mono">{fmtSAR(settlementCalc.totalCapitalSAR)}</td><td className="px-3 py-2 text-left">100%</td><td className="px-3 py-2 text-left font-mono">{fmtSAR(settlementCalc.totalRoundedInvestorProfits)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <p className="mt-2 text-xs text-amber-700">* الأرباح مقربة لأقرب 10 ريال — الفرق ({fmtSAR(settlementCalc.investorRoundingRemainder)}) أضيف لحصة الشركاء</p>
          </div>

          {/* Section ج — Partners */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-[#134e4a] mb-4 flex items-center gap-2"><CreditCard className="w-4 h-4" />ج — توزيع أرباح الشركاء</h3>
            <div className="space-y-2 text-sm mb-4 bg-slate-50 p-3 rounded-lg">
              <div className="flex justify-between"><span className="text-slate-600">نسبة الشركاء = 100% − {fmtPct(settlementCalc.investorsPct)}</span><span className="font-bold">{fmtPct(settlementCalc.partnersPct)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">حصة الشركاء</span><span className="font-semibold">{fmtSAR(settlementCalc.partnersShareSAR)}</span></div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-slate-600">نسبة الإدارة:</span>
                <div className="flex items-center gap-1">
                  <input type="number" min="0" max="100" step="1"
                    value={mgmtFeePctOverride !== '' ? mgmtFeePctOverride : (activeShipment?.managementFeePercent ?? 20)}
                    onChange={e => setMgmtFeePctOverride(e.target.value ? Number(e.target.value) : '')}
                    className="w-20 px-2 py-1 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-[#14b8a6] outline-none" />
                  <span className="text-slate-500">%</span>
                </div>
                <span className="text-slate-400">= {fmtSAR(settlementCalc.managementFeeSAR)}</span>
              </div>
              <div className="flex justify-between"><span className="text-slate-600">المتبقي للتوزيع</span><span className="font-semibold">{fmtSAR(settlementCalc.remainingForPartners)}</span></div>
              <div className="flex justify-between"><span className="text-slate-600">نصيب كل شريك</span><span className="font-semibold">{fmtSAR(settlementCalc.perPartnerSAR)}</span></div>
            </div>
            {/* Per-partner breakdown */}
            <div className="space-y-4">
              {settlementCalc.partnerSummaries.map(ps => (
                <div key={ps.partner.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <h4 className="font-bold text-slate-800 mb-3 text-base">{ps.partner.name}</h4>
                  <div className="space-y-1.5 text-sm">
                    {ps.fee > 0 && <div className="flex justify-between"><span className="text-slate-600">نسبة الإدارة</span><span className="text-emerald-600 font-semibold">+ {fmtSAR(ps.fee)}</span></div>}
                    <div className="flex justify-between"><span className="text-slate-600">نصيبه من أرباح الشركاء</span><span className="text-emerald-600 font-semibold">+ {fmtSAR(ps.partnerShare)}</span></div>
                    {ps.investorProfit > 0 && <div className="flex justify-between"><span className="text-slate-600">نصيبه كمساهم</span><span className="text-emerald-600 font-semibold">+ {fmtSAR(ps.investorProfit)}</span></div>}
                    {ps.capital > 0 && <div className="flex justify-between"><span className="text-slate-600">رأس ماله</span><span className="text-emerald-600 font-semibold">+ {fmtSAR(ps.capital)}</span></div>}
                    {ps.drawings > 0 && <div className="flex justify-between"><span className="text-slate-600">− منصرفاته</span><span className="text-red-600 font-semibold">- {fmtSAR(ps.drawings)}</span></div>}
                    <div className="border-t-2 border-[#134e4a] pt-2 mt-2 flex justify-between font-bold text-base">
                      <span>= الإجمالي المستحق</span>
                      <span className={ps.total >= 0 ? 'text-emerald-700' : 'text-red-700'}>{fmtSAR(ps.total)} ✅</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section د — Regular investors summary */}
          {settlementCalc.regularInvestors.length > 0 && (
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-[#134e4a] mb-4 flex items-center gap-2"><Building2 className="w-4 h-4" />د — ملخص المساهمين العاديين</h3>
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-slate-100">
                  {settlementCalc.regularInvestors.map(r => (
                    <div key={r.partner.id} className="p-3 flex justify-between items-center text-sm">
                      <span className="font-semibold text-slate-900">{r.partner.name}</span>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">رأس مال: <span className="font-mono">{fmtSAR(r.capital)}</span></p>
                        <p className="text-xs text-slate-500">أرباح: <span className="font-mono text-[#134e4a]">{fmtSAR(r.profit)}</span></p>
                        <p className="font-mono font-bold">{fmtSAR(r.capital + r.profit)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-white bg-[#134e4a]">
                      <tr><th className="px-3 py-2 text-right">المساهم</th><th className="px-3 py-2 text-left">رأس المال (SAR)</th><th className="px-3 py-2 text-left">الأرباح (SAR)</th><th className="px-3 py-2 text-left">الإجمالي المستحق (SAR)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {settlementCalc.regularInvestors.map((r, i) => (
                        <tr key={r.partner.id} className={i % 2 === 1 ? 'bg-slate-50' : ''}>
                          <td className="px-3 py-2 font-semibold">{r.partner.name}</td>
                          <td className="px-3 py-2 text-left font-mono">{fmtSAR(r.capital)}</td>
                          <td className="px-3 py-2 text-left font-mono text-[#134e4a]">{fmtSAR(r.profit)}</td>
                          <td className="px-3 py-2 text-left font-mono font-bold">{fmtSAR(r.capital + r.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <tr>
                      <td className="px-3 py-2">الإجمالي</td>
                      <td className="px-3 py-2 text-left font-mono">{fmtSAR(settlementCalc.regularInvestors.reduce((s,r)=>s+r.capital,0))}</td>
                      <td className="px-3 py-2 text-left font-mono">{fmtSAR(settlementCalc.regularInvestors.reduce((s,r)=>s+r.profit,0))}</td>
                      <td className="px-3 py-2 text-left font-mono">{fmtSAR(settlementCalc.regularInvestors.reduce((s,r)=>s+r.capital+r.profit,0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              </div>
            </div>
          )}

          {/* Save + Print */}
          <div className="flex flex-wrap gap-3 justify-end">
            <button onClick={printSettlement} className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-semibold text-sm">
              <Printer className="w-4 h-4" />طباعة التصفية</button>
            {hasWriteAccess && <button onClick={handleSaveSettlement} className="flex items-center gap-2 px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm shadow-sm">
              <Save className="w-4 h-4" />حفظ التصفية ✓</button>
            }
          </div>
          {savedSettlement && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">تم حفظ التصفية بتاريخ {format(new Date(savedSettlement.savedAt), 'dd/MM/yyyy HH:mm')}</span>
              </div>
              {hasWriteAccess && <button onClick={handleSaveSettlement} className="text-sm text-[#134e4a] hover:text-[#0c3531] font-semibold">إعادة الحساب</button>}
            </div>
          )}
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
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي المصروفات (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalExpensesSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي الرواتب (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalSalariesSDG)}</span></div>
              <div className="flex justify-between py-1"><span className="text-slate-600">− إجمالي التحاويل العامة (الكل) (SDG)</span><span className="text-red-600 font-semibold">- {fmtSDG(verification.totalTransfersSDG)}</span></div>
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
              { icon: <TrendingUp className="w-5 h-5 text-[#134e4a]" />, label: 'إجمالي التحاويل العامة (الكل)', value: fmtSDG(verification.totalTransfersSDG), sub: 'الكل يخصم من البنوك', color: 'bg-[#f0fdfa] border-[#99f6e4]' },
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
    </motion.div>
  );
}
