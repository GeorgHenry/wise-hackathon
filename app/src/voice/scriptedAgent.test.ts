import { describe, expect, it, vi } from 'vitest';
import { type Approver, type BankStore, createBankStore } from '../bank/store';
import { startScriptedVoice } from './scriptedAgent';
import type { VoiceEvent, VoiceSession } from './types';

const NOON = new Date(2026, 10, 13, 12, 0);
const SEED_EUR = { currency: 'EUR', amount: 1840.25 };

interface Call {
  store: BankStore;
  session: VoiceSession;
  events: VoiceEvent[];
  /** Everything the agent has said so far. */
  said: () => string[];
  /** Sends a line and waits for the agent's next reply. */
  say: (text: string) => Promise<string>;
}

async function startCall(approver: Approver = async () => true): Promise<Call> {
  const store = createBankStore({ now: () => NOON, approver });
  const events: VoiceEvent[] = [];
  const said = (): string[] => events.flatMap((e) => (e.type === 'transcript' && e.role === 'agent' ? [e.text] : []));
  const settled = (count: number): Promise<void> =>
    vi.waitFor(() => {
      expect(said().length).toBeGreaterThan(count);
      expect(events.at(-1)).toEqual({ type: 'mode', mode: 'listening' });
    });
  const session = await startScriptedVoice({
    bank: store,
    onEvent: (event) => events.push(event),
    userName: 'Malle',
    speak: async () => {},
    now: () => NOON,
  });
  await settled(0);
  const say = async (text: string): Promise<string> => {
    const before = said().length;
    session.sendText(text);
    await settled(before);
    return said().at(-1) ?? '';
  };
  return { store, session, events, said, say };
}

describe('starting', () => {
  it('connects, greets the user by name, then listens', async () => {
    const { events, said } = await startCall();
    expect(events.slice(0, 2)).toEqual([
      { type: 'status', status: 'connecting' },
      { type: 'status', status: 'connected' },
    ]);
    expect(said()[0]).toContain('Hello Malle');
    expect(events.at(-1)).toEqual({ type: 'mode', mode: 'listening' });
  });

  it('shows the user’s typed words as their line', async () => {
    const { events, say } = await startCall();
    await say("What's my balance?");
    expect(events).toContainEqual({ type: 'transcript', role: 'user', text: "What's my balance?", final: true, typed: true });
  });
});

describe('balance', () => {
  it('reads both balances when audio is private', async () => {
    const { say } = await startCall();
    const reply = await say("What's my balance?");
    expect(reply).toContain('1,840 euros and 25 cents');
    expect(reply).toContain('312 pounds and 60 pence');
  });

  it('reads no amounts on the loudspeaker', async () => {
    const { store, say } = await startCall();
    store.setAudioPrivacy('speaker');
    const reply = await say("What's my balance?");
    expect(reply).not.toMatch(/\d/);
    expect(reply).toMatch(/headphones/i);
  });
});

describe('money coming in', () => {
  it('says who the latest payment came from and how much', async () => {
    const { say } = await startCall();
    const reply = await say('Has any money arrived?');
    expect(reply).toContain('742 euros and 10 cents');
    expect(reply).toContain('Pension payment');
    expect(reply).toContain('yesterday');
  });

  it('answers about one person when asked about them', async () => {
    const { say } = await startCall();
    const reply = await say("Did Kadri's money arrive?");
    expect(reply).toContain('25 pounds');
    expect(reply).toContain('Kadri Tamm');
  });

  it('announces a payment that arrives during the call', async () => {
    const { store, said, events } = await startCall();
    const before = said().length;
    store.simulateIncoming({ from: 'Kadri Tamm', amount: 40, currency: 'GBP' });
    await vi.waitFor(() => expect(said().length).toBeGreaterThan(before));
    expect(said().at(-1)).toContain('Kadri Tamm');
    expect(said().at(-1)).toContain('40 pounds');
    expect(events.some((e) => e.type === 'incoming_payment')).toBe(true);
  });
});

describe('sending money', () => {
  it('reads the details back and waits, without moving money', async () => {
    const { store, say } = await startCall();
    const reply = await say('Send Oskar 30 pounds');
    expect(reply).toContain('30 pounds to Oskar Tamm');
    expect(reply).toContain('The fee is 55 cents');
    expect(reply).toContain('35 euros and 26 cents');
    expect(reply).toContain('Shall I send it?');
    expect(store.getSnapshot().transfer?.phase).toBe('prepared');
    expect((await store.getBalances())[0]).toEqual(SEED_EUR);
  });

  it('sends after a yes and an approved Face ID', async () => {
    const { store, say } = await startCall();
    await say('Send Oskar 30 pounds');
    const reply = await say('Yes, send it');
    expect(reply).toMatch(/^Sent\./);
    expect(store.getSnapshot().transfer?.phase).toBe('sent');
    expect((await store.getBalances())[0]).toEqual({ currency: 'EUR', amount: 1804.99 });
  });

  it('asks for the amount when it is missing, then carries on', async () => {
    const { store, say } = await startCall();
    expect(await say('I want to send money to Kadri')).toMatch(/how much/i);
    expect(await say('20 pounds')).toContain('20 pounds to Kadri Tamm');
    expect(store.getSnapshot().transfer?.transfer.targetAmount).toBe(20);
  });

  it('prepares a new transfer when the amount changes after the readback', async () => {
    const { store, say } = await startCall();
    await say('Send Oskar 30 pounds');
    const first = store.getSnapshot().transfer?.transfer.transferId;
    const reply = await say('Make it 40 pounds');
    expect(reply).toContain('40 pounds to Oskar Tamm');
    const current = store.getSnapshot().transfer;
    expect(current?.transfer.transferId).not.toBe(first);
    expect(current).toMatchObject({ phase: 'prepared', transfer: { targetAmount: 40 } });
  });

  it('cancels on a no and moves nothing', async () => {
    const { store, say } = await startCall();
    await say('Send Oskar 30 pounds');
    const reply = await say('No, cancel');
    expect(reply).toMatch(/cancelled/i);
    expect(store.getSnapshot().transfer?.phase).toBe('cancelled');
    expect((await store.getBalances())[0]).toEqual(SEED_EUR);
  });

  it('says nothing was sent when Face ID does not match', async () => {
    const { store, say } = await startCall(async () => false);
    await say('Send Oskar 30 pounds');
    const reply = await say('Yes');
    expect(reply).toMatch(/nothing was sent/i);
    expect((await store.getBalances())[0]).toEqual(SEED_EUR);
  });

  it('refuses a person who is not saved and names who is', async () => {
    const { store, say } = await startCall();
    const reply = await say('Send Peeter 20 euros');
    expect(reply).toContain('Kadri, Oskar and Toivo');
    expect(store.getSnapshot().transfer).toBeNull();
  });

  it('refuses more than the voice limit', async () => {
    const { store, say } = await startCall();
    const reply = await say('Send Toivo 1500 euros');
    expect(reply).toMatch(/up to 1,000/);
    expect(store.getSnapshot().transfer).toBeNull();
  });

  it('refuses when what the user would pay passes the voice limit', async () => {
    const { store, say } = await startCall();
    const reply = await say('Send Kadri 900 pounds'); // costs about 1,046 euros
    expect(reply).toMatch(/up to 1,000/);
    expect(store.getSnapshot().transfer).toBeNull();
  });

  it('says so when the balance does not cover it', async () => {
    const { store, say } = await startCall();
    await say('Send Toivo 950 euros');
    await say('Yes');
    const reply = await say('Send Toivo 950 euros');
    expect(reply).toMatch(/not enough/i);
    expect(store.getSnapshot().transfer?.phase).toBe('sent');
    expect((await store.getBalances())[0]).toEqual({ currency: 'EUR', amount: 890.25 });
  });

  it('has nothing to send when the user says yes out of the blue', async () => {
    const { store, say } = await startCall();
    const reply = await say('Yes');
    expect(reply).toMatch(/nothing waiting/i);
    expect(store.getSnapshot().transfer).toBeNull();
  });

  it('drops the waiting transfer when the app says the user tapped Cancel', async () => {
    const { store, session, said, say } = await startCall();
    await say('Send Oskar 30 pounds');
    const transferId = store.getSnapshot().transfer?.transfer.transferId ?? '';
    await store.cancelTransfer(transferId);
    const before = said().length;
    session.notify('The user tapped Cancel on the card');
    await vi.waitFor(() => expect(said().length).toBeGreaterThan(before));
    expect(await say('Yes')).toMatch(/nothing waiting/i);
  });
});

describe('ending', () => {
  it('reports the disconnect and stops answering', async () => {
    const { session, events, said } = await startCall();
    await session.stop();
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'disconnected' });
    const before = said().length;
    session.sendText("What's my balance?");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(said().length).toBe(before);
  });
});
