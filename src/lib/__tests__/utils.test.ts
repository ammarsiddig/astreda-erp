import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, generateId, computeBankBalance } from '../utils';
import type { LedgerEntry } from '../../types';

// ─── formatCurrency ───────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats SDG with no decimals by default', () => {
    expect(formatCurrency(1000)).toBe('1,000 SDG');
  });

  it('formats SAR with 2 decimals', () => {
    expect(formatCurrency(1234.5, 'SAR')).toBe('1,234.50 SAR');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('0 SDG');
    expect(formatCurrency(0, 'SAR')).toBe('0.00 SAR');
  });

  it('formats negative values', () => {
    expect(formatCurrency(-500)).toBe('-500 SDG');
    expect(formatCurrency(-99.9, 'SAR')).toBe('-99.90 SAR');
  });

  it('formats large numbers with thousand separators', () => {
    expect(formatCurrency(1234567)).toBe('1,234,567 SDG');
  });

  it('rounds SDG to whole numbers', () => {
    expect(formatCurrency(99.99)).toBe('100 SDG');
  });
});

// ─── formatDate ───────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date string to dd/MM/yyyy', () => {
    expect(formatDate('2025-03-15')).toBe('15/03/2025');
  });

  it('returns empty string for empty input', () => {
    expect(formatDate('')).toBe('');
  });

  it('handles full ISO datetime', () => {
    const result = formatDate('2025-12-01T10:30:00Z');
    expect(result).toBe('01/12/2025');
  });
});

// ─── generateId ───────────────────────────────────────────────────

describe('generateId', () => {
  it('generates zero-padded ID with prefix', () => {
    expect(generateId('INV', 0)).toBe('INV00001');
    expect(generateId('PM', 9)).toBe('PM00010');
    expect(generateId('EX', 99)).toBe('EX00100');
  });

  it('handles large counts', () => {
    expect(generateId('INV', 99999)).toBe('INV100000');
  });
});

// ─── computeBankBalance ───────────────────────────────────────────

describe('computeBankBalance', () => {
  const makeLedger = (overrides: Partial<LedgerEntry>): LedgerEntry => ({
    id: 'l1',
    date: '2025-01-01',
    description: 'test',
    amountIn: 0,
    amountOut: 0,
    sourceModule: 'payment',
    linkedId: 'ref1',
    ...overrides,
  });

  it('returns 0 for empty ledger', () => {
    expect(computeBankBalance('acc1', [])).toBe(0);
  });

  it('adds amountIn when toAccount matches', () => {
    const ledger = [makeLedger({ toAccount: 'acc1', amountIn: 500 })];
    expect(computeBankBalance('acc1', ledger)).toBe(500);
  });

  it('subtracts amountOut when toAccount matches and no fromAccount (expense)', () => {
    const ledger = [makeLedger({ toAccount: 'acc1', amountOut: 200 })];
    expect(computeBankBalance('acc1', ledger)).toBe(-200);
  });

  it('does NOT subtract amountOut from toAccount when fromAccount is set (transfer)', () => {
    // Transfer: fromAccount=acc1, toAccount=acc2, amountOut=100
    // acc2 should NOT have amountOut deducted — it belongs to fromAccount
    const ledger = [makeLedger({ fromAccount: 'acc1', toAccount: 'acc2', amountOut: 100 })];
    expect(computeBankBalance('acc2', ledger)).toBe(0);
  });

  it('subtracts amountOut from fromAccount (transfer debit)', () => {
    const ledger = [makeLedger({ fromAccount: 'acc1', toAccount: 'acc2', amountOut: 300 })];
    expect(computeBankBalance('acc1', ledger)).toBe(-300);
  });

  it('handles a full transfer pair (debit + credit entries)', () => {
    const ledger = [
      // Debit entry: money leaves acc1
      makeLedger({ id: 'l1', fromAccount: 'acc1', toAccount: 'acc2', amountOut: 1050, amountIn: 0 }),
      // Credit entry: money arrives at acc2
      makeLedger({ id: 'l2', fromAccount: 'acc1', toAccount: 'acc2', amountIn: 1000, amountOut: 0 }),
    ];
    expect(computeBankBalance('acc1', ledger)).toBe(-1050); // sent 1000 + 50 fee
    expect(computeBankBalance('acc2', ledger)).toBe(1000);  // received 1000
  });

  it('computes balance across mixed operations', () => {
    const ledger = [
      // Payment in: +500
      makeLedger({ id: 'l1', toAccount: 'acc1', amountIn: 500 }),
      // Expense out: -200
      makeLedger({ id: 'l2', toAccount: 'acc1', amountOut: 200 }),
      // Another payment: +300
      makeLedger({ id: 'l3', toAccount: 'acc1', amountIn: 300 }),
    ];
    expect(computeBankBalance('acc1', ledger)).toBe(600); // 500 - 200 + 300
  });

  it('ignores entries for other accounts', () => {
    const ledger = [
      makeLedger({ toAccount: 'other', amountIn: 9999 }),
    ];
    expect(computeBankBalance('acc1', ledger)).toBe(0);
  });
});
