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
 * and admin's `field-*` classes alike. A step arrives from the direction the
 * reader is going: forward rises into place, back drops into place. Steps already visited stay clickable
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
  accentClassName = 'bg-inverse text-on-inverse',
  backLabel = 'Back',
  nextLabel = 'Next',
}: WizardProps) {
  const [index, setIndex] = useState(0);
  const [furthest, setFurthest] = useState(0);
  // Which way the reader last moved, so the step that arrives comes from that side. Null until the first move: the opening step does not animate.
  const [direction, setDirection] = useState<'forward' | 'back' | null>(null);

  const step = steps[index];
  if (!step) return null;
  const isLast = index === steps.length - 1;

  function goNext() {
    if (!step!.isValid) return;
    setDirection('forward');
    setIndex((current) => {
      const next = Math.min(current + 1, steps.length - 1);
      setFurthest((f) => Math.max(f, next));
      return next;
    });
  }

  function goBack() {
    setDirection('back');
    setIndex((current) => Math.max(current - 1, 0));
  }

  function goTo(target: number) {
    if (target > furthest) return;
    setDirection(target > index ? 'forward' : 'back');
    setIndex(target);
  }

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm" role="tablist">
        {steps.map((s, i) => {
          const reachable = i <= furthest;
          const active = i === index;
          return (
            <li key={s.id} className="flex items-center">
              {i > 0 ? <span className="mx-1.5 h-px w-4 bg-neutral-200" aria-hidden /> : null}
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
                      ? 'text-neutral-600 hover:text-neutral-900'
                      : 'text-neutral-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    active ? 'bg-on-inverse/25' : 'border border-current',
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

      {/* Keyed by the step, so each arrives as its own element and plays the entrance from the side the reader is going. */}
      <div
        key={step.id}
        className={cn('mt-5', direction === 'forward' && 'step-forward', direction === 'back' && 'step-back')}
      >
        {step.content}
      </div>

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
