'use client';

import Link from 'next/link';
import { cn } from '@/utils/cn';

export interface ScopeChip {
  id: string;
  label: string;
  href: string;
}

/**
 * The scope switcher for the three-level admin shell (RETAIL-ERP.md R19,
 * WO-18.5) — brand chips over the org dashboard, branch chips over a brand
 * dashboard, nothing at all over a branch dashboard (`chips` is simply
 * empty there; the caller renders nothing rather than this component with
 * no items, so there is no empty bar to explain).
 *
 * A leftmost "All" chip is the combined view and the default — same
 * segmented-control visual language as `range-picker.tsx`, horizontally
 * scrollable so it survives forty branches without a redesign (R19's own
 * requirement, "worth fixing in the design rather than discovering at
 * branch twelve") — typeahead overflow and pinned favourites are that
 * design's next increment, not attempted here with zero real deployments
 * to size it against.
 */
export function ScopeChips({
  chips,
  activeId,
  allHref,
  label = 'Scope',
}: {
  chips: ScopeChip[];
  /** null/undefined when "All" is selected. */
  activeId?: string | null;
  allHref: string;
  label?: string;
}) {
  if (chips.length === 0) return null;

  return (
    <div
      className="no-scrollbar mb-6 flex gap-1 overflow-x-auto border-b border-neutral-100 pb-px"
      role="group"
      aria-label={label}
    >
      <Chip label="All" href={allHref} active={!activeId} />
      {chips.map((chip) => (
        <Chip key={chip.id} label={chip.label} href={chip.href} active={chip.id === activeId} />
      ))}
    </div>
  );
}

function Chip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'shrink-0 whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-white'
          : 'text-neutral-900/60 hover:bg-neutral-50 hover:text-neutral-900',
      )}
    >
      {label}
    </Link>
  );
}
