import type { CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { progressFraction } from '@/lib/motion';

/**
 * A bar that fills to a fraction of something, where a `ProgressRing` would be
 * too tall: a line in a ranking, a workload against a capacity, an upload.
 *
 * It says *how much*, so it is for a quantity with a known maximum; waiting
 * with no known end is `Loading`. The fill slides in from the start of the line
 * (the right in a right-to-left document) on a transform, so the value moves
 * nothing but paint, and eases to each new value over `normal` on `standard`:
 * a bar tracking real progress follows the data, it does not run its own clock.
 *
 * - `tone` says how it ended, never what it is: `positive` for done, `negative`
 *   for failed, the accent otherwise. The caller's label or `valueText` says the
 *   same in words, so the colour is never alone.
 * - `head` rides a knob on the leading end, for a bar the reader is watching
 *   move; it takes no layout height.
 * - `segmented` cuts the bar into cells that light one by one as the fill
 *   crosses them (a meter, a step count), keeping the ghost of the full scale.
 *
 * A real `progressbar`: `label` names what it measures, and `valueText`
 * ("12 of 20 open", "Failed") is read in place of the bare number. It takes the
 * width of its container (it measures that width for the head), so it goes in a
 * block, or in a flex row as `flex-1`; never as a shrink-to-fit inline box.
 */
export function ProgressBar({
  value,
  max = 100,
  label,
  valueText,
  tone,
  head = false,
  segmented = false,
  className,
}: {
  value: number;
  /** The value that is a full bar. Above zero; anything else draws an empty bar. */
  max?: number;
  /** What the bar measures. */
  label: string;
  valueText?: string;
  tone?: 'positive' | 'negative';
  head?: boolean;
  segmented?: boolean;
  className?: string;
}) {
  const fraction = progressFraction(value, max);
  // An unusable `max` is an empty bar of the default scale, so the ARIA range stays valid (max above min).
  const top = Number.isFinite(max) && max > 0 ? max : 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={top}
      aria-valuenow={fraction * top}
      aria-valuetext={valueText}
      data-tone={tone}
      className={cn('progress', className)}
      // `--p` is the whole of the bar's state: the fill and the head both read it, so a value is one write.
      style={{ '--p': fraction } as CSSProperties}
    >
      <div className="progress-track" data-segmented={segmented ? '' : undefined}>
        <div className="progress-fill" />
      </div>
      {head ? <span aria-hidden="true" className="progress-head" /> : null}
    </div>
  );
}
