import { ApiError } from '@newax/shared';
import type { IneligibleWhy, RegistrationView, ViewerLotState } from './auction-live';

/**
 * What the lot page does with the answer to "may this person bid here"
 * (launchpad-apps/234-auction-app.md §8, §11, WO-234.5): which card the bid box's
 * place shows, whether the page should keep asking, and what to say when joining
 * or appealing fails. All arithmetic on plain values, tested without a render,
 * so the card is markup around it.
 */

/**
 * The card a person who may not bid sees in the bid box's place, or `null` when
 * there is nothing to show (they may bid, or the API has not answered yet: an
 * unknown viewer is treated as "may bid" and the API decides and says so).
 *
 * `appeal` is where a declined or suspended person is in the one appeal each
 * decision allows: `open` (nothing sent yet, so the box shows), `sent` (waiting
 * for an answer), `kept` (answered; the decision stands).
 */
export type RegistrationCard =
  | { kind: 'join' }
  | { kind: 'pending'; joinedAt: string | null }
  | { kind: 'declined' | 'suspended'; reason: string | null; appeal: 'open' | 'sent' | 'kept'; appealText: string | null }
  | { kind: 'runs' };

export type RegistrationCardKind = RegistrationCard['kind'];

/** The cause, from the API's own `why` when it names one, else from the person's status. */
function whyOf(viewer: ViewerLotState): IneligibleWhy {
  if (viewer.reason?.why) return viewer.reason.why;
  switch (viewer.registration?.status) {
    case 'PENDING':
      return 'PENDING';
    case 'DECLINED':
      return 'DECLINED';
    case 'SUSPENDED':
      return 'SUSPENDED';
    default:
      return 'NOT_REGISTERED';
  }
}

export function registrationCard(viewer: ViewerLotState | null): RegistrationCard | null {
  if (!viewer || viewer.eligible) return null;
  switch (whyOf(viewer)) {
    case 'RUNS_AUCTION':
      return { kind: 'runs' };
    case 'NOT_REGISTERED':
      return { kind: 'join' };
    case 'PENDING':
      return { kind: 'pending', joinedAt: viewer.registration?.joinedAt ?? null };
    case 'DECLINED':
    case 'SUSPENDED': {
      const kind = whyOf(viewer) === 'DECLINED' ? 'declined' : 'suspended';
      const registration = viewer.registration;
      const appeal = registration?.appeal === 'WAITING' ? 'sent' : registration?.appeal === 'KEPT' ? 'kept' : 'open';
      return { kind, reason: registration?.decisionReason ?? null, appeal, appealText: registration?.appealText ?? null };
    }
  }
}

/**
 * Whether the page should keep reading who the viewer is: while their
 * registration waits for the organiser, and while an appeal does. Everything
 * else is settled until the person does something.
 */
export function needsRegistrationPoll(viewer: ViewerLotState | null): boolean {
  const registration = viewer?.registration;
  if (!registration) return false;
  return registration.status === 'PENDING' || ((registration.status === 'DECLINED' || registration.status === 'SUSPENDED') && registration.appeal === 'WAITING');
}

/**
 * How long a page waiting on the organiser leaves between reads, in
 * milliseconds. A decision takes minutes, so 20 000 is plenty to feel live,
 * and a thousand people waiting on one auction cost about fifty reads a second
 * rather than a thousand. The caller spreads it ±20 % (`spread`).
 */
export const REGISTRATION_POLL_MS = 20_000;

/** The least time between two reads of the viewer, whatever asks (a timer, a tab coming back): the page's own cache is no fresher than this. */
export const VIEWER_MIN_GAP_MS = 1_000;

/**
 * The viewer as it is the moment a join or an appeal is answered, before the
 * page has read it again: `eligible` only for an approved person, and the cause
 * from their status. The next read replaces it with the API's own word.
 */
export function withRegistration(viewer: ViewerLotState | null, registration: RegistrationView): ViewerLotState {
  const base = { participating: false, leading: false, ...viewer, alias: registration.alias ?? viewer?.alias ?? null, registration };
  if (registration.status === 'APPROVED') {
    const { reason: _gone, ...approved } = base;
    return { ...approved, eligible: true };
  }
  const why: IneligibleWhy = registration.status === 'NONE' ? 'NOT_REGISTERED' : registration.status;
  return { ...base, eligible: false, reason: { code: 'BIDDER_NOT_ELIGIBLE', why, message: '' } };
}

/** What a join or an appeal that did not work should say, as a key under `auction.registration.error`, and what the page should do next. */
export interface RegistrationFailure {
  key: 'network' | 'rateLimited' | 'rateLimitedNow' | 'ended' | 'unavailable' | 'changed' | 'signedOut' | 'generic';
  retryAfterSeconds?: number;
  /** The person's place has changed under them: read it again. */
  refresh: boolean;
}

/**
 * Turns whatever a join or an appeal threw into a key. The API's English is
 * never shown. A failure with no status (the request did not arrive, or its
 * answer did not) is `network`; a join and an appeal are safe to repeat, so the
 * sentence says to press the button again.
 */
export function describeRegistrationFailure(error: unknown): RegistrationFailure {
  if (!(error instanceof ApiError)) return { key: 'network', refresh: false };

  const body = error.body as { code?: string; retryAfterSeconds?: unknown } | null | undefined;
  switch (body?.code) {
    case 'REGISTRATION_CLOSED':
      return { key: 'ended', refresh: false };
    // The person's place is not what the page thought: someone decided, or another tab appealed. Show them what is true now.
    case 'APPEAL_ALREADY_OPEN':
    case 'APPEAL_ALREADY_ANSWERED':
    case 'NOTHING_TO_APPEAL':
    case 'BIDDER_CHANGED':
    case 'BIDDER_NOT_ELIGIBLE':
      return { key: 'changed', refresh: true };
    default:
      break;
  }
  if (error.status === 401) return { key: 'signedOut', refresh: false };
  if (error.status === 429) {
    const seconds = typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined;
    return seconds === undefined ? { key: 'rateLimitedNow', refresh: false } : { key: 'rateLimited', retryAfterSeconds: seconds, refresh: false };
  }
  // Not found is a draft or cancelled auction: nothing to join or appeal to, so say that and offer the way on rather than "your place changed".
  if (error.status === 404) return { key: 'unavailable', refresh: false };
  return { key: 'generic', refresh: false };
}
