'use client';

import { useEffect, useId, useState } from 'react';
import { Bell, CircleCheck, Pencil, Trash2 } from 'lucide-react';
import { formatMoney, formatNumber } from '@newax/shared';
import {
  Badge,
  Bento,
  BentoTile,
  Button,
  CountUp,
  Dialog,
  DrawIcon,
  ProgressBar,
  ProgressRing,
  ScrambleText,
  Segmented,
  Tabs,
  TruncateReveal,
  TypeText,
  type BadgeTone,
} from '@/components/ui';
import { ToastStack } from '@/components/admin/toast-stack';
import { StatusBadge } from '@/components/common/status-badge';
import { Wizard } from '@/components/common/wizard';
import { useFreshOnChange } from '@/hooks/use-fresh-on-change';
import { useToast } from '@/hooks/use-toast';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { cn } from '@/utils/cn';
import { Group } from './foundations';

type Tier = 'Functional' | 'Expressive' | 'Not adopted';

/**
 * Every motion measured in the reference reel, and what it became here. The
 * column that matters is the second: a motion is kept only for what it tells the
 * reader (`05-motion.md`, "What motion may communicate"). The tier is the rule
 * for where it may appear: functional motion is everywhere, because it is what
 * the controls themselves do; expressive motion is opt-in and sits only where
 * the product has a moment worth marking.
 */
const REEL: readonly { motion: string; says: string; lives: string; tier: Tier }[] = [
  {
    motion: 'Zoom-blur arrive',
    says: 'This is new, and it is here now.',
    lives:
      'Arrive: cards, dialogs, popovers, notices, toasts. The blur is dropped; opacity, 8px of travel and 3% of scale carry it.',
    tier: 'Functional',
  },
  {
    motion: 'Directional smear between scenes',
    says: 'You went somewhere else.',
    lives: 'PageEnter: every admin and storefront page rises into place on navigation.',
    tier: 'Functional',
  },
  {
    motion: 'Pill cascade from the edge',
    says: 'These belong together, and they are in order.',
    lives: 'The 80ms stagger, capped at four steps (.stagger, RevealScope); a side sheet slides in from its own edge.',
    tier: 'Functional',
  },
  {
    motion: 'Staggered cards in, blur out',
    says: 'A board assembling where you are looking.',
    lives: 'RevealScope on Bento; every exit is the same leave at the fast duration.',
    tier: 'Functional',
  },
  {
    motion: 'Glow bloom',
    says: 'This control now has your attention.',
    lives: 'The focus ring eases in on every field and control instead of popping.',
    tier: 'Functional',
  },
  {
    motion: 'Clock-hand sweep',
    says: 'Working, or running out.',
    lives: 'The loading ring on buttons and Loading; the draining line on a toast.',
    tier: 'Functional',
  },
  {
    motion: 'Press and release (not in the reel)',
    says: 'Your click landed, this frame.',
    lives: 'Buttons, chips, icon buttons, segmented options sink 2px and shrink 2% for one frame (ACT-3).',
    tier: 'Functional',
  },
  {
    motion: 'Counter ring with count-up',
    says: 'How much, and that it was just computed.',
    lives: 'ProgressRing (the undo countdown) and CountUp (the profit and loss figures).',
    tier: 'Expressive',
  },
  {
    motion: 'Lock-on corner brackets',
    says: 'This is the one being worked on.',
    lives: 'focus-frame: the selected node of the approval flow.',
    tier: 'Expressive',
  },
  {
    motion: 'Text scramble decode',
    says: 'The system just produced this value.',
    lives: 'ScrambleText: the order number on the confirmation page.',
    tier: 'Expressive',
  },
  {
    motion: 'Typewriter with accent word',
    says: 'Something is being said to you.',
    lives: 'TypeText, for a line of up to 80 characters. No product screen uses it yet.',
    tier: 'Expressive',
  },
  {
    motion: 'Highlight sweep across a changed value',
    says: 'This just changed.',
    lives:
      'The sheen: a dashboard tile whose figure changes when the range does, and a new row in the activity feed. One pass, 420ms, in the accent ink at 14%.',
    tier: 'Functional',
  },
  {
    motion: 'A label that hands over in place',
    says: 'The same thing, now different.',
    lives: 'SwapText inside StatusBadge: the old label rises out, the new one rises in, 4px each.',
    tier: 'Functional',
  },
  {
    motion: 'Progress bars: head, complete, failed, LED cells',
    says: 'How much of the whole, and how it ended.',
    lives:
      'ProgressBar: the ranking in Reports and the tailor load in Stitching (over capacity turns negative). Head and segmented are options.',
    tier: 'Functional',
  },
  {
    motion: 'Labels that scroll to show their end',
    says: 'There is more, and here it is.',
    lives: 'TruncateReveal on hover: ranking labels and tailor names, at 48px per second, never over five seconds.',
    tier: 'Functional',
  },
  {
    motion: 'Step slides in from the way you are going',
    says: 'You moved forward, or you moved back.',
    lives: 'Wizard: the next step rises into place, the previous one drops into place.',
    tier: 'Functional',
  },
  {
    motion: 'Popup that opens out of its trigger',
    says: 'This came from there.',
    lives: 'Dialog: the panel arrives from the side of the control that opened it, up to 64px.',
    tier: 'Functional',
  },
  {
    motion: 'Error outline that flashes once',
    says: 'Something is wrong, here.',
    lives: 'An announced error notice and an error toast: a 2px inset ring in the negative colour that fades over 320ms.',
    tier: 'Functional',
  },
  {
    motion: 'Badge that pops when its count changes',
    says: 'The number changed.',
    lives: 'The cart count: it grows from 60% and settles; it does not bounce.',
    tier: 'Functional',
  },
  {
    motion: 'Charts that draw, then answer the pointer',
    says: 'Data being plotted; this is the point you are on.',
    lives:
      'Every chart: lines and bars draw over 420ms with series 80ms apart, markers pop as the line reaches them, a crosshair or band follows the pointer, a tooltip glides, a donut slice is haloed.',
    tier: 'Expressive',
  },
  {
    motion: 'Icon strokes that draw themselves',
    says: 'This just happened.',
    lives: 'DrawIcon: the confirmation tick on the verify-email and unsubscribe pages.',
    tier: 'Expressive',
  },
  {
    motion: 'Odometer digits',
    says: 'The one figure that matters, resolving.',
    lives: 'CountUp mode="reel": the net profit on the profit and loss page.',
    tier: 'Expressive',
  },
  {
    motion: 'Words appear one by one',
    says: 'A sentence being said.',
    lives: 'TypeText unit="word", for a line of up to 80 characters. No product screen uses it yet.',
    tier: 'Expressive',
  },
  {
    motion: 'Playhead scrubbing a timeline',
    says: 'Nothing the product has a place for.',
    lives: 'There is no timeline view to carry it. Not adopted.',
    tier: 'Not adopted',
  },
  {
    motion: 'Icon that wipes open to its label',
    says: 'Nothing a label does not already say.',
    lives: 'It animates a clip-path, which is paint and not transform or opacity (MOT-5). Not adopted.',
    tier: 'Not adopted',
  },
  {
    motion: 'Bounce, overshoot, tilt and camera zoom',
    says: 'Nothing.',
    lives: 'Motion that says nothing a business control should say. Not adopted.',
    tier: 'Not adopted',
  },
  {
    motion: 'Draw-on highlight ring with dimmed siblings',
    says: 'Look at this one, not those.',
    lives:
      'The draw-on is the ring above. Dimming the siblings is not adopted: it drops their text under the contrast floor.',
    tier: 'Not adopted',
  },
  {
    motion: 'Hexagon pop with a leader line',
    says: 'Nothing the product has to say.',
    lives: 'A brand shape and a line to nothing. Not adopted.',
    tier: 'Not adopted',
  },
  {
    motion: 'Floating particles and ambient arcs',
    says: 'Nothing.',
    lives: 'Decoration, which Law 6 removes. Not adopted.',
    tier: 'Not adopted',
  },
];

const TIER_TONE: Record<Tier, BadgeTone> = { Functional: 'success', Expressive: 'info', 'Not adopted': 'neutral' };

/** A button that remounts its children, so each specimen can be replayed. */
function Replay({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      Replay
    </Button>
  );
}

export function MotionSpecimens() {
  const reduced = usePrefersReducedMotion();
  return (
    <>
      <Group
        title="What the reels became"
        note={
          reduced
            ? 'Your system asks for reduced motion, so every specimen below shows its end state at once. Nothing is missing: the state arrives, the travel does not.'
            : 'Your system allows motion. With reduced motion on, every specimen below shows its end state at once and loses nothing but the travel.'
        }
      >
        <div className="overflow-x-auto">
          <table className="table-flat">
            <caption className="sr-only">Each motion in the reference reel, what it says, and where it lives</caption>
            <thead>
              <tr>
                <th scope="col">Motion in the reel</th>
                <th scope="col">What it says</th>
                <th scope="col">Where it lives here</th>
                <th scope="col">Tier</th>
              </tr>
            </thead>
            <tbody>
              {REEL.map((row) => (
                <tr key={row.motion}>
                  <th scope="row" className="min-w-40 text-start font-medium">
                    {row.motion}
                  </th>
                  <td className="min-w-40">{row.says}</td>
                  <td className="min-w-64">{row.lives}</td>
                  <td>
                    <Badge tone={TIER_TONE[row.tier]}>{row.tier}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Group>

      <Group
        title="Buttons and small controls"
        note="Press one and hold it. A button sinks 2px and shrinks 2% in one frame, fills on hover, and shows a ring the moment it has taken a click."
      >
        <ControlsSpecimen />
      </Group>

      <Group
        title="Fields and errors"
        note="A field that turns invalid gives one 4px shake and turns to the feedback colour; the message arrives with it. The shake replays each time it goes from valid to invalid."
      >
        <FieldSpecimen />
      </Group>

      <Group
        title="Cards, notices and toasts"
        note="A card that does something rises and comes back down when pressed. A notice that is announced arrives; an error then gives one shake. A toast arrives, drains a line for as long as it will stay, and leaves."
      >
        <SurfacesSpecimen />
      </Group>

      <Group
        title="Popups"
        note="A dialog settles in and leaves quickly; a side sheet slides in from its own edge, in either direction of writing. While one is leaving, the page behind is already yours."
      >
        <PopupSpecimen />
      </Group>

      <Group
        title="Tabs and segmented options"
        note="The tab underline is one element that glides between tabs. A segmented option fills in and presses like any other control."
      >
        <TabsSpecimen />
      </Group>

      <Group
        title="The expressive tier"
        note="Opt in, one purpose each, bounded. A figure counts, a ring fills, a board assembles as it scrolls into view, the chosen thing is locked on, a value decodes, a line is typed."
      >
        <ExpressiveSpecimen />
      </Group>
      <Group
        title="Quantities and changes"
        note="A bar fills to its share and eases to each new value. A figure that changes is marked once: a sweep across the tile, a label that hands over, a count that pops, digits that roll."
      >
        <QuantitySpecimen />
      </Group>

      <Group
        title="Hand-offs and reveals"
        note="A step comes from the way you are going; a popup comes out of its trigger; a long label scrolls to its end under the pointer; a tick draws itself; a line arrives word by word."
      >
        <HandOffSpecimen />
      </Group>
    </>
  );
}

/* ── functional ─────────────────────────────────────────────────────────── */

function ControlsSpecimen() {
  const [busy, setBusy] = useState(false);
  const [chip, setChip] = useState('all');

  // The click is acknowledged at once; the result takes as long as it takes.
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setBusy(false), 1600);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <div className="card grid gap-5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Delete</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={busy} loadingLabel="Saving…" onClick={() => setBusy(true)}>
          Save changes
        </Button>
        <span className="text-sm text-neutral-900/70">Click to see the ring. It clears itself after 1.6 seconds.</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {['all', 'open', 'paid'].map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={chip === value}
            onClick={() => setChip(value)}
            className={cn('chip', chip === value ? 'chip-selected' : 'chip-unselected')}
          >
            {value}
          </button>
        ))}
        <button type="button" className="icon-btn" aria-label="Edit">
          <Pencil aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" className="icon-btn" aria-label="Delete">
          <Trash2 aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FieldSpecimen() {
  const id = useId();
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const invalid = checked && value.trim() === '';

  return (
    <div className="card grid max-w-md gap-3 p-4">
      <div>
        <label className="field-label" htmlFor={`${id}-name`}>
          Branch name
        </label>
        <input
          id={`${id}-name`}
          className="field-input"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {invalid ? (
        <p id={`${id}-err`} role="alert" className="notice notice-error">
          Enter a branch name. It is how people find this branch in lists and reports.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setChecked(true)}>Check</Button>
        <Button
          variant="ghost"
          onClick={() => {
            setChecked(false);
            setValue('');
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}

function SurfacesSpecimen() {
  const { toasts, add, remove } = useToast();
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; n: number } | null>(null);
  const show = (tone: 'error' | 'success' | 'info') => setNotice((prev) => ({ tone, n: (prev?.n ?? 0) + 1 }));

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" className="card lift p-4 text-start">
          <span className="eyebrow">Open card</span>
          <span className="mt-1 block text-sm font-medium text-neutral-900">Rises on hover and focus</span>
          <span className="mt-1 block text-sm text-neutral-900/70">Press it: it comes back down.</span>
        </button>
        <div className="card p-4">
          <p className="eyebrow">Static card</p>
          <p className="mt-1 text-sm text-neutral-900/70">A panel with nothing to do sits still.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => show('error')}>
          Show an error
        </Button>
        <Button variant="secondary" onClick={() => show('success')}>
          Show a success
        </Button>
        <Button variant="secondary" onClick={() => show('info')}>
          Show a note
        </Button>
        <Button variant="secondary" onClick={() => add('Invoice INV-2041 was sent.', 'success')}>
          <Bell aria-hidden="true" className="h-4 w-4" />
          Show a toast
        </Button>
        <Button variant="secondary" onClick={() => add('The mail service refused it. Try again.', 'error', 6000)}>
          Show an error toast
        </Button>
      </div>

      {notice ? (
        <p
          key={notice.n}
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={cn('notice', `notice-${notice.tone}`)}
        >
          {notice.tone === 'error'
            ? 'We could not save this. Your changes are kept; check the connection and try again.'
            : notice.tone === 'success'
              ? 'Saved. Everyone with access sees the change now.'
              : 'Nothing has changed yet.'}
        </p>
      ) : null}
      <ToastStack toasts={toasts} onDismiss={remove} />
    </div>
  );
}

function PopupSpecimen() {
  const [open, setOpen] = useState<'dialog' | 'sheet' | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setOpen('dialog')}>
        Open a dialog
      </Button>
      <Button variant="secondary" onClick={() => setOpen('sheet')}>
        Open a side sheet
      </Button>
      <Dialog
        open={open === 'dialog'}
        onClose={() => setOpen(null)}
        title="Discard these changes?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Keep editing
            </Button>
            <Button variant="danger" onClick={() => setOpen(null)}>
              Discard
            </Button>
          </div>
        }
      >
        <p className="text-sm text-neutral-900/70">Four edits on this page have not been saved.</p>
      </Dialog>
      <Dialog open={open === 'sheet'} onClose={() => setOpen(null)} title="Order ORD-2041" align="end">
        <p className="text-sm text-neutral-900/70">
          The detail of one row, opened without leaving the list. Close it with Escape, the backdrop or the button.
        </p>
      </Dialog>
    </div>
  );
}

function TabsSpecimen() {
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  return (
    <div className="card grid gap-4 p-4">
      <Tabs
        label="Order sections"
        items={[
          {
            key: 'summary',
            label: 'Summary',
            content: <p className="text-sm text-neutral-900/70">Totals and status.</p>,
          },
          {
            key: 'payments',
            label: 'Payments',
            badge: 2,
            content: <p className="text-sm text-neutral-900/70">Two payments, one refund.</p>,
          },
          {
            key: 'fulfilment',
            label: 'Fulfilment',
            content: <p className="text-sm text-neutral-900/70">Packed, waiting for the courier.</p>,
          },
        ]}
      />
      <Segmented
        label="Range"
        value={range}
        onChange={setRange}
        options={[
          { value: '7d', label: '7 days' },
          { value: '30d', label: '30 days' },
          { value: '90d', label: '90 days' },
        ]}
      />
    </div>
  );
}

/* ── expressive ─────────────────────────────────────────────────────────── */

const FIGURES = [1284500, 459900, 7311000] as const;

function ExpressiveSpecimen() {
  const [figure, setFigure] = useState(0);
  const [fraction, setFraction] = useState(0.62);
  const [board, setBoard] = useState(0);
  const [lock, setLock] = useState(1);
  const [text, setText] = useState(0);
  const sliderId = useId();

  return (
    <div className="grid gap-6">
      <div className="card flex flex-wrap items-center gap-x-8 gap-y-4 p-4">
        <div>
          <p className="eyebrow">Revenue</p>
          <p className="mt-1 text-2xl font-medium text-neutral-900">
            <CountUp value={FIGURES[figure]!} format={(n) => formatMoney(Math.round(n))} />
          </p>
        </div>
        <div>
          <p className="eyebrow">Orders</p>
          <p className="mt-1 text-2xl font-medium text-neutral-900">
            <CountUp value={FIGURES[figure]! / 1000} format={(n) => formatNumber(Math.round(n))} />
          </p>
        </div>
        <Button variant="secondary" onClick={() => setFigure((f) => (f + 1) % FIGURES.length)}>
          Change the figures
        </Button>
        <div className="flex items-center gap-3">
          <ProgressRing value={fraction} label="Quota used" size={48} stroke={4}>
            {Math.round(fraction * 100)}
          </ProgressRing>
          <div>
            <label className="field-label" htmlFor={sliderId}>
              Quota used
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={100}
              value={Math.round(fraction * 100)}
              onChange={(event) => setFraction(Number(event.target.value) / 100)}
            />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="eyebrow">Board, assembling as it enters view</p>
          <Replay onClick={() => setBoard((b) => b + 1)} />
        </div>
        <Bento key={board} className="xl:grid-cols-3">
          {['Orders', 'Returns', 'Stock', 'Payables', 'Receivables', 'Cash'].map((label, index) => (
            <BentoTile key={label} title={label} tone={index === 0 ? 'quiet' : 'surface'}>
              <p className="text-lg font-medium tabular-nums text-neutral-900">{formatNumber(120 + index * 37)}</p>
            </BentoTile>
          ))}
        </Bento>
      </div>

      <div>
        <p className="eyebrow mb-2">Lock-on: choose the one being worked on</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {['Check amount', 'Branch manager', 'Finance director'].map((label, index) => (
            <button
              key={label}
              type="button"
              aria-pressed={lock === index}
              data-active={lock === index}
              onClick={() => setLock(index)}
              className="focus-frame card p-4 text-start text-sm font-medium text-neutral-900"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card grid gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Decode and type</p>
          <Replay onClick={() => setText((t) => t + 1)} />
        </div>
        <p className="text-sm text-neutral-900">
          Order number: <ScrambleText key={`s${text}`} text="ORD-2041-LHR" className="font-medium tabular-nums" />
        </p>
        <p className="text-sm text-neutral-900">
          <TypeText key={`t${text}`} text="Three invoices are overdue and one needs your approval." />
        </p>
      </div>
    </div>
  );
}

/* ── from the seven reels ───────────────────────────────────────────────── */

const STATUSES = ['PENDING', 'PAID', 'DELIVERED'] as const;
const TOTALS = [128400, 131900, 127300] as const;

function QuantitySpecimen() {
  const [value, setValue] = useState(64);
  const [step, setStep] = useState(0);
  const [count, setCount] = useState(2);
  const sliderId = useId();
  const total = TOTALS[step % TOTALS.length]!;
  const fresh = useFreshOnChange(total);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card grid content-start gap-4 p-4">
        <div>
          <label className="field-label" htmlFor={sliderId}>
            Progress
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(event) => setValue(Number(event.target.value))}
          />
        </div>
        <ProgressBar label="Upload" value={value} valueText={`${value} percent`} />
        <ProgressBar label="Upload with head" value={value} valueText={`${value} percent`} head />
        <ProgressBar label="Upload in cells" value={value} valueText={`${value} percent`} segmented />
        <ProgressBar
          label="Import"
          value={value}
          valueText={value >= 100 ? 'Complete' : `${value} percent`}
          tone={value >= 100 ? 'positive' : undefined}
        />
        <ProgressBar label="Sync" value={40} valueText="Failed at 40 percent" tone="negative" />
        <p className="text-xs text-neutral-900/70">Slide to 100 for the complete tone. The last bar is a failure.</p>
      </div>

      <div className="grid content-start gap-4">
        <div className="card sheen p-4" data-fresh={fresh ? 'true' : undefined}>
          <p className="eyebrow">Net revenue</p>
          <p className="mt-1 text-2xl font-medium tabular-nums text-neutral-900">{formatMoney(total)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={STATUSES[step % STATUSES.length]!} />
            <Button variant="secondary" onClick={() => setStep((n) => n + 1)}>
              Change both
            </Button>
          </div>
        </div>

        <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
          <div>
            <p className="eyebrow">Net profit, reel</p>
            <p className="mt-1 text-2xl font-medium text-neutral-900">
              <CountUp mode="reel" value={total * 3} format={(n) => formatMoney(Math.round(n))} />
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500">
              <Bell aria-hidden="true" className="h-5 w-5" />
              {count > 0 ? (
                <span
                  key={count}
                  className="pop absolute -top-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-inverse px-1 text-xs font-bold text-on-inverse"
                >
                  {count}
                </span>
              ) : null}
            </span>
            <Button variant="secondary" onClick={() => setCount((n) => n + 1)}>
              Add one
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HandOffSpecimen() {
  const [open, setOpen] = useState<'start' | 'end' | null>(null);
  const [replay, setReplay] = useState(0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card grid content-start gap-3 p-4">
        <p className="eyebrow">Steps, in the direction of travel</p>
        <Wizard
          steps={[
            { id: 'a', label: 'Details', content: <p className="text-sm text-neutral-900/70">Who is it for?</p>, isValid: true },
            { id: 'b', label: 'Items', content: <p className="text-sm text-neutral-900/70">What is going out?</p>, isValid: true },
            { id: 'c', label: 'Review', content: <p className="text-sm text-neutral-900/70">Check it, then send.</p>, isValid: true },
          ]}
          onSubmit={() => undefined}
          submitLabel="Send"
        />
      </div>

      <div className="grid content-start gap-4">
        <div className="card grid gap-3 p-4">
          <p className="eyebrow">Popup from its trigger</p>
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setOpen('start')}>
              From the start
            </Button>
            <Button variant="secondary" onClick={() => setOpen('end')}>
              From the end
            </Button>
          </div>
          <Dialog
            open={open !== null}
            onClose={() => setOpen(null)}
            title="Where did this come from?"
            footer={
              <div className="flex justify-end">
                <Button variant="secondary" onClick={() => setOpen(null)}>
                  Close
                </Button>
              </div>
            }
          >
            <p className="text-sm text-neutral-900/70">
              It arrived from the side of the button you used. Where nothing had focus, it rises from below.
            </p>
          </Dialog>
        </div>

        <div className="card grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Draw, reveal, word by word</p>
            <Replay onClick={() => setReplay((n) => n + 1)} />
          </div>
          <div className="flex items-center gap-3 text-feedback-positive">
            <DrawIcon key={`d${replay}`}>
              <CircleCheck aria-hidden="true" className="h-8 w-8" />
            </DrawIcon>
            <span className="text-sm text-neutral-900">Your email address is confirmed.</span>
          </div>
          <div className="w-44 text-sm text-neutral-900">
            <TruncateReveal text="Hover to read: Anwar Ali Stitching and Alterations Workshop" />
          </div>
          <p className="text-sm text-neutral-900">
            <TypeText key={`w${replay}`} unit="word" text="Three invoices are overdue and one needs your approval." />
          </p>
        </div>
      </div>
    </div>
  );
}
