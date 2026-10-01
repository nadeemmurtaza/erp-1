'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
import { BRAND, formatNumber } from '@newax/shared';
import { Button, ConfirmDialog, Segmented, Switch } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  AUDIENCE_POOL,
  INDUSTRIES,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  VERIFICATIONS,
  estimateAudience,
  publishBlocker,
  publishFriction,
  visibilityUsesAudience,
  type AudienceFilters,
  type AudienceScope,
  type Visibility,
} from './audience';
import { ChoiceCards } from './choice-cards';

/**
 * Publish a profile, and choose who sees it.
 *
 * Up to three questions in the order a person asks them: where does it go live,
 * which partners are shown it, and (only for "custom") which exactly. The second
 * and third apply to the public directory alone: an unlisted link is open to
 * whoever holds it and an internal profile to signed-in staff, so for those the
 * form is one question (`PRM-5`, layout closes over absence). Beside the
 * questions, one summary says in plain words what the choice does, and the count
 * of partners it reaches is a live figure that links to the list behind it.
 *
 * What the mockup this came from did not carry:
 *   - Friction matches the blast radius (`ACT-6`). Going into the public
 *     directory names the audience and the caveat first; an unlisted link or an
 *     internal profile is small and reversible, so it just happens.
 *   - A count that cannot be worked out never blocks publishing (it says so), and
 *     a custom audience that matches nobody is refused with what to change (`FLO-7`).
 *   - Publishing needs `settings.manage`; without it every control is shown,
 *     disabled, with the key written next to it (`PRM-2`).
 *   - What is live is kept apart from what is being edited: the button says
 *     "Publish changes" only when they differ, and unpublishing is one action.
 *
 * Illustrative counts (`audience.ts`). The specimen controls at the foot are this
 * page's own devices: a real screen has one viewer and a count that fails only
 * when it fails.
 */

/** No brand token for the distance unit yet; a deployment that counts in miles needs one (noted in ADR-083). */
const DISTANCE_UNIT = 'km';
const COUNT_DELAY_MS = 400;
const PUBLISH_DELAY_MS = 700;

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Internal', hint: 'Only people signed in to the admin can open it.' },
  { value: 'unlisted', label: 'Unlisted', hint: 'Anyone with the link can open it, until you revoke the link.' },
  { value: 'directory', label: 'Public', hint: 'Listed in the partner directory and in search.' },
] as const satisfies readonly { value: Visibility; label: string; hint: string }[];

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All partners', hint: 'Every approved partner account.' },
  { value: 'region', label: 'My region', hint: 'Partners in the same region as your main office.' },
  { value: 'custom', label: 'Custom segment', hint: 'Build it by distance, industry and verification.' },
] as const satisfies readonly { value: AudienceScope; label: string; hint: string }[];

const WORD: Record<Visibility, string> = { private: 'Internal', unlisted: 'Unlisted', directory: 'Public' };

const WHO: Record<AudienceScope, string> = {
  all: 'Every approved partner can open it.',
  region: 'Partners in your region can open it.',
  custom: 'The partners you chose can open it.',
};

const CAVEAT = 'Unpublishing removes the listing, but a search engine’s own copy can take days to clear.';

const sentence = (visibility: Visibility, scope: AudienceScope, name: string) =>
  visibility === 'private'
    ? `Only people signed in to the admin can open ${name}. Nobody outside sees it.`
    : visibility === 'unlisted'
      ? `Anyone with the link can open ${name}. It is not listed or indexed. Revoke the link any time.`
      : `${name} is listed in the partner directory and in search. ${WHO[scope]} ${CAVEAT}`;

type Count = number | 'counting' | 'unavailable';

interface Live {
  visibility: Visibility;
  scope: AudienceScope;
  /** Null when the count could not be worked out at the moment of publishing. */
  count: number | null;
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <li className="grid gap-3">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-900"
        >
          {n}
        </span>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
          {hint ? <p className="text-sm text-neutral-900/70">{hint}</p> : null}
        </div>
      </div>
      <div className="min-w-0 ps-9">{children}</div>
    </li>
  );
}

function ToggleChip({
  on,
  disabled,
  onToggle,
  children,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'chip gap-1.5 disabled:cursor-not-allowed disabled:opacity-50',
        on ? 'chip-selected' : 'chip-unselected',
      )}
    >
      {on ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}

export function PublishAudienceSpecimen() {
  const id = useId();
  const name = BRAND.identity.name;
  const [viewer, setViewer] = useState<'admin' | 'staff'>('admin');
  const [failCount, setFailCount] = useState(false);

  const [visibility, setVisibility] = useState<Visibility>('directory');
  const [scope, setScope] = useState<AudienceScope>('custom');
  const [filters, setFilters] = useState<AudienceFilters>({
    radiusKm: 150,
    industries: ['retail'],
    verifications: ['identity'],
  });
  const [counted, setCounted] = useState<{ key: string; value: number | 'unavailable' } | null>(null);

  const [live, setLive] = useState<Live | null>(null);
  const [phase, setPhase] = useState<'idle' | 'confirming' | 'publishing'>('idle');
  const [announce, setAnnounce] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const asks = visibilityUsesAudience(visibility);
  const canPublish = viewer === 'admin';

  // A custom count is worked out after a pause and stays tied to the inputs that
  // made it, so anything changing shows "counting" again with no state to reset.
  const countKey = JSON.stringify([filters, failCount]);
  useEffect(() => {
    if (!asks || scope !== 'custom') return;
    const handle = setTimeout(
      () => setCounted({ key: countKey, value: failCount ? 'unavailable' : estimateAudience('custom', filters) }),
      COUNT_DELAY_MS,
    );
    return () => clearTimeout(handle);
  }, [asks, scope, countKey, failCount, filters]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const count: Count =
    scope === 'custom' ? (counted?.key === countKey ? counted.value : 'counting') : estimateAudience(scope, filters);
  const numeric = typeof count === 'number' ? count : null;

  const blocker = canPublish
    ? publishBlocker(visibility, scope, numeric)
    : 'Publishing needs Master admin (settings.manage).';
  const unchanged =
    live !== null &&
    live.visibility === visibility &&
    (!asks || (live.scope === scope && (numeric === null || live.count === numeric)));
  const counting = asks && count === 'counting';

  const toggle = (list: readonly string[], key: string) =>
    list.includes(key) ? list.filter((item) => item !== key) : [...list, key];

  const finish = () => {
    setLive({ visibility, scope, count: asks ? numeric : null });
    setPhase('idle');
    setAnnounce(
      asks
        ? `Published as Public. ${numeric === null ? 'The audience could not be counted.' : `About ${formatNumber(numeric)} partner accounts can find it.`}`
        : `Published as ${WORD[visibility]}.`,
    );
  };

  const run = () => {
    setPhase('publishing');
    timer.current = setTimeout(finish, PUBLISH_DELAY_MS);
  };

  const unpublish = () => {
    setLive(null);
    setAnnounce('Unpublished. The listing is removed.');
  };

  const hint = VISIBILITY_OPTIONS.find((option) => option.value === visibility)!.hint;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 gap-8">
        <ol className="m-0 grid list-none gap-8 p-0">
          <Step n={1} title="Where should it be visible?" hint={hint}>
            <Segmented
              kind="choice"
              label="Where should it be visible?"
              value={visibility}
              disabled={!canPublish}
              onChange={setVisibility}
              options={VISIBILITY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              className="w-fit max-w-full flex-wrap"
            />
          </Step>

          {asks ? (
            <Step n={2} title="Which partners are shown it?">
              <ChoiceCards
                legend="Which partners are shown it?"
                name={`${id}-scope`}
                options={SCOPE_OPTIONS}
                value={scope}
                disabled={!canPublish}
                onChange={setScope}
                className="[&>legend]:sr-only"
              />
            </Step>
          ) : null}

          {asks && scope === 'custom' ? (
            <Step n={3} title="Build the audience">
              <div className="grid gap-5">
                <div>
                  <label htmlFor={`${id}-radius`} className="field-label flex items-baseline justify-between gap-3">
                    <span>Within</span>
                    <output htmlFor={`${id}-radius`} className="font-normal tabular-nums text-neutral-900/70">
                      {formatNumber(filters.radiusKm)} {DISTANCE_UNIT}
                    </output>
                  </label>
                  <div className="flex min-h-touch items-center">
                    <input
                      id={`${id}-radius`}
                      type="range"
                      min={MIN_RADIUS_KM}
                      max={MAX_RADIUS_KM}
                      step={10}
                      value={filters.radiusKm}
                      disabled={!canPublish}
                      aria-valuetext={`${filters.radiusKm} ${DISTANCE_UNIT}`}
                      onChange={(event) => setFilters((prev) => ({ ...prev, radiusKm: Number(event.target.value) }))}
                      className="w-full accent-accent disabled:opacity-50"
                    />
                  </div>
                </div>

                <fieldset className="grid min-w-0 gap-2">
                  <legend className="field-label">Industry</legend>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRIES.map((item) => (
                      <ToggleChip
                        key={item.key}
                        on={filters.industries.includes(item.key)}
                        disabled={!canPublish}
                        onToggle={() =>
                          setFilters((prev) => ({ ...prev, industries: toggle(prev.industries, item.key) }))
                        }
                      >
                        {item.label}
                      </ToggleChip>
                    ))}
                  </div>
                  <p className="text-sm text-neutral-900/70">None chosen means every industry.</p>
                </fieldset>

                <fieldset className="grid min-w-0 gap-2">
                  <legend className="field-label">Verification</legend>
                  <div className="flex flex-wrap gap-2">
                    {VERIFICATIONS.map((item) => (
                      <ToggleChip
                        key={item.key}
                        on={filters.verifications.includes(item.key)}
                        disabled={!canPublish}
                        onToggle={() =>
                          setFilters((prev) => ({ ...prev, verifications: toggle(prev.verifications, item.key) }))
                        }
                      >
                        {item.label}
                      </ToggleChip>
                    ))}
                  </div>
                  <p className="text-sm text-neutral-900/70">A partner must pass every check you choose.</p>
                </fieldset>
              </div>
            </Step>
          ) : null}
        </ol>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-100 pt-4">
          <p className="eyebrow">Specimen controls</p>
          <Segmented
            kind="choice"
            label="View as"
            value={viewer}
            onChange={setViewer}
            options={[
              { value: 'admin', label: 'Master admin' },
              { value: 'staff', label: 'Staff' },
            ]}
          />
          <Switch label="Make the count fail" checked={failCount} onChange={setFailCount} className="w-64 max-w-full" />
        </div>
      </div>

      <aside
        aria-label="What this does"
        className="min-w-0 self-start rounded-lg bg-neutral-100 p-5 lg:sticky lg:top-24"
      >
        <h4 className="eyebrow">What this does</h4>
        <p className="mt-2 text-sm text-neutral-900">{sentence(visibility, scope, name)}</p>

        {asks ? (
          <div className="mt-4" aria-live="polite">
            {count === 'counting' ? (
              <div aria-busy="true" className="flex items-center gap-3">
                <div className="skeleton h-5 w-24 rounded" />
                <p className="text-sm text-neutral-900/70">Counting…</p>
              </div>
            ) : count === 'unavailable' ? (
              <p className="notice notice-warning">Count unavailable. You can still publish this audience.</p>
            ) : (
              <p className="text-sm text-neutral-900">
                <span className="text-2xl font-semibold tabular-nums">≈ {formatNumber(count)}</span> of{' '}
                {formatNumber(AUDIENCE_POOL)} partner accounts
                {count > 0 ? (
                  <>
                    {' '}
                    ·{' '}
                    <a href="#screens" className="underline underline-offset-2">
                      View the list
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          {blocker ? (
            <p role="status" className="flex items-start gap-1.5 text-sm text-neutral-900/70">
              {canPublish ? null : <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              {blocker}
            </p>
          ) : null}
          <Button
            loading={phase === 'publishing'}
            loadingLabel="Publishing…"
            disabled={Boolean(blocker) || unchanged || counting}
            onClick={() => (publishFriction(visibility) === 'confirm' ? setPhase('confirming') : run())}
          >
            {live ? (unchanged ? 'Published' : 'Publish changes') : 'Publish'}
          </Button>
          {live ? (
            <>
              <p className="text-sm text-neutral-900/70">
                Live now: {WORD[live.visibility]}
                {visibilityUsesAudience(live.visibility)
                  ? live.count === null
                    ? ', audience not counted'
                    : `, about ${formatNumber(live.count)} partner accounts`
                  : ''}
                .
              </p>
              <div>
                <Button variant="secondary" disabled={!canPublish} onClick={unpublish}>
                  Unpublish
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </aside>

      <ConfirmDialog
        open={phase === 'confirming'}
        onClose={() => setPhase('idle')}
        onConfirm={run}
        variant="primary"
        title="Publish to the public directory?"
        description={`${name} will be listed and indexed, and ${
          numeric === null ? 'an audience that could not be counted' : `about ${formatNumber(numeric)} partner accounts`
        } can find it. ${CAVEAT}`}
        confirmLabel="Publish"
      />

      <p role="status" className="sr-only">
        {announce}
      </p>
    </div>
  );
}
