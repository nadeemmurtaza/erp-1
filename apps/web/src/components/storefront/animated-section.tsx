'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';

/**
 * Reveals its children once, when they scroll into view.
 *
 * Two things this has to get right, both learned the hard way on a 360px
 * screen:
 *
 * **It must never leave content hidden.** The previous version paired
 * `once: true` with a `-10%` root margin, which shrinks the detection box by a
 * tenth of the viewport at top and bottom. On a phone that was enough that the
 * sections already on screen at first paint never satisfied it, and the home
 * page rendered blank — fourteen of fourteen sections sat at `opacity: 0`
 * until the visitor happened to scroll. `amount: 0.01` with no negative margin
 * fires as soon as any sliver is visible, including on load.
 *
 * **It must never widen the page.** A full-width element offset sideways has
 * nowhere to go on a narrow screen: the old 24px `x` pushed the document 8px
 * past the viewport for the whole time it was hidden, which on a stuck reveal
 * meant permanently. Horizontal offsets are for screens wide enough to absorb
 * them; below `md` a sideways reveal becomes an upward one, which cannot
 * overflow because the page already scrolls that way.
 */
function useHorizontalRevealAllowed(): boolean {
  // Matches Tailwind's `md`. Starts false so the first client render agrees
  // with the server, then corrects after mount.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const sync = () => setAllowed(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return allowed;
}

export function AnimatedSection({
  children,
  className,
  delay = 0,
  direction = 'up',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
}) {
  const allowHorizontal = useHorizontalRevealAllowed();
  const reduceMotion = useReducedMotion();

  const resolved =
    (direction === 'left' || direction === 'right') && !allowHorizontal ? 'up' : direction;

  const variants = (() => {
    // Someone who asked for less motion gets the content, not the journey.
    if (reduceMotion) return { hidden: { opacity: 0 }, visible: { opacity: 1 } };

    switch (resolved) {
      case 'up':
        return { hidden: { opacity: 0, y: 50 }, visible: { opacity: 1, y: 0 } };
      case 'down':
        return { hidden: { opacity: 0, y: -50 }, visible: { opacity: 1, y: 0 } };
      case 'left':
        return { hidden: { opacity: 0, x: 24 }, visible: { opacity: 1, x: 0 } };
      case 'right':
        return { hidden: { opacity: 0, x: -24 }, visible: { opacity: 1, x: 0 } };
      case 'none':
        return { hidden: { opacity: 0 }, visible: { opacity: 1 } };
    }
  })();

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.01 }}
      transition={{
        duration: reduceMotion ? 0 : 0.8,
        delay: reduceMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
