import { ArrowDownLeft, Mic, ShieldCheck } from 'lucide-react';
import './StageIntro.css';

// Beside the phone on a wide screen, for the people watching the demo: what
// this is, set like the top of wise.com. Not part of the app itself.

const POINTS = [
  { icon: Mic, text: 'Ask for your balance and send money by talking' },
  { icon: ShieldCheck, text: 'Every payment is read back, then approved with Face ID' },
  { icon: ArrowDownLeft, text: 'Hear when money arrives' },
];

export function StageIntro() {
  return (
    <header className="stage-intro">
      <span className="stage-intro__eyebrow">Hackathon prototype</span>
      <p className="stage-intro__title">
        Wise
        <br />
        Voice
      </p>
      <p className="stage-intro__lead">A voice-first way to use Wise, for people who find a screen hard or impossible to read.</p>
      <ul className="stage-intro__points">
        {POINTS.map(({ icon: Icon, text }) => (
          <li key={text}>
            <span className="stage-intro__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={2.4} />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <p className="stage-intro__small">Not a Wise product. Every name and amount is invented.</p>
    </header>
  );
}
