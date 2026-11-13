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
npm test                             # 50 offline tests (tools, browser module, server), no credits
npm run demo                         # test page at http://localhost:8787 (a voice session uses credits)
npm run live-check                   # ONE text-only conversation with the real agent (LLM tokens only)
npm run live-check -- --scenario scripts/scenarios/send-to-contact.json   # "Transfer 20 dollars to Martin"
npm run live-check -- --scenario scripts/scenarios/send-by-wisetag.json   # "Send 20 euros to Wisetag john j 1999"
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
  userName: 'Maria',
});
session.sendText('What is my balance?');    // typed fallback; counts as the user's own words
session.sendText('Yes, send it');           // the card's Send button: a typed yes counts even if the readback was cut short
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
| `confirm_blocked` | `transfer_id`, `reason`: not_heard, none, no, question, condition, hold, unclear | the agent tried to send without a yes after the readback; nothing moved |
| `awaiting_approval` | `transfer_id` | `confirmTransfer` called; Face ID is up |
| `transfer_result` | `transfer_id`, `outcome` (from `confirmTransfer`) | final status |
| `transfer_cancelled` | `transfer_id`, `reason`: user, changed, new_quote, replaced, expired | a waiting transfer was dropped (`changed`: the user asked for another amount, currency or person) |
| `incoming_payment` | `transaction` | from `bank.subscribe`; the agent is told who sent money |
| `error` | `code`: start_failed, microphone_blocked, agent_error; `message` | |

### Bank contract (owned by the app, `app/src/bank/`)

All methods are async and return plain JSON; errors reject with an `Error` whose `.code` is
`unknown_recipient`, `not_on_wise`, `unsupported_currency`, `insufficient_funds`, `quote_expired` or `not_found`.

- `getBalances()` -> `[{ currency: 'EUR'|'GBP', amount }]`
- `listRecipients(query?)` -> `[{ id, name, nickname?, currency, detail, verified }]`, saved people only
- `findContacts(query?)` -> `[{ id, name, onWise, phone? }]`: the phone's contacts, matching every word of the
  query against the name; empty query returns all. Optional: without it, voice pays saved people only.
  A contact with `onWise: true` can be paid by its `id` straight to their Wise account, in the currency
  the user names (`targetCurrency` = that currency); one without Wise rejects with `not_on_wise`.
- `findWiseUser(wisetag)` -> `{ id, name, wisetag } | null`: exact match only, ignoring an @, capitals, spaces and
  punctuation. Optional: without it, nobody is paid by Wisetag. Paid by its `id` like a contact on Wise; payments to
  them are listed under `name`, so "paid before" works.
- `listTransactions({ direction?, counterparty?, limit? })` -> `[{ id, direction, counterparty, amount, currency, date, status }]`
- `getQuote({ recipientId, amount, currency: 'EUR'|'GBP'|'USD', amountIs: 'target'|'source' })` -> `{ id, recipientId, recipientName, recipientKind?, recipientWisetag?, sourceAmount, sourceCurrency, targetAmount, targetCurrency, rate, fee, feeCurrency, arrival, expiresAt }`
- `prepareTransfer(quoteId)` -> `{ transferId, ...quote }` (nothing moves)
- `confirmTransfer(transferId)` -> `{ status: 'sent', transaction, balances }` or `{ status: 'declined'|'cancelled'|'failed', reason }`; resolves after Face ID; idempotent
- `cancelTransfer(transferId)` -> `{ status: 'cancelled' }`
- `getAudioPrivacy()` -> `'private'|'speaker'`
- `subscribe(listener)` -> unsubscribe; events `{ type: 'incoming_payment', transaction }`, `{ type: 'changed' }`

`web/mock-bank.js` implements the same contract with invented demo data.

## Safety, in code rather than only in the prompt

- **Money moves only after the user heard the details and said yes.** The readback counts as heard
  once the agent's own words named the person and the amounts, without the user cutting it off before
  them (ElevenLabs reports what was actually said when interrupted). Words said over the readback do not
  count. After that, the user's latest answer decides, judged by meaning, so filler is fine ("Yeah, I got
  that already", "Oh, no. I got the gist. Send the money now."); stray words like "Very, very much" count
  neither way. A question, condition or no ("Is that okay", "Do it tomorrow", "Wait") is not a yes: the
  agent answers and asks again, without reading everything again. If the readback was cut off before the
  amounts, the agent says a one-sentence version first. A typed yes (the card's Send button) counts once
  the transfer is prepared, because the card shows the details. The model cannot supply the yes itself,
  and Face ID in the app is still the final approval.
- **A waiting transfer is dropped** at once when the user asks for another amount, currency or person
  ("Make it 40", "Send it to Kadri instead"), and by any new quote, a new readback, or 5 minutes.
- **Sent once, and honest afterwards.** Repeat or parallel confirms never send twice. Cancelling a
  transfer that already went says so ("already sent"), never "nothing was sent". An unknown confirm
  error is reported as unknown, and the agent checks recent payments.
- **Saved recipients, or phone contacts who use Wise, up to 1,000 per transfer and 1,000 per call** in
  each currency (both what arrives and what the user pays). "Transfer 20 dollars to Martin" is enough;
  for a contact the readback says "is in your phone contacts, and you haven't paid them before" when
  that is true. A contact without Wise cannot be paid by voice. Names that sound alike ("Oscar" for
  Oskar) are offered as "Did you mean ...?", never paid directly.
- **Wisetags, for people who are neither saved nor in the contacts.** Exact tags only. The agent spells
  the tag back with the owner's name ("The Wisetag J, O, H, N, J, 1, 9, 9, 9 belongs to John Jensen. Is
  that the person you want to pay?"), and `get_quote` refuses until the user says yes. An owner name that
  looks like a message ("Wise Security Team") is not paid by voice. The readback says "found by their
  Wisetag, and you haven't paid them before", and a first payment to a Wisetag is capped at 300 by voice
  (`FIRST_WISETAG_LIMIT`), since paying a stranger is how most scams work.
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
