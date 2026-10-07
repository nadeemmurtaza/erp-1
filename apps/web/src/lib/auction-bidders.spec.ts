import { ApiError } from '@newax/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_REASON_LENGTH,
  actLabel,
  actNeedsReason,
  bidderActs,
  bidderStripValue,
  decisionOf,
  defaultFilter,
  describeBidderFailure,
  describeLoadFailure,
  filterOptions,
  filterParam,
  reasonHint,
  statusWord,
  strikeStanding,
  successSentence,
  SELF_DECISION_SENTENCE,
  type BidderDetail,
  type BidderRow,
  type BidderSummary,
} from './auction-bidders';

const summary = (over: Partial<BidderSummary> = {}): BidderSummary => ({ waiting: 0, approved: 0, stopped: 0, appeals: 0, total: 0, ...over });
const bidder = (status: BidderRow['status'], appeal: BidderRow['appeal']['state'] = 'NONE') => ({ status, appeal: { state: appeal, text: null, at: null } });
const refusal = (status: number, body: Record<string, unknown> = {}) => new ApiError(status, 'x', { statusCode: status, ...body });

describe('the queue the page opens on', () => {
  it('opens on the waiting bidders when there are any, and on everyone when there are none', () => {
    expect(defaultFilter(summary({ waiting: 2, approved: 5, total: 7 }))).toBe('waiting');
    expect(defaultFilter(summary({ approved: 5, total: 5 }))).toBe('all');
    expect(defaultFilter(null)).toBe('all');
  });

  it('puts the counts on the filter, and sends "all" as no filter at all', () => {
    expect(filterOptions(summary({ waiting: 3, approved: 12, stopped: 2, appeals: 1, total: 17 })).map((option) => option.label)).toEqual([
      'Waiting 3',
      'Approved 12',
      'Suspended or declined 2',
      'Appeals 1',
      'All 17',
    ]);
    expect(filterOptions(null).map((option) => option.label)).toEqual(['Waiting', 'Approved', 'Suspended or declined', 'Appeals', 'All']);
    expect(filterParam('all')).toBeUndefined();
    expect(filterParam('appeals')).toBe('appeals');
  });

  it('says on the strip what needs a person first, then how many are in, then that nobody is', () => {
    expect(bidderStripValue(summary({ waiting: 3, approved: 12 }))).toBe('3 waiting');
    expect(bidderStripValue(summary({ approved: 12 }))).toBe('12 approved');
    expect(bidderStripValue(summary())).toBe('None yet');
    expect(bidderStripValue(null)).toBe('—');
  });

  it('calls a bidder who has not been decided on "waiting", the organiser’s word, not the shared badge’s "pending"', () => {
    expect(statusWord('PENDING')).toBe('Waiting');
    expect(statusWord('DECLINED')).toBe('Declined');
  });
});

describe('what staff may do to a bidder', () => {
  it('lets a waiting bidder be approved or declined, and nothing else', () => {
    expect(bidderActs(bidder('PENDING'))).toEqual(['approve', 'decline']);
  });

  it('lets an approved bidder be suspended or struck, and not approved again', () => {
    expect(bidderActs(bidder('APPROVED'))).toEqual(['suspend', 'strike']);
  });

  it('lets a declined or suspended bidder be approved, and keeps a decision only while an appeal waits', () => {
    expect(bidderActs(bidder('DECLINED'))).toEqual(['approve']);
    expect(bidderActs(bidder('DECLINED', 'WAITING'))).toEqual(['approve', 'uphold']);
    expect(bidderActs(bidder('DECLINED', 'KEPT'))).toEqual(['approve']);
    expect(bidderActs(bidder('SUSPENDED'))).toEqual(['approve', 'strike']);
    expect(bidderActs(bidder('SUSPENDED', 'WAITING'))).toEqual(['approve', 'uphold', 'strike']);
  });

  it('asks for a reason on everything but an approval, because the bidder reads it', () => {
    expect(actNeedsReason('approve')).toBe(false);
    for (const act of ['decline', 'suspend', 'uphold', 'strike'] as const) expect(actNeedsReason(act)).toBe(true);
    expect(MAX_REASON_LENGTH).toBe(500);
  });

  it('names each button by its verb and its object, never "Yes"', () => {
    expect(actLabel('approve', { alias: 'Bidder 3', status: 'PENDING' })).toBe('Approve Bidder 3');
    expect(actLabel('decline', { alias: 'Bidder 3', status: 'PENDING' })).toBe('Decline Bidder 3');
    expect(actLabel('suspend', { alias: 'Bidder 3', status: 'APPROVED' })).toBe('Suspend Bidder 3');
    expect(actLabel('uphold', { alias: 'Bidder 3', status: 'DECLINED' })).toBe('Keep declined');
    expect(actLabel('uphold', { alias: 'Bidder 3', status: 'SUSPENDED' })).toBe('Keep suspended');
    expect(actLabel('strike', { alias: 'Bidder 3', status: 'APPROVED' })).toBe('Record a strike');
  });

  it('maps an act to the decision the API takes', () => {
    expect(decisionOf('approve')).toBe('APPROVE');
    expect(decisionOf('decline')).toBe('DECLINE');
    expect(decisionOf('suspend')).toBe('SUSPEND');
    expect(decisionOf('uphold')).toBe('UPHOLD');
  });

  it('tells the writer who reads the reason', () => {
    expect(reasonHint('decline', 'Bidder 3')).toContain('Bidder 3 will read');
    for (const act of ['decline', 'suspend', 'uphold', 'strike'] as const) expect(reasonHint(act, 'Bidder 3')).toMatch(/^Required\./);
    expect(reasonHint('uphold', 'Bidder 3')).toContain('appeal');
    expect(reasonHint('strike', 'Bidder 3')).toContain('Only staff');
  });
});

describe('strikes', () => {
  const policy = { strikesToReview: 3, windowDays: 365 };

  it('says where a person stands against the policy in force, at 0, below, at and above the threshold', () => {
    expect(strikeStanding({ inWindow: 0, reviewDue: false }, policy)).toBe('In the last 365 days: 0 of 3');
    expect(strikeStanding({ inWindow: 2, reviewDue: false }, policy)).toBe('In the last 365 days: 2 of 3');
    expect(strikeStanding({ inWindow: 3, reviewDue: true }, policy)).toBe(
      'In the last 365 days: 3 of 3. Review due: decide whether to suspend them. Nothing happens on its own.',
    );
    expect(strikeStanding({ inWindow: 5, reviewDue: true }, { strikesToReview: 5, windowDays: 90 })).toContain('In the last 90 days: 5 of 5. Review due');
  });
});

describe('what follows an act', () => {
  const after = (over: Partial<Pick<BidderDetail, 'status' | 'strikes'>> = {}) => ({
    alias: 'Bidder 3',
    status: 'APPROVED' as const,
    strikes: { inWindow: 1, reviewDue: false },
    policy: { strikesToReview: 3, windowDays: 365 },
    ...over,
  });

  it('says what happened to which bidder, and what it means for them', () => {
    expect(successSentence('approve', after())).toBe('Bidder 3 was approved. They can bid on every lot in this auction now.');
    expect(successSentence('decline', after({ status: 'DECLINED' }))).toBe('Bidder 3 was declined. They can read your reason and send one appeal.');
    expect(successSentence('suspend', after({ status: 'SUSPENDED' }))).toBe('Bidder 3 is suspended. Bids already placed stand; only further bids stop.');
    expect(successSentence('uphold', after({ status: 'DECLINED' }))).toContain('no further appeal');
  });

  it('says how many strikes the person now has, and that a review is due only when it is', () => {
    expect(successSentence('strike', after())).toBe('Strike recorded for Bidder 3. They now have 1 in 365 days.');
    expect(successSentence('strike', after({ strikes: { inWindow: 3, reviewDue: true } }))).toBe('Strike recorded for Bidder 3. They now have 3 in 365 days: review due.');
    expect(successSentence('void', after({ strikes: { inWindow: 2, reviewDue: false } }))).toBe('Strike voided. Bidder 3 now has 2 in 365 days.');
  });
});

describe('describeBidderFailure', () => {
  it('says someone else decided first, with the status they left, and that nothing was changed', () => {
    const text = describeBidderFailure(refusal(409, { code: 'BIDDER_CHANGED', details: { status: 'APPROVED' } }), 'Bidder 3');
    expect(text).toContain('Someone else just decided on Bidder 3 and is now approved');
    expect(text).toContain('Nothing was changed');
  });

  it('prints the self-decision sentence for the refusal the server gives', () => {
    expect(describeBidderFailure(refusal(403, { code: 'CANNOT_DECIDE_OWN' }), 'Bidder 3')).toBe(SELF_DECISION_SENTENCE);
    expect(SELF_DECISION_SENTENCE).not.toContain('auction.bidders.manage');
  });

  it('tells a strike that was already voided, a state that does not allow the act, and a missing reason', () => {
    expect(describeBidderFailure(refusal(409, { code: 'STRIKE_ALREADY_VOID' }), 'Bidder 3')).toContain('already voided');
    expect(describeBidderFailure(refusal(409, { code: 'DECISION_NOT_ALLOWED', message: 'This bidder is already approved.' }), 'Bidder 3')).toBe(
      'This bidder is already approved. Nothing was changed.',
    );
    expect(describeBidderFailure(refusal(400, { message: 'Write the reason. The bidder will read it.' }), 'Bidder 3')).toBe(
      'Write the reason. The bidder will read it. Nothing was changed.',
    );
  });

  it('does not show a validation list as a sentence', () => {
    expect(describeBidderFailure(refusal(400, { message: ['reason must be shorter than 500'] }), 'Bidder 3')).toContain('We could not save that');
  });

  it('names a missing permission and a bidder who is gone, and calls a request that never arrived a connection problem', () => {
    expect(describeBidderFailure(refusal(403), 'Bidder 3')).toContain('permission');
    expect(describeBidderFailure(refusal(404), 'Bidder 3')).toContain('Bidder 3 is no longer in this auction');
    expect(describeBidderFailure(new TypeError('Failed to fetch'), 'Bidder 3')).toContain('could not reach the server');
    expect(describeBidderFailure(refusal(500), 'Bidder 3')).toContain('We could not save that');
  });
});

describe('describeLoadFailure', () => {
  it('never shows the server\'s own words for a failed read, and does not claim a change was refused', () => {
    const text = describeLoadFailure(refusal(500, { message: 'Internal server error' }), 'bidders');
    expect(text).toBe('We could not load the bidders. Try again.');
    expect(text).not.toMatch(/Internal|Nothing was changed/);
  });

  it('tells a missing permission, a missing record and a dead connection apart, naming what could not be shown', () => {
    expect(describeLoadFailure(refusal(403), 'bidder')).toBe('You do not have permission to see this bidder. Ask an administrator.');
    expect(describeLoadFailure(refusal(404), 'next')).toContain('could not find the next bidder');
    expect(describeLoadFailure(new TypeError('Failed to fetch'), 'bidders')).toContain('could not reach the server to load the bidders');
  });
});
