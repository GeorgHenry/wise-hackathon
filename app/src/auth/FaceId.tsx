import { useCallback, useEffect, useRef, useState } from 'react';
import './FaceId.css';

// Face ID here is an on-screen animation. A web page cannot ask the phone's real
// Face ID without extra setup, so this shows where the check sits in the flow.

export type FaceIdState = 'idle' | 'scanning' | 'success' | 'fail';

const SCAN_MS = 1500;
const RESULT_MS = 700;

export function FaceId({ state, size = 96 }: { state: FaceIdState; size?: number }) {
  return (
    <span className={`faceid faceid--${state}`} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 30V20A12 12 0 0 1 20 8h10M66 8h10a12 12 0 0 1 12 12v10M88 66v10a12 12 0 0 1-12 12H66M30 88H20A12 12 0 0 1 8 76V66" />
        {state === 'success' ? (
          <path className="faceid__check" d="M30 50l12 12 24-26" />
        ) : (
          <>
            <path d="M34 36v8M62 36v8" />
            <path d="M48 36v16h-5" />
            <path d="M34 63c8 7 20 7 28 0" />
          </>
        )}
      </svg>
      {state === 'scanning' && <span className="faceid__beam" />}
    </span>
  );
}

/**
 * Runs one scan: about a second and a half of "looking", then the result shown
 * briefly. `outcome` is what the scan will find (a demo switch decides it).
 */
export function useFaceIdScan(): { state: FaceIdState; scan: (outcome: boolean) => Promise<boolean> } {
  const [state, setState] = useState<FaceIdState>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current = [];
    },
    [],
  );

  const scan = useCallback(
    (outcome: boolean) =>
      new Promise<boolean>((resolve) => {
        setState('scanning');
        timers.current.push(
          setTimeout(() => {
            setState(outcome ? 'success' : 'fail');
            timers.current.push(setTimeout(() => resolve(outcome), RESULT_MS));
          }, SCAN_MS),
        );
      }),
    [],
  );

  return { state, scan };
}
