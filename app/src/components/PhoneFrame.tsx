import type { ReactNode } from 'react';

/** A phone outline on desktop; on a real phone the frame disappears and the app fills the screen. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone">
      <div className="phone__screen">
        <div className="statusbar" aria-hidden="true">
          <span>9:41</span>
          <span className="statusbar__island" />
          <span className="statusbar__icons">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5" width="3" height="7" rx="1" />
              <rect x="10" y="2" width="3" height="10" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" opacity="0.35" />
            </svg>
            <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
              <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke="currentColor" opacity="0.4" />
              <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
              <rect x="25" y="4" width="2" height="5" rx="1" fill="currentColor" opacity="0.4" />
            </svg>
          </span>
        </div>
        <div className="app">{children}</div>
      </div>
    </div>
  );
}
