import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ACCOUNT_HOLDER } from '../bank/seed';
import type { BankStore } from '../bank/store';
import { startLiveVoice } from './liveAgent';
import { startScriptedVoice } from './scriptedAgent';
import { idleSession, reduceSession, type SessionView } from './sessionReducer';
import { cancelSpeech, speakAloud } from './speech';
import type { VoiceEvent, VoiceSession } from './types';

export type AgentMode = 'scripted' | 'live';

export interface VoiceSettings {
  mode: AgentMode;
  /** The scripted agent reads its lines with the browser's own voice. */
  speakReplies: boolean;
}

export interface Voice {
  view: SessionView;
  /** The agent behind the current or most recent session. */
  mode: AgentMode;
  start(mode?: AgentMode): void;
  stop(): void;
  sendText(text: string): void;
  notify(text: string): void;
}

/** A transfer must not outlive the conversation that prepared it. */
function cancelWaitingTransfer(store: BankStore): void {
  const waiting = store.getSnapshot().transfer;
  if (waiting && (waiting.phase === 'prepared' || waiting.phase === 'approving')) {
    void store.cancelTransfer(waiting.transfer.transferId);
  }
}

export function useVoice(store: BankStore, settings: VoiceSettings): Voice {
  const [view, dispatch] = useReducer(reduceSession, idleSession);
  const [mode, setMode] = useState<AgentMode>(settings.mode);
  const session = useRef<VoiceSession | null>(null);
  /** Counts sessions, so events and results from an older one are dropped. */
  const run = useRef(0);
  const latest = useRef(settings);

  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  const stop = useCallback(() => {
    run.current += 1;
    const ending = session.current;
    session.current = null;
    cancelSpeech();
    ending?.stop().catch(() => undefined);
    cancelWaitingTransfer(store);
    dispatch({ type: 'reset' });
  }, [store]);

  const start = useCallback(
    (wanted?: AgentMode) => {
      session.current?.stop().catch(() => undefined);
      session.current = null;
      cancelSpeech();

      const thisRun = ++run.current;
      const chosen = wanted ?? latest.current.mode;
      setMode(chosen);
      dispatch({ type: 'start' });

      const onEvent = (event: VoiceEvent): void => {
        if (run.current === thisRun) dispatch(event);
      };
      const common = { bank: store, onEvent, userName: ACCOUNT_HOLDER.firstName, language: 'en' };
      const starting =
        chosen === 'live'
          ? startLiveVoice(common)
          : startScriptedVoice({ ...common, speak: (text) => speakAloud(text, () => latest.current.speakReplies) });

      starting.then(
        (started) => {
          if (run.current === thisRun) session.current = started;
          else started.stop().catch(() => undefined);
        },
        (error: unknown) => {
          // The live module reports its own error first; this covers anything that did not.
          onEvent({ type: 'error', code: 'start_failed', message: error instanceof Error ? error.message : String(error) });
        },
      );
    },
    [store],
  );

  // The agent hung up or the connection dropped.
  useEffect(() => {
    if (view.phase !== 'ended') return;
    session.current = null;
    cancelSpeech();
    cancelWaitingTransfer(store);
  }, [view.phase, store]);

  // Leaving the page ends the session.
  useEffect(
    () => () => {
      run.current += 1;
      session.current?.stop().catch(() => undefined);
      cancelSpeech();
    },
    [],
  );

  const sendText = useCallback((text: string) => session.current?.sendText(text), []);
  const notify = useCallback((text: string) => session.current?.notify(text), []);

  return { view, mode, start, stop, sendText, notify };
}
