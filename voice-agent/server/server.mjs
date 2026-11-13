// Small local server for the voice agent.
//   GET /voice-api/health               -> { ok, keySet, agentSet }
//   GET /voice-api/token                -> { token }        WebRTC conversation token (default)
//   GET /voice-api/token?type=websocket -> { signed_url }
//   GET /                               -> the standalone demo page (web/demo/)
//   GET /web/...                        -> files from voice-agent/web/
// It holds the ElevenLabs key; the browser only ever gets short-lived tokens.
// It listens on 127.0.0.1 and answers only requests addressed to a local host name
// (so a web page using DNS rebinding cannot read tokens). For other host names,
// list them in VOICE_ALLOWED_HOSTS (comma-separated).

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { AGENT_DIR, elevenlabs, loadEnv } from '../lib/env.mjs';

const PORT = Number(process.env.VOICE_PORT ?? 8787);
const HOST = process.env.VOICE_HOST || '127.0.0.1';
const WEB_DIR = resolve(AGENT_DIR, 'web');
const TOKENS_PER_MINUTE = 20; // a leaked page cannot start unlimited paid conversations
const EXTRA_HOSTS = new Set(
  String(process.env.VOICE_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.map': 'application/json; charset=utf-8',
};

const recentTokens = [];

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

/** "localhost:5173" -> "localhost"; "[::1]:8787" -> "::1". Plain string work: a bad header cannot throw. */
function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '').trim().toLowerCase();
  if (h.startsWith('[')) {
    const m = /^\[([0-9a-f:.]+)\](?::\d+)?$/.exec(h);
    return m ? m[1] : ''; // a malformed IPv6 host is not a local name
  }
  return /^[a-z0-9.-]+(?::\d+)?$/.test(h) ? h.replace(/:\d+$/, '') : '';
}

function isAllowedHost(hostHeader) {
  const name = hostnameOf(hostHeader);
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '::1' ||
    name.endsWith('.localhost') ||
    EXTRA_HOSTS.has(name)
  );
}

async function handleToken(url, res) {
  const now = Date.now();
  while (recentTokens.length && now - recentTokens[0] > 60000) recentTokens.shift();
  if (recentTokens.length >= TOKENS_PER_MINUTE) return send(res, 429, { error: 'Too many voice sessions started; wait a minute.' });

  const env = loadEnv(); // read on every request, so a new agent id needs no restart
  if (!env.ELEVENLABS_API_KEY) return send(res, 503, { error: 'ELEVENLABS_API_KEY is not set (run voice-agent/scripts/set-elevenlabs-key.sh).' });
  if (!env.ELEVENLABS_AGENT_ID) return send(res, 503, { error: 'ELEVENLABS_AGENT_ID is not set (run npm run provision in voice-agent/).' });
  recentTokens.push(now);

  const agent = encodeURIComponent(env.ELEVENLABS_AGENT_ID);
  try {
    if (url.searchParams.get('type') === 'websocket') {
      const r = await elevenlabs(`/v1/convai/conversation/get-signed-url?agent_id=${agent}`, { key: env.ELEVENLABS_API_KEY });
      return send(res, 200, { signed_url: r.signed_url });
    }
    const r = await elevenlabs(`/v1/convai/conversation/token?agent_id=${agent}`, { key: env.ELEVENLABS_API_KEY });
    return send(res, 200, { token: r.token });
  } catch (error) {
    console.error(`[voice-server] token request failed: ${error.message}`);
    return send(res, 502, { error: 'ElevenLabs refused the token request; see the voice server log.' });
  }
}

async function handleStatic(pathname, res) {
  let relative;
  try {
    relative = pathname === '/' ? 'demo/index.html' : decodeURIComponent(pathname.replace(/^\/web\//, ''));
  } catch {
    return send(res, 400, { error: 'bad path' });
  }
  const file = resolve(WEB_DIR, relative);
  if (file !== WEB_DIR && !file.startsWith(WEB_DIR + sep)) return send(res, 403, { error: 'forbidden' });
  try {
    const body = await readFile(file);
    return send(res, 200, body, TYPES[extname(file)] ?? 'application/octet-stream');
  } catch {
    return send(res, 404, { error: 'not found' });
  }
}

async function route(req, res) {
  if (!isAllowedHost(req.headers.host)) return send(res, 403, { error: 'unknown host' });
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' });
  const url = new URL(req.url ?? '/', 'http://localhost'); // never parse the Host header as a URL
  if (url.pathname === '/voice-api/health') {
    const env = loadEnv();
    return send(res, 200, { ok: true, keySet: Boolean(env.ELEVENLABS_API_KEY), agentSet: Boolean(env.ELEVENLABS_AGENT_ID) });
  }
  if (url.pathname === '/voice-api/token') return handleToken(url, res);
  if (url.pathname === '/' || url.pathname.startsWith('/web/')) return handleStatic(url.pathname, res);
  return send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    console.error(`[voice-server] request failed: ${error?.message ?? error}`);
    if (!res.headersSent) send(res, 500, { error: 'internal error' });
    else res.end();
  });
});
server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  const env = loadEnv();
  const { port } = server.address();
  console.log(`[voice-server] listening on http://localhost:${port} (demo page at /, tokens at /voice-api/token)`);
  console.log(`[voice-server] key ${env.ELEVENLABS_API_KEY ? 'set' : 'MISSING'}, agent ${env.ELEVENLABS_AGENT_ID ? 'set' : 'MISSING'}`);
});
