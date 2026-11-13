import { type ReactNode, useLayoutEffect, useState } from 'react';

// The phone is drawn at an iPhone 17 Pro's real size, the device in the
// simulator: a 402 × 874 point screen in an 11 px bezel. On a short window the
// whole phone is scaled down, never squashed, so its proportions stay true.
// On a real phone the frame disappears and the app fills the screen.

/** The frame's outer size in CSS pixels: the screen plus the bezel. Matches .phone in base.css. */
const FRAME_HEIGHT = 896;
/** Room kept free above and below the phone. Matches .stage's padding. */
const MARGIN = 24;
/** At this width and below there is no frame. Matches the media query in base.css. */
const FRAMELESS_WIDTH = 540;
/** Below this the phone would be too small to use; the page scrolls instead. */
const SMALLEST = 0.5;

function fitScale(): number {
  if (typeof window === 'undefined' || window.innerWidth <= FRAMELESS_WIDTH) return 1;
  return Math.max(SMALLEST, Math.min(1, (window.innerHeight - 2 * MARGIN) / FRAME_HEIGHT));
}

function useFitScale(): number {
  const [scale, setScale] = useState(fitScale);
  useLayoutEffect(() => {
    const update = (): void => setScale(fitScale());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const scale = useFitScale();

  return (
    // zoom, unlike a transform, also shrinks the phone's box, so the stage lays out round the visible size.
    <div className="phone" style={{ zoom: scale }}>
      <span className="phone__button phone__button--action" aria-hidden="true" />
      <span className="phone__button phone__button--volume-up" aria-hidden="true" />
      <span className="phone__button phone__button--volume-down" aria-hidden="true" />
      <span className="phone__button phone__button--side" aria-hidden="true" />
      <span className="phone__button phone__button--camera" aria-hidden="true" />
      <div className="phone__screen">
        <div className="statusbar" aria-hidden="true">
          <span className="statusbar__time">9:41</span>
          <span className="statusbar__island" />
          <span className="statusbar__icons">
            <svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor">
              <rect x="0" y="7.5" width="3.2" height="4.5" rx="1" />
              <rect x="5.2" y="5" width="3.2" height="7" rx="1" />
              <rect x="10.4" y="2.5" width="3.2" height="9.5" rx="1" />
              <rect x="15.6" y="0" width="3.2" height="12" rx="1" />
            </svg>
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
              <path d="M8.5 2.6c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8.5.7 10.6 10.6 0 0 0 1 3.8l1.3 1.3a8.8 8.8 0 0 1 6.2-2.5Z" />
              <path d="M8.5 6.2c1.4 0 2.7.5 3.7 1.4l1.3-1.3a7 7 0 0 0-10 0l1.3 1.3a5.3 5.3 0 0 1 3.7-1.4Z" />
              <path d="M8.5 9.4c.5 0 1 .2 1.3.5L8.5 11.7 7.2 9.9c.3-.3.8-.5 1.3-.5Z" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
              <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" stroke="currentColor" opacity="0.4" />
              <rect x="2" y="2" width="20" height="9" rx="2.4" fill="currentColor" />
              <path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
        </div>
        <div className="app">{children}</div>
      </div>
    </div>
  );
}
