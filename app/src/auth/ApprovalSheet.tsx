import { useEffect, useRef, useState } from 'react';
import type { BankStore } from '../bank/store';
import type { PreparedTransfer } from '../bank/types';
import { useBank } from '../bank/useBank';
import { Money } from '../components/Money';
import { FaceId, useFaceIdScan } from './FaceId';

export interface ApprovalRequest {
  transfer: PreparedTransfer;
  answer: (approved: boolean) => void;
}

/**
 * Makes the app the bank's approval step: while a transfer is being confirmed,
 * the returned request is set, and answering it lets the transfer finish.
 */
export function useApproval(store: BankStore): ApprovalRequest | null {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    store.setApprover(
      (transfer) =>
        new Promise<boolean>((resolve) => {
          setRequest({
            transfer,
            answer: (approved) => {
              setRequest(null);
              resolve(approved);
            },
          });
        }),
    );
    return () => store.setApprover(async () => false);
  }, [store]);

  return request;
}

const STATUS = {
  idle: 'Look at your phone',
  scanning: 'Checking it is you…',
  success: 'Approved',
  fail: 'Face not recognised. Nothing was sent.',
} as const;

interface ApprovalSheetProps {
  request: ApprovalRequest;
  /** What the scan will find; a demo switch. */
  faceIdPasses: boolean;
}

/** Face ID for one payment. It answers the request once the scan has finished. */
export function ApprovalSheet({ request, faceIdPasses }: ApprovalSheetProps) {
  const { transfer, answer } = request;
  const { state, scan } = useFaceIdScan();
  const phase = useBank().transfer?.phase;
  const outcome = useRef(faceIdPasses);

  useEffect(() => {
    let current = true;
    void scan(outcome.current).then((approved) => {
      if (current) answer(approved);
    });
    return () => {
      current = false;
    };
  }, [scan, answer]);

  // Cancelled elsewhere (the user said "cancel", or the session ended): close without approving.
  useEffect(() => {
    if (phase !== 'approving') answer(false);
  }, [phase, answer]);

  return (
    <div className="approval">
      <div className="approval__sheet" role="alertdialog" aria-modal="true" aria-labelledby="approval-title" aria-describedby="approval-status">
        <span className="approval__grabber" aria-hidden="true" />
        <span className="approval__face">
          <FaceId state={state} size={84} />
        </span>
        <h2 id="approval-title" className="approval__title">
          Confirm with Face ID
        </h2>
        <p className="approval__amount">
          <Money amount={transfer.targetAmount} currency={transfer.targetCurrency} />
          <span className="approval__to">to {transfer.recipientName}</span>
        </p>
        <p id="approval-status" className={`approval__status approval__status--${state}`} role="status">
          {STATUS[state]}
        </p>
      </div>
    </div>
  );
}
