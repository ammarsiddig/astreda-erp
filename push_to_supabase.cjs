/**
 * Push migration_output.json → Supabase (overwrite)
 * 
 * Usage: node push_to_supabase.cjs
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://prwvpcxwodidfijytfuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_mBWbKcJWrKQZBrp46uDIxg_x6G7rGPJ';
const BATCH_SIZE = 500;

// ── camelCase ↔ snake_case helpers ──

const camel2snake = (s) =>
  s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase();

const objectToSnake = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camel2snake(k)] = v;
  }
  return out;
};

// ── Table mappings (same as syncEngine.ts) ──

const TABLE_MAPPINGS = [
  { table: 'products', stateKey: 'products', toRow: objectToSnake },
  { table: 'salespeople', stateKey: 'salespeople', toRow: objectToSnake },
  { table: 'cities', stateKey: 'cities', toRow: objectToSnake },
  { table: 'cars', stateKey: 'cars', toRow: objectToSnake },
  { table: 'bank_accounts', stateKey: 'bankAccounts', toRow: objectToSnake },
  { table: 'shipments', stateKey: 'shipments', toRow: objectToSnake },
  { table: 'employees', stateKey: 'employees', toRow: objectToSnake },
  { table: 'partners', stateKey: 'partners', toRow: objectToSnake },
  { table: 'expense_categories', stateKey: 'expenseCategories', toRow: objectToSnake },
  {
    table: 'roles', stateKey: 'roles',
    toRow: (r) => ({
      id: r.id, name: r.name, name_en: r.nameEn,
      permissions: JSON.stringify(r.permissions),
      is_salesperson: r.isSalesperson, is_default: r.isDefault ?? false,
    }),
  },
  {
    table: 'users', stateKey: 'users',
    toRow: (u) => ({
      id: u.id, name: u.name, username: u.username, password: u.password,
      role_id: u.roleId, salesperson_id: u.salespersonId ?? null, is_active: u.isActive,
    }),
  },
  { table: 'customers', stateKey: 'customers', toRow: objectToSnake },
  { table: 'inventory_transactions', stateKey: 'inventoryTransactions', toRow: objectToSnake },
  {
    table: 'invoices', stateKey: 'invoices',
    toRow: (inv) => ({ ...objectToSnake(inv), lines: JSON.stringify(inv.lines) }),
  },
  { table: 'payments', stateKey: 'payments', toRow: objectToSnake },
  { table: 'expenses', stateKey: 'expenses', toRow: objectToSnake },
  { table: 'salaries', stateKey: 'salaries', toRow: objectToSnake },
  {
    table: 'general_transfers', stateKey: 'generalTransfers',
    toRow: (t) => ({
      id: t.id, date: t.date, description: t.description,
      shipment_id: t.shipmentId, partner_id: t.partnerId,
      transfer_type: t.transferType, beneficiary_partner_id: t.beneficiaryPartnerId,
      amount_sdg: t.amountSDG, exchange_rate: t.exchangeRate, amount_sar: t.amountSAR,
      splits: JSON.stringify(t.splits),
    }),
  },
  { table: 'account_transfers', stateKey: 'accountTransfers', toRow: objectToSnake },
  { table: 'ledger', stateKey: 'ledger', toRow: objectToSnake },
  {
    table: 'saved_settlements', stateKey: 'savedSettlements', pkField: 'shipment_id',
    toRow: (s) => ({
      shipment_id: s.shipmentId, saved_at: s.savedAt,
      profit_by_partner: JSON.stringify(s.profitByPartner),
    }),
  },
  {
    table: 'capital_contributions', stateKey: 'capitalContributions',
    toRow: (c) => ({
      id: c.id, partner_id: c.partnerId, shipment_id: c.shipmentId,
      amount_sar: c.amountSAR, date: c.date, notes: c.notes,
    }),
  },
  {
    table: 'settlement_results', stateKey: 'settlementResults', pkField: 'shipment_id',
    toRow: (sr) => ({
      shipment_id: sr.shipmentId, saved_at: sr.savedAt,
      exchange_rate: sr.exchangeRate, investors_profit_percent: sr.investorsProfitPercent,
      management_fee_percent: sr.managementFeePercent,
      partner_profits: JSON.stringify(sr.partnerProfits),
      investor_profits: JSON.stringify(sr.investorProfits),
    }),
  },
  {
    table: 'shipment_transfers', stateKey: 'shipmentTransfers',
    toRow: (st) => ({
      id: st.id, date: st.date,
      from_shipment_id: st.fromShipmentId, to_shipment_id: st.toShipmentId,
      items: JSON.stringify(st.items),
      total_amount: st.totalAmount, notes: st.notes,
    }),
  },
];

// ── Supabase REST helper ──

function normalizeRows(rows) {
  // Supabase requires all objects in a batch to have the same keys
  const allKeys = new Set();
  for (const row of rows) {
    for (const k of Object.keys(row)) allKeys.add(k);
  }
  return rows.map(row => {
    const normalized = {};
    for (const k of allKeys) {
      normalized[k] = row[k] !== undefined ? row[k] : null;
    }
    return normalized;
  });
}

async function supabaseRequest(method, tablePath, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tablePath}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res;
}

// ── Delete all rows from a table ──

async function deleteAll(table) {
  // Supabase requires a filter for DELETE; use id != '' to match everything
  const pkCol = 'id';
  await fetch(`${SUPABASE_URL}/rest/v1/${table}?${pkCol}=neq.IMPOSSIBLE_VALUE_THAT_MATCHES_NONE`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
}

async function truncateTable(table, pkField) {
  // First get all PKs
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${pkField}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) return;
  const rows = await res.json();
  if (!rows.length) return;

  // Delete in batches using OR filters
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const ids = batch.map(r => r[pkField]);
    const filter = `${pkField}=in.(${ids.map(id => `"${id}"`).join(',')})`;
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
  }
}

// ── Main ──

async function main() {
  const filePath = path.join(__dirname, 'migration_output.json');
  if (!fs.existsSync(filePath)) {
    console.error('❌ migration_output.json not found');
    process.exit(1);
  }

  console.log('📂 Reading migration_output.json...');
  const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  let success = 0;
  let failed = 0;
  let totalRows = 0;

  // Process tables in order (delete old → insert new)
  // Reverse order for delete (to handle FK constraints), forward for insert
  const deleteOrder = [...TABLE_MAPPINGS].reverse();

  console.log('\n🗑️  Clearing existing data...');
  for (const mapping of deleteOrder) {
    const pkField = mapping.pkField ?? 'id';
    try {
      await truncateTable(mapping.table, pkField);
      console.log(`  🧹 ${mapping.table}: cleared`);
    } catch (e) {
      console.warn(`  ⚠️  ${mapping.table}: ${e.message}`);
    }
  }

  console.log('\n🚀 Uploading data to Supabase...');
  for (const mapping of TABLE_MAPPINGS) {
    const key = mapping.stateKey;
    let items;

    if (key === 'settlementResults') {
      items = Object.values(state.settlementResults || {});
    } else {
      items = state[key] ?? [];
    }

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`  ⏭  ${mapping.table}: empty`);
      continue;
    }

    try {
      const rows = normalizeRows(items.map(mapping.toRow));
      const pkCol = mapping.pkField ?? 'id';

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        await supabaseRequest('POST', mapping.table, batch);
      }

      console.log(`  ✅ ${mapping.table}: ${rows.length} rows`);
      success++;
      totalRows += rows.length;
    } catch (e) {
      console.error(`  ❌ ${mapping.table}: ${e.message}`);
      failed++;
    }
  }

  // Push scalar settings
  try {
    await supabaseRequest('POST', 'app_settings', {
      id: 'singleton',
      language: state.language ?? 'ar',
      user_role: state.userRole ?? 'manager',
      exchange_rate: state.exchangeRate ?? 1,
      management_fee_percent: state.managementFeePercent ?? 0,
      management_fee_recipient_id: state.managementFeeRecipientId ?? '1',
    });
    console.log('  ✅ app_settings: done');
    success++;
  } catch (e) {
    console.error('  ❌ app_settings:', e.message);
    failed++;
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`🎉 Done — ${success} tables OK, ${failed} failed, ${totalRows} total rows`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
