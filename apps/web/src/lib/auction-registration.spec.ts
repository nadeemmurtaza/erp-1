import { ApiError } from '@newax/shared';
import { describe, expect, it } from 'vitest';
import type { RegistrationView, ViewerLotState } from './auction-live';
import {
  REGISTRATION_POLL_MS,
  VIEWER_MIN_GAP_MS,
  describeRegistrationFailure,
  needsRegistrationPoll,
  registrationCard,
  withRegistration,
} from './auction-registration';

const registration = (over: Partial<RegistrationView> = {}): RegistrationView => ({
  mode: 'APPROVAL',
  status: 'NONE',
  alias: null,
  joinedAt: null,
  decisionReason: null,
  appeal: 'NONE',
  appealText: null,
  ...over,
});

const viewer = (over: Partial<ViewerLotState> = {}): ViewerLotState => ({
  alias: null,
  participating: false,
  leading: false,
  eligible: false,
  reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'NOT_REGISTERED', message: 'English the page never shows' },
  registration: registration(),
  ...over,
});

const refusal = (status: number, body: Record<string, unknown> = {}) => new ApiError(status, 'x', { statusCode: status, ...body });

describe('registrationCard', () => {
  it('shows nothing while the viewer is unknown or may bid: the API decides, and says so when it refuses', () => {
    expect(registrationCard(null)).toBeNull();
    expect(registrationCard(viewer({ eligible: true, reason: undefined, registration: registration({ status: 'APPROVED', alias: 'Bidder 2' }) }))).toBeNull();
  });

  it('offers to join when the person has no place yet', () => {
    expect(registrationCard(viewer())).toEqual({ kind: 'join' });
  });

  it('says the person is waiting, and since when', () => {
    expect(
      registrationCard(
        viewer({ reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'PENDING', message: '' }, registration: registration({ status: 'PENDING', joinedAt: '2026-10-10T09:00:00.000Z' }) }),
      ),
    ).toEqual({ kind: 'pending', joinedAt: '2026-10-10T09:00:00.000Z' });
  });

  it('tells a decline with the organiser’s own reason, and lets the person appeal once', () => {
    const declined = viewer({
      reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'DECLINED', message: '' },
      registration: registration({ status: 'DECLINED', decisionReason: 'Details do not match.' }),
    });
    expect(registrationCard(declined)).toEqual({ kind: 'declined', reason: 'Details do not match.', appeal: 'open', appealText: null });
  });

  it('walks a suspension through the appeal: open, sent with the text echoed, kept', () => {
    const suspended = (appeal: RegistrationView['appeal'], appealText: string | null = null) =>
      viewer({
        reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'SUSPENDED', message: '' },
        registration: registration({ status: 'SUSPENDED', decisionReason: 'Reported.', appeal, appealText }),
      });
    expect(registrationCard(suspended('NONE'))).toMatchObject({ kind: 'suspended', appeal: 'open' });
    expect(registrationCard(suspended('WAITING', 'It was a mistake.'))).toEqual({ kind: 'suspended', reason: 'Reported.', appeal: 'sent', appealText: 'It was a mistake.' });
    expect(registrationCard(suspended('KEPT'))).toMatchObject({ kind: 'suspended', appeal: 'kept', appealText: null });
  });

  it('tells staff who run the auction so, and never offers them a join', () => {
    expect(registrationCard(viewer({ reason: { code: 'BIDDER_NOT_ELIGIBLE', why: 'RUNS_AUCTION', message: '' } }))).toEqual({ kind: 'runs' });
  });

  it('falls back on the person’s status when the refusal names no cause, and on joining when it knows nothing', () => {
    expect(registrationCard(viewer({ reason: undefined, registration: registration({ status: 'PENDING' }) }))).toMatchObject({ kind: 'pending' });
    expect(registrationCard(viewer({ reason: undefined, registration: undefined }))).toEqual({ kind: 'join' });
  });
});

describe('needsRegistrationPoll', () => {
  it('keeps asking while the organiser has not decided, and while an appeal has no answer', () => {
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'PENDING' }) }))).toBe(true);
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'DECLINED', appeal: 'WAITING' }) }))).toBe(true);
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'SUSPENDED', appeal: 'WAITING' }) }))).toBe(true);
  });

  it('stops once nothing is waiting on anyone, so a settled page costs the API nothing', () => {
    expect(needsRegistrationPoll(null)).toBe(false);
    expect(needsRegistrationPoll(viewer())).toBe(false);
    expect(needsRegistrationPoll(viewer({ registration: undefined }))).toBe(false);
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'APPROVED' }) }))).toBe(false);
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'DECLINED', appeal: 'NONE' }) }))).toBe(false);
    expect(needsRegistrationPoll(viewer({ registration: registration({ status: 'DECLINED', appeal: 'KEPT' }) }))).toBe(false);
  });
});

describe('the polling parameters', () => {
  it('waits 20 000 ms between reads, and never reads twice inside one second', () => {
    expect(REGISTRATION_POLL_MS).toBe(20_000);
    expect(VIEWER_MIN_GAP_MS).toBe(1_000);
  });
});

describe('withRegistration', () => {
  it('lets an approved person bid at once and drops the refusal', () => {
    const next = withRegistration(viewer(), registration({ status: 'APPROVED', alias: 'Bidder 4' }));
    expect(next).toMatchObject({ eligible: true, alias: 'Bidder 4', registration: { status: 'APPROVED' } });
    expect(next.reason).toBeUndefined();
  });

  it('keeps a person who is waiting, declined or suspended out, with the cause in a word', () => {
    expect(withRegistration(viewer(), registration({ status: 'PENDING', alias: 'Bidder 4' }))).toMatchObject({ eligible: false, reason: { why: 'PENDING' } });
    expect(withRegistration(null, registration({ status: 'DECLINED', alias: 'Bidder 4' }))).toMatchObject({ eligible: false, reason: { why: 'DECLINED' } });
    expect(withRegistration(viewer(), registration({ status: 'SUSPENDED' }))).toMatchObject({ eligible: false, reason: { why: 'SUSPENDED' } });
  });

  it('starts from nothing when there was no viewer, and keeps what the viewer knew about the lot', () => {
    expect(withRegistration(null, registration({ status: 'PENDING' }))).toMatchObject({ participating: false, leading: false, alias: null });
    expect(withRegistration(viewer({ participating: true, leading: true }), registration({ status: 'APPROVED', alias: 'Bidder 4' }))).toMatchObject({ participating: true, leading: true });
  });
});

describe('describeRegistrationFailure', () => {
  it('says the auction is over, whatever else was true', () => {
    expect(describeRegistrationFailure(refusal(409, { code: 'REGISTRATION_CLOSED' }))).toEqual({ key: 'ended', refresh: false });
  });

  it('shows the person what is true now when their place changed under them, instead of an error about the past', () => {
    for (const code of ['APPEAL_ALREADY_OPEN', 'APPEAL_ALREADY_ANSWERED', 'NOTHING_TO_APPEAL', 'BIDDER_CHANGED', 'BIDDER_NOT_ELIGIBLE']) {
      expect(describeRegistrationFailure(refusal(code === 'BIDDER_NOT_ELIGIBLE' ? 403 : 409, { code }))).toEqual({ key: 'changed', refresh: true });
    }

  });

  it('carries the wait on a rate limit when the body says one, and says "a moment" when it does not', () => {
    expect(describeRegistrationFailure(refusal(429, { retryAfterSeconds: 12 }))).toEqual({ key: 'rateLimited', retryAfterSeconds: 12, refresh: false });
    expect(describeRegistrationFailure(refusal(429, { message: 'Too Many Requests' }))).toEqual({ key: 'rateLimitedNow', refresh: false });
  });

  it('says an auction that cannot be found is not taking bidders, rather than that their place changed', () => {
    expect(describeRegistrationFailure(refusal(404))).toEqual({ key: 'unavailable', refresh: false });
  });

  it('sends a signed-out person to sign in, and calls anything else a failure that changed nothing', () => {
    expect(describeRegistrationFailure(refusal(401))).toEqual({ key: 'signedOut', refresh: false });
    expect(describeRegistrationFailure(refusal(500))).toEqual({ key: 'generic', refresh: false });
    expect(describeRegistrationFailure(refusal(400, { message: 'Write why' }))).toEqual({ key: 'generic', refresh: false });
  });

  it('calls a request that never arrived a network failure', () => {
    expect(describeRegistrationFailure(new TypeError('Failed to fetch'))).toEqual({ key: 'network', refresh: false });
  });
});
