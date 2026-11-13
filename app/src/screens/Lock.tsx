import { FaceId, useFaceIdScan } from '../auth/FaceId';
import { ACCOUNT_HOLDER } from '../bank/seed';
import './Onboarding.css';

const STATUS = {
  idle: 'Wise Voice is locked.',
  scanning: 'Checking it is you…',
  success: 'Unlocked',
  fail: 'Face not recognised. Try again.',
} as const;

interface LockProps {
  /** What the scan will find; a demo switch. */
  faceIdPasses: boolean;
  onUnlock: () => void;
}

export function Lock({ faceIdPasses, onUnlock }: LockProps) {
  const { state, scan } = useFaceIdScan();
  const busy = state === 'scanning' || state === 'success';

  async function unlock(): Promise<void> {
    if (await scan(faceIdPasses)) onUnlock();
  }

  return (
    // Forest green, the colour of the voice sheet it opens onto.
    <div className="lock theme-forest">
      <span className="tag">Prototype</span>
      <div className="lock__centre">
        <span className="faceid-stage">
          <FaceId state={state} size={104} />
        </span>
        <h1 className="display lock__title">Welcome back, {ACCOUNT_HOLDER.firstName}</h1>
        <p className="lock__status" role="status">
          {STATUS[state]}
        </p>
      </div>
      <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void unlock()}>
        {state === 'fail' ? 'Try Face ID again' : 'Unlock with Face ID'}
      </button>
    </div>
  );
}
