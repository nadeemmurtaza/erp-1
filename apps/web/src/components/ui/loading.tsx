import { cn } from '@/utils/cn';

/**
 * The "still fetching" line.
 *
 * This was written out by hand at thirty-odd call sites and had drifted the way
 * repeated markup does: twenty-one said `Loading…` with a real ellipsis, four
 * said `Loading...` with three periods, and the wrapper was variously
 * `text-sm text-neutral-900/60`, the same without `text-sm`, and the same again
 * with `p-3` or `p-4` in front or behind. None of them announced themselves, so
 * a screen reader sat in silence while the page fetched.
 *
 * `role="status"` fixes that — an assertive-but-polite live region is exactly
 * what a loading line is. Pass `label` when the wait is long enough that saying
 * what is loading helps ("Loading ledger"); the ellipsis is added here so it
 * cannot drift again.
 */
export function Loading({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <p role="status" className={cn('p-4 text-sm text-neutral-900/60', className)}>
      {label}…
    </p>
  );
}
