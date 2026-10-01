'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { Button, DataTable, Switch } from '@/components/ui';
import { cn } from '@/utils/cn';
import { FROSTED } from './patterns';

/**
 * A working surface with a layer of labels and controls above it.
 *
 * The stage underneath is the thing a person manipulates (here a floor plan, in
 * a product a map, a canvas or a node graph). Above it sits an annotation layer
 * that has to cover the whole stage to place its labels and controls, and so
 * would swallow every click meant for what is beneath. The rule that resolves
 * it, and the only one:
 *
 *   the wrapper is `pointer-events-none`; each control inside it opts back in
 *   with `pointer-events-auto`, one at a time.
 *
 * So empty overlay is glass, a button on it is a button, and nobody has to
 * choose between a usable map and a usable toolbar. The layers use the named
 * stacking tokens only (`z-base`, `z-raised`) and the stage is wrapped in
 * `isolate`, so its stack cannot leak above the sticky header or below a modal;
 * a layer that needs a fourth step has a structure problem, not a number
 * problem (`brand.ts`, `layers`).
 *
 * Two things the picture of this idea does not say, so the page does:
 *   - Focus follows source order, never z-order. The stage comes first in the
 *     DOM and the controls after it, so Tab visits them in that order.
 *   - The stage works by keyboard on its own. The overlay never carries the only
 *     way to do something.
 *
 * "Outline the layers" is a specimen device that draws the three layers so the
 * structure can be read off the live component; nothing else here is staged.
 */

const ZONES = [
  'Fabric store',
  'Cutting',
  'Stitching',
  'Finishing',
  'Quality',
  'Packing',
  'Dispatch',
  'Returns',
  'Office',
  'Dye house',
  'Samples',
  'Loading',
] as const;

const LAYER_ROWS = [
  { layer: 'Stage', token: 'z-base', pointer: 'Receives it', job: 'What the person manipulates.' },
  {
    layer: 'Annotations',
    token: 'z-raised',
    pointer: 'None (passes through)',
    job: 'Labels and legends that must not block the stage.',
  },
  {
    layer: 'Controls',
    token: 'z-raised',
    pointer: 'Auto, per control',
    job: 'What the person operates, switched back on one by one.',
  },
  {
    layer: 'The rest of the page',
    token: 'z-sticky and above',
    pointer: 'Its own',
    job: 'Anything that must cover the page leaves this stack; z-raised-3 is the ceiling inside it.',
  },
];

function Tag({ children, className }: { children: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('absolute rounded bg-inverse px-1.5 py-0.5 font-mono text-2xs text-on-inverse', className)}
    >
      {children}
    </span>
  );
}

export function LayeringSpecimen() {
  const [zone, setZone] = useState<string | null>(null);
  const [outline, setOutline] = useState(false);
  const [reached, setReached] = useState({ stage: 0, controls: 0 });

  const pick = (name: string) => {
    setZone((current) => (current === name ? null : name));
    setReached((prev) => ({ ...prev, stage: prev.stage + 1 }));
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="relative isolate h-80 overflow-hidden rounded-lg bg-neutral-100">
          {/* Stage: z-base. Receives every gesture the overlay lets through. */}
          <div
            className={cn(
              'absolute inset-x-3 bottom-20 top-12 z-base grid grid-cols-3 grid-rows-4 gap-2 sm:grid-cols-4 sm:grid-rows-3',
              outline && 'outline-dashed outline-2 outline-offset-4 outline-accent',
            )}
          >
            {ZONES.map((name) => {
              const on = zone === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pick(name)}
                  className={cn(
                    'flex min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors',
                    on ? 'bg-accent text-white' : 'bg-surface text-neutral-900 shadow-raised hover:bg-neutral-50',
                  )}
                >
                  {on ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : null}
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>

          {/* Annotations and controls: z-raised. The wrapper lets everything through. */}
          <div
            className={cn(
              'pointer-events-none absolute inset-0 z-raised flex flex-col justify-between p-3',
              outline && 'bg-accent/10 outline-dashed outline-2 -outline-offset-2 outline-accent',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={cn('rounded-full px-3 py-1 text-xs font-medium text-neutral-900', FROSTED)}>Shop floor</p>
              <p className={cn('rounded-full px-3 py-1 text-xs font-medium text-neutral-900', FROSTED)}>12 zones</p>
            </div>

            <div
              className={cn(
                'pointer-events-auto relative flex flex-wrap items-center justify-between gap-3 rounded-md p-3',
                FROSTED,
                outline && 'outline-dashed outline-2 outline-accent',
              )}
            >
              <p role="status" className="min-w-0 truncate text-sm text-neutral-900">
                {zone ? `Selected: ${zone}` : 'No zone selected'}
              </p>
              <Button
                variant="secondary"
                disabled={zone === null}
                onClick={() => {
                  setZone(null);
                  setReached((prev) => ({ ...prev, controls: prev.controls + 1 }));
                }}
              >
                Clear
              </Button>
              {outline ? <Tag className="-top-2.5 end-2">controls · pointer-events-auto</Tag> : null}
            </div>
          </div>

          {outline ? (
            <>
              <Tag className="end-4 top-[2.6rem] z-raised-2">annotations · z-raised · pointer-events-none</Tag>
              <Tag className="start-4 top-[2.6rem] z-raised-2">stage · z-base</Tag>
            </>
          ) : null}
        </div>

        <p className="text-sm text-neutral-900/70">
          Clicks that reached the stage: <span className="tabular-nums text-neutral-900">{reached.stage}</span>. Clicks
          that reached a control: <span className="tabular-nums text-neutral-900">{reached.controls}</span>. Every click
          on a zone passes through the layer above it.
        </p>

        <Switch
          label="Outline the layers"
          description="Draws the three layers on the live component."
          checked={outline}
          onChange={setOutline}
          className="max-w-md"
        />
      </div>

      <ul className="m-0 grid min-w-0 list-disc content-start gap-1.5 ps-5 text-sm text-neutral-900/70">
        <li>Pass-through is on the wrapper; each control opts back in. Never the other way round.</li>
        <li>Focus follows source order, not z-order: stage first, controls after.</li>
        <li>The stage is operable by keyboard on its own. The overlay never holds the only way to act.</li>
      </ul>

      <div className="min-w-0 lg:col-span-2">
        <DataTable
          stacked
          rows={LAYER_ROWS}
          rowKey={(row) => row.layer}
          columns={[
            { header: 'Layer', cell: (row) => row.layer },
            { header: 'Token', cell: (row) => <code className="whitespace-nowrap text-xs">{row.token}</code> },
            { header: 'Pointer', muted: true, cell: (row) => row.pointer },
            { header: 'Job', muted: true, cell: (row) => row.job },
          ]}
        />
      </div>
    </div>
  );
}
