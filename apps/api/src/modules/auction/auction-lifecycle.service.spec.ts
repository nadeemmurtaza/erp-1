import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuctionLifecycleCron } from './auction-lifecycle.cron';
import { AuctionLifecycleService } from './auction-lifecycle.service';

/**
 * launchpad-apps/234-auction-app.md WO-234.3. What the open and close jobs
 * decide is proved against the real database in
 * `test/auction-lifecycle.e2e-spec.ts`; these prove how a run behaves when one
 * piece of it fails, which a real database cannot be made to do on demand.
 */
describe('AuctionLifecycleService', () => {
  let service: AuctionLifecycleService;
  let prisma: any;
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    audit = { record: jest.fn() };
    prisma = { $queryRaw: jest.fn(), $transaction: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuctionLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(AuctionLifecycleService);
  });

  it('does nothing when nothing is due', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(service.openDue()).resolves.toBe(0);
    await expect(service.closeDue()).resolves.toEqual({ closed: 0, extended: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('carries on with the rest of a batch when one lot fails, and counts only what it did', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]);
    jest
      .spyOn(service, 'closeLot')
      .mockResolvedValueOnce('closed')
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce('extended');

    await expect(service.closeDue()).resolves.toEqual({ closed: 1, extended: 1 });
    expect(service.closeLot).toHaveBeenCalledTimes(3);
  });

  it('carries on with the rest of a batch when one auction fails to open', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prisma.$transaction.mockRejectedValueOnce(new Error('connection reset')).mockResolvedValueOnce({ number: 'AUC-2026-0002', lots: 1 });

    await expect(service.openDue()).resolves.toBe(1);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'auction.opened', entityId: 'a2' }));
  });

  it('opens nothing and writes no audit row when the auction is no longer due under its lock', async () => {
    prisma.$queryRaw.mockResolvedValue([{ id: 'a1' }]);
    prisma.$transaction.mockResolvedValue(null);
    await expect(service.openDue()).resolves.toBe(0);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('AuctionLifecycleCron', () => {
  it('skips a run that arrives while the last is still going, then runs again once it ends', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const lifecycle = {
      openDue: jest.fn(async () => {
        await gate;
        return 0;
      }),
      closeDue: jest.fn(async () => ({ closed: 0, extended: 0 })),
    };
    const cron = new AuctionLifecycleCron(lifecycle as unknown as AuctionLifecycleService);

    const first = cron.run();
    await cron.run(); // overlaps: returns at once
    expect(lifecycle.openDue).toHaveBeenCalledTimes(1);

    release();
    await first;
    await cron.run();
    expect(lifecycle.openDue).toHaveBeenCalledTimes(2);
  });

  it('survives a failing run and keeps running on the next tick', async () => {
    const lifecycle = {
      openDue: jest.fn().mockRejectedValueOnce(new Error('database is down')).mockResolvedValue(0),
      closeDue: jest.fn(async () => ({ closed: 0, extended: 0 })),
    };
    const cron = new AuctionLifecycleCron(lifecycle as unknown as AuctionLifecycleService);

    await expect(cron.run()).resolves.toBeUndefined();
    await cron.run();
    expect(lifecycle.closeDue).toHaveBeenCalledTimes(1);
  });
});
