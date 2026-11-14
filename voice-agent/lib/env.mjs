// Shared helpers for the Node side: where things live, reading and writing
// .env.local at the repo root, and calling the ElevenLabs REST API.
// Secrets are never printed; error messages carry the API's message, not the key.

import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AGENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = resolve(AGENT_DIR, '..');
export const ENV_FILE = process.env.VOICE_ENV_FILE ? resolve(process.env.VOICE_ENV_FILE) : resolve(ROOT_DIR, '.env.local');
// One state file per ElevenLabs account: set VOICE_STATE_FILE when provisioning a second account.
export const STATE_FILE = process.env.VOICE_STATE_FILE ? resolve(process.env.VOICE_STATE_FILE) : resolve(AGENT_DIR, '.elevenlabs-state.json');
export const API_BASE = 'https://api.elevenlabs.io';

const NAMES = ['ELEVENLABS_API_KEY', 'ELEVENLABS_AGENT_ID', 'ELEVENLABS_LLM', 'ELEVENLABS_VOICE_ID'];

/** Values from .env.local; the shell's environment fills only names the file does not set. */
export function loadEnv() {
  const fromFile = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) fromFile[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  const env = {};
  for (const name of NAMES) {
    const value = fromFile[name] || process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

/** Sets NAME=value in .env.local, keeping every other line. The file stays readable only by its owner. */
export function setEnvValue(name, value) {
  const lines = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter((l) => l !== '') : [];
  const kept = lines.filter((line) => !line.startsWith(`${name}=`));
  kept.push(`${name}=${value}`);
  const tmp = `${ENV_FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, `${kept.join('\n')}\n`, { mode: 0o600 });
  renameSync(tmp, ENV_FILE);
  chmodSync(ENV_FILE, 0o600);
}

export function requireKey(env) {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is missing. Run: bash voice-agent/scripts/set-elevenlabs-key.sh');
  }
  return env.ELEVENLABS_API_KEY;
}

export function requireAgentId(env) {
  if (!env.ELEVENLABS_AGENT_ID) throw new Error('ELEVENLABS_AGENT_ID is missing. Run: npm run provision (in voice-agent/)');
  return env.ELEVENLABS_AGENT_ID;
}

/** Calls the ElevenLabs REST API and returns parsed JSON; throws with the API's own message on failure. */
export async function elevenlabs(path, { key, method = 'GET', body, timeoutMs = 30000 } = {}) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const detail = json?.detail;
    const message =
      typeof detail === 'string' ? detail : detail?.message ?? (detail ? JSON.stringify(detail) : raw.slice(0, 300));
    const error = new Error(`ElevenLabs ${method} ${path.split('?')[0]} failed: HTTP ${res.status}: ${message}`);
    error.status = res.status;
    error.body = json ?? raw.slice(0, 2000);
    throw error;
  }
  return json;
}

/** Credits used and allowed this billing period, or null when the key has no User: Read access. */
export async function creditSnapshot(key) {
  try {
    const s = await elevenlabs('/v1/user/subscription', { key });
    return { used: s.character_count, limit: s.character_limit, tier: s.tier };
  } catch {
    return null;
  }
}

export function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export function writeState(state) {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}
