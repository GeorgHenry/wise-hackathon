import { Keyboard, Mic, MicOff } from 'lucide-react';
import type { Phase } from '../voice/sessionReducer';

/**
 * Shows at a glance what the voice agent is doing. Decorative: the phase is also written out beside it.
 * `silent`: the scripted stand-in, which does not listen, so its turn shows a keyboard, not a microphone.
 */
export function VoiceOrb({ phase, silent = false }: { phase: Phase; silent?: boolean }) {
  let inside = <MicOff size={32} />;
  if (phase === 'listening') inside = silent ? <Keyboard size={34} /> : <Mic size={36} />;
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
