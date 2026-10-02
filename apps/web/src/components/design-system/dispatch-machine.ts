/**
 * The states of a one-click send, and the only moves between them.
 *
 * The pattern: acknowledge in the same frame (`ACT-3`), keep the person's
 * mistake reversible for a short window, then hand the work to something that
 * can retry without sending twice. What the screen may claim at each step is
 * what the system actually knows:
 *
 *   draft     nothing has left.
 *   undoable  the send is accepted and queued; it has not left. Undo cancels it.
 *   inflight  the undo window has closed and the mail service has the job.
 *   sent      the mail service took it. "Delivered to the partner's inbox" is a
 *             claim only a read receipt could make, so the screen never says it.
 *   failed    the job came back refused, with a reason that names its remedy.
 *
 * A mockup that flips straight to "Dispatched" before anything has been handed
 * over says something false for as long as the job is queued, and has nowhere to
 * go when the job fails. Both are states here.
 *
 * Illegal moves are no-ops, never errors: a double click, a late timer and a
 * stale tab all arrive as events the current state does not accept, and each
 * must leave the state exactly as it was (the second copy of the write).
 */

/**
 * How long a send can be undone, in milliseconds. 5 000 is long enough to read
 * the partner's name on the confirmation line and notice a wrong one, and short
 * enough that a customer waiting on an invoice is not made to wait. The design for
 * the real send is the outbox row's own delay: write it with
 * `OutboxEvent.availableAt` set this far ahead (the dispatcher already skips
 * rows whose `availableAt` is in the future, and the column is indexed with
 * `status`), so Undo cancels a row nothing has picked up yet. Nothing here writes
 * that row. A setting there, a constant here.
 */
export const UNDO_WINDOW_MS = 5000;

export type FailureKind = 'bounced' | 'unavailable';

export type DispatchState =
  | { phase: 'draft'; lastIntent: number }
  | { phase: 'undoable'; intent: number }
  | { phase: 'inflight'; intent: number; attempt: number }
  | { phase: 'sent'; intent: number; attempt: number }
  | { phase: 'failed'; intent: number; attempt: number; kind: FailureKind };

export type DispatchEvent =
  | { type: 'send' }
  | { type: 'undo' }
  | { type: 'window-elapsed' }
  | { type: 'delivered' }
  | { type: 'rejected'; kind: FailureKind }
  | { type: 'retry' }
  | { type: 'edit' };

export const INITIAL_DISPATCH: DispatchState = { phase: 'draft', lastIntent: 0 };

export function dispatchReducer(state: DispatchState, event: DispatchEvent): DispatchState {
  switch (event.type) {
    case 'send':
      return state.phase === 'draft' ? { phase: 'undoable', intent: state.lastIntent + 1 } : state;

    case 'undo':
      // The cancelled intent is spent: sending again is a new intent with a new key.
      return state.phase === 'undoable' ? { phase: 'draft', lastIntent: state.intent } : state;

    case 'window-elapsed':
      return state.phase === 'undoable' ? { phase: 'inflight', intent: state.intent, attempt: 1 } : state;

    case 'delivered':
      return state.phase === 'inflight' ? { phase: 'sent', intent: state.intent, attempt: state.attempt } : state;

    case 'rejected':
      return state.phase === 'inflight'
        ? { phase: 'failed', intent: state.intent, attempt: state.attempt, kind: event.kind }
        : state;

    case 'retry':
      // Only a failure that is not the address's fault can be retried as it stands:
      // a bounce would bounce again, so its remedy is `edit`.
      return state.phase === 'failed' && state.kind === 'unavailable'
        ? { phase: 'inflight', intent: state.intent, attempt: state.attempt + 1 }
        : state;

    case 'edit':
      return state.phase === 'failed' ? { phase: 'draft', lastIntent: state.intent } : state;
  }
}

/**
 * The key the request carries so the server can recognise a second copy. It
 * names the person's intent, not the attempt: a retry sends the same key, so a
 * first attempt that half-worked cannot become two emails.
 */
export function idempotencyKey(invoiceId: string, state: DispatchState): string | null {
  return state.phase === 'draft' ? null : `${invoiceId}:send:${state.intent}`;
}

export type DispatchTone = 'neutral' | 'info' | 'success' | 'danger';

/** The badge: a word, always. The tone only repeats it. */
export function dispatchBadge(state: DispatchState): { label: string; tone: DispatchTone } {
  switch (state.phase) {
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    case 'undoable':
    case 'inflight':
      return { label: 'Sending', tone: 'info' };
    case 'sent':
      return { label: 'Sent', tone: 'success' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
  }
}

/** What happened, why, and what to do next (`FLO-7`). The next step is never "try again later". */
export const FAILURE_COPY: Record<FailureKind, { what: string; why: string; next: string; action: 'retry' | 'edit' }> =
  {
    bounced: {
      what: 'The invoice was not delivered.',
      why: 'The partner’s mail server refused the address.',
      next: 'Correct the billing email, then send it again. Nothing was delivered, so there is no duplicate to worry about.',
      action: 'edit',
    },
    unavailable: {
      what: 'The invoice has not left yet.',
      why: 'The mail service did not answer.',
      next: 'Retry now. The retry carries the same key, so the partner cannot receive two copies.',
      action: 'retry',
    },
  };
