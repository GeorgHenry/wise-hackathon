import { useId } from 'react';
import type { Currency } from '../bank/types';

const STARS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  return { x: 16 + 9 * Math.sin(angle), y: 16 - 9 * Math.cos(angle) };
});

/** A round flag for a currency, drawn simply. */
export function Flag({ currency, size = 32 }: { currency: Currency; size?: number }) {
  const clip = useId();

  if (currency === 'EUR') {
    return (
      <svg className="flag" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="Euro">
        <circle cx="16" cy="16" r="16" fill="#1b3fa0" />
        {STARS.map((star) => (
          <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r="1.3" fill="#ffcc00" />
        ))}
      </svg>
    );
  }

  return (
    <svg className="flag" width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="British pound">
      <clipPath id={clip}>
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="32" height="32" fill="#012169" />
        <path d="M0 0l32 32M32 0L0 32" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l32 32M32 0L0 32" stroke="#c8102e" strokeWidth="2.4" />
        <path d="M16 0v32M0 16h32" stroke="#fff" strokeWidth="9" />
        <path d="M16 0v32M0 16h32" stroke="#c8102e" strokeWidth="5" />
      </g>
    </svg>
  );
}
