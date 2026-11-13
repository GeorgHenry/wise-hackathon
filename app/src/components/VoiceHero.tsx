import { Mic } from 'lucide-react';
import { Flag } from './Flag';

/**
 * The onboarding picture, after wise.com's globe with coins circling it:
 * a microphone with sound rolling out, and currencies floating round it.
 */
export function VoiceHero({ coins = true }: { coins?: boolean }) {
  return (
    <div className={coins ? 'voice-hero' : 'voice-hero voice-hero--quiet'} aria-hidden="true">
      <span className="voice-hero__wave" />
      <span className="voice-hero__wave" />
      <span className="voice-hero__wave" />
      <span className="voice-hero__core">
        <Mic size={60} strokeWidth={2.2} />
      </span>
      {coins && (
        <>
          <span className="voice-hero__coin voice-hero__coin--eur">
            <Flag currency="EUR" size={58} />
          </span>
          <span className="voice-hero__coin voice-hero__coin--gbp">
            <Flag currency="GBP" size={46} />
          </span>
          <span className="voice-hero__coin voice-hero__coin--usd">
            <Flag currency="USD" size={36} />
          </span>
        </>
      )}
    </div>
  );
}
