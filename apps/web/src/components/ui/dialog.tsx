'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { useExitTransition } from '@/hooks/use-exit-transition';
import { originOffset } from '@/lib/motion';

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
 *   - It arrives and it leaves. The panel settles in (`arrive`, from the side
 *     of the control that opened it when there is one; a side sheet
 *     slides in from its own edge, in either direction of writing), the scrim
 *     fades, and on close both play the `fast` exit before unmounting
 *     (`useExitTransition`). While leaving, the whole thing is `inert`: focus
 *     has already been handed back and a click already reaches the page, so
 *     the exit never makes the interface wait on it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  className,
  header,
  align = 'center',
}: {
  open: boolean;
  onClose: () => void;
  /** Announced as the dialog's accessible name. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /**
   * Replaces the default title bar. `title` still names the dialog for a
   * screen reader — the command palette's header is its search field, and a
   * heading above that would be a second thing to read past.
   */
  header?: ReactNode;
  /**
   * `top` for a palette, which should not jump as its result count changes.
   * `end` for a side sheet: the panel is full height against the inline-end
   * edge (right in English, left in Urdu) and the page behind stays visible
   * past its edge — the detail of one row, opened without leaving the list.
   * It keeps everything a dialog has: Escape, the backdrop, the close button,
   * the focus trap and the scroll lock.
   */
  align?: 'center' | 'top' | 'end';
}) {
  const { mounted, leaving } = useExitTransition(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Remember what had focus so it can be handed back on close. Captured on
  // open rather than on mount: the trigger is usually focused at that moment.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Only take focus if nothing inside has already claimed it. The command
    // palette's search field autofocuses itself, and a panel that grabs focus
    // back a tick later sends the first keystroke nowhere.
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Where the panel arrives from. When a control opened the dialog it still has focus at this point
  // (the effect above has not moved it yet), so the panel rises from the side that control is on,
  // by the offset between the two centres held to `distance.large`. No focused control (opened by
  // script, or from the body) leaves the default, which is `arrive` itself: `small` below.
  // Read before the first paint and before the animation has moved the panel, so both rects are at rest.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const trigger = document.activeElement;
    if (!open || align === 'end' || !panel) return;
    if (!(trigger instanceof HTMLElement) || trigger === document.body || panel.contains(trigger)) return;
    const from = trigger.getBoundingClientRect();
    const to = panel.getBoundingClientRect();
    if (from.width === 0 && from.height === 0) return;
    const { dx, dy } = originOffset(
      { x: from.left + from.width / 2, y: from.top + from.height / 2 },
      { x: to.left + to.width / 2, y: to.top + to.height / 2 },
    );
    panel.style.setProperty('--origin-dx', `${dx}px`);
    panel.style.setProperty('--origin-dy', `${dy}px`);
  }, [open, align]);

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

  if (!mounted) return null;

  return (
    <div
      inert={leaving}
      className={cn(
        'fixed inset-0 z-modal flex justify-center',
        align === 'top' && 'items-start p-4 pt-[10vh]',
        align === 'center' && 'items-center p-4',
        align === 'end' && 'justify-end',
      )}
    >
      <div
        className={cn(
          'absolute inset-0 bg-scrim/40 backdrop-blur-sm transition-opacity duration-fast ease-exit',
          leaving ? 'opacity-0' : 'animate-fadeIn',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        Escape and the focus trap live on the panel, not on the positioning
        wrapper. Focus is always inside the panel while the dialog is open
        (see the focus effect above), so every relevant keystroke reaches here
        by bubbling — and a static wrapper carrying interaction is the thing
        jsx-a11y correctly refuses.

        The rule below treats role="dialog" as non-interactive. That holds for
        a dialog's *content* but not for a modal container: the WAI-ARIA APG
        puts Escape and the Tab trap exactly here. The alternative, a
        document-level listener, is worse — it fires for every nested dialog
        at once, where this stops propagation and closes only the innermost.
      */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'card relative z-raised flex w-full flex-col bg-overlay outline-none',
          align === 'end'
            ? cn('h-full max-w-md rounded-none border-y-0 border-e-0', leaving ? 'sheet-out' : 'sheet-in')
            : cn('max-h-[85vh] max-w-lg', leaving ? 'animate-leave' : 'arrive-from'),
          className,
        )}
      >
        {header ? (
          header
        ) : (
        <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <h2 className="font-display text-base font-semibold text-neutral-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
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

        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-t border-neutral-100 px-5 py-4">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
