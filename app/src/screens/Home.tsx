import { ChevronRight, Eye, EyeOff, Landmark } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, formatSymbol, fromCents, toCents } from '../bank/money';
import { ACCOUNT_HOLDER, RATES_FROM_EUR } from '../bank/seed';
import type { Balance } from '../bank/types';
import { useBank } from '../bank/useBank';
import { Flag } from '../components/Flag';
import { Avatar, TransactionRow } from '../components/rows';
import './Home.css';

const NOT_BUILT = 'That is not part of this prototype.';
const HIDDEN = '••••••';

/** Everything the user holds, in euros, at the demo's invented rate. For display only. */
function totalInEuros(balances: Balance[]): number {
  const cents = balances.reduce((sum, b) => sum + Math.round(toCents(b.amount) / RATES_FROM_EUR[b.currency]), 0);
  return fromCents(cents);
}

interface HomeProps {
  onVoice: () => void;
  onToast: (message: string) => void;
}

export function Home({ onVoice, onToast }: HomeProps) {
  const { balances, transactions } = useBank();
  const [hidden, setHidden] = useState(false);
  const total = totalInEuros(balances);

  return (
    <div className="screen">
      <header className="home__top">
        <Avatar name={ACCOUNT_HOLDER.name} />
        <span className="tag">Prototype</span>
      </header>

      <p className="home__label">Total balance</p>
      <div className="home__total-row">
        <h1 className="home__total">{hidden ? HIDDEN : formatMoney(total, 'EUR')}</h1>
        <button type="button" className="icon-btn home__eye" aria-pressed={hidden} aria-label="Hide balances" onClick={() => setHidden((h) => !h)}>
          {hidden ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>

      <div className="home__actions">
        <button type="button" className="btn btn--primary" onClick={onVoice}>
          Send
        </button>
        <button type="button" className="btn btn--dark" onClick={() => onToast(NOT_BUILT)}>
          Add money
        </button>
        <button type="button" className="btn btn--dark" onClick={() => onToast(NOT_BUILT)}>
          Request
        </button>
      </div>

      <section className="account" aria-label="Main account">
        <div className="account__tab" aria-hidden="true">
          Your card <ChevronRight size={20} />
        </div>
        <div className="account__body">
          <h2 className="account__name">Main account</h2>
          <p className="muted">
            {hidden ? HIDDEN : formatSymbol(total, 'EUR')} · {balances.length} currencies
          </p>
          <ul className="account__currencies">
            {balances.map((b) => (
              <li key={b.currency} className="account__currency">
                <Flag currency={b.currency} />
                {hidden ? HIDDEN : formatSymbol(b.amount, b.currency)}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--neutral account__details" onClick={() => onToast(NOT_BUILT)}>
            <Landmark size={18} aria-hidden="true" /> Account details
          </button>
        </div>
      </section>

      <section aria-labelledby="transactions-title">
        <h2 id="transactions-title" className="section-title home__section">
          Transactions
        </h2>
        <ul>
          {transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      </section>
    </div>
  );
}
