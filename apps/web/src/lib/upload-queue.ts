import { formatNumber } from '@newax/shared';

/**
 * The upload queue as a pure state machine (UPL-2, UPL-5, UPL-6).
 *
 * Every file is its own lane: `queued -> uploading -> done | failed | canceled`,
 * plus `rejected`, a file the checks refused that never starts. A lane changes
 * state alone, so one failure never blocks the others and a retry touches
 * nothing but its own row. The reducer holds data only (no `File`, no timer, no
 * request): `useUploadQueue` owns those and tells the reducer what happened.
 *
 * Time is never read in here. Every action that needs a moment carries `now`
 * (ms), so a spec drives the clock by hand and the speed and the time left are
 * deterministic.
 */

/**
 * At most this many uploads are in flight; the rest wait their turn.
 *
 * Browsers allow 6 connections per origin over HTTP/1.1. Three leaves the other
 * three for the app's own requests, so a page the operator is still using does
 * not stall behind a batch of photographs (UPL-6: never block the app), while
 * still overlapping enough transfers to use a fast link.
 */
export const MAX_CONCURRENT_UPLOADS = 3;

/** The speed is measured over the last 3 000 ms of samples: long enough to smooth a bursty link, short enough to follow a real change. */
export const SPEED_WINDOW_MS = 3000;

/** The time left is shown only once the samples span this long: under a second, the figure is a guess (UPL-2). */
export const ETA_MIN_SAMPLE_MS = 1000;

/**
 * How long the tray stays after everything succeeded. It is the toast default
 * (`useToast`'s `duration = 4000`): a confirmation lives as long as every other
 * one in the product. A failure never hides on a timer.
 */
export const TRAY_HIDE_MS = 4000;

/**
 * The most often one lane's progress is passed to the queue: 250 ms, four times a second.
 * A browser reports upload progress about every 50 ms, and every report re-renders
 * the tray and each page reading `useUploads()` (a table of expenses among them).
 * Four a second still glides, because the bar eases over the 220 ms `normal` token
 * between samples, and costs a fifth of the renders. The last report (every byte
 * sent) always goes through, so a lane never sits short of what it sent.
 */
export const PROGRESS_INTERVAL_MS = 250;

/**
 * How often a transfer that has gone quiet is re-measured. A stalled link sends
 * no progress, so without a tick the speed would freeze at its last good value
 * instead of falling to zero as the bar stops (UPL-2: they stop together).
 */
export const TICK_MS = 1000;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'canceled' | 'rejected';

interface Sample {
  at: number;
  loaded: number;
}

export interface UploadItem {
  id: string;
  name: string;
  /** The file's size in bytes. */
  size: number;
  status: UploadStatus;
  /** Bytes of the request body sent so far. */
  loaded: number;
  /** Bytes of the request body: the file plus the form around it once the browser reports it, the file's own size until then. */
  total: number;
  /**
   * Whether the browser has reported a measurable total. A transfer that never
   * does says "Uploading" and draws no number (UPL-2, COG-10).
   */
  measured: boolean;
  /** Bytes per second over the last `SPEED_WINDOW_MS`; 0 until two samples. */
  speed: number;
  /** Seconds left, or null until there is at least `ETA_MIN_SAMPLE_MS` of samples and a speed. */
  eta: number | null;
  /** Why it failed or was refused, in words for the person; null otherwise. */
  error: string | null;
  /** How many times this lane has been started over by Retry. */
  retries: number;
  samples: readonly Sample[];
}

export type UploadState = readonly UploadItem[];

export const EMPTY_UPLOADS: UploadState = [];

export interface UploadEntry {
  id: string;
  name: string;
  size: number;
  /** Set when the checks refused the file: it becomes a `rejected` lane carrying this sentence and never starts. */
  refusal?: string;
}

export type UploadAction =
  | { type: 'add'; entries: readonly UploadEntry[] }
  | { type: 'start'; id: string; now: number }
  | { type: 'progress'; id: string; loaded: number; total: number; now: number }
  | { type: 'tick'; now: number }
  | { type: 'done'; id: string }
  | { type: 'fail'; id: string; message: string }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'clear'; scope: 'done' | 'settled' };

const isActive = (item: UploadItem) => item.status === 'queued' || item.status === 'uploading';

/** Replace one lane and leave every other object where it is. */
function patch(state: UploadState, id: string, change: (item: UploadItem) => UploadItem): UploadState {
  let touched = false;
  const next = state.map((item) => {
    if (item.id !== id) return item;
    const changed = change(item);
    if (changed !== item) touched = true;
    return changed;
  });
  return touched ? next : state;
}

/**
 * Speed and time left as of `now`, from the samples inside the window.
 *
 * The span runs from the oldest sample still in the window to `now`, not to the
 * newest sample, so a link that has gone quiet reads slower with every tick and
 * reaches zero when the window empties, never stuck at its last burst.
 */
function measure(item: UploadItem, samples: readonly Sample[], loaded: number, now: number): UploadItem {
  const inWindow = samples.filter((sample) => now - sample.at <= SPEED_WINDOW_MS);
  const first = inWindow[0];
  const span = first ? now - first.at : 0;
  const speed = first && span > 0 ? Math.max(0, ((loaded - first.loaded) / span) * 1000) : 0;
  const remaining = item.total - loaded;
  const eta = item.measured && span >= ETA_MIN_SAMPLE_MS && speed > 0 && remaining > 0 ? remaining / speed : null;
  return { ...item, samples: inWindow, loaded, speed, eta };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'add': {
      const added = action.entries.map((entry): UploadItem => ({
        id: entry.id,
        name: entry.name,
        size: entry.size,
        status: entry.refusal === undefined ? 'queued' : 'rejected',
        loaded: 0,
        total: entry.size,
        measured: false,
        speed: 0,
        eta: null,
        error: entry.refusal ?? null,
        retries: 0,
        samples: [],
      }));
      return added.length === 0 ? state : [...state, ...added];
    }

    case 'start': {
      // The cap is enforced here as well as by `startable`, so no caller can exceed it.
      const uploading = state.filter((item) => item.status === 'uploading').length;
      if (uploading >= MAX_CONCURRENT_UPLOADS) return state;
      return patch(state, action.id, (item) =>
        item.status === 'queued' ? { ...item, status: 'uploading', samples: [{ at: action.now, loaded: 0 }] } : item,
      );
    }

    case 'progress':
      return patch(state, action.id, (item) => {
        // A late event from a request that was canceled or has finished is not news.
        if (item.status !== 'uploading') return item;
        const known = Number.isFinite(action.total) && action.total > 0;
        const total = known ? action.total : item.total;
        const loaded = clamp(Number.isFinite(action.loaded) ? action.loaded : 0, 0, total);
        const last = item.samples[item.samples.length - 1];
        // A request that starts over (the body is sent again after a token refresh) reports less than before; the old samples describe a transfer that no longer exists.
        const samples = last && loaded < last.loaded ? [] : item.samples;
        const base: UploadItem = { ...item, total, measured: item.measured || known };
        return measure(base, [...samples, { at: action.now, loaded }], loaded, action.now);
      });

    case 'tick': {
      let touched = false;
      const next = state.map((item) => {
        if (item.status !== 'uploading') return item;
        const measured = measure(item, item.samples, item.loaded, action.now);
        // Nothing to repaint while the figures are where they were.
        if (
          measured.speed === item.speed &&
          measured.eta === item.eta &&
          measured.samples.length === item.samples.length
        ) {
          return item;
        }
        touched = true;
        return measured;
      });
      return touched ? next : state;
    }

    case 'done':
      // A cancel can lose the race with the last byte: the file did land, so the lane says so.
      return patch(state, action.id, (item) =>
        item.status === 'uploading' || item.status === 'canceled'
          ? { ...item, status: 'done', loaded: item.total, speed: 0, eta: null, error: null, samples: [] }
          : item,
      );

    case 'fail':
      return patch(state, action.id, (item) =>
        item.status === 'uploading'
          ? { ...item, status: 'failed', speed: 0, eta: null, error: action.message, samples: [] }
          : item,
      );

    case 'cancel':
      return patch(state, action.id, (item) =>
        isActive(item) ? { ...item, status: 'canceled', speed: 0, eta: null, error: null, samples: [] } : item,
      );

    case 'retry':
      // One lane back to the start (UPL-5). A refused file has nothing to retry: it needs a different file.
      return patch(state, action.id, (item) =>
        item.status === 'failed' || item.status === 'canceled'
          ? {
              ...item,
              status: 'queued',
              loaded: 0,
              total: item.size,
              measured: false,
              speed: 0,
              eta: null,
              error: null,
              retries: item.retries + 1,
              samples: [],
            }
          : item,
      );

    case 'clear': {
      const keep =
        action.scope === 'done'
          ? (item: UploadItem) => item.status !== 'done'
          : // Everything that has stopped; what is still going is never cleared by a dismiss.
            (item: UploadItem) => isActive(item);
      const next = state.filter(keep);
      return next.length === state.length ? state : next;
    }
  }
}

/**
 * The lanes to start now, oldest first: as many queued ones as there is room
 * for under `MAX_CONCURRENT_UPLOADS`. Lanes never reorder, so the queue is
 * served in the order the files were added.
 */
export function startable(state: UploadState): string[] {
  const room = MAX_CONCURRENT_UPLOADS - state.filter((item) => item.status === 'uploading').length;
  if (room <= 0) return [];
  return state
    .filter((item) => item.status === 'queued')
    .slice(0, room)
    .map((item) => item.id);
}

/** Whether anything is waiting or in flight. */
export function hasActive(state: UploadState): boolean {
  return state.some(isActive);
}

/** How many lanes hold a place (the count limit's `alreadyQueued`): waiting or in flight. */
export function activeCount(state: UploadState): number {
  return state.filter(isActive).length;
}

/** Everything went through: the one outcome that hides the tray by itself. */
export function allSucceeded(state: UploadState): boolean {
  return state.length > 0 && state.every((item) => item.status === 'done');
}

/**
 * Whole percent of the request body sent. Floored and held at 99 until the
 * lane is done, so a bar that has sent every byte but is waiting for the server
 * (a photograph being converted) never claims to be finished.
 */
export function percentOf(item: UploadItem): number {
  if (item.status === 'done') return 100;
  if (!item.measured || item.total <= 0) return 0;
  return Math.min(99, Math.floor((item.loaded / item.total) * 100));
}

/** Every byte is sent and the lane waits on the server's answer. */
export function isProcessing(item: UploadItem): boolean {
  return item.status === 'uploading' && item.measured && item.loaded >= item.total;
}

export type SummaryTone = 'neutral' | 'positive' | 'negative';

export interface UploadSummary {
  text: string;
  tone: SummaryTone;
  total: number;
  done: number;
  failed: number;
  canceled: number;
  refused: number;
  active: number;
}

const count = (state: UploadState, status: UploadStatus) => state.filter((item) => item.status === status).length;

/**
 * The tray's one line, in numbers and never "an error occurred" (UPL-5):
 *
 *   - "Uploading 3 files"   everything is still waiting or going, nothing has landed
 *   - "2 of 5 · 1 failed"   some landed; the rest are going, failed, canceled or refused
 *   - "5 uploaded"          all of them landed
 *
 * `tone` is `negative` while any lane failed or was refused, `positive` once all
 * landed, otherwise `neutral`; the words say the same, so it is never colour alone.
 */
export function summarize(state: UploadState): UploadSummary {
  const total = state.length;
  const done = count(state, 'done');
  const failed = count(state, 'failed');
  const canceled = count(state, 'canceled');
  const refused = count(state, 'rejected');
  const active = activeCount(state);
  const base = { total, done, failed, canceled, refused, active };

  if (total === 0) return { ...base, text: '', tone: 'neutral' };
  if (done === total) return { ...base, text: `${formatNumber(done)} uploaded`, tone: 'positive' };

  const problems = [
    failed > 0 ? `${formatNumber(failed)} failed` : null,
    canceled > 0 ? `${formatNumber(canceled)} canceled` : null,
    refused > 0 ? `${formatNumber(refused)} refused` : null,
  ].filter((part): part is string => part !== null);

  const tone: SummaryTone = failed > 0 || refused > 0 ? 'negative' : 'neutral';

  if (active > 0 && done === 0 && problems.length === 0) {
    return { ...base, text: `Uploading ${formatNumber(active)} ${active === 1 ? 'file' : 'files'}`, tone };
  }
  return { ...base, text: [`${formatNumber(done)} of ${formatNumber(total)}`, ...problems].join(' · '), tone };
}

/**
 * What a screen reader is told, and only when the batch has an outcome: never a
 * percentage (UPL-6). Empty while anything is still going, so a polite live
 * region holding this speaks once when the last lane settles and not before.
 */
export function outcomeAnnouncement(state: UploadState): string {
  if (state.length === 0 || hasActive(state)) return '';
  const { done, failed, canceled, refused, total } = summarize(state);
  if (done === total) return total === 1 ? 'Upload finished.' : `All ${formatNumber(total)} uploads finished.`;
  const parts = [`${formatNumber(done)} of ${formatNumber(total)} uploaded`];
  if (failed > 0) parts.push(`${formatNumber(failed)} failed`);
  if (canceled > 0) parts.push(`${formatNumber(canceled)} canceled`);
  if (refused > 0) parts.push(`${formatNumber(refused)} refused`);
  return `Uploads finished: ${parts.join(', ')}.`;
}
