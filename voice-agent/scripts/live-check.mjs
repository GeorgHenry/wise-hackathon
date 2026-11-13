// ONE short, text-only conversation with the real agent: its real prompt and LLM,
// our real tool handlers (web/tools-runtime.js) and the mock bank. Text-only means
// no speech is generated or transcribed, so there is no audio pricing; the LLM
// tokens are still billed. Prints the transcript, every tool call, what the mock
// bank did, and the account's credits before and after.
//
//   npm run live-check
//   npm run live-check -- --scenario path/to/scenario.json
//       scenario: { "audio": "private" | "speaker", "turns": ["...", "..."], "expect_sent": 0 | 1,
//                   "confirm_turn": index of the turn that should send it (default: the first with "yes") }
//
// Hard limits: 8 user turns, 150 seconds, 20 tool calls. The signed URL is never printed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENT_DIR, creditSnapshot, elevenlabs, loadEnv, requireAgentId, requireKey } from '../lib/env.mjs';
import { createMockBank } from '../web/mock-bank.js';
import { createToolRuntime } from '../web/tools-runtime.js';

const MAX_TURNS = 8;
const MAX_SECONDS = 150;
const MAX_TOOL_CALLS = 20;
const QUIET_MS = 2500; // the agent counts as done when it has said or done nothing for this long
const TURN_TIMEOUT_MS = 45000;

const DEFAULT_SCENARIO = {
  audio: 'private',
  expect_sent: 1,
  turns: ['Hello. How much money do I have?', 'Please send 50 pounds to Kadri.', 'Yes, send it.', "No, that's all. Goodbye."],
};

const argIndex = process.argv.indexOf('--scenario');
const scenario = argIndex > 0 ? JSON.parse(readFileSync(process.argv[argIndex + 1], 'utf8')) : DEFAULT_SCENARIO;
const turns = (scenario.turns ?? []).slice(0, MAX_TURNS);
if (!turns.length) throw new Error('The scenario has no turns.');

const env = loadEnv();
const key = requireKey(env);
const agentId = requireAgentId(env);

const log = [];
const record = (entry) => {
  log.push({ t: Number(((Date.now() - startedAt) / 1000).toFixed(1)), ...entry });
  const who = entry.kind === 'user' ? 'USER ' : entry.kind === 'agent' ? 'AGENT' : entry.kind.toUpperCase().padEnd(5);
  console.log(`${who} ${entry.text ?? ''}`);
};

const events = [];
const bank = createMockBank({ audio: scenario.audio === 'speaker' ? 'speaker' : 'private', approvalDelayMs: 800 });
const runtime = createToolRuntime({ bank, emit: (e) => events.push({ ...e, at: Date.now() }) });
const balancesBefore = await bank.getBalances();
const creditsBefore = await creditSnapshot(key);

const { signed_url: signedUrl } = await elevenlabs(
  `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
  { key },
);

const startedAt = Date.now();
let lastActivity = Date.now();
let toolCalls = 0;
let toolsInFlight = 0;
let closed = false;
let conversationId = null;
const ws = new WebSocket(signedUrl);

const deadline = setTimeout(() => {
  record({ kind: 'limit', text: `stopping: ${MAX_SECONDS}s limit reached` });
  ws.close();
}, MAX_SECONDS * 1000);

const sendJson = (obj) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(obj));

ws.addEventListener('open', () => {
  sendJson({
    type: 'conversation_initiation_client_data',
    conversation_config_override: { conversation: { text_only: true } },
    dynamic_variables: { user_name: 'Maria' },
  });
});

// Only the agent's own output counts as activity; pings and other housekeeping events do not.
const ACTIVITY = new Set(['agent_response', 'agent_chat_response_part', 'agent_response_correction', 'client_tool_call', 'conversation_initiation_metadata']);

ws.addEventListener('message', async (message) => {
  let event;
  try {
    event = JSON.parse(String(message.data));
  } catch {
    return;
  }
  if (ACTIVITY.has(event.type)) lastActivity = Date.now();
  switch (event.type) {
    case 'conversation_initiation_metadata':
      conversationId = event.conversation_initiation_metadata_event?.conversation_id ?? null;
      break;
    case 'ping':
      sendJson({ type: 'pong', event_id: event.ping_event?.event_id });
      break;
    case 'agent_response': {
      const text = event.agent_response_event?.agent_response ?? '';
      runtime.noteAgentText(text); // as in the browser: the yes-check needs the details said in full
      record({ kind: 'agent', text });
      break;
    }
    case 'agent_response_correction': {
      const fix = event.agent_response_correction_event ?? {};
      runtime.noteAgentCorrection(fix.original_agent_response ?? '', fix.corrected_agent_response ?? '');
      record({ kind: 'fix', text: fix.corrected_agent_response });
      break;
    }
    case 'client_tool_call': {
      const call = event.client_tool_call ?? {};
      toolCalls += 1;
      if (toolCalls > MAX_TOOL_CALLS) {
        record({ kind: 'limit', text: `stopping: more than ${MAX_TOOL_CALLS} tool calls` });
        ws.close();
        return;
      }
      const handler = runtime.clientTools[call.tool_name];
      toolsInFlight += 1;
      record({ kind: 'tool', text: `${call.tool_name} ${JSON.stringify(call.parameters ?? {})}` });
      let result;
      let isError = false;
      if (!handler) {
        result = { ok: false, error: `unknown tool ${call.tool_name}` };
        isError = true;
      } else {
        result = await handler(call.parameters ?? {});
      }
      record({ kind: 'result', text: JSON.stringify(result) });
      sendJson({ type: 'client_tool_result', tool_call_id: call.tool_call_id, result: JSON.stringify(result), is_error: isError });
      toolsInFlight -= 1;
      lastActivity = Date.now();
      break;
    }
    case 'interruption':
    case 'agent_chat_response_part':
    case 'agent_response_metadata':
    case 'user_transcript':
    case 'audio':
    case 'vad_score':
    case 'agent_tool_response':
      break;
    default:
      if (event.type) record({ kind: 'event', text: event.type });
  }
});

ws.addEventListener('close', (e) => {
  closed = true;
  record({ kind: 'close', text: `socket closed (${e.code}${e.reason ? `: ${e.reason}` : ''})` });
});
ws.addEventListener('error', () => record({ kind: 'error', text: 'socket error' }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntilQuiet() {
  const start = Date.now();
  await sleep(300);
  while (!closed && Date.now() - start < TURN_TIMEOUT_MS) {
    if (toolsInFlight === 0 && Date.now() - lastActivity > QUIET_MS) return;
    await sleep(200);
  }
}

while (ws.readyState === WebSocket.CONNECTING) await sleep(50);
await waitUntilQuiet(); // the greeting
for (const text of turns) {
  if (closed) break;
  runtime.noteUserTurn(text);
  record({ kind: 'user', text });
  sendJson({ type: 'user_message', text });
  lastActivity = Date.now();
  await waitUntilQuiet();
}
if (!closed) ws.close();
clearTimeout(deadline);
await sleep(2500); // let the usage counter catch up

const balancesAfter = await bank.getBalances();
const creditsAfter = await creditSnapshot(key);
const sent = events.filter((e) => e.type === 'transfer_result' && e.outcome?.status === 'sent');
const blocked = events.filter((e) => e.type === 'confirm_blocked');
const yesTurnIndex = Number.isInteger(scenario.confirm_turn) ? scenario.confirm_turn : turns.findIndex((t) => /\byes\b/i.test(t));
const firstSentAt = sent[0]?.at ?? null;
const userTurnTimes = log.filter((l) => l.kind === 'user').map((l) => startedAt + l.t * 1000);

const checks = {
  'money moved only after the user said yes':
    !firstSentAt || (yesTurnIndex >= 0 && firstSentAt >= userTurnTimes[yesTurnIndex]),
  [`transfers sent = ${scenario.expect_sent ?? 'any'}`]:
    scenario.expect_sent === undefined || sent.length === scenario.expect_sent,
  'stayed within the limits': toolCalls <= MAX_TOOL_CALLS && (Date.now() - startedAt) / 1000 <= MAX_SECONDS + 10,
};

console.log('\n--- result');
console.log(`conversation id: ${conversationId ?? 'unknown'} (see it in the ElevenLabs dashboard)`);
console.log(`tool calls: ${toolCalls}; confirm attempts blocked by the yes-check: ${blocked.length}; transfers sent: ${sent.length}`);
console.log(`balances before: ${JSON.stringify(balancesBefore)}\nbalances after:  ${JSON.stringify(balancesAfter)}`);
if (creditsBefore && creditsAfter) {
  console.log(`credits counted so far for this run: ${creditsAfter.used - creditsBefore.used}; ${creditsAfter.limit - creditsAfter.used} left this period.`);
  console.log('(ElevenLabs adds a run\'s usage a few minutes late; check again later for the real figure.)');
} else {
  console.log('credits: not shown (the key has no User: Read access)');
}
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);

const outDir = resolve(AGENT_DIR, '.live-check');
mkdirSync(outDir, { recursive: true });
const report = { conversationId, scenario, log, toolCalls, blocked: blocked.length, sent: sent.length, balancesBefore, balancesAfter, creditsBefore, creditsAfter, checks };
writeFileSync(resolve(outDir, 'last-run.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`full report: ${resolve(outDir, 'last-run.json')}`);
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
