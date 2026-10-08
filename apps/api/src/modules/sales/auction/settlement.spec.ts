import {
  invoiceLines,
  isCovered,
  paymentDueAt,
  pickNextBidder,
  premiumFor,
  settlementActions,
  settlementAmounts,
  STALLED_INVOICING_MS,
} from './settlement';
import { MAX_PRICE_MINOR } from './bidding';

describe('premiumFor', () => {
  it('is nothing at zero basis points', () => {
    expect(premiumFor(1_250_000, 0)).toBe(0);
  });

  it('takes a whole percentage of the bid', () => {
    expect(premiumFor(1_000_000, 1_000)).toBe(100_000);
    expect(premiumFor(250_000, 250)).toBe(6_250);
  });

  it('rounds half up to a whole minor unit, never down to nothing on a small bid', () => {
    // 1 minor unit at 5% is 0.05, which rounds to nothing; 10 at 5% is 0.5, which rounds up.
    expect(premiumFor(1, 500)).toBe(0);
    expect(premiumFor(10, 500)).toBe(1);
    expect(premiumFor(19, 500)).toBe(1);
    expect(premiumFor(30, 500)).toBe(2);
  });

  it('is exact at the largest price, where a double would not be', () => {
    // 10^15 x 5 000 = 5 x 10^18, past 2^53. The answer is exactly half the price.
    expect(premiumFor(MAX_PRICE_MINOR, 5_000)).toBe(MAX_PRICE_MINOR / 2);
    expect(Number.isSafeInteger(settlementAmounts(MAX_PRICE_MINOR, 5_000).totalMinor)).toBe(true);
  });

  it('refuses nonsense instead of inventing a fee', () => {
    expect(() => premiumFor(-1, 100)).toThrow(RangeError);
    expect(() => premiumFor(1.5, 100)).toThrow(RangeError);
    expect(() => premiumFor(100, -1)).toThrow(RangeError);
    expect(() => premiumFor(100, 0.5)).toThrow(RangeError);
  });
});

describe('settlementAmounts', () => {
  it('adds the premium to the winning bid', () => {
    expect(settlementAmounts(800_000, 1_000)).toEqual({ hammerMinor: 800_000, premiumMinor: 80_000, totalMinor: 880_000 });
  });
});

describe('paymentDueAt and isCovered', () => {
  it('counts the window from the moment given', () => {
    expect(paymentDueAt(new Date('2026-10-07T10:00:00.000Z'), 72 * 3_600_000).toISOString()).toBe('2026-10-10T10:00:00.000Z');
  });

  it('is covered exactly when what was received reaches what is owed', () => {
    expect(isCovered(879_999, 880_000)).toBe(false);
    expect(isCovered(880_000, 880_000)).toBe(true);
    expect(isCovered(900_000, 880_000)).toBe(true);
    expect(isCovered(0, 0)).toBe(false);
  });
});

describe('invoiceLines', () => {
  const base = { auctionNumber: 'AUC-2026-0007', lotNo: 3, lotTitle: 'Brass lamp' };

  it('is one line for the lot when there is no premium', () => {
    const lines = invoiceLines({ ...base, amounts: settlementAmounts(500_000, 0), premiumBps: 0 });
    expect(lines).toEqual([{ name: 'Brass lamp (lot 3, AUC-2026-0007)', kind: 'GOODS', amountMinor: 500_000 }]);
  });

  it('adds the premium as its own service line, with the rate as written', () => {
    const lines = invoiceLines({ ...base, amounts: settlementAmounts(500_000, 250), premiumBps: 250 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({ name: "Buyer's premium (2.5%, AUC-2026-0007)", kind: 'SERVICE', amountMinor: 12_500 });
    expect(lines.reduce((sum, l) => sum + l.amountMinor, 0)).toBe(512_500);
  });

  it('leaves out a premium that rounds to nothing', () => {
    expect(invoiceLines({ ...base, amounts: settlementAmounts(1, 500), premiumBps: 500 })).toHaveLength(1);
  });
});

describe('settlementActions', () => {
  it('lets staff end a debt that is waiting, not one that is paid', () => {
    expect(settlementActions('AWAITING_PAYMENT', { isLatestForLot: true }).cancel).toBe(true);
    expect(settlementActions('PAID', { isLatestForLot: true })).toEqual({ replay: false, cancel: false, offerNext: false });
  });

  it('offers the lot onward only after a debt ended unpaid, and only from the latest one', () => {
    expect(settlementActions('EXPIRED', { isLatestForLot: true }).offerNext).toBe(true);
    expect(settlementActions('CANCELLED', { isLatestForLot: true }).offerNext).toBe(true);
    expect(settlementActions('EXPIRED', { isLatestForLot: false }).offerNext).toBe(false);
    expect(settlementActions('AWAITING_PAYMENT', { isLatestForLot: true }).offerNext).toBe(false);
  });

  it('replays a failed invoice at once and a stuck one only after it has been stuck a while', () => {
    expect(settlementActions('INVOICE_FAILED', { isLatestForLot: true }).replay).toBe(true);
    expect(settlementActions('INVOICING', { isLatestForLot: true, stalledMs: 5_000 }).replay).toBe(false);
    expect(settlementActions('INVOICING', { isLatestForLot: true, stalledMs: STALLED_INVOICING_MS }).replay).toBe(true);
  });
});

describe('pickNextBidder', () => {
  const candidates = [
    { bidderId: 'b1', status: 'APPROVED', highestBidMinor: 900_000 },
    { bidderId: 'b2', status: 'APPROVED', highestBidMinor: 850_000 },
    { bidderId: 'b3', status: 'SUSPENDED', highestBidMinor: 880_000 },
    { bidderId: 'b4', status: 'APPROVED', highestBidMinor: 850_000 },
  ];

  it('takes the highest bid among those not yet given a turn', () => {
    expect(pickNextBidder(candidates, ['b1'])?.bidderId).toBe('b2');
  });

  it('skips a bidder who is suspended, however high they bid', () => {
    expect(pickNextBidder(candidates, ['b1', 'b2', 'b4'])).toBeNull();
  });

  it('breaks a tie the same way for everyone who asks', () => {
    expect(pickNextBidder(candidates, ['b1'])?.bidderId).toBe('b2');
    expect(pickNextBidder([...candidates].reverse(), ['b1'])?.bidderId).toBe('b2');
  });

  it('is null when nobody is left', () => {
    expect(pickNextBidder([], [])).toBeNull();
  });
});
