import { useCallback, useEffect, useRef, useState } from 'react';
import { ApprovalSheet, useApproval } from './auth/ApprovalSheet';
import { formatMoney } from './bank/money';
import { bankStore, useBank } from './bank/useBank';
import { PhoneFrame } from './components/PhoneFrame';
import { type Tab, TabBar } from './components/TabBar';
import { DemoControls, type DemoSettings } from './demo/DemoControls';
import { Home } from './screens/Home';
import { Lock } from './screens/Lock';
import { Onboarding } from './screens/Onboarding';
import { Cards, Payments, Recipients } from './screens/Tabs';
import { VoiceSheet } from './screens/VoiceSheet';
import { checkLiveAgent, type LiveHealth } from './voice/liveAgent';
import { type AgentMode, useVoice } from './voice/useVoice';

type Stage = 'onboarding' | 'locked' | 'home';

const ONBOARDED_KEY = 'wv.onboarded';

// Storage can be unavailable (private windows, blocked site data); the app works without it.
function wasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberOnboarded(done: boolean): void {
  try {
    if (done) localStorage.setItem(ONBOARDED_KEY, '1');
    else localStorage.removeItem(ONBOARDED_KEY);
  } catch {
    // Nothing to do: onboarding simply shows again next time.
  }
}

export default function App() {
  const store = bankStore;
  const bank = useBank(store);
  const [stage, setStage] = useState<Stage>(() => (wasOnboarded() ? 'locked' : 'onboarding'));
  const [tab, setTab] = useState<Tab>('home');
  // Scripted by default: a live session bills ElevenLabs credits, so it is the presenter's choice.
  const [settings, setSettings] = useState<DemoSettings>({ faceIdPasses: true, agentMode: 'scripted', speakReplies: true });
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [live, setLive] = useState<LiveHealth | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const voice = useVoice(store, { mode: settings.agentMode, speakReplies: settings.speakReplies });
  const approval = useApproval(store);
  const focusBeforeVoice = useRef<HTMLElement | null>(null);

  const checkLive = useCallback(() => {
    setLive(null);
    void checkLiveAgent().then(setLive);
  }, []);

  useEffect(() => {
    void checkLiveAgent().then(setLive);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  // Money that arrives while the voice sheet is closed is shown on the screen instead.
  const arrived = bank.lastIncoming;
  useEffect(() => {
    if (!arrived || voiceOpen || stage !== 'home') return;
    const { amount, currency, counterparty } = arrived.transaction;
    setToast(`Money arrived: + ${formatMoney(amount, currency)} from ${counterparty}`);
    store.dismissIncoming();
  }, [arrived, voiceOpen, stage, store]);

  function openVoice(mode?: AgentMode): void {
    focusBeforeVoice.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVoiceOpen(true);
    voice.start(mode);
  }

  function closeVoice(): void {
    voice.stop();
    // Anything that arrived during the session was announced there; do not repeat it as a toast.
    store.dismissIncoming();
    setVoiceOpen(false);
    focusBeforeVoice.current?.focus();
  }

  /** Leaves Home for the lock screen or onboarding. Nothing about the account stays on screen. */
  function leave(next: Stage): void {
    closeVoice();
    setToast(null);
    setStage(next);
  }

  /** Voice-first: once unlocked, Wise Voice starts by itself. */
  function enter(): void {
    setStage('home');
    setTab('home');
    openVoice();
  }

  function changeSettings(patch: Partial<DemoSettings>): void {
    setSettings((current) => ({ ...current, ...patch }));
    if (patch.agentMode && voiceOpen) voice.start(patch.agentMode);
  }

  async function requestMicrophone(): Promise<void> {
    if (settings.agentMode !== 'live') return; // the scripted agent has no use for it
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) track.stop();
    } catch {
      // Refused or unavailable: the voice sheet explains it when a live session is tried.
    }
  }

  const covered = voiceOpen || approval !== null;

  return (
    <div className="stage">
      <PhoneFrame>
        {stage === 'onboarding' && (
          <Onboarding
            requestMicrophone={requestMicrophone}
            onDone={() => {
              rememberOnboarded(true);
              enter();
            }}
            onSkip={() => {
              rememberOnboarded(true);
              setStage('locked');
            }}
          />
        )}

        {stage === 'locked' && <Lock faceIdPasses={settings.faceIdPasses} onUnlock={enter} />}

        {stage === 'home' && (
          <>
            <div className="app__main" inert={covered}>
              {tab === 'home' && <Home onVoice={() => openVoice()} onToast={setToast} />}
              {tab === 'cards' && <Cards onToast={setToast} />}
              {tab === 'recipients' && <Recipients />}
              {tab === 'payments' && <Payments onToast={setToast} />}
              <TabBar tab={tab} onTab={setTab} onMic={() => openVoice()} />
            </div>
            {voiceOpen && (
              <VoiceSheet
                store={store}
                voice={voice}
                spoken={settings.speakReplies}
                onClose={closeVoice}
                onUseScripted={() => changeSettings({ agentMode: 'scripted' })}
              />
            )}
            {approval && <ApprovalSheet key={approval.transfer.transferId} request={approval} faceIdPasses={settings.faceIdPasses} />}
          </>
        )}

        {toast && (
          <p className="toast" role="status">
            {toast}
          </p>
        )}
      </PhoneFrame>

      <button type="button" className="btn btn--neutral demo-toggle" aria-expanded={demoOpen} onClick={() => setDemoOpen((open) => !open)}>
        Demo
      </button>
      <DemoControls
        open={demoOpen}
        store={store}
        settings={settings}
        live={live}
        onSettings={changeSettings}
        onCheckLive={checkLive}
        onLock={() => leave('locked')}
        onReplayOnboarding={() => {
          rememberOnboarded(false);
          leave('onboarding');
        }}
        onReset={() => {
          closeVoice();
          store.reset();
          setTab('home');
          setToast('The demo is back to the start.');
        }}
      />
    </div>
  );
}
