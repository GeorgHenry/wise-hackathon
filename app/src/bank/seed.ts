import { localDate } from './money';
import type { Currency, Recipient, Transaction } from './types';

// Everything in this file is invented for the demo: the person, the people she
// pays, the balances, the exchange rate and the fee. None of it is Wise's data
// or pricing. The rate and fee match voice-agent/web/mock-bank.js on purpose,
// so the two demos quote the same figures.

export const RATE_EUR_GBP = 0.8642;
export const FEE_FIXED = 0.39;
export const FEE_PERCENT = 0.0045;
export const QUOTE_LIFETIME_MS = 15 * 60 * 1000;

export const ACCOUNT_HOLDER = { name: 'Malle Kask', firstName: 'Malle', initials: 'MK' } as const;

export interface Seed {
  /** Whole cents per currency. */
  balances: Record<Currency, number>;
  recipients: Recipient[];
  /** Newest first. */
  transactions: Transaction[];
}

export function createSeed(today: Date): Seed {
  const daysAgo = (days: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return localDate(d);
  };

  return {
    balances: { EUR: 184025, GBP: 31260 },
    recipients: [
      { id: 'rcp_kadri', name: 'Kadri Tamm', nickname: 'my daughter', currency: 'GBP', detail: 'UK account ending 4417', verified: true },
      { id: 'rcp_oskar', name: 'Oskar Tamm', nickname: 'my grandson', currency: 'GBP', detail: 'UK account ending 9023', verified: true },
      { id: 'rcp_toivo', name: 'Toivo Kask', nickname: 'my husband', currency: 'EUR', detail: 'EE account ending 5512', verified: true },
    ],
    transactions: [
      { id: 'tx_seed_5', direction: 'in', counterparty: 'Pension payment', amount: 742.1, currency: 'EUR', date: daysAgo(1), status: 'completed' },
      { id: 'tx_seed_4', direction: 'out', counterparty: 'Toivo Kask', amount: 50, currency: 'EUR', date: daysAgo(4), status: 'completed' },
      { id: 'tx_seed_3', direction: 'out', counterparty: 'Oskar Tamm', amount: 30, currency: 'GBP', date: daysAgo(6), status: 'completed' },
      { id: 'tx_seed_2', direction: 'in', counterparty: 'Kadri Tamm', amount: 25, currency: 'GBP', date: daysAgo(12), status: 'completed' },
      { id: 'tx_seed_1', direction: 'out', counterparty: 'Kadri Tamm', amount: 60, currency: 'GBP', date: daysAgo(31), status: 'completed' },
    ],
  };
}
