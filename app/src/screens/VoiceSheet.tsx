import { ArrowUp, Headphones, Keyboard, Volume2, X } from 'lucide-react';
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { BankSnapshot, BankStore } from '../bank/store';
import { useBank } from '../bank/useBank';
import { ArrivedCard, BalanceCard, PaymentsCard, PrivateAudioCard, TransferCard } from '../components/VoiceCards';
import { VoiceOrb } from '../components/VoiceOrb';
import type { Phase } from '../voice/sessionReducer';
import type { Voice } from '../voice/useVoice';
import './VoiceSheet.css';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  connecting: 'Connecting…',
  listening: 'Listening',
  working: 'One moment…',
  speaking: 'Speaking',
  ended: 'Session ended',
};

const OPENING_PHRASES = ["What's my balance?", 'Send Oskar 30 pounds', 'Transfer 20 dollars to Martin', "Did Kadri's money arrive?"];
const CONFIRM_PHRASES = ['Yes, send it', 'Make it 40 pounds', 'No, cancel'];
const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

interface VoiceSheetProps {
  store: BankStore;
  voice: Voice;
  onClose: () => void;
  /** Offered when the live agent cannot start. */
  onUseScripted: () => void;
}

/** The agent's words fade in one after another, as if spoken. The text itself is whole for screen readers. */
function Spoken({ text }: { text: string }) {
  return text.split(' ').map((word, i) => (
    // Words only ever append to a line, so the index is a stable key.
    <span key={i} className="word" style={{ animationDelay: `${Math.min(i, 40) * 35}ms` }}>
      {word}{' '}
    </span>
  ));
}

/** The card for the most recent thing that happened since the sheet opened. */
function latestCard(bank: BankSnapshot, since: number, onSend: () => void, onCancel: () => void): ReactNode {
  const { transfer, lastIncoming, activity } = bank;
  const newest = Math.max(transfer?.at ?? 0, lastIncoming?.at ?? 0, activity?.at ?? 0);
  if (newest < since) return null;

  if (transfer?.at === newest) {
    const name = transfer.transfer.recipientName;
    const paidBefore = bank.transactions.some((t) => t.direction === 'out' && t.counterparty === name && t.id !== transfer.transaction?.id);
    return <TransferCard view={transfer} paidBefore={paidBefore} onSend={onSend} onCancel={onCancel} />;
  }
  if (lastIncoming?.at === newest) return <ArrivedCard payment={lastIncoming.transaction} />;
  if (activity?.kind === 'balances') {
    return bank.audioPrivacy === 'private' ? <BalanceCard balances={bank.balances} /> : <PrivateAudioCard />;
  }
  if (activity?.kind === 'transactions') {
    const name = activity.counterparty?.toLowerCase();
    const payments = bank.transactions
      .filter((t) => !activity.direction || t.direction === activity.direction)
      .filter((t) => !name || t.counterparty.toLowerCase().includes(name))
      .slice(0, 2);
    return <PaymentsCard payments={payments} />;
  }
  return null;
}

export function VoiceSheet({ store, voice, onClose, onUseScripted }: VoiceSheetProps) {
  const bank = useBank(store);
  const { view, mode } = voice;
  const [openedAt] = useState(() => Date.now());
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sheet = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const live = mode === 'live';

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !sheet.current) return;
    // Keep Tab inside the sheet while it is open.
    const items = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!typed.trim()) return;
    voice.sendText(typed);
    setTyped('');
  }

  function cancelTransfer(): void {
    const waiting = bank.transfer;
    if (!waiting) return;
    void store.cancelTransfer(waiting.transfer.transferId).then(({ status }) => {
      voice.notify(
        status === 'cancelled'
          ? 'The user tapped Cancel on the card. The transfer is cancelled.'
          : `The user tapped Cancel on the card, but that transfer had already ended as: ${status}.`,
      );
    });
  }

  const waitingForYes = bank.transfer?.phase === 'prepared' && bank.transfer.at >= openedAt;
  const userLine = view.lines.findLast((line) => line.role === 'user');
  const agentLine = view.lines.findLast((line) => line.role === 'agent');
  const userSpokeLast = view.lines.at(-1)?.role === 'user';
  const ended = view.phase === 'ended';
  const card = latestCard(bank, openedAt, () => voice.sendText('Yes, send it'), cancelTransfer);
  const newestLine = view.lines.at(-1)?.id;

  // Keep the newest words and card in view when the column is taller than the sheet,
  // both when something new arrives and when the sheet itself changes height
  // (a phone browser's toolbar sliding in, the keyboard opening).
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [newestLine, bank.transfer, bank.lastIncoming, bank.activity]);

  useEffect(() => {
    const column = body.current;
    if (!column) return;
    const resized = new ResizeObserver(() => column.scrollTo({ top: column.scrollHeight }));
    resized.observe(column);
    return () => resized.disconnect();
  }, [ended]);

  // The scripted stand-in has no microphone, so it cannot say it is listening.
  // Tapping a phrase can remove its own button (the confirm phrases go once the payment is
  // answered). Keep keyboard focus in the sheet instead of letting it fall to the page.
  useEffect(() => {
    const inside = sheet.current;
    if (!inside || inside.contains(document.activeElement)) return;
    inside.querySelector<HTMLElement>('.chip, .typebox input, .sheet__type')?.focus();
  }, [waitingForYes]);

  const phaseLabel = view.phase === 'listening' && !live ? 'Tap a phrase or type' : PHASE_LABEL[view.phase];

  return (
    <>
      <div className="sheet-backdrop" />
      <section
        ref={sheet}
        className={card ? 'sheet sheet--has-card theme-forest' : 'sheet theme-forest'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-title"
        onKeyDown={onKeyDown}
      >
        <span className="sheet__grabber" aria-hidden="true" />
        <header className="sheet__head">
          <div className="sheet__heading">
            <h2 id="voice-title" className="sheet__title">
              Wise Voice
            </h2>
            <p className={bank.audioPrivacy === 'private' ? 'sheet__meta' : 'sheet__meta sheet__meta--speaker'}>
              {bank.audioPrivacy === 'private' ? <Headphones size={15} aria-hidden="true" /> : <Volume2 size={15} aria-hidden="true" />}
              {bank.audioPrivacy === 'private' ? 'Private audio' : 'Loudspeaker'}
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="End voice session" onClick={onClose}>
            <X size={24} aria-hidden="true" />
          </button>
        </header>

        <div className="sheet__status">
          <VoiceOrb phase={view.phase} silent={!live} />
          <p className="sheet__phase" role="status">
            {phaseLabel}
          </p>
        </div>

        {ended ? (
          <div className="sheet__ended" role="alert">
            <p>{view.error?.message ?? 'The session has ended.'}</p>
            <div className="vcard__actions">
              {live && view.error && (
                <button type="button" className="btn btn--neutral" onClick={onUseScripted}>
                  Continue without voice
                </button>
              )}
              <button type="button" className="btn btn--primary" onClick={() => voice.start()}>
                {view.error ? 'Try again' : 'Start again'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={body}
              className={scrolled ? 'sheet__body sheet__body--scrolled' : 'sheet__body'}
              onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
            >
              {/* Not announced while the agent is speaking the same words, or a screen reader would talk over it. */}
              <div className="captions" aria-live={live ? 'off' : 'polite'}>
                {userLine && (
                  <p key={userLine.id} className="captions__user">
                    “{userLine.text}”
                  </p>
                )}
                {agentLine && !userSpokeLast && (
                  <p key={agentLine.id} className="captions__agent">
                    <Spoken text={agentLine.text} />
                  </p>
                )}
              </div>
              {card}
            </div>

            {/* With the real agent you just talk; typing is one tap away. Without it, tapping and typing are the only way in. */}
            <footer className="sheet__foot">
              {!live && (
                // A new set of phrases starts scrolled to its first, so "Yes, send it" is in view.
                <ul key={waitingForYes ? 'confirm' : 'opening'} className={waitingForYes ? 'chips chips--confirm' : 'chips'} aria-label="Things to say">
                  {(waitingForYes ? CONFIRM_PHRASES : OPENING_PHRASES).map((phrase) => (
                    <li key={phrase}>
                      <button type="button" className="chip" onClick={() => voice.sendText(phrase)}>
                        {phrase}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {live && !typing ? (
                <button type="button" className="sheet__type" onClick={() => setTyping(true)}>
                  <Keyboard size={18} aria-hidden="true" /> Type instead
                </button>
              ) : (
                <form className="typebox" onSubmit={submit}>
                  <input
                    type="text"
                    aria-label="Type instead of speaking"
                    placeholder="Type instead of speaking"
                    autoComplete="off"
                    autoFocus={live}
                    value={typed}
                    onChange={(event) => setTyped(event.target.value)}
                  />
                  <button type="submit" className="icon-btn typebox__send" aria-label="Send">
                    <ArrowUp size={22} aria-hidden="true" />
                  </button>
                </form>
              )}
            </footer>
          </>
        )}
      </section>
    </>
  );
}
