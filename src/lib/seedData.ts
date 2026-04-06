import type {
  AppState, Customer, Invoice, InvoiceLine, Payment, Expense, Salary,
  GeneralTransfer, LedgerEntry, InventoryTransaction, CapitalContribution,
} from '../types';

export function generateSeedData(): AppState {
  const S = '4'; // shipmentId — الرسالة15

  // ─── Customers ───────────────────────────────────────────────
  const customers: Customer[] = [
    { id: 'C001', name: 'الفا مول', cityId: '1', salespersonId: '2', carId: '3', phone: '', notes: '' },
    { id: 'C002', name: 'هلا ماركت', cityId: '1', salespersonId: '1', carId: '3', phone: '', notes: '' },
    { id: 'C003', name: 'الاحسان', cityId: '8', salespersonId: '4', carId: '2', phone: '', notes: '' },
    { id: 'C004', name: 'الوفرة', cityId: '2', salespersonId: '3', carId: '1', phone: '', notes: '' },
    { id: 'C005', name: 'اركا', cityId: '3', salespersonId: '2', carId: '1', phone: '', notes: '' },
    { id: 'C006', name: 'السعادة', cityId: '2', salespersonId: '3', carId: '1', phone: '', notes: '' },
    { id: 'C007', name: 'ابو سالم', cityId: '6', salespersonId: '1', carId: '1', phone: '', notes: '' },
    { id: 'C008', name: 'الزيتونة', cityId: '6', salespersonId: '1', carId: '1', phone: '', notes: '' },
    { id: 'C009', name: 'الكعيك', cityId: '3', salespersonId: '2', carId: '1', phone: '', notes: '' },
    { id: 'C010', name: 'البركة', cityId: '4', salespersonId: '3', carId: '1', phone: '', notes: '' },
  ];

  // ─── Capital Contributions (SAR only — no SDG, no ledger) ───
  const capitalContributions: CapitalContribution[] = [
    { id: 'CC00001', partnerId: '1', shipmentId: S, amountSAR: 10000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00002', partnerId: '2', shipmentId: S, amountSAR: 8000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00003', partnerId: '7', shipmentId: S, amountSAR: 7000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00004', partnerId: '6', shipmentId: S, amountSAR: 6000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00005', partnerId: '8', shipmentId: S, amountSAR: 5000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00006', partnerId: '9', shipmentId: S, amountSAR: 4000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
    { id: 'CC00007', partnerId: '5', shipmentId: S, amountSAR: 3000, date: '2026-01-15', notes: 'مساهمة رأس مال' },
  ];

  // ─── Inventory — Receive stock to warehouse ─────────────────
  const invTxns: InventoryTransaction[] = [
    { id: 'IT001', date: '2026-02-01', shipmentId: S, productId: '1',  type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 300 },
    { id: 'IT002', date: '2026-02-01', shipmentId: S, productId: '2',  type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 250 },
    { id: 'IT003', date: '2026-02-01', shipmentId: S, productId: '5',  type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 400 },
    { id: 'IT004', date: '2026-02-01', shipmentId: S, productId: '6',  type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 150 },
    { id: 'IT005', date: '2026-02-01', shipmentId: S, productId: '13', type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 100 },
    { id: 'IT006', date: '2026-02-01', shipmentId: S, productId: '12', type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 120 },
    { id: 'IT007', date: '2026-02-01', shipmentId: S, productId: '9',  type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 80 },
    { id: 'IT008', date: '2026-02-01', shipmentId: S, productId: '10', type: 'receive', fromLocation: 'supplier',   toLocation: 'warehouse', qty: 60 },
    // ── Car Loading: شرق (car 1) ──
    { id: 'IT009', date: '2026-02-02', shipmentId: S, productId: '1',  type: 'load', fromLocation: 'warehouse', toLocation: '1', qty: 100 },
    { id: 'IT010', date: '2026-02-02', shipmentId: S, productId: '2',  type: 'load', fromLocation: 'warehouse', toLocation: '1', qty: 80 },
    { id: 'IT011', date: '2026-02-02', shipmentId: S, productId: '5',  type: 'load', fromLocation: 'warehouse', toLocation: '1', qty: 120 },
    { id: 'IT012', date: '2026-02-02', shipmentId: S, productId: '6',  type: 'load', fromLocation: 'warehouse', toLocation: '1', qty: 50 },
    // ── Car Loading: شمال (car 2) ──
    { id: 'IT013', date: '2026-02-02', shipmentId: S, productId: '1',  type: 'load', fromLocation: 'warehouse', toLocation: '2', qty: 80 },
    { id: 'IT014', date: '2026-02-02', shipmentId: S, productId: '2',  type: 'load', fromLocation: 'warehouse', toLocation: '2', qty: 70 },
    { id: 'IT015', date: '2026-02-02', shipmentId: S, productId: '5',  type: 'load', fromLocation: 'warehouse', toLocation: '2', qty: 100 },
    { id: 'IT016', date: '2026-02-02', shipmentId: S, productId: '13', type: 'load', fromLocation: 'warehouse', toLocation: '2', qty: 40 },
    // ── Car Loading: بورتسودان (car 3) ──
    { id: 'IT017', date: '2026-02-02', shipmentId: S, productId: '1',  type: 'load', fromLocation: 'warehouse', toLocation: '3', qty: 60 },
    { id: 'IT018', date: '2026-02-02', shipmentId: S, productId: '2',  type: 'load', fromLocation: 'warehouse', toLocation: '3', qty: 50 },
    { id: 'IT019', date: '2026-02-02', shipmentId: S, productId: '5',  type: 'load', fromLocation: 'warehouse', toLocation: '3', qty: 80 },
    { id: 'IT020', date: '2026-02-02', shipmentId: S, productId: '9',  type: 'load', fromLocation: 'warehouse', toLocation: '3', qty: 30 },
  ];

  // ─── Invoices ───────────────────────────────────────────────
  const L = (pid: string, qty: number, up: number): InvoiceLine =>
    ({ productId: pid, qty, unitPrice: up, total: qty * up });

  const mkInv = (
    id: string, date: string, cId: string, spId: string, cityId: string,
    carId: string, lines: InvoiceLine[], pt: 'cash' | 'credit', bankId?: string,
  ): Invoice => ({
    id, date, customerId: cId, salespersonId: spId, cityId, carId,
    shipmentId: S, lines, total: lines.reduce((s, l) => s + l.total, 0),
    paymentType: pt, bankAccountId: bankId,
  });

  const invoices: Invoice[] = [
    mkInv('INV00001', '2026-02-05', 'C001', '2', '1', '3', [L('2', 20, 450000), L('5', 15, 150000)], 'credit'),
    mkInv('INV00002', '2026-02-06', 'C002', '1', '1', '3', [L('1', 10, 185000), L('2', 5, 450000)], 'credit'),
    mkInv('INV00003', '2026-02-07', 'C003', '4', '8', '2', [L('5', 30, 150000), L('1', 20, 185000)], 'credit'),
    mkInv('INV00004', '2026-02-08', 'C004', '3', '2', '1', [L('6', 10, 200000), L('2', 8, 450000)], 'credit'),
    mkInv('INV00005', '2026-02-10', 'C005', '2', '3', '1', [L('1', 15, 185000), L('5', 20, 150000)], 'cash', '1'),
    mkInv('INV00006', '2026-02-12', 'C001', '2', '1', '3', [L('2', 10, 450000)], 'credit'),
    mkInv('INV00007', '2026-02-14', 'C006', '3', '2', '1', [L('12', 15, 220000)], 'cash', '1'),
    mkInv('INV00008', '2026-02-16', 'C007', '1', '6', '1', [L('5', 25, 150000), L('1', 10, 185000)], 'credit'),
    mkInv('INV00009', '2026-02-18', 'C008', '1', '6', '1', [L('2', 12, 450000), L('13', 8, 300000)], 'credit'),
    mkInv('INV00010', '2026-02-20', 'C009', '2', '3', '1', [L('1', 20, 185000)], 'cash', '1'),
    mkInv('INV00011', '2026-02-22', 'C010', '3', '4', '1', [L('6', 15, 200000), L('5', 10, 150000)], 'credit'),
    mkInv('INV00012', '2026-02-24', 'C002', '1', '1', '3', [L('2', 8, 450000)], 'cash', '1'),
    mkInv('INV00013', '2026-02-26', 'C003', '4', '8', '2', [L('9', 10, 350000)], 'credit'),
    mkInv('INV00014', '2026-02-28', 'C004', '3', '2', '1', [L('10', 8, 360000)], 'cash', '1'),
    mkInv('INV00015', '2026-03-01', 'C001', '2', '1', '3', [L('1', 25, 185000)], 'credit'),
  ];

  // ─── Sell inventory transactions (one per invoice line) ─────
  let itN = 21;
  for (const inv of invoices) {
    for (const line of inv.lines) {
      invTxns.push({
        id: `IT${String(itN++).padStart(3, '0')}`,
        date: inv.date, shipmentId: S, productId: line.productId,
        type: 'sell', fromLocation: inv.carId, toLocation: 'customer',
        qty: line.qty, referenceId: inv.id,
      });
    }
  }

  // ─── Payments ───────────────────────────────────────────────
  const payments: Payment[] = [
    { id: 'PAY00001', date: '2026-02-15', customerId: 'C001', shipmentId: S, bankAccountId: '4', amount: 10000000, notes: 'تحصيل' },
    { id: 'PAY00002', date: '2026-02-17', customerId: 'C002', shipmentId: S, bankAccountId: '5', amount: 3500000, notes: 'تحصيل' },
    { id: 'PAY00003', date: '2026-02-19', customerId: 'C003', shipmentId: S, bankAccountId: '5', amount: 5000000, notes: 'تحصيل' },
    { id: 'PAY00004', date: '2026-02-21', customerId: 'C004', shipmentId: S, bankAccountId: '4', amount: 3000000, notes: 'تحصيل' },
    { id: 'PAY00005', date: '2026-02-23', customerId: 'C007', shipmentId: S, bankAccountId: '5', amount: 2000000, notes: 'تحصيل' },
    { id: 'PAY00006', date: '2026-02-25', customerId: 'C008', shipmentId: S, bankAccountId: '4', amount: 4000000, notes: 'تحصيل' },
    { id: 'PAY00007', date: '2026-03-01', customerId: 'C010', shipmentId: S, bankAccountId: '4', amount: 1500000, notes: 'تحصيل' },
    { id: 'PAY00008', date: '2026-03-05', customerId: 'C003', shipmentId: S, bankAccountId: '5', amount: 1500000, notes: 'تحصيل' },
  ];

  // ─── Expenses ───────────────────────────────────────────────
  const expenses: Expense[] = [
    { id: 'EXP00001', date: '2026-02-10', categoryId: '1',  description: 'وقود — سلفية أحمد ماهر', amount: 500000,  bankAccountId: '5', shipmentId: S, notes: '' },
    { id: 'EXP00002', date: '2026-02-20', categoryId: '10', description: 'رسوم حكومية',             amount: 200000,  bankAccountId: '4', shipmentId: S, notes: '' },
    { id: 'EXP00003', date: '2026-03-01', categoryId: '5',  description: 'صيانة السيارة',            amount: 150000,  bankAccountId: '5', shipmentId: S, notes: '' },
    { id: 'EXP00004', date: '2026-03-05', categoryId: '9',  description: 'منصرفات الطريق',           amount: 100000,  bankAccountId: '5', shipmentId: S, notes: '' },
  ];

  // ─── Salaries ───────────────────────────────────────────────
  const salaries: Salary[] = [
    { id: 'SAL00001', date: '2026-02-28', shipmentId: S, employeeId: '2', type: 'salary', bankAccountId: '5', month: '2026-02', amount: 2500000, notes: 'راتب شهر 2' },
    { id: 'SAL00002', date: '2026-02-28', shipmentId: S, employeeId: '1', type: 'salary', bankAccountId: '4', month: '2026-02', amount: 900000,  notes: 'راتب شهر 2' },
    { id: 'SAL00003', date: '2026-02-28', shipmentId: S, employeeId: '4', type: 'salary', bankAccountId: '5', month: '2026-02', amount: 800000,  notes: 'راتب شهر 2' },
  ];

  // ─── General Transfers (drawings only) ──────────────────────
  const generalTransfers: GeneralTransfer[] = [
    {
      id: 'GT00001', date: '2026-03-05', description: 'منصرفات عصام',
      shipmentId: S, partnerId: '1', transferType: 'drawings',
      amountSDG: 940000, exchangeRate: 940, amountSAR: 1000,
      splits: [{ bankAccountId: '4', amount: 940000 }],
    },
    {
      id: 'GT00002', date: '2026-03-05', description: 'منصرفات محمد مدثر',
      shipmentId: S, partnerId: '2', transferType: 'drawings',
      amountSDG: 470000, exchangeRate: 940, amountSAR: 500,
      splits: [{ bankAccountId: '5', amount: 470000 }],
    },
  ];

  // ─── Ledger entries ─────────────────────────────────────────
  const ledger: LedgerEntry[] = [];
  let li = 1;
  const led = (
    date: string, toAccount: string, desc: string,
    amtIn: number, amtOut: number,
    src: LedgerEntry['sourceModule'], linkedId: string,
  ): LedgerEntry => ({
    id: `LED${String(li++).padStart(5, '0')}`, date, toAccount,
    description: desc, amountIn: amtIn, amountOut: amtOut,
    sourceModule: src, linkedId, shipmentId: S,
  });

  // Cash-sale ledger (money IN to bank)
  for (const i of invoices) {
    if (i.paymentType === 'cash' && i.bankAccountId) {
      ledger.push(led(i.date, i.bankAccountId, `بيع نقدي — ${i.id}`, i.total, 0, 'sale_cash', i.id));
    }
  }
  // Payment ledger (money IN to bank)
  const custName = (id: string) => customers.find(c => c.id === id)?.name || '';
  for (const p of payments) {
    ledger.push(led(p.date, p.bankAccountId, `تحصيل من ${custName(p.customerId)}`, p.amount, 0, 'payment', p.id));
  }
  // Expense ledger (money OUT of bank)
  for (const e of expenses) {
    ledger.push(led(e.date, e.bankAccountId, e.description, 0, e.amount, 'expense', e.id));
  }
  // Salary ledger (money OUT of bank)
  const empNames: Record<string, string> = { '1': 'أحمد ماهر', '2': 'حسن', '4': 'احمد جبرة' };
  for (const s of salaries) {
    ledger.push(led(s.date, s.bankAccountId, `راتب ${empNames[s.employeeId] || ''}`, 0, s.amount, 'salary', s.id));
  }
  // General-transfer ledger (money OUT of bank)
  for (const gt of generalTransfers) {
    for (const sp of gt.splits) {
      ledger.push(led(gt.date, sp.bankAccountId, gt.description, 0, sp.amount, 'general_transfer', gt.id));
    }
  }

  // ─── Full AppState ──────────────────────────────────────────
  return {
    language: 'ar',
    userRole: 'manager',
    exchangeRate: 940,
    managementFeePercent: 20,
    managementFeeRecipientId: '1',
    products: [
      { id: '1', name: 'هوت دوق' }, { id: '2', name: 'نجتس' },
      { id: '3', name: 'نجتس جبنة' }, { id: '4', name: 'نجتس المرح' },
      { id: '5', name: 'بطاطس' }, { id: '6', name: 'جوافة' },
      { id: '7', name: 'مانجو' }, { id: '8', name: 'ذرة حلوة' },
      { id: '9', name: 'سمك فيليه' }, { id: '10', name: 'بيرقر لحمة' },
      { id: '11', name: 'اصابع سمك' }, { id: '12', name: 'اصابع دجاج' },
      { id: '13', name: 'شيش طاوق' }, { id: '14', name: 'خضار' },
      { id: '15', name: 'موزاريلا' }, { id: '16', name: 'مسحب رويال' },
    ],
    salespeople: [
      { id: '1', name: 'أحمد ماهر' }, { id: '2', name: 'حسن' },
      { id: '3', name: 'عصام خليل' }, { id: '4', name: 'السبكي' },
      { id: '5', name: 'امريكانا' },
    ],
    cities: [
      { id: '1', name: 'بورتسودان' }, { id: '2', name: 'كسلا' },
      { id: '3', name: 'عطبرة' }, { id: '4', name: 'القضارف' },
      { id: '5', name: 'حلفا الجديدة' }, { id: '6', name: 'مدني' },
      { id: '7', name: 'شندي' }, { id: '8', name: 'امدرمان' },
      { id: '9', name: 'الخرطوم' },
    ],
    cars: [
      { id: '1', name: 'شرق' }, { id: '2', name: 'شمال' }, { id: '3', name: 'بورتسودان' },
    ],
    bankAccounts: [
      { id: '1', name: 'الخزينة', transferFee: 0 },
      { id: '2', name: 'فوري', transferFee: 0 },
      { id: '3', name: 'اوكاش', transferFee: 0 },
      { id: '4', name: 'عصام(بنكك)', transferFee: 0 },
      { id: '5', name: 'حسن(بنكك)', transferFee: 0 },
    ],
    shipments: [
      { id: '1', name: 'الرسالة12', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
      { id: '2', name: 'الرسالة13', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
      { id: '3', name: 'الرسالة14', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
      { id: '4', name: 'الرسالة15', isActive: true, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
    ],
    employees: [
      { id: '1', name: 'أحمد ماهر' }, { id: '2', name: 'حسن' },
      { id: '3', name: 'عصام خليل' }, { id: '4', name: 'احمد جبرة' },
      { id: '5', name: 'ادريس' }, { id: '6', name: 'السبكي' },
    ],
    partners: [
      { id: '1', name: 'عصام', isOperatingPartner: true },
      { id: '2', name: 'محمد مدثر', isOperatingPartner: true },
      { id: '5', name: 'الأهل', isOperatingPartner: false },
      { id: '6', name: 'د.نزار', isOperatingPartner: false },
      { id: '7', name: 'حسام', isOperatingPartner: false },
      { id: '8', name: 'مازن', isOperatingPartner: false },
      { id: '9', name: 'جبرة', isOperatingPartner: false },
    ],
    expenseCategories: [
      { id: '1', name: 'وقود' }, { id: '2', name: 'راتب' },
      { id: '3', name: 'سلفيات' }, { id: '4', name: 'صيانة عامة' },
      { id: '5', name: 'صيانة السيارة' }, { id: '6', name: 'الكله' },
      { id: '7', name: 'مستلزمات المكتب' }, { id: '8', name: 'الأتعاب' },
      { id: '9', name: 'منصرفات الطريق' }, { id: '10', name: 'رسوم حكومية' },
      { id: '11', name: 'ضرائب' }, { id: '12', name: 'البيت' },
      { id: '13', name: 'علاج' }, { id: '14', name: 'خصومات البيع' },
      { id: '15', name: 'حوافز' }, { id: '16', name: 'مصروفات اسبوعية' },
    ],
    customers,
    inventoryTransactions: invTxns,
    invoices,
    payments,
    expenses,
    salaries,
    generalTransfers,
    accountTransfers: [],
    ledger,
    savedSettlements: [],
    capitalContributions,
    settlementResults: {},
    shipmentTransfers: [],
    roles: [],
    users: [],
    currentUser: null,
  };
}
