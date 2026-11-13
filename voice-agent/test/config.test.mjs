import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAgentBody, DEFAULT_LLM, FIRST_MESSAGE } from '../agent/config.js';
import { CLIENT_TOOLS, TOOL_NAMES, toToolConfig } from '../agent/tools.js';
import { createMockBank } from '../web/mock-bank.js';
import { createToolRuntime } from '../web/tools-runtime.js';

const prompt = readFileSync(new URL('../agent/prompt.md', import.meta.url), 'utf8');

test('every agent tool has a browser handler, and every handler is an agent tool', () => {
  const handlers = Object.keys(createToolRuntime({ bank: createMockBank() }).clientTools).sort();
  assert.deepEqual(handlers, [...TOOL_NAMES].sort());
});

test('tool definitions are valid for ElevenLabs', () => {
  for (const tool of CLIENT_TOOLS) {
    const config = toToolConfig(tool);
    assert.match(config.name, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.equal(config.type, 'client');
    assert.equal(config.expects_response, true);
    assert.ok(config.description.length > 20, tool.name);
    assert.ok(config.response_timeout_secs >= 1 && config.response_timeout_secs <= 120, tool.name);
    const { properties, required } = config.parameters;
    for (const [name, schema] of Object.entries(properties)) {
      assert.ok(schema.description, `${tool.name}.${name} needs a description`);
      assert.ok(['string', 'number', 'boolean'].includes(schema.type), `${tool.name}.${name} type`);
    }
    for (const name of required) assert.ok(properties[name], `${tool.name} requires missing ${name}`);
  }
  // Face ID can take a while: the agent must wait for it.
  assert.ok(toToolConfig(CLIENT_TOOLS.find((t) => t.name === 'confirm_transfer')).response_timeout_secs >= 60);
});

test('the prompt covers every tool and the greeting variable', () => {
  for (const name of TOOL_NAMES) assert.ok(prompt.includes(name), `prompt never mentions ${name}`);
  assert.ok(prompt.includes('{{user_name}}'));
  assert.ok(FIRST_MESSAGE.includes('{{user_name}}'));
});

test('agent settings: private, text-only allowed, no recordings, tools in order', () => {
  const body = buildAgentBody({ prompt, toolIds: ['t1', 't2'] });
  assert.equal(body.platform_settings.auth.enable_auth, true);
  assert.equal(body.platform_settings.overrides.conversation_config_override.conversation.text_only, true);
  assert.equal(body.platform_settings.privacy.record_voice, false);
  const agentPrompt = body.conversation_config.agent.prompt;
  assert.equal(agentPrompt.llm, DEFAULT_LLM);
  assert.equal(agentPrompt.enable_parallel_tool_calls, false);
  assert.deepEqual(agentPrompt.tool_ids, ['t1', 't2']);
  assert.equal(body.conversation_config.agent.dynamic_variables.dynamic_variable_placeholders.user_name, 'there');
  assert.equal(body.conversation_config.tts.voice_id, undefined);
  assert.equal(buildAgentBody({ prompt, toolIds: [], voiceId: 'v1' }).conversation_config.tts.voice_id, 'v1');
});

test('no secrets in the agent definition', () => {
  const text = JSON.stringify(buildAgentBody({ prompt, toolIds: [] })) + JSON.stringify(CLIENT_TOOLS);
  assert.equal(/sk_[a-z0-9]|xi-api-key/i.test(text), false);
});
