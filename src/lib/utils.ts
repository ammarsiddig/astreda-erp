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

export function generateId(prefix: string, currentCount: number) {
  const paddedCount = String(currentCount + 1).padStart(5, '0');
  return `${prefix}${paddedCount}`;
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
export function computeBankBalance(accountId: string, ledger: LedgerEntry[]): number {
  return ledger.reduce((bal, entry) => {
    if (entry.toAccount === accountId) {
      bal += entry.amountIn;
      // Only deduct amountOut here when there is no fromAccount
      // (i.e. expense/salary/general-transfer paying from this account).
      // For account-transfer entries, amountOut belongs to fromAccount, not toAccount.
      if (!entry.fromAccount) bal -= entry.amountOut;
    }
    if (entry.fromAccount === accountId) {
      bal -= entry.amountOut;
    }
    return bal;
  }, 0);
}
