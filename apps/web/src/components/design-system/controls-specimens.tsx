'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BRAND, concentricRadius, formatDate, formatMoney } from '@newax/shared';
import { Button, CooldownBanner, DangerZone, Field, FormStack, HoldToConfirm, SuccessState } from '@/components/ui';
import { Price } from '@/components/storefront/price';
import { HOLD_MS } from '@/lib/guard';
import { Group } from './foundations';

/** The three times a submit button is in: nothing yet, working, and finished. */
type Phase = 'idle' | 'busy' | 'done';

/** How long the specimen pretends to work, and how long it holds the finished state before starting over. */
const WORK_MS = 900;
const HOLD_DONE_MS = 1600;

/**
 * The form recipe (FRM-1 to FRM-6), live: labels above, example placeholders,
 * 16 px between fields, 32 before the one filled button, a lit surface, and a
 * submit that goes ring then drawn check. Try it empty to see the error land
 * beside its field and the field give its one nudge.
 */
export function FormRecipeSpecimen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const later = (run: () => void, ms: number) => {
    timers.current.push(window.setTimeout(run, ms));
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.includes('@')) {
      setEmailError('Enter your email, like you@example.com.');
      return;
    }
    setEmailError(null);
    setPhase('busy');
    later(() => setPhase('done'), WORK_MS);
    later(() => setPhase('idle'), WORK_MS + HOLD_DONE_MS);
  }

  return (
    <div className="card-lit w-full max-w-sm p-6">
      <FormStack
        onSubmit={onSubmit}
        noValidate
        actions={
          <Button
            type="submit"
            loading={phase === 'busy'}
            loadingLabel="Signing in…"
            done={phase === 'done'}
            doneLabel="Signed in"
            className="w-full"
          >
            Sign in
          </Button>
        }
      >
        <Field label="Email" error={emailError}>
          {(control) => (
            <input
              {...control}
              type="email"
              className="field-input field-xl"
              autoComplete="off"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailError) setEmailError(null);
              }}
            />
          )}
        </Field>
        <Field label="Password">
          {(control) => (
            <input
              {...control}
              type="password"
              className="field-input field-xl"
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
      </FormStack>
    </div>
  );
}

const NOW = Date.UTC(2026, 9, 4, 9, 0, 0);
const REQUESTED = Date.UTC(2026, 9, 1, 9, 0, 0);
const LONG_AGO = Date.UTC(2026, 8, 1, 9, 0, 0);

/**
 * The danger controls (DNG-1 to DNG-6) in the states a person meets them in.
 * Nothing here deletes anything: each control reports what it would have done.
 */
export function DangerSpecimens() {
  const [last, setLast] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const did = (what: string) => async () => {
    setLast(what);
  };

  return (
    <>
      <Group
        title="Hold to confirm"
        note={`Hold the button until the ring closes (${HOLD_MS / 1000} s). Let go early and it drains and does nothing. With a keyboard, hold Space or Enter. With a screen reader, activate it twice.`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <HoldToConfirm onConfirm={did('Delete project: held to the end')}>Delete project</HoldToConfirm>
          <HoldToConfirm onConfirm={did('Void 3 sales: held to the end')}>Void 3 sales</HoldToConfirm>
          <p role="status" className="m-0 text-sm text-neutral-900/70">
            {last ?? 'Nothing confirmed yet.'}
          </p>
        </div>
      </Group>

      <Group
        title="Danger zone"
        note="Bordered, labelled and last, closed by default. The closed state says what is inside; the red edge is the only red the page spends at rest."
      >
        <DangerZone
          className="max-w-xl"
          actions={[
            {
              id: 'archive',
              title: 'Archive this recipe',
              description: 'Hides it from new orders. It stays on every order already made, and can be restored.',
              control: <HoldToConfirm onConfirm={did('Archive recipe: held to the end')}>Archive recipe</HoldToConfirm>,
            },
            {
              id: 'delete',
              title: 'Delete this recipe',
              description: 'Removes it and its version history for good. Orders already made keep their copy.',
              control: <HoldToConfirm onConfirm={did('Delete recipe: held to the end')}>Delete recipe</HoldToConfirm>,
            },
          ]}
        />
      </Group>

      <Group
        title="Cooldown"
        note="Removing a whole thing is a request with a way back: it says the day it will be gone and offers Restore on every page about it. Once the days run out it says so and offers nothing."
      >
        <div className="grid max-w-xl gap-4">
          {restored ? (
            <p role="status" className="notice notice-success m-0">
              The Karachi brand is restored. (Specimen: nothing was scheduled.)
            </p>
          ) : (
            <CooldownBanner
              subject="The Karachi brand"
              requestedAt={REQUESTED}
              now={NOW}
              onRestore={() => setRestored(true)}
            />
          )}
          <CooldownBanner
            subject="The Lahore brand"
            requestedAt={LONG_AGO}
            now={NOW}
            onRestore={() => setRestored(true)}
          />
          {restored ? (
            <Button variant="ghost" onClick={() => setRestored(false)} className="justify-self-start">
              Reset the specimen
            </Button>
          ) : null}
        </div>
      </Group>
    </>
  );
}

/**
 * The product card recipe (CRD-1 to CRD-6), drawn from the same classes and the
 * same `Price` the storefront card uses. The storefront `ProductCard` itself
 * needs a locale, a customer session and the message catalogue, none of which
 * exist on this page, so this is the recipe and `ProductCard` is its use: the
 * surface (`card-lit`), the lift (`lift`), the inset photograph that curves with
 * its card (`media-concentric`), and one accent spent on the price and the
 * button.
 */
export function CardRecipeSpecimen() {
  const cards = [
    { name: 'Three-piece lawn suit', detail: 'Lawn · 3 pieces', amount: 849900, compareAt: 999900 },
    { name: 'Embroidered kurta', detail: 'Cotton · 1 piece', amount: 459900, compareAt: null },
    { name: 'Chiffon dupatta', detail: 'Chiffon · 1 piece', amount: 189900, compareAt: null },
  ] as const;

  return (
    <div className="grid gap-8">
      <div className="stagger-fine grid max-w-3xl gap-6 sm:grid-cols-3">
        {cards.map((card) => (
          <article key={card.name} className="group lift card-lit flex flex-col p-2">
            <div className="media-concentric grid aspect-[3/4] place-items-center bg-neutral-50 px-4 text-center text-xs text-neutral-900/60">
              Photograph, inset 8 px
            </div>
            <div className="grid gap-2 px-2 pb-2 pt-4">
              <h4 className="line-clamp-2 text-base font-semibold leading-snug text-neutral-900">{card.name}</h4>
              <p className="m-0 text-xs text-neutral-500">{card.detail}</p>
              <Price
                amount={card.amount}
                compareAt={card.compareAt}
                locale={BRAND.locale.locales[0]}
                tone="accent"
                className="text-lg"
              />
              <Button className="mt-2 w-full">Quick shop</Button>
            </div>
          </article>
        ))}
      </div>

      <dl className="grid max-w-3xl gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Corners curve together</dt>
          <dd className="m-0 mt-1 text-neutral-900/70">
            An inner corner is the outer corner minus the gap: a 24 px card with an 8 px inset holds a{' '}
            <span className="tabular-nums">{concentricRadius(24, 8)}</span> px photograph. At the house shape (a 3 px
            card) the same rule gives <span className="tabular-nums">{concentricRadius(3, 8)}</span> px: square, never
            negative.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Rhythm</dt>
          <dd className="m-0 mt-1 text-neutral-900/70">
            24 between cards, 16 of body padding, 8 between lines and 8 of inset around the photograph. The title is the
            heaviest text, the details the quietest, and the price, in the one accent, is larger than both.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Motion</dt>
          <dd className="m-0 mt-1 text-neutral-900/70">
            Hover lifts the card 4 px and brings its shadow; press puts it back; the button carries the 98% press.
            Siblings arrive 40 ms apart, at most four steps.
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** The words a loop's three states are read as. The specimen is English; the storefront's come from messages/*.json. */
const LOOP_LABELS = { done: 'done', current: 'current step', next: 'still to come' } as const;

/**
 * The success state (SUC-1 to SUC-5), live: the invoice case with its one open
 * loop and its receipt, the ordinary success, and the one celebration, which a
 * milestone alone earns and which here replays on demand. Every figure goes
 * through the shared formatters and every date is pinned, so the page reads the
 * same on every visit. Nothing here sends anything: each action reports what it
 * would have done.
 */
export function SuccessSpecimens() {
  const locale = BRAND.locale.locales[0];
  const [last, setLast] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [plays, setPlays] = useState(0);

  const did = (what: string) => () => setLast(what);

  return (
    <div className="grid gap-12">
      <div className="grid gap-x-10 gap-y-14 lg:grid-cols-2 2xl:grid-cols-3">
        <div className="min-w-0">
          <h4 className="eyebrow mb-4">A record that left the product</h4>
          <SuccessState
            title="Invoice sent to Northwind Labs"
            detail={`${formatMoney(240000, locale)} · ap@northwind.example · due ${formatDate('2026-10-12T00:00:00Z', locale)}`}
            primary={{ label: 'View invoice', onClick: did('View invoice: opens the invoice') }}
            secondary={{ label: 'Send another', onClick: did('Send another: starts a new invoice') }}
            back={{ label: 'Back to invoices', href: '#controls' }}
            loop={{
              steps: [
                { label: 'Sent', state: 'done' },
                { label: 'Opened', state: 'current' },
                { label: 'Paid', state: 'next' },
              ],
              labels: LOOP_LABELS,
              aside: (
                <Button variant="ghost" onClick={() => setWatching((current) => !current)} aria-pressed={watching}>
                  {watching ? 'We will notify you' : 'Notify me'}
                </Button>
              ),
            }}
            receipt={['Receipt emailed', 'Copy kept in Documents']}
          />
        </div>

        <div className="min-w-0">
          <h4 className="eyebrow mb-4">An ordinary success</h4>
          <SuccessState
            title="Supplier Al-Noor Textiles added"
            detail={`Net 30 · added ${formatDate('2026-10-04T00:00:00Z', locale)}`}
            primary={{ label: 'View supplier', onClick: did('View supplier: opens the supplier') }}
            back={{ label: 'Back to suppliers', href: '#controls' }}
          />
        </div>

        <div className="min-w-0">
          <h4 className="eyebrow mb-4">A milestone, once</h4>
          <SuccessState
            key={plays}
            celebrate
            title="First invoice paid"
            detail={`Northwind Labs paid ${formatMoney(240000, locale)} on ${formatDate('2026-10-09T00:00:00Z', locale)}`}
            primary={{ label: 'View payment', onClick: did('View payment: opens the payment') }}
            back={{ label: 'Back to invoices', href: '#controls' }}
          />
          <div className="mt-6 flex justify-center">
            <Button variant="secondary" onClick={() => setPlays((count) => count + 1)}>
              Replay
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <p role="status" className="m-0 text-sm text-neutral-900/70">
          {last ?? 'Nothing pressed yet.'}
        </p>
        <p className="m-0 max-w-prose text-sm text-neutral-900/70">
          It refuses what would make it a dead end: with no primary action it renders nothing. Celebrating is the
          caller&rsquo;s claim of a milestone, never the default, and no screen makes it yet because the record of
          milestones does not exist.
        </p>
      </div>
    </div>
  );
}
