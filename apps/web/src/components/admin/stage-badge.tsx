import clsx from 'clsx';
import type { StitchingStage } from '@yaseen/shared';
import { STAGE_LABELS } from '@/lib/stitching-types';

/** The stage a job is at. Always carries its name — never colour alone. */
export function StageBadge({ stage }: { stage: StitchingStage }) {
  return (
    <span
      className={clsx(
        'rounded px-2 py-0.5 text-xs font-medium',
        stage === 'READY' || stage === 'DISPATCHED'
          ? 'bg-brand-100 text-brand-800'
          : stage === 'RECEIVED'
            ? 'bg-sand-100 text-ink/60'
            : 'bg-brand-50 text-brand-700',
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
