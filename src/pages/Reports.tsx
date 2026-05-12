import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency, formatDateOnlyValue, formatDateTimeValue, getCurrentDateInputValue, getCurrentDateTimeValue } from '../lib/utils';
import SearchableSelect from '../components/SearchableSelect';
import { Printer, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { isSalesperson, isWarehouse } from '../lib/permissions';

const COLORS = ['#1B4F8A', '#F59E0B', '#16A34A', '#DC2626', '#8B5CF6', '#EC4899', '#0D9488', '#F97316', '#3B82F6', '#84CC16', '#EF4444', '#A855F7'];

import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Reports() {
  const { t } = useTranslation();
  const { state, activeShipmentId } = useAppStore();
  const navigate = useNavigate();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const isWhRole = isWarehouse(currentUser, state.roles);
  const defaultTab = isSpRole ? 'debt' : isWhRole ? 'inventory' : 'salesperson';
  const [activeTab, setActiveTab] = useState<'debt' | 'salesperson' | 'dailyDebt' | 'inventory' | 'transfers' | 'expenses'>(defaultTab);

  // Debt Report Filters
  const [debtCityFilter, setDebtCityFilter] = useState('');
  const [debtShipmentFilter, setDebtShipmentFilter] = useState('');
  const [debtSalespersonFilter, setDebtSalespersonFilter] = useState('');

  // Daily Debt Report Filters
  const [dailyDebtCity, setDailyDebtCity] = useState('');
  const [dailyDebtShipment, setDailyDebtShipment] = useState(activeShipmentId || '');
  const [dailyDebtDate, setDailyDebtDate] = useState(getCurrentDateInputValue());

  // Salesperson Report Filter
  const [salespersonCityFilter, setSalespersonCityFilter] = useState('');

  // Inventory Report View
  const [inventoryView, setInventoryView] = useState<'byCar' | 'total'>('byCar');

  // Transfers Report Filters
  const [transfersFromDate, setTransfersFromDate] = useState('');
  const [transfersToDate, setTransfersToDate] = useState('');
  const [transfersShipment, setTransfersShipment] = useState(activeShipmentId || '');

  // Expenses Report Filters
  const [expensesFromDate, setExpensesFromDate] = useState('');
  const [expensesToDate, setExpensesToDate] = useState('');
  const [expensesShipment, setExpensesShipment] = useState(activeShipmentId || '');
  const [expensesCarFilter, setExpensesCarFilter] = useState('');

  // 1. Debt Report Data
  const debtData = useMemo(() => {
    let filteredCustomers = state.customers;
    if (isSpRole && currentUser?.salespersonId) {
      filteredCustomers = filteredCustomers.filter(c => c.salespersonId === currentUser.salespersonId);
    }
    if (debtCityFilter) filteredCustomers = filteredCustomers.filter(c => c.cityId === debtCityFilter);
    if (debtSalespersonFilter) filteredCustomers = filteredCustomers.filter(c => c.salespersonId === debtSalespersonFilter);

    return filteredCustomers.map(customer => {
      let invoices = state.invoices.filter(i => i.customerId === customer.id && i.paymentType === 'credit');
      let payments = state.payments.filter(p => p.customerId === customer.id);
      if (debtShipmentFilter) {
        invoices = invoices.filter(i => i.shipmentId === debtShipmentFilter);
        payments = payments.filter(p => p.shipmentId === debtShipmentFilter);
      }
      const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      return {
        id: customer.id,
        name: customer.name,
        city: state.cities.find(c => c.id === customer.cityId)?.name || '',
        salesperson: state.salespeople.find(s => s.id === customer.salespersonId)?.name || '',
        debt: totalInvoiced - totalPaid,
      };
    }).filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt);
  }, [state.customers, state.invoices, state.payments, state.cities, state.salespeople, debtCityFilter, debtShipmentFilter, debtSalespersonFilter]);

  const { items: sortedDebtData, requestSort: sortDebt, sortConfig: debtSortConfig } = useSortableData(debtData, { key: 'debt', direction: 'desc' });

  // 2. P&L Data
  // 3. Salesperson Performance Data
  const salespersonData = useMemo(() => {
    const advancesCategoryId = state.expenseCategories.find(c => c.name === 'سلفيات')?.id || '3';
    return state.salespeople.map(sp => {
      const spInvoices = state.invoices.filter(i => i.salespersonId === sp.id && i.shipmentId === activeShipmentId && Math.round(i.total) > 0);
      const sales = spInvoices.reduce((sum, inv) => sum + inv.total, 0);
      const invoiceCount = spInvoices.length;

      const spCustomerIds = new Set(state.customers.filter(c => c.salespersonId === sp.id).map(c => c.id));
      const collections = state.payments
        .filter(p => p.shipmentId === activeShipmentId && spCustomerIds.has(p.customerId))
        .reduce((sum, p) => sum + p.amount, 0);

      const totalCreditSales = spInvoices.filter(inv => inv.paymentType === 'credit').reduce((sum, inv) => sum + inv.total, 0);
      const debt = totalCreditSales - collections;
      const collectionRate = sales > 0 ? Math.round((collections / sales) * 100) : 0;
      const cities = [...new Set(spInvoices.map(i => state.cities.find(c => c.id === i.cityId)?.name).filter(Boolean))] as string[];

      // Commission calculation (FIFO allocation of payments to credit invoices)
      let amount2pct = 0;
      let amount1pct = 0;
      spCustomerIds.forEach(customerId => {
        const customerInvoices = state.invoices
          .filter(i => i.customerId === customerId && i.shipmentId === activeShipmentId && i.paymentType === 'credit')
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const customerPayments = state.payments
          .filter(p => p.customerId === customerId && p.shipmentId === activeShipmentId)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const invoiceRemaining = customerInvoices.map(inv => ({ invDate: inv.date, remaining: inv.total }));
        let invIdx = 0;
        for (const payment of customerPayments) {
          let paymentLeft = payment.amount;
          while (paymentLeft > 0 && invIdx < invoiceRemaining.length) {
            const inv = invoiceRemaining[invIdx];
            const allocated = Math.min(paymentLeft, inv.remaining);
            const ageDays = Math.floor(
              (new Date(payment.date).getTime() - new Date(inv.invDate).getTime()) / 86400000
            );
            if (ageDays < 30) { amount2pct += allocated; } else { amount1pct += allocated; }
            inv.remaining -= allocated;
            paymentLeft -= allocated;
            if (inv.remaining <= 0) invIdx++;
          }
        }
      });
      const totalEligible = amount2pct + amount1pct;
      const commission2 = amount2pct * 0.02;
      const commission1 = amount1pct * 0.01;
      const grossCommission = commission2 + commission1;
      const advances = state.expenses
        .filter(e => e.categoryId === advancesCategoryId && e.description === sp.name && e.shipmentId === activeShipmentId)
        .reduce((sum, e) => sum + e.amount, 0);
      const netCommission = grossCommission - advances;

      return {
        id: sp.id, name: sp.name, sales, collections, debt, invoiceCount, collectionRate, cities,
        totalEligible, amount2pct, amount1pct, commission2, commission1, grossCommission, advances, netCommission,
      };
    })
      .filter(sp => sp.sales > 0)
      .filter(sp => !salespersonCityFilter || sp.cities.includes(state.cities.find(c => c.id === salespersonCityFilter)?.name || ''))
      .sort((a, b) => b.sales - a.sales);
  }, [state.salespeople, state.invoices, state.payments, state.customers, state.cities, state.expenses, state.expenseCategories, activeShipmentId, salespersonCityFilter]);

  const { items: sortedSalespersonData, requestSort: sortSalesperson, sortConfig: salespersonSortConfig } = useSortableData(salespersonData, { key: 'sales', direction: 'desc' });

  // 4. Daily Debt Report Data
  const dailyDebtData = useMemo(() => {
    if (!dailyDebtCity) return [];
    const filteredCustomers = state.customers.filter(c => c.cityId === dailyDebtCity);
    return filteredCustomers.map(customer => {
      const invoices = state.invoices.filter(i => i.customerId === customer.id && i.shipmentId === dailyDebtShipment);
      const payments = state.payments.filter(p => p.customerId === customer.id && p.shipmentId === dailyDebtShipment);
      const totalSales = invoices.reduce((sum, inv) => sum + inv.total, 0);
      const totalCreditSales = invoices.filter(inv => inv.paymentType === 'credit').reduce((sum, inv) => sum + inv.total, 0);
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      return { id: customer.id, name: customer.name, totalSales, totalPaid, debt: totalCreditSales - totalPaid };
    }).filter(c => c.debt > 0).sort((a, b) => b.debt - a.debt);
  }, [state.customers, state.invoices, state.payments, dailyDebtCity, dailyDebtShipment]);

  const { items: sortedDailyDebtData, requestSort: sortDailyDebt, sortConfig: dailyDebtSortConfig } = useSortableData(dailyDebtData, { key: 'debt', direction: 'desc' });

  // 5. Inventory Data
  const inventoryData = useMemo(() => {
    const txns = state.inventoryTransactions.filter(t => t.shipmentId === activeShipmentId);
    const locations: { id: string; name: string }[] = [
      { id: 'warehouse', name: 'المخزن' },
      ...state.cars.map(c => ({ id: c.id, name: c.name })),
    ];

    const locationData = locations.map(loc => {
      const productStats = state.products.map(p => {
        const incoming = txns.filter(t => t.productId === p.id && t.toLocation === loc.id).reduce((s, t) => s + t.qty, 0);
        const outgoing = txns.filter(t => t.productId === p.id && t.fromLocation === loc.id).reduce((s, t) => s + t.qty, 0);
        return { productId: p.id, productName: p.name, incoming, outgoing, remaining: incoming - outgoing };
      }).filter(p => p.incoming > 0 || p.remaining !== 0);
      return { ...loc, productStats, totalRemaining: productStats.reduce((s, p) => s + p.remaining, 0) };
    }).filter(loc => loc.productStats.length > 0);

    const productTotals = state.products.map(p => {
      const totalReceived = txns.filter(t => t.productId === p.id && t.type === 'receive').reduce((s, t) => s + t.qty, 0);
      const totalSold = txns.filter(t => t.productId === p.id && t.type === 'sell').reduce((s, t) => s + t.qty, 0);
      const warehouseIn = txns.filter(t => t.productId === p.id && t.toLocation === 'warehouse').reduce((s, t) => s + t.qty, 0);
      const warehouseOut = txns.filter(t => t.productId === p.id && t.fromLocation === 'warehouse').reduce((s, t) => s + t.qty, 0);
      const warehouseRemaining = warehouseIn - warehouseOut;
      const carsRemaining = state.cars.reduce((sum, car) => {
        const carIn = txns.filter(t => t.productId === p.id && t.toLocation === car.id).reduce((s, t) => s + t.qty, 0);
        const carOut = txns.filter(t => t.productId === p.id && t.fromLocation === car.id).reduce((s, t) => s + t.qty, 0);
        return sum + carIn - carOut;
      }, 0);
      return { productId: p.id, productName: p.name, totalReceived, totalSold, warehouseRemaining, carsRemaining, totalRemaining: warehouseRemaining + carsRemaining };
    }).filter(p => p.totalReceived > 0 || p.totalRemaining !== 0).sort((a, b) => a.totalRemaining - b.totalRemaining);

    return { locationData, productTotals };
  }, [state.inventoryTransactions, state.products, state.cars, activeShipmentId]);

  // 6. Transfers by Recipient Data
  const transfersData = useMemo(() => {
    let filtered = state.generalTransfers;
    if (transfersShipment) filtered = filtered.filter(t => t.shipmentId === transfersShipment);
    if (transfersFromDate) filtered = filtered.filter(t => t.date >= transfersFromDate);
    if (transfersToDate) filtered = filtered.filter(t => t.date <= transfersToDate);

    const totalSDGAll = filtered.reduce((s, t) => s + t.amountSDG, 0);

    const partnerMap: Record<string, { name: string; count: number; totalSDG: number; totalSAR: number; transfers: typeof filtered }> = {};
    filtered.forEach(t => {
      const name = state.partners.find(p => p.id === t.partnerId)?.name || 'غير محدد';
      if (!partnerMap[t.partnerId]) partnerMap[t.partnerId] = { name, count: 0, totalSDG: 0, totalSAR: 0, transfers: [] };
      partnerMap[t.partnerId].count++;
      partnerMap[t.partnerId].totalSDG += t.amountSDG;
      partnerMap[t.partnerId].totalSAR += t.amountSAR;
      partnerMap[t.partnerId].transfers.push(t);
    });

    const byPartner = Object.entries(partnerMap).map(([id, data]) => ({
      id, ...data,
      percentage: totalSDGAll > 0 ? Math.round((data.totalSDG / totalSDGAll) * 100) : 0,
    })).sort((a, b) => b.totalSDG - a.totalSDG);

    const donutData = byPartner.map(p => ({ name: p.name, value: p.totalSDG }));
    const totalSAR = filtered.reduce((s, t) => s + t.amountSAR, 0);

    return { byPartner, donutData, totalSDG: totalSDGAll, totalSAR };
  }, [state.generalTransfers, state.partners, transfersShipment, transfersFromDate, transfersToDate]);

  // 7. Expenses by Category Data
  const expensesChartData = useMemo(() => {
    let filtered = state.expenses;
    if (expensesShipment) filtered = filtered.filter(e => e.shipmentId === expensesShipment);
    if (expensesFromDate) filtered = filtered.filter(e => e.date >= expensesFromDate);
    if (expensesToDate) filtered = filtered.filter(e => e.date <= expensesToDate);
    if (expensesCarFilter) filtered = filtered.filter(e => e.carId === expensesCarFilter);

    const totalAll = filtered.reduce((s, e) => s + e.amount, 0);
    const catMap: Record<string, { name: string; count: number; total: number; expenses: typeof filtered }> = {};
    filtered.forEach(e => {
      const name = state.expenseCategories.find(c => c.id === e.categoryId)?.name || 'غير محدد';
      if (!catMap[e.categoryId]) catMap[e.categoryId] = { name, count: 0, total: 0, expenses: [] };
      catMap[e.categoryId].count++;
      catMap[e.categoryId].total += e.amount;
      catMap[e.categoryId].expenses.push(e);
    });

    const byCategory = Object.entries(catMap).map(([id, data]) => ({
      id, ...data,
      percentage: totalAll > 0 ? Math.round((data.total / totalAll) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const barData = byCategory.map(c => ({ name: c.name, value: c.total }));
    return { byCategory, barData, total: totalAll };
  }, [state.expenses, state.expenseCategories, expensesShipment, expensesFromDate, expensesToDate, expensesCarFilter]);

  // ─── Print Functions ───────────────────────────────────────────────

  const printSalespersonReport = () => {
    const shipmentName = state.shipments.find(s => s.id === activeShipmentId)?.name || '';
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
    const totals = salespersonData.reduce(
      (acc, sp) => ({
        sales: acc.sales + sp.sales,
        collections: acc.collections + sp.collections,
        debt: acc.debt + sp.debt,
        invoiceCount: acc.invoiceCount + sp.invoiceCount,
        totalEligible: acc.totalEligible + sp.totalEligible,
        grossCommission: acc.grossCommission + sp.grossCommission,
        advances: acc.advances + sp.advances,
        netCommission: acc.netCommission + sp.netCommission,
      }),
      { sales: 0, collections: 0, debt: 0, invoiceCount: 0, totalEligible: 0, grossCommission: 0, advances: 0, netCommission: 0 }
    );
    const rowsHtml = salespersonData.map((sp, i) => `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="name">${sp.name}</td>
        <td class="center">${sp.cities.join('، ')}</td>
        <td class="center">${sp.invoiceCount}</td>
        <td class="num">${fmt(sp.sales)}</td>
        <td class="num teal">${fmt(sp.collections)}</td>
        <td class="num debt">${fmt(sp.debt)}</td>
        <td class="center">${sp.collectionRate}%</td>
        <td class="num">${fmt(sp.totalEligible)}</td>
        <td class="num blue">${fmt(sp.amount2pct)}</td>
        <td class="num blue">${fmt(sp.amount1pct)}</td>
        <td class="num blue">${fmt(sp.grossCommission)}</td>
        <td class="num amber">${fmt(sp.advances)}</td>
        <td class="num ${sp.netCommission >= 0 ? 'green' : 'debt'}">${fmt(sp.netCommission)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المناديب</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .title { font-size: 15px; font-weight: 900; color: #134e4a; text-align: center; margin-bottom: 3px; }
  .subtitle { font-size: 11px; color: #1e293b; text-align: center; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead tr { background-color: #134e4a !important; color: #fff; }
  th { padding: 5px 5px; font-weight: 700; text-align: center; border: 1px solid #134e4a; color: #fff; background-color: #134e4a !important; }
  td { padding: 4px 5px; border: 1px solid #cbd5e1; background-color: #fff; }
  tr.alt td { background-color: #f8fafc !important; }
  td.name { text-align: right; font-weight: 600; }
  td.center { text-align: center; }
  td.num { text-align: center; font-weight: 600; }
  td.teal { color: #0d9488 !important; }
  td.debt { color: #e11d48 !important; font-weight: 700; }
  td.blue { color: #2563eb !important; }
  td.amber { color: #d97706 !important; }
  td.green { color: #059669 !important; }
  thead .sep { border-right: 3px solid #fff !important; }
  tfoot tr td { background-color: #e2e8f0 !important; border: 1px solid #134e4a; font-size: 9px; font-weight: 900; color: #134e4a; text-align: center; }
  tfoot td.name { text-align: right; } tfoot td.debt { color: #e11d48 !important; }
  tfoot td.blue { color: #2563eb !important; } tfoot td.green { color: #059669 !important; }
</style></head><body>
  <div class="title">تقرير أداء مناديب المبيعات</div>
  <div class="subtitle">الرسالة: ${shipmentName}</div>
  <table>
    <thead><tr>
      <th style="text-align:right;width:12%">المندوب</th>
      <th style="width:12%">المدن</th>
      <th style="width:5%">الفواتير</th>
      <th style="width:8%">إجمالي المبيعات</th>
      <th style="width:8%">التحصيلات</th>
      <th style="width:8%">المديونية</th>
      <th style="width:5%">نسبة التحصيل</th>
      <th style="width:8%" class="sep">إجمالي التحصيل المؤهل</th>
      <th style="width:7%">مبلغ العمولة 2%</th>
      <th style="width:7%">مبلغ العمولة 1%</th>
      <th style="width:7%">إجمالي العمولة</th>
      <th style="width:7%">السلفيات</th>
      <th style="width:7%">صافي العمولة</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr>
      <td class="name">الإجمالي</td><td></td><td>${totals.invoiceCount}</td>
      <td>${fmt(totals.sales)}</td>
      <td class="teal">${fmt(totals.collections)}</td>
      <td class="debt">${fmt(totals.debt)}</td>
      <td></td>
      <td>${fmt(totals.totalEligible)}</td>
      <td></td><td></td>
      <td class="blue">${fmt(totals.grossCommission)}</td>
      <td class="amber">${fmt(totals.advances)}</td>
      <td class="${totals.netCommission >= 0 ? 'green' : 'debt'}">${fmt(totals.netCommission)}</td>
    </tr></tfoot>
  </table>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const printReport = () => {
    if (!dailyDebtCity) return;
    const cityName = state.cities.find(c => c.id === dailyDebtCity)?.name || '';
    const shipmentName = state.shipments.find(s => s.id === dailyDebtShipment)?.name || '';
    const generatedAt = getCurrentDateTimeValue();
    const generatedAtLabel = formatDateTimeValue(generatedAt, true);
    const reportDateLabel = formatDateOnlyValue(dailyDebtDate);
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n);
    const totalSales = dailyDebtData.reduce((sum, r) => sum + r.totalSales, 0);
    const totalPaid  = dailyDebtData.reduce((sum, r) => sum + r.totalPaid,  0);
    const totalDebt  = dailyDebtData.reduce((sum, r) => sum + r.debt, 0);
    const rowsHtml = dailyDebtData.map((row, i) => `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="name">${row.name}</td><td class="num">${fmt(row.totalSales)}</td>
        <td class="num">${fmt(row.totalPaid)}</td><td class="num debt">${fmt(row.debt)}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المديونية اليومي</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo','Arial',sans-serif; direction: rtl; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .title { font-size: 16px; font-weight: 900; color: #134e4a; text-align: center; margin-bottom: 3px; }
  .subtitle { font-size: 12px; color: #1e293b; text-align: center; margin-bottom: 7px; }
  table { width: 70%; margin: 0 auto; border-collapse: collapse; font-size: 10px; }
  thead tr { background-color: #134e4a !important; color: #fff; }
  th { padding: 5px 8px; font-size: 11px; font-weight: 700; text-align: center; border: 1px solid #134e4a; color: #fff; background-color: #134e4a !important; }
  td { padding: 5px 8px; border: 1px solid #cbd5e1; font-size: 10px; background-color: #fff; }
  tr.alt td { background-color: #f8fafc !important; }
  td.name { text-align: right; font-weight: 600; } td.num { text-align: center; }
  td.debt { color: #e11d48 !important; font-weight: 700; }
  tfoot tr td { background-color: #e2e8f0 !important; border: 1px solid #134e4a; font-size: 11px; font-weight: 900; color: #134e4a; }
  tfoot td.name { font-weight: 900; } tfoot td.debt { color: #e11d48 !important; font-weight: 900; }
</style></head><body>
  <div class="title">تقرير المديونية اليومي</div>
  <div class="subtitle">وقت إنشاء التقرير: ${generatedAtLabel} | تاريخ التقرير: ${reportDateLabel} | الرسالة: ${shipmentName} | المدينة: ${cityName}</div>
  <table>
    <thead><tr>
      <th style="width:40%;text-align:right">العميل</th><th style="width:20%">إجمالي المبيعات</th>
      <th style="width:20%">المبلغ المدفوع</th><th style="width:20%">المديونية</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr>
      <td class="name">الإجمالي</td><td class="num">${fmt(totalSales)}</td>
      <td class="num">${fmt(totalPaid)}</td><td class="num debt">${fmt(totalDebt)}</td>
    </tr></tfoot>
  </table>
  <script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const printInventoryReport = (view: 'byCar' | 'total') => {
    const shipmentName = state.shipments.find(s => s.id === activeShipmentId)?.name || '';
    if (view === 'total') {
      const rowsHtml = inventoryData.productTotals.map((p, i) => `
        <tr class="${i % 2 === 1 ? 'alt' : ''}">
          <td class="name">${p.productName}</td>
          <td class="center">${p.totalReceived}</td><td class="center">${p.totalSold}</td>
          <td class="center">${p.warehouseRemaining}</td><td class="center">${p.carsRemaining}</td>
          <td class="center ${p.totalRemaining <= 0 ? 'zero' : p.totalRemaining < 5 ? 'low' : ''}">${p.totalRemaining}</td>
        </tr>`).join('');
      const tot = inventoryData.productTotals.reduce((acc, p) => ({
        totalReceived: acc.totalReceived + p.totalReceived, totalSold: acc.totalSold + p.totalSold,
        warehouseRemaining: acc.warehouseRemaining + p.warehouseRemaining, carsRemaining: acc.carsRemaining + p.carsRemaining,
        totalRemaining: acc.totalRemaining + p.totalRemaining,
      }), { totalReceived: 0, totalSold: 0, warehouseRemaining: 0, carsRemaining: 0, totalRemaining: 0 });
      const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المخزون</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
@page{size:A4 landscape;margin:10mm;}*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.title{font-size:16px;font-weight:900;color:#134e4a;text-align:center;margin-bottom:8px;}
table{width:100%;border-collapse:collapse;font-size:11px;}thead tr{background-color:#134e4a!important;color:#fff;}
th{padding:6px 8px;font-weight:700;text-align:center;border:1px solid #134e4a;color:#fff;background-color:#134e4a!important;}
td{padding:5px 8px;border:1px solid #cbd5e1;background-color:#fff;}tr.alt td{background-color:#f8fafc!important;}
td.name{text-align:right;font-weight:600;}td.center{text-align:center;}
td.zero{color:#e11d48!important;font-weight:700;background-color:#fee2e2!important;}
td.low{color:#d97706!important;font-weight:700;background-color:#fef3c7!important;}
tfoot tr td{background-color:#e2e8f0!important;border:1px solid #134e4a;font-size:12px;font-weight:900;color:#134e4a;text-align:center;}
</style></head><body>
<div class="title">تقرير إجمالي المخزون - ${shipmentName}</div>
<table><thead><tr><th style="text-align:right;width:20%">المنتج</th>
<th>إجمالي المستلم</th><th>إجمالي المباع</th><th>المتبقي في المخزن</th><th>على السيارات</th><th>الإجمالي المتبقي</th>
</tr></thead><tbody>${rowsHtml}</tbody>
<tfoot><tr><td style="text-align:right">الإجمالي</td><td>${tot.totalReceived}</td><td>${tot.totalSold}</td>
<td>${tot.warehouseRemaining}</td><td>${tot.carsRemaining}</td><td>${tot.totalRemaining}</td></tr></tfoot>
</table><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
      const win = window.open('', '_blank', 'width=1100,height=800');
      if (win) { win.document.write(html); win.document.close(); }
    } else {
      const sectionsHtml = inventoryData.locationData.map(loc => {
        const rowsHtml = loc.productStats.map((p, i) => `
          <tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td class="name">${p.productName}</td><td class="center">${p.incoming}</td><td class="center">${p.outgoing}</td>
            <td class="center ${p.remaining <= 0 ? 'zero' : p.remaining < 5 ? 'low' : ''}">${p.remaining}</td>
          </tr>`).join('');
        return `<h3 style="margin:12px 0 4px;font-size:13px;color:#134e4a;font-family:Cairo,Arial,sans-serif;">${loc.name} — المتبقي: ${loc.totalRemaining}</h3>
<table style="margin-bottom:12px;"><thead><tr>
<th style="text-align:right;width:30%">المنتج</th><th>الكمية المستلمة</th><th>المباع</th><th>المتبقي</th>
</tr></thead><tbody>${rowsHtml}</tbody></table>`;
      }).join('');
      const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير المخزون حسب السيارة</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
@page{size:A4 portrait;margin:10mm;}*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.title{font-size:16px;font-weight:900;color:#134e4a;text-align:center;margin-bottom:8px;}
table{width:100%;border-collapse:collapse;font-size:11px;}thead tr{background-color:#134e4a!important;color:#fff;}
th{padding:5px 8px;font-weight:700;text-align:center;border:1px solid #134e4a;color:#fff;background-color:#134e4a!important;}
td{padding:4px 8px;border:1px solid #cbd5e1;background-color:#fff;}tr.alt td{background-color:#f8fafc!important;}
td.name{text-align:right;font-weight:600;}td.center{text-align:center;}
td.zero{color:#e11d48!important;font-weight:700;background-color:#fee2e2!important;}
td.low{color:#d97706!important;font-weight:700;background-color:#fef3c7!important;}
</style></head><body>
<div class="title">تقرير المخزون حسب السيارة - ${shipmentName}</div>${sectionsHtml}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
      const win = window.open('', '_blank', 'width=850,height=1100');
      if (win) { win.document.write(html); win.document.close(); }
    }
  };

  const printTransfersReport = () => {
    const shipmentName = transfersShipment ? state.shipments.find(s => s.id === transfersShipment)?.name || '' : 'الكل';
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
    const fmtSAR = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
    const fromStr = transfersFromDate ? format(new Date(transfersFromDate), 'dd/MM/yyyy HH:mm') : 'الكل';
    const toStr = transfersToDate ? format(new Date(transfersToDate), 'dd/MM/yyyy HH:mm') : 'الكل';

    const sectionsHtml = transfersData.byPartner.map(partner => {
      const rows = [...partner.transfers]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((t, i) => {
          const accts = t.splits.map(s => state.bankAccounts.find(b => b.id === s.bankAccountId)?.name || '').filter(Boolean).join(' / ');
          return `<tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td class="center">${format(new Date(t.date), 'dd/MM/yyyy HH:mm')}</td>
            <td class="center">${t.id}</td><td class="name">${partner.name}</td>
            <td class="desc">${(t.description || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
            <td class="center">${accts}</td><td class="num">${fmt(t.amountSDG)}</td>
            <td class="num sar">${fmtSAR(t.amountSAR)}</td></tr>`;
        }).join('');
      return `<tr class="group-header">
        <td colspan="5" style="text-align:right;font-weight:700;">${partner.name} (${partner.count} تحاويل)</td>
        <td class="num">${fmt(partner.totalSDG)}</td><td class="num sar">${fmtSAR(partner.totalSAR)}</td></tr>${rows}`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>التحاويل حسب المستفيد</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
@page{size:A4 portrait;margin:8mm;}*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.title{font-size:16px;font-weight:900;color:#134e4a;text-align:center;margin-bottom:3px;}
.subtitle{font-size:11px;color:#1e293b;text-align:center;margin-bottom:10px;}
table{width:100%;border-collapse:collapse;font-size:10px;}
thead tr{background-color:#134e4a!important;color:#fff;}
th{padding:5px 6px;font-weight:700;text-align:center;border:1px solid #134e4a;color:#fff;background-color:#134e4a!important;}
td{padding:4px 6px;border:1px solid #cbd5e1;background-color:#fff;}
tr.alt td{background-color:#f8fafc!important;}
tr.group-header td{background-color:#e2e8f0!important;font-size:11px;border:1px solid #94a3b8;}
td.name{text-align:right;font-weight:600;}td.desc{text-align:right;font-size:9px;}
td.center{text-align:center;}td.num{text-align:center;font-weight:600;}td.sar{color:#059669!important;}
tfoot tr td{background-color:#134e4a!important;border:1px solid #134e4a;font-size:11px;font-weight:900;color:#fff;text-align:center;}
</style></head><body>
<div class="title">التحاويل حسب المستفيد</div>
<div class="subtitle">الرسالة: ${shipmentName} | الفترة: ${fromStr} — ${toStr}</div>
<table><thead><tr>
<th style="width:10%">التاريخ</th><th style="width:10%">رقم التحويل</th><th style="width:13%">المستفيد</th>
<th style="width:22%">الوصف</th><th style="width:15%">الحساب</th>
<th style="width:12%">المبلغ (SDG)</th><th style="width:12%">المبلغ (SAR)</th>
</tr></thead><tbody>${sectionsHtml || '<tr><td colspan="7" style="text-align:center;padding:12px;color:#94a3b8;">لا توجد بيانات</td></tr>'}</tbody>
<tfoot><tr><td colspan="5">الإجمالي</td><td>${fmt(transfersData.totalSDG)}</td><td class="sar">${fmtSAR(transfersData.totalSAR)}</td></tr></tfoot>
</table><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const printExpensesReport = () => {
    const shipmentName = expensesShipment ? state.shipments.find(s => s.id === expensesShipment)?.name || '' : 'الكل';
    const fmt = (n: number) => new Intl.NumberFormat('en-US').format(Math.round(n));
    const fromStr = expensesFromDate ? format(new Date(expensesFromDate), 'dd/MM/yyyy HH:mm') : 'الكل';
    const toStr = expensesToDate ? format(new Date(expensesToDate), 'dd/MM/yyyy HH:mm') : 'الكل';

    const sectionsHtml = expensesChartData.byCategory.map(cat => {
      const rows = [...cat.expenses]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((e, i) => {
          const acctName = state.bankAccounts.find(b => b.id === e.bankAccountId)?.name || '—';
          const carName = e.carId ? (state.cars.find(c => c.id === e.carId)?.name || '—') : '—';
          return `<tr class="${i % 2 === 1 ? 'alt' : ''}">
            <td class="center">${format(new Date(e.date), 'dd/MM/yyyy HH:mm')}</td>
            <td class="center">${e.id}</td><td class="name">${cat.name}</td>
            <td class="desc">${(e.description || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>
            <td class="center">${acctName}</td><td class="center">${carName}</td>
            <td class="num">${fmt(e.amount)}</td></tr>`;
        }).join('');
      return `<tr class="group-header">
        <td colspan="6" style="text-align:right;font-weight:700;">${cat.name} (${cat.count} سجلات)</td>
        <td class="num">${fmt(cat.total)}</td></tr>${rows}`;
    }).join('');

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>المصروفات حسب الفئة</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
@page{size:A4 portrait;margin:8mm;}*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Cairo',Arial,sans-serif;direction:rtl;color:#0f172a;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.title{font-size:16px;font-weight:900;color:#134e4a;text-align:center;margin-bottom:3px;}
.subtitle{font-size:11px;color:#1e293b;text-align:center;margin-bottom:10px;}
table{width:100%;border-collapse:collapse;font-size:10px;}
thead tr{background-color:#134e4a!important;color:#fff;}
th{padding:5px 6px;font-weight:700;text-align:center;border:1px solid #134e4a;color:#fff;background-color:#134e4a!important;}
td{padding:4px 6px;border:1px solid #cbd5e1;background-color:#fff;}
tr.alt td{background-color:#f8fafc!important;}
tr.group-header td{background-color:#e2e8f0!important;font-size:11px;border:1px solid #94a3b8;}
td.name{text-align:right;font-weight:600;}td.desc{text-align:right;font-size:9px;}
td.center{text-align:center;}td.num{text-align:center;font-weight:600;color:#dc2626!important;}
tfoot tr td{background-color:#134e4a!important;border:1px solid #134e4a;font-size:11px;font-weight:900;color:#fff;text-align:center;}
</style></head><body>
<div class="title">المصروفات حسب الفئة</div>
<div class="subtitle">الرسالة: ${shipmentName} | الفترة: ${fromStr} — ${toStr}</div>
<table><thead><tr>
<th style="width:10%">التاريخ</th><th style="width:12%">رقم المصروف</th><th style="width:13%">الفئة</th>
<th style="width:25%">الوصف</th><th style="width:13%">الحساب</th><th style="width:10%">السيارة</th><th style="width:11%">المبلغ</th>
</tr></thead><tbody>${sectionsHtml || '<tr><td colspan="7" style="text-align:center;padding:12px;color:#94a3b8;">لا توجد بيانات</td></tr>'}</tbody>
<tfoot><tr><td colspan="6">الإجمالي</td><td>${fmt(expensesChartData.total)}</td></tr></tfoot>
</table><script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}<\/script>
</body></html>`;
    const win = window.open('', '_blank', 'width=850,height=1100');
    if (win) { win.document.write(html); win.document.close(); }
  };

  // ─── JSX ──────────────────────────────────────────────────────────

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-xl font-bold text-slate-800">{t('reports')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {(isSpRole ? [
          { id: 'debt', label: t('debtReport') },
        ] : isWhRole ? [
          { id: 'inventory', label: 'تقرير المخزون' },
        ] : [
          { id: 'salesperson', label: t('salespersonReport') },
          { id: 'dailyDebt',   label: 'تقرير المديونية اليومي' },
          { id: 'debt',        label: t('debtReport') },
          { id: 'transfers',   label: 'التحاويل حسب المستفيد' },
          { id: 'expenses',    label: 'المصروفات حسب الفئة' },
          { id: 'inventory',   label: 'تقرير المخزون' },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-[#134e4a] text-[#134e4a]'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">

        {/* Debt Tab */}
        {activeTab === 'debt' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <SearchableSelect
                value={debtCityFilter}
                onChange={(val) => setDebtCityFilter(val)}
                options={[{ value: '', label: t('allCities') }, ...state.cities.map(c => ({ value: c.id, label: c.name }))]}
                placeholder={t('allCities')}
              />
              <SearchableSelect
                value={debtShipmentFilter}
                onChange={(val) => setDebtShipmentFilter(val)}
                options={[{ value: '', label: t('allShipments') }, ...state.shipments.map(s => ({ value: s.id, label: s.name }))]}
                placeholder={t('allShipments')}
              />
              <SearchableSelect
                value={debtSalespersonFilter}
                onChange={(val) => setDebtSalespersonFilter(val)}
                options={[{ value: '', label: t('allSalespeople') }, ...state.salespeople.map(s => ({ value: s.id, label: s.name }))]}
                placeholder={t('allSalespeople')}
              />
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Search & Sort Toolbar for Reporting Mobile */}
      <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortDebt(e.target.value as any)}
            value={(debtSortConfig?.key as string) || 'debt'}
          >
            <option value="name">العميل</option>
            <option value="city">المدينة</option>
            <option value="salesperson">المندوب</option>
            <option value="debt">المديونية</option>
          </select>
        </div>
      </div>

              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-slate-100">
                {sortedDebtData.length > 0 ? sortedDebtData.map((row, idx) => (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={row.id} className="p-4 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{row.name}</p>
                        <p className="text-xs text-slate-500">{row.city} · {row.salesperson}</p>
                      </div>
                      <span className="font-bold text-red-600 text-sm flex-shrink-0">{formatCurrency(row.debt)}</span>
                    </div>
                  </motion.div>
                )) : <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>}
                {sortedDebtData.length > 0 && (
                  <div className="px-4 py-3 bg-slate-50 flex justify-between items-center font-bold text-slate-900 text-sm">
                    <span>{t('totalDebt')}</span>
                    <span className="text-red-600">{formatCurrency(sortedDebtData.reduce((sum, row) => sum + row.debt, 0))}</span>
                  </div>
                )}
              </div>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                  <thead className="text-xs text-white uppercase bg-[#134e4a]">
                    <tr>
                      <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortDebt('name')}><div className="flex items-center gap-1">{t('customer')} <SortIcon direction={debtSortConfig?.direction!} active={debtSortConfig?.key === 'name'}/></div></th>
                      <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortDebt('city')}><div className="flex items-center gap-1">{t('city')} <SortIcon direction={debtSortConfig?.direction!} active={debtSortConfig?.key === 'city'}/></div></th>
                      <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortDebt('salesperson')}><div className="flex items-center gap-1">{t('salesperson')} <SortIcon direction={debtSortConfig?.direction!} active={debtSortConfig?.key === 'salesperson'}/></div></th>
                      <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortDebt('debt')}><div className="flex items-center justify-end rtl:justify-start gap-1">{t('debt')} <SortIcon direction={debtSortConfig?.direction!} active={debtSortConfig?.key === 'debt'}/></div></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedDebtData.length > 0 ? sortedDebtData.map((row, idx) => (
                      <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }} key={row.id} className="hover:bg-[#f0fdfa] transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                        <td className="px-4 py-3">{row.city}</td>
                        <td className="px-4 py-3">{row.salesperson}</td>
                        <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(row.debt)}</td>
                      </motion.tr>
                    )) : <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">{t('noData')}</td></tr>}
                  </tbody>
                  <tfoot className="bg-slate-100 font-semibold border-t-2 border-slate-300 text-slate-900">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right rtl:text-left">{t('totalDebt')}</td>
                      <td className="px-4 py-3 text-right rtl:text-left text-red-600">{formatCurrency(debtData.reduce((sum, row) => sum + row.debt, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Daily Debt Tab */}
        {activeTab === 'dailyDebt' && (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">المدينة</label>
                <SearchableSelect
                  value={dailyDebtCity}
                  onChange={(val) => setDailyDebtCity(val)}
                  options={[{ value: '', label: 'اختر المدينة...' }, ...state.cities.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="اختر المدينة..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">الرسالة</label>
                <SearchableSelect
                  value={dailyDebtShipment}
                  onChange={(val) => setDailyDebtShipment(val)}
                  options={state.shipments.map(s => ({ value: s.id, label: s.name }))}
                  placeholder="الرسالة"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                <input type="date" value={dailyDebtDate} onChange={e => setDailyDebtDate(e.target.value)}
                  className="px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
                />
              </div>
              <button onClick={printReport} disabled={!dailyDebtCity}
                className="flex items-center px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                طباعة
              </button>
            </div>
            {dailyDebtCity ? (
              <div className="bg-white p-8 rounded-lg border border-[#e2e8f0] overflow-x-auto" dir="rtl">
                <div className="flex justify-between items-center border-b-4 border-[#134e4a] pb-6 mb-8">
                  <h2 className="text-3xl font-bold text-[#134e4a]">تقرير المديونية اليومي</h2>
                  <div className="text-lg text-[#1e293b] font-bold space-x-4 rtl:space-x-reverse">
                    <span>وقت إنشاء التقرير: {formatDateTimeValue(new Date(), true)}</span>
                    <span className="mx-2">|</span>
                    <span>تاريخ التقرير: {formatDateOnlyValue(dailyDebtDate)}</span>
                    <span className="mx-2">|</span>
                    <span>الرسالة: {state.shipments.find(s => s.id === dailyDebtShipment)?.name}</span>
                    <span className="mx-2">|</span>
                    <span>المدينة: {state.cities.find(c => c.id === dailyDebtCity)?.name}</span>
                  </div>
                </div>
                <table className="w-full border-collapse border-2 border-[#134e4a]">
                  <thead>
                    <tr className="bg-[#134e4a] text-white">
                      <th className="w-[40%] px-6 py-4 text-right border-2 border-[#134e4a] text-lg">العميل</th>
                      <th className="w-[20%] px-6 py-4 text-center border-2 border-[#134e4a] text-lg">إجمالي المبيعات</th>
                      <th className="w-[20%] px-6 py-4 text-center border-2 border-[#134e4a] text-lg">المبلغ المدفوع</th>
                      <th className="w-[20%] px-6 py-4 text-left border-2 border-[#134e4a] text-lg">المديونية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyDebtData.map((row, index) => (
                      <tr key={row.id} className={index % 2 === 0 ? 'bg-white' : 'bg-[#f1f5f9]'}>
                        <td className="px-6 py-4 border-2 border-[#cbd5e1] font-bold text-[#0f172a] text-lg">{row.name}</td>
                        <td className="px-6 py-4 border-2 border-[#cbd5e1] text-center text-lg font-medium">{new Intl.NumberFormat('en-US').format(row.totalSales)}</td>
                        <td className="px-6 py-4 border-2 border-[#cbd5e1] text-center text-lg font-medium">{new Intl.NumberFormat('en-US').format(row.totalPaid)}</td>
                        <td className="px-6 py-4 border-2 border-[#cbd5e1] text-left font-black text-[#e11d48] text-xl">{new Intl.NumberFormat('en-US').format(row.debt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#e2e8f0] font-black text-[#134e4a] text-xl">
                      <td className="px-6 py-4 border-2 border-[#134e4a] text-right">الإجمالي</td>
                      <td className="px-6 py-4 border-2 border-[#134e4a] text-center">{new Intl.NumberFormat('en-US').format(dailyDebtData.reduce((s, r) => s + r.totalSales, 0))}</td>
                      <td className="px-6 py-4 border-2 border-[#134e4a] text-center">{new Intl.NumberFormat('en-US').format(dailyDebtData.reduce((s, r) => s + r.totalPaid, 0))}</td>
                      <td className="px-6 py-4 border-2 border-[#134e4a] text-left text-[#e11d48]">{new Intl.NumberFormat('en-US').format(dailyDebtData.reduce((s, r) => s + r.debt, 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p>يرجى اختيار المدينة لعرض تقرير المديونية</p>
              </div>
            )}
          </div>
        )}

        {/* Salesperson Tab */}
        {activeTab === 'salesperson' && (
          <div className="space-y-8">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <h3 className="text-lg font-bold text-slate-800">{t('salespersonPerformance')}</h3>
              <div className="flex items-center gap-3">
                <SearchableSelect
                  value={salespersonCityFilter}
                  onChange={(val) => setSalespersonCityFilter(val)}
                  options={[{ value: '', label: 'كل المدن' }, ...state.cities.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="كل المدن"
                />
                <button onClick={printSalespersonReport} disabled={salespersonData.length === 0}
                  className="flex items-center px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />طباعة
                </button>
              </div>
            </div>
            {sortedSalespersonData.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p>{t('noData')}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sortedSalespersonData.map((sp, idx) => {
                    const initials = sp.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('');
                    const rateColor = sp.collectionRate >= 80 ? 'bg-emerald-100 text-emerald-700' : sp.collectionRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                    const barColor = sp.collectionRate >= 80 ? 'bg-emerald-500' : sp.collectionRate >= 50 ? 'bg-amber-400' : 'bg-red-500';
                    return (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={sp.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col gap-3 min-w-[280px]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[#134e4a] text-white flex items-center justify-center font-bold text-lg shrink-0">{initials}</div>
                            <div>
                              <p className="text-lg font-bold text-slate-800">{sp.name}</p>
                              <p className="text-xs text-slate-500">{sp.cities.slice(0, 3).join(' · ')}</p>
                            </div>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${rateColor}`}>{sp.collectionRate}%</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div><p className="text-xs text-slate-400">إجمالي المبيعات</p><p className="font-bold text-slate-800">{formatCurrency(sp.sales)}</p></div>
                          <div><p className="text-xs text-slate-400">التحصيلات</p><p className="font-bold text-[#134e4a]">{formatCurrency(sp.collections)}</p></div>
                          <div><p className="text-xs text-slate-400">المديونية</p><p className="font-bold text-red-600">{formatCurrency(sp.debt)}</p></div>
                          <div><p className="text-xs text-slate-400">عدد الفواتير</p><p className="font-bold text-slate-600">{sp.invoiceCount}</p></div>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(sp.collectionRate, 100)}%` }} />
                        </div>
                        {/* Commission section */}
                        <div className="border-t border-slate-100 pt-2 mt-1">
                          <p className="text-xs font-semibold text-slate-500 mb-2">العمولة</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div><p className="text-xs text-slate-400">إجمالي التحصيل المؤهل</p><p className="font-bold text-slate-700">{formatCurrency(sp.totalEligible)}</p></div>
                            <div><p className="text-xs text-slate-400">مبلغ العمولة 2%</p><p className="font-bold text-slate-700">{formatCurrency(sp.amount2pct)}</p></div>
                            <div><p className="text-xs text-slate-400">مبلغ العمولة 1%</p><p className="font-bold text-slate-700">{formatCurrency(sp.amount1pct)}</p></div>
                            <div><p className="text-xs text-slate-400">العمولة المكتسبة 2%</p><p className="font-bold text-blue-600">{formatCurrency(sp.commission2)}</p></div>
                            <div><p className="text-xs text-slate-400">العمولة المكتسبة 1%</p><p className="font-bold text-blue-600">{formatCurrency(sp.commission1)}</p></div>
                            <div><p className="text-xs text-slate-400">إجمالي العمولة الإجمالية</p><p className="font-bold text-blue-700">{formatCurrency(sp.grossCommission)}</p></div>
                            <div><p className="text-xs text-slate-400">السلفيات</p><p className="font-bold text-amber-600">{formatCurrency(sp.advances)}</p></div>
                            <div><p className="text-xs text-slate-400">صافي العمولة بعد الخصم</p><p className={`font-bold ${sp.netCommission >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(sp.netCommission)}</p></div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <h4 className="text-sm font-semibold text-slate-600 mb-3">مقارنة المبيعات والتحصيلات</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ minWidth: 500, height: 280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={salespersonData.map(sp => ({ ...sp, name: sp.name.length > 15 ? sp.name.slice(0, 14) + '…' : sp.name }))}
                          layout="vertical"
                          margin={{ top: 0, right: 80, left: 120, bottom: 0 }}
                          barCategoryGap="20%"
                          barGap={4}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                          <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            width={120}
                            tick={{ fontSize: 13, fontWeight: 600, fill: '#1E293B' }}
                            mirror={false}
                          />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: '#F1F5F9' }} />
                          <Legend />
                          <Bar dataKey="sales" name="المبيعات" fill="#134e4a" barSize={14} radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => v > 0 ? `${Math.round(v / 1000)}k` : '', fontSize: 11, fill: '#64748b' }} />
                          <Bar dataKey="collections" name="التحصيلات" fill="#0D9488" barSize={14} radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => v > 0 ? `${Math.round(v / 1000)}k` : '', fontSize: 11, fill: '#64748b' }} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-3">جدول تفصيلي</h4>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
      {/* Search & Sort Toolbar for Reporting Mobile */}
      <div className="md:hidden bg-slate-50 p-4 border-b border-slate-100">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب بواسطة:</span>
          <select 
            className="bg-white border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => sortSalesperson(e.target.value as any)}
            value={(salespersonSortConfig?.key as string) || 'sales'}
          >
            <option value="name">المندوب</option>
            <option value="sales">المبيعات</option>
            <option value="collections">التحصيلات</option>
            <option value="debt">المديونية</option>
            <option value="collectionRate">نسبة التحصيل</option>
          </select>
        </div>
      </div>

                    {/* Mobile card list */}
                    <div className="md:hidden divide-y divide-slate-100">
                      {sortedSalespersonData.map((sp, idx) => {
                        const rateColor = sp.collectionRate >= 80 ? 'bg-emerald-100 text-emerald-700' : sp.collectionRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                        return (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.2) }} key={sp.id} className="p-4 space-y-2">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 text-sm">{sp.name}</p>
                                <p className="text-xs text-slate-500">{sp.cities.join('، ')}</p>
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0 ${rateColor}`}>{sp.collectionRate}%</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-slate-500">مبيعات</p>
                                <p className="font-semibold text-slate-800">{formatCurrency(sp.sales)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">تحصيل</p>
                                <p className="font-semibold text-[#134e4a]">{formatCurrency(sp.collections)}</p>
                              </div>
                              <div>
                                <p className="text-slate-500">مديونية</p>
                                <p className="font-bold text-red-600">{formatCurrency(sp.debt)}</p>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                        <thead className="text-xs text-white bg-[#134e4a]">
                          <tr>
                            <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('name')}><div className="flex items-center gap-1">المندوب <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'name'}/></div></th>
                            <th className="px-4 py-3 cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('cities')}><div className="flex items-center gap-1">المدن <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'cities'}/></div></th>
                            <th className="px-4 py-3 text-center cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('invoiceCount')}><div className="flex items-center justify-center gap-1">عدد الفواتير <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'invoiceCount'}/></div></th>
                            <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('sales')}><div className="flex items-center justify-end rtl:justify-start gap-1">إجمالي المبيعات <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'sales'}/></div></th>
                            <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('collections')}><div className="flex items-center justify-end rtl:justify-start gap-1">التحصيلات <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'collections'}/></div></th>
                            <th className="px-4 py-3 text-right rtl:text-left cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('debt')}><div className="flex items-center justify-end rtl:justify-start gap-1">المديونية <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'debt'}/></div></th>
                            <th className="px-4 py-3 text-center cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => sortSalesperson('collectionRate')}><div className="flex items-center justify-center gap-1">نسبة التحصيل <SortIcon direction={salespersonSortConfig?.direction!} active={salespersonSortConfig?.key === 'collectionRate'}/></div></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedSalespersonData.map((sp, idx) => {
                            const rateColor = sp.collectionRate >= 80 ? 'bg-emerald-100 text-emerald-700' : sp.collectionRate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                            return (
                              <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }} key={sp.id} className="hover:bg-[#f0fdfa] transition-colors">
                                <td className="px-4 py-3 font-semibold text-slate-900">{sp.name}</td>
                                <td className="px-4 py-3 text-slate-500 text-xs">{sp.cities.join('، ')}</td>
                                <td className="px-4 py-3 text-center">{sp.invoiceCount}</td>
                                <td className="px-4 py-3 font-semibold text-right rtl:text-left">{formatCurrency(sp.sales)}</td>
                                <td className="px-4 py-3 font-semibold text-[#134e4a] text-right rtl:text-left">{formatCurrency(sp.collections)}</td>
                                <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(sp.debt)}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${rateColor}`}>{sp.collectionRate}%</span>
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                          <tr>
                            <td className="px-4 py-3">الإجمالي</td><td />
                            <td className="px-4 py-3 text-center">{salespersonData.reduce((s, sp) => s + sp.invoiceCount, 0)}</td>
                            <td className="px-4 py-3 text-right rtl:text-left">{formatCurrency(salespersonData.reduce((s, sp) => s + sp.sales, 0))}</td>
                            <td className="px-4 py-3 font-bold text-[#134e4a] text-right rtl:text-left">{formatCurrency(salespersonData.reduce((s, sp) => s + sp.collections, 0))}</td>
                            <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(salespersonData.reduce((s, sp) => s + sp.debt, 0))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Transfers by Recipient Tab */}
        {activeTab === 'transfers' && (
          <div className="space-y-8">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">من تاريخ</label>
                <input type="date" value={transfersFromDate} onChange={e => setTransfersFromDate(e.target.value)}
                  className="px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">إلى تاريخ</label>
                <input type="date" value={transfersToDate} onChange={e => setTransfersToDate(e.target.value)}
                  className="px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">الرسالة</label>
                <SearchableSelect
                  value={transfersShipment}
                  onChange={(val) => setTransfersShipment(val)}
                  options={[{ value: '', label: 'الكل' }, ...state.shipments.map(s => ({ value: s.id, label: s.name }))]}
                  placeholder="الكل"
                />
              </div>
              <button onClick={printTransfersReport}
                className="flex items-center px-4 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors"
              >
                <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />طباعة
              </button>
            </div>

            {transfersData.byPartner.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p>لا توجد بيانات تحاويل للفترة المحددة</p>
              </div>
            ) : (
              <>
                {/* Donut + Summary side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-3">توزيع التحاويل حسب المستفيد</h4>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={transfersData.donutData}
                            cx="50%" cy="50%"
                            innerRadius={55} outerRadius={100}
                            dataKey="value"
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          >
                            {transfersData.donutData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-3">ملخص حسب المستفيد</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                        <thead className="text-xs text-white bg-[#134e4a]">
                          <tr>
                            <th className="px-4 py-3">المستفيد</th>
                            <th className="px-4 py-3 text-center">عدد التحاويل</th>
                            <th className="px-4 py-3 text-right rtl:text-left">إجمالي (SDG)</th>
                            <th className="px-4 py-3 text-right rtl:text-left">إجمالي (SAR)</th>
                            <th className="px-4 py-3 text-center">النسبة %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transfersData.byPartner.map((p, i) => (
                            <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                  {p.name}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">{p.count}</td>
                              <td className="px-4 py-3 font-semibold text-right rtl:text-left">{formatCurrency(p.totalSDG)}</td>
                              <td className="px-4 py-3 font-semibold text-emerald-600 text-right rtl:text-left">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(p.totalSAR)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{p.percentage}%</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                          <tr>
                            <td className="px-4 py-3">الإجمالي</td>
                            <td className="px-4 py-3 text-center">{transfersData.byPartner.reduce((s, p) => s + p.count, 0)}</td>
                            <td className="px-4 py-3 text-right rtl:text-left">{formatCurrency(transfersData.totalSDG)}</td>
                            <td className="px-4 py-3 text-emerald-600 text-right rtl:text-left">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(transfersData.totalSAR)}</td>
                            <td className="px-4 py-3 text-center">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Detailed transactions table */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-3">تفاصيل التحاويل</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-slate-600" style={{ fontSize: '11px' }}>
                      <thead className="text-white bg-[#134e4a]">
                        <tr>
                          <th className="px-3 py-2 text-center font-semibold">التاريخ</th>
                          <th className="px-3 py-2 text-center font-semibold">رقم التحويل</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">المستفيد</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">الوصف</th>
                          <th className="px-3 py-2 text-center font-semibold">الحساب</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">المبلغ (SDG)</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">المبلغ (SAR)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transfersData.byPartner.map((partner, pi) => (
                          <React.Fragment key={partner.id}>
                            <tr className="bg-slate-100 border-y border-slate-300">
                              <td colSpan={5} className="px-3 py-1.5 font-bold text-slate-700">
                                <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 rtl:ml-2 rtl:mr-0 align-middle" style={{ backgroundColor: COLORS[pi % COLORS.length] }} />
                                {partner.name} — {partner.count} تحاويل
                              </td>
                              <td className="px-3 py-1.5 font-bold text-right rtl:text-left">{formatCurrency(partner.totalSDG)}</td>
                              <td className="px-3 py-1.5 font-bold text-emerald-600 text-right rtl:text-left">
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(partner.totalSAR)}
                              </td>
                            </tr>
                            {[...partner.transfers]
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                              .map((tr, ti) => (
                                <tr key={tr.id} className={ti % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="px-3 py-1.5 text-center">{format(new Date(tr.date), 'dd/MM/yyyy HH:mm')}</td>
                                  <td className="px-3 py-1.5 text-center text-slate-500">{tr.id}</td>
                                  <td className="px-3 py-1.5 font-medium text-slate-800">{partner.name}</td>
                                  <td className="px-3 py-1.5 text-slate-500">{tr.description || '—'}</td>
                                  <td className="px-3 py-1.5 text-center text-slate-500">
                                    {tr.splits.map(s => state.bankAccounts.find(b => b.id === s.bankAccountId)?.name || '').filter(Boolean).join(' / ')}
                                  </td>
                                  <td className="px-3 py-1.5 font-semibold text-right rtl:text-left">{formatCurrency(tr.amountSDG)}</td>
                                  <td className="px-3 py-1.5 font-semibold text-emerald-600 text-right rtl:text-left">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(tr.amountSAR)}
                                  </td>
                                </tr>
                              ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#134e4a] text-white font-bold">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-right rtl:text-left">الإجمالي</td>
                          <td className="px-3 py-2 text-right rtl:text-left">{formatCurrency(transfersData.totalSDG)}</td>
                          <td className="px-3 py-2 text-right rtl:text-left text-emerald-300">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR' }).format(transfersData.totalSAR)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Expenses by Category Tab */}
        {activeTab === 'expenses' && (
          <div className="space-y-8">
            {/* Filter bar */}
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">من تاريخ</label>
                <input type="date" value={expensesFromDate} onChange={e => setExpensesFromDate(e.target.value)}
                  className="px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">إلى تاريخ</label>
                <input type="date" value={expensesToDate} onChange={e => setExpensesToDate(e.target.value)}
                  className="px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">الرسالة</label>
                <SearchableSelect
                  value={expensesShipment}
                  onChange={(val) => setExpensesShipment(val)}
                  options={[{ value: '', label: 'الكل' }, ...state.shipments.map(s => ({ value: s.id, label: s.name }))]}
                  placeholder="الكل"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">السيارة</label>
                <SearchableSelect
                  value={expensesCarFilter}
                  onChange={(val) => setExpensesCarFilter(val)}
                  options={[{ value: '', label: 'كل السيارات' }, ...state.cars.map(c => ({ value: c.id, label: c.name }))]}
                  placeholder="كل السيارات"
                />
              </div>
              <button onClick={printExpensesReport}
                className="flex items-center px-4 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors"
              >
                <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />طباعة
              </button>
            </div>

            {expensesChartData.byCategory.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <p>لا توجد بيانات مصروفات للفترة المحددة</p>
              </div>
            ) : (
              <>
                {/* Bar chart + Summary side-by-side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-3">المصروفات حسب الفئة</h4>
                    <div style={{ height: Math.max(200, expensesChartData.byCategory.length * 52) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={expensesChartData.barData} layout="vertical" margin={{ top: 0, right: 90, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                          <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                          <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={110} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} cursor={{ fill: '#F1F5F9' }} />
                          <Bar dataKey="value" name="المبلغ" fill="#0D9488" radius={[0, 4, 4, 0]}
                            label={{ position: 'right', formatter: (v: number) => v > 0 ? `${Math.round(v / 1000)}k` : '', fontSize: 11, fill: '#64748b' }}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-600 mb-3">ملخص حسب الفئة</h4>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm text-left rtl:text-right text-slate-600">
                        <thead className="text-xs text-white bg-[#134e4a]">
                          <tr>
                            <th className="px-4 py-3">الفئة</th>
                            <th className="px-4 py-3 text-center">السجلات</th>
                            <th className="px-4 py-3 text-right rtl:text-left">الإجمالي (SDG)</th>
                            <th className="px-4 py-3">النسبة %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {expensesChartData.byCategory.map(cat => (
                            <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-900">{cat.name}</td>
                              <td className="px-4 py-3 text-center">{cat.count}</td>
                              <td className="px-4 py-3 font-semibold text-red-600 text-right rtl:text-left">{formatCurrency(cat.total)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                                    <div className="bg-[#14b8a6] h-2 rounded-full" style={{ width: `${cat.percentage}%` }} />
                                  </div>
                                  <span className="text-xs font-bold text-slate-600 w-9 text-right">{cat.percentage}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                          <tr>
                            <td className="px-4 py-3">الإجمالي</td>
                            <td className="px-4 py-3 text-center">{expensesChartData.byCategory.reduce((s, c) => s + c.count, 0)}</td>
                            <td className="px-4 py-3 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(expensesChartData.total)}</td>
                            <td className="px-4 py-3 text-xs font-bold text-slate-600">100%</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Detailed transactions table */}
                <div>
                  <h4 className="text-sm font-semibold text-slate-600 mb-3">تفاصيل المصروفات</h4>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-slate-600" style={{ fontSize: '11px' }}>
                      <thead className="text-white bg-[#134e4a]">
                        <tr>
                          <th className="px-3 py-2 text-center font-semibold">التاريخ</th>
                          <th className="px-3 py-2 text-center font-semibold">رقم المصروف</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">الفئة</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">الوصف</th>
                          <th className="px-3 py-2 text-center font-semibold">الحساب</th>
                          <th className="px-3 py-2 text-center font-semibold">السيارة</th>
                          <th className="px-3 py-2 text-right rtl:text-left font-semibold">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expensesChartData.byCategory.map(cat => (
                          <React.Fragment key={cat.id}>
                            <tr className="bg-slate-100 border-y border-slate-300">
                              <td colSpan={6} className="px-3 py-1.5 font-bold text-slate-700">{cat.name} — {cat.count} سجلات</td>
                              <td className="px-3 py-1.5 font-bold text-red-600 text-right rtl:text-left">{formatCurrency(cat.total)}</td>
                            </tr>
                            {[...cat.expenses]
                              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                              .map((exp, ei) => (
                                <tr key={exp.id} className={ei % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                  <td className="px-3 py-1.5 text-center">{format(new Date(exp.date), 'dd/MM/yyyy HH:mm')}</td>
                                  <td className="px-3 py-1.5 text-center text-slate-500">{exp.id}</td>
                                  <td className="px-3 py-1.5 font-medium text-slate-800">{cat.name}</td>
                                  <td className="px-3 py-1.5 text-slate-500">{exp.description || '—'}</td>
                                  <td className="px-3 py-1.5 text-center text-slate-500">{state.bankAccounts.find(b => b.id === exp.bankAccountId)?.name || '—'}</td>
                                  <td className="px-3 py-1.5 text-center text-slate-500">{exp.carId ? (state.cars.find(c => c.id === exp.carId)?.name || '—') : '—'}</td>
                                  <td className="px-3 py-1.5 font-semibold text-red-600 text-right rtl:text-left">{formatCurrency(exp.amount)}</td>
                                </tr>
                              ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#134e4a] text-white font-bold">
                        <tr>
                          <td colSpan={6} className="px-3 py-2 text-right rtl:text-left">الإجمالي</td>
                          <td className="px-3 py-2 text-right rtl:text-left">{formatCurrency(expensesChartData.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Inventory Tab */}
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="flex gap-2">
                <button onClick={() => setInventoryView('byCar')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${inventoryView === 'byCar' ? 'bg-[#134e4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >حسب السيارة</button>
                <button onClick={() => setInventoryView('total')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${inventoryView === 'total' ? 'bg-[#134e4a] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >إجمالي المتبقي</button>
              </div>
              <button onClick={() => printInventoryReport(inventoryView)}
                className="flex items-center px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold text-sm transition-colors"
              >
                <Printer className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />طباعة
              </button>
            </div>

            {inventoryView === 'byCar' && (
              <div className="space-y-6">
                {inventoryData.locationData.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                    <p>لا توجد بيانات مخزون للرسالة الحالية</p>
                  </div>
                ) : (
                  inventoryData.locationData.map(loc => (
                    <div key={loc.id} className="rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-[#134e4a] text-white px-4 py-2 flex justify-between items-center">
                        <span className="font-bold text-sm">{loc.name}</span>
                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">المتبقي: {loc.totalRemaining}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-slate-600" style={{ fontSize: '11px' }}>
                          <thead className="text-white bg-slate-600">
                            <tr>
                              <th className="px-3 py-1.5 text-right rtl:text-left font-semibold">المنتج</th>
                              <th className="px-3 py-1.5 text-center font-semibold">الكمية المستلمة</th>
                              <th className="px-3 py-1.5 text-center font-semibold">المباع</th>
                              <th className="px-3 py-1.5 text-center font-semibold">المتبقي</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {loc.productStats.map((p, i) => (
                              <tr key={p.productId} className={p.remaining <= 0 ? 'bg-red-50' : p.remaining < 5 ? 'bg-amber-50' : i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                                <td className="px-3 py-1.5 font-medium text-slate-900">{p.productName}</td>
                                <td className="px-3 py-1.5 text-center">{p.incoming}</td>
                                <td className="px-3 py-1.5 text-center">{p.outgoing}</td>
                                <td className={`px-3 py-1.5 text-center font-bold ${p.remaining <= 0 ? 'text-red-600' : p.remaining < 5 ? 'text-amber-600' : 'text-slate-700'}`}>{p.remaining}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {inventoryView === 'total' && (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-slate-600" style={{ fontSize: '11px' }}>
                    <thead className="text-white bg-[#134e4a]">
                      <tr>
                        <th className="px-3 py-1.5 text-right rtl:text-left font-semibold">المنتج</th>
                        <th className="px-3 py-1.5 text-center font-semibold">إجمالي المستلم</th>
                        <th className="px-3 py-1.5 text-center font-semibold">إجمالي المباع</th>
                        <th className="px-3 py-1.5 text-center font-semibold">المتبقي في المخزن</th>
                        <th className="px-3 py-1.5 text-center font-semibold">على السيارات</th>
                        <th className="px-3 py-1.5 text-center font-semibold">الإجمالي المتبقي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventoryData.productTotals.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">لا توجد بيانات</td></tr>
                      ) : inventoryData.productTotals.map((p, i) => (
                        <tr key={p.productId} className={p.totalRemaining <= 0 ? 'bg-red-50' : p.totalRemaining < 5 ? 'bg-amber-50' : i % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="px-3 py-1.5 font-medium text-slate-900">{p.productName}</td>
                          <td className="px-3 py-1.5 text-center">{p.totalReceived}</td>
                          <td className="px-3 py-1.5 text-center">{p.totalSold}</td>
                          <td className="px-3 py-1.5 text-center">{p.warehouseRemaining}</td>
                          <td className="px-3 py-1.5 text-center">{p.carsRemaining}</td>
                          <td className={`px-3 py-1.5 text-center font-bold ${p.totalRemaining <= 0 ? 'text-red-600' : p.totalRemaining < 5 ? 'text-amber-600' : 'text-slate-700'}`}>{p.totalRemaining}</td>
                        </tr>
                      ))}
                    </tbody>
                    {inventoryData.productTotals.length > 0 && (
                      <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                        <tr>
                          <td className="px-3 py-1.5">الإجمالي</td>
                          <td className="px-3 py-1.5 text-center">{inventoryData.productTotals.reduce((s, p) => s + p.totalReceived, 0)}</td>
                          <td className="px-3 py-1.5 text-center">{inventoryData.productTotals.reduce((s, p) => s + p.totalSold, 0)}</td>
                          <td className="px-3 py-1.5 text-center">{inventoryData.productTotals.reduce((s, p) => s + p.warehouseRemaining, 0)}</td>
                          <td className="px-3 py-1.5 text-center">{inventoryData.productTotals.reduce((s, p) => s + p.carsRemaining, 0)}</td>
                          <td className="px-3 py-1.5 text-center">{inventoryData.productTotals.reduce((s, p) => s + p.totalRemaining, 0)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </motion.div>
  );
}
