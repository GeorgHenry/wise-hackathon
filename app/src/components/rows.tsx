import { ArrowDown, ArrowUp, ChevronRight, type LucideIcon } from 'lucide-react';
import { formatMoney, rowDate } from '../bank/money';
import type { Currency, Transaction } from '../bank/types';
import { Flag } from './Flag';
import './rows.css';

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** A person's initials in a circle, with their currency's flag when given. */
export function Avatar({ name, currency, large = false }: { name: string; currency?: Currency; large?: boolean }) {
  return (
    <span className={large ? 'avatar avatar--lg' : 'avatar'} aria-hidden="true">
      {initials(name)}
      {currency && (
        <span className="avatar__flag">
          <Flag currency={currency} size={20} />
        </span>
      )}
    </span>
  );
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const incoming = transaction.direction === 'in';
  const Icon = incoming ? ArrowDown : ArrowUp;
  return (
    <li className="tx">
      <span className={incoming ? 'tx__icon tx__icon--in' : 'tx__icon'} aria-hidden="true">
        <Icon size={22} strokeWidth={2.2} />
      </span>
      <span className="tx__main">
        <span className="tx__title">{transaction.counterparty}</span>
        <span className="tx__sub">
          {incoming ? 'Received' : 'Sent'} · {rowDate(transaction.date)}
        </span>
      </span>
      <span className={incoming ? 'tx__amount tx__amount--in' : 'tx__amount'}>
        {incoming ? '+ ' : ''}
        {formatMoney(transaction.amount, transaction.currency)}
      </span>
    </li>
  );
}

/** A tappable row with an icon, used on the static tabs. */
export function LinkRow({ icon: Icon, title, text, onClick }: { icon: LucideIcon; title: string; text?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="link-row" onClick={onClick}>
        <span className="tx__icon tx__icon--soft" aria-hidden="true">
          <Icon size={22} />
        </span>
        <span className="tx__main">
          <span className="tx__title">{title}</span>
          {text && <span className="tx__sub tx__sub--wrap">{text}</span>}
        </span>
        <ChevronRight size={22} className="link-row__chevron" aria-hidden="true" />
      </button>
    </li>
  );
}
