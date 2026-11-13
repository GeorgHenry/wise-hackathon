import { ArrowDown, Check, Headphones, X } from 'lucide-react';
import { formatMoney } from '../bank/money';
import type { TransferPhase, TransferView } from '../bank/store';
import type { Balance, Transaction } from '../bank/types';
import { Flag } from './Flag';
import { Money, moneyParts } from './Money';
import { Avatar, TransactionRow } from './rows';

// The cards the voice sheet shows beside the conversation. Each mirrors one
// thing the agent has just done, read from the bank store. They are drawn like
// Wise's own send-money calculator: white, heavy figures, currency pills.

export function BalanceCard({ balances }: { balances: Balance[] }) {
  return (
    <section className="vcard" aria-label="Your balances">
      <h3 className="vcard__label">Your balances</h3>
      <ul className="vcard__balances">
        {balances.map((b) => (
          <li key={b.currency} className="vcard__balance">
            <span className="ccy">
              <Flag currency={b.currency} size={24} />
              {b.currency}
            </span>
            <span className="vcard__figure">{moneyParts(b.amount, b.currency).figure}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PrivateAudioCard() {
  return (
    <section className="vcard vcard--note" aria-label="Private audio needed">
      <span className="vcard__badge vcard__badge--warning" aria-hidden="true">
        <Headphones size={22} strokeWidth={2.2} />
      </span>
      <div>
        <h3 className="vcard__title">Private audio needed</h3>
        <p className="vcard__text">Amounts are not read out on the loudspeaker. Use headphones or hold the phone to your ear.</p>
      </div>
    </section>
  );
}

export function PaymentsCard({ payments }: { payments: Transaction[] }) {
  return (
    <section className="vcard vcard--list" aria-label="Recent payments">
      <h3 className="vcard__label">Recent payments</h3>
      {payments.length === 0 ? (
        <p className="vcard__text">Nothing to show.</p>
      ) : (
        <ul>
          {payments.map((p) => (
            <TransactionRow key={p.id} transaction={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ArrivedCard({ payment }: { payment: Transaction }) {
  return (
    <section className="vcard vcard--green vcard--celebrate" aria-label="Money arrived">
      <div className="vcard__row">
        <span className="vcard__badge vcard__badge--forest" aria-hidden="true">
          <ArrowDown size={22} strokeWidth={2.6} />
        </span>
        <h3 className="vcard__title">Money arrived</h3>
      </div>
      <p className="vcard__big">
        <Money amount={payment.amount} currency={payment.currency} sign="+ " />
      </p>
      <p className="vcard__text">from {payment.counterparty}</p>
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
  /** For a Wise account (a phone contact's, or one found by Wisetag): whether money has gone to them before. */
  paidBefore: boolean;
  onSend: () => void;
  onCancel: () => void;
}

export function TransferCard({ view, paidBefore, onSend, onCancel }: TransferCardProps) {
  const { transfer, phase } = view;
  const paid = formatMoney(transfer.sourceAmount, transfer.sourceCurrency);

  if (phase === 'prepared' || phase === 'approving') {
    return (
      <section className={phase === 'approving' ? 'vcard vcard--waiting' : 'vcard'} aria-label={TITLE[phase]}>
        <h3 className="vcard__label">{TITLE[phase]}</h3>

        <div className="vcard__payee">
          <Avatar name={transfer.recipientName} currency={transfer.targetCurrency} />
          <p className="vcard__who">
            <span className="vcard__name">{transfer.recipientName}</span>
            <span className="vcard__sub">They receive</span>
          </p>
          <Money amount={transfer.targetAmount} currency={transfer.targetCurrency} className="vcard__payee-amount" />
        </div>

        <dl className="vcard__facts">
          {transfer.recipientKind === 'contact' && (
            <div>
              <dt>Contact</dt>
              <dd>On Wise, {paidBefore ? 'paid before' : 'first payment'}</dd>
            </div>
          )}
          {transfer.recipientKind === 'wise_user' && (
            <div>
              <dt>Wisetag</dt>
              <dd>
                @{transfer.recipientWisetag}, {paidBefore ? 'paid before' : 'first payment'}
              </dd>
            </div>
          )}
          <div>
            <dt>Fee</dt>
            <dd>{transfer.fee > 0 ? formatMoney(transfer.fee, transfer.feeCurrency) : 'No fee'}</dd>
          </div>
          <div>
            <dt>You pay</dt>
            <dd>{paid}</dd>
          </div>
          <div>
            <dt>Arrives</dt>
            <dd className="vcard__arrival">{transfer.arrival}</dd>
          </div>
        </dl>

        {phase === 'prepared' ? (
          <div className="vcard__actions">
            <button type="button" className="btn btn--neutral" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={onSend}>
              Send
            </button>
          </div>
        ) : (
          <p className="vcard__pending">
            <span className="vcard__spinner" aria-hidden="true" />
            Approve with Face ID to send
          </p>
        )}
      </section>
    );
  }

  if (phase === 'sent') {
    return (
      <section className="vcard vcard--green vcard--celebrate" aria-label={TITLE[phase]}>
        <div className="vcard__row">
          <span className="vcard__badge vcard__badge--forest" aria-hidden="true">
            <Check size={22} strokeWidth={3} />
          </span>
          <h3 className="vcard__title">Sent</h3>
        </div>
        <p className="vcard__big">
          <Money amount={transfer.targetAmount} currency={transfer.targetCurrency} />
        </p>
        <p className="vcard__text">
          to {transfer.recipientName}. You paid {paid}.
        </p>
      </section>
    );
  }

  return (
    <section className="vcard vcard--note" aria-label={TITLE[phase]}>
      <span className="vcard__badge vcard__badge--negative" aria-hidden="true">
        <X size={22} strokeWidth={2.6} />
      </span>
      <div>
        <h3 className="vcard__title">{TITLE[phase]}</h3>
        <p className="vcard__text">{OUTCOME[phase] ?? `${view.reason ?? 'It could not be sent'}. No money moved.`}</p>
      </div>
    </section>
  );
}
