import type { ReactNode } from 'react';
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
}

/**
 * A row of figures with no boxes in it.
 *
 * The dashboard drew each KPI as its own bordered card, which is how it
 * reached twelve cards: once a figure is a card, adding a figure means
 * adding a card, and nothing ever argues for taking one away. Here the cells
 * butt against each other, the strip carries one background, and the leading
 * cell is lifted out by being white rather than by being outlined. Four
 * numbers read as one instrument instead of four competing objects.
 *
 * The separation is done by size — `type.metric` is 40px against an 11px
 * label — which is the trade the whole quiet-chrome idea rests on: spend on
 * hierarchy, not on borders.
 *
 * `lead` is the figure the page is actually about. It defaults to the first,
 * because a strip whose every cell is equal is a strip with no answer to
 * "what am I looking at?".
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
  if (items.length === 0) return null;
  const leadKey = lead ?? items[0].key;

  return (
    <dl aria-label={label} className={cn('metric-strip', className)}>
      {items.map((item) => (
        <div
          key={item.key}
          className={cn('metric', item.key === leadKey && 'metric-lead')}
        >
          <dt className="eyebrow">{item.label}</dt>
          <dd>
            <span className="metric-value">{item.value}</span>
            {item.delta ? (
              <span
                className={cn(
                  'metric-delta',
                  item.delta.direction === 'up' && 'metric-up',
                  item.delta.direction === 'down' && 'metric-down',
                  item.delta.direction === 'flat' && 'text-neutral-900/50',
                )}
              >
                {item.delta.label}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
