'use client';

import { cn } from '@/utils/cn';
import type { Toast } from '@/hooks/use-toast';

/**
 * The fixed top-end toast stack every `useToast()` caller renders. Pulled
 * out once six call sites had copied the same markup (the rule of three) —
 * each copy was drifting toward a bare `border-neutral-200`, which reads
 * below the WCAG contrast floor (`COL-3`) and isn't the type-coloured border
 * this pattern is meant to have.
 *
 * A toast arrives (`animate-arrive`: it settles in, so a message that appeared
 * in a corner is seen to appear), leaves (`animate-leave`, the `fast` exit, for
 * the one exit duration `useToast` keeps it mounted), and carries a thin timer
 * line that runs down for as long as it will stay. The line is a `scaleX` on a
 * transform-origin at the inline start, so it drains the right way in Urdu too,
 * and its duration is the toast's own `duration` — the one inline style here,
 * because it is data rather than a design value. A toast with `duration: 0`
 * stays until dismissed and has no line, since there is nothing to count down.
 *
 * The wrapper is always present and is a polite live region: a region that
 * mounts with its first message is not announced reliably, so the region stays
 * and the messages come and go inside it.
 */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed end-4 top-4 z-toast flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cn(
            'pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-md border p-4 text-start text-sm shadow-md',
            t.leaving ? 'pointer-events-none animate-leave' : 'animate-arrive',
            t.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : t.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-blue-200 bg-blue-50 text-blue-800',
          )}
          onClick={() => onDismiss(t.id)}
          aria-label={`Dismiss: ${t.message}`}
        >
          {t.message}
          {t.duration && t.duration > 0 && !t.leaving ? (
            <span
              aria-hidden="true"
              className="toast-timer"
              style={{ animationDuration: `${t.duration}ms` }}
            />
          ) : null}
        </button>
      ))}
    </div>
  );
}
