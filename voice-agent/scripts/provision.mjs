// Creates or updates the Wise Voice agent and its client tools on ElevenLabs.
// Run again after changing agent/prompt.md, agent/tools.js or agent/config.js.
//
//   npm run provision            create or update (no conversation, uses no credits)
//   npm run provision -- --dry-run   print what would be sent, call nothing
//
// Tool ids live in voice-agent/.elevenlabs-state.json, so only tools this script
// created are ever updated (never another agent's tool with the same name).
// The agent id goes to .env.local as ELEVENLABS_AGENT_ID.

import { readFileSync } from 'node:fs';
import { buildAgentBody, DEFAULT_LLM } from '../agent/config.js';
import { CLIENT_TOOLS, toToolConfig } from '../agent/tools.js';
import { elevenlabs, loadEnv, readState, requireKey, setEnvValue, writeState } from '../lib/env.mjs';

const dryRun = process.argv.includes('--dry-run');
const env = loadEnv();
const prompt = readFileSync(new URL('../agent/prompt.md', import.meta.url), 'utf8');
const llm = env.ELEVENLABS_LLM || DEFAULT_LLM;

if (dryRun) {
  const body = buildAgentBody({ prompt, toolIds: CLIENT_TOOLS.map((t) => `<id of ${t.name}>`), llm, voiceId: env.ELEVENLABS_VOICE_ID });
  console.log(JSON.stringify({ tools: CLIENT_TOOLS.map(toToolConfig), agent: body }, null, 2));
  process.exit(0);
}

const key = requireKey(env);
const state = readState();
state.tools ??= {};

// The LLM must be one this account can use.
try {
  const list = await elevenlabs('/v1/convai/llm/list', { key });
  if (!JSON.stringify(list).includes(`"${llm}"`)) {
    console.warn(`Warning: ${llm} is not in this account's LLM list; the agent update may fail. Set ELEVENLABS_LLM in .env.local to choose another.`);
  }
} catch (error) {
  console.warn(`Could not read the LLM list (${error.status ?? error.message}); carrying on.`);
}

const toolIds = [];
for (const tool of CLIENT_TOOLS) {
  const body = { tool_config: toToolConfig(tool) };
  const knownId = state.tools[tool.name];
  let id = null;
  if (knownId) {
    try {
      await elevenlabs(`/v1/convai/tools/${encodeURIComponent(knownId)}`, { key, method: 'PATCH', body });
      id = knownId;
      console.log(`tool ${tool.name}: updated`);
    } catch (error) {
      if (error.status !== 404) throw error;
      console.log(`tool ${tool.name}: saved id no longer exists, creating a new one`);
    }
  }
  if (!id) {
    const created = await elevenlabs('/v1/convai/tools', { key, method: 'POST', body });
    id = created.id;
    console.log(`tool ${tool.name}: created`);
  }
  state.tools[tool.name] = id;
  toolIds.push(id);
  writeState(state);
}

const agentBody = buildAgentBody({ prompt, toolIds, llm, voiceId: env.ELEVENLABS_VOICE_ID });
let agentId = env.ELEVENLABS_AGENT_ID;
if (agentId) {
  await elevenlabs(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { key, method: 'PATCH', body: agentBody });
  console.log('agent: updated');
} else {
  const created = await elevenlabs('/v1/convai/agents/create', { key, method: 'POST', body: agentBody });
  agentId = created.agent_id;
  setEnvValue('ELEVENLABS_AGENT_ID', agentId);
  console.log('agent: created; ELEVENLABS_AGENT_ID saved to .env.local');
}

// Read the agent back and check the settings that matter for safety and cost.
const agent = await elevenlabs(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { key });
const cc = agent.conversation_config ?? {};
const checks = {
  'private (token required)': agent.platform_settings?.auth?.enable_auth === true,
  'all client tools attached': toolIds.every((id) => (cc.agent?.prompt?.tool_ids ?? []).includes(id)),
  [`llm is ${llm}`]: cc.agent?.prompt?.llm === llm,
  'text-only override allowed': agent.platform_settings?.overrides?.conversation_config_override?.conversation?.text_only === true,
  'voice recording off': agent.platform_settings?.privacy?.record_voice === false,
  'one tool call at a time': cc.agent?.prompt?.enable_parallel_tool_calls === false,
};
for (const tool of CLIENT_TOOLS) {
  const saved = await elevenlabs(`/v1/convai/tools/${encodeURIComponent(state.tools[tool.name])}`, { key });
  const c = saved.tool_config ?? {};
  const params = (o) => Object.keys(o?.properties ?? {}).sort().join(',');
  checks[`tool ${tool.name}: waits ${tool.response_timeout_secs ?? 20}s for the app, same parameters`] =
    c.expects_response === true &&
    c.response_timeout_secs === (tool.response_timeout_secs ?? 20) &&
    params(c.parameters) === params(tool.parameters);
}
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
console.log(`tts: ${cc.tts?.model_id}, voice ${cc.tts?.voice_id}, speed ${cc.tts?.speed}; max ${cc.conversation?.max_duration_seconds}s per call`);
if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
