import { ApiError, MINOR_UNITS_PER_MAJOR, toMajor, toMinor } from '@newax/shared';
import type { WinnerSettlement } from './auction-settlement';

/**
 * What the public lot page does with what the Auction API tells it
 * (launchpad-apps/234-auction-app.md §6, §11, WO-234.4): the clock, the merge of
 * a live event into the page, who leads, what to say about a refusal. All of it
 * is arithmetic on plain values, so it is tested without a render, a socket or a
 * timer, and the page is markup around it.
 *
 * The shapes mirror `AuctionPublicService` and `lot-live.ts` in the API. The
 * money is minor units throughout (paisa); only `parseAmountToMinor` and
 * `amountForInput` cross to what a person types.
 */

export type LotPhase = 'UPCOMING' | 'OPEN' | 'CLOSED';

export interface LiveBid {
  seq: number;
  /** "Bidder 7", never a name. */
  alias: string;
  amountMinor: number;
  kind: 'MANUAL' | 'PROXY_AUTO' | 'SEALED';
  acceptedAt: string;
}

export type LotOutcome =
  | { kind: 'SOLD'; topBidderAlias: string; finalMinor: number }
  | { kind: 'NOT_SOLD'; reason: 'RESERVE_NOT_MET' | 'NO_BIDS' };

export interface PublicLot {
  lotId: string;
  lotNo: number;
  title: string;
  description: string | null;
  quantity: number;
  auction: {
    id: string;
    number: string;
    title: string;
    status: string;
    startsAt: string;
    terms: string | null;
    /** The buyer's premium the winner pays on top of the winning bid, in basis points (1 000 is 10%). 0 means none. */
    buyerPremiumBps: number;
    /** Hours a winner has to pay. */
    paymentWindowHours: number;
  };
  phase: LotPhase;
  startPriceMinor: number;
  currentBidMinor: number | null;
  bidSeq: number;
  minimumNextBidMinor: number | null;
  endsAt: string;
  extended: boolean;
  serverTime: string;
  /** Newest first. */
  bids: LiveBid[];
  outcome?: LotOutcome;
}

export interface LotLiveEvent {
  lotId: string;
  state: LotPhase;
  bidSeq: number;
  currentBidMinor: number | null;
  minimumNextBidMinor: number | null;
  endsAt: string;
  serverTime: string;
  /** Oldest first. */
  newBids: LiveBid[];
  outcome?: LotOutcome;
}

export interface PublicLotSummary {
  lotId: string;
  lotNo: number;
  title: string;
  auction: { id: string; title: string };
  phase: LotPhase;
  startsAt: string;
  endsAt: string;
  startPriceMinor: number;
  currentBidMinor: number | null;
  bidCount: number;
  outcome?: { kind: 'SOLD'; finalMinor: number } | { kind: 'NOT_SOLD' };
}

/** How an auction vets who may bid (`Auction.registration` in the API). */
export type RegistrationMode = 'OPEN' | 'VERIFIED' | 'APPROVAL';

/** Where a person stands in one auction. `NONE` is "has not joined". */
export type RegistrationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'DECLINED' | 'SUSPENDED';

/** One word per cause of "may not bid": what the API says and what the page picks its card from. */
export type IneligibleWhy = 'RUNS_AUCTION' | 'NOT_REGISTERED' | 'PENDING' | 'DECLINED' | 'SUSPENDED';

/** A bidder gets one appeal for each decision: `NONE` before, `WAITING` for an answer, `KEPT` once the organiser has kept the decision. */
export type AppealState = 'NONE' | 'WAITING' | 'KEPT';

/** A person's own place in one auction, as `registrationView` in the API tells it. */
export interface RegistrationView {
  mode: RegistrationMode;
  status: RegistrationStatus;
  alias: string | null;
  joinedAt: string | null;
  /** The organiser's own words, for a declined or suspended bidder. Shown as written, never translated. */
  decisionReason: string | null;
  appeal: AppealState;
  /** The bidder's own open appeal, echoed back to them. */
  appealText: string | null;
}

export interface ViewerLotState {
  alias: string | null;
  /** Whether they have a bid or a standing maximum on this lot. An alias is per auction, so it alone does not say so. */
  participating: boolean;
  leading: boolean;
  eligible: boolean;
  /** Why not, as a code. The `message` is English for a caller who is not a page; the page tells it in the shopper's language from `why`. */
  reason?: { code: 'BIDDER_NOT_ELIGIBLE'; why: IneligibleWhy; message: string };
  registration?: RegistrationView;
  /** What the viewer owes for winning this lot (or being offered it afterwards). Their own only; null before there is one. */
  settlement?: WinnerSettlement | null;
}

/** A lot only moves forward through its phases, so an event for an earlier one than the page shows is out of date. */
const PHASE_RANK: Record<LotPhase, number> = { UPCOMING: 0, OPEN: 1, CLOSED: 2 };

/** Bids a page keeps: the API's own page size. */
export const PAGE_BIDS = 20;

/**
 * Under this long to go, a lot reads "closing soon". Five minutes is
 * presentation only (the end itself and any anti-snipe extension are the
 * server's): long enough for someone who has looked away to be called back,
 * short enough that most of an auction does not wear the label.
 */
export const CLOSING_SOON_MS = 300_000;

/** How often a page that has no stream asks for the lot instead. The doc's own figure (§6). */
export const POLL_FALLBACK_MS = 5_000;

/**
 * The least time between two refreshes of the page the live path asks for
 * itself (an event that skipped bids). One second matches the API's own page
 * cache, so asking sooner could only be answered with the same page.
 */
export const REFRESH_MIN_GAP_MS = 1_000;

/** How far the server's clock is ahead of this one (negative when behind), from a `serverTime` received at `receivedAt`. */
export function clockOffset(serverTime: string, receivedAt: number): number {
  return Date.parse(serverTime) - receivedAt;
}

/** Milliseconds until `iso` on the server's clock, given the offset and this machine's `now`. Negative once past. */
export function msUntil(iso: string, offsetMs: number, now: number): number {
  return Date.parse(iso) - (now + offsetMs);
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Whole days, hours, minutes and seconds in a span, floored; a span at or below zero is all zeros. */
export function countdownParts(ms: number): CountdownParts {
  const total = Math.max(0, Math.floor(ms / 1_000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

/**
 * The two largest units that are not zero, for a countdown that fits a card:
 * "2d 4h", "4h 12m", "12m 30s", "30s". Digits only, so the caller's locale
 * decides the letters (they come from the messages, not from here).
 */
export function countdownUnits(ms: number): Array<{ unit: 'd' | 'h' | 'm' | 's'; value: number }> {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  const all = [
    { unit: 'd' as const, value: days },
    { unit: 'h' as const, value: hours },
    { unit: 'm' as const, value: minutes },
    { unit: 's' as const, value: seconds },
  ];
  const first = all.findIndex((part) => part.value > 0);
  if (first === -1) return [{ unit: 's', value: 0 }];
  return all.slice(first, first + 2);
}

/** What the page says about time on an open lot. */
export type TimeState = 'upcoming' | 'open' | 'closing-soon' | 'ended';

export function timeState(lot: Pick<PublicLot, 'phase' | 'endsAt'>, offsetMs: number, now: number): TimeState {
  if (lot.phase === 'CLOSED') return 'ended';
  if (lot.phase === 'UPCOMING') return 'upcoming';
  const left = msUntil(lot.endsAt, offsetMs, now);
  if (left <= 0) return 'ended';
  return left <= CLOSING_SOON_MS ? 'closing-soon' : 'open';
}

/**
 * One live event folded into the page. Nothing a page has seen goes backwards:
 * an event with a lower `bidSeq` is out of order and ignored, and a lot never
 * goes back from closed to open or from open to upcoming. Bids are united by `seq`, newest first, the latest
 * `PAGE_BIDS`. `extended` latches once the end has moved.
 */
export function applyLiveEvent(view: PublicLot, event: LotLiveEvent): PublicLot {
  if (event.lotId !== view.lotId) return view;
  if (event.bidSeq < view.bidSeq) return view;
  if (PHASE_RANK[event.state] < PHASE_RANK[view.phase]) return view;

  const bySeq = new Map<number, LiveBid>();
  for (const bid of [...view.bids, ...event.newBids]) bySeq.set(bid.seq, bid);
  const bids = [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, PAGE_BIDS);

  return {
    ...view,
    phase: event.state,
    bidSeq: event.bidSeq,
    currentBidMinor: event.currentBidMinor,
    minimumNextBidMinor: event.minimumNextBidMinor,
    endsAt: event.endsAt,
    extended: view.extended || event.endsAt !== view.endsAt,
    serverTime: event.serverTime,
    bids,
    outcome: event.outcome ?? view.outcome,
  };
}

/** What a bid or a maximum answers with, as far as the page uses it. */
export interface AcceptedLike {
  bid: LiveBid;
  autoBid: LiveBid | null;
  lot: { lotId: string; currentBidMinor: number | null; bidSeq: number; minimumNextBidMinor: number; endsAt: string };
}

/**
 * The live event for the bids one request just placed, so the page moves on the
 * moment the answer arrives instead of waiting for the stream to say the same
 * thing. Its `serverTime` is the database time of the last bid, not a reading of
 * the clock, so a page applies it with the clock left alone.
 */
export function eventFromAccepted(result: AcceptedLike): LotLiveEvent {
  const placed = [result.bid, ...(result.autoBid ? [result.autoBid] : [])].map(
    ({ seq, alias, amountMinor, kind, acceptedAt }): LiveBid => ({ seq, alias, amountMinor, kind, acceptedAt }),
  );
  return {
    lotId: result.lot.lotId,
    state: 'OPEN',
    bidSeq: result.lot.bidSeq,
    currentBidMinor: result.lot.currentBidMinor,
    minimumNextBidMinor: result.lot.minimumNextBidMinor,
    endsAt: result.lot.endsAt,
    serverTime: placed[placed.length - 1]!.acceptedAt,
    newBids: placed,
  };
}

/**
 * Whether the page is missing a bid it was told about: the lot is at a higher
 * `bidSeq` than the newest bid on the page. That happens when a node batched
 * several bids into one event and the batch was larger than an event carries,
 * or when an event arrived with its bids left out. The page then reads the lot
 * again rather than guessing who leads.
 */
export function needsRefresh(view: Pick<PublicLot, 'bidSeq' | 'bids'>): boolean {
  return view.bidSeq > 0 && (view.bids[0]?.seq ?? 0) < view.bidSeq;
}

/**
 * The newer of two reads of one lot. A refresh and a live event can cross; the
 * one with the higher `bidSeq` wins, and a closed lot beats an open one at the
 * same `bidSeq`. Equal, the fresher server clock wins.
 */
export function newerView(a: PublicLot, b: PublicLot): PublicLot {
  if (a.bidSeq !== b.bidSeq) return a.bidSeq > b.bidSeq ? a : b;
  if (a.phase !== b.phase) return a.phase === 'CLOSED' ? a : b;
  return Date.parse(a.serverTime) >= Date.parse(b.serverTime) ? a : b;
}

export type Standing = 'none' | 'leading' | 'outbid';

/**
 * Where a signed-in bidder stands on a lot. The leader is the author of the
 * newest bid, because every accepted bid raises the price; someone in the
 * contest (a bid or a maximum on this lot) who is not the author of the newest
 * bid has been outbid. A bidder who is not in this lot's contest stands nowhere,
 * even with an alias: the alias belongs to the auction, and bids on its other
 * lots are not this one's.
 */
export function standingOf(alias: string | null, participating: boolean, bids: readonly LiveBid[]): Standing {
  if (!alias || !participating) return 'none';
  return bids[0]?.alias === alias ? 'leading' : 'outbid';
}

/** The price a lot shows: the current bid, else where bidding starts. */
export function shownPriceMinor(lot: Pick<PublicLot, 'currentBidMinor' | 'startPriceMinor'>): number {
  return lot.currentBidMinor ?? lot.startPriceMinor;
}

/** How many digits follow the point in a whole currency unit: 2 where there are 100 minor units. */
const FRACTION_DIGITS = Math.max(0, String(MINOR_UNITS_PER_MAJOR).length - 1);

/** The longest an appeal may be, in characters: the API's own limit (`MAX_APPEAL_LENGTH`), counted on the page so the limit is never a surprise. */
export const MAX_APPEAL_LENGTH = 1_000;

/**
 * A wait spread ±20 % around `ms`, so a thousand pages that started waiting
 * together (a stream that dropped, a decision everyone is waiting on) do not all
 * ask in the same second. `random` is a parameter so the bounds can be tested.
 */
export function spread(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (0.8 + random() * 0.4));
}

/** The most a bid or a maximum may be, in minor units: the API's own ceiling. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000_000;

/**
 * What a person typed as an amount, in minor units, or null when it is not one.
 * Digits with an optional fraction no longer than the currency has; spaces and
 * thousands commas are ignored. Zero, a negative and anything above the API's
 * ceiling are not amounts.
 */
export function parseAmountToMinor(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (cleaned === '') return null;
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${Math.max(1, FRACTION_DIGITS)}})?$`);
  if (!pattern.test(cleaned)) return null;
  const minor = toMinor(Number(cleaned));
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_AMOUNT_MINOR) return null;
  return minor;
}

/** An amount in minor units as the box shows it: whole units with no trailing zeros, a fraction only when there is one. */
export function amountForInput(minor: number): string {
  const major = toMajor(minor);
  return Number.isInteger(major) ? String(major) : major.toFixed(FRACTION_DIGITS);
}

/** What the API said about a refusal, as a message key and the numbers its sentence needs. */
export interface BidFailure {
  /** A key under `auction.errors` in the messages. */
  key:
    | 'bidTooLow'
    | 'alreadyLeading'
    | 'lotChanged'
    | 'closed'
    | 'notEligible'
    | 'rateLimited'
    | 'keyReused'
    | 'proxyTooLow'
    | 'proxyCannotLower'
    | 'signedOut'
    | 'busy'
    | 'network';
  /** The next valid bid, when the refusal says one. */
  minimumNextBidMinor?: number;
  /** The least a maximum may be, when the refusal says one. */
  minimumMaxMinor?: number;
  /** Why the person may not bid, when the refusal says so (`notEligible`). */
  why?: IneligibleWhy;
  retryAfterSeconds?: number;
  /** The page's view of the lot is out of date: read it again. */
  refresh: boolean;
  /** The request key was used up for another amount: the next attempt needs a new one. */
  newKey: boolean;
}

const INELIGIBLE_WHY: readonly IneligibleWhy[] = ['RUNS_AUCTION', 'NOT_REGISTERED', 'PENDING', 'DECLINED', 'SUSPENDED'];

function ineligibleWhy(body: unknown): IneligibleWhy | undefined {
  const why = (body as { details?: { why?: unknown } } | null)?.details?.why;
  return INELIGIBLE_WHY.find((known) => known === why);
}

function detail(body: unknown, name: string): number | undefined {
  const details = (body as { details?: Record<string, unknown> } | null)?.details;
  const value = details?.[name];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Turns whatever a bid or a maximum threw into a sentence's worth of facts. The
 * API's own messages are English and are never shown: a customer sees their own
 * language, from the code. A failure with no status at all (the request did not
 * arrive, or its answer did not) is `network`, and the page keeps the request key
 * so trying again is the same request and cannot bid twice.
 */
export function describeBidFailure(error: unknown): BidFailure {
  const base = { refresh: false, newKey: false };
  if (!(error instanceof ApiError)) return { ...base, key: 'network' };

  const body = error.body as { code?: string; retryAfterSeconds?: unknown } | null | undefined;
  const retryAfterSeconds = typeof body?.retryAfterSeconds === 'number' ? body.retryAfterSeconds : undefined;

  switch (body?.code) {
    case 'BID_TOO_LOW':
      return { ...base, key: 'bidTooLow', minimumNextBidMinor: detail(body, 'minimumNextBidMinor'), refresh: true };
    case 'ALREADY_LEADING':
      return { ...base, key: 'alreadyLeading', minimumNextBidMinor: detail(body, 'minimumNextBidMinor') };
    case 'LOT_CHANGED':
      return { ...base, key: 'lotChanged', refresh: true };
    case 'LOT_NOT_OPEN':
    case 'AUCTION_ENDED':
      return { ...base, key: 'closed', refresh: true };
    case 'BIDDER_NOT_ELIGIBLE':
      return { ...base, key: 'notEligible', why: ineligibleWhy(body) };
    case 'BID_RATE_LIMITED':
      return { ...base, key: 'rateLimited', retryAfterSeconds };
    case 'IDEMPOTENCY_KEY_REUSED':
      return { ...base, key: 'keyReused', newKey: true };
    case 'PROXY_TOO_LOW':
      return { ...base, key: 'proxyTooLow', minimumMaxMinor: detail(body, 'minimumMaxMinor'), refresh: true };
    case 'PROXY_CANNOT_LOWER':
      return { ...base, key: 'proxyCannotLower' };
    default:
      break;
  }
  if (error.status === 401) return { ...base, key: 'signedOut' };
  if (error.status === 429) return { ...base, key: 'rateLimited', retryAfterSeconds };
  if (error.status === 503) return { ...base, key: 'busy', refresh: true };
  return { ...base, key: 'network' };
}
