// Browser entry point for the Wise voice agent.
//
//   import { startVoice } from '.../voice-agent/web/voice.js';
//   const session = await startVoice({ bank, onEvent });   // call from a click: it asks for the microphone
//   session.sendText('What is my balance?');                 // typed fallback for a noisy room
//   session.notify('The user tapped Cancel on the card');    // context for the agent, not a user turn
//   await session.stop();
//
// The ElevenLabs API key never reaches the browser. The page asks our server
// (voice-agent/server, port 8787; the app proxies it as /voice-api) for a
// short-lived conversation token instead.

import { cleanText, createToolRuntime, describeSender } from './tools-runtime.js';

/**
 * @param {object} [options]
 * @param {object} [options.bank]  The app's bank object (README: bank contract). Defaults to the mock bank.
 * @param {(event: object) => void} [options.onEvent]  UI events, see README.
 * @param {string} [options.tokenUrl]  Defaults to '/voice-api/token'.
 * @param {string} [options.language]  'en' (default). Other languages only once they pass a test.
 * @param {string} [options.userName]  Used in the greeting.
 * @param {'webrtc'|'websocket'} [options.connectionType]
 * @param {number} [options.voiceLimit]  Largest amount one voice transfer may send (default 1000).
 * @param {object} [options.Conversation]  Inject @elevenlabs/client's Conversation (optional).
 */
export async function startVoice(options = {}) {
  const {
    onEvent = () => {},
    tokenUrl = '/voice-api/token',
    language = 'en',
    userName = 'Maria',
    connectionType = 'webrtc',
    voiceLimit,
  } = options;

  const emit = (event) => {
    try {
      onEvent(event);
    } catch (error) {
      console.error('[voice] onEvent handler threw', error);
    }
  };

  const bank = options.bank ?? (await import('./mock-bank.js')).createMockBank();
  const Conversation = options.Conversation ?? (await import('@elevenlabs/client')).Conversation;
  const runtime = createToolRuntime({ bank, emit, ...(voiceLimit ? { voiceLimit } : {}) });

  emit({ type: 'status', status: 'connecting' });

  let conversation = null;
  let unsubscribe = () => {};
  let ended = false;
  const cleanup = () => {
    if (ended) return;
    ended = true;
    try {
      unsubscribe();
    } catch {
      // the bank's unsubscribe failing must not stop the shutdown
    }
  };

  try {
    const auth = await fetchSessionAuth(tokenUrl, connectionType);
    conversation = await Conversation.startSession({
      ...(connectionType === 'websocket'
        ? { signedUrl: auth.signed_url, connectionType: 'websocket' }
        : { conversationToken: auth.token, connectionType: 'webrtc' }),
      clientTools: runtime.clientTools,
      dynamicVariables: { user_name: cleanText(userName, 40) || 'there' },
      ...(language && language !== 'en' ? { overrides: { agent: { language } } } : {}),
      onConnect: ({ conversationId }) => emit({ type: 'status', status: 'connected', conversationId }),
      onStatusChange: ({ status }) => emit({ type: 'status', status }),
      onModeChange: ({ mode }) => emit({ type: 'mode', mode }), // 'speaking' | 'listening'
      onMessage: ({ message, role }) => {
        if (role === 'user') runtime.noteUserTurn(message);
        else if (role === 'agent') runtime.noteAgentText(message); // did the user hear the payment details?
        emit({ type: 'transcript', role, text: message, final: true });
      },
      // The user talked over the agent: only what was said before it stopped was heard.
      onAgentResponseCorrection: (c) => {
        runtime.noteAgentCorrection(c?.original_agent_response ?? '', c?.corrected_agent_response ?? '');
        emit({ type: 'transcript_correction', role: 'agent', text: c?.corrected_agent_response ?? '' });
      },
      onError: (message) => emit({ type: 'error', code: 'agent_error', message: String(message) }),
      onDisconnect: (details) => {
        cleanup();
        emit({ type: 'status', status: 'disconnected', reason: details?.reason ?? 'unknown' });
      },
    });
  } catch (error) {
    cleanup();
    const micBlocked = error?.name === 'NotAllowedError' || /permission/i.test(String(error?.message));
    emit({
      type: 'error',
      code: micBlocked ? 'microphone_blocked' : 'start_failed',
      message: micBlocked ? 'Microphone access was refused.' : String(error?.message ?? error),
    });
    emit({ type: 'status', status: 'disconnected', reason: 'error' });
    throw error;
  }

  const readAudio = async () => {
    try {
      return (await bank.getAudioPrivacy()) === 'private' ? 'private' : 'speaker';
    } catch {
      return 'speaker';
    }
  };
  let audio = typeof bank.getAudioPrivacy === 'function' ? await readAudio() : null;

  if (typeof bank.subscribe === 'function') {
    unsubscribe = bank.subscribe(async (event) => {
      try {
        if (event?.type === 'incoming_payment' && event.transaction) {
          // No amount in the note: the agent fetches it with get_transactions, which
          // applies the loudspeaker rule. Odd-looking names are not passed on at all.
          const sender = describeSender(event.transaction.counterparty);
          conversation?.sendContextualUpdate(
            sender.unusual
              ? 'Note from the app: money has just arrived, from a sender whose name looks unusual. At the next natural pause, tell the user money arrived, do not read the name, and suggest checking it with someone they trust.'
              : `Note from the app: money has just arrived from ${sender.name}. At the next natural pause, tell the user who sent it.`,
          );
          emit({ type: 'incoming_payment', transaction: event.transaction });
        }
        if (event?.type === 'changed' && audio !== null && !ended) {
          const next = await readAudio();
          if (next !== audio) {
            conversation?.sendContextualUpdate(
              next === 'speaker'
                ? 'Note from the app: sound now goes to the loudspeaker. Do not say any amounts until the user agrees again.'
                : 'Note from the app: sound is now private (headphones, or the phone held to the ear).',
            );
            audio = next;
          }
        }
      } catch (error) {
        console.error('[voice] bank event handling failed', error);
      }
    });
  }

  return {
    conversationId: conversation.getId(),

    /**
     * Typed fallback: counts as the user's own words. A typed yes (the card's Send button)
     * counts even if the spoken readback was cut short, because the card shows the details.
     */
    sendText(text) {
      const t = cleanText(text, 300);
      if (!t || ended) return;
      runtime.noteUserTurn(t, { typed: true });
      conversation.sendUserMessage(t);
      emit({ type: 'transcript', role: 'user', text: t, final: true, typed: true });
    },

    /** Tells the agent something without making it a user turn, e.g. "The user tapped Cancel". */
    notify(text) {
      const t = cleanText(text, 300);
      if (t && !ended) conversation.sendContextualUpdate(`Note from the app: ${t}`);
    },

    setMuted(muted) {
      conversation.setMicMuted(Boolean(muted));
    },

    async stop() {
      cleanup();
      await conversation.endSession();
    },
  };
}

async function fetchSessionAuth(tokenUrl, connectionType) {
  const url = new URL(tokenUrl, globalThis.location?.href ?? 'http://localhost/');
  if (connectionType === 'websocket') url.searchParams.set('type', 'websocket');
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      `Could not get a voice token (HTTP ${res.status}). Is the voice server running? In voice-agent/: npm run server`,
    );
  }
  return res.json();
}
