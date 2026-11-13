import { Mic, MicOff } from 'lucide-react';
import type { Phase } from '../voice/sessionReducer';

/** Shows at a glance what the voice agent is doing. Decorative: the phase is also written out beside it. */
export function VoiceOrb({ phase }: { phase: Phase }) {
  let inside = <MicOff size={32} />;
  if (phase === 'listening') inside = <Mic size={36} />;
  if (phase === 'speaking') {
    inside = (
      <span className="orb__bars">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (phase === 'working' || phase === 'connecting') {
    inside = (
      <span className="orb__dots">
        <i />
        <i />
        <i />
      </span>
    );
  }

  return (
    <div className={`orb orb--${phase}`} aria-hidden="true">
      <span className="orb__ring" />
      <span className="orb__ring" />
      <span className="orb__core">{inside}</span>
    </div>
  );
}
