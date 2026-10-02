'use client';

import { useCallback, useState } from 'react';
import { BRAND } from '@newax/shared';
import { MOTION_MS } from '@/lib/motion';
import { prefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
  /** Dismissed and playing its exit; removed one exit duration later. */
  leaving?: boolean;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * Both the timer and a click end here. The toast is marked `leaving` first
   * and removed `MOTION_MS.exit` later, so it gets the exit its entrance
   * implies instead of vanishing; under reduced motion it is removed at once.
   */
  const dismiss = useCallback((id: string) => {
    if (prefersReducedMotion()) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, MOTION_MS.exit);
  }, []);

  const add = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = BRAND.feedback.toastMs) => {
      const id = `${Date.now()}-${Math.random()}`;
      const toast: Toast = { id, message, type, duration };

      setToasts((prev) => [...prev, toast]);

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss],
  );

  return { toasts, add, remove: dismiss };
}
