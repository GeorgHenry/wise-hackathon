// The scripted agent's voice: the browser's own speech synthesis, or a pause of
// about the same length when speech is off or missing.

/** Pause about as long as the line would take to say. */
export function pauseFor(text: string): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(2500, 400 + text.length * 25)));
}

/** How long to wait for the browser to start speaking before carrying on without it. */
const START_GRACE_MS = 1200;

export function speakAloud(text: string, enabled: () => boolean): Promise<void> {
  const synth = typeof window === 'undefined' ? undefined : window.speechSynthesis;
  if (!synth || !enabled()) return pauseFor(text);

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = 0.95;

    let started = false;
    // Some browsers never speak (no voice installed, a hidden tab) and never say so.
    // The conversation must not hang on that.
    const neverStarted = setTimeout(() => {
      if (started) return;
      synth.cancel();
      done();
    }, START_GRACE_MS);
    const tooLong = setTimeout(done, 3000 + text.length * 110);
    function done(): void {
      clearTimeout(neverStarted);
      clearTimeout(tooLong);
      resolve();
    }

    utterance.onstart = () => {
      started = true;
    };
    utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
}
