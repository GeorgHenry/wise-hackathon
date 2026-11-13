// A stand-in for the app's bank object, with the same methods the front end
// provides (see README: bank contract). Used by the demo page, the tests and
// scripts/live-check.mjs. All names, balances, rates and fees are invented for
// the demo; they are not Wise's prices.

const RATES_FROM_EUR = { EUR: 1, GBP: 0.8642, USD: 1.0835 }; // invented
const FEE_FIXED_EUR = 0.39; // invented
const FEE_PERCENT = 0.0045; // invented
const QUOTE_LIFETIME_MS = 15 * 60 * 1000;

const round2 = (n) => Math.round(n * 100) / 100;

function bankError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Calendar date where the user is (toISOString would give the UTC date, a day off near midnight).
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (today, days) => {
  const d = new Date(today);
  d.setDate(d.getDate() - days);
  return localDate(d);
};

/**
 * @param {object} [options]
 * @param {'private'|'speaker'} [options.audio]  What getAudioPrivacy() answers.
 * @param {(transfer: object) => Promise<boolean>|boolean} [options.approve]  Stands in for Face ID.
 * @param {number} [options.approvalDelayMs]  Pause before approve() is asked, like a real Face ID prompt.
 * @param {Date} [options.today]
 * @param {object[]} [options.extraRecipients]  More saved people, e.g. a second Kadri for tests.
 * @param {boolean} [options.withContacts]  false: behave like a bank without findContacts.
 * @param {boolean} [options.withWiseUsers]  false: behave like a bank without findWiseUser.
 */
export function createMockBank({
  audio = 'private',
  approve = () => true,
  approvalDelayMs = 0,
  today = new Date(),
  extraRecipients = [],
  withContacts = true,
  withWiseUsers = true,
} = {}) {
  const balances = { EUR: 1840.25, GBP: 312.6 };
  const recipients = [
    { id: 'rcp_kadri', name: 'Kadri', nickname: 'my daughter', currency: 'GBP', detail: 'UK account ending 4417', verified: true },
    { id: 'rcp_oskar', name: 'Oskar', nickname: 'my grandson', currency: 'GBP', detail: 'UK account ending 9023', verified: true },
    { id: 'rcp_toivo', name: 'Toivo', nickname: 'my husband', currency: 'EUR', detail: 'EE account ending 5512', verified: true },
    ...extraRecipients,
  ];
  // People in the phone's contacts. Those on Wise can be paid straight to their Wise account.
  const contacts = [
    { id: 'ct_martin', name: 'Martin Saar', onWise: true, phone: '+372 5555 4410' },
    { id: 'ct_mari', name: 'Mari Lepp', onWise: false, phone: '+372 5555 1187' },
  ];
  // People on Wise who are neither saved nor in the contacts, found only by their exact Wisetag.
  const wiseUsers = [
    { id: 'wu_john', name: 'John Jensen', wisetag: 'johnj1999' },
    // Maria's mother in England, the person she pays in the pitch demo (same as app/src/bank/seed.ts).
    { id: 'wu_helen', name: 'Helen Brooks', wisetag: 'helen1953' },
  ];
  const transactions = [
    { id: 'tx_3', direction: 'in', counterparty: 'Pension payment', amount: 742.1, currency: 'EUR', date: dayOffset(today, 1), status: 'completed' },
    { id: 'tx_2', direction: 'out', counterparty: 'Oskar', amount: 30, currency: 'GBP', date: dayOffset(today, 6), status: 'completed' },
    { id: 'tx_1', direction: 'in', counterparty: 'Kadri', amount: 25, currency: 'GBP', date: dayOffset(today, 12), status: 'completed' },
  ];
  const quotes = new Map();
  const transfers = new Map();
  const listeners = new Set();
  let audioPrivacy = audio;
  let nextId = 1;

  const notify = (event) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // a broken listener must not break the bank
      }
    }
  };
  const snapshotBalances = () => Object.entries(balances).map(([currency, amount]) => ({ currency, amount: round2(amount) }));
  const matches = (r, q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${r.name} ${r.nickname ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w)) || hay.includes(q.toLowerCase());
  };

  return {
    async getBalances() {
      return snapshotBalances();
    },

    async listRecipients(query) {
      const q = String(query ?? '').trim();
      return recipients.filter((r) => !q || matches(r, q)).map((r) => ({ ...r }));
    },

    ...(withContacts
      ? {
          async findContacts(query) {
            const q = String(query ?? '').trim();
            return contacts.filter((c) => !q || matches(c, q)).map((c) => ({ ...c }));
          },
        }
      : {}),

    ...(withWiseUsers
      ? {
          // Exact match only; an @, capitals, spaces and punctuation are ignored ("@JohnJ1999", "john j 1999").
          async findWiseUser(wisetag) {
            const wanted = String(wisetag ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const user = wanted ? wiseUsers.find((u) => u.wisetag === wanted) : undefined;
            return user ? { ...user } : null;
          },
        }
      : {}),

    async listTransactions({ direction, counterparty, limit = 10 } = {}) {
      return transactions
        .filter((t) => !direction || t.direction === direction)
        .filter((t) => !counterparty || t.counterparty.toLowerCase().includes(String(counterparty).toLowerCase()))
        .slice(0, limit)
        .map((t) => ({ ...t }));
    },

    async getQuote({ recipientId, amount, currency, amountIs }) {
      const saved = recipients.find((r) => r.id === recipientId);
      const contact = saved ? null : contacts.find((c) => c.id === recipientId);
      const wiseUser = saved || contact || !withWiseUsers ? null : wiseUsers.find((u) => u.id === recipientId);
      if (!saved && !contact && !wiseUser) throw bankError('unknown_recipient', 'No saved recipient or contact with that id');
      if (contact && !contact.onWise) throw bankError('not_on_wise', 'This contact does not use Wise');
      if (!RATES_FROM_EUR[currency]) throw bankError('unsupported_currency', 'Currency not supported');
      const recipient = saved ?? contact ?? wiseUser;
      // A Wise account (a contact's, or one found by Wisetag) takes the currency the user names; a bank account has its own.
      const targetCurrency = saved ? saved.currency : currency;
      // Paid from the balance in that currency when it covers the amount, otherwise converted from euros.
      const sourceCurrency =
        amountIs === 'source' ? currency : (balances[targetCurrency] ?? 0) >= amount ? targetCurrency : 'EUR';
      const rate = RATES_FROM_EUR[targetCurrency] / RATES_FROM_EUR[sourceCurrency];
      const fee = sourceCurrency === targetCurrency ? 0 : round2(FEE_FIXED_EUR + FEE_PERCENT * (amountIs === 'source' ? amount : amount / rate));
      let sourceAmount;
      let targetAmount;
      if (amountIs === 'source') {
        sourceAmount = round2(amount);
        targetAmount = round2((amount - fee) * rate);
      } else {
        targetAmount = round2(amount);
        sourceAmount = round2(amount / rate + fee);
      }
      if (targetAmount <= 0) throw bankError('insufficient_funds', 'Amount is smaller than the fee');
      const quote = {
        id: `qt_${nextId++}`,
        recipientId,
        recipientName: recipient.name,
        recipientKind: saved ? 'saved' : contact ? 'contact' : 'wise_user',
        ...(wiseUser ? { recipientWisetag: wiseUser.wisetag } : {}),
        sourceAmount,
        sourceCurrency,
        targetAmount,
        targetCurrency,
        rate: round2(rate * 10000) / 10000,
        fee,
        feeCurrency: sourceCurrency,
        arrival: saved ? 'today' : 'in seconds',
        expiresAt: new Date(Date.now() + QUOTE_LIFETIME_MS).toISOString(),
      };
      quotes.set(quote.id, quote);
      return { ...quote };
    },

    async prepareTransfer(quoteId) {
      const quote = quotes.get(quoteId);
      if (!quote) throw bankError('not_found', 'No such quote');
      if (Date.parse(quote.expiresAt) < Date.now()) throw bankError('quote_expired', 'Quote expired');
      if (balances[quote.sourceCurrency] < quote.sourceAmount) throw bankError('insufficient_funds', 'Not enough money');
      const transfer = { transferId: `tr_${nextId++}`, ...quote, status: 'prepared' };
      transfers.set(transfer.transferId, { transfer, result: null, pending: null });
      notify({ type: 'changed' });
      return { ...transfer };
    },

    async confirmTransfer(transferId) {
      const entry = transfers.get(transferId);
      if (!entry) throw bankError('not_found', 'No such transfer');
      if (entry.result) return entry.result; // idempotent: money moves once
      if (entry.pending) return entry.pending;
      let settleNow;
      const cancelled = new Promise((resolve) => {
        settleNow = resolve;
      });
      entry.settleNow = settleNow;
      const flow = (async () => {
        if (approvalDelayMs) await new Promise((r) => setTimeout(r, approvalDelayMs));
        if (entry.result) return entry.result; // cancelled while waiting
        const { transfer } = entry;
        const approved = await approve(transfer);
        if (entry.result) return entry.result; // cancelled while Face ID was showing: cancel wins
        if (!approved) {
          entry.result = { status: 'declined', reason: 'Not approved on the phone' };
        } else if (balances[transfer.sourceCurrency] < transfer.sourceAmount) {
          entry.result = { status: 'failed', reason: 'Not enough money' };
        } else {
          balances[transfer.sourceCurrency] = round2(balances[transfer.sourceCurrency] - transfer.sourceAmount);
          const transaction = {
            id: `tx_${nextId++}`,
            direction: 'out',
            counterparty: transfer.recipientName,
            amount: transfer.targetAmount,
            currency: transfer.targetCurrency,
            date: localDate(new Date()),
            status: 'completed',
          };
          transactions.unshift(transaction);
          entry.result = { status: 'sent', transaction: { ...transaction }, balances: snapshotBalances() };
        }
        notify({ type: 'changed' });
        return entry.result;
      })();
      entry.pending = Promise.race([flow, cancelled]);
      return entry.pending;
    },

    async cancelTransfer(transferId) {
      const entry = transfers.get(transferId);
      if (!entry) throw bankError('not_found', 'No such transfer');
      if (entry.result?.status === 'sent') return { status: 'sent' }; // too late: it has gone
      if (!entry.result) entry.result = { status: 'cancelled' };
      entry.settleNow?.(entry.result); // a confirm waiting for Face ID ends now
      notify({ type: 'changed' });
      return { status: 'cancelled' };
    },

    async getAudioPrivacy() {
      return audioPrivacy;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    // Demo helpers (not part of the front end's contract).
    setAudioPrivacy(value) {
      audioPrivacy = value === 'speaker' ? 'speaker' : 'private';
      notify({ type: 'changed' });
    },
    simulateIncoming({ from = 'Kadri', amount = 40, currency = 'GBP' } = {}) {
      const transaction = {
        id: `tx_${nextId++}`,
        direction: 'in',
        counterparty: from,
        amount,
        currency,
        date: localDate(new Date()),
        status: 'completed',
      };
      balances[currency] = round2((balances[currency] ?? 0) + amount);
      transactions.unshift(transaction);
      notify({ type: 'incoming_payment', transaction: { ...transaction } });
      notify({ type: 'changed' });
      return transaction;
    },
  };
}
