// The demo account's data types and the contract the voice agent calls.
// voice-agent/web/tools-runtime.js depends on this contract; change both together.

/** EUR and GBP are held as balances; USD can only be sent. */
export type Currency = 'EUR' | 'GBP' | 'USD';
export type Direction = 'in' | 'out';
export type AudioPrivacy = 'private' | 'speaker';
export type BankErrorCode =
  | 'unknown_recipient'
  | 'insufficient_funds'
  | 'quote_expired'
  | 'not_found'
  | 'not_on_wise'
  | 'unsupported_currency';

export interface Balance {
  currency: Currency;
  /** Major units, two decimals. */
  amount: number;
}

export interface Recipient {
  id: string;
  name: string;
  /** How the user refers to them, for example "my daughter". */
  nickname?: string;
  currency: Currency;
  /** Shown in lists, for example "UK account ending 4417". */
  detail: string;
  verified: boolean;
}

/** Someone in the phone's contacts. Those on Wise can be paid straight to their Wise account. */
export interface Contact {
  id: string;
  name: string;
  onWise: boolean;
  phone?: string;
}

export interface Transaction {
  id: string;
  direction: Direction;
  counterparty: string;
  /** What the other side received (out) or sent (in). */
  amount: number;
  currency: Currency;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface QuoteRequest {
  recipientId: string;
  amount: number;
  currency: Currency;
  /** 'target': the recipient gets exactly this. 'source': the user pays exactly this. */
  amountIs?: 'target' | 'source';
}

export interface Quote {
  id: string;
  recipientId: string;
  recipientName: string;
  /** A saved recipient, or a phone contact paid through Wise. */
  recipientKind: 'saved' | 'contact';
  /** Everything that leaves the account, fee included. */
  sourceAmount: number;
  sourceCurrency: Currency;
  targetAmount: number;
  targetCurrency: Currency;
  rate: number;
  fee: number;
  feeCurrency: Currency;
  arrival: string;
  /** ISO timestamp. */
  expiresAt: string;
}

export interface PreparedTransfer extends Quote {
  transferId: string;
  status: 'prepared';
}

export type ConfirmResult =
  | { status: 'sent'; transaction: Transaction; balances: Balance[] }
  | { status: 'declined' | 'cancelled' | 'failed'; reason: string };

export interface TransactionQuery {
  direction?: Direction;
  counterparty?: string;
  limit?: number;
}

export type BankEvent = { type: 'incoming_payment'; transaction: Transaction } | { type: 'changed' };

/** What the voice agent is given. Every method resolves to plain JSON. */
export interface Bank {
  getBalances(): Promise<Balance[]>;
  listRecipients(query?: string): Promise<Recipient[]>;
  /** The phone's contacts, including those who do not use Wise. */
  findContacts(query?: string): Promise<Contact[]>;
  listTransactions(query?: TransactionQuery): Promise<Transaction[]>;
  getQuote(request: QuoteRequest): Promise<Quote>;
  /** Nothing moves. */
  prepareTransfer(quoteId: string): Promise<PreparedTransfer>;
  /** Resolves after the Face ID step. Money moves at most once per transfer. */
  confirmTransfer(transferId: string): Promise<ConfirmResult>;
  /**
   * Cancels a transfer that has not finished. The answer is how the transfer
   * really ended: 'cancelled' normally, but 'sent' if the money had already gone.
   */
  cancelTransfer(transferId: string): Promise<{ status: ConfirmResult['status'] }>;
  getAudioPrivacy(): Promise<AudioPrivacy>;
  subscribe(listener: (event: BankEvent) => void): () => void;
}

export class BankError extends Error {
  readonly code: BankErrorCode;

  constructor(code: BankErrorCode, message: string) {
    super(message);
    this.name = 'BankError';
    this.code = code;
  }
}
