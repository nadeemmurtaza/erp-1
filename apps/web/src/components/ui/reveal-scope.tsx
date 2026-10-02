'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { armReveal } from '@/lib/reveal';

/**
 * A container whose direct children marked `data-reveal-item` arrive as they
 * scroll into view, a few at a time, instead of the whole board being on screen
 * at once. It renders the container itself (so a grid stays the grid) and is the
 * only client code a server-rendered `Bento` needs.
 *
 * What it is for, and what it is not (`05-motion.md`, Scroll): "progressive
 * reveal of long content; a section assembling as it enters". It never delays an
 * interaction, never pins or hijacks scroll, and an element is revealed once.
 * Use it where there is a board or a long run of peers below the fold; a short
 * form or a table the reader came to use does not need it.
 *
 * Reduced motion, no `IntersectionObserver`, and no scripting all land on the
 * same result: everything is simply visible. See `armReveal`.
 */
export function RevealScope({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    return armReveal(Array.from(root.querySelectorAll<HTMLElement>(':scope > [data-reveal-item]')));
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
