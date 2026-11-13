import type { Currency } from './types';

/** Whole cents. Sums are done in cents so they never drift. */
export const toCents = (amount: number): number => Math.round(amount * 100);
export const fromCents = (cents: number): number => cents / 100;

const NUMBER = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SYMBOL: Record<Currency, string> = { EUR: '€', GBP: '£', USD: '$' };

/** "1,840.25 EUR", the way the Wise app writes amounts in lists. */
export function formatMoney(amount: number, currency: Currency): string {
  return `${NUMBER.format(amount)} ${currency}`;
}

/** "€1,840.25" */
export function formatSymbol(amount: number, currency: Currency): string {
  return `${SYMBOL[currency]}${NUMBER.format(amount)}`;
}

const WORDS: Record<Currency, readonly [string, string, string, string]> = {
  EUR: ['euro', 'euros', 'cent', 'cents'],
  GBP: ['pound', 'pounds', 'penny', 'pence'],
  USD: ['dollar', 'dollars', 'cent', 'cents'],
};

/** 58.1 EUR -> "58 euros and 10 cents"; 50 GBP -> "50 pounds". */
export function speakMoney(amount: number, currency: Currency): string {
  const [one, many, minorOne, minorMany] = WORDS[currency];
  const total = Math.abs(toCents(amount));
  const major = Math.floor(total / 100);
  const minor = total % 100;
  const majorText = `${major.toLocaleString('en-GB')} ${major === 1 ? one : many}`;
  const minorText = `${minor} ${minor === 1 ? minorOne : minorMany}`;
  if (minor === 0) return majorText;
  return major > 0 ? `${majorText} and ${minorText}` : minorText;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The calendar day where the user is. toISOString() would give the UTC day, which is a day off near midnight. */
export function localDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
}

/** "today", "yesterday" or "12 November". */
export function speakDate(date: string, now: Date): string {
  const day = parseLocalDate(date);
  const midnight = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const daysAgo = Math.round((midnight(now) - midnight(day)) / 86_400_000);
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  return day.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

/** "Mon, Nov 9", for transaction rows. */
export function rowDate(date: string): string {
  return parseLocalDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
