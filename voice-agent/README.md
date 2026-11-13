# Wise Voice: the voice agent

Voice-first Wise for people who cannot easily use the app's screens. The agent runs on
[ElevenLabs Agents](https://elevenlabs.io/docs/eleven-agents/quickstart). Its tools run in the
app's own page, against the app's bank object, so the agent never holds account data or the
power to move money by itself.

```
app (React, :5173)  --/voice-api-->  voice server (:8787)  --API key-->  ElevenLabs
       |                                  gives the page a short-lived token
       '-- startVoice({ bank }) -- WebRTC voice -->  ElevenLabs agent "Wise Voice (hackathon)"
              tool calls come back to the page and run against `bank`
```

## Run it

```bash
cd voice-agent
npm install
bash scripts/set-elevenlabs-key.sh   # once: saves ELEVENLABS_API_KEY to ../.env.local
npm run provision                    # creates or updates the agent and its tools (no credits)
npm test                             # 40 offline tests (tools, browser module, server), no credits
npm run demo                         # test page at http://localhost:8787 (a voice session uses credits)
npm run live-check                   # ONE text-only conversation with the real agent (LLM tokens only)
```

`npm run server` starts only the token server (the React app proxies `/voice-api` to it).
Settings in `../.env.local`: `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` (written by provision),
optional `ELEVENLABS_LLM` (default `claude-haiku-5-5`) and `ELEVENLABS_VOICE_ID`.

## Using it from the app

```js
const { startVoice } = await import('../../voice-agent/web/voice.js');
const session = await startVoice({
  bank,                          // the app's bank object (contract below)
  onEvent: (e) => { ... },       // events below
  tokenUrl: '/voice-api/token',  // default; proxy /voice-api/* to http://localhost:8787
  language: 'en',                // default; other languages only after they pass a test
  userName: 'Malle',
});
session.sendText('What is my balance?');    // typed fallback; counts as the user's own words
session.notify('The user tapped Cancel');   // context for the agent, not a user turn
session.setMuted(true);
await session.stop();
```

Call `startVoice` from a click or tap: the browser asks for the microphone then. Vite needs
`server.fs.allow` to include `../voice-agent` (not the whole repo root, which holds `.env.local`),
and a proxy for `/voice-api`. The bare import
`@elevenlabs/client` resolves from `voice-agent/node_modules` (run `npm install` here).

### Events (`onEvent`)

| type | fields | meaning |
|---|---|---|
| `status` | `status`: connecting, connected, disconnecting, disconnected; `conversationId`, `reason` | connection state |
| `mode` | `mode`: speaking, listening | who has the turn |
| `transcript` | `role`: user or agent, `text`, `final` (always true), `typed` | one finished line |
| `transcript_correction` | `role`, `text` | agent line cut short by an interruption |
| `tool` | `name`, `phase`: start or end, `ok`, `error` | a tool call (for "checking your balance...") |
| `pending_transfer` | `transfer` (from `prepareTransfer`) | readback is being spoken |
| `confirm_blocked` | `transfer_id` | the agent tried to send without a clear yes; nothing moved |
| `awaiting_approval` | `transfer_id` | `confirmTransfer` called; Face ID is up |
| `transfer_result` | `transfer_id`, `outcome` (from `confirmTransfer`) | final status |
| `transfer_cancelled` | `transfer_id`, `reason`: user, new_quote, replaced, expired | a waiting transfer was dropped |
| `incoming_payment` | `transaction` | from `bank.subscribe`; the agent is told who sent money |
| `error` | `code`: start_failed, microphone_blocked, agent_error; `message` | |

### Bank contract (owned by the app, `app/src/bank/`)

All methods are async and return plain JSON; errors reject with an `Error` whose `.code` is
`unknown_recipient`, `insufficient_funds`, `quote_expired` or `not_found`.

- `getBalances()` -> `[{ currency: 'EUR'|'GBP', amount }]`
- `listRecipients(query?)` -> `[{ id, name, nickname?, currency, detail, verified }]`, saved people only
- `listTransactions({ direction?, counterparty?, limit? })` -> `[{ id, direction, counterparty, amount, currency, date, status }]`
- `getQuote({ recipientId, amount, currency, amountIs: 'target'|'source' })` -> `{ id, recipientId, recipientName, sourceAmount, sourceCurrency, targetAmount, targetCurrency, rate, fee, feeCurrency, arrival, expiresAt }`
- `prepareTransfer(quoteId)` -> `{ transferId, ...quote }` (nothing moves)
- `confirmTransfer(transferId)` -> `{ status: 'sent', transaction, balances }` or `{ status: 'declined'|'cancelled'|'failed', reason }`; resolves after Face ID; idempotent
- `cancelTransfer(transferId)` -> `{ status: 'cancelled' }`
- `getAudioPrivacy()` -> `'private'|'speaker'`
- `subscribe(listener)` -> unsubscribe; events `{ type: 'incoming_payment', transaction }`, `{ type: 'changed' }`

`web/mock-bank.js` implements the same contract with invented demo data.

## Safety, in code rather than only in the prompt

- **Money moves only after the user's own plain yes.** `confirm_transfer` runs only if everything the
  user said or typed since the readback is a plain yes ("Yes", "OK, send it", "Of course", "Go ahead").
  A change, condition, number, delay or question ("Yes, make it 40", "Do it tomorrow", "Is that okay")
  is not a yes: the agent reads the details back again and asks once more. The model cannot supply
  the yes itself. The app's Send button types "Yes, send it", which counts the same way.
- **A waiting transfer is disarmed** by any new quote, a new readback, any non-yes answer, or 5 minutes.
- **Sent once, and honest afterwards.** Repeat or parallel confirms never send twice. Cancelling a
  transfer that already went says so ("already sent"), never "nothing was sent". An unknown confirm
  error is reported as unknown, and the agent checks recent payments.
- **Saved recipients only, up to 1,000 per transfer and 1,000 per call** in each currency (both what
  arrives and what the user pays). Names that sound alike ("Oscar" for Oskar) are offered as
  "Did you mean ...?", never paid directly.
- **Loudspeaker privacy.** While `getAudioPrivacy()` is `speaker`, balances, payments, quotes and the
  readback are withheld from the agent until the user agrees out loud. Agreement lasts 3 minutes and
  resets when the sound output changes (send a `changed` event when the toggle moves).
- **Untrusted text stays data.** Bank names reach the agent as letters only, account details as
  "ending 4417", and incoming-money notes carry no amount. Sender names that look like messages
  (digits, links, "call", "fraud", ...) are flagged and not read out.
- **The key stays on the server.** The agent requires a token (`enable_auth`). The server listens on
  127.0.0.1, answers only local host names (set `VOICE_ALLOWED_HOSTS` for others), survives malformed
  requests, and mints at most 20 tokens a minute. Voice recording is off; transcripts are kept 30 days.
- The prompt adds scam warnings (no "safe account" moves, no codes) and never asks for PINs or passwords.

## Cost notes

Voice sessions are billed per minute by ElevenLabs, plus the LLM's tokens. `npm run live-check`
uses text-only mode, which the API describes as avoiding audio pricing; it prints the credits
used. Calls are capped at 8 minutes (`max_duration_seconds`).
