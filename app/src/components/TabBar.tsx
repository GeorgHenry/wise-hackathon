import { ArrowLeftRight, CreditCard, House, type LucideIcon, UsersRound } from 'lucide-react';
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

/** A small green disc with sound bars: Wise Voice, drawn at the size of the other tab icons. */
function VoiceGlyph() {
  return (
    <svg className="tabbar__voice-glyph" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="13" />
      <path d="M8.6 10.6v4.8M11.5 7.9v10.2M14.5 6.9v12.2M17.4 10.1v5.8" />
    </svg>
  );
}

/** The floating bar at the bottom: four tabs and, in the middle, the way into Wise Voice, level with them. */
export function TabBar({ tab, onTab, onMic }: TabBarProps) {
  const button = ({ id, label, icon: Icon }: (typeof LEFT)[number]) => (
    <button key={id} type="button" className="tabbar__tab" aria-current={tab === id ? 'page' : undefined} onClick={() => onTab(id)}>
      <Icon size={24} strokeWidth={tab === id ? 2.3 : 1.9} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <nav className="tabbar" aria-label="Main">
      {LEFT.map(button)}
      <button type="button" className="tabbar__tab tabbar__voice" aria-label="Talk to Wise Voice" onClick={onMic}>
        <VoiceGlyph />
        Voice
      </button>
      {RIGHT.map(button)}
    </nav>
  );
}
