import { describe, expect, it } from 'vitest';
import type { ViewerLotState } from './auction-live';
import {
  SETTLEMENT_FAST_POLL_MS,
  SETTLEMENT_FAST_READS,
  SETTLEMENT_SLOW_POLL_MS,
  expectsSettlement,
  needsSettlementPoll,
  premiumPercent,
  settlementCard,
  settlementPollMs,
  type WinnerSettlement,
} from './auction-settlement';

const owed = (over: Partial<WinnerSettlement> = {}): WinnerSettlement => ({
  status: 'AWAITING_PAYMENT',
  attempt: 1,
  currency: 'pkr',
  hammerMinor: 100_000,
  premiumMinor: 10_000,
  totalMinor: 110_000,
  paidMinor: 0,
  dueAt: '2026-10-13T12:00:00.000Z',
  orderNumber: 'ORD-1',
  ...over,
});

const viewer = (settlement: WinnerSettlement | null): ViewerLotState => ({ alias: 'Bidder 2', participating: true, leading: true, eligible: true, settlement });

describe('settlementCard', () => {
  it('says nothing for someone who is not the buyer and has no debt', () => {
    expect(settlementCard(null, false)).toBeNull();
    expect(settlementCard(undefined, false)).toBeNull();
  });

  it('says the invoice is being prepared when the result names this person and no debt has appeared yet', () => {
    expect(settlementCard(null, true)).toEqual({ kind: 'preparing' });
    expect(settlementCard(owed({ status: 'INVOICING' }), true)).toEqual({ kind: 'preparing' });
  });

  it('says the invoice is late, without blame, when it could not be made', () => {
    expect(settlementCard(owed({ status: 'INVOICE_FAILED', orderNumber: null }), true)).toEqual({ kind: 'delayed' });
  });

  it('shows what is owed with the premium apart from the bid, and when to pay by', () => {
    expect(settlementCard(owed(), true)).toEqual({
      kind: 'pay',
      offered: false,
      hammerMinor: 100_000,
      premiumMinor: 10_000,
      totalMinor: 110_000,
      leftMinor: null,
      dueAt: '2026-10-13T12:00:00.000Z',
      orderNumber: 'ORD-1',
    });
  });

  it('shows what is left only once part has been paid, and never a negative amount', () => {
    expect(settlementCard(owed({ paidMinor: 40_000 }), true)).toMatchObject({ kind: 'pay', leftMinor: 70_000 });
    expect(settlementCard(owed({ paidMinor: 150_000 }), true)).toMatchObject({ kind: 'pay', leftMinor: 0 });
  });

  it('tells a bidder the lot was offered to them when it is a later offer', () => {
    expect(settlementCard(owed({ attempt: 2 }), false)).toMatchObject({ kind: 'pay', offered: true });
  });

  it('covers every ending: paid, lapsed (with any late payment), cancelled', () => {
    expect(settlementCard(owed({ status: 'PAID', paidMinor: 110_000 }), true)).toEqual({ kind: 'paid', totalMinor: 110_000, orderNumber: 'ORD-1' });
    expect(settlementCard(owed({ status: 'EXPIRED' }), true)).toEqual({ kind: 'lapsed', dueAt: '2026-10-13T12:00:00.000Z', paidMinor: 0 });
    expect(settlementCard(owed({ status: 'EXPIRED', paidMinor: 110_000 }), true)).toMatchObject({ kind: 'lapsed', paidMinor: 110_000 });
    expect(settlementCard(owed({ status: 'CANCELLED' }), true)).toEqual({ kind: 'cancelled' });
  });
});

describe('expectsSettlement', () => {
  const sold = { kind: 'SOLD', topBidderAlias: 'Bidder 2', finalMinor: 100_000 } as const;
  it('is true only for the named buyer of a closed lot', () => {
    expect(expectsSettlement(sold, 'CLOSED', 'Bidder 2')).toBe(true);
    expect(expectsSettlement(sold, 'CLOSED', 'Bidder 3')).toBe(false);
    expect(expectsSettlement(sold, 'CLOSED', null)).toBe(false);
    expect(expectsSettlement(sold, 'OPEN', 'Bidder 2')).toBe(false);
    expect(expectsSettlement({ kind: 'NOT_SOLD', reason: 'NO_BIDS' }, 'CLOSED', 'Bidder 2')).toBe(false);
    expect(expectsSettlement(undefined, 'CLOSED', 'Bidder 2')).toBe(false);
  });
});

describe('needsSettlementPoll', () => {
  it('keeps asking while the buyer has no invoice yet, or it is being made', () => {
    expect(needsSettlementPoll(null, true)).toBe(true);
    expect(needsSettlementPoll(viewer(null), true)).toBe(true);
    expect(needsSettlementPoll(viewer(owed({ status: 'INVOICING' })), true)).toBe(true);
  });

  it('stops once there is something to show, and never asks for anyone who is not the buyer', () => {
    for (const status of ['INVOICE_FAILED', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED'] as const) {
      expect(needsSettlementPoll(viewer(owed({ status })), true)).toBe(false);
    }
    expect(needsSettlementPoll(viewer(null), false)).toBe(false);
  });
});

describe('settlementPollMs', () => {
  it('asks every 5 seconds for the first minute, then every 20', () => {
    expect(settlementPollMs(0)).toBe(SETTLEMENT_FAST_POLL_MS);
    expect(settlementPollMs(SETTLEMENT_FAST_READS - 1)).toBe(SETTLEMENT_FAST_POLL_MS);
    expect(settlementPollMs(SETTLEMENT_FAST_READS)).toBe(SETTLEMENT_SLOW_POLL_MS);
    expect(SETTLEMENT_FAST_READS * SETTLEMENT_FAST_POLL_MS).toBe(60_000);
  });
});

describe('premiumPercent', () => {
  it('turns basis points into the percentage a sentence quotes', () => {
    expect(premiumPercent(1_000)).toBe(10);
    expect(premiumPercent(250)).toBe(2.5);
    expect(premiumPercent(0)).toBe(0);
  });
});
