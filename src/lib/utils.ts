import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LedgerEntry } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: 'SDG' | 'SAR' = 'SDG') {
  return new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: currency === 'SAR' ? 2 : 0,
    maximumFractionDigits: currency === 'SAR' ? 2 : 0,
  }).format(amount) + ' ' + currency;
}

export function formatDate(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Combines a YYYY-MM-DD date string with the current local time → "YYYY-MM-DDTHH:mm:ss" */
export function dateTimeFromDateString(dateString: string): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${dateString}T${hh}:${mm}:${ss}`;
}

export function generateId(prefix: string, items: { id: string }[], offset = 0) {
  let maxNum = 0;
  for (const item of items) {
    if (item.id && item.id.startsWith(prefix)) {
      const num = parseInt(item.id.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}${String(maxNum + 1 + offset).padStart(5, '0')}`;
}

/**
 * Computes the true balance for a bank account from the ledger.
 *
 * Ledger entry conventions used across the app:
 *  - Payments / cash sales / opening balances:
 *      toAccount = accountId, amountIn = amount, fromAccount = undefined
 *  - Expenses / salaries / general transfers (money OUT):
 *      toAccount = accountId, amountOut = amount, fromAccount = undefined
 *  - Account transfers (debit entry):
 *      fromAccount = srcId, toAccount = dstId, amountOut = amount+fee, amountIn = 0
 *  - Account transfers (credit entry):
 *      fromAccount = srcId, toAccount = dstId, amountIn = amount, amountOut = 0
 *
 * Rule: when fromAccount is set, amountOut belongs to fromAccount.
 *       when fromAccount is not set, amountOut belongs to toAccount.
 */
/**
 * Hashes a plaintext password using SHA-256 via the Web Crypto API.
 * Returns a lowercase hex string (64 characters).
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns true when a stored password string looks like a SHA-256 hex digest
 * (exactly 64 lowercase hex characters). Used to detect already-hashed passwords
 * and support the gradual migration from plaintext to hashed storage.
 */
export function isPasswordHashed(password: string): boolean {
  return /^[0-9a-f]{64}$/.test(password);
}

export function computeBankBalance(accountId: string, ledger: LedgerEntry[]): number {
  return ledger.reduce((bal, entry) => {
    if (entry.toAccount === accountId) {
      bal += entry.amountIn;
      if (!entry.fromAccount) bal -= entry.amountOut;
    }
    if (entry.fromAccount === accountId) {
      bal -= entry.amountOut;
    }
    return bal;
  }, 0);
}

export function computeShipmentBalance(shipmentId: string, accountId: string, ledger: LedgerEntry[]): number {
  return ledger
    .filter(e => e.shipmentId === shipmentId)
    .reduce((bal, entry) => {
      if (entry.toAccount === accountId) {
        bal += entry.amountIn;
        if (!entry.fromAccount) bal -= entry.amountOut;
      }
      if (entry.fromAccount === accountId) {
        bal -= entry.amountOut;
      }
      return bal;
    }, 0);
}
