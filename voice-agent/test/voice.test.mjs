// startVoice with a fake Conversation and a fake token endpoint: no network, no credits.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockBank } from '../web/mock-bank.js';
import { startVoice } from '../web/voice.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakes() {
  const calls = { startSession: null, userMessages: [], context: [], ended: 0, muted: [] };
  const Conversation = {
    async startSession(options) {
      calls.startSession = options;
      options.onConnect?.({ conversationId: 'conv_test' });
      return {
        getId: () => 'conv_test',
        sendUserMessage: (t) => calls.userMessages.push(t),
        sendContextualUpdate: (t) => calls.context.push(t),
        setMicMuted: (m) => calls.muted.push(m),
        endSession: async () => {
          calls.ended += 1;
        },
      };
    },
  };
  return { calls, Conversation };
}

function stubFetch(body = { token: 'tok_test' }, ok = true) {
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return { ok, status: ok ? 200 : 503, json: async () => body };
  };
  return requested;
}

test('startVoice asks our server for a token and passes the tools to ElevenLabs', async () => {
  const requested = stubFetch();
  const { calls, Conversation } = fakes();
  const events = [];
  const session = await startVoice({ bank: createMockBank(), Conversation, onEvent: (e) => events.push(e), tokenUrl: '/voice-api/token' });
  assert.match(requested[0], /\/voice-api\/token$/);
  const opts = calls.startSession;
  assert.equal(opts.conversationToken, 'tok_test');
  assert.equal(opts.connectionType, 'webrtc');
  assert.equal(opts.dynamicVariables.user_name, 'Maria');
  assert.equal(opts.overrides, undefined); // English is the agent's own language
  assert.deepEqual(Object.keys(opts.clientTools).sort(), [
    'cancel_transfer', 'confirm_transfer', 'find_recipient', 'find_wise_user', 'get_balances', 'get_quote', 'get_transactions', 'prepare_transfer',
  ]);
  assert.ok(events.some((e) => e.type === 'status' && e.status === 'connected'));
  assert.equal(session.conversationId, 'conv_test');
});

test('spoken and typed user words both count for the yes-check', async () => {
  stubFetch();
  const { calls, Conversation } = fakes();
  const session = await startVoice({ bank: createMockBank(), Conversation });
  const { clientTools: tools, onMessage } = calls.startSession;

  const quote = await tools.get_quote({ recipient_id: 'rcp_kadri', amount: 20, currency: 'GBP' });
  const prepared = await tools.prepare_transfer({ quote_id: quote.quote_id });
  onMessage({ role: 'agent', message: 'Shall I send it? Say yes.' }); // the agent's words never count as the user's
  assert.equal((await tools.confirm_transfer({ transfer_id: prepared.transfer_id })).error, 'needs_readback');
  onMessage({ role: 'agent', message: `${prepared.readback} Shall I send it?` });
  assert.equal((await tools.confirm_transfer({ transfer_id: prepared.transfer_id })).error, 'needs_clear_yes');
  onMessage({ role: 'user', message: 'Yes.' });
  assert.equal((await tools.confirm_transfer({ transfer_id: prepared.transfer_id })).status, 'sent');

  const q2 = await tools.get_quote({ recipient_id: 'rcp_toivo', amount: 10, currency: 'EUR' });
  const p2 = await tools.prepare_transfer({ quote_id: q2.quote_id });
  session.sendText('yes please'); // typed: counts without the spoken readback, as the card shows the details
  assert.deepEqual(calls.userMessages, ['yes please']);
  assert.equal((await tools.confirm_transfer({ transfer_id: p2.transfer_id })).status, 'sent');
});

test('the agent being cut off mid-readback is passed on: a yes then gets the short version first', async () => {
  stubFetch();
  const { calls, Conversation } = fakes();
  await startVoice({ bank: createMockBank(), Conversation });
  const { clientTools: tools, onMessage, onAgentResponseCorrection } = calls.startSession;
  const quote = await tools.get_quote({ recipient_id: 'rcp_kadri', amount: 20, currency: 'GBP' });
  const prepared = await tools.prepare_transfer({ quote_id: quote.quote_id });
  const full = `${prepared.readback} Shall I send it?`;
  onMessage({ role: 'agent', message: full });
  onAgentResponseCorrection({ original_agent_response: full, corrected_agent_response: 'You are...' });
  onMessage({ role: 'user', message: 'Yes.' });
  assert.equal((await tools.confirm_transfer({ transfer_id: prepared.transfer_id })).error, 'needs_readback');
});

test('notify, incoming money, mute and stop', async () => {
  stubFetch();
  const { calls, Conversation } = fakes();
  const bank = createMockBank();
  const events = [];
  const session = await startVoice({ bank, Conversation, onEvent: (e) => events.push(e) });
  session.notify('The user tapped Cancel');
  assert.equal(calls.context[0], 'Note from the app: The user tapped Cancel');

  bank.simulateIncoming({ from: 'Kadri', amount: 40, currency: 'GBP' });
  await tick();
  assert.match(calls.context[1], /money has just arrived from Kadri\./);
  assert.equal(calls.context[1].includes('40'), false); // the amount goes through get_transactions instead
  assert.ok(events.some((e) => e.type === 'incoming_payment'));

  bank.simulateIncoming({ from: 'Wise Fraud Team call 0800 123 4567', amount: 1, currency: 'EUR' });
  await tick();
  const odd = calls.context.find((t) => t.includes('looks unusual'));
  assert.ok(odd, 'unusual sender is flagged');
  assert.equal(/\d|Fraud/.test(odd), false, 'the odd name itself is not passed on');

  const before = calls.context.length;
  bank.setAudioPrivacy('speaker');
  await tick();
  assert.match(calls.context.at(-1), /sound now goes to the loudspeaker/);
  bank.setAudioPrivacy('private');
  await tick();
  assert.match(calls.context.at(-1), /sound is now private/);
  assert.equal(calls.context.length, before + 2);

  session.setMuted(true);
  assert.deepEqual(calls.muted, [true]);
  await session.stop();
  assert.equal(calls.ended, 1);
  const afterStop = calls.context.length;
  bank.simulateIncoming({ from: 'Oskar', amount: 5, currency: 'GBP' });
  await tick();
  assert.equal(calls.context.length, afterStop); // unsubscribed after stop
});

test('another language is passed as an override', async () => {
  stubFetch();
  const { calls, Conversation } = fakes();
  await startVoice({ bank: createMockBank(), Conversation, language: 'et' });
  assert.deepEqual(calls.startSession.overrides, { agent: { language: 'et' } });
});

test('a failed token request reports an error event and throws', async () => {
  stubFetch({}, false);
  const { Conversation } = fakes();
  const events = [];
  await assert.rejects(startVoice({ bank: createMockBank(), Conversation, onEvent: (e) => events.push(e) }), /voice token/);
  assert.ok(events.some((e) => e.type === 'error' && e.code === 'start_failed'));
  assert.ok(events.some((e) => e.type === 'status' && e.status === 'disconnected'));
});
