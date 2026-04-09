const fs = require('fs');
const path = require('path');

const SOURCE = process.argv[2] || path.join(process.cwd(), 'migration_output.json');
const OUT_DIR = process.argv[3] || path.join(process.cwd(), 'migration_review');
const SECTIONS_DIR = path.join(OUT_DIR, 'sections');
const WARNINGS_PATH = path.join(path.dirname(SOURCE), 'migration_warnings.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function sumBy(items, getter) {
  return items.reduce((sum, item) => sum + (Number(getter(item)) || 0), 0);
}

function sectionFileName(name) {
  return `${name}.json`;
}

if (!fs.existsSync(SOURCE)) {
  console.error(`Source file not found: ${SOURCE}`);
  process.exit(1);
}

const state = readJson(SOURCE);
const warnings = fs.existsSync(WARNINGS_PATH) ? readJson(WARNINGS_PATH) : null;
const generatedAt = new Date().toISOString();

const inventoryTransactions = Array.isArray(state.inventoryTransactions) ? state.inventoryTransactions : [];
const invoices = Array.isArray(state.invoices) ? state.invoices : [];
const payments = Array.isArray(state.payments) ? state.payments : [];
const expenses = Array.isArray(state.expenses) ? state.expenses : [];
const salaries = Array.isArray(state.salaries) ? state.salaries : [];
const generalTransfers = Array.isArray(state.generalTransfers) ? state.generalTransfers : [];
const ledger = Array.isArray(state.ledger) ? state.ledger : [];

const inventoryReceives = inventoryTransactions.filter((tx) => tx.type === 'receive');
const inventorySells = inventoryTransactions.filter((tx) => tx.type === 'sell');

const sections = {
  customers: {
    description: 'Customer master data from the old workbook.',
    state: { customers: state.customers || [] },
    summary: {
      customers: Array.isArray(state.customers) ? state.customers.length : 0,
    },
  },
  inventory_receives: {
    description: 'Purchase receipts only. This excludes sales-related stock movements.',
    state: { inventoryTransactions: inventoryReceives },
    summary: {
      transactions: inventoryReceives.length,
      totalQty: sumBy(inventoryReceives, (tx) => tx.qty),
    },
  },
  sales: {
    description: 'Invoices plus their sell-side inventory transactions.',
    state: { invoices, inventoryTransactions: inventorySells },
    summary: {
      invoices: invoices.length,
      invoiceLines: sumBy(invoices, (inv) => Array.isArray(inv.lines) ? inv.lines.length : 0),
      totalSales: sumBy(invoices, (inv) => inv.total),
      sellTransactions: inventorySells.length,
      totalQty: sumBy(inventorySells, (tx) => tx.qty),
    },
  },
  payments: {
    description: 'Customer payment records.',
    state: { payments },
    summary: {
      payments: payments.length,
      totalAmount: sumBy(payments, (item) => item.amount),
    },
  },
  expenses: {
    description: 'Expense records from the old workbook.',
    state: { expenses },
    summary: {
      expenses: expenses.length,
      totalAmount: sumBy(expenses, (item) => item.amount),
    },
  },
  salaries: {
    description: 'Salary and allowance records.',
    state: { salaries },
    summary: {
      salaries: salaries.length,
      totalAmount: sumBy(salaries, (item) => item.amount),
    },
  },
  general_transfers: {
    description: 'Partner and investor transfer records.',
    state: { generalTransfers },
    summary: {
      transfers: generalTransfers.length,
      totalAmountSDG: sumBy(generalTransfers, (item) => item.amountSDG),
      totalAmountSAR: sumBy(generalTransfers, (item) => item.amountSAR),
    },
  },
  ledger: {
    description: 'Ledger entries generated from the imported transactional data.',
    state: { ledger },
    summary: {
      entries: ledger.length,
      totalIn: sumBy(ledger, (item) => item.amountIn),
      totalOut: sumBy(ledger, (item) => item.amountOut),
    },
  },
};

const baseState = {
  ...state,
  customers: [],
  inventoryTransactions: [],
  invoices: [],
  payments: [],
  expenses: [],
  salaries: [],
  generalTransfers: [],
  ledger: [],
};

const plan = {
  generatedAt,
  source: SOURCE,
  notes: [
    'Review each section file before applying it.',
    'Set mode to replace when the reviewed file should overwrite the matching data in Supabase.',
    'Set mode to append when you want upsert-only behavior with no delete step.',
    'Apply ledger last, after the transactional sections are confirmed.',
  ],
  sections: Object.keys(sections).map((name) => ({
    name,
    file: path.join('sections', sectionFileName(name)),
    enabled: false,
    mode: 'replace',
    summary: sections[name].summary,
  })),
};

const summary = {
  generatedAt,
  source: SOURCE,
  warningsFile: fs.existsSync(WARNINGS_PATH) ? WARNINGS_PATH : null,
  sections: Object.entries(sections).map(([name, value]) => ({
    name,
    description: value.description,
    file: path.join('sections', sectionFileName(name)),
    summary: value.summary,
  })),
  warnings: warnings ? warnings.grouped : null,
};

ensureDir(SECTIONS_DIR);
writeJson(path.join(OUT_DIR, 'base_state.json'), baseState);
writeJson(path.join(OUT_DIR, 'plan.json'), plan);
writeJson(path.join(OUT_DIR, 'summary.json'), summary);

for (const [name, value] of Object.entries(sections)) {
  writeJson(path.join(SECTIONS_DIR, sectionFileName(name)), {
    section: name,
    generatedAt,
    description: value.description,
    summary: value.summary,
    state: value.state,
  });
}

console.log(`Review package created in ${OUT_DIR}`);
console.log('Files:');
console.log(`  - ${path.join(OUT_DIR, 'summary.json')}`);
console.log(`  - ${path.join(OUT_DIR, 'plan.json')}`);
console.log(`  - ${path.join(OUT_DIR, 'base_state.json')}`);
console.log(`  - ${SECTIONS_DIR}`);
