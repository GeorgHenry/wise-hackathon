// The agent's client tools, in one list used by provisioning (scripts/provision.mjs),
// the browser runtime (web/tools-runtime.js) and the tests.
//
// Client tools run in the user's own page, against the app's bank object. The
// ElevenLabs agent only asks for them; it never holds account data or the power
// to move money. The safety checks live in web/tools-runtime.js.

const text = (description, extra = {}) => ({ type: 'string', description, ...extra });
const READ_ALOUD_OK = {
  type: 'boolean',
  description:
    'Set to true only when the user has just agreed to hear amounts out loud on the loudspeaker.',
};

export const CLIENT_TOOLS = [
  {
    name: 'get_balances',
    description:
      "Get the user's Wise balances. Use it whenever the user asks how much money they have. " +
      'If the result has amounts_hidden, do not guess any amount: ask whether to read the amounts out on the loudspeaker.',
    parameters: { type: 'object', properties: { read_aloud_ok: READ_ALOUD_OK }, required: [] },
  },
  {
    name: 'get_transactions',
    description:
      'Get recent payments in or out, newest first. Use it for questions like "did my pension arrive?", ' +
      '"who sent me money?" or "what did I send to Kadri?".',
    parameters: {
      type: 'object',
      properties: {
        direction: text('"in" for money received, "out" for money sent. Leave it out for both.', {
          enum: ['in', 'out'],
        }),
        counterparty: text('Name of the other person, when the user asked about one person.'),
        limit: { type: 'number', description: 'How many payments to return, from 1 to 5. Default 3.' },
        read_aloud_ok: READ_ALOUD_OK,
      },
      required: [],
    },
  },
  {
    name: 'find_recipient',
    description:
      'Find who the money is for, by name or nickname (for example "Martin", "Kadri" or "my daughter"). ' +
      'It looks in the people saved in Wise and in the phone\'s contacts who use Wise. ' +
      'Call it (or find_wise_user, for a Wisetag) before get_quote.',
    parameters: {
      type: 'object',
      properties: { name: text('The name or nickname the user said.') },
      required: ['name'],
    },
  },
  {
    name: 'find_wise_user',
    description:
      'Find someone on Wise by their Wisetag, when the user gives one (they may say "Wisetag", "Wise tag", "Wise ID", ' +
      'or "at" followed by letters and numbers). It returns the owner\'s name. Then ask the question in its say, which ' +
      'spells the tag and names the owner, and call get_quote only after the user says it is the right person.',
    parameters: {
      type: 'object',
      properties: {
        wisetag: text(
          'The Wisetag as letters and digits only: no spaces, no @, and spoken numbers written as digits. ' +
            'For example "john j nineteen ninety-nine" is johnj1999.',
        ),
      },
      required: ['wisetag'],
    },
  },
  {
    name: 'get_quote',
    description:
      'Get the price of sending money to the person found: what they receive, the fee, what the user pays and when it arrives. Nothing is sent.',
    parameters: {
      type: 'object',
      properties: {
        recipient_id: text('The recipient_id from find_recipient or find_wise_user.'),
        amount: { type: 'number', description: 'The amount the user said, as a number, for example 50 or 12.5.' },
        currency: text('Currency of that amount: EUR for euros, GBP for pounds, USD for dollars.', {
          enum: ['EUR', 'GBP', 'USD'],
        }),
        read_aloud_ok: READ_ALOUD_OK,
      },
      required: ['recipient_id', 'amount', 'currency'],
    },
  },
  {
    name: 'prepare_transfer',
    description:
      'Prepare a transfer from a quote so the user can check it. Nothing is sent yet. ' +
      'Afterwards read the returned readback to the user word for word and ask "Shall I send it?". ' +
      'Call it again (same quote_id) whenever the details must be read back again.',
    parameters: {
      type: 'object',
      properties: { quote_id: text('The quote_id from get_quote.'), read_aloud_ok: READ_ALOUD_OK },
      required: ['quote_id'],
    },
  },
  {
    name: 'confirm_transfer',
    description:
      'Send a prepared transfer. Call it when the user has answered the readback with a yes, in any words ' +
      '("yes", "yeah, I got it, send it", "go ahead"). Just before calling it, say: "Please approve it on your phone now." ' +
      'The user then approves on their phone, which can take up to a minute. Returns the real final status; after that, ' +
      'only report the result. If it answers needs_readback or needs_clear_yes, do what its say tells you.',
    parameters: {
      type: 'object',
      properties: { transfer_id: text('The transfer_id from prepare_transfer.') },
      required: ['transfer_id'],
    },
    response_timeout_secs: 90,
  },
  {
    name: 'cancel_transfer',
    description: 'Cancel a prepared transfer the user does not want to send. Nothing is sent.',
    parameters: {
      type: 'object',
      properties: { transfer_id: text('The transfer_id from prepare_transfer.') },
      required: ['transfer_id'],
    },
  },
];

export const TOOL_NAMES = CLIENT_TOOLS.map((tool) => tool.name);

/** The body ElevenLabs expects in POST /v1/convai/tools and PATCH /v1/convai/tools/{id}. */
export function toToolConfig(tool) {
  return {
    type: 'client',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    expects_response: true,
    response_timeout_secs: tool.response_timeout_secs ?? 20,
    ...(tool.pre_tool_speech ? { pre_tool_speech: tool.pre_tool_speech } : {}),
  };
}
