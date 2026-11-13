import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../bank/money';
import type { Currency } from '../bank/types';

/** "1,840.25 EUR" split into the figure and the currency code, so the code can be set smaller. */
export function moneyParts(amount: number, currency: Currency): { figure: string; code: string } {
  const text = formatMoney(amount, currency);
  const cut = text.lastIndexOf(' ');
  return { figure: text.slice(0, cut), code: text.slice(cut + 1) };
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

const TWEEN_MS = 900;

/** Counts from the last value to the new one, so a payment is seen to change a balance. */
function useCountTo(value: number): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);

  useEffect(() => {
    const origin = current.current;
    if (origin === value || reducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      current.current = origin + (value - origin) * eased;
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    // Frames pause in a hidden tab; land on the true value regardless.
    const land = setTimeout(() => {
      current.current = value;
      setShown(value);
    }, TWEEN_MS + 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(land);
    };
  }, [value]);

  return shown;
}

/** Which way the value last moved, for a moment after it moved. */
function useTrend(value: number): 'up' | 'down' | null {
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);
  const last = useRef(value);

  useEffect(() => {
    if (value === last.current) return;
    setTrend(value > last.current ? 'up' : 'down');
    last.current = value;
    const done = setTimeout(() => setTrend(null), 1600);
    return () => clearTimeout(done);
  }, [value]);

  return trend;
}

interface MoneyProps {
  amount: number;
  currency: Currency;
  /** Hide the figure (the eye button on Home). */
  hidden?: boolean;
  /** Count to a new value instead of jumping to it. */
  animate?: boolean;
  /** "+ " for money coming in. */
  sign?: string;
  className?: string;
}

/**
 * A big amount in the display face. Screen readers get the final value once,
 * never the numbers it counts through.
 */
export function Money({ amount, currency, hidden = false, animate = false, sign = '', className }: MoneyProps) {
  const counted = useCountTo(amount);
  const trend = useTrend(amount);
  const { figure, code } = moneyParts(animate ? counted : amount, currency);
  const classes = ['money', trend && animate ? `money--${trend}` : '', className ?? ''].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      <span className="money__shown" aria-hidden="true">
        {hidden ? (
          '••••••'
        ) : (
          <>
            <span className="money__figure">
              {sign}
              {figure}
            </span>
            <span className="money__code">{code}</span>
          </>
        )}
      </span>
      <span className="sr-only">{hidden ? 'Hidden' : `${sign}${formatMoney(amount, currency)}`}</span>
    </span>
  );
}
