import { ApiError } from '@newax/shared';
import type { AppealState } from './auction-live';

/**
 * What the admin auction page does with the bidders API (launchpad-apps/
 * 234-auction-app.md §8, §11, WO-234.5): who the staff member may act on, which
 * acts a bidder's state allows, and the sentence that follows each. Arithmetic
 * on plain values, so it is tested without a render. The shapes mirror
 * `AuctionBidderService` in the API.
 *
 * Admin pages write their words as literals (`ITG-9` names that as a gap), so
 * the sentences live here rather than in the messages files; the customer
 * surface for the same feature is `auction-registration.ts` and the messages.
 */

export type BidderStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'DECLINED';
export type BidderDecision = 'APPROVE' | 'DECLINE' | 'SUSPEND' | 'UPHOLD';

/** The longest a reason or a strike's account may be: the API's own limit (`MAX_REASON_LENGTH`), counted on the form. */
export const MAX_REASON_LENGTH = 500;

export interface BidderPerson {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface BidderRow {
  id: string;
  alias: string;
  status: BidderStatus;
  joinedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  appeal: { state: AppealState; text: string | null; at: string | null };
  person: BidderPerson;
  strikes: { inWindow: number; reviewDue: boolean };
  /** True when this bidder is the staff member looking: they cannot decide on themselves, and the server refuses it. */
  isSelf: boolean;
}

export interface StrikeRow {
  id: string;
  reason: string;
  recordedAt: string;
  recordedBy: string | null;
  lotId: string | null;
  auction: { id: string; number: string; title: string };
  voided: { at: string; by: string | null; reason: string } | null;
}

export interface BidderDetail extends BidderRow {
  verified: boolean;
  strikeList: StrikeRow[];
  policy: { strikesToReview: number; windowDays: number };
}

export interface BidderSummary {
  waiting: number;
  approved: number;
  /** Suspended or declined. */
  stopped: number;
  /** Declined or suspended bidders waiting for an answer to an appeal. */
  appeals: number;
  total: number;
}

export type BidderFilter = 'waiting' | 'approved' | 'stopped' | 'appeals' | 'all';

/** The view a staff member lands on: the queue if anyone is in it, otherwise everyone. */
export function defaultFilter(summary: BidderSummary | null): BidderFilter {
  return summary && summary.waiting > 0 ? 'waiting' : 'all';
}

/** The filter as the API wants it: "all" is the absence of one. */
export const filterParam = (filter: BidderFilter): string | undefined => (filter === 'all' ? undefined : filter);

export function filterOptions(summary: BidderSummary | null): Array<{ value: BidderFilter; label: string }> {
  const count = (n: number | undefined) => (n === undefined ? '' : ` ${n}`);
  return [
    { value: 'waiting', label: `Waiting${count(summary?.waiting)}` },
    { value: 'approved', label: `Approved${count(summary?.approved)}` },
    { value: 'stopped', label: `Suspended or declined${count(summary?.stopped)}` },
    { value: 'appeals', label: `Appeals${count(summary?.appeals)}` },
    { value: 'all', label: `All${count(summary?.total)}` },
  ];
}

/** The strip cell's one figure: what needs a person first, else how many are in. */
export function bidderStripValue(summary: BidderSummary | null): string {
  if (!summary) return '—';
  if (summary.waiting > 0) return `${summary.waiting} waiting`;
  if (summary.approved > 0) return `${summary.approved} approved`;
  return 'None yet';
}

/** The word for a status on a badge. A bidder is "waiting" for the organiser; the shared badge would say "Pending". */
export const statusWord = (status: BidderStatus): string =>
  status === 'PENDING' ? 'Waiting' : status === 'APPROVED' ? 'Approved' : status === 'SUSPENDED' ? 'Suspended' : 'Declined';

export type BidderAct = 'approve' | 'decline' | 'suspend' | 'uphold' | 'strike';

/**
 * What staff may do to a bidder in their state, in the order the buttons
 * appear. Approving is open to anyone not currently approved (it reverses a
 * decline or a suspension), keeping a decision only exists while an appeal
 * waits, and a strike can be recorded against someone who has bid. The server
 * decides again, from the status the screen was looking at.
 */
export function bidderActs(bidder: Pick<BidderRow, 'status' | 'appeal'>): BidderAct[] {
  switch (bidder.status) {
    case 'PENDING':
      return ['approve', 'decline'];
    case 'APPROVED':
      return ['suspend', 'strike'];
    case 'DECLINED':
      return bidder.appeal.state === 'WAITING' ? ['approve', 'uphold'] : ['approve'];
    case 'SUSPENDED':
      return bidder.appeal.state === 'WAITING' ? ['approve', 'uphold', 'strike'] : ['approve', 'strike'];
  }
}

/** Acts that end in a reason the bidder reads, so the form asks for it and refuses to send without one. */
export const actNeedsReason = (act: BidderAct): act is Exclude<BidderAct, 'approve'> => act !== 'approve';

/** The decision the API calls an act (a strike is not a decision on the registration). */
export const decisionOf = (act: Exclude<BidderAct, 'strike'>): BidderDecision =>
  act === 'approve' ? 'APPROVE' : act === 'decline' ? 'DECLINE' : act === 'suspend' ? 'SUSPEND' : 'UPHOLD';

/** The button's words: a verb and its object, never "Yes" or "OK" (`DNG-2`). `keep` is "Keep declined" or "Keep suspended". */
export function actLabel(act: BidderAct, bidder: Pick<BidderRow, 'alias' | 'status'>): string {
  switch (act) {
    case 'approve':
      return `Approve ${bidder.alias}`;
    case 'decline':
      return `Decline ${bidder.alias}`;
    case 'suspend':
      return `Suspend ${bidder.alias}`;
    case 'uphold':
      return bidder.status === 'DECLINED' ? 'Keep declined' : 'Keep suspended';
    case 'strike':
      return 'Record a strike';
  }
}

/** The line under a reason field: who reads it, so the writer knows the tone. */
export function reasonHint(act: BidderAct, alias: string): string {
  switch (act) {
    case 'uphold':
      return `Required. ${alias} will read this answer to their appeal on the lot page.`;
    case 'strike':
      return 'Required. What happened. Only staff see this.';
    default:
      return `Required. ${alias} will read this reason on the lot page.`;
  }
}

/**
 * "In the last 365 days: 2 of 3". The policy is read live, so the sentence is
 * true of the numbers in force today. At the threshold it says what is expected
 * of the person reading it (FLO-7): the system flags and never suspends, so the
 * decision is theirs and nothing happens until they take it.
 */
export function strikeStanding(strikes: BidderRow['strikes'], policy: BidderDetail['policy']): string {
  const standing = `In the last ${policy.windowDays} days: ${strikes.inWindow} of ${policy.strikesToReview}`;
  return strikes.reviewDue ? `${standing}. Review due: decide whether to suspend them. Nothing happens on its own.` : standing;
}

/** What follows a successful act, saying what happened to which bidder (`SUC-1`) and what that means. */
export function successSentence(
  kind: BidderAct | 'void',
  after: Pick<BidderDetail, 'alias' | 'status' | 'strikes' | 'policy'>,
): string {
  const standing = `${after.strikes.inWindow} in ${after.policy.windowDays} days`;
  switch (kind) {
    case 'approve':
      return `${after.alias} was approved. They can bid on every lot in this auction now.`;
    case 'decline':
      return `${after.alias} was declined. They can read your reason and send one appeal.`;
    case 'suspend':
      return `${after.alias} is suspended. Bids already placed stand; only further bids stop.`;
    case 'uphold':
      return `You kept the decision on ${after.alias}. They can read your answer; there is no further appeal.`;
    case 'strike':
      return `Strike recorded for ${after.alias}. They now have ${standing}${after.strikes.reviewDue ? ': review due.' : '.'}`;
    case 'void':
      return `Strike voided. ${after.alias} now has ${standing}${after.strikes.reviewDue ? ': review due.' : '.'}`;
  }
}

/** The sentence shown to the staff member who tried to decide on themselves: the capability's label, never its key (`PRM-2`). */
export const SELF_DECISION_SENTENCE = 'You cannot decide on your own registration. Ask another holder of "Approve, decline and suspend bidders" to do it.';

/**
 * What a failed read says (the queue, one bidder, the next in line): never the
 * server's own words, which can be "Internal server error". Nothing was being
 * changed, so it does not say so; it says what could not be shown and what to do.
 */
export function describeLoadFailure(error: unknown, what: 'bidders' | 'bidder' | 'next'): string {
  const subject = what === 'bidders' ? 'the bidders' : what === 'bidder' ? 'this bidder' : 'the next bidder';
  if (error instanceof ApiError && error.status === 403) return `You do not have permission to see ${subject}. Ask an administrator.`;
  if (error instanceof ApiError && error.status === 404) return `We could not find ${subject}. Go back to the list and try again.`;
  if (!(error instanceof ApiError)) return `We could not reach the server to load ${subject}. Check your connection and try again.`;
  return `We could not load ${subject}. Try again.`;
}

/**
 * What went wrong, as what happened, why and what to do next. The API's
 * English is used only where it already says all three; a status with no body
 * (the request never arrived) is told as a connection problem.
 */
export function describeBidderFailure(error: unknown, alias: string): string {
  if (!(error instanceof ApiError)) return 'We could not reach the server, so nothing was changed. Check your connection and try again.';
  const body = error.body as { code?: string; message?: unknown; details?: { status?: unknown } } | null | undefined;
  switch (body?.code) {
    case 'BIDDER_CHANGED': {
      const now = typeof body.details?.status === 'string' ? ` and is now ${statusWord(body.details.status as BidderStatus).toLowerCase()}` : '';
      return `Someone else just decided on ${alias}${now}. Nothing was changed. Look at their new status and decide again if you still need to.`;
    }
    case 'CANNOT_DECIDE_OWN':
      return SELF_DECISION_SENTENCE;
    case 'STRIKE_ALREADY_VOID':
      return 'That strike was already voided. Nothing was changed.';
    case 'DECISION_NOT_ALLOWED':
      return `${typeof body.message === 'string' ? body.message : 'That is not possible in this state.'} Nothing was changed.`;
    default:
      break;
  }
  if (error.status === 400 && typeof body?.message === 'string') return `${body.message} Nothing was changed.`;
  if (error.status === 403) return 'You do not have permission to manage bidders. Nothing was changed. Ask an administrator.';
  if (error.status === 404) return `${alias} is no longer in this auction. Nothing was changed. Go back to the list.`;
  return 'We could not save that. Nothing was changed. Try again.';
}
