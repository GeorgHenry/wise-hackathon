import { ArrowDownToLine, ChevronLeft, Mic, Send, Wallet } from 'lucide-react';
import { useState } from 'react';
import { FaceId, useFaceIdScan } from '../auth/FaceId';
import './Onboarding.css';

// The idea of onboarding in four screens: what Wise Voice is, what it can do,
// Face ID, and the microphone. It creates no account and asks for no details.

const ABILITIES = [
  { icon: Wallet, title: 'Ask for your balance', text: 'Hear what you have in each currency. Amounts are read out only when your audio is private.' },
  { icon: Send, title: 'Send money to people you have saved', text: 'Say who and how much. You hear the details back before anything is sent.' },
  { icon: ArrowDownToLine, title: 'Hear when money arrives', text: 'Ask whether a payment has come in, or be told when it does.' },
];

const LAST_STEP = 3;

interface OnboardingProps {
  /** Asks the browser for the microphone. Resolves either way. */
  requestMicrophone: () => Promise<void>;
  /** Finished the set-up, Face ID included. */
  onDone: () => void;
  /** "I already use Wise Voice": go to the lock screen instead. */
  onSkip: () => void;
}

export function Onboarding({ requestMicrophone, onDone, onSkip }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const { state, scan } = useFaceIdScan();
  const next = (): void => setStep((s) => Math.min(LAST_STEP, s + 1));

  async function setUpFaceId(): Promise<void> {
    await scan(true);
    next();
  }

  async function allowMicrophone(): Promise<void> {
    await requestMicrophone();
    onDone();
  }

  return (
    <div className="onboarding">
      <header className="onboarding__head">
        {step > 0 ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
        ) : (
          <span className="tag">Prototype</span>
        )}
        <span className="onboarding__dots" role="img" aria-label={`Step ${step + 1} of ${LAST_STEP + 1}`}>
          {[0, 1, 2, 3].map((dot) => (
            <span key={dot} className={dot === step ? 'onboarding__dot onboarding__dot--on' : 'onboarding__dot'} />
          ))}
        </span>
      </header>

      {step === 0 && (
        <>
          <div className="onboarding__body onboarding__body--centre">
            <span className="hero-mic" aria-hidden="true">
              <Mic size={56} />
            </span>
            <h1 className="display">Bank by talking</h1>
            <p className="onboarding__lead">
              Wise Voice lets you check your balance, send money and hear when money arrives, without reading a screen.
            </p>
          </div>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--primary btn--block" onClick={next}>
              Get started
            </button>
            <button type="button" className="btn btn--dark btn--block" onClick={onSkip}>
              I already use Wise Voice
            </button>
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <div className="onboarding__body">
            <h1 className="title">What you can do with Wise Voice</h1>
            <ul className="abilities">
              {ABILITIES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="ability">
                  <span className="ability__icon" aria-hidden="true">
                    <Icon size={24} />
                  </span>
                  <span>
                    <strong className="ability__title">{title}</strong>
                    <span className="ability__text">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--primary btn--block" onClick={next}>
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="onboarding__body onboarding__body--centre">
            <FaceId state={state} size={120} />
            <h1 className="display">Stay secure with Face ID</h1>
            <p className="onboarding__lead">
              Your face or fingerprint unlocks Wise Voice and approves every payment. Your voice alone can never move money.
            </p>
            <p className="muted" role="status">
              {state === 'scanning' ? 'Checking it is you…' : state === 'success' ? 'Face ID is set up.' : ''}
            </p>
          </div>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--primary btn--block" disabled={state !== 'idle'} onClick={() => void setUpFaceId()}>
              Set up Face ID
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="onboarding__body onboarding__body--centre">
            <span className="hero-mic hero-mic--quiet" aria-hidden="true">
              <Mic size={56} />
            </span>
            <h1 className="display">Let Wise Voice hear you</h1>
            <p className="onboarding__lead">
              Wise Voice listens only while a voice session is open, and you can end it at any moment.
            </p>
          </div>
          <div className="onboarding__actions">
            <button type="button" className="btn btn--primary btn--block" onClick={() => void allowMicrophone()}>
              Allow microphone
            </button>
            <button type="button" className="btn btn--dark btn--block" onClick={onDone}>
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
