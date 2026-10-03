'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * Advanced options, folded away until asked for.
 *
 * This is the mechanism the whole mandate leans on. "Move it to layer 3" is
 * only a real instruction if there is somewhere to move it to, and without
 * this the choice is between showing a field and deleting it — so everything
 * gets shown. The audit found eighteen fields on one page and fifteen on
 * another, which is what that choice produces.
 *
 * Closed by default, always. If something must be open on arrival it is not
 * advanced, and putting it here is a way of pretending a page is simpler than
 * it is.
 *
 * The content stays mounted and is hidden with `hidden`, so a field inside it
 * keeps its value, still posts with the form, and is still found by the
 * browser's find-in-page. Unmounting would silently drop input somebody had
 * already typed.
 *
 * Opening plays one `rise` (a fade and 8px of travel up from the trigger, over
 * `normal`) on the content, and the chevron turns on the same curve. The
 * content does not animate its height: that is a layout property, and a long
 * form growing frame by frame is the layout thrash `05-motion.md` rules out.
 * `hidden` toggling `display` restarts the animation on every open for free.
 */
export function Disclosure({
  label = 'Advanced options',
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={cn('mt-4', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex items-center gap-1.5 rounded py-1 text-sm font-medium text-neutral-900/70 transition-colors hover:text-neutral-900"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn('shrink-0 transition-transform duration-normal ease-settle', open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {label}
      </button>

      <div id={id} hidden={!open} className="mt-3 animate-rise border-s border-neutral-100 ps-4">
        {children}
      </div>
    </div>
  );
}
