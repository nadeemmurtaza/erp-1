'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface MetricItem {
  key: string;
  /** The eyebrow. Two or three words — "Bounce rate", not a sentence. */
  label: ReactNode;
  value: ReactNode;
  /** Movement against the previous period. */
  delta?: {
    label: ReactNode;
    /** Which way is good. A falling bounce rate is an improvement. */
    direction: 'up' | 'down' | 'flat';
  };
  /**
   * What this figure is made of, revealed below the strip when it is chosen.
   *
   * Giving a metric a detail turns the whole strip into a set of controls:
   * the figure stops being a label and becomes the way into its own workings.
   */
  detail?: ReactNode;
}

/**
 * A row of figures with no boxes in it, and a drawer underneath.
 *
 * The dashboard drew each KPI as its own bordered card, which is how it
 * reached twelve cards: once a figure is a card, adding a figure means adding
 * a card, and nothing ever argues for taking one away. Here the cells butt
 * against each other, the strip carries one background, and the leading cell
 * is lifted out by being white rather than by being outlined. Four numbers
 * read as one instrument instead of four competing objects.
 *
 * When items carry a `detail`, the cells become buttons and one panel opens
 * beneath the strip. That is the whole point: several screens' worth of
 * breakdown live on one page, each a single click away and none of it on
 * screen until asked for. It is also what kills the dead space — a chart
 * that only exists once you have asked for it cannot leave a hole in the
 * layout when you have not.
 *
 * Nothing is open on load, deliberately. "Overview first, detail on click"
 * means the page opens on the summary; a panel that springs open by itself
 * is the page deciding for the reader.
 */
export function MetricStrip({
  items,
  lead,
  label,
  className,
}: {
  items: MetricItem[];
  /** Key of the highlighted figure. Defaults to the first. */
  lead?: string;
  /** Names the group for screen readers — "Traffic summary", say. */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();

  if (items.length === 0) return null;

  const leadKey = lead ?? items[0].key;
  const interactive = items.some((item) => item.detail != null);
  const active = items.find((item) => item.key === open && item.detail != null);

  return (
    <div className={className}>
      <div aria-label={label} role="group" className="metric-strip">
        {items.map((item) => {
          const expanded = item.key === open;
          const body = (
            <>
              <span className="eyebrow flex items-center gap-1.5">
                {item.label}
                {item.detail ? (
                  <Chevron
                    className={cn(
                      'transition-transform duration-normal ease-settle',
                      expanded && '-rotate-180',
                    )}
                  />
                ) : null}
              </span>
              <span className="metric-value">{item.value}</span>
              {item.delta ? (
                <span
                  className={cn(
                    'metric-delta',
                    item.delta.direction === 'up' && 'metric-up',
                    item.delta.direction === 'down' && 'metric-down',
                    item.delta.direction === 'flat' && 'text-neutral-900/60',
                  )}
                >
                  {item.delta.label}
                </span>
              ) : null}
            </>
          );

          // A figure with nothing behind it stays a figure, not a dead button.
          if (!item.detail) {
            return (
              <div
                key={item.key}
                className={cn('metric', item.key === leadKey && !interactive && 'metric-lead')}
              >
                {body}
              </div>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              aria-expanded={expanded}
              aria-controls={`${id}-panel`}
              onClick={() => setOpen(expanded ? null : item.key)}
              className={cn('metric metric-button', expanded && 'metric-open')}
            >
              {body}
            </button>
          );
        })}
      </div>

      {/*
       * One panel for the whole strip rather than one per cell: the detail
       * replaces itself in place, so choosing a different figure does not
       * move the page under the reader's cursor.
       */}
      <div id={`${id}-panel`} hidden={!active}>
        {active ? <div className="metric-panel animate-rise">{active.detail}</div> : null}
      </div>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn('h-3 w-3 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}
