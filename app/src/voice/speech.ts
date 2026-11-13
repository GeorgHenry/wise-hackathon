// The scripted agent has no voice. It pauses about as long as a line would take
// to say, so the captions arrive at a human pace.

export function pauseFor(text: string): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(2500, 400 + text.length * 25)));
}
