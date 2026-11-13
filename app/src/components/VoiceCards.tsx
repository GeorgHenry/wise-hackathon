import { ArrowDown, Check, Headphones, X } from 'lucide-react';
import { formatMoney, formatSymbol } from '../bank/money';
import type { TransferPhase, TransferView } from '../bank/store';
import type { Balance, Transaction } from '../bank/types';
import { Flag } from './Flag';
import { TransactionRow } from './rows';

// The cards the voice sheet shows beside the conversation. Each mirrors one
// thing the agent has just done, read from the bank store.

export function BalanceCard({ balances }: { balances: Balance[] }) {
  return (
    <section className="vcard" aria-label="Your balances">
      <h3 className="vcard__title">Your balances</h3>
      <ul className="vcard__balances">
        {balances.map((b) => (
          <li key={b.currency}>
            <Flag currency={b.currency} size={28} />
            {formatSymbol(b.amount, b.currency)}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrivateAudioCard() {
  return (
    <section className="vcard vcard--note" aria-label="Private audio needed">
      <span className="vcard__badge" aria-hidden="true">
        <Headphones size={24} />
      </span>
      <div>
        <h3 className="vcard__title">Private audio needed</h3>
        <p className="muted">Amounts are not read out on the loudspeaker. Use headphones or hold the phone to your ear.</p>
      </div>
    </section>
  );
}

export function PaymentsCard({ payments }: { payments: Transaction[] }) {
  return (
    <section className="vcard" aria-label="Recent payments">
      <h3 className="vcard__title">Recent payments</h3>
      {payments.length === 0 ? <p className="muted">Nothing to show.</p> : <ul>{payments.map((p) => <TransactionRow key={p.id} transaction={p} />)}</ul>}
    </section>
  );
}

export function ArrivedCard({ payment }: { payment: Transaction }) {
  return (
    <section className="vcard vcard--note" aria-label="Money arrived">
      <span className="vcard__badge vcard__badge--good" aria-hidden="true">
        <ArrowDown size={24} />
      </span>
      <div>
        <h3 className="vcard__title">Money arrived</h3>
        <p>
          <strong className="vcard__plus">+ {formatMoney(payment.amount, payment.currency)}</strong> from {payment.counterparty}
        </p>
      </div>
    </section>
  );
}

const TITLE: Record<TransferPhase, string> = {
  prepared: 'Check before sending',
  approving: 'Waiting for Face ID',
  sent: 'Sent',
  declined: 'Not sent',
  cancelled: 'Cancelled',
  failed: 'Not sent',
};

const OUTCOME: Partial<Record<TransferPhase, string>> = {
  declined: 'Face ID did not match. No money moved.',
  cancelled: 'Nothing was sent.',
};

interface TransferCardProps {
  view: TransferView;
  /** For a phone contact: whether money has gone to them before. */
  paidBefore: boolean;
  onSend: () => void;
  onCancel: () => void;
}

export function TransferCard({ view, paidBefore, onSend, onCancel }: TransferCardProps) {
  const { transfer, phase } = view;
  const amount = formatMoney(transfer.targetAmount, transfer.targetCurrency);
  const paid = formatMoney(transfer.sourceAmount, transfer.sourceCurrency);

  if (phase === 'prepared' || phase === 'approving') {
    return (
      <section className="vcard" aria-label={TITLE[phase]}>
        <h3 className="vcard__title">{TITLE[phase]}</h3>
        <dl className="vcard__facts">
          <dt>To</dt>
          <dd>{transfer.recipientName}</dd>
          {transfer.recipientKind === 'contact' && (
            <>
              <dt>Contact</dt>
              <dd>On Wise, {paidBefore ? 'paid before' : 'first payment'}</dd>
            </>
          )}
          <dt>They receive</dt>
          <dd>{amount}</dd>
          <dt>Fee</dt>
          <dd>{transfer.fee > 0 ? formatMoney(transfer.fee, transfer.feeCurrency) : 'No fee'}</dd>
          <dt>You pay</dt>
          <dd>{paid}</dd>
          <dt>Arrives</dt>
          <dd className="vcard__arrival">{transfer.arrival}</dd>
        </dl>
        {phase === 'prepared' && (
          <div className="vcard__actions">
            <button type="button" className="btn btn--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={onSend}>
              Send
            </button>
          </div>
        )}
      </section>
    );
  }

  const sent = phase === 'sent';
  return (
    <section className="vcard vcard--note" aria-label={TITLE[phase]}>
      <span className={sent ? 'vcard__badge vcard__badge--good' : 'vcard__badge vcard__badge--bad'} aria-hidden="true">
        {sent ? <Check size={24} /> : <X size={24} />}
      </span>
      <div>
        <h3 className="vcard__title">{TITLE[phase]}</h3>
        {sent ? (
          <p>
            <strong>{amount}</strong> to {transfer.recipientName}. You paid {paid}.
          </p>
        ) : (
          <p className="muted">{OUTCOME[phase] ?? `${view.reason ?? 'It could not be sent'}. No money moved.`}</p>
        )}
      </div>
    </section>
  );
}
