import { ArrowLeftRight, CalendarClock, Grip, HandCoins, ListFilter, RefreshCw, Search, SlidersHorizontal, Snowflake, Split, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { useBank } from '../bank/useBank';
import { Avatar, LinkRow } from '../components/rows';
import './Tabs.css';

// The three tabs besides Home. Recipients is live (it shows who voice can pay);
// Cards and Payments are static, so the app has the shape of the real one.

const NOT_BUILT = 'That is not part of this prototype.';

interface TabProps {
  onToast: (message: string) => void;
}

export function Recipients() {
  const { recipients, contacts } = useBank();
  const [query, setQuery] = useState('');
  const wanted = query.trim().toLowerCase();
  const shown = recipients.filter((r) => `${r.name} ${r.nickname ?? ''}`.toLowerCase().includes(wanted));
  const shownContacts = contacts.filter((c) => c.name.toLowerCase().includes(wanted));

  return (
    <div className="screen">
      <h1 className="title tab__title">Recipients</h1>
      <label className="search">
        <Search size={20} aria-hidden="true" />
        <span className="sr-only">Search recipients</span>
        <input type="search" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <p className="tab__hint muted">Wise Voice can send money to these saved people, and to phone contacts who use Wise.</p>
      {shown.length + shownContacts.length === 0 ? (
        <p className="tab__empty" role="status">
          No saved recipient matches “{query.trim()}”.
        </p>
      ) : (
        <ul>
          {shown.map((r) => (
            <li key={r.id} className="tx">
              <Avatar name={r.name} currency={r.currency} large />
              <span className="tx__main">
                <span className="tx__title">{r.name}</span>
                <span className="tx__sub">{r.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {shownContacts.length > 0 && (
        <>
          <h2 className="tab__group">Phone contacts</h2>
          <ul>
            {shownContacts.map((c) => (
              <li key={c.id} className="tx">
                <Avatar name={c.name} large />
                <span className="tx__main">
                  <span className="tx__title">{c.name}</span>
                  <span className="tx__sub">{c.onWise ? 'On Wise' : 'Not on Wise: cannot be paid by voice'}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function Cards({ onToast }: TabProps) {
  const actions = [
    { label: 'Show PIN', icon: Grip },
    { label: 'Card details', icon: WalletCards },
    { label: 'Freeze card', icon: Snowflake },
  ];
  return (
    <div className="screen">
      <h1 className="title tab__title">Cards</h1>
      <div className="card-art" aria-hidden="true">
        <span className="card-art__name">Wise Voice</span>
        <span className="card-art__chip" />
        <span className="card-art__kind">Demo card</span>
      </div>
      <p className="card-caption">
        <span className="muted">Physical card</span> •••• 0000
      </p>
      <div className="card-actions">
        {actions.map(({ label, icon: Icon }) => (
          <button key={label} type="button" className="card-action" onClick={() => onToast(NOT_BUILT)}>
            <span className="card-action__icon">
              <Icon size={26} aria-hidden="true" />
            </span>
            {label}
          </button>
        ))}
      </div>
      <h2 className="tab__group">Manage card</h2>
      <ul>
        <LinkRow icon={ListFilter} title="View recent card transactions" onClick={() => onToast(NOT_BUILT)} />
        <LinkRow icon={SlidersHorizontal} title="Card controls" onClick={() => onToast(NOT_BUILT)} />
      </ul>
    </div>
  );
}

export function Payments({ onToast }: TabProps) {
  const tools = [
    { title: 'Scheduled transfers', text: 'Set up a transfer to send at a later date.', icon: CalendarClock },
    { title: 'Direct Debits', text: 'Set up and manage regular payments.', icon: RefreshCw },
    { title: 'Payment requests', text: 'Create and manage payments you have requested.', icon: HandCoins },
    { title: 'Bill splits', text: 'Split transactions with several people.', icon: Split },
    { title: 'Convert', text: 'Move money between your currencies.', icon: ArrowLeftRight },
  ];
  return (
    <div className="screen">
      <h1 className="title tab__title">Payments</h1>
      <ul>
        {tools.map((tool) => (
          <LinkRow key={tool.title} icon={tool.icon} title={tool.title} text={tool.text} onClick={() => onToast(NOT_BUILT)} />
        ))}
      </ul>
    </div>
  );
}
