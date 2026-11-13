import { ChevronRight, Eye, EyeOff, Landmark, Mic } from 'lucide-react';
import { useState } from 'react';
import { formatSymbol, fromCents, toCents } from '../bank/money';
import { ACCOUNT_HOLDER, RATES_FROM_EUR } from '../bank/seed';
import type { Balance, Currency } from '../bank/types';
import { useBank } from '../bank/useBank';
import { Flag } from '../components/Flag';
import { Money } from '../components/Money';
import { Avatar, TransactionRow } from '../components/rows';
import './Home.css';

const NOT_BUILT = 'That is not part of this prototype.';
const HIDDEN = '••••••';

const CURRENCY_NAME: Record<Currency, string> = { EUR: 'Euro', GBP: 'British pound', USD: 'US dollar' };

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
    <div className="screen home">
      <header className="home__top">
        <Avatar name={ACCOUNT_HOLDER.name} />
        <span className="tag">Prototype</span>
      </header>

      <p className="home__label">Total balance</p>
      <div className="home__total-row">
        <h1 className="home__total">
          <Money amount={total} currency="EUR" hidden={hidden} animate />
        </h1>
        <button type="button" className="icon-btn home__eye" aria-pressed={hidden} aria-label="Hide balances" onClick={() => setHidden((h) => !h)}>
          {hidden ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
        </button>
      </div>

      <div className="home__actions">
        <button type="button" className="btn btn--primary" onClick={onVoice}>
          <Mic size={18} strokeWidth={2.4} aria-hidden="true" />
          Send
        </button>
        <button type="button" className="btn btn--neutral" onClick={() => onToast(NOT_BUILT)}>
          Add money
        </button>
        <button type="button" className="btn btn--neutral" onClick={() => onToast(NOT_BUILT)}>
          Request
        </button>
      </div>

      <section className="account" aria-label="Main account">
        <div className="account__card" aria-hidden="true">
          <span className="account__card-label">
            Your card <ChevronRight size={18} strokeWidth={2.4} />
          </span>
          <span className="account__card-mini" />
        </div>
        <div className="account__body">
          <h2 className="account__name">Main account</h2>
          <p className="account__sum">
            {hidden ? HIDDEN : formatSymbol(total, 'EUR')} · {balances.length} currencies
          </p>
          <ul className="account__currencies">
            {balances.map((b) => (
              <li key={b.currency} className="account__currency">
                <Flag currency={b.currency} size={40} />
                <span className="account__currency-text">
                  <span className="account__currency-amount">{hidden ? HIDDEN : formatSymbol(b.amount, b.currency)}</span>
                  <span className="account__currency-name">{CURRENCY_NAME[b.currency]}</span>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--neutral account__details" onClick={() => onToast(NOT_BUILT)}>
            <Landmark size={18} aria-hidden="true" /> Account details
          </button>
        </div>
      </section>

      <section className="home__activity" aria-labelledby="transactions-title">
        <div className="home__section-head">
          <h2 id="transactions-title" className="section-title">
            Transactions
          </h2>
          <button type="button" className="btn btn--link home__see-all" onClick={() => onToast(NOT_BUILT)}>
            See all
          </button>
        </div>
        <ul>
          {transactions.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      </section>
    </div>
  );
}
