'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, GitBranch, Minus, Play, UserCheck, X, type LucideIcon } from 'lucide-react';
import { formatMoney, toMinor } from '@newax/shared';
import { Badge, Button, EmptyState, Tabs } from '@/components/ui';
import { cn } from '@/utils/cn';

/**
 * The two flow concepts from the images: an approval-routing canvas and the
 * five-tier journey. Both are specimens, not components: each has one consumer
 * (this page), so by the rule of three they stay written out from primitives
 * until a screen needs one.
 *
 * Neither relies on colour alone. A node on the tested path says "On path" in
 * words with a tick; a layer of chrome says Present, Compact or Hidden in words
 * with a glyph; the branches are labelled True and False in text.
 */

/* ── routing canvas ───────────────────────────────────────────────────── */

type NodeKey = 'start' | 'check' | 'high' | 'low' | 'done';
type Route = 'high' | 'low';

/**
 * The amount (in whole currency units) at or above which a second approver is
 * needed. A specimen value: a real threshold is a setting with an owner, a
 * second signature to change it and an audit row carrying old and new value
 * (CLAUDE.md, "Authority and blast radius").
 */
const THRESHOLD = 500_000;
const SLIDER_MAX = 1_000_000;
const SLIDER_STEP = 10_000;

const NODES: Record<
  NodeKey,
  {
    step: string;
    title: string;
    kind: string;
    Icon: LucideIcon;
    rows: [string, string][];
  }
> = {
  start: {
    step: '1',
    title: 'Purchase order submitted',
    kind: 'Trigger',
    Icon: Play,
    rows: [
      ['Starts when', 'A buyer submits a purchase order for approval'],
      ['Carries', 'Supplier, lines, total and the branch it is for'],
    ],
  },
  check: {
    step: '2',
    title: 'Amount at or above the threshold?',
    kind: 'Condition',
    Icon: GitBranch,
    rows: [
      ['Compares', 'The order total with the approval threshold'],
      ['Threshold', formatMoney(toMinor(THRESHOLD))],
      ['True', 'Goes to the finance director'],
      ['False', 'Goes to the branch manager'],
    ],
  },
  high: {
    step: '3a',
    title: 'Finance director approves',
    kind: 'Approval',
    Icon: UserCheck,
    rows: [
      ['Who', 'Anyone holding the purchasing approval permission at brand scope'],
      ['Quorum', '1 approver, never the buyer who submitted it'],
      ['If nobody acts', 'Escalates to the managing director after 24 hours'],
    ],
  },
  low: {
    step: '3b',
    title: 'Branch manager approves',
    kind: 'Approval',
    Icon: UserCheck,
    rows: [
      ['Who', 'Anyone holding the purchasing approval permission at the order’s branch'],
      ['Quorum', '1 approver, never the buyer who submitted it'],
      ['If nobody acts', 'Escalates to the finance director after 24 hours'],
    ],
  },
  done: {
    step: '4',
    title: 'Approved',
    kind: 'End',
    Icon: Check,
    rows: [
      ['Then', 'The buyer is told and the commitment is recorded'],
      ['Undo', 'A cancelled order reverses the commitment with its own document'],
    ],
  },
};

interface LogEntry {
  id: number;
  text: string;
}

export function RoutingCanvasSpecimen() {
  const [amount, setAmount] = useState(620_000);
  const [selected, setSelected] = useState<NodeKey>('check');
  const [route, setRoute] = useState<Route | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [announce, setAnnounce] = useState('');
  const sliderId = useId();

  const run = () => {
    const next: Route = amount >= THRESHOLD ? 'high' : 'low';
    const who = next === 'high' ? 'the finance director' : 'the branch manager';
    const money = formatMoney(toMinor(amount));
    const limit = formatMoney(toMinor(THRESHOLD));
    const text = `${money} is ${next === 'high' ? 'at or above' : 'below'} ${limit}: routed to ${who}.`;
    setRoute(next);
    setAnnounce(text);
    setLog((prev) => [{ id: (prev[0]?.id ?? 0) + 1, text }, ...prev].slice(0, 5));
  };

  const onPath = (key: NodeKey) =>
    route != null && (key === 'start' || key === 'check' || key === 'done' || key === route);

  const node = (key: NodeKey) => {
    const { step, title, kind, Icon } = NODES[key];
    return (
      <button
        type="button"
        aria-pressed={selected === key}
        onClick={() => setSelected(key)}
        className={cn(
          'flex w-full min-w-0 flex-col gap-2 rounded-lg p-4 text-start transition-colors duration-fast ease-standard',
          selected === key ? 'bg-accent/10' : 'bg-neutral-50 hover:bg-neutral-100',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="eyebrow flex items-center gap-2">
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {step} · {kind}
          </span>
          {onPath(key) ? (
            <Badge tone="info">
              <Check aria-hidden="true" className="h-3 w-3" />
              On path
            </Badge>
          ) : null}
        </span>
        <span className="text-sm font-medium text-neutral-900">{title}</span>
      </button>
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_theme(spacing.96)]">
      <div className="card min-w-0 p-5">
        <div className="mx-auto grid max-w-xl gap-0">
          {node('start')}
          <Stem active={onPath('check')} />
          {node('check')}

          <Stem active={route != null} short />
          <Bracket active={route != null} />
          <div className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-2">
              <Badge tone="neutral" className="justify-self-center">
                True
              </Badge>
              {node('high')}
            </div>
            <div className="grid content-start gap-2">
              <Badge tone="neutral" className="justify-self-center">
                False
              </Badge>
              {node('low')}
            </div>
          </div>
          <Bracket active={route != null} flip />
          <Stem active={route != null} short />
          {node('done')}
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-6">
        <div className="card p-5">
          <h4 className="eyebrow">Test the route</h4>
          <label htmlFor={sliderId} className="field-label mt-3 flex items-baseline justify-between gap-3">
            <span>Order total</span>
            <span className="tabular-nums text-neutral-900">{formatMoney(toMinor(amount))}</span>
          </label>
          <div className="flex min-h-touch items-center">
            <input
              id={sliderId}
              type="range"
              min={0}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={amount}
              onChange={(event) => {
                setAmount(Number(event.target.value));
                setRoute(null);
              }}
              className="w-full accent-accent"
            />
          </div>
          <Button className="mt-2" onClick={run}>
            <Play aria-hidden="true" className="h-4 w-4" />
            Run routing test
          </Button>
          <p role="status" className="mt-3 min-h-5 text-sm text-neutral-900/70">
            {announce}
          </p>
        </div>

        <div className="card p-5">
          <Tabs
            label="Route details"
            items={[
              {
                key: 'inspector',
                label: 'Node inspector',
                content: (
                  <div>
                    <p className="text-sm font-medium">{NODES[selected].title}</p>
                    <dl className="mt-3 grid gap-3 text-sm">
                      {NODES[selected].rows.map(([term, value]) => (
                        <div key={term}>
                          <dt className="eyebrow">{term}</dt>
                          <dd className="mt-0.5 text-neutral-900/80">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ),
              },
              {
                key: 'log',
                label: 'Execution log',
                badge: log.length > 0 ? log.length : undefined,
                content:
                  log.length === 0 ? (
                    <EmptyState
                      className="py-6"
                      title="Nothing run yet."
                      description="Choose an order total and run the test to see where it routes."
                    />
                  ) : (
                    <ol className="grid gap-2 text-sm">
                      {log.map((entry) => (
                        <li key={entry.id} className="flex gap-2">
                          <span className="shrink-0 tabular-nums text-neutral-900/60">#{entry.id}</span>
                          <span>{entry.text}</span>
                        </li>
                      ))}
                    </ol>
                  ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

/** The line and arrowhead between two nodes. */
function Stem({ active, short = false }: { active: boolean; short?: boolean }) {
  return (
    <div aria-hidden="true" className={cn('flex flex-col items-center', active ? 'text-accent' : 'text-neutral-400')}>
      <span className={cn('w-0.5 bg-current', short ? 'h-3' : 'h-5')} />
      <ChevronDown className="-mt-1 h-4 w-4" />
    </div>
  );
}

/**
 * The fork (or its mirror, the join): a bracket from the middle of the left
 * column to the middle of the right one, so each leg lands on the node under it.
 */
function Bracket({ active, flip = false }: { active: boolean; flip?: boolean }) {
  return (
    <div aria-hidden="true" className="relative h-4">
      <span
        className={cn(
          'absolute inset-x-1/4 h-4 border-2',
          flip ? 'bottom-0 rounded-b-lg border-t-0' : 'top-0 rounded-t-lg border-b-0',
          active ? 'border-accent' : 'border-neutral-400',
        )}
      />
    </div>
  );
}

/* ── journey tiers ────────────────────────────────────────────────────── */

type Presence = 'full' | 'compact' | 'absent';
type LayerKey = 'global' | 'area' | 'destination' | 'view' | 'breadcrumb' | 'record';

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: 'global', label: 'Global bar' },
  { key: 'area', label: 'Area rail' },
  { key: 'destination', label: 'Destination list' },
  { key: 'view', label: 'View tabs' },
  { key: 'breadcrumb', label: 'Breadcrumb' },
  { key: 'record', label: 'Record tabs' },
];

const PRESENCE: Record<Presence, { label: string; Icon: LucideIcon }> = {
  full: { label: 'Present', Icon: Check },
  compact: { label: 'Compact', Icon: Minus },
  absent: { label: 'Hidden', Icon: X },
};

/**
 * The five tiers are the repo's own navigation shape (`14-navigation.md`, "The
 * shape"): Global, Area, Destination, View, Object. The chrome each one shows is
 * what that chapter's laws imply: the position is always stated (`NAV-4`, so a
 * breadcrumb appears once the hierarchy is deeper than two levels), depth only
 * ever means "more specific" (`NAV-8`), and a record gets its own tabs and a
 * quieter shell because the record is the job (Law 7, detail on click).
 */
const TIERS: {
  key: string;
  name: string;
  asks: string;
  example: string;
  ignore: string;
  chrome: Record<LayerKey, Presence>;
}[] = [
  {
    key: 'global',
    name: 'Global',
    asks: 'Where can I go from anywhere?',
    example: 'Search · Scope · Account · Help',
    ignore: 'Every area and every record: nothing has been chosen yet.',
    chrome: {
      global: 'full',
      area: 'absent',
      destination: 'absent',
      view: 'absent',
      breadcrumb: 'absent',
      record: 'absent',
    },
  },
  {
    key: 'area',
    name: 'Area',
    asks: 'Which job am I doing?',
    example: 'Selling · Stock · Buying · Money · People · Setup',
    ignore: 'Every other area’s destinations.',
    chrome: {
      global: 'full',
      area: 'full',
      destination: 'absent',
      view: 'absent',
      breadcrumb: 'absent',
      record: 'absent',
    },
  },
  {
    key: 'destination',
    name: 'Destination',
    asks: 'Which thing am I working on?',
    example: 'Orders · Transfers · Suppliers',
    ignore: 'The other destinations in this area.',
    chrome: {
      global: 'full',
      area: 'full',
      destination: 'full',
      view: 'absent',
      breadcrumb: 'full',
      record: 'absent',
    },
  },
  {
    key: 'view',
    name: 'View',
    asks: 'Which slice of it?',
    example: 'Awaiting approval · Overdue',
    ignore: 'Rows outside the slice.',
    chrome: {
      global: 'full',
      area: 'full',
      destination: 'full',
      view: 'full',
      breadcrumb: 'full',
      record: 'absent',
    },
  },
  {
    key: 'object',
    name: 'Object',
    asks: 'What is true of this one record?',
    example: 'One order and its own tabs',
    ignore: 'The list it came from: coming back returns to the same filter, sort and page (NAV-7).',
    chrome: {
      global: 'compact',
      area: 'compact',
      destination: 'absent',
      view: 'absent',
      breadcrumb: 'full',
      record: 'full',
    },
  },
];

const FUNNEL_WIDTH = ['w-full', 'w-11/12', 'w-5/6', 'w-3/4', 'w-2/3'] as const;

/**
 * A funnel you can operate: five bars narrowing toward the job, each a tab.
 * Choosing one shows the question that tier answers, a wireframe of the shell it
 * leaves on screen, which layers of chrome are present, and how specific the job
 * has become. Arrow keys, Home and End move between tiers.
 */
export function JourneyTiersSpecimen() {
  const [index, setIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const tier = TIERS[index]!;

  const onKeyDown = (event: KeyboardEvent) => {
    const last = TIERS.length - 1;
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? Math.min(index + 1, last)
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next == null) return;
    event.preventDefault();
    setIndex(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,theme(spacing.96))_minmax(0,1fr)]">
      <div
        role="tablist"
        aria-label="Journey tiers"
        aria-orientation="vertical"
        className="grid content-start justify-items-center gap-2"
      >
        {TIERS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={i === index}
            aria-controls={`${id}-panel`}
            tabIndex={i === index ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => setIndex(i)}
            className={cn(
              'flex min-h-touch flex-col items-center justify-center rounded-md px-3 py-2 text-center transition-colors duration-fast ease-standard',
              FUNNEL_WIDTH[i],
              i === index ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-900 hover:bg-neutral-50',
            )}
          >
            <span className="text-sm font-semibold">
              {i + 1} · {t.name}
            </span>
            <span className={cn('text-xs', i === index ? 'text-white/80' : 'text-neutral-900/70')}>{t.example}</span>
          </button>
        ))}
      </div>

      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${tier.key}`}
        className="card grid min-w-0 gap-6 p-5"
      >
        <div>
          <h4 className="eyebrow">{tier.name}</h4>
          <p className="mt-1 text-lg font-semibold">{tier.asks}</p>
          <p className="mt-1 text-sm text-neutral-900/70">You can ignore: {tier.ignore}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Wireframe chrome={tier.chrome} />
          <ul className="grid content-start gap-1 text-sm">
            {LAYERS.map((layer) => {
              const { label, Icon } = PRESENCE[tier.chrome[layer.key]];
              return (
                <li key={layer.key} className="flex min-h-9 items-center justify-between gap-3">
                  <span>{layer.label}</span>
                  <Badge tone={tier.chrome[layer.key] === 'absent' ? 'neutral' : 'info'}>
                    <Icon aria-hidden="true" className="h-3 w-3" />
                    {label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="eyebrow">Specificity</p>
          <div
            role="meter"
            aria-label="Specificity"
            aria-valuemin={1}
            aria-valuemax={TIERS.length}
            aria-valuenow={index + 1}
            aria-valuetext={`${index + 1} of ${TIERS.length}`}
            className="mt-2 flex items-center gap-1"
          >
            {TIERS.map((t, i) => (
              <span
                key={t.key}
                aria-hidden="true"
                className={cn('h-2 flex-1 rounded-full', i <= index ? 'bg-accent' : 'bg-neutral-100')}
              />
            ))}
            <span className="ms-2 text-sm tabular-nums text-neutral-900/70">
              {index + 1} of {TIERS.length}
            </span>
          </div>
          <p className="mt-2 max-w-prose text-sm text-neutral-900/70">
            Going one tier down always means more specific, never more of the same and never somewhere else entirely
            (NAV-8).
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * A drawing of the shell, built from the same presence map as the list beside
 * it, so the two cannot disagree. Decorative: the list is the accessible form.
 * An absent layer is not rendered, and the work area takes its space, so the
 * layout closes over what is missing (`PRM-5`, `MOD-1`).
 */
function Wireframe({ chrome }: { chrome: Record<LayerKey, Presence> }): ReactNode {
  return (
    <div aria-hidden="true" className="flex h-56 flex-col gap-1 rounded-lg bg-neutral-50 p-2">
      <div className={cn('shrink-0 rounded bg-neutral-200', chrome.global === 'compact' ? 'h-2' : 'h-4')} />
      <div className="flex min-h-0 flex-1 gap-1">
        {chrome.area !== 'absent' ? (
          <div className={cn('shrink-0 rounded bg-neutral-100', chrome.area === 'compact' ? 'w-3' : 'w-8')} />
        ) : null}
        {chrome.destination !== 'absent' ? <div className="w-14 shrink-0 rounded bg-neutral-100" /> : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1 rounded bg-surface p-2 shadow-raised">
          {chrome.breadcrumb !== 'absent' ? <div className="h-1.5 w-1/3 shrink-0 rounded bg-neutral-200" /> : null}
          {chrome.view !== 'absent' ? (
            <div className="flex shrink-0 gap-1">
              <div className="h-2 w-8 rounded bg-accent" />
              <div className="h-2 w-8 rounded bg-neutral-200" />
              <div className="h-2 w-8 rounded bg-neutral-200" />
            </div>
          ) : null}
          {chrome.record !== 'absent' ? (
            <>
              <div className="h-3 w-1/2 shrink-0 rounded bg-neutral-300" />
              <div className="flex shrink-0 gap-1">
                <div className="h-2 w-8 rounded bg-accent" />
                <div className="h-2 w-8 rounded bg-neutral-200" />
              </div>
            </>
          ) : null}
          <div className="grid flex-1 content-start gap-1 pt-1">
            <div className="h-2 rounded bg-neutral-100" />
            <div className="h-2 rounded bg-neutral-100" />
            <div className="h-2 w-4/5 rounded bg-neutral-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
