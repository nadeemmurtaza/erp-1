'use client';

import { useEffect, useState } from 'react';
import { formatDate } from '@newax/shared';
import { cooldownState, COOLDOWN_DAYS } from '@/lib/guard';
import { Button } from './button';

/** How often the days-left figure is re-read. A day is the smallest unit it shows, so a minute is far more often than it can change. */
const REFRESH_MS = 60_000;

/**
 * What a page about a scheduled removal says (DNG-6).
 *
 * What it communicates: *this is going, and you can still change your mind*. It
 * names the day it will be gone, how many days are left, and offers **Restore**
 * in one click, on every page that is about the thing. The cooling-off period is
 * the confirmation: a removal that took a hold or a typed name to start still
 * does not become final until the days have run out.
 *
 * It states the rule, not the machinery: nothing here deletes anything, and the
 * purge is the server's job on the same clock (`cooldownState` is the one rule
 * both read). Once the period has ended it says so and offers nothing, because a
 * Restore that can no longer work is a lie. `days` defaults to the brand's
 * `safeguards.deletionCooldownDays`.
 */
export function CooldownBanner({
  subject,
  requestedAt,
  days = COOLDOWN_DAYS,
  onRestore,
  restoring = false,
  now,
}: {
  /** What is being removed, as it should read in a sentence: "The Lahore brand". */
  subject: string;
  requestedAt: Date | string | number;
  days?: number;
  onRestore: () => void | Promise<void>;
  restoring?: boolean;
  /** Pins the clock, for the design-system page and tests. Left out, the banner reads the real one. */
  now?: number;
}) {
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const timer = window.setInterval(() => setClock(Date.now()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [now]);

  const state = cooldownState(requestedAt, days, now ?? clock);

  if (state.expired) {
    return (
      <p role="status" className="notice notice-error">
        {subject} has been removed. The {days}-day restore period has ended.
      </p>
    );
  }

  return (
    <div
      role="status"
      className="notice notice-warning flex flex-col gap-3 fold:flex-row fold:items-center fold:justify-between"
    >
      <p className="m-0">
        {subject} will be removed on <strong>{formatDate(state.endsAt)}</strong>. {state.daysLeft}{' '}
        {state.daysLeft === 1 ? 'day' : 'days'} left to restore it.
      </p>
      <Button
        variant="secondary"
        onClick={onRestore}
        loading={restoring}
        loadingLabel="Restoring…"
        className="shrink-0"
      >
        Restore
      </Button>
    </div>
  );
}
