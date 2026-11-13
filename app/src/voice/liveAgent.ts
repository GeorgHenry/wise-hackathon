import type { StartVoice } from './types';

// The live ElevenLabs agent is built in voice-agent/, beside this app, by a
// separate piece of work. If that folder is missing the glob is empty and the
// app still builds and runs with the scripted agent.
const modules = import.meta.glob<{ startVoice: StartVoice }>('../../../voice-agent/web/voice.js');
const load = Object.values(modules)[0];

export const liveAgentInstalled = load !== undefined;

export const startLiveVoice: StartVoice = async (options) => {
  if (!load) throw new Error('The live voice agent is not installed: voice-agent/web/voice.js is missing.');
  const { startVoice } = await load();
  return startVoice({ tokenUrl: '/voice-api/token', ...options });
};

export interface LiveHealth {
  /** The voice server on port 8787 answered. */
  reachable: boolean;
  keySet: boolean;
  agentSet: boolean;
}

/** Asks the voice server whether a live session could start. Never throws. */
export async function checkLiveAgent(): Promise<LiveHealth> {
  try {
    const response = await fetch('/voice-api/health', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { keySet?: unknown; agentSet?: unknown };
    return { reachable: true, keySet: body.keySet === true, agentSet: body.agentSet === true };
  } catch {
    return { reachable: false, keySet: false, agentSet: false };
  }
}

export const liveReady = (health: LiveHealth): boolean => liveAgentInstalled && health.reachable && health.keySet && health.agentSet;
