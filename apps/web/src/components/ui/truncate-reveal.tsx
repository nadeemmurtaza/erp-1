'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { revealRun } from '@/lib/motion';

/**
 * A label cut short by an ellipsis that scrolls to show the rest while the
 * pointer is on it.
 *
 * What it communicates: *there is more, and here it is*, without a tooltip to
 * chase or a row to widen. It is for a name or a title in a column too narrow
 * for it (a ranking label, a tailor's name), not for a sentence. It runs only
 * while the pointer is over the label, never by itself: after a beat
 * (`normal`, 220ms) the text moves to its end at the reading speed
 * (`speed.read`, 48px/s, never longer than 5s) in a straight line, since a line
 * being read must move at a steady rate, and holds there until the pointer
 * leaves. Where nothing is hidden, nothing moves.
 *
 * The full text is always in the DOM (the cut is visual, so a screen reader
 * hears all of it) and in `title`, which is the way to it for a keyboard user
 * and when motion is reduced: reduced motion never starts the scroll.
 *
 * It fills its container (`block truncate`), so the parent must be able to
 * shrink it (`min-w-0` in a flex row).
 */
export function TruncateReveal({ text, className }: { text: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const box = useRef<HTMLSpanElement>(null);
  const [run, setRun] = useState<{ shift: number; durationMs: number } | null>(null);

  const start = () => {
    const el = box.current;
    if (!el || reduced) return;
    setRun(revealRun(el.scrollWidth - el.clientWidth));
  };

  return (
    <span
      ref={box}
      title={text}
      onMouseEnter={start}
      onMouseLeave={() => setRun(null)}
      className={cn('block truncate', className)}
    >
      {run ? (
        // Only while running: an inline-block child has no ellipsis, so the plain text is what shows the cut the rest of the time.
        <span
          className="reveal-run"
          style={{ '--reveal-shift': `${run.shift}px`, '--reveal-duration': `${run.durationMs}ms` } as CSSProperties}
        >
          {text}
        </span>
      ) : (
        text
      )}
    </span>
  );
}
