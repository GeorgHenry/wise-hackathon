import type { VoiceEvent } from './types';

export type Phase = 'idle' | 'connecting' | 'listening' | 'working' | 'speaking' | 'ended';

export interface Line {
  id: number;
  role: 'user' | 'agent';
  text: string;
}

export interface SessionView {
  phase: Phase;
  lines: Line[];
  error: { code: string; message: string } | null;
  connected: boolean;
  mode: 'speaking' | 'listening';
  toolsRunning: number;
}

export type SessionEvent = VoiceEvent | { type: 'start' } | { type: 'reset' };

export const idleSession: SessionView = {
  phase: 'idle',
  lines: [],
  error: null,
  connected: false,
  mode: 'listening',
  toolsRunning: 0,
};

const MAX_LINES = 40;

/** Works out the phase of a running session from what is known about it. */
function withPhase(view: SessionView): SessionView {
  let phase: Phase = 'listening';
  if (!view.connected) phase = 'connecting';
  else if (view.toolsRunning > 0) phase = 'working';
  else if (view.mode === 'speaking') phase = 'speaking';
  return phase === view.phase ? view : { ...view, phase };
}

/** Turns the voice agent's events into what the voice sheet shows. */
export function reduceSession(view: SessionView, event: SessionEvent): SessionView {
  if (event.type === 'start') return { ...idleSession, phase: 'connecting' };
  if (event.type === 'reset') return idleSession;
  if (view.phase === 'idle' || view.phase === 'ended') return view; // stray events from a finished session

  switch (event.type) {
    case 'status':
      if (event.status === 'connected') return withPhase({ ...view, connected: true });
      if (event.status === 'disconnected') return { ...view, phase: 'ended', connected: false, toolsRunning: 0 };
      return view;

    case 'mode':
      return withPhase({ ...view, mode: event.mode });

    case 'tool': {
      const toolsRunning = Math.max(0, view.toolsRunning + (event.phase === 'start' ? 1 : -1));
      return withPhase({ ...view, toolsRunning });
    }

    case 'transcript': {
      const text = event.text.trim();
      if (!text) return view;
      const line: Line = { id: (view.lines.at(-1)?.id ?? 0) + 1, role: event.role === 'user' ? 'user' : 'agent', text };
      return { ...view, lines: [...view.lines, line].slice(-MAX_LINES) };
    }

    case 'transcript_correction': {
      const index = view.lines.findLastIndex((line) => line.role === 'agent');
      if (index < 0) return view;
      const lines = view.lines.map((line, i) => (i === index ? { ...line, text: event.text.trim() } : line));
      return { ...view, lines };
    }

    case 'error': {
      const error = { code: event.code ?? 'error', message: event.message };
      // An error before the agent ever answered means the session never started.
      return view.connected ? { ...view, error } : { ...view, error, phase: 'ended' };
    }

    default:
      return view;
  }
}
