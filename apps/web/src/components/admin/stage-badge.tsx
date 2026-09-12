import type { StitchingStage } from '@yaseen/shared';
import { STAGE_LABELS } from '@/types/stitching';
import { StatusBadge } from './status-badge';

/**
 * The stage a job is at. Always carries its name — never colour alone.
 *
 * A thin pass-through to StatusBadge now: stages are just another set of
 * status names, and keeping a second implementation is how RECEIVED ended up
 * invisible on a white row while every other stage had a pill.
 */
export function StageBadge({ stage }: { stage: StitchingStage }) {
  return <StatusBadge status={stage} label={STAGE_LABELS[stage]} />;
}
