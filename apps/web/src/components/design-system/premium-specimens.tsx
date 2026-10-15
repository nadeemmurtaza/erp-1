'use client';

import { useState } from 'react';
import { Gavel, Package, ShoppingCart, Sparkles, Users, Wallet, Waves } from 'lucide-react';
import { TONE_NAMES, formatMoney } from '@newax/shared';
import { Badge, Button, CountUp, IconTile } from '@/components/ui';
import { useTilt } from '@/components/ui/tilt';
import { cn } from '@/utils/cn';
import { Group } from './foundations';

const GLYPHS = [ShoppingCart, Package, Wallet, Users, Gavel, Waves, Sparkles] as const;

/**
 * The colour-and-life pass (ADR-083, twelfth addendum), each part as the real class or component:
 * the seven tones on their tiles, a card that lifts and leans, the live dot, the badge that
 * breathes, the primary button's glow and shine, and the price reel. Hover and focus things;
 * nothing here moves on its own except the two ambient loops (the live dot and the breathing badge),
 * and under reduced motion those hold still at their end state.
 */
export function PremiumSpecimens() {
  return (
    <>
      <Group
        className="lg:col-span-2"
        title="Tones on tiles"
        note="Seven tones, one per kind of thing: a glyph on its own wash, with a 1px ring in its own colour. Colour tells which kind, never good or bad, and the label is always beside it."
      >
        <ul className="grid grid-cols-4 gap-x-4 gap-y-5 sm:grid-cols-7">
          {TONE_NAMES.map((tone, index) => {
            const Glyph = GLYPHS[index % GLYPHS.length]!;
            return (
              <li key={tone} className="flex min-w-0 flex-col items-start gap-2">
                <IconTile icon={Glyph} tone={tone} size="lg" />
                <p className="text-xs font-medium text-neutral-900">{tone}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap items-end gap-4">
          {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
            <div key={size} className="flex flex-col items-start gap-2">
              <IconTile icon={Wallet} tone="emerald" size={size} />
              <p className="text-xs text-neutral-900/70">{size}</p>
            </div>
          ))}
        </div>
      </Group>

      <Group
        title="Lift and lean"
        note="A card the pointer is over rises on a shadow, leans toward the pointer by at most 4 degrees, and its tile tips and glows. Fine pointers only; a finger or reduced motion sees none of it."
      >
        <LeanCard />
      </Group>

      <Group
        title="Live"
        note="The dot is the information and stays; the ring leaving it every 2 seconds is the heartbeat. The badge breathes a halo in its own status colour once every 3.6 seconds while time is short, one per screen."
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <p className="flex items-center gap-2 text-sm text-neutral-900/70">
            <span className="live-dot" aria-hidden="true" />
            Updating live
          </p>
          <Badge tone="warning" className="breathe [--tone-ink:var(--color-amber-600)]">
            Closing soon
          </Badge>
        </div>
      </Group>

      <Group
        title="Glow and shine"
        note="The one loud button sits on a soft glow in its own colour and, on hover, a highlight sweeps across it once. Every other button is quiet."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Place bid</Button>
          <Button variant="secondary">Watch lot</Button>
        </div>
      </Group>

      <Group title="Price reel" note="The one figure a screen is about counts to its value; press to see it settle again.">
        <PriceReel />
      </Group>
    </>
  );
}

function LeanCard() {
  const tilt = useTilt<HTMLDivElement>();
  return (
    <div
      ref={tilt.ref}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={tilt.onPointerLeave}
      data-tone="indigo"
      className={cn('lift tilt card group flex max-w-sm items-center gap-4 p-5')}
    >
      <IconTile icon={Gavel} tone="indigo" size="lg" />
      <div className="min-w-0">
        <p className="font-medium text-neutral-900">Auctions</p>
        <p className="text-sm text-neutral-900/70">Hover this card: it lifts, leans and the tile tips.</p>
      </div>
    </div>
  );
}

function PriceReel() {
  const [run, setRun] = useState(0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <p className="text-3xl font-semibold tabular-nums text-neutral-900">
        <CountUp key={run} mode="reel" value={275625} format={(n) => formatMoney(Math.round(n))} />
      </p>
      <Button variant="secondary" onClick={() => setRun((n) => n + 1)}>
        Replay
      </Button>
    </div>
  );
}
