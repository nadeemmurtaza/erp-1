'use client';

import { useLayoutEffect, useRef } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { MOTION_MS, countUpValue } from '@/lib/motion';

/**
 * A figure that counts to its value instead of appearing at it.
 *
 * What it communicates: that the number was just computed, and how big it is
 * relative to nothing. It is for the headline figures of a screen — the
 * strip of KPIs, a total — on the moment they arrive or change; not for a
 * table of a hundred cells, and not for a figure the reader is already
 * comparing (a number that moves while someone reads it is a number they
 * cannot trust). It runs for one `sweep` (420ms) and lands exactly on the value.
 *
 * `format` is the caller's own formatter — `formatMoney`, `formatNumber` — so a
 * figure counts in the same units, currency and locale it settles in. Nothing
 * here formats a number.
 *
 * Built so it costs no React renders while it runs. The element is written
 * directly, one `requestAnimationFrame` at a time, and React owns only the
 * settled value: the server renders it, no-script shows it, and reduced motion
 * never starts the count. The text a screen reader meets is the settled value
 * in an `sr-only` twin; the counting copy is `aria-hidden`, so nobody hears the
 * number climb. A change of `value` counts on from wherever it had got to, not
 * back from zero.
 */
export function CountUp({
  value,
  format,
  from = 0,
  className,
}: {
  value: number;
  format: (n: number) => string;
  /** Where the first count starts. Zero, almost always. */
  from?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(from);
  const formatRef = useRef(format);

  // Always the latest formatter, without making an inline arrow restart the count.
  useLayoutEffect(() => {
    formatRef.current = format;
  });

  useLayoutEffect(() => {
    const el = node.current;
    const text = el?.firstChild;
    if (!el || !text) return;
    // Write to the text node React rendered rather than replacing it, so React's
    // own later updates still land on the node that is on screen.
    const write = (n: number) => {
      text.nodeValue = formatRef.current(n);
    };

    const origin = shown.current;
    if (reduced || origin === value) {
      shown.current = value;
      write(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    write(origin);
    const tick = (now: number) => {
      const progress = (now - start) / MOTION_MS.count;
      const current = countUpValue(origin, value, progress);
      shown.current = current;
      write(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  const settled = format(value);
  return (
    <span className={cn('tabular-nums', className)}>
      <span ref={node} aria-hidden="true">
        {settled}
      </span>
      <span className="sr-only">{settled}</span>
    </span>
  );
}
