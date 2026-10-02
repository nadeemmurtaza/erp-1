'use client';

import { useEffect, useId, useRef, type ComponentType, type ReactNode } from 'react';
import NextLink from 'next/link';
import { Check, Circle, CircleDot } from 'lucide-react';
import { cn } from '@/utils/cn';
import { prefersReducedMotion, usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { BURST_TIMING, burstTravel, sparkKeyframes, type JourneyState } from '@/lib/success-state';
import { Button } from './button';
import { DrawIcon } from './draw-icon';

/**
 * One action on a success state. A destination (`href`) or an act (`onClick`),
 * never neither: a button that goes nowhere is the dead end this component
 * exists to prevent.
 */
export type SuccessAction = { label: string } & (
  { href: string; onClick?: () => void } | { href?: undefined; onClick: () => void }
);

/** The link the actions render as. `next/link` for the admin; the storefront passes its locale-aware `Link`. */
export type SuccessLink = ComponentType<{
  href: string;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}>;

/** One step of the standing thread (SUC-4) and where it stands. */
export interface SuccessStep {
  label: string;
  state: JourneyState;
}

export interface SuccessStateProps {
  /** SUC-1: what happened to which thing. "Invoice sent to Northwind Labs", never "Done". A node only to let a figure settle in (`ScrambleText`). */
  title: ReactNode;
  /** SUC-1: the proof, in the figures the reader would check. Amounts and dates through the shared formatters. */
  detail?: ReactNode;
  /** SUC-2: the loud button, to the thing that was made. Required: without it the component renders nothing. */
  primary: SuccessAction;
  /** SUC-2: the quiet repeat of the job ("Send another"). */
  secondary?: SuccessAction;
  /** SUC-2: the text link back to the list. */
  back?: { label: string; href: string };
  /**
   * SUC-4: the ONE thing still open, as an ordered list. Only a thread the system can follow: name the change
   * in the data that closes it before passing one. `labels` is the words for the three states, read by assistive
   * technology beside the icon (state is never colour alone, COL-2).
   */
  loop?: {
    steps: SuccessStep[];
    labels: Record<JourneyState, string>;
    /** The control that pulls the thread, e.g. "Notify me". */
    aside?: ReactNode;
  };
  /** SUC-3: short proof that the record left the product ("Receipt emailed"). Only what is true. */
  receipt?: string[];
  /**
   * SUC-5: one burst, once, for a milestone. Does nothing unless the caller says this IS a milestone, and a
   * caller may only say so when it can remember that the milestone happened (that record does not exist yet,
   * so no screen passes this). Reduced motion keeps the badge and the sentence and drops the burst.
   */
  celebrate?: boolean;
  /** The heading's level. It is usually the page's main heading, so a page of its own passes `h1`. */
  as?: 'h1' | 'h2';
  /** Move focus to the heading on mount: for a success that replaces a form in place (ACC-3). */
  focus?: boolean;
  /** The link component the actions render as. */
  linkAs?: SuccessLink;
  className?: string;
}

const STEP_ICON: Record<JourneyState, typeof Check> = { done: Check, current: CircleDot, next: Circle };

const STEP_TONE: Record<JourneyState, string> = {
  done: 'text-neutral-900/70',
  current: 'font-semibold text-neutral-900',
  next: 'text-neutral-900/60',
};

const STEP_ICON_TONE: Record<JourneyState, string> = {
  done: 'text-feedback-positive',
  current: 'text-accent-hover',
  next: 'text-neutral-900/60',
};

const TRAVEL = burstTravel();

/**
 * The result of one action that mattered (SUC-1..SUC-5, `docs/design/components-states/04-states.md`).
 *
 * Use it where a record other people rely on was made or sent, or money moved
 * or an outside party was told (SUC-3). Never for a safe, reversible setting:
 * that is the control showing its new state, or a toast.
 *
 * Specific: the title names what happened to which thing and `detail` carries
 * the proof. A next step: `primary` is required, so a drawn check with no way
 * forward cannot be built. At most one open loop. Joy is rare: `celebrate` is
 * off, and the burst is one sprinkle of sparks that play once, after the tick
 * has drawn, on transform and opacity only. Under reduced motion there is no
 * burst; the badge, the heading and every figure still arrive.
 *
 * One column, content-driven, centred and capped so a wide screen does not
 * stretch it (SPA-4). No bordered container anywhere: the loop and the receipt
 * are tints and spacing, never a box inside a box.
 *
 * Reading order is the focus order: title, proof, receipt, the loud button, the quiet one, then the open loop
 * (and its control), then the way back. The loud button is the first thing a keyboard reaches (COG-11).
 */
export function SuccessState({
  title,
  detail,
  primary,
  secondary,
  back,
  loop,
  receipt,
  celebrate = false,
  as: Heading = 'h2',
  focus = false,
  linkAs: LinkAs = NextLink,
  className,
}: SuccessStateProps) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const sparks = useRef<HTMLSpanElement>(null);
  const reduced = usePrefersReducedMotion();
  const burst = celebrate && !reduced;

  useEffect(() => {
    if (focus) heading.current?.focus();
  }, [focus]);

  useEffect(() => {
    const root = sparks.current;
    // Asked again here, not trusted to `burst`: the hook reads `false` on the server and for the first client render,
    // and a reader who asked for no motion must not get even that frame of it.
    if (!burst || !root || typeof root.animate !== 'function' || prefersReducedMotion()) return;
    const animations = Array.from(root.children).map((spark, index) =>
      spark.animate(sparkKeyframes(TRAVEL[index]!), {
        delay: BURST_TIMING.delay,
        duration: BURST_TIMING.duration,
        easing: BURST_TIMING.easing,
        // `forwards` only: before the delay the spark is the class's own `opacity-0`, so none shows early.
        fill: 'forwards',
      }),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [burst]);

  // SUC-2: a success with nothing to do next is a dead end (ITG-1), so it does not render at all.
  if (!primary?.label || (!primary.href && !primary.onClick)) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'stagger-fine mx-auto flex w-full min-w-0 max-w-md flex-col items-center gap-6 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex h-control-xl w-control-xl shrink-0 items-center justify-center rounded-full bg-feedback-positive/10 text-feedback-positive"
      >
        <DrawIcon>
          <Check className="h-icon-lg w-icon-lg" />
        </DrawIcon>
        {burst ? (
          <span ref={sparks} className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {TRAVEL.map((_, index) => (
              <span key={index} className="absolute h-1.5 w-1.5 rounded-full bg-feedback-positive opacity-0" />
            ))}
          </span>
        ) : null}
      </span>

      <div className="grid min-w-0 gap-2">
        <Heading
          ref={heading}
          id={headingId}
          tabIndex={-1}
          className={cn(
            // Focused by script, not a control: it takes focus so a screen reader reads the result, and wears no ring.
            'min-w-0 text-balance break-words font-semibold text-neutral-900 focus-visible:ring-0 focus-visible:ring-offset-0',
            Heading === 'h1' ? 'text-2xl' : 'text-lg',
          )}
        >
          {title}
        </Heading>
        {detail ? <p className="min-w-0 break-words text-sm tabular-nums text-neutral-900/70">{detail}</p> : null}
      </div>

      {receipt && receipt.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {receipt.map((proof) => (
            <li
              key={proof}
              className="inline-flex min-w-0 items-center gap-1.5 rounded bg-neutral-100 px-3 py-1 text-xs text-neutral-900/70"
            >
              <Check aria-hidden="true" className="h-icon-sm w-icon-sm shrink-0 text-feedback-positive" />
              <span className="min-w-0 break-words">{proof}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        <ActionControl action={primary} variant="primary" linkAs={LinkAs} />
        {secondary ? <ActionControl action={secondary} variant="secondary" linkAs={LinkAs} /> : null}
      </div>

      {loop && loop.steps.length > 0 ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded bg-neutral-100 p-4 text-start">
          <ol className="flex min-w-0 flex-wrap gap-x-4 gap-y-2">
            {loop.steps.map((step) => {
              const Icon = STEP_ICON[step.state];
              return (
                <li
                  key={step.label}
                  aria-current={step.state === 'current' ? 'step' : undefined}
                  className={cn('flex min-w-0 items-center gap-2 text-sm', STEP_TONE[step.state])}
                >
                  <Icon aria-hidden="true" className={cn('h-icon-sm w-icon-sm shrink-0', STEP_ICON_TONE[step.state])} />
                  <span className="min-w-0 break-words">
                    {step.label}
                    <span className="sr-only"> ({loop.labels[step.state]})</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {loop.aside ? <div className="shrink-0">{loop.aside}</div> : null}
        </div>
      ) : null}

      {back ? (
        <LinkAs href={back.href} className="btn-text">
          {back.label}
        </LinkAs>
      ) : null}
    </section>
  );
}

/** A destination renders as a link wearing the button's own class; an act renders as the shared `Button`. */
function ActionControl({
  action,
  variant,
  linkAs: LinkAs,
}: {
  action: SuccessAction;
  variant: 'primary' | 'secondary';
  linkAs: SuccessLink;
}) {
  const sizing = 'w-full sm:w-auto';
  if (action.href) {
    return (
      <LinkAs
        href={action.href}
        onClick={action.onClick}
        className={cn(variant === 'primary' ? 'btn-primary' : 'btn-secondary', sizing)}
      >
        {action.label}
      </LinkAs>
    );
  }
  return (
    <Button variant={variant} onClick={action.onClick} className={sizing}>
      {action.label}
    </Button>
  );
}
