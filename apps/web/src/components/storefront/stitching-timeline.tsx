'use client';

import { useLocale, useTranslations } from 'next-intl';
import clsx from 'clsx';
import { STITCHING_STAGES, type Locale, type StitchingStage } from '@yaseen/shared';

export interface TimelineEvent {
  fromStage?: StitchingStage | null;
  toStage: StitchingStage;
  createdAt: string;
  note?: string | null;
  photoUrl?: string | null;
}

/** The stages a customer is shown. Dispatch is an order status, not a garment one. */
const VISIBLE_STAGES = STITCHING_STAGES.filter((stage) => stage !== 'DISPATCHED');

/**
 * How far along one garment is.
 *
 * The same rail serves a garment bought with fabric and one booked on the
 * customer's own cloth — the workshop runs a single queue, so the customer sees
 * a single story.
 */
export function StitchingTimeline({
  stage,
  events,
  dueAt,
}: {
  stage: StitchingStage;
  events: TimelineEvent[];
  dueAt?: string | null;
}) {
  const t = useTranslations('stitching');
  const locale = useLocale() as Locale;
  const dateLocale = locale === 'ur' ? 'ur-PK' : 'en-PK';

  const reachedIndex = VISIBLE_STAGES.indexOf(stage as (typeof VISIBLE_STAGES)[number]);
  // A dispatched garment is finished, so every stage on the rail is behind it.
  const completedThrough = stage === 'DISPATCHED' ? VISIBLE_STAGES.length - 1 : reachedIndex;

  const reachedAt = new Map<string, string>();
  for (const event of events) {
    reachedAt.set(event.toStage, event.createdAt);
  }

  return (
    <div>
      <ol className="flex flex-wrap gap-x-1 gap-y-3">
        {VISIBLE_STAGES.map((entry, index) => {
          const done = index <= completedThrough;
          const current = index === completedThrough;
          const at = reachedAt.get(entry);

          return (
            <li key={entry} className="flex min-w-[5.5rem] flex-1 flex-col gap-1.5">
              <span
                className={clsx(
                  'h-1.5 rounded-full',
                  done ? 'bg-brand-600' : 'bg-sand-200',
                )}
              />
              <span
                className={clsx(
                  'text-xs',
                  current ? 'font-semibold text-brand-800' : done ? 'text-ink/70' : 'text-ink/40',
                )}
              >
                {t(`stage.${entry}`)}
              </span>
              {at ? (
                <span className="text-[0.7rem] text-ink/40">
                  {new Date(at).toLocaleDateString(dateLocale)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {dueAt ? (
        <p className="mt-3 text-xs text-ink/50">
          {t('promisedFor', { date: new Date(dueAt).toLocaleDateString(dateLocale) })}
        </p>
      ) : null}

      {events.some((event) => event.note || event.photoUrl) ? (
        <ul className="mt-3 space-y-2">
          {events
            .filter((event) => event.note || event.photoUrl)
            .map((event, index) => (
              <li key={index} className="text-xs text-ink/60">
                <span className="font-medium text-ink/80">{t(`stage.${event.toStage}`)}</span>
                {event.note ? <span className="ms-2">{event.note}</span> : null}
                {event.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.photoUrl}
                    alt={t(`stage.${event.toStage}`)}
                    className="mt-1 max-h-40 rounded-md border border-sand-200"
                  />
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
