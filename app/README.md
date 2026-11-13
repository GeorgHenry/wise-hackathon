# Wise Voice app front

A phone-sized web app that looks like the Wise app and shows voice banking:
unlock with Face ID, hear the balance, send money to a saved person, and hear
that money arrived.

This is a hackathon prototype. Every name, balance, rate and fee is invented,
Face ID is an on-screen animation, and nothing connects to Wise.

## Run it

```bash
cd app
npm install
npm run dev
```

Open http://localhost:5173. On a desktop the app sits in an iPhone 17 Pro frame,
scaled to fit the window, with the demo controls beside it. On a phone the
controls are behind the "Demo" button at the top.

Wise Voice is the **live ElevenLabs agent** whenever its server is running:

```bash
cd voice-agent
npm run server
```

Open the voice sheet and talk. A live session uses the microphone and
ElevenLabs credits for as long as the sheet is open, and the sheet opens by
itself after every unlock. Close it to end the session.

When the voice server is not running, the app falls back to a **silent
scripted agent**: tap a suggested phrase or type, and it answers in text. You
can choose it yourself under "Voice agent" in the demo controls, or by opening
http://localhost:5173/?agent=scripted, which is what rehearsals and tests should
use.

The microphone needs a normal browser. The browser pane inside the Claude app
blocks it.

## What to show

1. Onboarding: what Wise Voice does, Face ID set-up, microphone.
2. Unlock with Face ID. Wise Voice starts by itself.
3. "What's my balance?" Then switch Audio to Loudspeaker and ask again: no
   amounts are read out.
4. "Send Oskar 30 pounds." It reads the details back and waits. Say or tap
   "Yes, send it", approve with Face ID, and watch the total balance drop.
   Thirty pounds comes out of her pound balance with no fee; ask for 400 pounds
   to hear a conversion from euros with its fee.
5. "Transfer 20 dollars to Martin." Martin is a phone contact who uses Wise, not
   a saved recipient. It says so, and that he has not been paid before.
6. Switch Face ID to Fails and try again: nothing is sent.
7. Press "Money arrives from Kadri": the agent says so and the balance rises.

The Voice tab in the tab bar opens Wise Voice from any tab. "Reset the demo"
puts the account back to the start.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## How it fits together

- `src/bank/` is the demo account and the contract the voice agent calls
  (`types.ts`). Money moves only in `store.ts`, and only after the Face ID step.
- `src/voice/` turns the agent's events into what the voice sheet shows. It can
  run the live agent from `../voice-agent/web/voice.js` or the scripted one in
  `scriptedAgent.ts`; both emit the same events.
- `src/auth/` is the Face ID animation and the approve step.
- `src/screens/`, `src/components/` and `src/demo/` are the interface.

The design is in `../docs/superpowers/specs/2026-11-13-wise-voice-app-front-design.md`.

## Not done

- The live agent has not been tried from this app with a real microphone.
- On a real phone the page must be served over HTTPS before the browser allows
  the microphone. That is not set up; on the Mac itself `localhost` is enough.
