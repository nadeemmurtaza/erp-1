'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { MOTION_MS, countUpValue, reelParts, staggerDelayMs } from '@/lib/motion';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

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
 *
 * `mode="reel"` is the odometer: instead of the whole figure changing, each digit
 * is a window onto a strip of 0 to 9 and rolls to its place, the digits stopping
 * one stagger step apart from the left, over one `sweep`. It is for the one
 * figure of a screen that is *the* figure; it shows the settled figure's own
 * digits and nothing is interpolated, so a currency, a separator or a minus
 * sign stays where it is. Only ASCII digits roll (another script's digits are
 * fixed text), and the figure is display-only: the rolling strips are not text a
 * reader can select, so use the default count where a figure is copied.
 */
export function CountUp({
  mode = 'count',
  ...props
}: {
  value: number;
  format: (n: number) => string;
  /** Where the first count starts. Zero, almost always. */
  from?: number;
  /** `count` runs the figure up as text; `reel` rolls each digit. */
  mode?: 'count' | 'reel';
  className?: string;
}) {
  return mode === 'reel' ? <ReelFigure {...props} /> : <CountFigure {...props} />;
}

function CountFigure({
  value,
  format,
  from = 0,
  className,
}: {
  value: number;
  format: (n: number) => string;
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

/** The strips of a reel figure, in reading order. */
function reelStrips(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.reel-strip'));
}

function ReelFigure({
  value,
  format,
  from = 0,
  className,
}: {
  value: number;
  format: (n: number) => string;
  from?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const root = useRef<HTMLSpanElement>(null);
  const start = useRef({ from, format });

  useLayoutEffect(() => {
    start.current = { from, format };
  });

  // On arrival the strips begin on the digits of `from` (zeros, almost always) and roll to the figure.
  // The server rendered the figure itself, so this runs before the first client paint, with the
  // transition off for the reset (otherwise the reset would roll backwards) and on for the roll.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    const strips = reelStrips(el);
    const origin = reelParts(start.current.format(start.current.from)).flatMap((part) =>
      part.kind === 'digit' ? [part.digit] : [],
    );
    const settled = () => strips.forEach((strip) => strip.style.setProperty('--d', strip.dataset.digit ?? '0'));

    strips.forEach((strip, i) => {
      strip.style.transition = 'none';
      // Digits line up from the right, as a figure does: a shorter origin is padded with zeros on the left.
      strip.style.setProperty('--d', String(origin[i - (strips.length - origin.length)] ?? 0));
    });
    void el.offsetWidth; // commit the starting digits before the transition comes back on
    strips.forEach((strip) => {
      strip.style.transition = '';
    });
    const frame = requestAnimationFrame(settled);
    return () => {
      cancelAnimationFrame(frame);
      settled();
    };
  }, [reduced]);

  const settled = format(value);
  let order = 0;
  return (
    <span className={cn('tabular-nums', className)}>
      <span ref={root} aria-hidden="true" className="select-none">
        {reelParts(settled).map((part, i, all) => {
          // Keyed from the right, so a strip keeps its place (and rolls) when the figure gains a digit on the left.
          const key = all.length - i;
          if (part.kind === 'fixed') return <span key={key}>{part.char}</span>;
          const style = { '--d': part.digit, '--reel-delay': `${staggerDelayMs(order++)}ms` } as CSSProperties;
          return (
            <span key={key} className="reel-digit">
              <span className="reel-strip" data-digit={part.digit} style={style}>
                {DIGITS.map((digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
      <span className="sr-only">{settled}</span>
    </span>
  );
}
