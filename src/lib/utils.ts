import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LedgerEntry } from '../types';

export const APP_TIME_ZONE = 'Africa/Khartoum';

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

function getTimeZoneParts(value: Date, timeZone = APP_TIME_ZONE): Record<string, string> {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(value).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== 'literal') parts[part.type] = part.value;
    return parts;
  }, {});
}

export function getCurrentDateInputValue(now = new Date()): string {
  const parts = getTimeZoneParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getCurrentMonthInputValue(now = new Date()): string {
  const parts = getTimeZoneParts(now);
  return `${parts.year}-${parts.month}`;
}

export function getCurrentDateTimeValue(now = new Date()): string {
  const parts = getTimeZoneParts(now);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatDateTimeValue(value: string | Date, includeSeconds = false): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:?\d{2})$/.test(value)) {
    const [datePart, timePart = ''] = value.split('T');
    const [year, month, day] = datePart.split('-');
    const [hour = '00', minute = '00', second = '00'] = timePart.split(':');
    const time = includeSeconds ? `${hour}:${minute}:${second.slice(0, 2)}` : `${hour}:${minute}`;
    return `${day}/${month}/${year} ${time}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  const parts = getTimeZoneParts(date);
  const time = includeSeconds
    ? `${parts.hour}:${parts.minute}:${parts.second}`
    : `${parts.hour}:${parts.minute}`;
  return `${parts.day}/${parts.month}/${parts.year} ${time}`;
}

export function formatDateOnlyValue(dateString: string): string {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  if (!year || !month || !day) return formatDate(dateString);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export function dateTimeFromDateString(dateString: string, now = new Date()): string {
  const parts = getTimeZoneParts(now);
  return `${dateString}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function dateTimeFromDateStringPreservingTime(dateString: string, originalDateTime?: string, now = new Date()): string {
  if (!originalDateTime) return dateTimeFromDateString(dateString, now);
  const [, originalTime = '00:00:00'] = originalDateTime.split('T');
  const [hour = '00', minute = '00', second = '00'] = originalTime.split(':');
  return `${dateString}T${hour}:${minute}:${second.slice(0, 2)}`;
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

// Matches the new INV-YYMM-<seq> format only; old legacy IDs are ignored.
const NEW_INV_RE = /^INV-\d{4}-(\d+)$/;

/**
 * Generate a new invoice ID in the format INV-YYMM-<globalSequence>.
 * - YYMM: 2-digit year + 2-digit month extracted from `date` (YYYY-MM-DD).
 * - globalSequence: max existing new-format sequence + 1, padded to 4 digits.
 *   Old-format invoice IDs are ignored so old data is never affected.
 */
export function generateInvoiceId(date: string, allInvoices: { id: string }[]): string {
  const yy = date.slice(2, 4);
  const mm = date.slice(5, 7);
  const maxSeq = allInvoices.reduce((max, inv) => {
    const m = NEW_INV_RE.exec(inv.id);
    if (!m) return max;
    const n = parseInt(m[1], 10);
    return n > max ? n : max;
  }, 0);
  const nextSeq = String(maxSeq + 1).padStart(4, '0');
  return `INV-${yy}${mm}-${nextSeq}`;
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
