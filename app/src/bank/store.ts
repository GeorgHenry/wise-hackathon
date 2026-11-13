import { fromCents, localDate, toCents } from './money';
import { createSeed, FEE_FIXED, FEE_PERCENT, QUOTE_LIFETIME_MS, RATES_FROM_EUR } from './seed';
import {
  type AudioPrivacy,
  type Balance,
  type Bank,
  BankError,
  type BankEvent,
  type ConfirmResult,
  type Contact,
  type Currency,
  type Direction,
  type PreparedTransfer,
  type Quote,
  type QuoteRequest,
  type Recipient,
  type Transaction,
  type TransactionQuery,
  type WiseUser,
} from './types';

export type TransferPhase = 'prepared' | 'approving' | 'sent' | 'declined' | 'cancelled' | 'failed';

/** The one transfer the screens show, whatever state it is in. */
export interface TransferView {
  transfer: PreparedTransfer;
  phase: TransferPhase;
  reason?: string;
  transaction?: Transaction;
  /** When the phase last changed, in milliseconds. */
  at: number;
}

/** What the agent last looked at, so the voice sheet can show the matching card. */
export type Activity =
  | { kind: 'balances'; at: number }
  | { kind: 'transactions'; at: number; direction?: Direction; counterparty?: string };

export interface IncomingView {
  transaction: Transaction;
  at: number;
}

export interface BankSnapshot {
  balances: Balance[];
  recipients: Recipient[];
  contacts: Contact[];
  transactions: Transaction[];
  audioPrivacy: AudioPrivacy;
  transfer: TransferView | null;
  lastIncoming: IncomingView | null;
  activity: Activity | null;
}

/** The Face ID step: answers whether the user approved this transfer. */
export type Approver = (transfer: PreparedTransfer) => Promise<boolean>;

export interface BankStore extends Bank {
  /** The same object until something changes, so React can compare by identity. */
  getSnapshot(): BankSnapshot;
  onChange(listener: () => void): () => void;
  setApprover(approver: Approver): void;
  setAudioPrivacy(value: AudioPrivacy): void;
  simulateIncoming(input?: { from?: string; amount?: number; currency?: Currency }): Transaction;
  dismissIncoming(): void;
  reset(): void;
}

export interface BankStoreOptions {
  now?: () => Date;
  approver?: Approver;
}

interface TransferEntry {
  view: TransferView;
  result: ConfirmResult | null;
  pending: Promise<ConfirmResult> | null;
  /** Resolves `pending`; set while the approval step is showing. */
  resolve: ((result: ConfirmResult) => void) | null;
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** With no approval step attached, nothing is ever approved. */
const refuseEverything: Approver = async () => false;

export function createBankStore(options: BankStoreOptions = {}): BankStore {
  const now = options.now ?? (() => new Date());
  let approver = options.approver ?? refuseEverything;

  let cents: Record<Currency, number>;
  /** The currencies she holds a balance in. */
  let held: Currency[];
  let recipients: Recipient[];
  let contacts: Contact[];
  let wiseUsers: WiseUser[];
  let transactions: Transaction[];
  let audioPrivacy: AudioPrivacy;
  let currentTransferId: string | null;
  let lastIncoming: IncomingView | null;
  let activity: Activity | null;
  const quotes = new Map<string, Quote>();
  const transfers = new Map<string, TransferEntry>();
  let nextId = 1;

  let snapshot: BankSnapshot | null = null;
  const changeListeners = new Set<() => void>();
  const subscribers = new Set<(event: BankEvent) => void>();

  function load(): void {
    const seed = createSeed(now());
    cents = { EUR: 0, GBP: 0, USD: 0, ...seed.balances };
    held = Object.keys(seed.balances) as Currency[];
    recipients = seed.recipients;
    contacts = seed.contacts;
    wiseUsers = seed.wiseUsers;
    transactions = seed.transactions;
    audioPrivacy = 'private';
    currentTransferId = null;
    lastIncoming = null;
    activity = null;
    quotes.clear();
    transfers.clear();
  }
  load();

  const balances = (): Balance[] => held.map((currency) => ({ currency, amount: fromCents(cents[currency]) }));

  /** Every word of the query must appear in the text, whatever the case. */
  const matches = (query: string | undefined, text: string): boolean => {
    const haystack = text.toLowerCase();
    return (query ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
  };

  /** The screens need a fresh snapshot. */
  function touch(): void {
    snapshot = null;
    for (const listener of [...changeListeners]) listener();
  }

  function emit(event: BankEvent): void {
    for (const subscriber of [...subscribers]) {
      try {
        subscriber(event);
      } catch (error) {
        console.error('[bank] a subscriber threw', error);
      }
    }
  }

  /** The account itself changed: tell the screens and the agent. */
  function changed(): void {
    touch();
    emit({ type: 'changed' });
  }

  function setPhase(entry: TransferEntry, phase: TransferPhase, extra: { reason?: string; transaction?: Transaction } = {}): void {
    entry.view = { ...entry.view, ...extra, phase, at: now().getTime() };
  }

  /** Ends a transfer for good. Whoever is waiting on confirmTransfer gets the result. */
  function settle(entry: TransferEntry, phase: TransferPhase, result: ConfirmResult): void {
    entry.result = result;
    setPhase(entry, phase, result.status === 'sent' ? { transaction: result.transaction } : { reason: result.reason });
    entry.resolve?.(result);
    entry.resolve = null;
    changed();
  }

  const expired = (quote: Quote): boolean => Date.parse(quote.expiresAt) < now().getTime();
  const PRICE_EXPIRED: ConfirmResult = { status: 'failed', reason: 'The price expired before the payment was approved' };

  function finishApproval(entry: TransferEntry, approved: boolean): void {
    if (entry.result) return; // cancelled while the approval step was showing
    if (!approved) {
      settle(entry, 'declined', { status: 'declined', reason: 'Not approved with Face ID' });
      return;
    }
    const { transfer } = entry.view;
    if (expired(transfer)) {
      settle(entry, 'failed', PRICE_EXPIRED);
      return;
    }
    cents[transfer.sourceCurrency] -= toCents(transfer.sourceAmount);
    const transaction: Transaction = {
      id: `tx_${nextId++}`,
      direction: 'out',
      counterparty: transfer.recipientName,
      amount: transfer.targetAmount,
      currency: transfer.targetCurrency,
      date: localDate(now()),
      status: 'completed',
    };
    transactions = [transaction, ...transactions];
    settle(entry, 'sent', { status: 'sent', transaction: { ...transaction }, balances: balances() });
  }

  function findTransfer(transferId: string): TransferEntry {
    const entry = transfers.get(transferId);
    if (!entry) throw new BankError('not_found', 'No such transfer');
    return entry;
  }

  return {
    async getBalances() {
      activity = { kind: 'balances', at: now().getTime() };
      touch();
      return balances();
    },

    async listRecipients(query) {
      return recipients.filter((r) => matches(query, `${r.name} ${r.nickname ?? ''}`)).map((r) => ({ ...r }));
    },

    async findContacts(query) {
      return contacts.filter((c) => matches(query, c.name)).map((c) => ({ ...c }));
    },

    async findWiseUser(wisetag) {
      const wanted = String(wisetag ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const user = wanted ? wiseUsers.find((u) => u.wisetag === wanted) : undefined;
      return user ? { ...user } : null;
    },

    async listTransactions({ direction, counterparty, limit = 10 }: TransactionQuery = {}) {
      // "Has this person been paid before?" (the latest payment to one person) is a
      // background check during a payment, not something to show the user.
      const backgroundCheck = limit === 1 && direction === 'out' && Boolean(counterparty);
      if (!backgroundCheck) {
        activity = { kind: 'transactions', at: now().getTime(), direction, counterparty };
        touch();
      }
      const name = counterparty?.trim().toLowerCase();
      return transactions
        .filter((t) => !direction || t.direction === direction)
        .filter((t) => !name || t.counterparty.toLowerCase().includes(name))
        .slice(0, limit)
        .map((t) => ({ ...t }));
    },

    async getQuote({ recipientId, amount, currency, amountIs }: QuoteRequest) {
      const saved = recipients.find((r) => r.id === recipientId);
      const contact = saved ? undefined : contacts.find((c) => c.id === recipientId);
      const wiseUser = saved || contact ? undefined : wiseUsers.find((u) => u.id === recipientId);
      const recipient = saved ?? contact ?? wiseUser;
      if (!recipient) throw new BankError('unknown_recipient', 'No saved recipient or contact with that id');
      if (contact && !contact.onWise) throw new BankError('not_on_wise', 'This contact does not use Wise');
      if (!(currency in RATES_FROM_EUR)) throw new BankError('unsupported_currency', 'That currency is not supported');

      // A saved recipient is paid in their account's currency. A Wise account (a
      // contact's, or one found by Wisetag) takes whatever currency the user names.
      const targetCurrency = saved ? saved.currency : currency;
      const mode = saved ? (amountIs ?? (currency === targetCurrency ? 'target' : 'source')) : 'target';
      const amountCents = toCents(amount);
      // Which balance pays: the one the user named, else the recipient's own
      // currency when the user holds enough of it (no conversion, no fee), else euros.
      let sourceCurrency: Currency = 'EUR';
      if (mode === 'source') sourceCurrency = currency;
      else if (cents[targetCurrency] >= amountCents) sourceCurrency = targetCurrency;
      const sameCurrency = sourceCurrency === targetCurrency;
      const rate = sameCurrency ? 1 : RATES_FROM_EUR[targetCurrency] / RATES_FROM_EUR[sourceCurrency];
      const feeOn = (sourceCents: number): number => (sameCurrency ? 0 : Math.round(FEE_FIXED * 100 + FEE_PERCENT * sourceCents));

      let sourceCents: number;
      let targetCents: number;
      let feeCents: number;
      if (mode === 'source') {
        sourceCents = amountCents;
        feeCents = feeOn(sourceCents);
        targetCents = Math.round((sourceCents - feeCents) * rate);
      } else {
        targetCents = amountCents;
        const converted = targetCents / rate;
        feeCents = feeOn(converted);
        sourceCents = Math.round(converted) + feeCents;
      }
      if (!(amountCents > 0) || targetCents <= 0) {
        throw new BankError('insufficient_funds', 'The amount is smaller than the fee');
      }

      const quote: Quote = {
        id: `qt_${nextId++}`,
        recipientId,
        recipientName: recipient.name,
        recipientKind: contact ? 'contact' : wiseUser ? 'wise_user' : 'saved',
        ...(wiseUser ? { recipientWisetag: wiseUser.wisetag } : {}),
        sourceAmount: fromCents(sourceCents),
        sourceCurrency,
        targetAmount: fromCents(targetCents),
        targetCurrency,
        rate: round4(rate),
        fee: fromCents(feeCents),
        feeCurrency: sourceCurrency,
        arrival: saved ? 'today' : 'in seconds',
        expiresAt: new Date(now().getTime() + QUOTE_LIFETIME_MS).toISOString(),
      };
      quotes.set(quote.id, quote);
      return { ...quote };
    },

    async prepareTransfer(quoteId) {
      const quote = quotes.get(quoteId);
      if (!quote) throw new BankError('not_found', 'No such quote');
      if (expired(quote)) throw new BankError('quote_expired', 'The quote has expired');
      if (cents[quote.sourceCurrency] < toCents(quote.sourceAmount)) {
        throw new BankError('insufficient_funds', 'Not enough money in the balance');
      }

      // One transfer waits at a time: a newer one replaces it.
      const waiting = currentTransferId ? transfers.get(currentTransferId) : undefined;
      if (waiting && !waiting.result) {
        settle(waiting, 'cancelled', { status: 'cancelled', reason: 'Replaced by a newer transfer' });
      }

      const transfer: PreparedTransfer = { ...quote, transferId: `tr_${nextId++}`, status: 'prepared' };
      transfers.set(transfer.transferId, {
        view: { transfer, phase: 'prepared', at: now().getTime() },
        result: null,
        pending: null,
        resolve: null,
      });
      currentTransferId = transfer.transferId;
      changed();
      return { ...transfer };
    },

    async confirmTransfer(transferId) {
      const entry = findTransfer(transferId);
      if (entry.result) return entry.result; // money moves once
      if (entry.pending) return entry.pending;
      if (expired(entry.view.transfer)) {
        // An old price is never honoured, and Face ID is not asked for nothing.
        settle(entry, 'failed', PRICE_EXPIRED);
        return PRICE_EXPIRED;
      }

      entry.pending = new Promise<ConfirmResult>((resolve) => {
        entry.resolve = resolve;
      });
      setPhase(entry, 'approving');
      touch();
      approver(entry.view.transfer).then(
        (approved) => finishApproval(entry, approved === true),
        () => finishApproval(entry, false),
      );
      return entry.pending;
    },

    async cancelTransfer(transferId) {
      const entry = findTransfer(transferId);
      if (!entry.result) settle(entry, 'cancelled', { status: 'cancelled', reason: 'Cancelled' });
      // The truth, not a polite "cancelled": the money may already have gone.
      return { status: entry.result?.status ?? 'cancelled' };
    },

    async getAudioPrivacy() {
      return audioPrivacy;
    },

    subscribe(listener) {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },

    getSnapshot() {
      snapshot ??= {
        balances: balances(),
        recipients,
        contacts,
        transactions,
        audioPrivacy,
        transfer: currentTransferId ? (transfers.get(currentTransferId)?.view ?? null) : null,
        lastIncoming,
        activity,
      };
      return snapshot;
    },

    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },

    setApprover(next) {
      approver = next;
    },

    setAudioPrivacy(value) {
      audioPrivacy = value;
      changed();
    },

    simulateIncoming({ from = 'Kadri Tamm', amount = 40, currency = 'GBP' } = {}) {
      const transaction: Transaction = {
        id: `tx_${nextId++}`,
        direction: 'in',
        counterparty: from,
        amount: fromCents(toCents(amount)),
        currency,
        date: localDate(now()),
        status: 'completed',
      };
      cents[currency] += toCents(amount);
      transactions = [transaction, ...transactions];
      lastIncoming = { transaction, at: now().getTime() };
      emit({ type: 'incoming_payment', transaction: { ...transaction } });
      changed();
      return transaction;
    },

    dismissIncoming() {
      if (!lastIncoming) return;
      lastIncoming = null;
      touch();
    },

    reset() {
      // Anyone still waiting on a confirm gets an answer before the slate is wiped.
      for (const entry of transfers.values()) {
        if (!entry.result) settle(entry, 'cancelled', { status: 'cancelled', reason: 'The demo was reset' });
      }
      load();
      changed();
    },
  };
}
