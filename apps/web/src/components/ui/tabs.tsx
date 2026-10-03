'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface TabItem {
  key: string;
  label: ReactNode;
  /** Shown after the label — a count, usually. Keep it to a few characters. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * Splits one page into several, without splitting the route.
 *
 * This is the tool for the pages the audit flagged: 638 lines and fifteen
 * fields on one, 673 and eighteen on another, six competing sections on the
 * order detail. Those are several tasks sharing a scroll position. Tabs give
 * each one the page it deserves while the object stays one object — which is
 * the point, because an order's payment and its fulfilment are the same
 * order, just not the same job.
 *
 * Only the active panel is rendered. That is deliberate and it is the
 * opposite of the choice Disclosure makes: a tab is a different *task*, so
 * there is nothing half-typed to preserve, and rendering four panels means
 * four tables' worth of work for the three nobody is looking at. If a tab
 * holds a form with unsaved input, warn before switching rather than keeping
 * it mounted.
 *
 * Arrow keys move between tabs, which is what the tablist role promises and
 * what anybody navigating by keyboard will try. The handler sits on the tab
 * buttons rather than on the tablist, because the tablist is not focusable —
 * a roving tabindex keeps focus on the tabs themselves (WAI-ARIA APG), so a
 * handler on the container is one that only ever fires by bubbling.
 *
 * The underline is one element that glides to the selected tab rather than
 * disappearing from one and appearing on another, because that is what tells
 * the reader it is the same strip and the same object (`05-motion.md`, Nav:
 * "a persistent indicator that moves"). It is positioned from measured
 * offsets, written straight to custom properties on the tablist so a tab change
 * costs no React render, and animated with transform only. Until it has
 * measured, and for anyone without scripting, the selected tab draws its own
 * underline, so the strip is right before the enhancement arrives.
 */
export function Tabs({
  items,
  initial,
  label,
  className,
}: {
  items: TabItem[];
  /** Defaults to the first tab. */
  initial?: string;
  /** Names the tablist for screen readers — "Order sections", say. */
  label: string;
  className?: string;
}) {
  const [active, setActive] = useState(initial ?? items[0]?.key);
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const placed = useRef(false);

  // Move the indicator under the selected tab. Imperative on purpose: these are
  // layout measurements being copied onto the element that shows them, not state.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!tab) return;
      list.style.setProperty('--tab-x', `${tab.offsetLeft}px`);
      list.style.setProperty('--tab-y', `${tab.offsetTop + tab.offsetHeight - 2}px`);
      list.style.setProperty('--tab-w', String(tab.offsetWidth));
      list.dataset.slide = 'ready';
      // The first placement is a jump, not a glide from the corner.
      if (!placed.current) {
        placed.current = true;
        requestAnimationFrame(() => {
          list.dataset.animate = 'true';
        });
      }
    };
    place();
    // A tab's width changes when a badge count changes or a font loads, and the
    // strip's own width changes with the window; the indicator follows both.
    const observer = new ResizeObserver(place);
    observer.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [active, items.length]);

  if (items.length === 0) return null;

  const index = Math.max(
    0,
    items.findIndex((item) => item.key === active),
  );

  function onKeyDown(event: React.KeyboardEvent) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + items.length) % items.length;
    setActive(items[next].key);
    document.getElementById(`${id}-tab-${items[next].key}`)?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        className="relative mb-6 flex flex-wrap gap-1 border-b border-neutral-100"
      >
        {items.map((item) => {
          const selected = item.key === items[index].key;
          return (
            <button
              key={item.key}
              id={`${id}-tab-${item.key}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${id}-panel-${item.key}`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => setActive(item.key)}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-accent text-accent-hover'
                  : 'border-transparent text-neutral-900/60 hover:text-neutral-900',
              )}
            >
              {item.label}
              {item.badge != null ? (
                <span className="text-xs text-neutral-900/60">{item.badge}</span>
              ) : null}
            </button>
          );
        })}
        <span aria-hidden="true" className="tab-indicator" />
      </div>

      <div
        id={`${id}-panel-${items[index].key}`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${items[index].key}`}
        tabIndex={0}
      >
        {items[index].content}
      </div>
    </div>
  );
}
