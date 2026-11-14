// Shared by the Vercel Functions behind /voice-api/* (rewrites in vercel.json).
// The ElevenLabs key and agent id come from the Vercel project's environment
// variables; the browser only ever gets short-lived conversation tokens.
//
// Optional gate: when VOICE_PASSCODE is set, a request must carry the same value in
// the x-voice-code header. Visitors without it get the scripted demo agent instead
// of live (paid) voice, because /voice-api/health then answers allowed: false.

import { timingSafeEqual } from 'node:crypto';

export function voiceEnv() {
  return {
    key: process.env.ELEVENLABS_API_KEY || '',
    agentId: process.env.ELEVENLABS_AGENT_ID || '',
    passcode: process.env.VOICE_PASSCODE || '',
  };
}

export function codeAllowed(req, passcode) {
  if (!passcode) return true;
  const given = Buffer.from(String(req.headers['x-voice-code'] ?? ''));
  const wanted = Buffer.from(passcode);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(JSON.stringify(body));
}
