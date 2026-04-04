import { describe, it, expect } from 'vitest';
import {
  getUserRole,
  canView,
  canWrite,
  isSalesperson,
  isWarehouse,
  isOwnCustomer,
  makePermissions,
  allPermissions,
  ALL_PAGE_KEYS,
} from '../permissions';
import type { User, Role, Customer, PagePermission } from '../../types';

// ─── Fixtures ─────────────────────────────────────────────────────

const fullPerms: PagePermission[] = ALL_PAGE_KEYS.map(k => ({
  pageKey: k, canView: true, canWrite: true,
}));

const readOnlyPerms: PagePermission[] = ALL_PAGE_KEYS.map(k => ({
  pageKey: k, canView: true, canWrite: false,
}));

const roles: Role[] = [
  { id: 'role-manager', name: 'مدير', nameEn: 'Manager', permissions: fullPerms, isSalesperson: false },
  { id: 'role-salesperson', name: 'مندوب', nameEn: 'Salesperson', permissions: readOnlyPerms, isSalesperson: true },
  { id: 'role-warehouse', name: 'مخزن', nameEn: 'Warehouse', permissions: readOnlyPerms, isSalesperson: false },
];

const manager: User = { id: 'u1', name: 'Admin', username: 'admin', password: 'x', roleId: 'role-manager', isActive: true };
const salesperson: User = { id: 'u2', name: 'Ahmed', username: 'ahmed', password: 'x', roleId: 'role-salesperson', salespersonId: 'sp1', isActive: true };
const warehouseUser: User = { id: 'u3', name: 'Warehouse', username: 'wh', password: 'x', roleId: 'role-warehouse', isActive: true };

// ─── getUserRole ──────────────────────────────────────────────────

describe('getUserRole', () => {
  it('returns the matching role', () => {
    expect(getUserRole(manager, roles)?.id).toBe('role-manager');
  });

  it('returns undefined for null user', () => {
    expect(getUserRole(null, roles)).toBeUndefined();
  });

  it('returns undefined for unknown roleId', () => {
    const orphan: User = { ...manager, roleId: 'nonexistent' };
    expect(getUserRole(orphan, roles)).toBeUndefined();
  });
});

// ─── canView / canWrite ───────────────────────────────────────────

describe('canView', () => {
  it('returns true when role has view permission', () => {
    expect(canView(manager, roles, 'dashboard')).toBe(true);
  });

  it('returns false for null user', () => {
    expect(canView(null, roles, 'dashboard')).toBe(false);
  });

  it('returns false for user with unknown role', () => {
    const orphan: User = { ...manager, roleId: 'nonexistent' };
    expect(canView(orphan, roles, 'dashboard')).toBe(false);
  });
});

describe('canWrite', () => {
  it('returns true for manager', () => {
    expect(canWrite(manager, roles, 'sales')).toBe(true);
  });

  it('returns false for read-only role', () => {
    expect(canWrite(salesperson, roles, 'sales')).toBe(false);
  });

  it('returns false for null user', () => {
    expect(canWrite(null, roles, 'settings')).toBe(false);
  });
});

// ─── isSalesperson ────────────────────────────────────────────────

describe('isSalesperson', () => {
  it('returns true for salesperson role', () => {
    expect(isSalesperson(salesperson, roles)).toBe(true);
  });

  it('returns false for non-salesperson role', () => {
    expect(isSalesperson(manager, roles)).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isSalesperson(null, roles)).toBe(false);
  });
});

// ─── isWarehouse ──────────────────────────────────────────────────

describe('isWarehouse', () => {
  it('returns true for warehouse role by id', () => {
    expect(isWarehouse(warehouseUser, roles)).toBe(true);
  });

  it('returns false for manager', () => {
    expect(isWarehouse(manager, roles)).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isWarehouse(null, roles)).toBe(false);
  });
});

// ─── isOwnCustomer ───────────────────────────────────────────────

describe('isOwnCustomer', () => {
  const customer: Customer = { id: 'c1', name: 'Test', cityId: '1', salespersonId: 'sp1', carId: '1', phone: '', notes: '' };

  it('returns true when salespersonId matches', () => {
    expect(isOwnCustomer(salesperson, customer)).toBe(true);
  });

  it('returns false when salespersonId does not match', () => {
    const other: Customer = { ...customer, salespersonId: 'sp999' };
    expect(isOwnCustomer(salesperson, other)).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isOwnCustomer(null, customer)).toBe(false);
  });

  it('returns false for user without salespersonId', () => {
    expect(isOwnCustomer(manager, customer)).toBe(false);
  });
});

// ─── makePermissions ──────────────────────────────────────────────

describe('makePermissions', () => {
  it('creates permission array from partial config', () => {
    const perms = makePermissions({
      dashboard: { view: true, write: false },
      sales: { view: true, write: true },
    });
    expect(perms).toHaveLength(ALL_PAGE_KEYS.length);

    const dashboard = perms.find(p => p.pageKey === 'dashboard');
    expect(dashboard?.canView).toBe(true);
    expect(dashboard?.canWrite).toBe(false);

    const sales = perms.find(p => p.pageKey === 'sales');
    expect(sales?.canView).toBe(true);
    expect(sales?.canWrite).toBe(true);

    // Unspecified pages default to false
    const settings = perms.find(p => p.pageKey === 'settings');
    expect(settings?.canView).toBe(false);
    expect(settings?.canWrite).toBe(false);
  });
});

// ─── allPermissions ───────────────────────────────────────────────

describe('allPermissions', () => {
  it('creates all-true permissions', () => {
    const perms = allPermissions(true, true);
    expect(perms).toHaveLength(ALL_PAGE_KEYS.length);
    perms.forEach(p => {
      expect(p.canView).toBe(true);
      expect(p.canWrite).toBe(true);
    });
  });

  it('creates all-false permissions', () => {
    const perms = allPermissions(false, false);
    perms.forEach(p => {
      expect(p.canView).toBe(false);
      expect(p.canWrite).toBe(false);
    });
  });
});
