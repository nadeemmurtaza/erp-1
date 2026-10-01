'use client';

import { useEffect, useId, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, FileText, LoaderCircle, Send, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react';
import { formatDate, formatMoney, toMinor } from '@newax/shared';
import { ROUTES } from '@/constants/routes';
import { Badge, Button, Disclosure, Segmented } from '@/components/ui';
import { cn } from '@/utils/cn';
import {
  FAILURE_COPY,
  INITIAL_DISPATCH,
  UNDO_WINDOW_MS,
  dispatchBadge,
  dispatchReducer,
  idempotencyKey,
  type DispatchEvent,
  type DispatchState,
  type FailureKind,
} from './dispatch-machine';

/**
 * A one-click send that never lies about what it has done.
 *
 * Pressing Send answers in the same frame (`ACT-3`): the badge changes and the
 * button becomes Undo. For `UNDO_WINDOW_MS` nothing has left, so a wrong partner
 * is a one-click mistake, not an email. After that the work is the mail
 * service's and the page says "Sending" until it is told otherwise; it says
 * "Sent" only when the mail service has taken the message, and never "Delivered",
 * which is a claim about someone else's inbox. When the job comes back refused,
 * the failure says what happened, why, and the one next step, and a retry carries
 * the same idempotency key so the partner can never get two copies.
 *
 * The mockup this came from flipped to "Dispatched" before anything had been
 * handed over and had nowhere to go when the job failed. Both are states here
 * (`dispatch-machine.ts`, with the moves between them pinned by its spec).
 *
 * Specimen only: nothing is sent. The outcome of the next send is chosen with the
 * control at the foot, because a real failure arrives only when it arrives. There
 * is no send endpoint yet: `admin/invoices` creates and reads under `orders.manage`.
 * A real one is its own work order (a route the server checks, a decision whether
 * `orders.manage` is enough or a key of its own, and an outbox handler that sends
 * the mail), named in ADR-083 and not stubbed here.
 */

const INVOICE_ID = 'inv-2026-0142';
const INVOICE_NUMBER = 'INV-2026-0142';
const PARTNER = 'Amna Traders Pvt Ltd';
const TOTAL = formatMoney(toMinor(84_500));
const DUE = new Date('2026-10-31T09:00:00Z');
/** The simulated mail service's latency. A real one is whatever it is. */
const HANDOFF_MS = 1400;
const TICK_MS = 250;
const PIPS = UNDO_WINDOW_MS / 1000;

type Outcome = 'ok' | FailureKind;

interface Entry {
  id: number;
  at: number;
  text: string;
}

interface Ledger {
  state: DispatchState;
  log: Entry[];
  origin: number;
}

type LedgerEvent = DispatchEvent & { at: number };

const FRESH: Ledger = { state: INITIAL_DISPATCH, log: [], origin: 0 };

/** What a move is called in the ledger, from where it started to where it ended. Nothing for a refused move. */
function describe(prev: DispatchState, next: DispatchState): string | null {
  if (prev === next) return null;
  switch (`${prev.phase}>${next.phase}`) {
    case 'draft>undoable': {
      return `Send requested. Key ${idempotencyKey(INVOICE_ID, next)}.`;
    }
    case 'undoable>draft':
      return 'Undone before anything left.';
    case 'undoable>inflight':
      return 'Undo window closed. Handed to the mail service.';
    case 'inflight>sent':
      return 'The mail service accepted it.';
    case 'inflight>failed':
      return next.phase === 'failed' ? FAILURE_COPY[next.kind].why : null;
    case 'failed>inflight':
      return next.phase === 'inflight' ? `Retry ${next.attempt}, same key.` : null;
    case 'failed>draft':
      return 'Back to draft to correct it.';
    default:
      return null;
  }
}

function ledgerReducer(ledger: Ledger, event: LedgerEvent | { type: 'reset' }): Ledger {
  if (event.type === 'reset') return FRESH;
  const next = dispatchReducer(ledger.state, event);
  const text = describe(ledger.state, next);
  if (text === null) return next === ledger.state ? ledger : { ...ledger, state: next };
  const origin = event.type === 'send' ? event.at : ledger.origin;
  return { state: next, origin, log: [...ledger.log, { id: ledger.log.length + 1, at: event.at - origin, text }] };
}

const ICON: Record<string, LucideIcon> = {
  Draft: FileText,
  Sending: LoaderCircle,
  Sent: CircleCheck,
  Failed: TriangleAlert,
};

const OUTCOMES: readonly { value: Outcome; label: string }[] = [
  { value: 'ok', label: 'Succeeds' },
  { value: 'bounced', label: 'Address bounces' },
  { value: 'unavailable', label: 'Mail service down' },
];

const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());

export function DispatchFlowSpecimen() {
  const id = useId();
  const [ledger, act] = useReducer(ledgerReducer, FRESH);
  const [outcome, setOutcome] = useState<Outcome>('ok');
  const [email, setEmail] = useState('accounts@example.com');
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(0);
  const { state, log } = ledger;

  const badge = dispatchBadge(state);
  const BadgeIcon = ICON[badge.label]!;
  const busy = state.phase === 'undoable' || state.phase === 'inflight';
  const key = idempotencyKey(INVOICE_ID, state);
  const left = Math.max(0, Math.ceil((UNDO_WINDOW_MS - elapsed) / 1000));

  const at = () => Date.now();
  const send = () => {
    started.current = Date.now();
    setElapsed(0);
    act({ type: 'send', at: started.current });
  };

  // The undo window: a clock for the pips, and the move that closes it.
  useEffect(() => {
    if (state.phase !== 'undoable') return;
    const handle = setInterval(() => {
      const spent = Date.now() - started.current;
      setElapsed(spent);
      if (spent >= UNDO_WINDOW_MS) {
        clearInterval(handle);
        act({ type: 'window-elapsed', at: Date.now() });
      }
    }, TICK_MS);
    return () => clearInterval(handle);
  }, [state.phase]);

  // The mail service answering, once per attempt.
  const attempt = state.phase === 'inflight' ? state.attempt : 0;
  useEffect(() => {
    if (attempt === 0) return;
    const handle = setTimeout(
      () =>
        act(
          outcome === 'ok'
            ? { type: 'delivered', at: Date.now() }
            : { type: 'rejected', kind: outcome, at: Date.now() },
        ),
      HANDOFF_MS,
    );
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the outcome is read when the attempt starts; changing it mid-flight must not restart the clock.
  }, [attempt]);

  const statusLine =
    state.phase === 'draft'
      ? ''
      : state.phase === 'undoable'
        ? `Sending to ${PARTNER}. You can undo for ${PIPS} seconds.`
        : state.phase === 'inflight'
          ? 'The undo window has closed. The mail service has it.'
          : state.phase === 'sent'
            ? `Sent to ${email}. The mail service accepted it.`
            : FAILURE_COPY[state.kind].what;

  const failure = state.phase === 'failed' ? FAILURE_COPY[state.kind] : null;
  const canSend = isEmail(email);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="grid min-w-0 content-start gap-4">
        <section aria-labelledby={`${id}-inv`} className="card grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 id={`${id}-inv`} className="eyebrow">
                Invoice
              </h4>
              <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{INVOICE_NUMBER}</p>
              <p className="text-sm text-neutral-900/70">{PARTNER}</p>
            </div>
            <Badge tone={badge.tone}>
              <BadgeIcon
                aria-hidden="true"
                className={cn('h-3 w-3', badge.label === 'Sending' && 'motion-safe:animate-spin')}
              />
              {badge.label}
            </Badge>
          </div>

          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-900/70">Total</dt>
              <dd className="m-0 text-lg font-semibold tabular-nums text-neutral-900">{TOTAL}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-900/70">Due</dt>
              <dd className="m-0 text-lg font-semibold tabular-nums text-neutral-900">{formatDate(DUE)}</dd>
            </div>
          </dl>

          <div>
            <label className="field-label" htmlFor={`${id}-to`}>
              Send to
            </label>
            <input
              id={`${id}-to`}
              type="email"
              className="field-input"
              value={email}
              disabled={state.phase !== 'draft'}
              aria-describedby={canSend ? undefined : `${id}-to-hint`}
              onChange={(event) => setEmail(event.target.value)}
            />
            {canSend ? null : (
              <p id={`${id}-to-hint`} className="mt-1 text-sm text-neutral-900/70">
                Add a billing email to send. Use the form name@example.com.
              </p>
            )}
          </div>

          <div className="grid gap-3">
            {state.phase === 'draft' ? (
              <div>
                <Button disabled={!canSend} onClick={send}>
                  <Send aria-hidden="true" className="h-4 w-4" />
                  Send invoice
                </Button>
              </div>
            ) : null}

            {state.phase === 'undoable' ? (
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={() => act({ type: 'undo', at: at() })}>
                    <Undo2 aria-hidden="true" className="h-4 w-4" />
                    Undo
                    <span aria-hidden="true" className="tabular-nums">
                      ({left} s)
                    </span>
                  </Button>
                  <span className="flex min-w-24 flex-1 gap-1" aria-hidden="true">
                    {Array.from({ length: PIPS }, (_, index) => (
                      <span
                        key={index}
                        className={cn('h-1.5 flex-1 rounded-full', index < left ? 'bg-accent' : 'bg-neutral-200')}
                      />
                    ))}
                  </span>
                </div>
              </div>
            ) : null}

            {state.phase === 'failed' && failure ? (
              <div className="notice notice-error grid gap-3">
                <div>
                  <p className="font-medium">{failure.what}</p>
                  <p>{failure.why}</p>
                  <p className="mt-1">{failure.next}</p>
                </div>
                <div>
                  {failure.action === 'retry' ? (
                    <Button onClick={() => act({ type: 'retry', at: at() })}>Retry send</Button>
                  ) : (
                    <Button variant="secondary" onClick={() => act({ type: 'edit', at: at() })}>
                      Correct the email
                    </Button>
                  )}
                </div>
              </div>
            ) : null}

            {state.phase === 'sent' ? (
              <div className="notice notice-success grid gap-2">
                <p className="font-medium">Sent to {email}.</p>
                <p>The mail service accepted it. A bounce, if there is one, will show here and in the invoice list.</p>
                <p>
                  <Link href={ROUTES.admin.invoices} className="underline underline-offset-2">
                    Back to invoices
                  </Link>
                </p>
              </div>
            ) : null}

            <p role="status" className="sr-only">
              {statusLine}
            </p>
            {busy ? (
              <p aria-hidden="true" className="text-sm text-neutral-900/70">
                {statusLine}
              </p>
            ) : null}
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-neutral-100 pt-4">
          <p className="eyebrow">Specimen controls</p>
          <Segmented
            kind="choice"
            label="What happens to the next send"
            value={outcome}
            onChange={setOutcome}
            options={OUTCOMES}
            className="flex-wrap"
          />
          <Button
            variant="ghost"
            onClick={() => {
              act({ type: 'reset' });
              setElapsed(0);
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 content-start gap-4">
        <section aria-labelledby={`${id}-log`} className="rounded-lg bg-neutral-100 p-5">
          <h4 id={`${id}-log`} className="eyebrow">
            What happened
          </h4>
          {log.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-900/70">Nothing yet. Every step of a send is written here.</p>
          ) : (
            <ol className="m-0 mt-3 grid list-none gap-2 p-0">
              {log.map((entry) => (
                <li key={entry.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2 text-sm">
                  <span className="tabular-nums text-neutral-900/70">+{Math.round(entry.at / 1000)} s</span>
                  <span className="min-w-0 break-words text-neutral-900">{entry.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Disclosure label="The request" className="mt-0">
          <pre
            aria-label="Example request"
            className="whitespace-pre-wrap break-all rounded bg-neutral-100 p-3 text-xs leading-relaxed text-neutral-900"
          >
            {`POST /admin/invoices/${INVOICE_ID}/send
Idempotency-Key: ${key ?? `${INVOICE_ID}:send:<intent>`}

{ "to": "${email}" }

202 Accepted
{ "status": "SENDING" }`}
          </pre>
          <p className="mt-2 text-sm text-neutral-900/70">
            The key names the intent, not the attempt. A retry sends the same one, so a first attempt that half worked
            cannot become two emails.
          </p>
        </Disclosure>
      </div>
    </div>
  );
}
