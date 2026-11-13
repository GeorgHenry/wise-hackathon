# Wise Voice App Front Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-sized web app that looks like the Wise app and shows voice banking: Face ID unlock, spoken balance, sending money to a saved person, and hearing that money arrived.

**Architecture:** A React single-page app in `app/`. One in-memory bank store is the source of truth: screens read it, and the voice agent calls it through a fixed contract. The voice sheet runs either the live ElevenLabs agent from `voice-agent/` or a built-in scripted agent that emits the same events.

**Tech Stack:** Vite 8, React 19, TypeScript 7, Vitest 5, lucide-react, Inter (bundled). No backend of its own.

**Spec:** `docs/superpowers/specs/2026-11-13-wise-voice-app-front-design.md`

**How this plan is used:** The user approved the design and said "Yes, build it", so it is executed inline in the same session that wrote it. For that reason tasks name files, exact interfaces, test cases and checks, but do not repeat the implementation line by line. There are no commit steps: the checkout and git index are shared with another session, and nothing is committed unless the user asks.

## Global Constraints

- Write only under `app/`, `docs/` and `.claude/launch.json`. Never edit `voice-agent/`, `.env*` or the root `.gitignore`.
- Dev server: `http://localhost:5173`, `strictPort`. `/voice-api/*` is proxied to `http://localhost:8787`.
- All names, balances, rates and fees are invented. Nothing from the user's screenshots (names, balances, account numbers) appears in code or data.
- No password, card-number or account-number input fields.
- A visible "Prototype" label; `<meta name="robots" content="noindex">`.
- Money is held in whole cents inside the store. Contract amounts are numbers with two decimals. Contract dates are local `YYYY-MM-DD`.
- English UI and speech. Sentence case in the UI.
- Touch targets at least 48 px; the mic button 64 px. Respect `prefers-reduced-motion`.
- The bank contract in the spec is fixed: `voice-agent/web/tools-runtime.js` already calls it.

## File Map

```
app/package.json, tsconfig.json, vite.config.ts, index.html, .gitignore
app/src/main.tsx                 mounts <App/>
app/src/App.tsx                  stages (onboarding, locked, home), tabs, voice sheet, Face ID approval, toasts
app/src/styles/tokens.css        colours, type, spacing
app/src/styles/base.css          reset, phone frame, shared controls
app/src/bank/types.ts            the contract and data types
app/src/bank/money.ts            cents maths, formatting, spoken money and dates
app/src/bank/seed.ts             Malle's invented account, rate and fee
app/src/bank/store.ts            createBankStore(): the contract plus UI-facing snapshot
app/src/bank/useBank.ts          React binding
app/src/voice/types.ts           VoiceEvent, VoiceSession, StartVoice
app/src/voice/sessionReducer.ts  events -> view state
app/src/voice/intent.ts          typed text -> intent (scripted agent only)
app/src/voice/scriptedAgent.ts   rule-based agent with the live agent's events
app/src/voice/liveAgent.ts       loads voice-agent/web/voice.js when present
app/src/voice/useVoice.ts        React hook: start, stop, sendText
app/src/auth/FaceId.tsx          Face ID glyph and scan animation
app/src/screens/*.tsx            Onboarding, Lock, Home, Recipients, Cards, Payments, VoiceSheet
app/src/components/*.tsx         PhoneFrame, TabBar, Flag, Avatar, TransactionRow, VoiceOrb, TransferCard
app/src/demo/DemoControls.tsx    presenter's switches, outside the phone
```

Tests sit next to the code as `*.test.ts`.

---

### Task 1: Scaffold and phone frame

**Files:** Create `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/.gitignore`, `app/src/main.tsx`, `app/src/App.tsx`, `app/src/styles/tokens.css`, `app/src/styles/base.css`, `app/src/components/PhoneFrame.tsx`, `.claude/launch.json`.

**Produces:** scripts `dev`, `build`, `test`, `typecheck`; `<PhoneFrame>{children}</PhoneFrame>`.

- [x] Write the config files and an `App` that renders an empty phone frame.
- [x] `npm install` in `app/`.
- [x] Check: `npm run typecheck` and `npm run build` exit 0; the dev server shows a phone frame on desktop and a full-screen app at 390 px.

### Task 2: Money helpers

**Files:** Create `app/src/bank/types.ts`, `app/src/bank/money.ts`; Test `app/src/bank/money.test.ts`.

**Produces:**
`toCents(amount: number): number`, `fromCents(cents: number): number`,
`formatMoney(amount: number, currency: Currency): string` ("1,840.25 EUR"),
`formatSymbol(amount: number, currency: Currency): string` ("€1,840.25"),
`speakMoney(amount: number, currency: Currency): string`,
`localDate(d: Date): string`, `speakDate(date: string, now: Date): string`, `rowDate(date: string): string` ("Mon, Nov 9").

- [x] Write failing tests: `toCents(0.1 + 0.2) === 30`; `fromCents(184025) === 1840.25`; `formatMoney(1840.25,'EUR') === '1,840.25 EUR'`; `formatSymbol(312.6,'GBP') === '£312.60'`; `speakMoney(58.1,'EUR') === '58 euros and 10 cents'`; `speakMoney(1,'GBP') === '1 pound'`; `speakMoney(0.01,'EUR') === '1 cent'`; `speakMoney(50,'GBP') === '50 pounds'`; `speakDate` gives "today", "yesterday" and "12 November"; `localDate` uses the local calendar day.
- [x] Run `npm test`, see them fail, implement, see them pass.

### Task 3: Bank store

**Files:** Create `app/src/bank/seed.ts`, `app/src/bank/store.ts`, `app/src/bank/useBank.ts`; Test `app/src/bank/store.test.ts`.

**Consumes:** Task 2 helpers and types.

**Produces:** `createBankStore(options?: { now?: () => Date; approver?: Approver }): BankStore`, where `BankStore` is the spec's `Bank` contract plus `getSnapshot(): BankSnapshot`, `onChange(listener): () => void`, `setApprover(approver)`, `setAudioPrivacy(value)`, `simulateIncoming(input?)`, `dismissIncoming()`, `reset()`. `BankSnapshot = { balances, recipients, transactions, audioPrivacy, transfer: TransferView | null, lastIncoming, activity }`; `TransferView = { transfer, phase: 'prepared'|'approving'|'sent'|'declined'|'cancelled'|'failed', reason?, transaction?, at }`. `useBank(store): BankSnapshot`.

- [x] Write failing tests, one per money rule in the spec:
  - balances and recipients come from the seed; `listRecipients('daughter')` finds Kadri; `listRecipients('nobody')` is empty.
  - `listTransactions({ direction: 'in', limit: 1 })` returns the newest incoming payment only.
  - quote in the recipient's currency: target is exact, source is euros, `fee > 0`, `sourceAmount === round(target / rate + fee)`.
  - quote to a euro recipient in euros: rate 1, fee 0, source equals target.
  - quote for an unknown recipient rejects with code `unknown_recipient`.
  - `prepareTransfer` moves nothing; an unknown quote rejects `not_found`; an expired quote rejects `quote_expired`; an uncovered amount rejects `insufficient_funds`.
  - confirm with an approving approver: the euro balance drops by exactly `sourceAmount`, an outgoing transaction is first in the list, the result is `sent`.
  - confirm twice: the second result equals the first and the balance dropped once.
  - two confirms while approval is pending share one result and call the approver once.
  - a declining approver: result `declined`, balance unchanged.
  - cancel while approval is pending: result `cancelled`, balance unchanged even if the approver later says yes.
  - `simulateIncoming` raises the balance, puts an incoming transaction first and emits `incoming_payment` then `changed`.
  - `getSnapshot()` returns the same object until something changes.
  - the async read methods record `activity`; `reset()` restores the seed.
- [x] Implement until `npm test` passes.

### Task 4: Home, tab bar and static tabs

**Files:** Create `app/src/screens/Home.tsx`, `Recipients.tsx`, `Cards.tsx`, `Payments.tsx`, `app/src/components/TabBar.tsx`, `Flag.tsx`, `Avatar.tsx`, `TransactionRow.tsx`, plus their CSS; Modify `app/src/App.tsx`.

**Consumes:** `useBank`, `formatMoney`, `formatSymbol`, `rowDate`.

**Produces:** `<TabBar tab onTab onMic />` with tabs `'home'|'cards'|'recipients'|'payments'`.

- [x] Build Home from the store: total balance, action pills, account card with one row per currency, transactions list.
- [x] Build the tab bar with the 64 px mic button in the centre.
- [x] Build Recipients (live search over saved recipients), Cards and Payments (static).
- [x] Check in the browser at 390 px: no horizontal scroll, the list scrolls under the tab bar, every button has a name.

### Task 5: Face ID, lock and onboarding

**Files:** Create `app/src/auth/FaceId.tsx`, `app/src/screens/Lock.tsx`, `app/src/screens/Onboarding.tsx`, CSS; Modify `app/src/App.tsx`.

**Produces:** `<FaceId state="idle"|"scanning"|"success"|"fail" />`; `runFaceId(outcome: boolean, onState): Promise<boolean>` (scan 1.5 s, result 0.7 s); app stages `'onboarding'|'locked'|'home'`; `localStorage['wv.onboarded']`.

- [x] Onboarding in four steps: welcome, what Wise Voice does, Face ID set-up, microphone.
- [x] Lock screen: one button, "Unlock with Face ID".
- [x] Wire the store's approver to a Face ID sheet that shows the transfer being approved.
- [x] Check: first load shows onboarding; a reload shows the lock screen; unlocking reaches Home.

### Task 6: Voice session logic

**Files:** Create `app/src/voice/types.ts`, `sessionReducer.ts`, `intent.ts`, `scriptedAgent.ts`, `liveAgent.ts`, `useVoice.ts`; Tests `sessionReducer.test.ts`, `intent.test.ts`, `scriptedAgent.test.ts`.

**Consumes:** the `Bank` contract, `speakMoney`, `speakDate`.

**Produces:**
`reduceSession(view: SessionView, event: SessionEvent): SessionView` with `SessionView = { phase: 'idle'|'connecting'|'listening'|'working'|'speaking'|'ended', lines: Line[], error, toolsRunning, connected }`;
`parseIntent(text: string): Intent`;
`startScriptedVoice(options: StartVoiceOptions & { speak?: (text: string) => Promise<void> }): Promise<VoiceSession>`;
`liveAgentAvailable: boolean`, `startLiveVoice: StartVoice`;
`useVoice(store, settings)` returning `{ view, active, start, stop, sendText, notify }`.

- [x] Reducer tests: connecting then connected gives `listening`; a `tool` start gives `working` and the matching end returns to the mode; `mode: speaking` gives `speaking`; transcripts append; a correction replaces the last agent line; an `error` is kept; `disconnected` gives `ended`.
- [x] Intent tests: "What's my balance?" is `balance`; "Send Oskar 30 pounds" is `send` with amount 30 and GBP; "send 12.50 euros to Toivo" has amount 12.5 and EUR; "Did Kadri's money arrive?" is `incoming`; "yes, send it" is `yes`; "no, cancel" is `no`; "make it 40" is `amount` 40; "yes but change it" is not `yes`.
- [x] Scripted agent tests against a real store with an instant `speak`:
  - it greets, then listens.
  - balance with private audio speaks both balances; with the loudspeaker it speaks no digits.
  - "Send Oskar 30 pounds" prepares a transfer and reads it back; "yes" sends it and the store's euro balance drops.
  - "make it 40 pounds" after a readback cancels the first transfer and prepares a new one for 40.
  - "no" cancels and nothing moves.
  - a declined Face ID says nothing was sent.
  - an unknown name prepares nothing and lists the saved people.
  - an incoming payment during the session is announced.
- [x] Implement until `npm test` passes.

### Task 7: Voice sheet

**Files:** Create `app/src/screens/VoiceSheet.tsx`, `app/src/components/VoiceOrb.tsx`, `TransferCard.tsx`, CSS; Modify `app/src/App.tsx`.

**Consumes:** `useVoice`, `useBank`, `FaceId`.

- [x] Sheet as a dialog: indicator, captions in a live region, one card (balance, private audio needed, incoming, transfer in each phase), suggestion chips, a text field, End.
- [x] Voice-first: the sheet opens and starts after unlock; the mic button opens it from any tab.
- [x] Ending the session cancels a transfer that is still waiting.
- [x] Check in the browser, scripted mode: balance, send with approval, failed Face ID, cancel, money arrived.

### Task 8: Demo controls

**Files:** Create `app/src/demo/DemoControls.tsx`, CSS; Modify `app/src/App.tsx`.

- [x] Switches: audio private or loudspeaker; Face ID succeeds or fails; agent live or scripted (live only when available); speak replies. Buttons: money arrives from Kadri, lock, replay onboarding, reset.
- [x] The panel sits beside the phone on desktop and behind a "Demo" button on a phone.

### Task 9: Live agent

**Files:** Modify `app/src/voice/liveAgent.ts`, `app/vite.config.ts` only if needed.

- [x] With `voice-agent/web/voice.js` present, `npm run build` still passes and the demo controls show the live agent's state from `/voice-api/health`.
- [x] A failed live start (no server, no microphone) shows a message and a button that switches to the scripted agent.
- [ ] A real spoken conversation needs the user's ElevenLabs key and microphone; record whether it was run. **Not run on 2026-11-13:** only `/voice-api/health` through the proxy was checked (key set, agent set), to save credits.

### Task 10: Verify

- [x] `npm run typecheck`, `npm test`, `npm run build` all exit 0.
- [x] Browser walk in scripted mode at 390 px and on desktop, with screenshots: onboarding, unlock, balance (private and loudspeaker), send with approval, failed Face ID, cancel, money arrived.
- [ ] Keyboard pass: every control reachable, the sheet traps and returns focus. **Partly checked on 2026-11-13:** focus starts in the sheet and Escape closes it (automated); a full Tab pass by hand was not done.
- [x] Re-read the spec and tick each section against the app.
