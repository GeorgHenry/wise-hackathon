import { Keyboard, Mic, MicOff } from 'lucide-react';
import type { Phase } from '../voice/sessionReducer';

/**
 * Shows at a glance what the voice agent is doing. Decorative: the phase is also written out beside it.
 * `silent`: the scripted stand-in, which does not listen, so its turn shows a keyboard, not a microphone.
 *
 * listening: ripples run outwards. speaking: the disc breathes and a voice bar moves.
 * working and connecting: an arc circles the disc. ended: the disc goes quiet.
 */
export function VoiceOrb({ phase, silent = false }: { phase: Phase; silent?: boolean }) {
  let inside = <MicOff size={30} strokeWidth={2.2} />;
  if (phase === 'listening') inside = silent ? <Keyboard size={32} strokeWidth={2.2} /> : <Mic size={34} strokeWidth={2.4} />;
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
      <span className="orb__ring" />
      <svg className="orb__arc" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="47" />
      </svg>
      <span className="orb__core">{inside}</span>
    </div>
  );
}
