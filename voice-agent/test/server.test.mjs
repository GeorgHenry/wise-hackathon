// Starts the real server on a free port with no key (VOICE_ENV_FILE points nowhere),
// so nothing here can reach ElevenLabs or spend credits.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../server/server.mjs', import.meta.url));
let child;
let port;

before(async () => {
  child = spawn(process.execPath, [SERVER], {
    env: { PATH: process.env.PATH, VOICE_PORT: '0', VOICE_ENV_FILE: '/nonexistent/voice-test.env' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
      const m = /listening on http:\/\/localhost:(\d+)/.exec(out);
      if (m) resolve(Number(m[1]));
    });
    child.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
    setTimeout(() => reject(new Error('server did not start')), 5000);
  });
});

after(() => child?.kill());

/** Sends a raw HTTP request (any Host header, any path) and returns the status code. */
function raw(path, host = `localhost:${port}`, method = 'GET') {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`${method} ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    });
    let data = '';
    socket.on('data', (d) => {
      data += d;
    });
    socket.on('end', () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
    socket.on('error', reject);
  });
}

const alive = async () => assert.equal(await raw('/voice-api/health'), 200, 'server should still answer');

test('health says what is missing; tokens are refused without a key', async () => {
  const res = await fetch(`http://localhost:${port}/voice-api/health`);
  assert.deepEqual(await res.json(), { ok: true, keySet: false, agentSet: false });
  assert.equal(await raw('/voice-api/token'), 503);
});

test('requests that used to crash the server get an error and it keeps running', async () => {
  assert.equal(await raw('/web/%'), 400);
  await alive();
  assert.ok([400, 403].includes(await raw('/voice-api/health', '[::1')));
  await alive();
  assert.ok([400, 403].includes(await raw('/voice-api/health', '')));
  await alive();
});

test('only local host names are served (DNS rebinding cannot read tokens)', async () => {
  assert.equal(await raw('/voice-api/token', 'evil.example:8787'), 403);
  assert.equal(await raw('/voice-api/health', 'localhost:5173'), 200); // Vite proxy passes its own Host
  assert.equal(await raw('/voice-api/health', '127.0.0.1'), 200);
  assert.equal(await raw('/voice-api/health', 'app.localhost'), 200);
});

test('files outside voice-agent/web are never served; only GET is allowed', async () => {
  assert.equal(await raw('/web/..%2f..%2f.env.local'), 403);
  assert.equal(await raw('/web/%2e%2e/lib/env.mjs'), 404);
  assert.equal(await raw('/web/voice.js'), 200);
  assert.equal(await raw('/voice-api/token', `localhost:${port}`, 'POST'), 405);
});
