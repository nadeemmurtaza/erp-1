'use client';

import { cn } from '@/utils/cn';
import type { Toast } from '@/hooks/use-toast';

/**
 * The fixed top-right toast stack every `useToast()` caller renders. Pulled
 * out once six call sites had copied the same markup (the rule of three) —
 * each copy was drifting toward a bare `border-neutral-200`, which reads
 * below the WCAG contrast floor (`COL-3`) and isn't the type-coloured border
 * this pattern is meant to have.
 */
export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className={cn(
            'w-full cursor-pointer rounded-md border p-4 text-start text-sm shadow-md',
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
        </button>
      ))}
    </div>
  );
}
