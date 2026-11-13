import { codeAllowed, send, voiceEnv } from './_voice.mjs';

/** GET /voice-api/health -> { ok, keySet, agentSet, allowed }. Never reveals the values. */
export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  const env = voiceEnv();
  return send(res, 200, {
    ok: true,
    keySet: Boolean(env.key),
    agentSet: Boolean(env.agentId),
    allowed: codeAllowed(req, env.passcode),
  });
}
