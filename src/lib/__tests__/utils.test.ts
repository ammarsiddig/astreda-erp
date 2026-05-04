import { describe, it, expect } from 'vitest';
import { buildLedgerEntryId, computeBankBalance, formatCurrency, formatDate, generateDatedId, generateId, generateInvoiceId } from '../utils';
import type { LedgerEntry } from '../../types';

// ─── formatCurrency ───────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats SDG with no decimals by default', () => {
    expect(formatCurrency(1000)).toBe('1,000 SDG');
  }, 15_000);

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
  it('generates a readable sequential value', () => {
    const id = generateId('TEST', [], 0);
    expect(id).toBe('TEST-0001');
  });

  it('generates different ids even for the same prefix', () => {
    const first = generateId('TSEQ', [], 0);
    const second = generateId('TSEQ', [], 0);
    expect(first).not.toBe(second);
  });
});

describe('generateDatedId', () => {
  it('includes the document date and readable sequence', () => {
    expect(generateDatedId('PAYT', '2026-05-04', [])).toBe('PAYT-260504-0001');
  });

  it('increments above existing readable ids', () => {
    expect(generateDatedId('EXPT', '2026-05-04', [{ id: 'EXPT-260503-0002' }])).toBe('EXPT-260504-0003');
  });
});

// ─── generateInvoiceId ──────────────────────────────────────────

describe('generateInvoiceId', () => {
  it('produces INV-YYMM-0001 when there are no existing new-format invoices', () => {
    const id = generateInvoiceId('2026-04-27', []);
    expect(id).toBe('INV-2604-0001');
  });

  it('increments the global sequence above all existing new-format invoices', () => {
    const existing = [
      { id: 'INV-2604-0001' },
      { id: 'INV-2604-0003' },
      { id: 'INVLEGACYID001' }, // old format — must be ignored
    ];
    const id = generateInvoiceId('2026-05-01', existing);
    expect(id).toBe('INV-2605-0004');
  });

  it('pads the sequence to 4 digits', () => {
    const id = generateInvoiceId('2026-04-27', []);
    expect(id).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it('uses YYMM from the supplied date, not today', () => {
    const id = generateInvoiceId('2025-12-03', []);
    expect(id.startsWith('INV-2512-')).toBe(true);
  });
});

describe('buildLedgerEntryId', () => {
  it('is deterministic for the same inputs', () => {
    expect(buildLedgerEntryId('payment', 'PM123', 0, '4')).toBe(buildLedgerEntryId('payment', 'PM123', 0, '4'));
  });

  it('changes when the split index changes', () => {
    expect(buildLedgerEntryId('general_transfer', 'TR123', 0, '4')).not.toBe(buildLedgerEntryId('general_transfer', 'TR123', 1, '4'));
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
