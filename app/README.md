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

Open http://localhost:5173. On a desktop the app sits in a phone frame with the
demo controls beside it. On a phone the controls are behind the "Demo" button
at the top.

The app starts with the **scripted agent**: no microphone, no network. Tap a
suggested phrase or type, and it answers, with the browser's own voice if the
"speaks aloud" box is ticked.

For the **live ElevenLabs agent**, also start the voice server and switch
"Voice agent" to Live in the demo controls:

```bash
cd voice-agent
npm run server
```

A live session uses ElevenLabs credits and the microphone for as long as the
voice sheet is open. Close the sheet to end it.

## What to show

1. Onboarding: what Wise Voice does, Face ID set-up, microphone.
2. Unlock with Face ID. Wise Voice starts by itself.
3. "What's my balance?" Then switch Audio to Loudspeaker and ask again: no
   amounts are read out.
4. "Send Oskar 30 pounds." It reads the details back and waits. Say or tap
   "Yes, send it", approve with Face ID, and watch the total balance drop.
5. Switch Face ID to Fails and try again: nothing is sent.
6. Press "Money arrives from Kadri": the agent says so and the balance rises.

The mic button in the tab bar opens Wise Voice from any tab. "Reset the demo"
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
