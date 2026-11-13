import { beforeEach, describe, expect, it } from 'vitest';
import { type Approver, type BankStore, createBankStore } from './store';
import type { BankEvent, PreparedTransfer } from './types';

const NOON = new Date(2026, 10, 13, 12, 0);
const SEED_BALANCES = [
  { currency: 'EUR', amount: 1840.25 },
  { currency: 'GBP', amount: 312.6 },
];

let clock = NOON;
const now = (): Date => clock;
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const approve: Approver = async () => true;
const refuse: Approver = async () => false;

function makeStore(approver?: Approver): BankStore {
  return createBankStore({ now, approver });
}

/** An approval step the test answers by hand, like a Face ID sheet that is still showing. */
function heldApproval() {
  let calls = 0;
  let answer: (approved: boolean) => void = () => {};
  const approver: Approver = () => {
    calls += 1;
    return new Promise<boolean>((resolve) => {
      answer = resolve;
    });
  };
  return { approver, answer: (approved: boolean) => answer(approved), calls: () => calls };
}

/** Thirty pounds for Oskar, paid from the pound balance: no conversion and no fee. */
async function prepareThirtyPoundsForOskar(store: BankStore): Promise<PreparedTransfer> {
  const quote = await store.getQuote({ recipientId: 'rcp_oskar', amount: 30, currency: 'GBP', amountIs: 'target' });
  return store.prepareTransfer(quote.id);
}

beforeEach(() => {
  clock = NOON;
});

describe('reading the account', () => {
  it('starts from the seed balances', async () => {
    expect(await makeStore().getBalances()).toEqual(SEED_BALANCES);
  });

  it('finds a saved person by nickname', async () => {
    const found = await makeStore().listRecipients('my daughter');
    expect(found.map((r) => r.id)).toEqual(['rcp_kadri']);
  });

  it('finds a saved person by first name, whatever the case', async () => {
    const found = await makeStore().listRecipients('OSKAR');
    expect(found.map((r) => r.id)).toEqual(['rcp_oskar']);
  });

  it('returns everyone when no name is given', async () => {
    expect(await makeStore().listRecipients()).toHaveLength(3);
  });

  it('finds nobody for a name that is not saved', async () => {
    expect(await makeStore().listRecipients('nobody')).toEqual([]);
  });

  it('returns only the newest incoming payment when asked for one', async () => {
    const payments = await makeStore().listTransactions({ direction: 'in', limit: 1 });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ direction: 'in', counterparty: 'Pension payment', amount: 742.1 });
  });

  it('filters payments by the other person', async () => {
    const payments = await makeStore().listTransactions({ counterparty: 'kadri' });
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((p) => p.counterparty === 'Kadri Tamm')).toBe(true);
  });
});

describe('quotes', () => {
  it('pays from the balance in the recipient’s currency when it covers the amount', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_oskar', amount: 30, currency: 'GBP', amountIs: 'target' });
    expect(quote).toMatchObject({
      recipientName: 'Oskar Tamm',
      targetAmount: 30,
      targetCurrency: 'GBP',
      sourceAmount: 30,
      sourceCurrency: 'GBP',
      fee: 0,
      rate: 1,
    });
  });

  it('converts from euros, adding the fee, when the pounds do not cover the amount', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_oskar', amount: 400, currency: 'GBP', amountIs: 'target' });
    expect(quote).toMatchObject({
      targetAmount: 400,
      targetCurrency: 'GBP',
      sourceAmount: 465.33,
      sourceCurrency: 'EUR',
      fee: 2.47,
      feeCurrency: 'EUR',
      rate: 0.8642,
    });
  });

  it('takes the fee out of the amount when the user names what they pay', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_oskar', amount: 100, currency: 'EUR', amountIs: 'source' });
    expect(quote).toMatchObject({ sourceAmount: 100, sourceCurrency: 'EUR', fee: 0.84, targetAmount: 85.69, targetCurrency: 'GBP' });
  });

  it('charges no fee and uses rate 1 inside one currency', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_toivo', amount: 50, currency: 'EUR', amountIs: 'target' });
    expect(quote).toMatchObject({ sourceAmount: 50, sourceCurrency: 'EUR', targetAmount: 50, targetCurrency: 'EUR', rate: 1, fee: 0 });
  });

  it('treats an amount in the recipient’s currency as what they receive when not told otherwise', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_oskar', amount: 30, currency: 'GBP' });
    expect(quote.targetAmount).toBe(30);
  });

  it('refuses a recipient that is not saved', async () => {
    const request = makeStore().getQuote({ recipientId: 'rcp_stranger', amount: 10, currency: 'EUR' });
    await expect(request).rejects.toMatchObject({ code: 'unknown_recipient' });
  });
});

describe('preparing a transfer', () => {
  it('moves no money', async () => {
    const store = makeStore(approve);
    await prepareThirtyPoundsForOskar(store);
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
  });

  it('shows the waiting transfer to the screens', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    expect(store.getSnapshot().transfer).toMatchObject({ phase: 'prepared', transfer: { transferId: transfer.transferId, targetAmount: 30 } });
  });

  it('rejects a quote it never issued', async () => {
    await expect(makeStore().prepareTransfer('qt_made_up')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects a quote older than its lifetime', async () => {
    const store = makeStore();
    const quote = await store.getQuote({ recipientId: 'rcp_oskar', amount: 30, currency: 'GBP' });
    clock = new Date(NOON.getTime() + 16 * 60 * 1000);
    await expect(store.prepareTransfer(quote.id)).rejects.toMatchObject({ code: 'quote_expired' });
  });

  it('rejects an amount the balance cannot cover', async () => {
    const store = makeStore();
    const quote = await store.getQuote({ recipientId: 'rcp_toivo', amount: 5000, currency: 'EUR' });
    await expect(store.prepareTransfer(quote.id)).rejects.toMatchObject({ code: 'insufficient_funds' });
  });

  it('lets a newer transfer replace one that was still waiting', async () => {
    const store = makeStore(approve);
    const first = await prepareThirtyPoundsForOskar(store);
    const second = await prepareThirtyPoundsForOskar(store);
    expect(await store.confirmTransfer(first.transferId)).toMatchObject({ status: 'cancelled' });
    expect(store.getSnapshot().transfer?.transfer.transferId).toBe(second.transferId);
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
  });
});

describe('confirming a transfer', () => {
  it('takes exactly the quoted amount from the paying balance once approved', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const result = await store.confirmTransfer(transfer.transferId);
    expect(result.status).toBe('sent');
    expect(await store.getBalances()).toEqual([
      { currency: 'EUR', amount: 1840.25 },
      { currency: 'GBP', amount: 282.6 },
    ]);
  });

  it('takes the converted amount and its fee from euros when pounds do not cover it', async () => {
    const store = makeStore(approve);
    const quote = await store.getQuote({ recipientId: 'rcp_oskar', amount: 400, currency: 'GBP' });
    const transfer = await store.prepareTransfer(quote.id);
    await store.confirmTransfer(transfer.transferId);
    expect(await store.getBalances()).toEqual([
      { currency: 'EUR', amount: 1374.92 },
      { currency: 'GBP', amount: 312.6 },
    ]);
  });

  it('fails without asking for approval when the price has expired', async () => {
    const held = heldApproval();
    const store = makeStore(held.approver);
    const transfer = await prepareThirtyPoundsForOskar(store);
    clock = new Date(NOON.getTime() + 16 * 60 * 1000);
    expect(await store.confirmTransfer(transfer.transferId)).toMatchObject({ status: 'failed' });
    expect(held.calls()).toBe(0);
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
    expect(store.getSnapshot().transfer?.phase).toBe('failed');
  });

  it('moves nothing when the price expires while approval is showing', async () => {
    const held = heldApproval();
    const store = makeStore(held.approver);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const pending = store.confirmTransfer(transfer.transferId);
    await tick();
    clock = new Date(NOON.getTime() + 16 * 60 * 1000);
    held.answer(true);
    expect(await pending).toMatchObject({ status: 'failed' });
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
  });

  it('lists the payment first, as what the recipient received', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    await store.confirmTransfer(transfer.transferId);
    const [newest] = await store.listTransactions();
    expect(newest).toMatchObject({ direction: 'out', counterparty: 'Oskar Tamm', amount: 30, currency: 'GBP', date: '2026-11-13', status: 'completed' });
  });

  it('returns the first result again and moves money once when confirmed twice', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const first = await store.confirmTransfer(transfer.transferId);
    const second = await store.confirmTransfer(transfer.transferId);
    expect(second).toEqual(first);
    expect((await store.getBalances())[1]).toEqual({ currency: 'GBP', amount: 282.6 });
  });

  it('asks for approval once when two confirms overlap', async () => {
    const held = heldApproval();
    const store = makeStore(held.approver);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const first = store.confirmTransfer(transfer.transferId);
    const second = store.confirmTransfer(transfer.transferId);
    await tick();
    held.answer(true);
    expect(await second).toEqual(await first);
    expect(held.calls()).toBe(1);
    expect((await store.getBalances())[1]).toEqual({ currency: 'GBP', amount: 282.6 });
  });

  it('shows the approval step to the screens while it waits, then the result', async () => {
    const held = heldApproval();
    const store = makeStore(held.approver);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const pending = store.confirmTransfer(transfer.transferId);
    await tick();
    expect(store.getSnapshot().transfer?.phase).toBe('approving');
    held.answer(true);
    await pending;
    expect(store.getSnapshot().transfer).toMatchObject({ phase: 'sent', transaction: { counterparty: 'Oskar Tamm' } });
  });

  it('moves nothing when approval is refused', async () => {
    const store = makeStore(refuse);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const result = await store.confirmTransfer(transfer.transferId);
    expect(result).toMatchObject({ status: 'declined' });
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
    expect(store.getSnapshot().transfer?.phase).toBe('declined');
  });

  it('moves nothing when no approval step is attached', async () => {
    const store = makeStore();
    const transfer = await prepareThirtyPoundsForOskar(store);
    expect(await store.confirmTransfer(transfer.transferId)).toMatchObject({ status: 'declined' });
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
  });

  it('moves nothing when cancelled while approval is showing, even if approval then succeeds', async () => {
    const held = heldApproval();
    const store = makeStore(held.approver);
    const transfer = await prepareThirtyPoundsForOskar(store);
    const pending = store.confirmTransfer(transfer.transferId);
    await tick();
    await store.cancelTransfer(transfer.transferId);
    held.answer(true);
    expect(await pending).toMatchObject({ status: 'cancelled' });
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
    expect(store.getSnapshot().transfer?.phase).toBe('cancelled');
  });

  it('answers a late cancel with what really happened, and does not undo the payment', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    await store.confirmTransfer(transfer.transferId);
    expect(await store.cancelTransfer(transfer.transferId)).toEqual({ status: 'sent' });
    expect(store.getSnapshot().transfer?.phase).toBe('sent');
    expect((await store.getBalances())[1]).toEqual({ currency: 'GBP', amount: 282.6 });
  });

  it('answers cancelled when a waiting transfer is cancelled', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    expect(await store.cancelTransfer(transfer.transferId)).toEqual({ status: 'cancelled' });
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
  });

  it('rejects a transfer id it never issued', async () => {
    const store = makeStore(approve);
    await expect(store.confirmTransfer('tr_made_up')).rejects.toMatchObject({ code: 'not_found' });
    await expect(store.cancelTransfer('tr_made_up')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('money arriving', () => {
  it('adds the amount to the balance and lists it first', async () => {
    const store = makeStore();
    store.simulateIncoming({ from: 'Kadri Tamm', amount: 40, currency: 'GBP' });
    expect((await store.getBalances())[1]).toEqual({ currency: 'GBP', amount: 352.6 });
    const [newest] = await store.listTransactions();
    expect(newest).toMatchObject({ direction: 'in', counterparty: 'Kadri Tamm', amount: 40, currency: 'GBP', date: '2026-11-13' });
  });

  it('tells subscribers about the payment, then that something changed', () => {
    const store = makeStore();
    const seen: BankEvent['type'][] = [];
    store.subscribe((event) => seen.push(event.type));
    store.simulateIncoming();
    expect(seen).toEqual(['incoming_payment', 'changed']);
  });

  it('stops telling a subscriber that has unsubscribed', () => {
    const store = makeStore();
    const seen: BankEvent['type'][] = [];
    const unsubscribe = store.subscribe((event) => seen.push(event.type));
    unsubscribe();
    store.simulateIncoming();
    expect(seen).toEqual([]);
  });

  it('keeps the latest arrival for the screens until it is dismissed', () => {
    const store = makeStore();
    const payment = store.simulateIncoming();
    expect(store.getSnapshot().lastIncoming?.transaction.id).toBe(payment.id);
    store.dismissIncoming();
    expect(store.getSnapshot().lastIncoming).toBeNull();
  });
});

describe('what the screens see', () => {
  it('keeps the same snapshot object until something changes', () => {
    const store = makeStore();
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before);
    store.setAudioPrivacy('speaker');
    expect(store.getSnapshot()).not.toBe(before);
  });

  it('calls change listeners when the balance moves', async () => {
    const store = makeStore(approve);
    let changes = 0;
    store.onChange(() => {
      changes += 1;
    });
    const transfer = await prepareThirtyPoundsForOskar(store);
    const afterPrepare = changes;
    await store.confirmTransfer(transfer.transferId);
    expect(afterPrepare).toBeGreaterThan(0);
    expect(changes).toBeGreaterThan(afterPrepare);
  });

  it('notes that the agent looked at the balances', async () => {
    const store = makeStore();
    await store.getBalances();
    expect(store.getSnapshot().activity).toMatchObject({ kind: 'balances' });
  });

  it('notes which payments the agent looked at', async () => {
    const store = makeStore();
    await store.listTransactions({ direction: 'in', counterparty: 'Kadri' });
    expect(store.getSnapshot().activity).toMatchObject({ kind: 'transactions', direction: 'in', counterparty: 'Kadri' });
  });

  it('answers with the audio setting the presenter chose', async () => {
    const store = makeStore();
    expect(await store.getAudioPrivacy()).toBe('private');
    store.setAudioPrivacy('speaker');
    expect(await store.getAudioPrivacy()).toBe('speaker');
    expect(store.getSnapshot().audioPrivacy).toBe('speaker');
  });

  it('goes back to the seed on reset', async () => {
    const store = makeStore(approve);
    const transfer = await prepareThirtyPoundsForOskar(store);
    await store.confirmTransfer(transfer.transferId);
    store.simulateIncoming();
    store.setAudioPrivacy('speaker');
    store.reset();
    expect(await store.getBalances()).toEqual(SEED_BALANCES);
    expect(store.getSnapshot()).toMatchObject({ transfer: null, lastIncoming: null, audioPrivacy: 'private' });
    expect(store.getSnapshot().transactions).toHaveLength(5);
  });
});

describe('phone contacts', () => {
  it('finds a contact by name, whatever the case', async () => {
    const found = await makeStore().findContacts('MARTIN');
    expect(found).toEqual([{ id: 'ct_martin', name: 'Martin Saar', onWise: true }]);
  });

  it('returns every contact when no name is given, those without Wise included', async () => {
    const everyone = await makeStore().findContacts();
    expect(everyone.map((c) => [c.name, c.onWise])).toEqual([
      ['Martin Saar', true],
      ['Mari Lepp', false],
    ]);
  });

  it('quotes a contact in the currency the user named, arriving in seconds', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'ct_martin', amount: 20, currency: 'USD', amountIs: 'target' });
    expect(quote).toMatchObject({
      recipientName: 'Martin Saar',
      recipientKind: 'contact',
      targetAmount: 20,
      targetCurrency: 'USD',
      sourceAmount: 18.93,
      sourceCurrency: 'EUR',
      fee: 0.47,
      rate: 1.0835,
      arrival: 'in seconds',
    });
  });

  it('pays a contact from the matching balance when it covers the amount', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'ct_martin', amount: 20, currency: 'GBP', amountIs: 'target' });
    expect(quote).toMatchObject({ targetCurrency: 'GBP', sourceAmount: 20, sourceCurrency: 'GBP', fee: 0, rate: 1 });
  });

  it('marks a saved recipient’s quote as saved, arriving today', async () => {
    const quote = await makeStore().getQuote({ recipientId: 'rcp_oskar', amount: 30, currency: 'GBP' });
    expect(quote).toMatchObject({ recipientKind: 'saved', arrival: 'today' });
  });

  it('refuses a contact who does not use Wise', async () => {
    const request = makeStore().getQuote({ recipientId: 'ct_mari', amount: 10, currency: 'EUR' });
    await expect(request).rejects.toMatchObject({ code: 'not_on_wise' });
  });

  it('refuses a currency it does not know', async () => {
    const request = makeStore().getQuote({ recipientId: 'ct_martin', amount: 10, currency: 'SEK' as never });
    await expect(request).rejects.toMatchObject({ code: 'unsupported_currency' });
  });

  it('sends to a contact after approval and lists the payment under their name', async () => {
    const store = makeStore(approve);
    const quote = await store.getQuote({ recipientId: 'ct_martin', amount: 20, currency: 'USD', amountIs: 'target' });
    const transfer = await store.prepareTransfer(quote.id);
    expect(await store.confirmTransfer(transfer.transferId)).toMatchObject({ status: 'sent' });
    expect(await store.getBalances()).toEqual([
      { currency: 'EUR', amount: 1821.32 },
      { currency: 'GBP', amount: 312.6 },
    ]);
    const [newest] = await store.listTransactions({ direction: 'out', counterparty: 'Martin Saar' });
    expect(newest).toMatchObject({ counterparty: 'Martin Saar', amount: 20, currency: 'USD' });
  });
});
