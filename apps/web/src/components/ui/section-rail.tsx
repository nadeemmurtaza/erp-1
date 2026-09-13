'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface RailSection {
  /** Used for the anchor and the rail link. Stable, url-safe. */
  id: string;
  label: ReactNode;
  /** A count, or a word like "New". Keep it to a few characters. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * A long object page with a rail to jump around it.
 *
 * This is the shape the audit's worst pages need. A garment has fifteen
 * fields and two charts; a design has eighteen; an email account has
 * eighteen more. Put them on one scroll and the reader hunts. Put them
 * behind tabs and the reader loses the sense that it is one object — and
 * anything they half-typed in another tab is gone, because Tabs renders only
 * the active panel.
 *
 * So: every section is present and mounted, generously spaced, each one
 * sparse enough to read at a glance; the rail down the side says what exists
 * and where you currently are. Nothing is hidden — hunting is what is
 * removed. That is the difference between this and `Tabs`, and the choice
 * between them is genuinely about the content: separate *tasks* are tabs,
 * one object's *parts* are a rail.
 *
 * Below `lg` the rail becomes a horizontal scroller above the content,
 * because a 200px column beside a 320px screen is not a layout. The
 * information architecture does not change — only the density does.
 */
export function SectionRail({
  sections,
  label,
  className,
}: {
  sections: RailSection[];
  /** Names the rail for screen readers — "Product sections", say. */
  label: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(sections[0]?.id);
  const refs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const nodes = [...refs.current.values()];
    if (nodes.length === 0) return;

    /*
     * The band is the top third of the viewport. An observer with the
     * default root reports every section that is merely *visible*, which on
     * a tall screen is three at once; narrowing it to a band means "the
     * section the reader is actually looking at" resolves to one, and it
     * changes when that section reaches the top rather than when the
     * previous one has fully left.
     */
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setCurrent(visible[0].target.id);
      },
      { rootMargin: '0px 0px -67% 0px', threshold: 0 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  function jump(event: React.MouseEvent, id: string) {
    event.preventDefault();
    const target = refs.current.get(id);
    if (!target) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });

    /*
     * Move focus as well as the viewport. Scrolling alone leaves a keyboard
     * user's focus back in the rail, so the next Tab returns them to the
     * next rail link rather than into the section they just chose.
     */
    target.focus({ preventScroll: true });
    setCurrent(id);
  }

  if (sections.length === 0) return null;

  return (
    <div className={cn('gap-10 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)]', className)}>
      <nav
        aria-label={label}
        className={cn(
          // Horizontal scroller on small screens, sticky column from lg.
          'mb-6 flex gap-1 overflow-x-auto border-b border-neutral-200 lg:mb-0 lg:block',
          'lg:self-start lg:border-b-0 lg:border-s lg:border-neutral-200 lg:ps-4',
          'lg:sticky lg:top-8',
        )}
      >
        {sections.map((section) => {
          const active = section.id === current;
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => jump(event, section.id)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2 whitespace-nowrap',
                // Underline below the rail, side-rule beside it.
                'nav-tab lg:nav-link lg:px-0 lg:ps-3',
                active && 'nav-tab-active lg:nav-link-active',
              )}
            >
              {section.label}
              {section.badge != null ? (
                <span className="text-2xs text-neutral-900/40">{section.badge}</span>
              ) : null}
            </a>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-12">
        {sections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            tabIndex={-1}
            // Clears the sticky rail when jumped to, and kills the focus ring
            // that would otherwise flash on a programmatic focus.
            className="scroll-mt-8 outline-none"
            ref={(node) => {
              if (node) refs.current.set(section.id, node);
              else refs.current.delete(section.id);
            }}
          >
            <h2 className="mb-4 text-lg font-medium text-neutral-900">{section.label}</h2>
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}
