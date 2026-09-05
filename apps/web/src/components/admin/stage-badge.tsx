import { cn } from '@/utils/cn';
import type { StitchingStage } from '@yaseen/shared';
import { STAGE_LABELS } from '@/types/stitching';

/** The stage a job is at. Always carries its name — never colour alone. */
export function StageBadge({ stage }: { stage: StitchingStage }) {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-xs font-medium',
        stage === 'READY' || stage === 'DISPATCHED'
          ? 'bg-neutral-100 text-accent-hover'
          : stage === 'RECEIVED'
            ? 'bg-white text-neutral-900/60'
            : 'bg-neutral-50 text-accent-hover',
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
