import { User, Role, Customer, PageKey } from '../types';

export const ALL_PAGE_KEYS: PageKey[] = [
  'dashboard', 'inventory', 'carLoading', 'sales', 'customers',
  'payments', 'expenses', 'salaries', 'generalTransfers',
  'accountTransfers', 'ledger', 'reports', 'capital', 'auditLog', 'settings',
];

export function getUserRole(user: User | null, roles: Role[]): Role | undefined {
  if (!user) return undefined;
  return roles.find(r => r.id === user.roleId);
}

function isSuperUser(user: User | null, role: Role | undefined): boolean {
  if (!user || !role) return false;
  return role.id === 'role-sysadmin' || user.username === 'sysadmin';
}

export function canView(user: User | null, roles: Role[], page: PageKey): boolean {
  const role = getUserRole(user, roles);
  if (isSuperUser(user, role)) return true;
  if (page === 'auditLog') return false;
  if (!role) return false;
  const perm = role.permissions.find(p => p.pageKey === page);
  return perm?.canView ?? false;
}

export function canWrite(user: User | null, roles: Role[], page: PageKey): boolean {
  const role = getUserRole(user, roles);
  if (isSuperUser(user, role)) return true;
  if (page === 'auditLog') return false;
  if (!role) return false;
  const perm = role.permissions.find(p => p.pageKey === page);
  return perm?.canWrite ?? false;
}

export function isSalesperson(user: User | null, roles: Role[]): boolean {
  const role = getUserRole(user, roles);
  return role?.isSalesperson ?? false;
}

export function isWarehouse(user: User | null, roles: Role[]): boolean {
  const role = getUserRole(user, roles);
  if (!role) return false;
  return role.id === 'role-warehouse' || role.name === 'مخزن';
}

export function isOwnCustomer(user: User | null, customer: Customer): boolean {
  if (!user || !user.salespersonId) return false;
  return customer.salespersonId === user.salespersonId;
}

export function makePermissions(config: Partial<Record<PageKey, { view: boolean; write: boolean }>>): {
  pageKey: PageKey; canView: boolean; canWrite: boolean;
}[] {
  return ALL_PAGE_KEYS.map(key => ({
    pageKey: key,
    canView: config[key]?.view ?? false,
    canWrite: config[key]?.write ?? false,
  }));
}

export function allPermissions(view: boolean, write: boolean) {
  return ALL_PAGE_KEYS.map(key => ({ pageKey: key, canView: view, canWrite: write }));
}
