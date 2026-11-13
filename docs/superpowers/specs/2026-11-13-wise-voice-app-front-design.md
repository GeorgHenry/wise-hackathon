# Wise Voice app front: design

Date: 2026-11-13. Status: approved by the user in chat ("Yes, build it").

## Goal

A phone-sized web app that looks like the Wise app and shows how a person who
cannot read a screen banks by talking: unlock with Face ID, hear the balance,
send money to a saved person, and hear that money arrived.

It is a hackathon prototype. All names, balances, rates and fees are invented.
The voice agent itself is built separately in `voice-agent/` (ElevenLabs); this
document covers everything outside that folder.

## Sources

- **Workflow:** the Figma file "carrot–plan"
  (https://www.figma.com/design/4YopYOHldPIj9pfU1lvcIR/), read on 2026-11-13.
- **Look:** 20 screenshots of the Wise iOS app supplied by the user guide the
  layout; no real name, balance or account number from them is used. Colours,
  radii, shadows and type sizes are Wise's own design tokens (the "Neptune"
  personal theme), read from wise.com's stylesheets on 2026-11-13 (see
  "Visual design").
- **Voice agent interface:** `voice-agent/web/voice.js`,
  `voice-agent/web/tools-runtime.js` and `voice-agent/web/mock-bank.js`, read
  on 2026-11-13.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Platform | Web app, React + Vite + TypeScript, in `app/` | The voice agent is a browser module; a native build would take much longer |
| Language | English first | User's choice; Estonian only if it later passes a test |
| Way in | Voice starts by itself after unlock, and a mic button sits on every screen | The persona cannot read a home screen; sighted viewers need one obvious button |
| "Receive" | Hearing that money arrived and from whom | Not payment requests |
| Recipients | Voice pays saved people only | Never dictate account numbers by voice |
| Face ID | An on-screen animation, with a demo switch to make it fail | A browser cannot call the real Face ID without extra setup |
| Persona | Malle, with invented people Kadri, Oskar and Toivo | Proposed earlier; the user has not confirmed her, so it lives in one file (`seed.ts`) |

Out of scope: real Wise APIs or accounts, real biometrics, a native app,
Estonian, adding recipients by voice, payment requests, deployment.

## How the screens follow carrot–plan

| carrot–plan step | Screen or part |
|---|---|
| (not in the flow) first run | Onboarding: what Wise Voice does, Face ID set-up, microphone |
| Open Wise Voice | Home with the mic button; voice also starts by itself after unlock |
| Authenticated? / Complete Wise-approved sign-in | Lock screen with Face ID |
| Voice session starts / What does user want? | Voice sheet: status indicator and captions |
| Retrieve account balance / Private audio available? | Balance card, or "private audio needed" card |
| Recipient saved? / Select verified recipient | Agent looks up saved recipients; unknown names are refused |
| Get amount, currency and fee quote / Read back / Any changes? | Confirm card: who, how much, fee, total, arrival |
| Proceed to authorization? | Spoken yes, or the Send button on the card; Cancel returns to listening |
| Wise-approved secure authentication / Authorization valid? | Face ID sheet; a failed scan means no transfer |
| Submit payment once / Verify actual payment status / Speak verified result | Receipt card; the payment appears on Home |
| (not in the flow) money arrived | "Money arrived" card and a spoken note |

## Structure

```
app/
  src/
    bank/       the demo account: types (the contract), money maths, seed data, store
    voice/      voice events, session reducer, scripted agent, live-agent loader, React hook
    auth/       Face ID animation and the approve/decline step
    screens/    Onboarding, Lock, Home, Recipients, Cards, Payments, VoiceSheet
    components/ PhoneFrame, TabBar, flags, rows, cards
    demo/       DemoControls (outside the phone frame)
    styles/     design tokens and base styles
```

Each unit has one job:

- **bank/** is the single source of truth. Screens read it; the agent calls it.
  It knows nothing about React or voice.
- **voice/** turns agent events into view state. It knows the bank only through
  the contract.
- **auth/** shows Face ID and answers one question: approved or not.
- **screens/** render state. They hold no money logic.

## Bank contract

The object handed to the voice agent. Every method is async and returns plain
JSON. Failures reject with an `Error` whose `code` is `unknown_recipient`,
`insufficient_funds`, `quote_expired` or `not_found`.

```
getBalances()                -> [{ currency: 'EUR'|'GBP', amount }]
listRecipients(query?)       -> [{ id, name, nickname?, currency, detail, verified }]
findContacts(query?)         -> [{ id, name, onWise, phone? }]   phone contacts, also those not on Wise
listTransactions({ direction?, counterparty?, limit? })
                             -> [{ id, direction: 'in'|'out', counterparty, amount, currency, date, status }]
getQuote({ recipientId, amount, currency, amountIs: 'target'|'source' })
                             -> { id, recipientId, recipientName, sourceAmount, sourceCurrency,
                                  targetAmount, targetCurrency, rate, fee, feeCurrency, arrival, expiresAt }
prepareTransfer(quoteId)     -> { transferId, ...quote, status: 'prepared' }   nothing moves
confirmTransfer(transferId)  -> { status: 'sent', transaction, balances }
                              | { status: 'declined'|'cancelled'|'failed', reason }
cancelTransfer(transferId)   -> { status }   how it really ended: 'cancelled', or 'sent' if too late
getAudioPrivacy()            -> 'private' | 'speaker'
subscribe(listener)          -> unsubscribe; events { type: 'incoming_payment', transaction } and { type: 'changed' }
```

Amounts are numbers in major units with two decimals; `date` is a local
calendar date, `YYYY-MM-DD`.

### Money rules

1. Amounts are held as whole cents inside the store, so sums never drift.
2. Which balance pays: the currency the user named, when it differs from the
   recipient's; otherwise the balance in the recipient's own currency when it
   covers the amount; otherwise euros.
3. Same-currency transfers have rate 1 and no fee. Conversions use one invented
   rate and one invented fee formula, defined in `seed.ts`.
4. `prepareTransfer` checks the quote exists, has not expired, and is covered
   by the balance. It moves nothing.
5. `confirmTransfer` moves money only after the Face ID step answers yes, and
   only once: a repeat call returns the first result, and a call made while
   Face ID is showing returns the same pending promise. A transfer whose price
   has expired fails, before Face ID is asked for and again when it answers.
6. `cancelTransfer` always wins over a transfer that has not finished:
   cancelling while Face ID is showing closes the sheet and nothing moves. Its
   answer is how the transfer really ended, so a cancel that arrives after the
   money has gone answers `sent`, not `cancelled`.
7. Only one transfer waits at a time: preparing a new one cancels the one
   before it. Because nothing else lowers a balance, a transfer that passed
   the check in rule 4 cannot overdraw at confirm time.

## Voice session

`startVoice({ bank, onEvent, tokenUrl, language, userName })` returns a session
with `sendText(text)`, `notify(text)`, `setMuted(bool)` and `stop()`.

There are two implementations with the same events:

- **Live:** `voice-agent/web/voice.js`, loaded only if the file exists. Needs
  the voice server on port 8787 (proxied by Vite as `/voice-api`) and a
  microphone.
- **Scripted:** a small rule-based agent in `app/src/voice/scriptedAgent.ts`.
  No microphone, no network and no voice: the presenter taps a suggested phrase or types.
  It follows the same carrot–plan steps and calls the same bank methods. It is
  how the UI is built and tested, and the fallback on stage.

Events the UI understands:

| Event | Effect |
|---|---|
| `status` connecting / connected / disconnected | Indicator; a lost connection closes the session with a message |
| `mode` speaking / listening | Indicator animation |
| `transcript` (role, text) | Captions; the last agent line is large |
| `tool` start / end | "Working" state between a question and its answer |
| `error` (code, message) | Plain message; `microphone_blocked` and `start_failed` offer the scripted agent |
| `incoming_payment` | "Money arrived" card |

Wise Voice is the live agent whenever the voice server reports a key and an
agent; otherwise the scripted one stands in. The voice sheet has no mode
buttons: with the live agent you talk (typing is one tap away), and with the
scripted one you tap a phrase or type. The presenter can force either under
"Voice agent" in the demo controls or with `?agent=scripted` in the address,
which rehearsals and tests use because a live session bills ElevenLabs credits
for as long as it is open. (Changed on 2026-11-13 at the user's request: the
scripted agent used to be the default and spoke with the browser's own voice.)

Voice can also pay a phone contact who uses Wise (`findContacts`). The contact
receives the currency the user names, including US dollars, which are sent but
not held. A contact who is not on Wise is refused.

Cards on the voice sheet (balance, confirm, Face ID, receipt) are drawn from
the bank store, not from agent events, so they are right in both modes and
when the user taps instead of speaking.

### Privacy rule

When audio is on the loudspeaker, amounts are not read aloud and the sheet
shows a "private audio needed" card instead of the balance. A browser cannot
reliably tell whether headphones are in, so a demo switch sets
`private` or `speaker`.

## Errors

| Situation | What the user gets |
|---|---|
| Microphone refused | Message, and a button to continue with the scripted agent |
| Voice server not running | The same message and button |
| Unknown recipient | Agent says who is saved; nothing is prepared |
| Not enough money | Agent says so; nothing is prepared |
| Face ID fails | "Not sent" card; the balance is unchanged |
| Session drops mid-transfer | The prepared transfer is cancelled; nothing moves |

## Visual design

Changed on 2026-11-13 at the user's request ("match wise's own vibe at
wise.com"): the dark theme picked by eye gave way to Wise's own tokens, kept in
`app/src/styles/tokens.css`.

| Part | Choice |
|---|---|
| Colour | Bright Green `#9FE870` and Forest Green `#163300`; content `#0E0F0C` / `#454745` / `#6A6C6A`; neutral tint `rgba(22,51,0,0.08)` |
| Surfaces | Light (Home, tabs, cards), bright green (onboarding welcome, success cards, the desktop stage) and forest (lock screen, voice sheet) |
| Type | Inter for text, as Wise uses. Wise Sans is proprietary, so Schibsted Grotesk Black (open licence, `@fontsource-variable/schibsted-grotesk`) stands in for headlines and big amounts, in capitals |
| Shapes | Pill buttons; radii 10 / 16 / 24 / 32 px; Wise's raised-card shadow |
| Voice cards | Drawn like Wise's send-money calculator: currency pills, heavy figures in forest |
| Motion | The total counts to its new value after a payment, with a green marker when money comes in; captions appear word by word; all of it off under reduced motion |

No Wise logo or illustration is copied; the welcome picture (a microphone with
currencies circling it) is drawn for this prototype.

## Accessibility

The product is for people with sight loss, so the prototype should not be
hostile to them:

- Real buttons with names; the voice sheet is a dialog with focus moved into it
  and returned on close.
- Captions sit in a polite live region, switched off while the reply is also spoken, so a screen reader does not talk over the agent.
- Touch targets are at least 48 px; the mic button is 64 px.
- Text contrast meets WCAG AA on all three surfaces (checked by calculation for
  the main colour pairs, not with a tool).
- Motion is reduced when the system asks for it.

## Safety

- A visible "Prototype" label; the page is marked `noindex`.
- No password, card or account-number fields anywhere.
- Invented data only.

## Testing

- Unit tests (Vitest): money maths, the bank store (every money rule above),
  the voice session reducer, and the scripted agent's conversations.
- Type check and production build.
- A browser walk in scripted mode at phone width and on desktop: onboarding,
  unlock, balance (private and speaker), send with approval, send with failed
  Face ID, cancel, money arrived.

## Working in the shared checkout

Another session builds `voice-agent/` in the same folder and git index.

- This work writes only under `app/`, `docs/` and `.claude/launch.json`.
- It never edits `voice-agent/`, `.env*` or the root `.gitignore`.
- Nothing is committed unless the user asks; a commit would go through a
  private index with explicit paths.
