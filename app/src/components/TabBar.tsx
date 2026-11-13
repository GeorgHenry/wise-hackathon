import { ArrowLeftRight, CreditCard, House, type LucideIcon, Mic, UsersRound } from 'lucide-react';
import './TabBar.css';

export type Tab = 'home' | 'cards' | 'recipients' | 'payments';

const LEFT: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'cards', label: 'Cards', icon: CreditCard },
];
const RIGHT: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'recipients', label: 'Recipients', icon: UsersRound },
  { id: 'payments', label: 'Payments', icon: ArrowLeftRight },
];

interface TabBarProps {
  tab: Tab;
  onTab: (tab: Tab) => void;
  onMic: () => void;
}

/** The floating bar at the bottom: four tabs and, in the middle, the way into Wise Voice. */
export function TabBar({ tab, onTab, onMic }: TabBarProps) {
  const button = ({ id, label, icon: Icon }: (typeof LEFT)[number]) => (
    <button key={id} type="button" className="tabbar__tab" aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)}>
      <Icon size={24} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <nav className="tabbar" aria-label="Main">
      {LEFT.map(button)}
      <button type="button" className="tabbar__mic" aria-label="Talk to Wise Voice" onClick={onMic}>
        <Mic size={30} aria-hidden="true" />
      </button>
      {RIGHT.map(button)}
    </nav>
  );
}
