/**
 * The pure half of bidder trust (launchpad-apps/234-auction-app.md §8, §15,
 * WO-234.5): who may bid, how a registration is first decided, which decisions
 * staff may take on a bidder, and what counts as "enough strikes to look at
 * someone". No database, no clock, no `publish`, so a "can this person bid?"
 * read and a "simulate this auction" preview call the same functions
 * `placeBid()` does and cannot drift from it.
 */

export type BidderStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'DECLINED';

/** How an auction vets who may bid (`Auction.registration`). */
export type RegistrationMode = 'OPEN' | 'VERIFIED' | 'APPROVAL';

export const REGISTRATION_MODES: readonly RegistrationMode[] = ['OPEN', 'VERIFIED', 'APPROVAL'];

/** What staff can do to a bidder. UPHOLD answers an appeal and leaves the decision as it was. */
export type BidderDecision = 'APPROVE' | 'DECLINE' | 'SUSPEND' | 'UPHOLD';

export const BIDDER_DECISIONS: readonly BidderDecision[] = ['APPROVE', 'DECLINE', 'SUSPEND', 'UPHOLD'];

/** Why a person may not bid. One word per cause: the API, the viewer's own state and the page all use these. */
export type IneligibleReason = 'RUNS_AUCTION' | 'NOT_REGISTERED' | 'PENDING' | 'DECLINED' | 'SUSPENDED';

/** Said to the caller in English; the storefront tells it in the shopper's language from the reason alone. */
export const INELIGIBLE_MESSAGES: Record<IneligibleReason, string> = {
  RUNS_AUCTION: 'Staff who run this auction cannot bid on it. Use a separate customer account to bid.',
  NOT_REGISTERED: 'Register to bid in this auction first.',
  PENDING: 'Your registration is waiting for approval.',
  DECLINED: 'Your registration was not approved.',
  SUSPENDED: 'Your bidding in this auction is suspended.',
};

export type Eligibility = { eligible: true } | { eligible: false; reason: IneligibleReason };

/**
 * Whether someone may bid (doc 234 §5.7, §8). `runsAuction` is true for the
 * auction's author and for anyone who can edit auctions, decided from data by
 * the caller. `bidderStatus` is null for someone with no `Bidder` row yet.
 * `reviewDue` is true for a person at the strike threshold.
 *
 * Under `OPEN` someone with no row is eligible, because their first bid
 * registers them; a person at the threshold is the exception, since a human
 * decides on them, so they must register and wait. Every other mode, and every
 * row that is not `APPROVED`, says why not.
 */
export function eligibility(input: {
  runsAuction: boolean;
  mode: RegistrationMode;
  bidderStatus: BidderStatus | null;
  reviewDue: boolean;
}): Eligibility {
  if (input.runsAuction) return { eligible: false, reason: 'RUNS_AUCTION' };
  switch (input.bidderStatus) {
    case 'APPROVED':
      return { eligible: true };
    case 'PENDING':
      return { eligible: false, reason: 'PENDING' };
    case 'DECLINED':
      return { eligible: false, reason: 'DECLINED' };
    case 'SUSPENDED':
      return { eligible: false, reason: 'SUSPENDED' };
    case null:
      return input.mode === 'OPEN' && !input.reviewDue ? { eligible: true } : { eligible: false, reason: 'NOT_REGISTERED' };
  }
}

/**
 * The status a registration is first given. A person at the strike threshold
 * always waits for a human, whatever the mode; `VERIFIED` approves only someone
 * whose identity is verified, so with no identity module (nobody is verified)
 * it behaves as `APPROVAL`.
 */
export function decideRegistration(input: { mode: RegistrationMode; verified: boolean; reviewDue: boolean }): 'APPROVED' | 'PENDING' {
  if (input.reviewDue) return 'PENDING';
  switch (input.mode) {
    case 'OPEN':
      return 'APPROVED';
    case 'VERIFIED':
      return input.verified ? 'APPROVED' : 'PENDING';
    case 'APPROVAL':
      return 'PENDING';
  }
}

export type Transition = { ok: true; status: BidderStatus } | { ok: false; message: string };

/**
 * What a staff decision does to a bidder in a given state. A decision always
 * answers any open appeal, so the caller clears it; UPHOLD is only for a
 * bidder whose decision was appealed, and leaves the status as it is.
 */
export function nextBidderStatus(current: BidderStatus, decision: BidderDecision, hasAppeal: boolean): Transition {
  switch (decision) {
    case 'APPROVE':
      return current === 'APPROVED'
        ? { ok: false, message: 'This bidder is already approved.' }
        : { ok: true, status: 'APPROVED' };
    case 'DECLINE':
      return current === 'PENDING'
        ? { ok: true, status: 'DECLINED' }
        : { ok: false, message: 'Only a registration that is waiting can be declined. To stop an approved bidder, suspend them.' };
    case 'SUSPEND':
      return current === 'APPROVED'
        ? { ok: true, status: 'SUSPENDED' }
        : { ok: false, message: 'Only an approved bidder can be suspended.' };
    case 'UPHOLD':
      return hasAppeal && (current === 'DECLINED' || current === 'SUSPENDED')
        ? { ok: true, status: current }
        : { ok: false, message: 'There is no appeal to answer on this bidder.' };
  }
}

export type AppealState = 'NONE' | 'WAITING' | 'KEPT';

/**
 * Where a bidder's appeal stands. A bidder gets one appeal for each decision:
 * a new decision (approve, decline, suspend) clears both columns, so the next
 * decision can be appealed afresh, while keeping a decision (UPHOLD) empties
 * the text and leaves `appealedAt`, which is what makes it final (`KEPT`) until
 * staff decide something else. Two columns and no comparison of instants, so
 * "appeals waiting" is a plain `appealText IS NOT NULL` in a query.
 */
export function appealState(input: { appealedAt: Date | null; appealText: string | null }): AppealState {
  if (input.appealedAt === null) return 'NONE';
  return input.appealText === null ? 'KEPT' : 'WAITING';
}

/** What a person is told about their own place in one auction. */
export interface RegistrationView {
  mode: RegistrationMode;
  status: 'NONE' | BidderStatus;
  alias: string | null;
  joinedAt: Date | null;
  /** The organiser's words, written for the bidder; shown only for a declined or suspended bidder. */
  decisionReason: string | null;
  appeal: AppealState;
  /** The bidder's own open appeal, echoed back to them. */
  appealText: string | null;
}

export interface BidderRow {
  alias: string;
  status: BidderStatus;
  createdAt: Date;
  decisionReason: string | null;
  appealText: string | null;
  appealedAt: Date | null;
}

/** The registration card's state, from the row alone: pure, so the viewer read and the join and appeal answers say the same thing. */
export function registrationView(mode: RegistrationMode, bidder: BidderRow | null): RegistrationView {
  if (!bidder) {
    return { mode, status: 'NONE', alias: null, joinedAt: null, decisionReason: null, appeal: 'NONE', appealText: null };
  }
  const stopped = bidder.status === 'DECLINED' || bidder.status === 'SUSPENDED';
  const appeal = stopped ? appealState(bidder) : 'NONE';
  return {
    mode,
    status: bidder.status,
    alias: bidder.alias,
    joinedAt: bidder.createdAt,
    decisionReason: stopped ? bidder.decisionReason : null,
    appeal,
    appealText: appeal === 'WAITING' ? bidder.appealText : null,
  };
}

/** A decline, a suspension and an answer to an appeal are read by the bidder, so each needs its reason; an approval does not. */
export const decisionNeedsReason = (decision: BidderDecision): boolean => decision !== 'APPROVE';

/** The strike policy: how many strikes flag a person, and how far back one counts. */
export interface TrustPolicy {
  strikesToReview: number;
  strikeWindowMs: number;
}

export const DEFAULT_STRIKES_TO_REVIEW = 3;
export const DEFAULT_STRIKE_WINDOW_DAYS = 365;
export const MAX_STRIKES_TO_REVIEW = 20;
export const MAX_STRIKE_WINDOW_DAYS = 3_650;

const DAY_MS = 86_400_000;

const wholeIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Takes each Setting it can trust and the default for the other (§12, "missing or malformed → the defaults, field by field"). */
export function parseTrustPolicy(raw: { strikesToReview: unknown; strikeWindowDays: unknown }): TrustPolicy {
  const strikes = wholeIn(raw.strikesToReview, 1, MAX_STRIKES_TO_REVIEW) ? raw.strikesToReview : DEFAULT_STRIKES_TO_REVIEW;
  const days = wholeIn(raw.strikeWindowDays, 1, MAX_STRIKE_WINDOW_DAYS) ? raw.strikeWindowDays : DEFAULT_STRIKE_WINDOW_DAYS;
  return { strikesToReview: strikes, strikeWindowMs: days * DAY_MS };
}

/** Strikes recorded at or after this instant count. */
export const strikeWindowStart = (now: Date, policy: TrustPolicy): Date => new Date(now.getTime() - policy.strikeWindowMs);

/** True once a person has as many live strikes in the window as the policy names. Flags; it never suspends. */
export const isReviewDue = (strikesInWindow: number, policy: TrustPolicy): boolean => strikesInWindow >= policy.strikesToReview;

/** Reads a stored or requested registration mode, with the fallback for anything else (the Setting's default is `APPROVAL`). */
export function parseRegistrationMode(raw: unknown, fallback: RegistrationMode = 'APPROVAL'): RegistrationMode {
  return REGISTRATION_MODES.includes(raw as RegistrationMode) ? (raw as RegistrationMode) : fallback;
}
