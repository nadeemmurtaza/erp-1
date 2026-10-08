import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuctionBidderService } from './auction-bidder.service';
import { BidderListQueryDto } from './dto/auction.dto';

/**
 * launchpad-apps/234-auction-app.md §8 (WO-234.5): a person joins an auction,
 * staff decide on them and hold them to account, and each of those acts is
 * refused when it should be. The database is mocked, so these prove the
 * decisions and the order they are made in; the writes against a real Postgres,
 * and the guard under concurrency, are `test/auction-bidders.e2e-spec.ts`.
 */
describe('AuctionBidderService', () => {
  let service: AuctionBidderService;
  let prisma: any;
  let settings: { get: jest.Mock };
  let audit: { recordEvidence: jest.Mock };
  let identity: { isApproved: jest.Mock };
  let auction: any;

  const customer = { id: 'u-customer', permissions: [] as string[] };
  const staff = { id: 'u-staff', permissions: ['auction.bidders.manage'] };

  const bidderRow = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    auctionId: 'a1',
    userId: 'u-customer',
    alias: 'Bidder 1',
    status: 'PENDING',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    decidedById: null,
    decidedAt: null,
    decisionReason: null,
    appealText: null,
    appealedAt: null,
    auction: { number: 'AUC-2026-0001' },
    ...over,
  });

  beforeEach(() => {
    auction = { id: 'a1', number: 'AUC-2026-0001', status: 'OPEN', registration: 'APPROVAL', createdById: 'u-owner' };
    prisma = {
      auction: { findUnique: jest.fn(async () => auction) },
      bidder: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ id: 'b-new', createdAt: new Date('2026-10-03T10:00:00Z'), decisionReason: null, appealText: null, appealedAt: null, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      bidderStrike: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(async ({ data }: any) => ({ id: 's1', ...data })),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      auctionLot: { findFirst: jest.fn().mockResolvedValue({ id: 'l1' }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    settings = { get: jest.fn().mockResolvedValue(undefined) };
    audit = { recordEvidence: jest.fn().mockResolvedValue(undefined) };
    identity = { isApproved: jest.fn().mockResolvedValue(false) };
    service = new AuctionBidderService(prisma, settings as never, { ...audit } as never, identity as never);
  });

  const error = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (caught: any) {
      return caught;
    }
    throw new Error('expected a refusal');
  };

  describe('joining an auction', () => {
    it('waits for staff under APPROVAL, and records the join in the same transaction', async () => {
      const view = await service.join('a1', customer);
      expect(prisma.bidder.create).toHaveBeenCalledWith({ data: { auctionId: 'a1', userId: 'u-customer', alias: 'Bidder 1', status: 'PENDING' } });
      expect(view).toMatchObject({ mode: 'APPROVAL', status: 'PENDING', alias: 'Bidder 1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'auction.bidder_joined', actorId: 'u-customer', data: expect.objectContaining({ status: 'PENDING', mode: 'APPROVAL' }) }),
      );
    });

    it('approves at once under OPEN', async () => {
      auction.registration = 'OPEN';
      expect(await service.join('a1', customer)).toMatchObject({ status: 'APPROVED' });
    });

    it('approves a verified person under VERIFIED and holds an unverified one, asking the identity module only for VERIFIED', async () => {
      auction.registration = 'VERIFIED';
      identity.isApproved.mockResolvedValue(true);
      expect(await service.join('a1', customer)).toMatchObject({ status: 'APPROVED' });
      identity.isApproved.mockResolvedValue(false);
      expect(await service.join('a1', { id: 'u-two', permissions: [] })).toMatchObject({ status: 'PENDING' });

      identity.isApproved.mockClear();
      auction.registration = 'APPROVAL';
      await service.join('a1', { id: 'u-three', permissions: [] });
      expect(identity.isApproved).not.toHaveBeenCalled();
    });

    it('treats a failing identity lookup as not verified: the person waits and is never approved by a guess', async () => {
      auction.registration = 'VERIFIED';
      identity.isApproved.mockRejectedValue(new Error('provider down'));
      expect(await service.join('a1', customer)).toMatchObject({ status: 'PENDING' });
    });

    it('makes a person at the strike threshold wait even under OPEN', async () => {
      auction.registration = 'OPEN';
      prisma.bidderStrike.count.mockResolvedValue(3);
      expect(await service.join('a1', customer)).toMatchObject({ status: 'PENDING' });
    });

    it('is idempotent: joining twice returns the place already held and writes and records nothing', async () => {
      prisma.bidder.findUnique.mockResolvedValue(bidderRow({ status: 'APPROVED' }));
      expect(await service.join('a1', customer)).toMatchObject({ status: 'APPROVED', alias: 'Bidder 1' });
      expect(prisma.bidder.create).not.toHaveBeenCalled();
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('records one join when two tabs race and the second finds the first’s row under the lock', async () => {
      prisma.bidder.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(bidderRow({ status: 'PENDING' }));
      expect(await service.join('a1', customer)).toMatchObject({ status: 'PENDING' });
      expect(prisma.bidder.create).not.toHaveBeenCalled();
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('bars staff who run the auction and its author, by data', async () => {
      const bySkill = await error(service.join('a1', { id: 'u-x', permissions: ['auction.manage'] }));
      expect(bySkill).toBeInstanceOf(ForbiddenException);
      expect(bySkill.getResponse()).toMatchObject({ code: 'BIDDER_NOT_ELIGIBLE', details: { why: 'RUNS_AUCTION' } });
      expect(await error(service.join('a1', { id: 'u-owner', permissions: [] }))).toBeInstanceOf(ForbiddenException);
      expect(prisma.bidder.create).not.toHaveBeenCalled();
    });

    it.each(['DRAFT', 'CANCELLED'])('is a 404 for a %s auction, as it is to the public', async (status) => {
      auction.status = status;
      expect(await error(service.join('a1', customer))).toBeInstanceOf(NotFoundException);
    });

    it('is a 404 for an auction that does not exist', async () => {
      prisma.auction.findUnique.mockResolvedValue(null);
      expect(await error(service.join('missing', customer))).toBeInstanceOf(NotFoundException);
    });

    it.each(['CLOSING', 'CLOSED', 'SETTLED'])('is refused once the auction is %s, saying it has ended', async (status) => {
      auction.status = status;
      const refused = await error(service.join('a1', customer));
      expect(refused).toBeInstanceOf(ConflictException);
      expect(refused.getResponse()).toMatchObject({ code: 'REGISTRATION_CLOSED' });
    });

    it('lets someone join while the auction is only scheduled', async () => {
      auction.status = 'SCHEDULED';
      expect(await service.join('a1', customer)).toMatchObject({ status: 'PENDING' });
    });

    it('fails the join when its audit row cannot be written, so nothing is half-recorded', async () => {
      audit.recordEvidence.mockRejectedValue(new Error('audit down'));
      await expect(service.join('a1', customer)).rejects.toThrow('audit down');
    });
  });

  describe('an appeal', () => {
    const stopped = (over: Record<string, unknown> = {}) => bidderRow({ status: 'SUSPENDED', decisionReason: 'Did not pay', ...over });

    it('is stored for a declined or suspended bidder, whose registration is then echoed back to them', async () => {
      prisma.bidder.findUnique.mockResolvedValue(stopped());
      prisma.bidder.findUniqueOrThrow.mockResolvedValue(stopped({ appealText: 'I paid on the 4th.', appealedAt: new Date() }));
      const view = await service.appeal('a1', customer, '  I paid on the 4th.  ');
      expect(prisma.bidder.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: 'SUSPENDED', appealedAt: null },
        data: { appealText: 'I paid on the 4th.', appealedAt: expect.any(Date) },
      });
      expect(view).toMatchObject({ appeal: 'WAITING', appealText: 'I paid on the 4th.' });
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, expect.objectContaining({ action: 'auction.bidder_appealed', data: expect.objectContaining({ appeal: 'I paid on the 4th.' }) }));
    });

    it.each(['PENDING', 'APPROVED'])('has nothing to appeal for a %s bidder', async (status) => {
      prisma.bidder.findUnique.mockResolvedValue(bidderRow({ status }));
      const refused = await error(service.appeal('a1', customer, 'Please look again'));
      expect(refused.getResponse()).toMatchObject({ code: 'NOTHING_TO_APPEAL' });
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    it('allows one open appeal, and one for each decision: a kept decision is final', async () => {
      prisma.bidder.findUnique.mockResolvedValue(stopped({ appealText: 'First', appealedAt: new Date() }));
      expect((await error(service.appeal('a1', customer, 'Again'))).getResponse()).toMatchObject({ code: 'APPEAL_ALREADY_OPEN' });
      prisma.bidder.findUnique.mockResolvedValue(stopped({ appealText: null, appealedAt: new Date() }));
      expect((await error(service.appeal('a1', customer, 'Again'))).getResponse()).toMatchObject({ code: 'APPEAL_ALREADY_ANSWERED' });
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    it('says the bidder changed when staff decided between the read and the write', async () => {
      prisma.bidder.findUnique.mockResolvedValue(stopped());
      prisma.bidder.updateMany.mockResolvedValue({ count: 0 });
      expect((await error(service.appeal('a1', customer, 'Please'))).getResponse()).toMatchObject({ code: 'BIDDER_CHANGED' });
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('refuses an empty appeal, someone who never joined, and an auction that has ended', async () => {
      expect(await error(service.appeal('a1', customer, '   '))).toBeInstanceOf(BadRequestException);
      expect(await error(service.appeal('a1', customer, 'Please'))).toBeInstanceOf(NotFoundException);
      auction.status = 'CLOSED';
      expect((await error(service.appeal('a1', customer, 'Please'))).getResponse()).toMatchObject({ code: 'REGISTRATION_CLOSED' });
    });
  });

  describe('a staff decision', () => {
    const decideAs = (over: Record<string, unknown>, actor = staff) =>
      service.decide('a1', 'b1', actor, { decision: 'APPROVE', expectedStatus: 'PENDING', ...over } as never);

    beforeEach(() => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow());
    });

    it('approves a waiting registration with the status the staff member saw as the predicate, and records who, from and to', async () => {
      await decideAs({});
      expect(prisma.bidder.updateMany).toHaveBeenCalledWith({
        where: { id: 'b1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'APPROVED', decidedById: 'u-staff', decisionReason: null, appealText: null, appealedAt: null }),
      });
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'auction.bidder_decided',
          actorId: 'u-staff',
          data: expect.objectContaining({ decision: 'APPROVE', from: 'PENDING', to: 'APPROVED' }),
        }),
      );
    });

    it('declines with the reason the bidder will read, trimmed', async () => {
      await decideAs({ decision: 'DECLINE', reason: '  We could not match your name.  ' });
      expect(prisma.bidder.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'DECLINED', decisionReason: 'We could not match your name.' });
    });

    it.each(['DECLINE', 'SUSPEND', 'UPHOLD'])('refuses %s with no reason, because the bidder reads it', async (decision) => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'APPROVED', appealText: 'x', appealedAt: new Date() }));
      expect(await error(decideAs({ decision, expectedStatus: 'APPROVED', reason: '   ' }))).toBeInstanceOf(BadRequestException);
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    it('refuses a stale screen: the decision lands only on the status the staff member saw, and says what it is now', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'DECLINED' }));
      const refused = await error(decideAs({ decision: 'APPROVE', expectedStatus: 'PENDING' }));
      expect(refused).toBeInstanceOf(ConflictException);
      expect(refused.getResponse()).toMatchObject({ code: 'BIDDER_CHANGED', details: { status: 'DECLINED' } });
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    it('loses cleanly to a second person deciding at the same moment: no rows changed is a 409 and no audit row', async () => {
      prisma.bidder.updateMany.mockResolvedValue({ count: 0 });
      expect((await error(decideAs({}))).getResponse()).toMatchObject({ code: 'BIDDER_CHANGED' });
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('refuses a transition the rules do not allow', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'APPROVED' }));
      expect((await error(decideAs({ decision: 'DECLINE', expectedStatus: 'APPROVED', reason: 'no' }))).getResponse()).toMatchObject({ code: 'DECISION_NOT_ALLOWED' });
      expect((await error(decideAs({ decision: 'UPHOLD', expectedStatus: 'APPROVED', reason: 'no' }))).getResponse()).toMatchObject({ code: 'DECISION_NOT_ALLOWED' });
    });

    it('never lets a staff member decide on themselves', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ userId: 'u-staff' }));
      const refused = await error(decideAs({}));
      expect(refused).toBeInstanceOf(ForbiddenException);
      expect(refused.getResponse()).toMatchObject({ code: 'CANNOT_DECIDE_OWN' });
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    it('is a 404 for a bidder of another auction', async () => {
      prisma.bidder.findFirst.mockResolvedValue(null);
      expect(await error(decideAs({}))).toBeInstanceOf(NotFoundException);
      expect(prisma.bidder.findFirst.mock.calls[0][0].where).toEqual({ id: 'b1', auctionId: 'a1' });
    });

    it('answers an appeal by approving: both appeal columns clear so the next decision can be appealed afresh', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'SUSPENDED', appealText: 'I paid.', appealedAt: new Date() }));
      await decideAs({ decision: 'APPROVE', expectedStatus: 'SUSPENDED', reason: 'Payment found.' });
      expect(prisma.bidder.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', appealText: null, appealedAt: null });
      expect(audit.recordEvidence.mock.calls[0][1].data).toMatchObject({ answeredAppeal: 'I paid.' });
    });

    it('keeps a decision after an appeal: the status stays, the text goes, the instant stays, so the answer is final', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'SUSPENDED', appealText: 'I paid.', appealedAt: new Date() }));
      await decideAs({ decision: 'UPHOLD', expectedStatus: 'SUSPENDED', reason: 'We found no payment.' });
      const data = prisma.bidder.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ status: 'SUSPENDED', appealText: null, decisionReason: 'We found no payment.' });
      expect(data).not.toHaveProperty('appealedAt');
    });

    it('keeps no decision when there is no appeal to answer', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'SUSPENDED' }));
      expect((await error(decideAs({ decision: 'UPHOLD', expectedStatus: 'SUSPENDED', reason: 'no' }))).getResponse()).toMatchObject({ code: 'DECISION_NOT_ALLOWED' });
    });

    it('fails the decision when its audit row cannot be written', async () => {
      audit.recordEvidence.mockRejectedValue(new Error('audit down'));
      await expect(decideAs({})).rejects.toThrow('audit down');
    });
  });

  describe('reading the Settings, which is never done inside a transaction', () => {
    /** A Setting that is not cached is read on another pool connection, so a transaction that waits for one holds a connection while asking for a second. */
    it('reads the policy before the join opens its transaction', async () => {
      const order: string[] = [];
      settings.get.mockImplementation(async () => {
        order.push('settings');
        return undefined;
      });
      prisma.$transaction.mockImplementation(async (arg: any) => {
        order.push('begin');
        const result = Array.isArray(arg) ? await Promise.all(arg) : await arg(prisma);
        order.push('commit');
        return result;
      });
      await service.join('a1', customer);
      expect(order.indexOf('settings')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('settings')).toBeLessThan(order.indexOf('begin'));
      // Nothing between the transaction's first and last statement asks for a Setting.
      expect(order.slice(order.indexOf('begin'), order.indexOf('commit') + 1)).not.toContain('settings');
    });

    it('reads the policy before a strike is recorded in its transaction', async () => {
      const order: string[] = [];
      settings.get.mockImplementation(async () => {
        order.push('settings');
        return undefined;
      });
      prisma.$transaction.mockImplementation(async (arg: any) => {
        order.push('begin');
        const result = Array.isArray(arg) ? await Promise.all(arg) : await arg(prisma);
        order.push('commit');
        return result;
      });
      prisma.bidder.findFirst.mockResolvedValue(bidderRow());
      await service.recordStrike('a1', 'b1', staff, { reason: 'No payment' });
      expect(order.indexOf('settings')).toBeLessThan(order.indexOf('begin'));
      expect(order.slice(order.indexOf('begin'), order.indexOf('commit') + 1)).not.toContain('settings');
    });
  });

  describe('strikes', () => {
    beforeEach(() => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'APPROVED' }));
    });

    it('records a strike against the person, with the reason trimmed and the actor, counting the window', async () => {
      prisma.bidderStrike.count.mockResolvedValue(3);
      await service.recordStrike('a1', 'b1', staff, { reason: '  Did not pay for lot 4.  ', lotId: 'l1' });
      expect(prisma.bidderStrike.create).toHaveBeenCalledWith({
        data: { userId: 'u-customer', bidderId: 'b1', lotId: 'l1', reason: 'Did not pay for lot 4.', recordedById: 'u-staff' },
      });
      expect(audit.recordEvidence.mock.calls[0][1]).toMatchObject({
        action: 'auction.strike_recorded',
        data: expect.objectContaining({ strikesInWindow: 3 }),
      });
    });

    it('counts only live strikes inside the window, 365 days back by default', async () => {
      await service.recordStrike('a1', 'b1', staff, { reason: 'No payment' });
      const where = prisma.bidderStrike.count.mock.calls[0][0].where;
      expect(where).toMatchObject({ userId: 'u-customer', voidedAt: null });
      const days = (Date.now() - where.recordedAt.gte.getTime()) / 86_400_000;
      expect(days).toBeGreaterThan(364.99);
      expect(days).toBeLessThan(365.01);
    });

    it('refuses a lot from another auction, an empty reason, and a strike on themselves', async () => {
      prisma.auctionLot.findFirst.mockResolvedValue(null);
      expect(await error(service.recordStrike('a1', 'b1', staff, { reason: 'x', lotId: 'elsewhere' }))).toBeInstanceOf(BadRequestException);
      expect(await error(service.recordStrike('a1', 'b1', staff, { reason: '  ' }))).toBeInstanceOf(BadRequestException);
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ userId: 'u-staff' }));
      expect((await error(service.recordStrike('a1', 'b1', staff, { reason: 'x' }))).getResponse()).toMatchObject({ code: 'CANNOT_DECIDE_OWN' });
      expect(prisma.bidderStrike.create).not.toHaveBeenCalled();
    });

    it('never suspends: recording the third strike writes a strike and nothing on the bidder', async () => {
      prisma.bidderStrike.count.mockResolvedValue(3);
      await service.recordStrike('a1', 'b1', staff, { reason: 'No payment' });
      expect(prisma.bidder.updateMany).not.toHaveBeenCalled();
    });

    describe('voiding', () => {
      const strike = (over: Record<string, unknown> = {}) => ({
        id: 's1',
        userId: 'u-customer',
        bidderId: 'b1',
        reason: 'No payment',
        voidedAt: null,
        bidder: { alias: 'Bidder 1', auction: { number: 'AUC-2026-0001' } },
        ...over,
      });

      it('voids with a reason, guarded so a strike is voided once, and records the original reason', async () => {
        prisma.bidderStrike.findFirst.mockResolvedValue(strike());
        await service.voidStrike('a1', 'b1', 's1', staff, '  Entered against the wrong person.  ');
        expect(prisma.bidderStrike.updateMany).toHaveBeenCalledWith({
          where: { id: 's1', voidedAt: null },
          data: { voidedAt: expect.any(Date), voidedById: 'u-staff', voidReason: 'Entered against the wrong person.' },
        });
        expect(audit.recordEvidence.mock.calls[0][1].data).toMatchObject({ originalReason: 'No payment', reason: 'Entered against the wrong person.' });
      });

      it('refuses a strike that is already void, one that is not there, an empty reason, and the person’s own strike', async () => {
        prisma.bidderStrike.findFirst.mockResolvedValue(strike({ voidedAt: new Date() }));
        expect((await error(service.voidStrike('a1', 'b1', 's1', staff, 'x'))).getResponse()).toMatchObject({ code: 'STRIKE_ALREADY_VOID' });
        prisma.bidderStrike.findFirst.mockResolvedValue(null);
        expect(await error(service.voidStrike('a1', 'b1', 'nope', staff, 'x'))).toBeInstanceOf(NotFoundException);
        expect(await error(service.voidStrike('a1', 'b1', 's1', staff, '  '))).toBeInstanceOf(BadRequestException);
        prisma.bidderStrike.findFirst.mockResolvedValue(strike({ userId: 'u-staff' }));
        expect((await error(service.voidStrike('a1', 'b1', 's1', staff, 'x'))).getResponse()).toMatchObject({ code: 'CANNOT_DECIDE_OWN' });
        expect(prisma.bidderStrike.updateMany).not.toHaveBeenCalled();
      });

      it('loses cleanly when two staff void the same strike at once', async () => {
        prisma.bidderStrike.findFirst.mockResolvedValue(strike());
        prisma.bidderStrike.updateMany.mockResolvedValue({ count: 0 });
        expect((await error(service.voidStrike('a1', 'b1', 's1', staff, 'x'))).getResponse()).toMatchObject({ code: 'STRIKE_ALREADY_VOID' });
        expect(audit.recordEvidence).not.toHaveBeenCalled();
      });
    });
  });

  describe('the queue', () => {
    it('counts waiting, approved, stopped and appeals for the strip', async () => {
      prisma.bidder.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 3 } },
        { status: 'APPROVED', _count: { _all: 12 } },
        { status: 'SUSPENDED', _count: { _all: 1 } },
        { status: 'DECLINED', _count: { _all: 2 } },
      ]);
      prisma.bidder.count.mockResolvedValue(2);
      expect(await service.summary('a1')).toEqual({ waiting: 3, approved: 12, stopped: 3, appeals: 2, total: 18 });
      expect(prisma.bidder.count.mock.calls[0][0].where).toEqual({
        auctionId: 'a1',
        status: { in: ['SUSPENDED', 'DECLINED'] },
        appealText: { not: null },
      });
    });

    it.each([
      ['waiting', { auctionId: 'a1', status: 'PENDING' }],
      ['approved', { auctionId: 'a1', status: 'APPROVED' }],
      ['stopped', { auctionId: 'a1', status: { in: ['SUSPENDED', 'DECLINED'] } }],
      ['appeals', { auctionId: 'a1', status: { in: ['SUSPENDED', 'DECLINED'] }, appealText: { not: null } }],
      [undefined, { auctionId: 'a1' }],
    ])('filters %s on this auction only', async (filter, where) => {
      await service.list('a1', Object.assign(new BidderListQueryDto(), { filter }), staff);
      expect(prisma.bidder.findMany.mock.calls[0][0].where).toEqual(where);
      expect(prisma.bidder.count.mock.calls[0][0].where).toEqual(where);
    });

    it('lists the oldest first, a page at a time', async () => {
      await service.list('a1', Object.assign(new BidderListQueryDto(), { page: 2, pageSize: 20 }), staff);
      expect(prisma.bidder.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    });

    it('reads the people and their strikes once for the whole page, not once per row, and says who is the asking staff member', async () => {
      prisma.bidder.findMany.mockResolvedValue([
        bidderRow({ id: 'b1', userId: 'u-1' }),
        bidderRow({ id: 'b2', userId: 'u-staff', alias: 'Bidder 2' }),
        bidderRow({ id: 'b3', userId: 'u-3', alias: 'Bidder 3', status: 'SUSPENDED', appealText: 'Please', appealedAt: new Date() }),
      ]);
      prisma.bidder.count.mockResolvedValue(3);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u-1', firstName: 'Ayesha', lastName: 'Khan', email: 'a@example.test', phone: null },
        { id: 'u-3', firstName: null, lastName: null, email: null, phone: '+920000000' },
      ]);
      prisma.bidderStrike.groupBy.mockResolvedValue([{ userId: 'u-1', _count: { _all: 3 } }]);

      const page = await service.list('a1', new BidderListQueryDto(), staff);

      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.bidderStrike.groupBy).toHaveBeenCalledTimes(1);
      expect(page.data[0]).toMatchObject({
        alias: 'Bidder 1',
        person: { name: 'Ayesha Khan', email: 'a@example.test' },
        strikes: { inWindow: 3, reviewDue: true },
        isSelf: false,
      });
      expect(page.data[1]).toMatchObject({ isSelf: true, person: { name: null, email: null, phone: null } });
      expect(page.data[2]).toMatchObject({ appeal: { state: 'WAITING', text: 'Please' }, person: { name: null, phone: '+920000000' } });
      expect(page.meta.total).toBe(3);
    });

    it('is a 404 for an auction that does not exist', async () => {
      prisma.auction.findUnique.mockResolvedValue(null);
      expect(await error(service.summary('missing'))).toBeInstanceOf(NotFoundException);
      expect(await error(service.list('missing', new BidderListQueryDto(), staff))).toBeInstanceOf(NotFoundException);
    });
  });

  describe('one bidder', () => {
    it('shows who they are, whether they are verified, and every strike with who recorded or voided it', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow({ status: 'APPROVED' }));
      identity.isApproved.mockResolvedValue(true);
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 'u-customer', firstName: 'Ayesha', lastName: 'Khan', email: 'a@example.test', phone: null }])
        .mockResolvedValueOnce([
          { id: 'u-staff', firstName: 'Sara', lastName: null, email: 's@example.test', phone: null },
          { id: 'u-other', firstName: null, lastName: null, email: 'o@example.test', phone: null },
        ]);
      prisma.bidderStrike.findMany.mockResolvedValue([
        {
          id: 's1',
          reason: 'No payment',
          recordedAt: new Date('2026-09-01T00:00:00Z'),
          recordedById: 'u-staff',
          lotId: 'l1',
          voidedAt: new Date('2026-09-02T00:00:00Z'),
          voidedById: 'u-other',
          voidReason: 'Wrong person',
          bidder: { auction: { id: 'a1', number: 'AUC-2026-0001', title: 'Autumn clearance' } },
        },
      ]);
      prisma.bidderStrike.count.mockResolvedValue(0);

      const detail = await service.detail('a1', 'b1', staff);

      expect(detail).toMatchObject({
        verified: true,
        person: { name: 'Ayesha Khan' },
        policy: { strikesToReview: 3, windowDays: 365 },
        strikes: { inWindow: 0, reviewDue: false },
      });
      expect(detail.strikeList[0]).toMatchObject({
        recordedBy: 'Sara',
        voided: { by: 'o@example.test', reason: 'Wrong person' },
        auction: { number: 'AUC-2026-0001' },
      });
    });

    it('lists the person’s strikes from every auction, and at most the newest fifty', async () => {
      prisma.bidder.findFirst.mockResolvedValue(bidderRow());
      await service.detail('a1', 'b1', staff);
      expect(prisma.bidderStrike.findMany.mock.calls[0][0]).toMatchObject({ where: { userId: 'u-customer' }, take: 50, orderBy: { recordedAt: 'desc' } });
    });
  });

  describe('the strike policy', () => {
    it('reads the threshold and the window from Settings, and the defaults for a value it cannot use', async () => {
      settings.get.mockImplementation(async (key: string) =>
        key === 'auction.strikes_to_review' ? 5 : key === 'auction.strike_window_days' ? 'a year' : undefined,
      );
      expect(await service.policy()).toEqual({ strikesToReview: 5, strikeWindowMs: 365 * 86_400_000 });
    });

    it('flags exactly at the threshold', async () => {
      const policy = await service.policy();
      prisma.bidderStrike.count.mockResolvedValue(2);
      expect(await service.strikeState(prisma, 'u-customer', new Date(), policy)).toEqual({ inWindow: 2, reviewDue: false });
      prisma.bidderStrike.count.mockResolvedValue(3);
      expect(await service.strikeState(prisma, 'u-customer', new Date(), policy)).toEqual({ inWindow: 3, reviewDue: true });
    });

    it('never reads a Setting once a transaction is open: it takes the policy it is given', async () => {
      const policy = { strikesToReview: 2, strikeWindowMs: 86_400_000 };
      prisma.bidderStrike.count.mockResolvedValue(2);
      expect(await service.strikeState(prisma, 'u-customer', new Date(), policy)).toEqual({ inWindow: 2, reviewDue: true });
      expect(settings.get).not.toHaveBeenCalled();
    });
  });
});
