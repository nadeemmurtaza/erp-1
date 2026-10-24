'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { UploadTray } from '@/components/ui/upload-tray';
import { useExitTransition } from '@/hooks/use-exit-transition';
import { useUploadQueue, type EnqueueOptions, type EnqueueResult, type UploadSend } from '@/hooks/use-upload-queue';
import { TRAY_HIDE_MS, allSucceeded, hasActive, type UploadItem, type UploadSummary } from '@/lib/upload-queue';

export type { EnqueueOptions, EnqueueResult, UploadSend };

export interface Uploads {
  /** Every lane, in the order the files were added. */
  items: readonly UploadItem[];
  summary: UploadSummary;
  /**
   * Checks the files against `rules` once more, queues the ones that pass and
   * sends them (at most three at a time) with `send`. `onDone` runs for each
   * file when it lands, wherever the operator has navigated to by then.
   */
  enqueue: <R>(files: readonly File[], options: EnqueueOptions<R>) => EnqueueResult;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  /** Hides the tray and, once it has left, clears every lane that has stopped. Lanes still going stay and bring it back. */
  dismiss: () => void;
}

const UploadsContext = createContext<Uploads | null>(null);

/**
 * The page's way to send files: `useUploads().enqueue(files, { rules, send, onDone })`.
 * The transfer belongs to the admin shell, not to the page that started it.
 */
export function useUploads(): Uploads {
  const uploads = useContext(UploadsContext);
  if (!uploads) throw new Error('useUploads() needs an <UploadProvider>; the admin shell mounts one.');
  return uploads;
}

/**
 * Owns the upload queue and its docked tray for the whole back office (UPL-6).
 *
 * It mounts once, in the admin shell, above every page. That is the point: a
 * transfer belongs to the shell and not to the page that started it, so moving to
 * another page inside the admin neither aborts nor hides it, and the operator
 * keeps working while a batch of photographs goes up. A transfer cannot outlive
 * the tab, so while one is going the browser is asked to confirm before the tab
 * closes.
 *
 * The tray hides itself `TRAY_HIDE_MS` (4 000 ms, the toast default) after
 * everything succeeded, with the exit the entrance implies, and never on a timer
 * after a failure: a failed lane keeps the tray until it is retried or the
 * operator dismisses it. The timer waits while the pointer or focus is on the
 * tray. New files arriving while it leaves bring it straight back.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const queue = useUploadQueue();
  const { items, summary, retry, cancel, clearSettled, enqueue: enqueueFiles } = queue;
  const [dismissed, setDismissed] = useState(false);
  const [paused, setPaused] = useState(false);

  const visible = items.length > 0 && !dismissed;
  const { mounted, leaving } = useExitTransition(visible);

  const enqueue = useCallback<Uploads['enqueue']>(
    (files, options) => {
      // Files arriving bring a hidden or leaving tray back.
      setDismissed(false);
      return enqueueFiles(files, options);
    },
    [enqueueFiles],
  );

  const dismiss = useCallback(() => setDismissed(true), []);

  // Lanes are cleared only after the tray has finished leaving, so it never shows an empty list on its way out.
  useEffect(() => {
    if (dismissed && !mounted) {
      clearSettled();
      setDismissed(false);
      // A tray removed under the pointer never sees it leave.
      setPaused(false);
    }
  }, [dismissed, mounted, clearSettled]);

  // Everything landed: a confirmation lives as long as a toast does, unless the reader is on it.
  const succeeded = allSucceeded(items);
  useEffect(() => {
    if (!succeeded || paused || dismissed) return;
    const timer = window.setTimeout(dismiss, TRAY_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [succeeded, paused, dismissed, dismiss]);

  // A transfer dies with its tab; ask first rather than lose the batch silently.
  const busy = hasActive(items);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers read this; current ones show their own text.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const value = useMemo<Uploads>(
    () => ({ items, summary, enqueue, retry, cancel, dismiss }),
    [items, summary, enqueue, retry, cancel, dismiss],
  );

  return (
    <UploadsContext.Provider value={value}>
      {children}
      {mounted ? (
        <UploadTray
          items={items}
          onCancel={cancel}
          onRetry={retry}
          onDismiss={dismiss}
          onPausedChange={setPaused}
          leaving={leaving}
        />
      ) : null}
    </UploadsContext.Provider>
  );
}
