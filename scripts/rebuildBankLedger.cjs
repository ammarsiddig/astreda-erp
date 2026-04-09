const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 500;

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(process.cwd(), '.env.local'));
loadDotEnv(path.join(process.cwd(), '.env'));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env or .env.local.');
  process.exit(1);
}

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    skipBalanceUpdate: argv.includes('--skip-balance-update'),
  };
}

async function supabaseRequest(method, tablePath, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${tablePath} failed: ${res.status} ${text}`);
  }

  return res;
}

async function fetchRows(table, select) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch ${table}: ${res.status} ${text}`);
  }

  return res.json();
}

function sumBy(items, getter) {
  return items.reduce((sum, item) => sum + (Number(getter(item)) || 0), 0);
}

function parseJsonField(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function compareByDateThenId(a, b) {
  return String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id));
}

function computeBankBalance(accountId, ledger) {
  return ledger.reduce((balance, entry) => {
    if (entry.toAccount === accountId) {
      balance += Number(entry.amountIn) || 0;
      if (!entry.fromAccount) balance -= Number(entry.amountOut) || 0;
    }
    if (entry.fromAccount === accountId) {
      balance -= Number(entry.amountOut) || 0;
    }
    return balance;
  }, 0);
}

function makeLedgerEntry({ id, date, description, amountIn = 0, amountOut = 0, toAccount, fromAccount, sourceModule, linkedId, referenceId, invoiceId, shipmentId }) {
  return {
    id,
    date,
    fromAccount,
    toAccount,
    description,
    amountIn: Number(amountIn) || 0,
    amountOut: Number(amountOut) || 0,
    sourceModule,
    linkedId,
    referenceId,
    invoiceId,
    shipmentId,
  };
}

function normalizeRows(rows) {
  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) allKeys.add(key);
  }
  return rows.map((row) => {
    const normalized = {};
    for (const key of allKeys) normalized[key] = row[key] !== undefined ? row[key] : null;
    return normalized;
  });
}

async function truncateTable(table, pkField) {
  const listRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${pkField}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`Failed to list ${table}: ${listRes.status} ${text}`);
  }

  const rows = await listRes.json();
  if (!rows.length) return 0;

  let deleted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const ids = batch.map((row) => String(row[pkField]).replace(/"/g, '\\"'));
    const filter = `${pkField}=in.(${ids.map((id) => `"${id}"`).join(',')})`;
    const delRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (!delRes.ok) {
      const text = await delRes.text();
      throw new Error(`Failed to clear ${table}: ${delRes.status} ${text}`);
    }

    deleted += batch.length;
  }

  return deleted;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const [
    bankAccounts,
    customers,
    employees,
    invoices,
    payments,
    expenses,
    salaries,
    generalTransfers,
    accountTransfers,
  ] = await Promise.all([
    fetchRows('bank_accounts', 'id,name,balance'),
    fetchRows('customers', 'id,name'),
    fetchRows('employees', 'id,name'),
    fetchRows('invoices', 'id,date,shipment_id,total,payment_type,bank_account_id'),
    fetchRows('payments', 'id,date,customer_id,shipment_id,bank_account_id,amount,notes'),
    fetchRows('expenses', 'id,date,shipment_id,bank_account_id,amount,description,notes'),
    fetchRows('salaries', 'id,date,shipment_id,employee_id,type,bank_account_id,amount,notes'),
    fetchRows('general_transfers', 'id,date,shipment_id,description,splits'),
    fetchRows('account_transfers', 'id,date,type,from_bank_account_id,to_bank_account_id,amount,transfer_fee,notes'),
  ]);

  const customerNameById = new Map(customers.map((row) => [String(row.id), row.name || '']));
  const employeeNameById = new Map(employees.map((row) => [String(row.id), row.name || '']));
  const knownBankIds = new Set(bankAccounts.map((row) => String(row.id)));
  const unknownBankIds = new Set();
  const ledger = [];

  for (const invoice of invoices) {
    if (invoice.payment_type !== 'cash' || !invoice.bank_account_id) continue;
    const bankId = String(invoice.bank_account_id);
    if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
    ledger.push(makeLedgerEntry({
      id: `LED_SALE_${invoice.id}`,
      date: invoice.date,
      toAccount: bankId,
      description: `فاتورة مبيعات نقدية #${invoice.id}`,
      amountIn: invoice.total,
      sourceModule: 'sale_cash',
      linkedId: invoice.id,
      referenceId: invoice.id,
      invoiceId: invoice.id,
      shipmentId: invoice.shipment_id || null,
    }));
  }

  for (const payment of payments) {
    if (!payment.bank_account_id) continue;
    const bankId = String(payment.bank_account_id);
    if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
    const customerName = customerNameById.get(String(payment.customer_id)) || '';
    ledger.push(makeLedgerEntry({
      id: `LED_PAY_${payment.id}`,
      date: payment.date,
      toAccount: bankId,
      description: customerName ? `تحصيل من ${customerName}` : (payment.notes || `تحصيل ${payment.id}`),
      amountIn: payment.amount,
      sourceModule: 'payment',
      linkedId: payment.id,
      shipmentId: payment.shipment_id || null,
    }));
  }

  for (const expense of expenses) {
    if (!expense.bank_account_id) continue;
    const bankId = String(expense.bank_account_id);
    if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
    ledger.push(makeLedgerEntry({
      id: `LED_EXP_${expense.id}`,
      date: expense.date,
      toAccount: bankId,
      description: expense.description || expense.notes || `مصروف ${expense.id}`,
      amountOut: expense.amount,
      sourceModule: 'expense',
      linkedId: expense.id,
      shipmentId: expense.shipment_id || null,
    }));
  }

  for (const salary of salaries) {
    if (!salary.bank_account_id) continue;
    const bankId = String(salary.bank_account_id);
    if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
    const employeeName = employeeNameById.get(String(salary.employee_id)) || '';
    const label = salary.type === 'allowance' ? 'بدل' : 'راتب';
    ledger.push(makeLedgerEntry({
      id: `LED_SAL_${salary.id}`,
      date: salary.date,
      toAccount: bankId,
      description: employeeName ? `${label} ${employeeName}` : `${label} ${salary.id}`,
      amountOut: salary.amount,
      sourceModule: 'salary',
      linkedId: salary.id,
      shipmentId: salary.shipment_id || null,
    }));
  }

  for (const transfer of generalTransfers) {
    const splits = parseJsonField(transfer.splits);
    splits.forEach((split, index) => {
      if (!split || !split.bankAccountId) return;
      const bankId = String(split.bankAccountId);
      if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
      ledger.push(makeLedgerEntry({
        id: `LED_GT_${transfer.id}_${index + 1}`,
        date: transfer.date,
        toAccount: bankId,
        description: transfer.description || `تحويل عام ${transfer.id}`,
        amountOut: split.amount,
        sourceModule: 'general_transfer',
        linkedId: transfer.id,
        shipmentId: transfer.shipment_id || null,
      }));
    });
  }

  for (const transfer of accountTransfers) {
    if (transfer.type === 'transfer' && transfer.from_bank_account_id && transfer.to_bank_account_id) {
      const fromBankId = String(transfer.from_bank_account_id);
      const toBankId = String(transfer.to_bank_account_id);
      if (!knownBankIds.has(fromBankId)) unknownBankIds.add(fromBankId);
      if (!knownBankIds.has(toBankId)) unknownBankIds.add(toBankId);
      const description = `تحويل بين الحسابات${transfer.notes ? ` (${transfer.notes})` : ''}`;
      const amount = Number(transfer.amount) || 0;
      const fee = Number(transfer.transfer_fee) || 0;

      ledger.push(makeLedgerEntry({
        id: `LED_AT_${transfer.id}_OUT`,
        date: transfer.date,
        fromAccount: fromBankId,
        toAccount: toBankId,
        description,
        amountOut: amount + fee,
        sourceModule: 'account_transfer',
        linkedId: transfer.id,
      }));

      ledger.push(makeLedgerEntry({
        id: `LED_AT_${transfer.id}_IN`,
        date: transfer.date,
        fromAccount: fromBankId,
        toAccount: toBankId,
        description,
        amountIn: amount,
        sourceModule: 'account_transfer',
        linkedId: transfer.id,
      }));

      continue;
    }

    if (transfer.to_bank_account_id) {
      const bankId = String(transfer.to_bank_account_id);
      if (!knownBankIds.has(bankId)) unknownBankIds.add(bankId);
      ledger.push(makeLedgerEntry({
        id: `LED_AT_${transfer.id}_OPEN`,
        date: transfer.date,
        toAccount: bankId,
        description: `رصيد افتتاحي${transfer.notes ? ` (${transfer.notes})` : ''}`,
        amountIn: transfer.amount,
        sourceModule: 'account_transfer',
        linkedId: transfer.id,
      }));
    }
  }

  ledger.sort(compareByDateThenId);

  const balances = bankAccounts.map((bank) => ({
    id: String(bank.id),
    name: bank.name,
    balance: Number(computeBankBalance(String(bank.id), ledger).toFixed(2)),
  }));

  const sourceCounts = {
    cashSales: ledger.filter((row) => row.sourceModule === 'sale_cash').length,
    payments: ledger.filter((row) => row.sourceModule === 'payment').length,
    expenses: ledger.filter((row) => row.sourceModule === 'expense').length,
    salaries: ledger.filter((row) => row.sourceModule === 'salary').length,
    generalTransfers: ledger.filter((row) => row.sourceModule === 'general_transfer').length,
    accountTransfers: ledger.filter((row) => row.sourceModule === 'account_transfer').length,
  };

  console.log('Ledger rebuild summary');
  console.log(`  ledger rows: ${ledger.length}`);
  console.log(`  cash sale rows: ${sourceCounts.cashSales}`);
  console.log(`  payment rows: ${sourceCounts.payments}`);
  console.log(`  expense rows: ${sourceCounts.expenses}`);
  console.log(`  salary rows: ${sourceCounts.salaries}`);
  console.log(`  general transfer rows: ${sourceCounts.generalTransfers}`);
  console.log(`  account transfer rows: ${sourceCounts.accountTransfers}`);
  console.log(`  total in: ${sumBy(ledger, (row) => row.amountIn).toFixed(2)}`);
  console.log(`  total out: ${sumBy(ledger, (row) => row.amountOut).toFixed(2)}`);

  if (unknownBankIds.size > 0) {
    console.log(`  warning: unknown bank ids referenced by transactions: ${[...unknownBankIds].sort().join(', ')}`);
  }

  console.log('Computed bank balances');
  for (const bank of balances.sort((a, b) => a.id.localeCompare(b.id))) {
    console.log(`  [${bank.id}] ${bank.name}: ${bank.balance.toFixed(2)}`);
  }

  if (!options.apply) {
    console.log('Dry run only. Re-run with --apply to replace ledger and update bank balances.');
    return;
  }

  const deleted = await truncateTable('ledger', 'id');
  console.log(`Cleared ${deleted} rows from ledger`);

  const normalizedLedger = normalizeRows(ledger.map((row) => ({
    id: row.id,
    date: row.date,
    from_account: row.fromAccount,
    to_account: row.toAccount,
    description: row.description,
    amount_in: row.amountIn,
    amount_out: row.amountOut,
    source_module: row.sourceModule,
    linked_id: row.linkedId,
    reference_id: row.referenceId,
    invoice_id: row.invoiceId,
    shipment_id: row.shipmentId,
  })));

  for (let i = 0; i < normalizedLedger.length; i += BATCH_SIZE) {
    await supabaseRequest('POST', 'ledger', normalizedLedger.slice(i, i + BATCH_SIZE));
  }
  console.log(`Uploaded ${normalizedLedger.length} rows to ledger`);

  if (!options.skipBalanceUpdate) {
    for (const bank of balances) {
      await supabaseRequest('PATCH', `bank_accounts?id=eq.${encodeURIComponent(bank.id)}`, { balance: bank.balance });
    }
    console.log(`Updated ${balances.length} bank account balance snapshots`);
  } else {
    console.log('Skipped bank account balance snapshot updates');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});