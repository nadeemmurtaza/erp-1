import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../../core/config/app-config.service';
import { AuditService } from '../../core/audit/audit.service';
import { Prisma } from '../../core/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AuctionService } from './auction.service';
import { DEFAULT_BID_RULES } from './bidding';
import { AuctionListQueryDto } from './dto/auction.dto';

/**
 * launchpad-apps/234-auction-app.md WO-234.1. Every mutation must read the
 * auction's status under its row lock before it writes, so the tests that
 * matter most feed the lock query a status and assert what followed — and
 * what did not.
 */
describe('AuctionService', () => {
  let service: AuctionService;
  let prisma: any;
  let audit: any;
  let settings: any;
  let events: string[];

  const future = (hours = 24) => new Date(Date.now() + hours * 3_600_000);
  const draft = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    number: 'AUC-2026-0004',
    type: 'ENGLISH',
    title: 'Clearance',
    status: 'DRAFT',
    startsAt: future(24),
    endsAt: future(48),
    currency: 'PKR',
    terms: null,
    outletLocationId: null,
    createdById: 'u1',
    ...over,
  });
  const lot = (over: Record<string, unknown> = {}) => ({
    id: 'l1',
    auctionId: 'a1',
    lotNo: 1,
    title: 'Pallet',
    description: null,
    quantity: 1,
    startPriceMinor: 10_000,
    reservePriceMinor: 20_000,
    status: 'PENDING',
    ...over,
  });
  /** The next `FOR UPDATE` read answers with this status. */
  const lockedAs = (status: string | null) =>
    prisma.$queryRaw.mockResolvedValueOnce(status === null ? [] : [{ status }]);

  beforeEach(async () => {
    events = [];
    prisma = {
      auction: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auctionLot: {
        aggregate: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
      location: { findUnique: jest.fn() },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma))),
    };
    audit = { record: jest.fn().mockImplementation(({ action }) => events.push(action)) };
    settings = { get: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: 'N1' } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(AuctionService);
  });

  describe('create', () => {
    const dto = { title: '  Clearance  ', startsAt: future(24).toISOString(), endsAt: future(48).toISOString() };

    it('drafts an auction with the next number, the deployment currency and the actor recorded', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ max: 3 }]);
      prisma.auction.create.mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data }));

      const created = await service.create(dto, 'u1');

      expect(created.number).toMatch(/^AUC-\d{4}-0004$/);
      expect(prisma.auction.create.mock.calls[0][0].data).toMatchObject({
        title: 'Clearance',
        type: 'ENGLISH',
        currency: 'PKR',
        createdById: 'u1',
        outletLocationId: null,
      });
      expect(events).toEqual(['auction.created']);
    });

    it('numbers the first auction of a year 0001', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([{ max: null }]);
      prisma.auction.create.mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data }));

      expect((await service.create(dto, 'u1')).number).toMatch(/-0001$/);
    });

    it('refuses an end at or before the start and writes nothing', async () => {
      const same = future(24).toISOString();
      await expect(service.create({ ...dto, startsAt: same, endsAt: same }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.create).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('refuses an unknown or inactive selling location', async () => {
      prisma.location.findUnique.mockResolvedValueOnce(null);
      await expect(service.create({ ...dto, outletLocationId: 'nope' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);

      prisma.location.findUnique.mockResolvedValueOnce({ isActive: false });
      await expect(service.create({ ...dto, outletLocationId: 'closed' }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.create).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const query = (over: Record<string, unknown> = {}) => Object.assign(new AuctionListQueryDto(), over);

    it('pages, filters by status and reports the count of lots still on sale', async () => {
      prisma.auction.findMany.mockResolvedValue([{ ...draft(), _count: { lots: 3 } }]);
      prisma.auction.count.mockResolvedValue(41);

      const result = await service.list(query({ status: 'DRAFT', page: 3, pageSize: 20 }));

      expect(prisma.auction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'DRAFT' }, skip: 40, take: 20 }),
      );
      expect(result.meta).toEqual({ page: 3, pageSize: 20, total: 41, totalPages: 3, hasNext: false, hasPrevious: true });
      expect(result.data[0]).toMatchObject({ id: 'a1', lotCount: 3 });
      expect(result.data[0]).not.toHaveProperty('_count');
    });

    it('searches title and number, ignoring case and surrounding spaces', async () => {
      prisma.auction.findMany.mockResolvedValue([]);
      prisma.auction.count.mockResolvedValue(0);

      await service.list(query({ q: '  auc-2026 ' }));

      expect(prisma.auction.findMany.mock.calls[0][0].where).toEqual({
        OR: [
          { title: { contains: 'auc-2026', mode: 'insensitive' } },
          { number: { contains: 'auc-2026', mode: 'insensitive' } },
        ],
      });
    });

    it('returns an empty page, not an error, when nothing matches', async () => {
      prisma.auction.findMany.mockResolvedValue([]);
      prisma.auction.count.mockResolvedValue(0);
      const result = await service.list(query());
      expect(result.data).toEqual([]);
      expect(result.meta).toMatchObject({ total: 0, totalPages: 0, hasNext: false, hasPrevious: false });
    });
  });

  describe('get', () => {
    beforeEach(() => prisma.auction.findUnique.mockResolvedValue({ ...draft(), lots: [lot()] }));

    it('hides the reserve from a read-only holder', async () => {
      const result = await service.get('a1', false);
      expect(result.lots[0]).not.toHaveProperty('reservePriceMinor');
      expect(result.lots[0].startPriceMinor).toBe(10_000);
    });

    it('shows the reserve to a holder of auction.manage', async () => {
      expect((await service.get('a1', true)).lots[0].reservePriceMinor).toBe(20_000);
    });

    it('throws NotFound for an unknown auction', async () => {
      prisma.auction.findUnique.mockResolvedValue(null);
      await expect(service.get('missing', true)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('edits a draft and records before and after', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      prisma.auction.update.mockResolvedValue(draft({ title: 'Renamed' }));

      const result = await service.update('a1', { title: ' Renamed ' }, 'u1');

      expect(result.title).toBe('Renamed');
      expect(prisma.auction.update.mock.calls[0][0].data.title).toBe('Renamed');
      expect(audit.record.mock.calls[0][0].data.before.title).toBe('Clearance');
      expect(audit.record.mock.calls[0][0].data.after.title).toBe('Renamed');
    });

    it.each(['SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED'])('refuses a %s auction and writes nothing', async (status) => {
      lockedAs(status);
      await expect(service.update('a1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auction.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('checks the merged window: moving only the end before the stored start is refused', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      await expect(service.update('a1', { endsAt: future(1).toISOString() }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the auction does not exist', async () => {
      lockedAs(null);
      await expect(service.update('missing', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addLot', () => {
    it('numbers a lot after the highest existing one', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.aggregate.mockResolvedValue({ _max: { lotNo: 4 } });
      prisma.auctionLot.create.mockImplementation(async ({ data }: any) => ({ id: 'l5', ...data }));

      const created = await service.addLot('a1', { title: ' Pallet ', startPriceMinor: 5_000 }, 'u1');

      expect(created.lotNo).toBe(5);
      expect(prisma.auctionLot.create.mock.calls[0][0].data).toMatchObject({ title: 'Pallet', quantity: 1, reservePriceMinor: null });
      expect(events).toEqual(['auction.lot_added']);
    });

    it('starts at lot 1 on an empty auction', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.aggregate.mockResolvedValue({ _max: { lotNo: null } });
      prisma.auctionLot.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));
      expect((await service.addLot('a1', { title: 'x', startPriceMinor: 1 }, 'u1')).lotNo).toBe(1);
    });

    it('accepts a reserve equal to the opening price (the boundary) and refuses one below it', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.aggregate.mockResolvedValue({ _max: { lotNo: 0 } });
      prisma.auctionLot.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));
      await expect(service.addLot('a1', { title: 'x', startPriceMinor: 100, reservePriceMinor: 100 }, 'u1')).resolves.toBeDefined();

      await expect(service.addLot('a1', { title: 'x', startPriceMinor: 100, reservePriceMinor: 99 }, 'u1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a lot on an auction that is no longer a draft, without allocating a number', async () => {
      lockedAs('SCHEDULED');
      await expect(service.addLot('a1', { title: 'x', startPriceMinor: 1 }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auctionLot.aggregate).not.toHaveBeenCalled();
      expect(prisma.auctionLot.create).not.toHaveBeenCalled();
    });

    it('takes the auction lock before it reads the highest lot number', async () => {
      const order: string[] = [];
      prisma.$queryRaw.mockImplementationOnce(async () => (order.push('lock'), [{ status: 'DRAFT' }]));
      prisma.auctionLot.aggregate.mockImplementation(async () => (order.push('max'), { _max: { lotNo: 0 } }));
      prisma.auctionLot.create.mockImplementation(async ({ data }: any) => ({ id: 'l1', ...data }));

      await service.addLot('a1', { title: 'x', startPriceMinor: 1 }, 'u1');

      expect(order).toEqual(['lock', 'max']);
    });
  });

  describe('updateLot', () => {
    it('edits a lot and can clear the reserve with null', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(lot());
      prisma.auctionLot.update.mockImplementation(async ({ data }: any) => ({ ...lot(), ...data }));

      const updated = await service.updateLot('a1', 'l1', { reservePriceMinor: null }, 'u1');

      expect(updated.reservePriceMinor).toBeNull();
      expect(audit.record.mock.calls[0][0].data.before.reservePriceMinor).toBe(20_000);
    });

    it('validates the reserve against the merged opening price', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(lot({ reservePriceMinor: 20_000 }));
      await expect(service.updateLot('a1', 'l1', { startPriceMinor: 25_000 }, 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auctionLot.update).not.toHaveBeenCalled();
    });

    it('is scoped to the auction: a lot of another auction is NotFound', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(null);
      await expect(service.updateLot('a1', 'other', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.auctionLot.findFirst).toHaveBeenCalledWith({ where: { id: 'other', auctionId: 'a1' } });
    });

    it('refuses a withdrawn lot', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(lot({ status: 'WITHDRAWN' }));
      await expect(service.updateLot('a1', 'l1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses an edit once the auction is scheduled', async () => {
      lockedAs('SCHEDULED');
      await expect(service.updateLot('a1', 'l1', { title: 'x' }, 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auctionLot.update).not.toHaveBeenCalled();
    });
  });

  describe('withdrawLot', () => {
    it('marks the lot withdrawn — never deletes it — and audits once', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(lot());
      prisma.auctionLot.update.mockResolvedValue(lot({ status: 'WITHDRAWN' }));

      const result = await service.withdrawLot('a1', 'l1', 'u1');

      expect(result.status).toBe('WITHDRAWN');
      expect(prisma.auctionLot.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { status: 'WITHDRAWN' } });
      expect(events).toEqual(['auction.lot_withdrawn']);
    });

    it('a repeat withdrawal is a no-op with no second audit row', async () => {
      lockedAs('DRAFT');
      prisma.auctionLot.findFirst.mockResolvedValue(lot({ status: 'WITHDRAWN' }));
      await service.withdrawLot('a1', 'l1', 'u1');
      expect(prisma.auctionLot.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('schedule', () => {
    it('moves a draft with a future start and a lot on sale to SCHEDULED', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      prisma.auctionLot.count.mockResolvedValue(2);
      prisma.auction.update.mockResolvedValue(draft({ status: 'SCHEDULED' }));

      const result = await service.schedule('a1', 'u1');

      expect(result.status).toBe('SCHEDULED');
      expect(prisma.auctionLot.count).toHaveBeenCalledWith({ where: { auctionId: 'a1', status: { not: 'WITHDRAWN' } } });
      expect(events).toEqual(['auction.scheduled']);
    });

    it('freezes the bidding rules from Settings onto the auction as it is scheduled, anti-snipe seconds turned into milliseconds', async () => {
      const settingsByKey: Record<string, number> = {
        'auction.bid_increment_bps': 1_000,
        'auction.bid_min_step_minor': 500,
        'auction.anti_snipe_window_seconds': 60,
        'auction.anti_snipe_extend_seconds': 30,
        'auction.max_extension_seconds': 600,
      };
      settings.get.mockImplementation(async (key: string) => settingsByKey[key]);
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      prisma.auctionLot.count.mockResolvedValue(1);
      prisma.auction.update.mockResolvedValue(draft({ status: 'SCHEDULED' }));

      await service.schedule('a1', 'u1');

      expect(prisma.auction.update).toHaveBeenCalledWith({
        where: { id: 'a1' },
        data: {
          status: 'SCHEDULED',
          bidRules: { incrementBps: 1_000, minStepMinor: 500, antiSnipeWindowMs: 60_000, antiSnipeExtendMs: 30_000, maxExtensionMs: 600_000 },
        },
      });
    });

    it('freezes the default rules when a setting is missing or unusable, never a broken one', async () => {
      settings.get.mockImplementation(async (key: string) => (key === 'auction.bid_increment_bps' ? -3 : 'x'));
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      prisma.auctionLot.count.mockResolvedValue(1);
      prisma.auction.update.mockResolvedValue(draft({ status: 'SCHEDULED' }));

      await service.schedule('a1', 'u1');

      expect(prisma.auction.update.mock.calls[0][0].data.bidRules).toEqual(DEFAULT_BID_RULES);
    });

    it('refuses a start time that has passed', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ startsAt: new Date(Date.now() - 1000) }));
      await expect(service.schedule('a1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.auction.update).not.toHaveBeenCalled();
    });

    it('refuses an auction with no lot on sale', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      prisma.auctionLot.count.mockResolvedValue(0);
      await expect(service.schedule('a1', 'u1')).rejects.toThrow('at least one lot');
      expect(prisma.auction.update).not.toHaveBeenCalled();
    });

    it('a second schedule of an already-scheduled auction is a no-op', async () => {
      lockedAs('SCHEDULED');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status: 'SCHEDULED' }));
      const result = await service.schedule('a1', 'u1');
      expect(result.status).toBe('SCHEDULED');
      expect(prisma.auction.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each(['OPEN', 'CLOSED', 'CANCELLED'])('refuses a %s auction', async (status) => {
      lockedAs(status);
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status }));
      await expect(service.schedule('a1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('unschedule', () => {
    it('returns a scheduled auction to draft', async () => {
      lockedAs('SCHEDULED');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status: 'SCHEDULED' }));
      prisma.auction.update.mockResolvedValue(draft());
      expect((await service.unschedule('a1', 'u1')).status).toBe('DRAFT');
      expect(prisma.auction.update.mock.calls[0][0].data).toEqual({ status: 'DRAFT', bidRules: Prisma.DbNull });
      expect(events).toEqual(['auction.unscheduled']);
    });

    it('refuses once the auction has opened — bids may exist', async () => {
      lockedAs('OPEN');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status: 'OPEN' }));
      await expect(service.unschedule('a1', 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auction.update).not.toHaveBeenCalled();
    });

    it('is a no-op on a draft', async () => {
      lockedAs('DRAFT');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft());
      await service.unschedule('a1', 'u1');
      expect(prisma.auction.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('cancels, withdraws the lots still on sale, and records the reason', async () => {
      lockedAs('SCHEDULED');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status: 'SCHEDULED' }));
      prisma.auction.update.mockResolvedValue(draft({ status: 'CANCELLED' }));

      const result = await service.cancel('a1', 'Seller withdrew the goods', 'u1');

      expect(result.status).toBe('CANCELLED');
      expect(prisma.auctionLot.updateMany).toHaveBeenCalledWith({
        where: { auctionId: 'a1', status: { not: 'WITHDRAWN' } },
        data: { status: 'WITHDRAWN' },
      });
      expect(audit.record.mock.calls[0][0]).toMatchObject({
        action: 'auction.cancelled',
        data: expect.objectContaining({ reason: 'Seller withdrew the goods' }),
      });
    });

    it('a repeat cancel changes nothing and audits nothing', async () => {
      lockedAs('CANCELLED');
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status: 'CANCELLED' }));
      await service.cancel('a1', 'again', 'u1');
      expect(prisma.auctionLot.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it.each(['OPEN', 'CLOSING', 'CLOSED', 'SETTLED'])('refuses a %s auction', async (status) => {
      lockedAs(status);
      prisma.auction.findUniqueOrThrow.mockResolvedValue(draft({ status }));
      await expect(service.cancel('a1', 'x', 'u1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.auctionLot.updateMany).not.toHaveBeenCalled();
    });
  });
});
