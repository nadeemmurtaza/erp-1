'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { isUploadAbort } from '@/lib/upload-client';
import { checkFiles, refusalMessage, type Refusal, type UploadRules } from '@/lib/upload';
import {
  EMPTY_UPLOADS,
  PROGRESS_INTERVAL_MS,
  TICK_MS,
  activeCount,
  startable,
  summarize,
  uploadReducer,
  type UploadEntry,
  type UploadItem,
  type UploadSummary,
} from '@/lib/upload-queue';

/** What `send` is given for one file: a signal that aborts it, and a way to say how far it has got. */
export interface UploadContext {
  signal: AbortSignal;
  /** Bytes of the request sent and the request's total, or 0 when the total is unknown. */
  onProgress: (loaded: number, total: number) => void;
}

/** Sends one file. Rejects to fail its lane; rejecting with an `AbortError` is a cancel and never shows as a failure. */
export type UploadSend<R = unknown> = (file: File, context: UploadContext) => Promise<R>;

export interface EnqueueOptions<R = unknown> {
  /** Checked again here, at the queue, so a caller that skipped the drop zone still cannot start a file the rules refuse. */
  rules: UploadRules;
  send: UploadSend<R>;
  /** Called once per file when it lands, with what `send` resolved to. */
  onDone?: (result: R, file: File) => void;
}

export interface EnqueueResult {
  /** The lanes created, in order, for the files that passed the checks. */
  ids: string[];
  refusals: Refusal<File>[];
}

interface Job {
  file: File;
  send: UploadSend<unknown>;
  onDone?: (result: unknown, file: File) => void;
  controller: AbortController | null;
}

/**
 * Runs an upload queue: the reducer's lanes plus the requests behind them.
 *
 * It owns what a pure reducer cannot: the `File`s, the `AbortController`s and
 * the clock. It starts lanes under the concurrency rule (`startable`), turns a
 * resolved `send` into `done` and a rejected one into `failed`, and keeps a
 * lane's file until it lands so Retry can send it again. Time reaches the
 * reducer only as `now` on an action, read here and nowhere else.
 *
 * It aborts its transfers when it unmounts, because it owns them. A page never
 * mounts it for a transfer that should outlive the page: the admin shell mounts
 * one through `UploadProvider`, and pages enqueue through `useUploads()`, so
 * navigating between pages aborts nothing (UPL-6).
 */
export function useUploadQueue() {
  const [items, dispatch] = useReducer(uploadReducer, EMPTY_UPLOADS);
  const jobs = useRef(new Map<string, Job>());
  /** Lanes already handed to `send`, so a render that sees a lane still `queued` cannot start it twice. */
  const launched = useRef(new Set<string>());
  const latest = useRef<readonly UploadItem[]>(items);
  const sequence = useRef(0);

  useEffect(() => {
    latest.current = items;
  }, [items]);

  const launch = useCallback(async (id: string, job: Job) => {
    const controller = new AbortController();
    job.controller = controller;
    // Only clear the controller if it is still this run's: a Retry may already have started the next one.
    const release = () => {
      if (job.controller === controller) job.controller = null;
    };
    let lastReport = Number.NEGATIVE_INFINITY;
    let result: unknown;
    try {
      result = await job.send(job.file, {
        signal: controller.signal,
        onProgress: (loaded, total) => {
          const now = Date.now();
          const complete = total > 0 && loaded >= total;
          // Reports come about every 50 ms; the queue takes them four times a second, and always the last.
          if (!complete && now - lastReport < PROGRESS_INTERVAL_MS) return;
          lastReport = now;
          dispatch({ type: 'progress', id, loaded, total, now });
        },
      });
    } catch (error) {
      release();
      // A cancel already moved its own lane; reporting it as a failure would undo the person's choice.
      if (controller.signal.aborted || isUploadAbort(error)) return;
      dispatch({
        type: 'fail',
        id,
        message: error instanceof Error && error.message ? error.message : 'The upload failed. Try again.',
      });
      return;
    }
    release();
    dispatch({ type: 'done', id });
    jobs.current.delete(id);
    // Outside the try: a caller's own error in `onDone` is its bug to see, not this upload's failure.
    job.onDone?.(result, job.file);
  }, []);

  // Start whatever the concurrency rule has room for, whenever the lanes change.
  useEffect(() => {
    for (const id of startable(items)) {
      const job = jobs.current.get(id);
      if (!job || launched.current.has(id)) continue;
      launched.current.add(id);
      dispatch({ type: 'start', id, now: Date.now() });
      void launch(id, job);
    }
  }, [items, launch]);

  // A lane that has left the queue (cleared) no longer needs its file.
  useEffect(() => {
    const present = new Set(items.map((item) => item.id));
    for (const id of Array.from(jobs.current.keys())) {
      if (present.has(id)) continue;
      jobs.current.delete(id);
      launched.current.delete(id);
    }
  }, [items]);

  // Re-measure a transfer that has gone quiet, so the speed falls as the bar stops.
  const uploading = items.some((item) => item.status === 'uploading');
  useEffect(() => {
    if (!uploading) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [uploading]);

  useEffect(() => {
    const running = jobs.current;
    return () => {
      for (const job of running.values()) job.controller?.abort();
    };
  }, []);

  const enqueue = useCallback(<R>(files: readonly File[], options: EnqueueOptions<R>): EnqueueResult => {
    const checks = checkFiles(files, options.rules, activeCount(latest.current));
    const entries: UploadEntry[] = [];
    const ids: string[] = [];
    const refusals: Refusal<File>[] = [];

    files.forEach((file, index) => {
      sequence.current += 1;
      const id = `upload-${sequence.current}`;
      const check = checks[index]!;
      if (check.ok) {
        entries.push({ id, name: file.name, size: file.size });
        ids.push(id);
        jobs.current.set(id, {
          file,
          send: options.send as UploadSend<unknown>,
          onDone: options.onDone as Job['onDone'],
          controller: null,
        });
      } else {
        // The refusal is kept as a lane as well as returned, so a caller that renders nothing still shows the person why.
        refusals.push({ file, code: check.code, reason: check.reason, remedy: check.remedy });
        entries.push({ id, name: file.name, size: file.size, refusal: refusalMessage(check) });
      }
    });

    dispatch({ type: 'add', entries });
    return { ids, refusals };
  }, []);

  const retry = useCallback((id: string) => {
    launched.current.delete(id);
    dispatch({ type: 'retry', id });
  }, []);

  const cancel = useCallback((id: string) => {
    jobs.current.get(id)?.controller?.abort();
    dispatch({ type: 'cancel', id });
  }, []);

  const clearDone = useCallback(() => dispatch({ type: 'clear', scope: 'done' }), []);
  /** Clears everything that has stopped; a lane still going stays. */
  const clearSettled = useCallback(() => dispatch({ type: 'clear', scope: 'settled' }), []);

  const summary: UploadSummary = useMemo(() => summarize(items), [items]);

  return { items, summary, enqueue, retry, cancel, clearDone, clearSettled };
}

export type UploadQueue = ReturnType<typeof useUploadQueue>;
