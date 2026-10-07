import { ApiError } from '@newax/shared';
import { describe, expect, it } from 'vitest';
import {
  amountBreakdown,
  defaultSettlementFilter,
  describeSettlementFailure,
  describeSettlementLoadFailure,
  leftToPay,
  offerNextConsequence,
  receivedAfterEnd,
  settlementActLabel,
  settlementActs,
  settlementFilterOptions,
  settlementStatusWord,
  settlementStripValue,
  settlementSuccess,
  settlementTone,
  type SettlementRow,
  type SettlementStatus,
  type SettlementSummary,
} from './auction-settlements';

const row = (over: Partial<SettlementRow> = {}): SettlementRow => ({
  id: 's1',
  attempt: 1,
  status: 'AWAITING_PAYMENT',
  lot: { id: 'l1', lotNo: 3, title: 'Pallet of denim' },
  bidder: { alias: 'Bidder 2' },
  currency: 'pkr',
  hammerMinor: 100_000,
  premiumBps: 1_000,
  premiumMinor: 10_000,
  totalMinor: 110_000,
  paidMinor: 0,
  dueAt: '2026-10-13T12:00:00.000Z',
  orderId: 'o1',
  orderNumber: 'ORD-1',
  failureReason: null,
  resolvedAt: null,
  resolutionNote: null,
  createdAt: '2026-10-10T12:00:00.000Z',
  struck: false,
  actions: { replay: false, cancel: true, offerNext: false },
  next: null,
  ...over,
});

const summary = (over: Partial<SettlementSummary> = {}): SettlementSummary => ({ awaiting: 0, needsAttention: 0, paid: 0, ended: 0, ...over });

describe('settlementActs', () => {
  it('lists only what the server said is allowed, in the order the buttons appear', () => {
    expect(settlementActs(row())).toEqual(['cancel']);
    expect(settlementActs(row({ actions: { replay: true, cancel: true, offerNext: false } }))).toEqual(['replay', 'cancel']);
    expect(settlementActs(row({ actions: { replay: false, cancel: false, offerNext: true } }))).toEqual(['offerNext']);
    expect(settlementActs(row({ actions: { replay: false, cancel: false, offerNext: false } }))).toEqual([]);
  });
});

describe('the Winners figure and its filter', () => {
  it('says what needs a person first, then what is owed, then what was paid', () => {
    expect(settlementStripValue(null)).toBe('—');
    expect(settlementStripValue(summary())).toBe('None yet');
    expect(settlementStripValue(summary({ paid: 4 }))).toBe('4 paid');
    expect(settlementStripValue(summary({ paid: 4, awaiting: 2 }))).toBe('2 unpaid');
    expect(settlementStripValue(summary({ awaiting: 2, needsAttention: 1 }))).toBe('1 to fix');
  });

  it('opens on what is still owed, and on the history only when nothing is', () => {
    expect(defaultSettlementFilter(null)).toBe('open');
    expect(defaultSettlementFilter(summary())).toBe('open');
    expect(defaultSettlementFilter(summary({ awaiting: 1, paid: 3 }))).toBe('open');
    expect(defaultSettlementFilter(summary({ needsAttention: 1 }))).toBe('open');
    expect(defaultSettlementFilter(summary({ paid: 3, ended: 1 }))).toBe('ended');
  });

  it('counts each view, and shows no counts before the summary is read', () => {
    expect(settlementFilterOptions(null).map((o) => o.label)).toEqual(['Open', 'Paid or ended', 'All']);
    expect(settlementFilterOptions(summary({ awaiting: 2, needsAttention: 1, paid: 4, ended: 3 })).map((o) => o.label)).toEqual(['Open 3', 'Paid or ended 7', 'All 10']);
  });
});

describe('words and tones', () => {
  it('has a word and a tone for every status, and a failed or lapsed win is never green', () => {
    const statuses: SettlementStatus[] = ['INVOICING', 'INVOICE_FAILED', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED'];
    for (const status of statuses) {
      expect(settlementStatusWord(status)).toMatch(/\S/);
      expect(['success', 'warning', 'danger', 'neutral', 'info']).toContain(settlementTone(status));
    }
    expect(settlementTone('PAID')).toBe('success');
    expect(settlementTone('INVOICE_FAILED')).toBe('danger');
    expect(settlementTone('EXPIRED')).toBe('danger');
    expect(settlementTone('AWAITING_PAYMENT')).toBe('warning');
  });

  it('shows the bid and the premium apart, and no premium when there is none', () => {
    expect(amountBreakdown(row())).toMatch(/bid \+ .* premium$/);
    expect(amountBreakdown(row({ premiumMinor: 0 }))).toMatch(/bid$/);
    expect(amountBreakdown(row({ premiumMinor: 0 }))).not.toMatch(/premium/);
  });
});

describe('what is left and what arrived late', () => {
  it('shows what is left only on an unpaid win that has been part-paid, never below zero', () => {
    expect(leftToPay(row())).toBeNull();
    expect(leftToPay(row({ paidMinor: 40_000 }))).toBe(70_000);
    expect(leftToPay(row({ paidMinor: 150_000 }))).toBe(0);
    expect(leftToPay(row({ status: 'PAID', paidMinor: 110_000 }))).toBeNull();
  });

  it('flags money that arrived after a win ended, and only that', () => {
    expect(receivedAfterEnd(row({ status: 'EXPIRED', paidMinor: 110_000 }))).toBe(true);
    expect(receivedAfterEnd(row({ status: 'CANCELLED', paidMinor: 5 }))).toBe(true);
    expect(receivedAfterEnd(row({ status: 'EXPIRED', paidMinor: 0 }))).toBe(false);
    expect(receivedAfterEnd(row({ status: 'PAID', paidMinor: 110_000 }))).toBe(false);
  });
});

describe('act labels and sentences', () => {
  it('names a verb and its object, never "Yes" or "OK"', () => {
    const offerable = row({ status: 'EXPIRED', next: { alias: 'Bidder 4', bidMinor: 90_000 } });
    expect(settlementActLabel('replay', offerable)).toBe('Try invoice again');
    expect(settlementActLabel('cancel', offerable)).toBe('Cancel win of lot 3');
    expect(settlementActLabel('offerNext', offerable)).toBe('Offer to next bidder: lot 3 to Bidder 4');
    expect(settlementActLabel('offerNext', row())).toBe('Offer to next bidder: lot 3');
  });

  it('says who gets the offer, at what price, and that the first buyer’s win stays ended', () => {
    const sentence = offerNextConsequence(row({ status: 'EXPIRED', next: { alias: 'Bidder 4', bidMinor: 90_000 } }));
    expect(sentence).toContain('Bidder 4');
    expect(sentence).toContain('10%');
    expect(sentence).toContain('lapsed');
    expect(offerNextConsequence(row({ status: 'CANCELLED', premiumBps: 0, next: { alias: 'Bidder 4', bidMinor: 90_000 } }))).not.toContain('premium');
    expect(offerNextConsequence(row({ status: 'CANCELLED', next: null }))).toMatch(/no one to offer it to/);
  });

  it('says what happened to which lot, including an invoice that still could not be made', () => {
    expect(settlementSuccess('cancel', row())).toBe('The win of lot 3 by Bidder 2 was cancelled. No strike was recorded.');
    expect(settlementSuccess('replay', row())).toContain('order ORD-1');
    expect(settlementSuccess('replay', row({ status: 'INVOICE_FAILED', failureReason: 'The payment method is off.' }))).toContain('could not be made yet: The payment method is off.');
    expect(settlementSuccess('offerNext', row({ bidder: { alias: 'Bidder 4' } }))).toContain('offered to Bidder 4');
  });
});

describe('failures', () => {
  const api = (status: number, body?: unknown) => new ApiError(status, 'x', body as never);

  it('tells a win that moved under the staff member what it is now, and that nothing changed', () => {
    const text = describeSettlementFailure(api(409, { code: 'SETTLEMENT_CHANGED', details: { status: 'PAID' } }), 3);
    expect(text).toContain('Lot 3 has changed');
    expect(text).toContain('now paid');
    expect(text).toContain('Nothing was changed');
  });

  it('names the capability, never its key, when someone acts on their own win', () => {
    const text = describeSettlementFailure(api(403, { code: 'CANNOT_DECIDE_OWN' }), 3);
    expect(text).toContain('See what auction winners owe');
    expect(text).not.toContain('auction.settle');
  });

  it('covers no next bidder, a missing reason, permission, a missing win and a failure to connect', () => {
    expect(describeSettlementFailure(api(409, { code: 'NO_NEXT_BIDDER' }), 3)).toContain('no one to offer it to');
    expect(describeSettlementFailure(api(409, { code: 'REASON_REQUIRED' }), 3)).toContain('Write why');
    expect(describeSettlementFailure(api(403), 3)).toContain('permission');
    expect(describeSettlementFailure(api(404), 3)).toContain('no longer here');
    expect(describeSettlementFailure(new Error('network'), 3)).toContain('could not reach the server');
    expect(describeSettlementFailure(api(500), 3)).toContain('Nothing was changed');
  });

  it('tells a failed read as what could not be shown, never the server’s own words', () => {
    expect(describeSettlementLoadFailure(api(403))).toContain('permission');
    expect(describeSettlementLoadFailure(api(404))).toContain('could not find');
    expect(describeSettlementLoadFailure(new Error('network'))).toContain('could not reach the server');
    expect(describeSettlementLoadFailure(api(500, { message: 'Internal server error' }))).not.toContain('Internal server error');
  });
});
