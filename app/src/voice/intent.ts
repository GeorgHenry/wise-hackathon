import type { Currency } from '../bank/types';

// A few phrase rules for the scripted agent. The live agent uses a language
// model instead; this only has to understand the demo's suggested phrases and
// simple typed variations of them.

export type Intent =
  | { kind: 'balance' }
  | { kind: 'incoming' }
  | { kind: 'send'; amount?: number; currency?: Currency; wisetag?: string }
  | { kind: 'amount'; amount: number; currency?: Currency }
  | { kind: 'yes' }
  | { kind: 'no' }
  | { kind: 'unknown' };

const CHANGE = /\b(make it|change|instead|actually)\b/;
const NO = /\b(no|nope|cancel|stop|don't|dont|do not|never mind)\b/;
const YES = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|correct|send it|go ahead|do it)\b/;
const DOUBT = /\b(but|maybe|wait|change|not|unsure)\b|\?/;
const SEND = /\b(send|pay|transfer|give)\b/;
const BALANCE = /\bbalance\b|\bhow much (money )?(do i have|have i got|is left|is there)\b/;
const INCOMING = /\b(arrive[ds]?|come in|came in|coming in|received?|sent me|paid me|pension|got paid)\b/;

interface Money {
  amount?: number;
  currency?: Currency;
}

function findMoney(text: string): Money {
  const money: Money = {};
  const number = /(\d+(?:[.,]\d{1,2})?)/.exec(text);
  if (number?.[1]) money.amount = Number(number[1].replace(',', '.'));
  if (/£|\b(pounds?|quid|gbp)\b/.test(text)) money.currency = 'GBP';
  else if (/€|\b(euros?|eur)\b/.test(text)) money.currency = 'EUR';
  else if (/\$|\b(dollars?|usd|bucks)\b/.test(text)) money.currency = 'USD';
  return money;
}

/** A Wisetag: a word that starts with a letter and has a digit in it, like johnj1999 or @maria_k22. */
const WISETAG = /(?:^|\s)@?([a-z][a-z0-9_]*\d[a-z0-9_]*)(?=$|[\s,.!?])/;

export function parseIntent(text: string): Intent {
  const lower = text.toLowerCase().replace(/[‘’]/g, "'");
  const wisetag = WISETAG.exec(lower)?.[1]?.replace(/_/g, '');
  // Take the Wisetag out first, so its digits are not read as the amount.
  const t = wisetag ? lower.replace(WISETAG, ' ') : lower;
  const money = findMoney(t);

  if (money.amount !== undefined && CHANGE.test(t)) return { kind: 'amount', ...money, amount: money.amount };
  if (NO.test(t)) return { kind: 'no' };
  // A yes only counts when nothing in the sentence sounds like doubt or a change.
  if (YES.test(t) && !DOUBT.test(t)) return { kind: 'yes' };
  if (SEND.test(t)) return { kind: 'send', ...money, ...(wisetag ? { wisetag } : {}) };
  if (BALANCE.test(t)) return { kind: 'balance' };
  if (INCOMING.test(t)) return { kind: 'incoming' };
  if (money.amount !== undefined) return { kind: 'amount', ...money, amount: money.amount };
  return { kind: 'unknown' };
}
