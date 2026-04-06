/**
 * ═══════════════════════════════════════════════════════════════
 *  Data Migration Script — Old Excel (نظام امريكانا) → App JSON
 * ═══════════════════════════════════════════════════════════════
 *
 * Usage:
 *   1. node migrate_excel.js
 *   2. A file "migration_output.json" will be created
 *   3. Open your app in the browser
 *   4. Open DevTools Console (F12)
 *   5. Paste and run:
 *        const raw = await fetch('/migration_output.json').then(r => r.text())
 *        localStorage.setItem('astreda_erp_state', raw)
 *        location.reload()
 *   OR copy the JSON content and run:
 *        localStorage.setItem('astreda_erp_state', `<paste JSON here>`)
 *        location.reload()
 */

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const EXCEL_PATH = 'C:/Users/Ammar/Downloads/نظام امريكانا (1).xlsm';

// ═══════════════════════════════════════════════════════════════
//  MASTER DATA  (IDs must match what is already in the app)
// ═══════════════════════════════════════════════════════════════

const PRODUCTS = [
  { id: '1',  name: 'هوت دوق' },        { id: '2',  name: 'نجتس' },
  { id: '3',  name: 'نجتس جبنة' },      { id: '4',  name: 'نجتس المرح' },
  { id: '5',  name: 'بطاطس' },          { id: '6',  name: 'جوافة' },
  { id: '7',  name: 'مانجو' },          { id: '8',  name: 'ذرة حلوة' },
  { id: '9',  name: 'سمك فيليه' },      { id: '10', name: 'بيرقر لحمة' },
  { id: '11', name: 'اصابع سمك' },      { id: '12', name: 'اصابع دجاج' },
  { id: '13', name: 'شيش طاوق' },       { id: '14', name: 'خضار' },
  { id: '15', name: 'موزاريلا' },       { id: '16', name: 'مسحب رويال' },
  // ── New products from Excel ──
  { id: '17', name: 'بيرقرفراخ' },      { id: '18', name: 'صدور' },
  { id: '19', name: 'زبدة' },           { id: '20', name: 'منترا' },
  { id: '21', name: 'ماريتا' },         { id: '22', name: 'ملوخية' },
  { id: '23', name: 'استربس' },         { id: '24', name: 'نجتس كرتون' },
  { id: '25', name: 'كفتة' },           { id: '26', name: 'افخاذ' },
  { id: '27', name: 'رمان' },           { id: '28', name: 'بامية' },
];

const PRODUCT_MAP = {};
PRODUCTS.forEach(p => { PRODUCT_MAP[p.name] = p.id; });
// Spelling variants
Object.assign(PRODUCT_MAP, {
  'ذره حلوة':   '8',
  'بيرقر فراخ': '17',
});

// ── Salespersons ──────────────────────────────────────────────
const SALESPEOPLE = [
  { id: '1', name: 'أحمد ماهر' }, { id: '2', name: 'حسن' },
  { id: '3', name: 'عصام خليل' }, { id: '4', name: 'السبكي' },
  { id: '5', name: 'امريكانا' },
];

function normSP(raw) {
  if (!raw) return null;
  const n = clean(raw).replace(/["«»]/g, '').replace(/\s+/g, ' ');
  if (n === 'حسن')     return '2';
  if (n === 'امريكانا') return '5';
  if (n.startsWith('أحمد ماهر') || n.startsWith('احمد ماهر')) return '1';
  if (n.startsWith('عصام خليل') || n === 'عصام') return '3';
  if (n.startsWith('السبكي')) return '4';
  warn('salesperson', raw); return '1';
}

// ── Cities ────────────────────────────────────────────────────
const CITIES = [
  { id: '1',  name: 'بورتسودان' },    { id: '2',  name: 'كسلا' },
  { id: '3',  name: 'عطبرة' },        { id: '4',  name: 'القضارف' },
  { id: '5',  name: 'حلفا الجديدة' }, { id: '6',  name: 'مدني' },
  { id: '7',  name: 'شندي' },         { id: '8',  name: 'امدرمان' },
  { id: '9',  name: 'الخرطوم' },      { id: '10', name: 'الخرطوم بحري' },
];

const CITY_MAP = {
  'بورتسودان': '1', 'بورتسـودان': '1',
  'كسلا': '2',
  'عطبرة': '3',
  'القضارف': '4',
  'حلفا الجديدة': '5', 'حلفـا الجديدة': '5', 'حلفا': '5', 'حلفــا': '5',
  'مدني': '6',
  'شندي': '7',
  'امدرمان': '8',
  'الخرطوم': '9',
  'الخرطوم بحري': '10',
};

function normCity(raw) {
  if (!raw) return '1';
  const n = clean(raw).replace(/"/g, '');
  if (CITY_MAP[n]) return CITY_MAP[n];
  for (const [k, v] of Object.entries(CITY_MAP)) {
    if (n.includes(k) || k.includes(n)) return v;
  }
  warn('city', raw); return '1';
}

// ── Cars ──────────────────────────────────────────────────────
const CARS = [
  { id: '1', name: 'شرق' }, { id: '2', name: 'شمال' }, { id: '3', name: 'بورتسودان' },
];

const CAR_MAP = {
  'شرق': '1', 'الشرق': '1',
  'شمال': '2', 'الشمال': '2',
  'بورتسودان': '3', 'بورتسـودان': '3',
};

function normCar(raw) {
  if (!raw) return '1';
  const n = clean(raw);
  if (CAR_MAP[n]) return CAR_MAP[n];
  warn('car', raw); return '1';
}

// ── Bank Accounts ─────────────────────────────────────────────
const BANK_ACCOUNTS = [
  { id: '1', name: 'الخزينة',     transferFee: 0 },
  { id: '2', name: 'فوري',        transferFee: 0 },
  { id: '3', name: 'اوكاش',       transferFee: 0 },
  { id: '4', name: 'عصام(بنكك)',  transferFee: 0 },
  { id: '5', name: 'حسن(بنكك)',   transferFee: 0 },
];

/** Strip Arabic tatweel (ـ U+0640) and normalise whitespace */
function clean(s) {
  return (s || '').toString().replace(/\u0640/g, '').trim();
}
/** Safe string extract from a cell value */
function str(v) { return clean(v); }

function normBank(raw) {
  if (!raw) return null;
  const n = clean(raw);
  if (n.includes('خزين'))  return '1';
  if (n.includes('فوري'))  return '2';
  if (n.includes('اوكاش')) return '3';
  if (n.includes('عصام'))  return '4';
  if (n.includes('حسن'))   return '5';
  warn('bank', raw); return null;
}

// ── Shipments ─────────────────────────────────────────────────
const SHIPMENTS = [
  { id: '1', name: 'الرسالة12', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
  { id: '2', name: 'الرسالة13', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
  { id: '3', name: 'الرسالة14', isActive: false, shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
  { id: '4', name: 'الرسالة15', isActive: true,  shareholdersPercent: 40, managementFeePercent: 20, managementFeeRecipientId: '1' },
];

const SHIPMENT_MAP = {
  'الرسالة12': '1', 'الرسالة13': '2',
  'الرسالة14': '3', 'الرسالة15': '4',
};

// ── Employees ─────────────────────────────────────────────────
const EMPLOYEES = [
  { id: '1', name: 'أحمد ماهر' }, { id: '2', name: 'حسن' },
  { id: '3', name: 'عصام خليل' }, { id: '4', name: 'احمد جبرة' },
  { id: '5', name: 'ادريس' },     { id: '6', name: 'السبكي' },
  { id: '7', name: 'عمار' },      { id: '8', name: 'مريم' },
];

const EMPLOYEE_MAP = {
  'أحمد ماهر': '1', 'احمد ماهر': '1',
  'حسن': '2',       'عصام خليل': '3',
  'احمد جبرة': '4', 'ادريس': '5',
  'السبكي': '6',    'عمار': '7',
  'مريم': '8',
};

// ── Partners (investors / shareholders) ───────────────────────
const PARTNERS = [
  { id: '1',  name: 'عصام',       isOperatingPartner: true  },
  { id: '2',  name: 'محمد مدثر',  isOperatingPartner: true  },
  { id: '5',  name: 'الأهل',      isOperatingPartner: false },
  { id: '6',  name: 'د.نزار',     isOperatingPartner: false },
  { id: '7',  name: 'حسام',       isOperatingPartner: false },
  { id: '8',  name: 'مازن',       isOperatingPartner: false },
  { id: '9',  name: 'جبرة',       isOperatingPartner: false },
  { id: '10', name: 'حمادة كنه',  isOperatingPartner: false },
  { id: '11', name: 'وائل',       isOperatingPartner: false },
  { id: '12', name: 'عمر',        isOperatingPartner: false },
  { id: '13', name: 'هيثم',       isOperatingPartner: false },
];

const PARTNER_MAP = {
  'عصام': '1', 'عصام ': '1',
  'محمد مدثر': '2',
  'الأهل': '5', 'الاهل': '5',
  'د.نزار': '6',
  'حسام': '7',
  'مازن': '8',
  'جبرة': '9', 'احمد جبرة': '9',
  'حمادة كنه': '10',
  'وائل': '11',
  'عمر': '12',
  'هيثم': '13',
};

// Beneficiaries to SKIP in general transfers (non-investor)
const SKIP_PARTNERS = new Set(['العربات', 'تحاويل عامه', 'الارباح', '']);

// ── Expense Categories ────────────────────────────────────────
const EXPENSE_CATEGORIES = [
  { id: '1',  name: 'وقود' },              { id: '2',  name: 'راتب' },
  { id: '3',  name: 'سلفيات' },            { id: '4',  name: 'صيانة عامة' },
  { id: '5',  name: 'صيانة السيارة' },     { id: '6',  name: 'الكله' },
  { id: '7',  name: 'مستلزمات المكتب' },   { id: '8',  name: 'الأتعاب' },
  { id: '9',  name: 'منصرفات الطريق' },    { id: '10', name: 'رسوم حكومية' },
  { id: '11', name: 'ضرائب' },             { id: '12', name: 'البيت' },
  { id: '13', name: 'علاج' },              { id: '14', name: 'خصومات البيع' },
  { id: '15', name: 'حوافز' },             { id: '16', name: 'مصروفات اسبوعية' },
  // New from Excel
  { id: '17', name: 'ارساليات' },
  { id: '18', name: 'ايجار' },
  { id: '19', name: 'تصفية' },
];

const EXPENSE_CAT_MAP = {
  'وقود': '1', 'وقــود': '1',
  'راتب': '2',
  'سلفيات': '3',
  'صيانة عامة': '4',
  'صيانة السيارة': '5',
  'الكله': '6',
  'مستلزمات المكتب': '7',
  'الأتعاب': '8', 'الاتعاب': '8',
  'منصرفات الطريق': '9',
  'رسوم حكومية': '10',
  'ضرائب': '11',
  'البيت': '12', 'الميز': '12',        // الميز = food/meals → البيت
  'علاج': '13',
  'خصومات البيع': '14',
  'حوافز': '15',
  'مصروفات اسبوعية': '16', 'مصروفات': '16', 'نثريات': '16',
  'ارساليات': '17',
  'ايجار': '18', 'ايــجار': '18',
  'تصفية': '19',
};

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

const warnings = [];
function warn(type, value) {
  warnings.push({ type, value });
}

/** Excel serial date → 'YYYY-MM-DD' */
function excelDate(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel counts from 1899-12-30 (with the 1900 leap-year bug accounted for)
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function sheetRows(name) {
  const ws = wb.Sheets[name];
  if (!ws) { console.error('  ✗ Sheet not found:', name); return []; }
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
}

let _itN = 1;
function nextIT() { return `IT${String(_itN++).padStart(5, '0')}`; }

let _ledN = 1;
function nextLed() { return `LED${String(_ledN++).padStart(5, '0')}`; }

// ═══════════════════════════════════════════════════════════════
//  LOAD WORKBOOK
// ═══════════════════════════════════════════════════════════════

console.log('📂  Reading:', EXCEL_PATH);
const wb = XLSX.readFile(EXCEL_PATH);
console.log('✅  Sheets loaded:', wb.SheetNames.length, '\n');

// ═══════════════════════════════════════════════════════════════
//  1. CUSTOMERS
// ═══════════════════════════════════════════════════════════════
console.log('👥  Parsing customers (العملاء)...');

const customers = [];
let cIdx = 1;
const CUSTOMER_MAP = {}; // name → id

const custRows = sheetRows('العملاء').slice(1);
for (const r of custRows) {
  const name = str(r[0]);
  if (!name) continue;

  const id = `C${String(cIdx++).padStart(3, '0')}`;
  const cityId = normCity(r[1]);
  const spId   = normSP(r[2]);
  const carId  = normCar(r[3]);
  const phone  = str(r[6]) || '';
  const owner  = str(r[7]) || '';
  const notes  = str(r[8]) || '';

  customers.push({
    id, name, cityId, salespersonId: spId, carId,
    phone,
    notes: [owner, notes].filter(Boolean).join(' — '),
    debt: 0,
  });
  CUSTOMER_MAP[name] = id;
}

// Add customers found in sales/payments but missing from العملاء
const EXTRA_CUSTOMERS = [
  { name: 'اوماك ماركت',       cityId: '1', salespersonId: '2', carId: '3' },
  { name: 'جدو ماركت القضارف', cityId: '4', salespersonId: '1', carId: '1' },
];
for (const ec of EXTRA_CUSTOMERS) {
  if (!CUSTOMER_MAP[ec.name]) {
    const id = `C${String(cIdx++).padStart(3, '0')}`;
    customers.push({ id, name: ec.name, cityId: ec.cityId,
      salespersonId: ec.salespersonId, carId: ec.carId,
      phone: '', notes: '', debt: 0 });
    CUSTOMER_MAP[ec.name] = id;
  }
}

console.log(`  ✅  ${customers.length} customers`);

function findCustomer(raw) {
  if (!raw) return null;
  const n = raw.toString().trim();
  if (CUSTOMER_MAP[n]) return CUSTOMER_MAP[n];
  // Fuzzy: substring match
  const keys = Object.keys(CUSTOMER_MAP);
  const m = keys.find(k => k.includes(n) || n.includes(k));
  if (m) return CUSTOMER_MAP[m];
  warn('customer', raw);
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  2. INVENTORY RECEIVES
// ═══════════════════════════════════════════════════════════════
console.log('📦  Parsing inventory receives (المشتريات)...');

const inventoryTransactions = [];

for (const r of sheetRows('المشتريات').slice(1)) {
  const date       = excelDate(r[0]);
  const shipName   = str(r[1]);
  const prodName   = str(r[2]);
  const qty        = Number(r[3]) || 0;

  if (!date || !shipName || !prodName || !qty) continue;

  const shipmentId = SHIPMENT_MAP[shipName];
  const productId  = PRODUCT_MAP[prodName];

  if (!shipmentId) { warn('shipment', shipName); continue; }
  if (!productId)  { warn('product', prodName);  continue; }

  inventoryTransactions.push({
    id: nextIT(), date, shipmentId, productId,
    type: 'receive',
    fromLocation: 'supplier',
    toLocation: 'warehouse',
    qty,
  });
}

console.log(`  ✅  ${inventoryTransactions.length} receive transactions`);

// ═══════════════════════════════════════════════════════════════
//  3. SALES → INVOICES + SELL TRANSACTIONS
// ═══════════════════════════════════════════════════════════════
console.log('🧾  Parsing sales (المبيعات)...');

// Invoices to skip entirely (test data or inter-shipment transfers)
const SKIP_INVOICES = new Set(['INV0001', 'INV0142']);

const invoiceMap = new Map();
let skippedLines = 0;

for (const r of sheetRows('المبيعات').slice(1)) {
  const invId    = str(r[10]);
  if (!invId || SKIP_INVOICES.has(invId)) { skippedLines++; continue; }

  const prodName = str(r[6]);
  // Skip inter-shipment goods lines
  if (!prodName || prodName.includes('بضاعة')) { skippedLines++; continue; }

  const unitPrice = Number(r[8]) || 0;
  const qty       = Number(r[7]) || 0;
  // Skip zero-price lines
  if (unitPrice === 0 || qty === 0) { skippedLines++; continue; }

  const productId = PRODUCT_MAP[prodName];
  if (!productId) { warn('product in sales', prodName); skippedLines++; continue; }

  const shipName = str(r[5]);
  const shipmentId = SHIPMENT_MAP[shipName];
  if (!shipmentId) { warn('shipment in sales', shipName); skippedLines++; continue; }

  if (!invoiceMap.has(invId)) {
    invoiceMap.set(invId, {
      id: invId,
      date:         excelDate(r[0]),
      customerId:   findCustomer(r[1]) || '',
      salespersonId: normSP(r[2]) || '1',
      cityId:       normCity(r[3]),
      carId:        normCar(r[4]),
      shipmentId,
      lines: [],
      total: 0,
      paymentType: 'credit',   // All treated as credit; cash collected via payments sheet
    });
  }

  const line = { productId, qty, unitPrice, total: qty * unitPrice };
  const inv  = invoiceMap.get(invId);
  inv.lines.push(line);
  inv.total += line.total;
}

const invoices = [...invoiceMap.values()].filter(inv => inv.lines.length > 0);
console.log(`  ✅  ${invoices.length} invoices  (${skippedLines} lines skipped)`);

// Generate sell inventory transactions (one per invoice line)
for (const inv of invoices) {
  for (const line of inv.lines) {
    inventoryTransactions.push({
      id: nextIT(),
      date: inv.date,
      shipmentId: inv.shipmentId,
      productId: line.productId,
      type: 'sell',
      fromLocation: inv.carId,
      toLocation: 'customer',
      qty: line.qty,
      referenceId: inv.id,
      invoiceId: inv.id,
    });
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. PAYMENTS
// ═══════════════════════════════════════════════════════════════
console.log('💰  Parsing payments (المدفوعات)...');

const payments = [];

for (const r of sheetRows('المدفوعات').slice(1)) {
  const payId    = str(r[7]);
  const date     = excelDate(r[0]);
  const custName = str(r[1]);
  const amount   = Number(r[6]) || 0;
  const shipName = str(r[4]);
  const bankName = str(r[5]);

  if (!payId || !date || !amount) continue;

  const shipmentId    = SHIPMENT_MAP[shipName];
  const bankAccountId = normBank(bankName);

  if (!shipmentId)    { warn('shipment in payments', shipName);  continue; }
  if (!bankAccountId) { warn('bank in payments', bankName);      continue; }

  payments.push({
    id: payId,
    date,
    customerId:    findCustomer(custName) || '',
    salespersonId: normSP(r[2]) || undefined,
    cityId:        normCity(r[3]) || undefined,
    shipmentId,
    bankAccountId,
    amount,
    notes: 'تحصيل',
  });
}

console.log(`  ✅  ${payments.length} payments`);

// ═══════════════════════════════════════════════════════════════
//  5. EXPENSES
// ═══════════════════════════════════════════════════════════════
console.log('💸  Parsing expenses (المصروفات)...');

const expenses = [];

for (const r of sheetRows('المصروفات').slice(1)) {
  const expId   = str(r[8]);
  const date    = excelDate(r[0]);
  const amount  = Number(r[3]) || 0;

  if (!expId || !date || !amount) continue;

  const catName  = str(r[1]);
  const desc     = str(r[2]) || catName;
  const bankName = str(r[4]);
  const shipName = str(r[5]);
  const carName  = str(r[6]);
  const notes    = str(r[7]) || '';

  const shipmentId    = SHIPMENT_MAP[shipName];
  const bankAccountId = normBank(bankName);

  if (!shipmentId)    { warn('shipment in expenses', shipName); continue; }
  if (!bankAccountId) { warn('bank in expenses', bankName);     continue; }

  const categoryId = EXPENSE_CAT_MAP[catName] || '16'; // fallback: مصروفات اسبوعية
  if (!EXPENSE_CAT_MAP[catName]) warn('expense category', catName);

  const carId = (carName && CAR_MAP[carName]) ? CAR_MAP[carName] : undefined;

  expenses.push({
    id: expId, date, categoryId, description: desc, amount,
    bankAccountId, shipmentId,
    carId,
    notes,
    settled: false,
  });
}

console.log(`  ✅  ${expenses.length} expenses`);

// ═══════════════════════════════════════════════════════════════
//  6. SALARIES
// ═══════════════════════════════════════════════════════════════
console.log('👔  Parsing salaries (الموظفين)...');

const salaries = [];

for (const r of sheetRows('الموظفين').slice(1)) {
  const salId  = str(r[8]);
  const date   = excelDate(r[0]);
  const amount = Number(r[6]) || 0;

  if (!salId || !date || !amount) continue;

  const shipName = str(r[1]);
  const empName  = str(r[2]);
  const typeAr   = str(r[3]);
  const bankName = str(r[4]);
  const monthNum = Number(r[5]);
  const notes    = str(r[7]) || '';

  const shipmentId    = SHIPMENT_MAP[shipName];
  const bankAccountId = normBank(bankName);
  const employeeId    = EMPLOYEE_MAP[empName];

  if (!shipmentId)    { warn('shipment in salaries', shipName); continue; }
  if (!bankAccountId) { warn('bank in salaries', bankName);     continue; }
  if (!employeeId)    { warn('employee', empName);              continue; }

  const type = typeAr === 'مرتب' ? 'salary' : 'allowance';

  // Derive YYYY-MM: use monthNum if 1–12, else derive from date
  const yr   = date.slice(0, 4);
  const month = (monthNum >= 1 && monthNum <= 12)
    ? `${yr}-${String(monthNum).padStart(2, '0')}`
    : date.slice(0, 7);

  salaries.push({ id: salId, date, shipmentId, employeeId, type, bankAccountId, month, amount, notes });
}

console.log(`  ✅  ${salaries.length} salary records`);

// ═══════════════════════════════════════════════════════════════
//  7. GENERAL TRANSFERS  (investors / partners only)
// ═══════════════════════════════════════════════════════════════
console.log('🔄  Parsing general transfers (التحاويل_العامة)...');

const generalTransfers = [];

for (const r of sheetRows('التحاويل_العامة').slice(1)) {
  const date       = excelDate(r[0]);
  const desc       = str(r[1]);
  const shipName   = str(r[2]);
  const beneficiary = str(r[3]);

  if (!date || !desc || !beneficiary) continue;
  if (SKIP_PARTNERS.has(beneficiary)) continue;    // non-investor — skip

  const trId = str(r[13]);
  if (!trId) continue;

  const hassan      = Number(r[4])  || 0;   // حسن(بنكك)
  const essam       = Number(r[5])  || 0;   // عصام(بنكك)
  const fawri       = Number(r[6])  || 0;   // فوري
  const okash       = Number(r[7])  || 0;   // اوكاش
  const treasury    = Number(r[8])  || 0;   // الخزينة
  const totalSDG    = Number(r[9])  || 0;
  const exchRate    = Number(r[10]) || 1;
  const totalSAR    = Number(r[11]) || 0;
  const notes       = str(r[12]) || '';

  if (!totalSDG) continue;

  const shipmentId = SHIPMENT_MAP[shipName];
  if (!shipmentId) { warn('shipment in transfers', shipName); continue; }

  const partnerId = PARTNER_MAP[beneficiary];
  if (!partnerId) { warn('partner', beneficiary); continue; }

  const splits = [];
  if (hassan   > 0) splits.push({ bankAccountId: '5', amount: hassan });
  if (essam    > 0) splits.push({ bankAccountId: '4', amount: essam });
  if (fawri    > 0) splits.push({ bankAccountId: '2', amount: fawri });
  if (okash    > 0) splits.push({ bankAccountId: '3', amount: okash });
  if (treasury > 0) splits.push({ bankAccountId: '1', amount: treasury });

  if (splits.length === 0) continue;

  // Map description → transferType
  let transferType = 'drawings';
  if (desc === 'رؤوس اموال')  transferType = 'capital';
  else if (desc === 'ارباح')   transferType = 'profit_payment';
  else if (desc === 'تمويل')   transferType = 'capital_contribution';

  generalTransfers.push({
    id: trId,
    date,
    description: notes || desc,
    shipmentId,
    partnerId,
    transferType,
    amountSDG: totalSDG,
    exchangeRate: exchRate,
    amountSAR: totalSAR,
    splits,
  });
}

console.log(`  ✅  ${generalTransfers.length} general transfers`);

// ═══════════════════════════════════════════════════════════════
//  8. LEDGER
// ═══════════════════════════════════════════════════════════════
console.log('📒  Generating ledger entries...');

const ledger = [];

function addLed(date, toAccount, desc, amtIn, amtOut, src, linkedId, shipmentId) {
  ledger.push({
    id: nextLed(), date, toAccount, description: desc,
    amountIn: amtIn, amountOut: amtOut,
    sourceModule: src, linkedId, shipmentId,
  });
}

for (const p  of payments)         addLed(p.date,  p.bankAccountId,  `تحصيل من ${customers.find(c=>c.id===p.customerId)?.name||''}`,                          p.amount, 0,         'payment',          p.id,  p.shipmentId);
for (const e  of expenses)         addLed(e.date,  e.bankAccountId,  e.description,                                                                            0,        e.amount,    'expense',          e.id,  e.shipmentId);
for (const s  of salaries)         addLed(s.date,  s.bankAccountId,  `${s.type==='salary'?'راتب':'استحقاق'} ${EMPLOYEES.find(e=>e.id===s.employeeId)?.name||''}`, 0,      s.amount,    'salary',           s.id,  s.shipmentId);
for (const gt of generalTransfers)
  for (const sp of gt.splits)      addLed(gt.date, sp.bankAccountId, gt.description,                                                                           0,        sp.amount,   'general_transfer', gt.id, gt.shipmentId);

console.log(`  ✅  ${ledger.length} ledger entries`);

// ═══════════════════════════════════════════════════════════════
//  9. BUILD STATE & WRITE OUTPUT
// ═══════════════════════════════════════════════════════════════
console.log('\n🏗   Building final app state...');

const state = {
  language: 'ar',
  userRole: 'manager',
  exchangeRate: 1000,
  managementFeePercent: 20,
  managementFeeRecipientId: '1',
  products:             PRODUCTS,
  salespeople:          SALESPEOPLE,
  cities:               CITIES,
  cars:                 CARS,
  bankAccounts:         BANK_ACCOUNTS,
  shipments:            SHIPMENTS,
  employees:            EMPLOYEES,
  partners:             PARTNERS,
  expenseCategories:    EXPENSE_CATEGORIES,
  customers,
  inventoryTransactions,
  invoices,
  payments,
  expenses,
  salaries,
  generalTransfers,
  accountTransfers:     [],
  ledger,
  savedSettlements:     [],
  capitalContributions: [],
  settlementResults:    {},
  shipmentTransfers:    [],
  roles:                [],
  users:                [],
  currentUser:          null,
};

const OUT = path.join(__dirname, 'migration_output.json');
fs.writeFileSync(OUT, JSON.stringify(state));

// ─── Summary ─────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════');
console.log('✅  MIGRATION COMPLETE');
console.log('══════════════════════════════════════════════');
console.log('  Customers              :', customers.length);
console.log('  Inventory transactions :', inventoryTransactions.length);
console.log('  Invoices               :', invoices.length);
console.log('  Payments               :', payments.length);
console.log('  Expenses               :', expenses.length);
console.log('  Salaries               :', salaries.length);
console.log('  General transfers      :', generalTransfers.length);
console.log('  Ledger entries         :', ledger.length);

if (warnings.length) {
  console.log('\n⚠   WARNINGS (' + warnings.length + ') — review these unmapped values:');
  const grouped = {};
  warnings.forEach(w => { grouped[w.type] = grouped[w.type] || new Set(); grouped[w.type].add(w.value); });
  for (const [type, vals] of Object.entries(grouped))
    console.log(`  [${type}]:`, [...vals].join(', '));
}

console.log('\n📄  Output saved to:', OUT);
console.log('\n📌  NEXT STEPS:');
console.log('  1. Open your app in the browser (localhost or your domain)');
console.log('  2. Open DevTools → Console (F12)');
console.log('  3. Paste this command:');
console.log("     fetch('/migration_output.json').then(r=>r.text()).then(d=>{localStorage.setItem('astreda_erp_state',d);location.reload()})");
console.log('     — If that URL does not work, open migration_output.json,');
console.log('       copy its contents, and run:');
console.log("     localStorage.setItem('astreda_erp_state', `<paste here>`); location.reload()");
