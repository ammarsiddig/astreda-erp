import { describe, it, expect } from 'vitest';
import { computeExpenseDeduction } from '../../pages/Settings';

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
