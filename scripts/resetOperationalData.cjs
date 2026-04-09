const fs = require('fs');
const path = require('path');

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

const TABLES = [
  { table: 'ledger', pkField: 'id' },
  { table: 'shipment_transfers', pkField: 'id' },
  { table: 'settlement_results', pkField: 'shipment_id' },
  { table: 'capital_contributions', pkField: 'id' },
  { table: 'saved_settlements', pkField: 'shipment_id' },
  { table: 'account_transfers', pkField: 'id' },
  { table: 'general_transfers', pkField: 'id' },
  { table: 'salaries', pkField: 'id' },
  { table: 'expenses', pkField: 'id' },
  { table: 'payments', pkField: 'id' },
  { table: 'invoices', pkField: 'id' },
  { table: 'inventory_transactions', pkField: 'id' },
];

async function getRows(table, pkField) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${pkField}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read ${table}: ${res.status} ${text}`);
  }

  return res.json();
}

async function deleteBatch(table, pkField, ids) {
  const encodedIds = ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
  const filter = `${pkField}=in.(${encodedIds})`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to delete from ${table}: ${res.status} ${text}`);
  }
}

async function truncateTable(table, pkField) {
  const rows = await getRows(table, pkField);
  if (!rows.length) return 0;

  let deleted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await deleteBatch(table, pkField, batch.map((row) => row[pkField]));
    deleted += batch.length;
  }
  return deleted;
}

async function main() {
  console.log('Resetting operational data only.');
  console.log('Preserved tables: app_settings, customers, products, salespeople, cities, cars, bank_accounts, shipments, employees, partners, expense_categories, roles, users');

  const before = {};
  for (const { table, pkField } of TABLES) {
    const rows = await getRows(table, pkField);
    before[table] = rows.length;
  }

  console.log('\nCurrent row counts:');
  for (const { table } of TABLES) {
    console.log(`  ${table}: ${before[table]}`);
  }

  console.log('\nDeleting...');
  for (const { table, pkField } of TABLES) {
    const deleted = await truncateTable(table, pkField);
    console.log(`  ${table}: deleted ${deleted}`);
  }

  const after = {};
  for (const { table, pkField } of TABLES) {
    const rows = await getRows(table, pkField);
    after[table] = rows.length;
  }

  console.log('\nFinal row counts:');
  for (const { table } of TABLES) {
    console.log(`  ${table}: ${after[table]}`);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
