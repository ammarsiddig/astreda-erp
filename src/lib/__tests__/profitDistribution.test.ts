import { describe, it, expect } from 'vitest';
import { computeExpenseDeduction, computePartnerExpenses } from '../profitDistribution';
import type { Expense } from '../../types';

describe('computeExpenseDeduction', () => {
  // ── null profit (profit not assigned) ────────────────────────────

  it('null profit: expenses do NOT reduce capital return', () => {
    const result = computeExpenseDeduction(10_000, null, 3_000);
    expect(result.netCapitalReturn).toBe(10_000);
    expect(result.netProfit).toBeNull();
    expect(result.fromProfit).toBe(0);
    expect(result.fromCapital).toBe(0);
  });

  it('undefined profit: treated same as null', () => {
    const result = computeExpenseDeduction(5_000, undefined, 2_000);
    expect(result.netCapitalReturn).toBe(5_000);
    expect(result.netProfit).toBeNull();
    expect(result.fromProfit).toBe(0);
    expect(result.fromCapital).toBe(0);
  });

  it('null profit with zero expenses: no change', () => {
    const result = computeExpenseDeduction(8_000, null, 0);
    expect(result.netCapitalReturn).toBe(8_000);
    expect(result.netProfit).toBeNull();
    expect(result.fromCapital).toBe(0);
  });

  // ── expenses deducted from profit only (profit ≥ expenses) ───────

  it('profit covers all expenses: capital return unchanged', () => {
    const result = computeExpenseDeduction(10_000, 5_000, 2_000);
    expect(result.fromProfit).toBe(2_000);
    expect(result.fromCapital).toBe(0);
    expect(result.netProfit).toBe(3_000);
    expect(result.netCapitalReturn).toBe(10_000);
  });

  it('profit exactly equals expenses: net profit is zero, capital untouched', () => {
    const result = computeExpenseDeduction(10_000, 2_000, 2_000);
    expect(result.fromProfit).toBe(2_000);
    expect(result.fromCapital).toBe(0);
    expect(result.netProfit).toBe(0);
    expect(result.netCapitalReturn).toBe(10_000);
  });

  // ── expenses overflow from profit into capital return ─────────────

  it('expenses exceed profit: remainder deducted from capital', () => {
    const result = computeExpenseDeduction(10_000, 1_000, 3_000);
    expect(result.fromProfit).toBe(1_000);
    expect(result.fromCapital).toBe(2_000);
    expect(result.netProfit).toBe(0);
    expect(result.netCapitalReturn).toBe(8_000);
  });

  it('zero profit: all expenses deducted from capital', () => {
    const result = computeExpenseDeduction(10_000, 0, 4_000);
    expect(result.fromProfit).toBe(0);
    expect(result.fromCapital).toBe(4_000);
    expect(result.netProfit).toBe(0);
    expect(result.netCapitalReturn).toBe(6_000);
  });

  it('expenses exceed profit + capital: capital floored at 0', () => {
    const result = computeExpenseDeduction(1_000, 500, 10_000);
    expect(result.fromProfit).toBe(500);
    expect(result.fromCapital).toBe(1_000); // capped at available capital
    expect(result.netProfit).toBe(0);
    expect(result.netCapitalReturn).toBe(0);
  });

  // ── edge cases ────────────────────────────────────────────────────

  it('zero expenses: nothing deducted', () => {
    const result = computeExpenseDeduction(10_000, 5_000, 0);
    expect(result.fromProfit).toBe(0);
    expect(result.fromCapital).toBe(0);
    expect(result.netProfit).toBe(5_000);
    expect(result.netCapitalReturn).toBe(10_000);
  });

  it('zero capital, zero profit, null: no deductions', () => {
    const result = computeExpenseDeduction(0, null, 1_000);
    expect(result.netCapitalReturn).toBe(0);
    expect(result.netProfit).toBeNull();
    expect(result.fromCapital).toBe(0);
  });
});

// ─── Helper factory ───────────────────────────────────────────────────────────
function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'EX1', date: '2024-01-01', categoryId: 'cat1', description: '',
    amount: 100, bankAccountId: 'bank1', shipmentId: 'ship1', notes: '',
    ...overrides,
  };
}

describe('computePartnerExpenses', () => {
  it('sums expenses attributed to the matching partner + shipment', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'EX1', shipmentId: 'S1', partnerId: 'P1', amount: 500 }),
      makeExpense({ id: 'EX2', shipmentId: 'S1', partnerId: 'P1', amount: 300 }),
    ];
    expect(computePartnerExpenses(expenses, 'S1', 'P1')).toBe(800);
  });

  it('returns 0 when no expenses are attributed to that partner', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'EX1', shipmentId: 'S1', partnerId: 'P2', amount: 500 }),
    ];
    expect(computePartnerExpenses(expenses, 'S1', 'P1')).toBe(0);
  });

  it('does not count expenses from a different shipment', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'EX1', shipmentId: 'S2', partnerId: 'P1', amount: 500 }),
    ];
    expect(computePartnerExpenses(expenses, 'S1', 'P1')).toBe(0);
  });

  it('ignores unattributed expenses (no partnerId)', () => {
    const expenses: Expense[] = [
      makeExpense({ id: 'EX1', shipmentId: 'S1', partnerId: undefined, amount: 1000 }),
      makeExpense({ id: 'EX2', shipmentId: 'S1', partnerId: 'P1', amount: 200 }),
    ];
    expect(computePartnerExpenses(expenses, 'S1', 'P1')).toBe(200);
  });

  it('returns 0 for empty array', () => {
    expect(computePartnerExpenses([], 'S1', 'P1')).toBe(0);
  });
});
