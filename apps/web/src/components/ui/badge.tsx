import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * A status mark, in the house corner. (A round shape is a count chip, `.pill`,
 * and is not a status: PER-3.)
 *
 * Before this, status colours were written inline at each call site, so
 * "paid" was `text-green-600` on one screen and `bg-green-100 text-green-800`
 * on the next, and "pending" was sometimes amber and sometimes plain grey.
 * The tones here are the vocabulary: pick the one that matches the MEANING
 * and let the component decide the colour.
 *
 * A tone that says something (not `neutral`) leads with a 6 px dot in the same colour: the mark
 * a person finds first in a column of statuses. It repeats what the colour and the word already
 * say, so it is `aria-hidden` and never the only sign (ADR-083, twelfth addendum).
 */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  // The one accent-coloured tone, for "this is in progress / ours".
  info: 'bg-accent/10 text-accent-hover',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {tone === 'neutral' ? null : <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
