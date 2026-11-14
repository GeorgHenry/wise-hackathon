import type { StartVoice } from './types';

// The live ElevenLabs agent is built in voice-agent/, beside this app, by a
// separate piece of work. If that folder is missing the glob is empty and the
// app still builds and runs with the scripted agent.
const modules = import.meta.glob<{ startVoice: StartVoice }>('../../../voice-agent/web/voice.js');
const load = Object.values(modules)[0];

export const liveAgentInstalled = load !== undefined;

// A public deployment can require a passcode for live (paid) voice. The invite link
// carries it as ?code=...; it is kept for this tab only and sent as a header, never
// in a URL. Without it the app uses the scripted agent.
const CODE_KEY = 'wise-voice-code';

function voiceCode(): string {
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get('code');
    if (fromUrl) {
      sessionStorage.setItem(CODE_KEY, fromUrl);
      url.searchParams.delete('code');
      window.history.replaceState(null, '', url);
    }
    return sessionStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
}

const codeHeaders = (): Record<string, string> => {
  const code = voiceCode();
  return code ? { 'x-voice-code': code } : {};
};

export const startLiveVoice: StartVoice = async (options) => {
  if (!load) throw new Error('The live voice agent is not installed: voice-agent/web/voice.js is missing.');
  const { startVoice } = await load();
  return startVoice({ tokenUrl: '/voice-api/token', tokenHeaders: codeHeaders(), ...options });
};

export interface LiveHealth {
  /** The voice server on port 8787 answered. */
  reachable: boolean;
  keySet: boolean;
  agentSet: boolean;
  /** False when the deployment wants a passcode this tab does not have. */
  allowed: boolean;
}

/** Asks the voice server whether a live session could start. Never throws. */
export async function checkLiveAgent(): Promise<LiveHealth> {
  try {
    const response = await fetch('/voice-api/health', { cache: 'no-store', headers: codeHeaders() });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { keySet?: unknown; agentSet?: unknown; allowed?: unknown };
    // The local voice server sends no `allowed`: it has no passcode.
    return { reachable: true, keySet: body.keySet === true, agentSet: body.agentSet === true, allowed: body.allowed !== false };
  } catch {
    return { reachable: false, keySet: false, agentSet: false, allowed: false };
  }
}

export const liveReady = (health: LiveHealth): boolean => liveAgentInstalled && health.reachable && health.keySet && health.agentSet && health.allowed;
