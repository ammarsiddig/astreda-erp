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

const PAGE_KEYS = [
  'dashboard', 'inventory', 'carLoading', 'sales', 'customers',
  'payments', 'expenses', 'salaries', 'generalTransfers',
  'accountTransfers', 'ledger', 'reports', 'capital', 'settings',
];

function allPermissions(view, write) {
  return PAGE_KEYS.map((pageKey) => ({ pageKey, canView: view, canWrite: write }));
}

function makePermissions(config) {
  return PAGE_KEYS.map((pageKey) => ({
    pageKey,
    canView: config[pageKey]?.view ?? false,
    canWrite: config[pageKey]?.write ?? false,
  }));
}

const DEFAULT_ROLES = [
  {
    id: 'role-sysadmin',
    name: 'مدير النظام',
    name_en: 'System Administrator',
    permissions: JSON.stringify(allPermissions(true, true)),
    is_salesperson: false,
    is_default: true,
  },
  {
    id: 'role-manager',
    name: 'مدير',
    name_en: 'Manager',
    permissions: JSON.stringify(allPermissions(true, true)),
    is_salesperson: false,
    is_default: true,
  },
  {
    id: 'role-accountant',
    name: 'محاسب',
    name_en: 'Accountant',
    permissions: JSON.stringify(makePermissions({
      dashboard: { view: true, write: false },
      inventory: { view: true, write: false },
      carLoading: { view: true, write: false },
      sales: { view: true, write: false },
      customers: { view: true, write: false },
      payments: { view: true, write: true },
      expenses: { view: true, write: true },
      salaries: { view: true, write: true },
      generalTransfers: { view: true, write: true },
      accountTransfers: { view: true, write: true },
      ledger: { view: true, write: true },
      reports: { view: true, write: false },
      capital: { view: true, write: false },
      settings: { view: true, write: false },
    })),
    is_salesperson: false,
    is_default: true,
  },
  {
    id: 'role-warehouse',
    name: 'مخزن',
    name_en: 'Warehouse',
    permissions: JSON.stringify(makePermissions({
      dashboard: { view: true, write: false },
      inventory: { view: true, write: true },
      carLoading: { view: true, write: true },
      sales: { view: true, write: false },
      customers: { view: true, write: false },
      reports: { view: true, write: false },
    })),
    is_salesperson: false,
    is_default: true,
  },
  {
    id: 'role-salesperson',
    name: 'مندوب',
    name_en: 'Salesperson',
    permissions: JSON.stringify(makePermissions({
      dashboard: { view: false, write: false },
      inventory: { view: true, write: false },
      sales: { view: true, write: true },
      customers: { view: true, write: true },
      reports: { view: true, write: false },
    })),
    is_salesperson: true,
    is_default: true,
  },
];

const DEFAULT_USERS = [
  {
    id: 'user-sysadmin',
    name: 'مدير النظام',
    username: 'sysadmin',
    password: 'e7ec9cbf3dc1a42562a5e500d5768001933624ea8d8f3ea0602092c42d4bc857',
    role_id: 'role-sysadmin',
    salesperson_id: null,
    is_active: true,
  },
  {
    id: 'user-admin',
    name: 'المدير',
    username: 'admin',
    password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    role_id: 'role-manager',
    salesperson_id: null,
    is_active: true,
  },
  {
    id: 'user-warehouse',
    name: 'المخزن',
    username: 'warehouse',
    password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    role_id: 'role-warehouse',
    salesperson_id: null,
    is_active: true,
  },
  {
    id: 'user-ahmed',
    name: 'أحمد ماهر',
    username: 'ahmed',
    password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    role_id: 'role-salesperson',
    salesperson_id: '1',
    is_active: true,
  },
  {
    id: 'user-hassan',
    name: 'حسن',
    username: 'hassan',
    password: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    role_id: 'role-salesperson',
    salesperson_id: '2',
    is_active: true,
  },
];

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
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=id.asc`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${table} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  await supabaseRequest('POST', 'roles', DEFAULT_ROLES);
  await supabaseRequest('POST', 'users', DEFAULT_USERS);

  const users = await fetchRows('users', 'id,username,is_active');
  console.log('Default roles and users restored.');
  console.log(JSON.stringify(users, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});