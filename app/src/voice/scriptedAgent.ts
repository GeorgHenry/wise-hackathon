import { speakDate, speakMoney } from '../bank/money';
import type { Contact, Currency, PreparedTransfer, Recipient } from '../bank/types';
import { parseIntent } from './intent';
import { pauseFor } from './speech';
import type { StartVoiceOptions, VoiceEvent, VoiceSession } from './types';

// A rule-based stand-in for the live voice agent. It needs no microphone and no
// network: the presenter taps a suggested phrase or types. It follows the same
// steps (find the person, quote, read back, wait for a yes, Face ID, report the
// real result), calls the same bank methods and emits the same events.

export interface ScriptedOptions extends StartVoiceOptions {
  /** Says a line aloud and resolves when it has finished. */
  speak?: (text: string) => Promise<void>;
  now?: () => Date;
}

/** Largest amount one voice transfer may send, as in voice-agent/web/tools-runtime.js. */
export const VOICE_LIMIT = 1000;

const HELP = 'You can ask for your balance, send money to someone you have saved, or ask whether money has arrived.';
const ON_SPEAKER =
  'You are on the loudspeaker, so I will not read amounts out. Put in headphones or hold the phone to your ear, then ask again.';
const OVER_LIMIT = `By voice you can send up to ${VOICE_LIMIT.toLocaleString('en-GB')} at a time. For more, use the app. Nothing was sent.`;

/** Someone money can go to: a saved recipient, or a phone contact. */
interface Payee {
  id: string;
  name: string;
  nickname?: string;
  /** A saved recipient's account currency. A contact takes whatever currency is named. */
  currency?: Currency;
  contact?: Contact;
}

const fromRecipient = (r: Recipient): Payee => ({ id: r.id, name: r.name, nickname: r.nickname, currency: r.currency });
const fromContact = (c: Contact): Payee => ({ id: c.id, name: c.name, contact: c });

interface Draft {
  recipient?: Payee;
  amount?: number;
  currency?: Currency;
}

const firstName = (name: string): string => name.split(' ')[0] ?? name;

function listNames(people: Payee[]): string {
  const names = people.map((p) => firstName(p.name));
  if (names.length < 2) return names[0] ?? 'nobody yet';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The person the sentence talks about, by first name or by nickname ("my daughter"). */
function mentioned(text: string, people: Payee[]): Payee | undefined {
  const words = text.toLowerCase().split(/[^\p{L}]+/u);
  return people.find((p) => {
    const nickname = p.nickname?.toLowerCase().replace(/^my /, '');
    return words.includes(firstName(p.name).toLowerCase()) || (nickname !== undefined && words.includes(nickname));
  });
}

/** `paidBefore` is given for a phone contact, so the user hears whether this is a first payment. */
function readback(t: PreparedTransfer, paidBefore?: boolean): string {
  const fee = t.fee > 0 ? `The fee is ${speakMoney(t.fee, t.feeCurrency)}.` : 'There is no fee.';
  const to =
    t.recipientKind === 'contact'
      ? `${t.recipientName}'s Wise account. ${t.recipientName} is in your phone contacts, and you ${paidBefore ? 'have' : "haven't"} paid them before.`
      : `${t.recipientName}.`;
  return (
    `You are sending ${speakMoney(t.targetAmount, t.targetCurrency)} to ${to} ${fee} ` +
    `You pay ${speakMoney(t.sourceAmount, t.sourceCurrency)} in total. It should arrive ${t.arrival}.`
  );
}

function sayForError(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'unknown_recipient') return 'That person is not saved, so I cannot send to them. Nothing was sent.';
  if (code === 'not_on_wise') return 'That person does not use Wise, so I cannot pay them by voice. Nothing was sent.';
  if (code === 'unsupported_currency') return 'I can only send euros, pounds or dollars. Nothing was sent.';
  if (code === 'insufficient_funds') return 'There is not enough money in your balance for that. Nothing was sent.';
  if (code === 'quote_expired') return 'That price has expired. Ask me again and I will get a new one.';
  return 'Something went wrong. Nothing was sent.';
}

export async function startScriptedVoice(options: ScriptedOptions): Promise<VoiceSession> {
  const { bank, onEvent, userName = 'there' } = options;
  const now = options.now ?? (() => new Date());
  const speak = options.speak ?? pauseFor;

  let ended = false;
  let draft: Draft | null = null;
  let pending: PreparedTransfer | null = null;
  let queue: Promise<void> = Promise.resolve();

  const emit = (event: VoiceEvent): void => {
    if (!ended) onEvent(event);
  };

  /** `more` keeps the turn: another line or a tool call follows straight away. */
  async function say(text: string, more = false): Promise<void> {
    emit({ type: 'mode', mode: 'speaking' });
    emit({ type: 'transcript', role: 'agent', text, final: true });
    await speak(text);
    if (!more) emit({ type: 'mode', mode: 'listening' });
  }

  async function tool<T>(name: string, run: () => Promise<T>): Promise<T> {
    emit({ type: 'tool', name, phase: 'start' });
    try {
      const result = await run();
      emit({ type: 'tool', name, phase: 'end', ok: true });
      return result;
    } catch (error) {
      emit({ type: 'tool', name, phase: 'end', ok: false });
      throw error;
    }
  }

  /** One thing at a time, in the order it was asked. */
  function enqueue(job: () => Promise<void>): void {
    queue = queue.then(async () => {
      if (ended) return;
      try {
        await job();
      } catch (error) {
        console.error('[scripted agent]', error);
        await say('Something went wrong. Nothing was sent.');
      }
    });
  }

  const amountsAllowed = async (): Promise<boolean> => (await bank.getAudioPrivacy()) === 'private';

  async function balance(): Promise<void> {
    const [allowed, balances] = await tool('get_balances', async () => [await amountsAllowed(), await bank.getBalances()] as const);
    if (!allowed) return say(ON_SPEAKER);
    const parts = balances.map((b) => speakMoney(b.amount, b.currency));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}` : parts[0];
    return say(`You have ${list}.`);
  }

  async function incoming(from: Payee | undefined): Promise<void> {
    const query = { direction: 'in' as const, limit: 3, ...(from ? { counterparty: firstName(from.name) } : {}) };
    const [allowed, payments] = await tool('get_transactions', async () => [await amountsAllowed(), await bank.listTransactions(query)] as const);
    const latest = payments[0];
    if (!latest) return say(`No money has arrived${from ? ` from ${from.name}` : ''} lately.`);
    const day = speakDate(latest.date, now());
    const when = day === 'today' || day === 'yesterday' ? day : `on ${day}`;
    if (!allowed) return say(`Yes, money arrived from ${latest.counterparty} ${when}. I will read the amount when your audio is private.`);
    return say(`Yes. ${speakMoney(latest.amount, latest.currency)} arrived from ${latest.counterparty} ${when}.`);
  }

  async function send(people: Payee[], named: Payee | undefined, amount?: number, currency?: Currency): Promise<void> {
    draft = { ...draft, ...(named ? { recipient: named } : {}), ...(amount !== undefined ? { amount } : {}), ...(currency ? { currency } : {}) };
    const { recipient } = draft;
    if (!recipient) {
      const saved = listNames(people.filter((p) => !p.contact));
      return say(`By voice I can only send to people you have saved (${saved}) or to a phone contact who uses Wise. Who is it for?`);
    }
    if (recipient.contact && !recipient.contact.onWise) {
      draft = null;
      return say(`${recipient.name} is in your phone contacts but does not use Wise, so I cannot pay them by voice. Nothing was sent.`);
    }
    if (draft.amount === undefined) return say(`How much should I send to ${firstName(recipient.name)}?`);

    const wanted = draft.amount;
    const namedCurrency = draft.currency ?? recipient.currency ?? 'EUR';
    if (wanted > VOICE_LIMIT) return say(OVER_LIMIT);

    let paidBefore: boolean | undefined;
    try {
      if (recipient.contact) {
        const earlier = await tool('get_transactions', () => bank.listTransactions({ direction: 'out', counterparty: recipient.name, limit: 1 }));
        paidBefore = earlier.length > 0;
      }
      const quote = await tool('get_quote', () =>
        bank.getQuote({
          recipientId: recipient.id,
          amount: wanted,
          currency: namedCurrency,
          // Said in the recipient's currency (or to a contact, who takes any): that is what arrives.
          // Otherwise it is what the user pays.
          amountIs: recipient.contact || namedCurrency === recipient.currency ? 'target' : 'source',
        }),
      );
      if (quote.sourceAmount > VOICE_LIMIT || quote.targetAmount > VOICE_LIMIT) return say(OVER_LIMIT);
      pending = await tool('prepare_transfer', () => bank.prepareTransfer(quote.id));
    } catch (error) {
      return say(sayForError(error));
    }
    return say(`${readback(pending, paidBefore)} Shall I send it?`);
  }

  async function confirm(transfer: PreparedTransfer): Promise<void> {
    await say('Please approve it with Face ID.', true);
    pending = null;
    draft = null;
    try {
      const result = await tool('confirm_transfer', () => bank.confirmTransfer(transfer.transferId));
      if (result.status === 'sent') {
        return say(`Sent. ${speakMoney(transfer.targetAmount, transfer.targetCurrency)} is on its way to ${transfer.recipientName}.`);
      }
      if (result.status === 'declined') return say('Face ID did not match, so nothing was sent.');
      if (result.status === 'cancelled') return say('That was cancelled. Nothing was sent.');
      return say(`It was not sent. ${result.reason}. No money moved.`);
    } catch (error) {
      return say(sayForError(error));
    }
  }

  async function cancel(): Promise<void> {
    const waiting = pending;
    pending = null;
    draft = null;
    if (!waiting) return say('Okay. There is nothing waiting to send.');
    const { status } = await tool('cancel_transfer', () => bank.cancelTransfer(waiting.transferId));
    if (status === 'sent') return say('That payment had already been sent, so I could not cancel it.');
    return say('Cancelled. Nothing was sent.');
  }

  async function handle(text: string): Promise<void> {
    const intent = parseIntent(text);
    const people = [...(await bank.listRecipients()).map(fromRecipient), ...(await bank.findContacts()).map(fromContact)];
    const named = mentioned(text, people);
    switch (intent.kind) {
      case 'balance':
        return balance();
      case 'incoming':
        return incoming(named);
      case 'send':
        return send(people, named, intent.amount, intent.currency);
      case 'amount':
        return pending || draft ? send(people, named, intent.amount, intent.currency) : say(HELP);
      case 'yes':
        return pending ? confirm(pending) : say(`There is nothing waiting to send. ${HELP}`);
      case 'no':
        return cancel();
      case 'unknown':
        // "Oskar", said in answer to "Who is it for?"
        return draft && named ? send(people, named) : say(`Sorry, I did not catch that. ${HELP}`);
    }
  }

  const unsubscribe = bank.subscribe((event) => {
    if (event.type !== 'incoming_payment') return;
    const payment = event.transaction;
    enqueue(async () => {
      emit({ type: 'incoming_payment', transaction: payment });
      const amount = (await amountsAllowed()) ? `: ${speakMoney(payment.amount, payment.currency)}` : '';
      await say(`Money has just arrived${amount} from ${payment.counterparty}.`);
    });
  });

  emit({ type: 'status', status: 'connecting' });
  emit({ type: 'status', status: 'connected' });
  enqueue(() => say(`Hello ${userName}, it's Wise Voice. You can ask me about your balance, recent payments, or sending money. What would you like to do?`));

  return {
    sendText(text) {
      const words = text.trim();
      if (!words || ended) return;
      emit({ type: 'transcript', role: 'user', text: words, final: true, typed: true });
      enqueue(() => handle(words));
    },

    notify(text) {
      // The only note that changes what this agent does: the user cancelled on the screen.
      if (ended || !/cancel/i.test(text) || !(pending || draft)) return;
      enqueue(async () => {
        pending = null;
        draft = null;
        await say('Okay, that is cancelled. Nothing was sent.');
      });
    },

    setMuted() {
      // No microphone to mute.
    },

    async stop() {
      if (ended) return;
      unsubscribe();
      emit({ type: 'status', status: 'disconnected', reason: 'user' });
      ended = true;
    },
  };
}
