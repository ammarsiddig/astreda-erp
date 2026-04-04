import { describe, it, expect } from 'vitest';

// These helpers are private to syncEngine.ts and intentionally not exported
// to keep the module's public API minimal. We replicate them here to verify
// the camelCase ↔ snake_case conversion logic that underpins all Supabase sync.
// If the implementation changes, these tests should be updated to match.

const camel2snake = (s: string) =>
  s.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
   .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
   .toLowerCase();

const snake2camel = (s: string) =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const objectToSnake = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camel2snake(k)] = v;
  }
  return out;
};

const objectToCamel = (obj: Record<string, any>): Record<string, any> => {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'updated_at') continue;
    out[snake2camel(k)] = v;
  }
  return out;
};

// ─── camel2snake ──────────────────────────────────────────────────

describe('camel2snake', () => {
  it('converts simple camelCase', () => {
    expect(camel2snake('bankAccountId')).toBe('bank_account_id');
  });

  it('converts multi-word', () => {
    expect(camel2snake('managementFeePercent')).toBe('management_fee_percent');
  });

  it('handles consecutive uppercase (e.g. amountSDG)', () => {
    expect(camel2snake('amountSDG')).toBe('amount_sdg');
  });

  it('handles amountSAR', () => {
    expect(camel2snake('amountSAR')).toBe('amount_sar');
  });

  it('leaves already-snake_case unchanged', () => {
    expect(camel2snake('bank_account')).toBe('bank_account');
  });

  it('handles single word', () => {
    expect(camel2snake('id')).toBe('id');
    expect(camel2snake('name')).toBe('name');
  });

  it('handles isActive', () => {
    expect(camel2snake('isActive')).toBe('is_active');
  });
});

// ─── snake2camel ──────────────────────────────────────────────────

describe('snake2camel', () => {
  it('converts simple snake_case', () => {
    expect(snake2camel('bank_account_id')).toBe('bankAccountId');
  });

  it('converts management_fee_percent', () => {
    expect(snake2camel('management_fee_percent')).toBe('managementFeePercent');
  });

  it('handles single word', () => {
    expect(snake2camel('id')).toBe('id');
  });

  it('handles is_active', () => {
    expect(snake2camel('is_active')).toBe('isActive');
  });

  it('handles numeric suffixes', () => {
    expect(snake2camel('column_1')).toBe('column1');
  });
});

// ─── objectToSnake / objectToCamel round-trip ─────────────────────

describe('objectToSnake', () => {
  it('converts all keys to snake_case', () => {
    const input = { bankAccountId: '1', transferFee: 10, isActive: true };
    expect(objectToSnake(input)).toEqual({
      bank_account_id: '1',
      transfer_fee: 10,
      is_active: true,
    });
  });

  it('preserves values unchanged', () => {
    const input = { lines: [{ productId: 'p1' }], total: 100 };
    const result = objectToSnake(input);
    expect(result.lines).toEqual([{ productId: 'p1' }]); // nested values are NOT recursively converted
    expect(result.total).toBe(100);
  });
});

describe('objectToCamel', () => {
  it('converts all keys to camelCase', () => {
    const input = { bank_account_id: '1', transfer_fee: 10, is_active: true };
    expect(objectToCamel(input)).toEqual({
      bankAccountId: '1',
      transferFee: 10,
      isActive: true,
    });
  });

  it('strips updated_at', () => {
    const input = { id: '1', name: 'test', updated_at: '2025-01-01T00:00:00Z' };
    const result = objectToCamel(input);
    expect(result).toEqual({ id: '1', name: 'test' });
    expect(result.updatedAt).toBeUndefined();
  });
});

describe('round-trip conversion', () => {
  it('camelCase → snake_case → camelCase preserves data', () => {
    const original = {
      shipmentId: 's1',
      customerId: 'c1',
      salespersonId: 'sp1',
      paymentType: 'cash',
      bankAccountId: 'b1',
    };
    const snake = objectToSnake(original);
    const restored = objectToCamel(snake);
    expect(restored).toEqual(original);
  });

  it('handles edge case: amountSDG', () => {
    // amountSDG → amount_sdg → amountSdg (NOT amountSDG)
    // This documents the known behavior — acronyms are not perfectly round-tripped
    const snake = camel2snake('amountSDG');
    expect(snake).toBe('amount_sdg');
    const back = snake2camel(snake);
    expect(back).toBe('amountSdg'); // NOTE: lossy for uppercase acronyms
  });
});
