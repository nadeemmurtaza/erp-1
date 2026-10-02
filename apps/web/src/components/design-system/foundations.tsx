'use client';

import { useState, type ReactNode } from 'react';
import {
  THEME_ELEVATION,
  THEME_LAYERS,
  THEME_MOTION,
  THEME_RADII,
  THEME_SIZE,
  THEME_SPACE,
  THEME_TYPE,
  themeColorVar,
  wcagLevel,
} from '@newax/shared';
import { Badge } from '@/components/ui';
import { cn } from '@/utils/cn';
import { useLiveTokens } from './live-tokens';

/* ── frame ─────────────────────────────────────────────────────────────── */

export function GallerySection({
  id,
  title,
  lead,
  columns,
  children,
}: {
  id: string;
  title: string;
  lead: ReactNode;
  /** Set where a section's groups are short enough to sit side by side at `lg`. */
  columns?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-24">
      <h2 id={`${id}-title`} className="text-2xl font-semibold text-neutral-900">
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-sm text-neutral-900/70">{lead}</p>
      <div className={cn('mt-8 grid gap-10', columns)}>{children}</div>
    </section>
  );
}

export function Group({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <h3 className="eyebrow">{title}</h3>
      {note ? <p className="mt-1 max-w-prose text-sm text-neutral-900/70">{note}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* ── colour ────────────────────────────────────────────────────────────── */

function Swatch({ token, label, note }: { token: string; label?: string; note?: string }) {
  const { hex } = useLiveTokens();
  return (
    <li className="min-w-0">
      {/* Data-driven colour: the swatch IS the token, so it cannot be a fixed class. */}
      <div
        className="h-14 rounded border border-neutral-200"
        style={{ backgroundColor: themeColorVar(token) }}
        role="img"
        aria-label={`${label ?? token} swatch`}
      />
      <p className="mt-2 truncate text-xs font-medium text-neutral-900">{label ?? token}</p>
      <p className="truncate text-2xs tabular-nums text-neutral-900/60">{hex(token) ?? '—'}</p>
      {note ? <p className="text-2xs text-neutral-900/60">{note}</p> : null}
    </li>
  );
}

/** One row holds a whole family where it fits, so no swatch is left alone on a second line. */
const ROW_COLUMNS: Record<number, string> = {
  4: 'lg:grid-cols-4',
  6: 'lg:grid-cols-6',
  7: 'lg:grid-cols-7',
  10: 'lg:grid-cols-5',
};

function SwatchRow({ tokens }: { tokens: readonly (string | [string, string])[] }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', ROW_COLUMNS[tokens.length])}>
      {tokens.map((t) => {
        const [token, label] = Array.isArray(t) ? t : [t, undefined];
        return <Swatch key={token} token={token} label={label} />;
      })}
    </ul>
  );
}

const NEUTRAL_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const;
const HUE_STEPS = ['50', '100', '200', '500', '600', '700', '900'] as const;
const HUES = ['red', 'green', 'amber', 'blue'] as const;

export function ColourFoundations() {
  return (
    <>
      <Group
        title="Neutral ramp"
        note="Every background, border and text colour. The ramp keeps its names in both themes and reverses its lightness, so 900 is always the strongest ink and 50 the page."
      >
        <SwatchRow tokens={NEUTRAL_STEPS.map((s) => `neutral-${s}`)} />
      </Group>

      <Group
        title="Surfaces and roles"
        note="Light: page, surface and overlay are three whites. Dark: each one is lighter than the last, because a shadow cannot say “higher” on a dark interface, lightness can."
      >
        <SwatchRow
         
          tokens={[
            ['neutral-50', 'page'],
            'surface',
            'overlay',
            'inverse',
            ['on-inverse', 'on inverse'],
            'scrim',
          ]}
        />
      </Group>

      <Group
        title="Brand and feedback"
        note="Accent has two jobs. As a fill (a button) it is the same teal in both themes so a white label keeps reading on it. As ink (a link, a focus ring) it lightens in dark so it keeps reading on the surface."
      >
        <SwatchRow
         
          tokens={[
            ['accent-ink', 'accent ink'],
            ['accent-ink-hover', 'accent ink hover'],
            ['feedback-positive', 'positive'],
            ['feedback-negative', 'negative'],
          ]}
        />
      </Group>

      <Group
        title="Status hues"
        note="Washes (50–200) and ink (600–900) follow the theme. Solid fills (500–900 as a background) keep their stock value in both."
      >
        <div className="grid gap-4">
          {HUES.map((hue) => (
            <div key={hue}>
              <p className="mb-2 text-xs font-medium capitalize text-neutral-900">{hue}</p>
              <SwatchRow tokens={HUE_STEPS.map((s) => `${hue}-${s}`)} />
            </div>
          ))}
        </div>
      </Group>

      <Group title="Chart series" note="Six categorical colours, each ≥ 3:1 against the surface in both themes. Charts pair colour with a dash and a marker, so colour is never the only signal.">
        <SwatchRow tokens={[0, 1, 2, 3, 4, 5].map((i) => `chart-${i}`)} />
      </Group>
    </>
  );
}

/* ── contrast ──────────────────────────────────────────────────────────── */

interface Pair {
  what: string;
  fg: string;
  bg: string;
  alpha?: number;
  floor: 3 | 4.5;
  /** A below-floor result that is known and tracked: said next to the number, not hidden. */
  known?: string;
}

const PAIRS: readonly Pair[] = [
  { what: 'Strong text on the page', fg: 'neutral-900', bg: 'neutral-50', floor: 4.5 },
  { what: 'Strong text on a surface', fg: 'neutral-900', bg: 'surface', floor: 4.5 },
  { what: 'Strong text on an overlay', fg: 'neutral-900', bg: 'overlay', floor: 4.5 },
  { what: 'Secondary text (900 at 70%) on a surface', fg: 'neutral-900', bg: 'surface', alpha: 0.7, floor: 4.5 },
  { what: 'Quiet text (900 at 60%) on the page', fg: 'neutral-900', bg: 'neutral-50', alpha: 0.6, floor: 4.5 },
  { what: 'Link on a surface', fg: 'accent-ink', bg: 'surface', floor: 4.5 },
  { what: 'Link hover on the page', fg: 'accent-ink-hover', bg: 'neutral-50', floor: 4.5 },
  { what: 'Positive on a surface', fg: 'feedback-positive', bg: 'surface', floor: 4.5 },
  { what: 'Negative on a surface', fg: 'feedback-negative', bg: 'surface', floor: 4.5 },
  { what: 'Inverse label on the inverse fill', fg: 'on-inverse', bg: 'inverse', floor: 4.5 },
  {
    what: 'Control outline (neutral-200) on a surface',
    fg: 'neutral-200',
    bg: 'surface',
    floor: 3,
    known: 'Light is 1.72:1, inherited from the original palette. Dark is built to 3:1. Tracked in ADR-083.',
  },
  { what: 'Icon and disabled ink (neutral-400) on a surface', fg: 'neutral-400', bg: 'surface', floor: 3 },
  { what: 'Chart series 0 on a surface', fg: 'chart-0', bg: 'surface', floor: 3 },
  { what: 'Chart series 3 on a surface', fg: 'chart-3', bg: 'surface', floor: 3 },
];

export function ContrastTable() {
  const { contrast, resolved } = useLiveTokens();
  return (
    <div className="card max-w-4xl overflow-x-auto">
      <table className="table-flat min-w-[36rem]">
        <caption className="sr-only">Contrast of the current theme&rsquo;s role pairs, measured from the colours the browser resolved</caption>
        <thead>
          <tr>
            <th scope="col" className="text-start">Pair ({resolved})</th>
            <th scope="col" className="text-end">Ratio</th>
            <th scope="col" className="text-end">Floor</th>
            <th scope="col" className="text-end">Level</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map((pair) => {
            const ratio = contrast(pair.fg, pair.bg, pair.alpha);
            const level = ratio === null ? null : wcagLevel(ratio, pair.floor === 3);
            return (
              <tr key={pair.what}>
                <td>
                  {pair.what}
                  {pair.known && level === 'fail' ? (
                    <span className="mt-0.5 block max-w-prose text-xs text-neutral-900/70">{pair.known}</span>
                  ) : null}
                </td>
                <td className="text-end tabular-nums">{ratio === null ? '—' : `${ratio.toFixed(2)}:1`}</td>
                <td className="text-end tabular-nums text-neutral-900/70">{pair.floor}:1</td>
                <td className="text-end">
                  {level === null ? null : level === 'fail' ? (
                    <Badge tone="danger">Below floor</Badge>
                  ) : (
                    <Badge tone={level === 'AAA' ? 'success' : 'neutral'}>{level}</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── type ──────────────────────────────────────────────────────────────── */

const TYPE_CLASS: Record<keyof typeof THEME_TYPE, string> = {
  micro: 'text-2xs',
  tiny: 'text-xs',
  small: 'text-sm',
  body: 'text-base',
  large: 'text-lg',
  heading: 'text-xl',
  title: 'text-2xl',
  display: 'text-3xl',
  metric: 'text-metric',
};

export function TypeFoundations() {
  return (
    <>
      <Group className="lg:col-span-2" title="Scale" note="Nine steps, size and line height together. Tabular figures and right alignment for every column of numbers.">
        <ul className="card">
          {(Object.keys(THEME_TYPE) as (keyof typeof THEME_TYPE)[]).map((step) => (
            <li key={step} className="flex flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3">
              <span className="w-24 shrink-0 text-xs font-medium text-neutral-900/70">
                {step} · {THEME_TYPE[step].size}/{THEME_TYPE[step].line}
              </span>
              <span className={cn('min-w-0 font-medium text-neutral-900', TYPE_CLASS[step])}>
                Quarterly revenue 1,284,500
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Right to left" note="Urdu sets in Nastaliq with its own line height, because its descenders collide at the Latin leading. Logical properties (ps-, ms-, text-start) mirror the layout.">
        <div className="card grid gap-3 p-4">
          <p className="text-base text-neutral-900">Today&rsquo;s order is complete.</p>
          <p dir="rtl" lang="ur" className="font-urdu text-base leading-[2.1] text-neutral-900">
            آج کا آرڈر مکمل ہو گیا۔
          </p>
        </div>
      </Group>
    </>
  );
}

/* ── space, size, radius ───────────────────────────────────────────────── */

export function SpaceFoundations() {
  return (
    <>
      <Group title="Space" note="Nine steps on a 4px rhythm, with one 2px step for hairline gaps. The gap inside a group is always smaller than the gap around it.">
        <ul className="grid gap-2">
          {Object.entries(THEME_SPACE).map(([step, px]) => (
            <li key={step} className="flex items-center gap-4">
              <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-900/70">
                {step} · {px}px
              </span>
              {/* Data-driven width. */}
              <span className="block h-3 bg-accent" style={{ width: px }} />
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Control and touch sizes" note="A pointer gets 32–48px controls; a finger gets at least 44px, and a till 48px.">
        <ul className="flex flex-wrap items-end gap-6">
          {Object.entries(THEME_SIZE.control).map(([name, px]) => (
            <li key={name} className="text-center">
              <span className="block rounded bg-neutral-200" style={{ width: px * 2, height: px }} />
              <span className="mt-2 block text-xs tabular-nums text-neutral-900/70">control-{name} · {px}</span>
            </li>
          ))}
          {Object.entries(THEME_SIZE.touch).map(([name, px]) => (
            <li key={name} className="text-center">
              <span className="block rounded border border-accent bg-accent/10" style={{ width: px, height: px }} />
              <span className="mt-2 block text-xs tabular-nums text-neutral-900/70">touch-{name} · {px}</span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Radius" note="Controls and status marks wear the house corner. Round is for avatars, dots, spinners and count chips, none of which is pressed.">
        <ul className="flex flex-wrap gap-6">
          {[
            ['rounded', THEME_RADII.sharp, 'controls, cards'],
            ['rounded-lg', THEME_RADII.lg, 'panels, dialogs'],
            ['rounded-full', THEME_RADII.pill, 'count chips, avatars'],
          ].map(([cls, px, use]) => (
            <li key={cls as string} className="text-center">
              <span className={cn('block h-14 w-20 bg-neutral-200', cls as string)} />
              <span className="mt-2 block text-xs font-medium text-neutral-900">{cls}</span>
              <span className="block text-2xs tabular-nums text-neutral-900/60">{px}px · {use}</span>
            </li>
          ))}
        </ul>
      </Group>
    </>
  );
}

/* ── elevation, layers, motion ─────────────────────────────────────────── */

const ELEVATION_CLASS: Record<keyof typeof THEME_ELEVATION.light, [string, string, string]> = {
  flat: ['shadow-flat', 'bg-surface', 'Resting content'],
  raised: ['shadow-raised', 'bg-surface', 'Cards that lift on hover'],
  overlay: ['shadow-overlay', 'bg-overlay', 'Menus and popovers'],
  modal: ['shadow-modal', 'bg-overlay', 'Dialogs'],
};

export function ElevationFoundations() {
  const [replay, setReplay] = useState(false);
  return (
    <>
      <Group className="lg:col-span-2" title="Elevation" note="Four steps. Light says “higher” with a shadow; dark says it with a lighter surface, because a shadow disappears on near-black.">
        <ul className="grid gap-4 rounded-lg bg-neutral-50 p-6 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(ELEVATION_CLASS) as (keyof typeof ELEVATION_CLASS)[]).map((step) => {
            const [shadow, surface, use] = ELEVATION_CLASS[step];
            return (
              <li key={step} className={cn('rounded p-4', shadow, surface)}>
                <p className="text-sm font-medium text-neutral-900">{step}</p>
                <p className="mt-1 text-xs text-neutral-900/70">{use}</p>
              </li>
            );
          })}
        </ul>
      </Group>

      <Group title="Layers" note="Named, never numeric. A literal z-index is not generated, so a stacking bug has one place to be fixed.">
        <div className="card max-w-xl overflow-x-auto">
          <table className="table-flat min-w-[24rem]">
            <caption className="sr-only">Named stacking layers and their order</caption>
            <thead>
              <tr>
                <th scope="col" className="text-start">Layer</th>
                <th scope="col" className="text-end">Order</th>
                <th scope="col" className="text-start">Utility</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(THEME_LAYERS).map(([name, order]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-end tabular-nums">{order}</td>
                  <td className="font-mono text-xs text-neutral-900/70">z-{name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group title="Motion" note="Transform and opacity only. Under reduced motion the transition collapses to an instant change: the state still arrives, the travel does not.">
        <div className="card p-4">
          <button type="button" className="btn-secondary" onClick={() => setReplay((r) => !r)} aria-pressed={replay}>
            Replay
          </button>
          <ul className="mt-4 grid gap-3">
            {(['instant', 'fast', 'normal', 'slow', 'sweep'] as const).map((name) => (
              <li key={name} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-xs tabular-nums text-neutral-900/70">
                  {name} · {THEME_MOTION.duration[name]}ms
                </span>
                <span className="block h-2 flex-1 bg-neutral-100">
                  {/* A scaled bar, not a moving dot: scale is a transform, so it never forces layout. */}
                  <span
                    className={cn(
                      'block h-full w-full origin-left bg-accent transition-transform ease-standard motion-reduce:transition-none rtl:origin-right',
                      DURATION_CLASS[name],
                      replay ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Group>
    </>
  );
}

const DURATION_CLASS = {
  instant: 'duration-instant',
  fast: 'duration-fast',
  normal: 'duration-normal',
  slow: 'duration-slow',
  sweep: 'duration-sweep',
} as const;
