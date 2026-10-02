'use client';

import { useId, useState, type FocusEvent } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert, X } from 'lucide-react';
import { formatBytes, formatNumber } from '@newax/shared';
import { cn } from '@/utils/cn';
import { DrawIcon } from '@/components/ui/draw-icon';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SwapText } from '@/components/ui/swap-text';
import { TruncateReveal } from '@/components/ui/truncate-reveal';
import { formatEta, formatSpeed } from '@/lib/upload';
import {
  hasActive,
  isProcessing,
  outcomeAnnouncement,
  percentOf,
  summarize,
  type UploadItem,
} from '@/lib/upload-queue';

/** The words a lane says about itself, and the bar's spoken value. Percentages live here and only here: the live region never says one. */
function describeLane(item: UploadItem): { line: string; spoken: string } {
  switch (item.status) {
    case 'queued':
      return { line: 'Waiting', spoken: 'Waiting' };
    case 'uploading': {
      // A transfer that cannot report a total says "Uploading" and draws no number (UPL-2).
      if (!item.measured) return { line: 'Uploading', spoken: 'Uploading' };
      if (isProcessing(item)) return { line: `Processing · ${formatBytes(item.total)}`, spoken: 'Processing' };
      const percent = `${formatNumber(percentOf(item))}%`;
      const sizes = `${formatBytes(item.loaded)} of ${formatBytes(item.total)}`;
      const parts = [percent, sizes, formatSpeed(item.speed)];
      if (item.eta !== null) parts.push(`${formatEta(item.eta)} left`);
      return { line: parts.join(' · '), spoken: `${percent}, ${sizes}` };
    }
    case 'done':
      return { line: `Uploaded · ${formatBytes(item.size)}`, spoken: 'Uploaded' };
    case 'failed':
      return { line: `Failed. ${item.error ?? ''}`.trim(), spoken: 'Failed' };
    case 'canceled':
      return { line: 'Canceled', spoken: 'Canceled' };
    case 'rejected':
      return { line: item.error ?? 'Refused', spoken: 'Refused' };
  }
}

function Lane({
  item,
  onCancel,
  onRetry,
}: {
  item: UploadItem;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const { line, spoken } = describeLane(item);
  const bad = item.status === 'failed' || item.status === 'rejected';

  return (
    <li className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium text-neutral-900">
          <TruncateReveal text={item.name} />
        </span>
        {item.status === 'queued' || item.status === 'uploading' ? (
          <button
            type="button"
            className="btn-text shrink-0"
            aria-label={`Cancel ${item.name}`}
            onClick={() => onCancel(item.id)}
          >
            Cancel
          </button>
        ) : null}
        {item.status === 'failed' || item.status === 'canceled' ? (
          <button
            type="button"
            className="btn-text shrink-0"
            aria-label={`Retry ${item.name}`}
            onClick={() => onRetry(item.id)}
          >
            Retry
          </button>
        ) : null}
      </div>
      {item.status === 'rejected' ? null : (
        <ProgressBar
          className="mt-1"
          label={`${item.name} upload`}
          value={percentOf(item)}
          valueText={spoken}
          tone={item.status === 'done' ? 'positive' : item.status === 'failed' ? 'negative' : undefined}
        />
      )}
      <p
        className={cn('mt-1 flex items-start gap-1.5 text-xs', bad ? 'text-feedback-negative' : 'text-neutral-900/70')}
      >
        {item.status === 'done' ? (
          <span className="text-feedback-positive">
            <DrawIcon>
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
            </DrawIcon>
          </span>
        ) : null}
        {item.status === 'uploading' && !item.measured ? <span aria-hidden="true" className="spinner mt-px" /> : null}
        {bad ? <CircleAlert aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" /> : null}
        <span className="min-w-0 tabular-nums">{line}</span>
      </p>
    </li>
  );
}

/**
 * The docked list of transfers: one lane per file, summary on top (UPL-5, UPL-6).
 *
 * It is a region, not a dialog. It has no backdrop, no focus trap and no scroll
 * lock, so the page behind it stays fully usable while files go up: a 48 MB
 * upload never puts a spinner over the order the operator came to read. It sits
 * in the corner (`end`, `bottom`) on the `dropdown` layer (`z-dropdown`): above
 * page content and its sticky bars, below the mobile navigation drawer and every
 * dialog, so anything that asks for the whole screen still gets it.
 *
 * Each lane is its own: a name, a bar (`ProgressBar`), what it is doing in
 * numbers (percent, bytes of total, speed, time left once there is a second of
 * samples to stand behind it), and its own **Cancel** while it is going or
 * **Retry** when it failed or was canceled, with the reason on the lane. Lanes
 * keep their place and never reorder, so a failed row stays where the eye left
 * it. The header is the summary from `summarize` ("2 of 5 · 1 failed"), and the
 * tray collapses to that one line, which is all some pages can spare.
 *
 * The one live region announces only an outcome (`outcomeAnnouncement`: all
 * done, or what failed), never a percentage; it is always mounted, so the
 * change in its text is what a screen reader hears. Hovering or focusing the tray
 * reports `onPausedChange(true)`, so the provider does not hide it from under a
 * reader's pointer.
 *
 * `docked` false lays it out in the flow, for the design-system gallery and any
 * place that wants it inline; it is the same tray. `leaving` plays the exit while
 * the caller keeps it mounted (`useExitTransition`).
 */
export function UploadTray({
  items,
  onCancel,
  onRetry,
  onDismiss,
  onPausedChange,
  docked = true,
  leaving = false,
  className,
}: {
  items: readonly UploadItem[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  /** Clears what has stopped. Offered only while nothing is going; a lane in flight has its own Cancel. */
  onDismiss: () => void;
  onPausedChange?: (paused: boolean) => void;
  docked?: boolean;
  leaving?: boolean;
  className?: string;
}) {
  const listId = useId();
  const [collapsed, setCollapsed] = useState(false);
  const summary = summarize(items);
  const busy = hasActive(items);

  const leaveTray = (event: FocusEvent<HTMLDivElement>) => {
    // Focus moving between two controls inside the tray is not leaving it.
    if (!event.currentTarget.contains(event.relatedTarget)) onPausedChange?.(false);
  };

  return (
    <div
      role="region"
      aria-label="Uploads"
      onPointerEnter={() => onPausedChange?.(true)}
      onPointerLeave={() => onPausedChange?.(false)}
      onFocus={() => onPausedChange?.(true)}
      onBlur={leaveTray}
      className={cn(
        'min-w-0 rounded-lg bg-overlay shadow-overlay',
        docked
          ? 'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-4 z-dropdown w-[calc(100vw-2rem)] max-w-sm'
          : 'w-full max-w-sm',
        leaving ? 'pointer-events-none animate-leave' : 'animate-arrive',
        className,
      )}
    >
      <div className="flex items-center gap-1 ps-4 pe-1">
        <p
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 py-3 text-sm font-semibold tabular-nums',
            summary.tone === 'negative' ? 'text-feedback-negative' : 'text-neutral-900',
          )}
        >
          {summary.tone === 'positive' ? (
            <span className="text-feedback-positive">
              <DrawIcon>
                <Check aria-hidden="true" className="h-4 w-4" />
              </DrawIcon>
            </span>
          ) : null}
          {summary.tone === 'negative' ? <CircleAlert aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
          <span className="min-w-0">
            <SwapText value={summary.text} />
          </span>
        </p>
        <button
          type="button"
          className="inline-flex h-touch w-touch shrink-0 items-center justify-center text-neutral-900/70 hover:text-neutral-900 fold:h-9 fold:w-9"
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={collapsed ? 'Show uploads' : 'Collapse uploads'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
        {busy ? null : (
          <button
            type="button"
            className="inline-flex h-touch w-touch shrink-0 items-center justify-center text-neutral-900/70 hover:text-neutral-900 fold:h-9 fold:w-9"
            aria-label="Dismiss uploads"
            onClick={onDismiss}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>

      <div id={listId} hidden={collapsed}>
        <ul className="max-h-72 space-y-3 overflow-y-auto px-4 pb-4 pt-1">
          {items.map((item) => (
            <Lane key={item.id} item={item} onCancel={onCancel} onRetry={onRetry} />
          ))}
        </ul>
      </div>

      {/* Always mounted: a live region that arrives with its message is not announced reliably. */}
      <p role="status" className="sr-only">
        {outcomeAnnouncement(items)}
      </p>
    </div>
  );
}
