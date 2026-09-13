'use client';

import { cn } from '@/utils/cn';
import type { Toast } from '@/hooks/use-toast';

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  const typeStyles = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-neutral-50 text-accent-hover border-neutral-100',
  };

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'rounded-md border p-3 text-sm pointer-events-auto animate-slideUp',
            typeStyles[toast.type]
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.message}</p>
            <button
              type="button"
              onClick={() => onRemove(toast.id)}
              className="shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4 12 12M12 4 4 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
