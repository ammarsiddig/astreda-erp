import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LedgerEntry } from '../types';

let lastGeneratedTimestamp = 0;
let intraMsCounter = 0;

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

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function getCurrentDateInputValue(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function getCurrentMonthInputValue(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function getCurrentDateTimeValue(now = new Date()): string {
  return `${getCurrentDateInputValue(now)}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

export function formatDateTimeValue(value: string | Date, includeSeconds = false): string {
  const date = value instanceof Date ? value : new Date(value);
  const time = includeSeconds
    ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
    : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${time}`;
}

export function formatDateOnlyValue(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return formatDate(dateString);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export function dateTimeFromDateString(dateString: string, now = new Date()): string {
  return `${dateString}T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
}

function getRandomIdChunk() {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 6);
}

export function generateId(prefix: string, _items: { id: string }[] = [], offset = 0) {
  const nowMs = Date.now();
  if (nowMs === lastGeneratedTimestamp) {
    intraMsCounter += 1;
  } else {
    lastGeneratedTimestamp = nowMs;
    intraMsCounter = 0;
  }

  const timePart = nowMs.toString(36).toUpperCase();
  const counterPart = (intraMsCounter + offset).toString(36).toUpperCase().padStart(2, '0');
  return `${prefix}${timePart}${counterPart}${getRandomIdChunk()}`;
}

export function buildLedgerEntryId(sourceModule: string, linkedId: string, index = 0, shipmentId?: string) {
  const normalizedSource = sourceModule.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const normalizedLinked = linkedId.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const normalizedShipment = (shipmentId || 'GLOBAL').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const indexPart = String(index + 1).padStart(2, '0');
  return `LED${normalizedSource}${normalizedShipment}${normalizedLinked}${indexPart}`;
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
