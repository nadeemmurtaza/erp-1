'use client';

import { type ReactNode, useState } from 'react';
import { cn } from '@/utils/cn';

export interface WizardStep {
  id: string;
  label: string;
  content: ReactNode;
  /** Whether the user may leave this step going forward. */
  isValid: boolean;
}

interface WizardProps {
  steps: WizardStep[];
  onSubmit: () => void | Promise<void>;
  submitLabel: string;
  submitBusy?: boolean;
  submitDisabled?: boolean;
  error?: ReactNode;
  /** Tailwind classes for the current step's indicator and the primary button. */
  accentClassName?: string;
  backLabel?: string;
  nextLabel?: string;
}

/**
 * A form split into small, single-purpose steps instead of one long page.
 *
 * Deliberately un-opinionated about field styling — callers own each step's
 * markup entirely — so the same shell serves the storefront's `sf-*` classes
 * and admin's `field-*` classes alike. Steps already visited stay clickable
 * (you may jump back to fix something); a step ahead of the furthest one
 * reached does not, since its content may depend on an earlier answer.
 */
export function Wizard({
  steps,
  onSubmit,
  submitLabel,
  submitBusy,
  submitDisabled,
  error,
  accentClassName = 'bg-neutral-900 text-white',
  backLabel = 'Back',
  nextLabel = 'Next',
}: WizardProps) {
  const [index, setIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);

  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;

  function goNext() {
    if (!step!.isValid) return;
    setIndex((current) => {
      const next = Math.min(current + 1, steps.length - 1);
      setFurthest((f) => Math.max(f, next));
      return next;
    });
  }

  function goBack() {
    setIndex((current) => Math.max(current - 1, 0));
  }

  function goTo(target: number) {
    if (target <= furthest) setIndex(target);
  }

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm" role="tablist">
        {steps.map((s, i) => {
          const reachable = i <= furthest;
          const active = i === index;
          return (
            <li key={s.id} className="flex items-center">
              {i > 0 ? <span className="mx-1.5 h-px w-4 bg-zinc-200" aria-hidden /> : null}
              <button
                type="button"
                role="tab"
                aria-selected={active}
                disabled={!reachable}
                onClick={() => goTo(i)}
                className={cn(
                  'flex items-center gap-2 rounded px-3 py-1.5 transition-colors',
                  active
                    ? accentClassName
                    : reachable
                      ? 'text-zinc-600 hover:text-zinc-900'
                      : 'text-zinc-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    active ? 'bg-white/25' : 'border border-current',
                  )}
                >
                  {i + 1}
                </span>
                <span className="whitespace-nowrap font-medium">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-5">{step.content}</div>

      {error ? <div className="mt-4">{error}</div> : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        {index > 0 ? (
          <button type="button" onClick={goBack} className="text-sm font-medium underline underline-offset-2">
            {backLabel}
          </button>
        ) : (
          <span />
        )}

        {isLast ? (
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={submitDisabled || submitBusy || !step.isValid}
            className={cn('rounded px-6 py-2.5 text-sm font-semibold disabled:opacity-50', accentClassName)}
          >
            {submitBusy ? '…' : submitLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={!step.isValid}
            className={cn('rounded px-6 py-2.5 text-sm font-semibold disabled:opacity-50', accentClassName)}
          >
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
