'use client';

import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface DangerAction {
  id: string;
  /** The act, as a short heading: "Delete this brand". */
  title: string;
  /** What happens, and what does not, in plain words (`ACT-6`). */
  description: string;
  /** The control that does it: a `HoldToConfirm`, or a `Button variant="danger"` that opens a `ConfirmDialog`. */
  control: ReactNode;
}

/**
 * Where an object's destructive acts live (DNG-5).
 *
 * What it communicates: *these are the ones that cannot be taken back, and they
 * are kept together, apart, and at the end*. One bordered, labelled region at the
 * foot of the page, closed by default, with a closed state that says what is
 * inside ("Danger zone · 2 actions", `COG-5`): the acts are findable by anyone
 * who looks and never in the path of someone who does not. Last position keeps
 * them off the happy path (`COG-11`, `ACT-2`), and the red edge is the only red
 * the zone spends at rest (DNG-4).
 *
 * It is the one place a page's destructive controls go. The control inside each
 * row is the caller's: a hold for the middle tier, a button that opens the
 * typed-name dialog for the top one (`ACT-6`), or the `CooldownBanner`'s
 * Restore after one has been scheduled.
 *
 * The rows stay mounted while it is closed and are hidden with `hidden`, as
 * `Disclosure` does, so find-in-page still reaches them. It renders nothing when
 * there is nothing to put in it: a person without the permission to do any of
 * these acts is not shown an empty red box (`PRM-5`).
 */
export function DangerZone({
  actions,
  title = 'Danger zone',
  className,
}: {
  actions: readonly DangerAction[];
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (actions.length === 0) return null;

  return (
    <section aria-label={title} className={cn('rounded-lg border border-red-600/40', className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start text-sm font-medium text-red-700"
      >
        <span>
          {title}{' '}
          <span className="font-normal text-neutral-900/60">
            · {actions.length} {actions.length === 1 ? 'action' : 'actions'}
          </span>
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={cn('shrink-0 transition-transform duration-normal ease-settle', open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <ul
        id={bodyId}
        hidden={!open}
        className="m-0 animate-rise list-none divide-y divide-neutral-100 border-t border-neutral-100 p-0"
      >
        {actions.map((action) => (
          <li
            key={action.id}
            className="flex flex-col gap-3 px-4 py-4 fold:flex-row fold:items-center fold:justify-between fold:gap-6"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-neutral-900">{action.title}</h3>
              <p className="mt-1 text-sm text-neutral-900/60">{action.description}</p>
            </div>
            <div className="shrink-0">{action.control}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
