'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

/**
 * A modal dialog, with the behaviour every modal is supposed to have.
 *
 * The app had four hand-rolled modals and they did not agree on what a modal
 * does. The size-chart one closed on Escape, trapped focus and restored it on
 * close; the quick-view one did none of those and carried no `role="dialog"`
 * either, so a keyboard user could tab out of it into the page behind while a
 * screen reader never announced it as a dialog at all. Both locked body
 * scroll, in slightly different ways.
 *
 * This is that behaviour once, correctly:
 *
 *   - Escape closes.
 *   - Clicking the backdrop closes; clicking inside does not.
 *   - Focus moves into the panel on open and returns to whatever was focused
 *     before, on close.
 *   - Tab is trapped inside the panel while it is open.
 *   - Body scroll is locked, and released even if the component unmounts
 *     while open.
 *   - `role="dialog"` + `aria-modal`, labelled by the title.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's accessible name. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Remember what had focus so it can be handed back on close. Captured on
  // open rather than on mount: the trigger is usually focused at that moment.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Scroll lock. The cleanup restores the previous value rather than clearing
  // it, so a dialog opened from inside another locked context does not free
  // the page on the way out.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      // Focus trap: wrap at both ends of the panel's tabbable elements.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'card relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col outline-none animate-scaleIn',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-t border-neutral-100 px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
