import {
  appealState,
  registrationView,
  type BidderRow,
  decideRegistration,
  decisionNeedsReason,
  DEFAULT_STRIKE_WINDOW_DAYS,
  DEFAULT_STRIKES_TO_REVIEW,
  eligibility,
  INELIGIBLE_MESSAGES,
  isReviewDue,
  nextBidderStatus,
  parseRegistrationMode,
  parseTrustPolicy,
  strikeWindowStart,
  type BidderStatus,
  type RegistrationMode,
} from './bidder-trust';

/**
 * launchpad-apps/234-auction-app.md §8 and §15 (WO-234.5): the rules a bid, a
 * registration and a staff decision all stand on. Every one is pure, so what a
 * person is told on the lot page and what the API refuses cannot disagree.
 */
describe('eligibility', () => {
  const run = (over: Partial<Parameters<typeof eligibility>[0]> = {}) =>
    eligibility({ runsAuction: false, mode: 'OPEN', bidderStatus: null, reviewDue: false, ...over });

  it('lets an approved bidder bid in every mode', () => {
    for (const mode of ['OPEN', 'VERIFIED', 'APPROVAL'] as const) {
      expect(run({ mode, bidderStatus: 'APPROVED' })).toEqual({ eligible: true });
    }
  });

  it('refuses whoever runs the auction, whatever else is true of them', () => {
    expect(run({ runsAuction: true })).toEqual({ eligible: false, reason: 'RUNS_AUCTION' });
    expect(run({ runsAuction: true, bidderStatus: 'APPROVED', mode: 'OPEN' })).toEqual({ eligible: false, reason: 'RUNS_AUCTION' });
  });

  it('names each state that is not approved', () => {
    expect(run({ bidderStatus: 'PENDING' })).toEqual({ eligible: false, reason: 'PENDING' });
    expect(run({ bidderStatus: 'DECLINED' })).toEqual({ eligible: false, reason: 'DECLINED' });
    expect(run({ bidderStatus: 'SUSPENDED' })).toEqual({ eligible: false, reason: 'SUSPENDED' });
  });

  it('lets someone with no row bid under OPEN, because the first bid registers them', () => {
    expect(run({ mode: 'OPEN' })).toEqual({ eligible: true });
  });

  it('makes someone with no row register first under VERIFIED and APPROVAL', () => {
    expect(run({ mode: 'VERIFIED' })).toEqual({ eligible: false, reason: 'NOT_REGISTERED' });
    expect(run({ mode: 'APPROVAL' })).toEqual({ eligible: false, reason: 'NOT_REGISTERED' });
  });

  it('makes a person at the strike threshold register and wait even under OPEN', () => {
    expect(run({ mode: 'OPEN', reviewDue: true })).toEqual({ eligible: false, reason: 'NOT_REGISTERED' });
  });

  it('does not let the threshold take an approved bidder off an auction: only a decision does', () => {
    expect(run({ mode: 'OPEN', bidderStatus: 'APPROVED', reviewDue: true })).toEqual({ eligible: true });
  });

  it('has a message for every reason', () => {
    for (const reason of ['RUNS_AUCTION', 'NOT_REGISTERED', 'PENDING', 'DECLINED', 'SUSPENDED'] as const) {
      expect(INELIGIBLE_MESSAGES[reason].length).toBeGreaterThan(10);
    }
  });
});

describe('decideRegistration', () => {
  const decide = (mode: RegistrationMode, verified: boolean, reviewDue = false) => decideRegistration({ mode, verified, reviewDue });

  it('approves at once under OPEN', () => {
    expect(decide('OPEN', false)).toBe('APPROVED');
  });

  it('approves a verified person under VERIFIED and holds everyone else for staff', () => {
    expect(decide('VERIFIED', true)).toBe('APPROVED');
    expect(decide('VERIFIED', false)).toBe('PENDING');
  });

  it('holds everyone under APPROVAL, verified or not', () => {
    expect(decide('APPROVAL', true)).toBe('PENDING');
    expect(decide('APPROVAL', false)).toBe('PENDING');
  });

  it('never approves a person at the strike threshold without a human, in any mode', () => {
    expect(decide('OPEN', true, true)).toBe('PENDING');
    expect(decide('VERIFIED', true, true)).toBe('PENDING');
  });
});

describe('nextBidderStatus', () => {
  const statuses: BidderStatus[] = ['PENDING', 'APPROVED', 'SUSPENDED', 'DECLINED'];

  it('approves anything that is not already approved, including after an appeal', () => {
    for (const status of ['PENDING', 'SUSPENDED', 'DECLINED'] as const) {
      expect(nextBidderStatus(status, 'APPROVE', false)).toEqual({ ok: true, status: 'APPROVED' });
    }
    expect(nextBidderStatus('APPROVED', 'APPROVE', false)).toMatchObject({ ok: false });
  });

  it('declines only a registration that is waiting', () => {
    expect(nextBidderStatus('PENDING', 'DECLINE', false)).toEqual({ ok: true, status: 'DECLINED' });
    for (const status of statuses.filter((s) => s !== 'PENDING')) {
      expect(nextBidderStatus(status, 'DECLINE', false)).toMatchObject({ ok: false });
    }
  });

  it('suspends only an approved bidder', () => {
    expect(nextBidderStatus('APPROVED', 'SUSPEND', false)).toEqual({ ok: true, status: 'SUSPENDED' });
    for (const status of statuses.filter((s) => s !== 'APPROVED')) {
      expect(nextBidderStatus(status, 'SUSPEND', false)).toMatchObject({ ok: false });
    }
  });

  it('keeps a declined or suspended decision only when there is an appeal to answer, and leaves the status as it is', () => {
    expect(nextBidderStatus('SUSPENDED', 'UPHOLD', true)).toEqual({ ok: true, status: 'SUSPENDED' });
    expect(nextBidderStatus('DECLINED', 'UPHOLD', true)).toEqual({ ok: true, status: 'DECLINED' });
    expect(nextBidderStatus('SUSPENDED', 'UPHOLD', false)).toMatchObject({ ok: false });
    expect(nextBidderStatus('APPROVED', 'UPHOLD', true)).toMatchObject({ ok: false });
    expect(nextBidderStatus('PENDING', 'UPHOLD', true)).toMatchObject({ ok: false });
  });

  it('asks for a reason on every decision the bidder reads, and not on an approval', () => {
    expect(decisionNeedsReason('APPROVE')).toBe(false);
    for (const decision of ['DECLINE', 'SUSPEND', 'UPHOLD'] as const) expect(decisionNeedsReason(decision)).toBe(true);
  });
});

describe('appealState', () => {
  const at = new Date('2026-10-03T11:00:00Z');

  it('is none until the bidder appeals', () => {
    expect(appealState({ appealedAt: null, appealText: null })).toBe('NONE');
  });

  it('is waiting while the appeal has its text', () => {
    expect(appealState({ appealedAt: at, appealText: 'I paid on the 4th.' })).toBe('WAITING');
  });

  it('is kept once staff answered it: the text is gone and the instant stays, final until a new decision clears both', () => {
    expect(appealState({ appealedAt: at, appealText: null })).toBe('KEPT');
  });
});

describe('registrationView', () => {
  const row = (over: Partial<BidderRow> = {}): BidderRow => ({
    alias: 'Bidder 7',
    status: 'APPROVED',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    decisionReason: null,
    appealText: null,
    appealedAt: null,
    ...over,
  });

  it('says NONE for someone who has not joined, with nothing to show', () => {
    expect(registrationView('APPROVAL', null)).toEqual({
      mode: 'APPROVAL',
      status: 'NONE',
      alias: null,
      joinedAt: null,
      decisionReason: null,
      appeal: 'NONE',
      appealText: null,
    });
  });

  it('shows the organiser’s reason only to a declined or suspended bidder', () => {
    expect(registrationView('APPROVAL', row({ status: 'DECLINED', decisionReason: 'No ID on file' })).decisionReason).toBe('No ID on file');
    expect(registrationView('APPROVAL', row({ status: 'SUSPENDED', decisionReason: 'Did not pay' })).decisionReason).toBe('Did not pay');
    expect(registrationView('APPROVAL', row({ status: 'APPROVED', decisionReason: 'ID checked' })).decisionReason).toBeNull();
    expect(registrationView('APPROVAL', row({ status: 'PENDING', decisionReason: 'left over' })).decisionReason).toBeNull();
  });

  it('echoes a waiting appeal back to its writer and no other', () => {
    const waiting = registrationView('APPROVAL', row({ status: 'SUSPENDED', appealedAt: new Date(), appealText: 'It was a mistake.' }));
    expect(waiting.appeal).toBe('WAITING');
    expect(waiting.appealText).toBe('It was a mistake.');
    const kept = registrationView('APPROVAL', row({ status: 'SUSPENDED', appealedAt: new Date(), appealText: null }));
    expect(kept.appeal).toBe('KEPT');
    expect(kept.appealText).toBeNull();
  });

  it('reports no appeal on a bidder who is not declined or suspended, whatever the columns hold', () => {
    expect(registrationView('OPEN', row({ status: 'APPROVED', appealedAt: new Date(), appealText: 'stale' })).appeal).toBe('NONE');
  });
});

describe('strike policy', () => {
  it('reads each Setting it can trust and defaults the other', () => {
    expect(parseTrustPolicy({ strikesToReview: 5, strikeWindowDays: 90 })).toEqual({ strikesToReview: 5, strikeWindowMs: 90 * 86_400_000 });
    expect(parseTrustPolicy({ strikesToReview: 5, strikeWindowDays: 'a year' })).toEqual({
      strikesToReview: 5,
      strikeWindowMs: DEFAULT_STRIKE_WINDOW_DAYS * 86_400_000,
    });
    expect(parseTrustPolicy({ strikesToReview: 0, strikeWindowDays: 90 }).strikesToReview).toBe(DEFAULT_STRIKES_TO_REVIEW);
  });

  it('refuses values outside the allowed range and values that are not whole numbers', () => {
    expect(parseTrustPolicy({ strikesToReview: 21, strikeWindowDays: 3_651 })).toEqual({
      strikesToReview: DEFAULT_STRIKES_TO_REVIEW,
      strikeWindowMs: DEFAULT_STRIKE_WINDOW_DAYS * 86_400_000,
    });
    expect(parseTrustPolicy({ strikesToReview: 2.5, strikeWindowDays: 1.5 }).strikesToReview).toBe(DEFAULT_STRIKES_TO_REVIEW);
    expect(parseTrustPolicy({ strikesToReview: null, strikeWindowDays: undefined })).toEqual({
      strikesToReview: 3,
      strikeWindowMs: 365 * 86_400_000,
    });
  });

  it('flags at exactly the threshold and not one strike before', () => {
    const policy = parseTrustPolicy({ strikesToReview: 3, strikeWindowDays: 365 });
    expect(isReviewDue(2, policy)).toBe(false);
    expect(isReviewDue(3, policy)).toBe(true);
    expect(isReviewDue(4, policy)).toBe(true);
  });

  it('starts the window exactly 365 days back', () => {
    const policy = parseTrustPolicy({ strikesToReview: 3, strikeWindowDays: 365 });
    const now = new Date('2026-10-03T00:00:00.000Z');
    expect(strikeWindowStart(now, policy).toISOString()).toBe('2025-10-03T00:00:00.000Z');
  });
});

describe('parseRegistrationMode', () => {
  it('keeps a known mode and falls back to APPROVAL for anything else', () => {
    expect(parseRegistrationMode('OPEN')).toBe('OPEN');
    expect(parseRegistrationMode('VERIFIED')).toBe('VERIFIED');
    expect(parseRegistrationMode('APPROVAL')).toBe('APPROVAL');
    expect(parseRegistrationMode('everyone')).toBe('APPROVAL');
    expect(parseRegistrationMode(undefined)).toBe('APPROVAL');
    expect(parseRegistrationMode(null, 'OPEN')).toBe('OPEN');
  });
});
