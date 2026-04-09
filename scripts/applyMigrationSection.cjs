const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 500;
const DEFAULT_REVIEW_DIR = path.join(process.cwd(), 'migration_review');

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
  const options = {
    mode: null,
    reviewDir: DEFAULT_REVIEW_DIR,
    dryRun: false,
    list: false,
  };
  const positionals = [];

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      options.mode = arg.slice('--mode='.length);
      continue;
    }
    if (arg.startsWith('--review-dir=')) {
      options.reviewDir = path.resolve(arg.slice('--review-dir='.length));
      continue;
    }
    positionals.push(arg);
  }

  return { options, positionals };
}

const camel2snake = (s) =>
  s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase();

const objectToSnake = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[camel2snake(k)] = v;
  return out;
};

const STATE_KEY_TO_MAPPING = {
  customers: { table: 'customers', pkField: 'id', toRow: objectToSnake },
  inventoryTransactions: { table: 'inventory_transactions', pkField: 'id', toRow: objectToSnake },
  invoices: {
    table: 'invoices',
    pkField: 'id',
    toRow: (inv) => ({ ...objectToSnake(inv), lines: JSON.stringify(inv.lines) }),
  },
  payments: { table: 'payments', pkField: 'id', toRow: objectToSnake },
  expenses: { table: 'expenses', pkField: 'id', toRow: objectToSnake },
  salaries: { table: 'salaries', pkField: 'id', toRow: objectToSnake },
  generalTransfers: {
    table: 'general_transfers',
    pkField: 'id',
    toRow: (t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      shipment_id: t.shipmentId,
      partner_id: t.partnerId,
      beneficiary_partner_id: t.beneficiaryPartnerId,
      transfer_type: t.transferType,
      amount_sdg: t.amountSDG,
      exchange_rate: t.exchangeRate,
      amount_sar: t.amountSAR,
      splits: JSON.stringify(t.splits),
    }),
  },
  capitalContributions: {
    table: 'capital_contributions',
    pkField: 'id',
    toRow: (c) => ({
      id: c.id,
      partner_id: c.partnerId,
      shipment_id: c.shipmentId,
      amount_sar: c.amountSAR,
      date: c.date,
      notes: c.notes,
      profit_rate: c.profitRate ?? null,
    }),
  },
  ledger: { table: 'ledger', pkField: 'id', toRow: objectToSnake },
};

const SECTIONS = {
  customers: {
    clear: [{ type: 'truncate', table: 'customers', pkField: 'id' }],
    keys: ['customers'],
  },
  inventory_receives: {
    clear: [{ type: 'filter', table: 'inventory_transactions', filter: 'type=eq.receive' }],
    keys: ['inventoryTransactions'],
  },
  sales: {
    clear: [
      { type: 'truncate', table: 'invoices', pkField: 'id' },
      { type: 'filter', table: 'inventory_transactions', filter: 'type=eq.sell' },
    ],
    keys: ['invoices', 'inventoryTransactions'],
  },
  payments: {
    clear: [{ type: 'truncate', table: 'payments', pkField: 'id' }],
    keys: ['payments'],
  },
  expenses: {
    clear: [{ type: 'truncate', table: 'expenses', pkField: 'id' }],
    keys: ['expenses'],
  },
  salaries: {
    clear: [{ type: 'truncate', table: 'salaries', pkField: 'id' }],
    keys: ['salaries'],
  },
  general_transfers: {
    clear: [{ type: 'truncate', table: 'general_transfers', pkField: 'id' }],
    keys: ['generalTransfers'],
  },
  ledger: {
    clear: [{ type: 'truncate', table: 'ledger', pkField: 'id' }],
    keys: ['ledger'],
  },
  opening_balance_shipment15: {
    clear: [{ type: 'filter', table: 'inventory_transactions', filter: 'type=eq.receive' }],
    keys: ['inventoryTransactions'],
  },
  sales_shipment15: {
    clear: [
      { type: 'truncate', table: 'invoices', pkField: 'id' },
      { type: 'filter', table: 'inventory_transactions', filter: 'type=eq.load' },
      { type: 'filter', table: 'inventory_transactions', filter: 'type=eq.sell' },
    ],
    keys: ['invoices', 'inventoryTransactions'],
  },
  payments_shipment15: {
    clear: [{ type: 'truncate', table: 'payments', pkField: 'id' }],
    keys: ['payments'],
  },
  salaries_shipment15: {
    clear: [{ type: 'truncate', table: 'salaries', pkField: 'id' }],
    keys: ['salaries'],
  },
  expenses_shipment15: {
    clear: [{ type: 'truncate', table: 'expenses', pkField: 'id' }],
    keys: ['expenses'],
  },
  capital_contributions_shipment15: {
    clear: [{ type: 'filter', table: 'capital_contributions', filter: 'shipment_id=eq.4' }],
    keys: ['capitalContributions'],
  },
  general_transfers_shipment15: {
    clear: [{ type: 'filter', table: 'general_transfers', filter: 'shipment_id=eq.4' }],
    keys: ['generalTransfers'],
  },
  general_transfers_shipment15_resolved: {
    clear: [{ type: 'filter', table: 'general_transfers', filter: 'shipment_id=eq.4' }],
    keys: ['generalTransfers'],
  },
};

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
    throw new Error(`${res.status} ${text}`);
  }

  return res;
}

async function truncateTable(table, pkField) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${pkField}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to list rows for ${table}: ${res.status}`);
  }

  const rows = await res.json();
  if (!rows.length) return 0;

  let deleted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const ids = batch.map((row) => row[pkField]);
    const filter = `${pkField}=in.(${ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`;
    const del = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });
    if (!del.ok) {
      const text = await del.text();
      throw new Error(`Failed to clear ${table}: ${del.status} ${text}`);
    }
    deleted += batch.length;
  }

  return deleted;
}

async function deleteByFilter(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to clear filtered rows in ${table}: ${res.status} ${text}`);
  }
}

function printUsage() {
  console.log('Usage: node scripts/applyMigrationSection.cjs <section> [--mode=replace|append] [--dry-run]');
  console.log('Sections:');
  for (const name of Object.keys(SECTIONS)) console.log(`  - ${name}`);
}

async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));

  if (options.list) {
    printUsage();
    return;
  }

  const sectionName = positionals[0];
  if (!sectionName || !SECTIONS[sectionName]) {
    printUsage();
    process.exit(sectionName ? 1 : 0);
  }

  const sectionPath = path.join(options.reviewDir, 'sections', `${sectionName}.json`);
  if (!fs.existsSync(sectionPath)) {
    console.error(`Section file not found: ${sectionPath}`);
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(sectionPath, 'utf8'));
  const planPath = path.join(options.reviewDir, 'plan.json');
  let planEntry = null;

  if (fs.existsSync(planPath)) {
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    planEntry = Array.isArray(plan.sections) ? plan.sections.find((item) => item.name === sectionName) : null;
  }

  const mode = options.mode || (planEntry && planEntry.mode) || 'replace';
  if (!['replace', 'append'].includes(mode)) {
    console.error(`Unsupported mode: ${mode}`);
    process.exit(1);
  }

  console.log(`Section: ${sectionName}`);
  console.log(`Mode: ${mode}`);
  console.log(`Source: ${sectionPath}`);
  if (planEntry && planEntry.enabled === false) {
    console.log('Plan status: disabled in plan.json. Applying anyway because a section was explicitly requested.');
  }

  const sectionDef = SECTIONS[sectionName];
  const totals = [];

  if (mode === 'replace') {
    for (const clearStep of sectionDef.clear) {
      if (options.dryRun) {
        console.log(`[dry-run] clear ${clearStep.table} via ${clearStep.type}`);
        continue;
      }

      if (clearStep.type === 'truncate') {
        const deleted = await truncateTable(clearStep.table, clearStep.pkField);
        console.log(`Cleared ${deleted} rows from ${clearStep.table}`);
      } else {
        await deleteByFilter(clearStep.table, clearStep.filter);
        console.log(`Cleared filtered rows from ${clearStep.table} (${clearStep.filter})`);
      }
    }
  }

  for (const stateKey of sectionDef.keys) {
    const mapping = STATE_KEY_TO_MAPPING[stateKey];
    const items = Array.isArray(payload.state[stateKey]) ? payload.state[stateKey] : [];
    totals.push({ stateKey, count: items.length });

    if (items.length === 0) {
      console.log(`${stateKey}: empty`);
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] would upload ${items.length} rows to ${mapping.table}`);
      continue;
    }

    const rows = normalizeRows(items.map(mapping.toRow));
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await supabaseRequest('POST', mapping.table, batch);
    }
    console.log(`Uploaded ${items.length} rows to ${mapping.table}`);
  }

  console.log('Done.');
  for (const total of totals) {
    console.log(`  ${total.stateKey}: ${total.count}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
