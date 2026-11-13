import { codeAllowed, send, voiceEnv } from './_voice.mjs';

const API = 'https://api.elevenlabs.io';
// Best effort only: each function instance counts on its own. The real caps are the
// agent's call length (8 min) and the limits set on the key in ElevenLabs.
const TOKENS_PER_MINUTE = 20;
const recent = [];

/** GET /voice-api/token -> { token } (WebRTC); ?type=websocket -> { signed_url }. */
export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  const env = voiceEnv();
  if (!codeAllowed(req, env.passcode)) return send(res, 401, { error: 'This demo needs its invite link for live voice.' });
  if (!env.key || !env.agentId) return send(res, 503, { error: 'Live voice is not configured on this deployment.' });

  const now = Date.now();
  while (recent.length && now - recent[0] > 60000) recent.shift();
  if (recent.length >= TOKENS_PER_MINUTE) return send(res, 429, { error: 'Too many voice sessions started; wait a minute.' });
  recent.push(now);

  const url = new URL(req.url ?? '/', 'http://localhost');
  const websocket = url.searchParams.get('type') === 'websocket';
  const agent = encodeURIComponent(env.agentId);
  const path = websocket
    ? `/v1/convai/conversation/get-signed-url?agent_id=${agent}`
    : `/v1/convai/conversation/token?agent_id=${agent}`;
  try {
    const r = await fetch(API + path, { headers: { 'xi-api-key': env.key }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      console.error(`[voice-token] ElevenLabs answered HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return send(res, 502, { error: 'ElevenLabs refused the token request.' });
    }
    const body = await r.json();
    return send(res, 200, websocket ? { signed_url: body.signed_url } : { token: body.token });
  } catch (error) {
    console.error(`[voice-token] request failed: ${error?.message ?? error}`);
    return send(res, 502, { error: 'Could not reach ElevenLabs.' });
  }
}
