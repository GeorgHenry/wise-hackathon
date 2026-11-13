// Builds the ElevenLabs agent definition sent by scripts/provision.mjs
// (POST /v1/convai/agents/create, or PATCH /v1/convai/agents/{agent_id}).

export const AGENT_NAME = 'Wise Voice (hackathon)';
export const DEFAULT_LLM = 'claude-haiku-5-5';
export const FIRST_MESSAGE =
  "Hello {{user_name}}, it's Wise Voice. You can ask me about your balance, recent payments, or sending money. What would you like to do?";

/**
 * @param {object} options
 * @param {string} options.prompt  System prompt (agent/prompt.md).
 * @param {string[]} options.toolIds  ElevenLabs ids of the client tools.
 * @param {string} [options.llm]
 * @param {string} [options.voiceId]  Leave out to keep the ElevenLabs default voice.
 */
export function buildAgentBody({ prompt, toolIds, llm = DEFAULT_LLM, voiceId }) {
  return {
    name: AGENT_NAME,
    tags: ['wise-hackathon'],
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: 'en',
        dynamic_variables: { dynamic_variable_placeholders: { user_name: 'there' } },
        prompt: {
          prompt,
          llm,
          temperature: 0,
          tool_ids: toolIds,
          // One tool call at a time keeps "prepare, read back, hear yes, confirm" in order.
          enable_parallel_tool_calls: false,
          built_in_tools: {
            end_call: { name: 'end_call', description: '', params: { system_tool_type: 'end_call' } },
          },
        },
      },
      tts: {
        model_id: 'eleven_v4_turbo', // also speaks Estonian, for the later language test
        ...(voiceId ? { voice_id: voiceId } : {}),
        speed: 0.92, // a little slower than default, for older listeners
        stability: 0.6,
      },
      // Older users pause mid-sentence; a patient turn-taker interrupts them less.
      turn: { turn_eagerness: 'patient', turn_timeout: 10 },
      conversation: { max_duration_seconds: 480 },
    },
    platform_settings: {
      // Only holders of a short-lived token from our server can start a conversation.
      auth: { enable_auth: true },
      overrides: {
        conversation_config_override: {
          agent: { language: true, first_message: true },
          conversation: { text_only: true }, // lets scripts/live-check.mjs test without audio pricing
        },
      },
      privacy: { record_voice: false, retention_days: 30 },
    },
  };
}
