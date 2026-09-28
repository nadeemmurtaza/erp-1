import { SloRecorderService } from './slo-recorder.service';
import { SLO_PATHS } from './slo-paths';

describe('SloRecorderService — WO-38.3', () => {
  let prisma: any;
  let service: SloRecorderService;

  beforeEach(() => {
    prisma = {
      requestOutcome: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ p95: null }]),
    };
    service = new SloRecorderService(prisma);
  });

  describe('time()', () => {
    it('returns the wrapped function\'s result and records success, without awaiting the write', async () => {
      const result = await service.time(SLO_PATHS.Checkout, async () => 'order-1');
      expect(result).toBe('order-1');
      expect(prisma.requestOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ path: 'checkout', succeeded: true }) }),
      );
    });

    it('rethrows the original error and records failure — never swallows the real failure', async () => {
      const boom = new Error('cart is empty');
      await expect(service.time(SLO_PATHS.Checkout, () => Promise.reject(boom))).rejects.toBe(boom);
      expect(prisma.requestOutcome.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ path: 'checkout', succeeded: false }) }),
      );
    });

    it('never throws or slows the caller when the recording write itself fails', async () => {
      prisma.requestOutcome.create.mockRejectedValue(new Error('db unavailable'));
      await expect(service.time(SLO_PATHS.PosSale, async () => 'ok')).resolves.toBe('ok');
    });
  });

  describe('recordReplicationTick()', () => {
    it('records succeeded=true when the backlog age is within the 4-hour bound', () => {
      service.recordReplicationTick(60_000);
      expect(prisma.requestOutcome.create).toHaveBeenCalledWith({
        data: { path: 'replication.sync', succeeded: true, latencyMs: 60_000 },
      });
    });

    it('records succeeded=false once backlog age exceeds the 4-hour bound', () => {
      service.recordReplicationTick(5 * 60 * 60 * 1000);
      expect(prisma.requestOutcome.create).toHaveBeenCalledWith({
        data: { path: 'replication.sync', succeeded: false, latencyMs: 5 * 60 * 60 * 1000 },
      });
    });
  });

  describe('computeBudget()', () => {
    it('reports a null success rate with a full budget when there are no samples yet', async () => {
      const budget = await service.computeBudget(SLO_PATHS.Checkout);
      expect(budget.totalRequests).toBe(0);
      expect(budget.successRatePct).toBeNull();
      expect(budget.overBudget).toBe(false);
      expect(budget.remainingBudgetMinutes).toBeCloseTo(43.2, 1);
    });

    it('computes a negative remaining budget once observed failures exceed the allowed rate', async () => {
      prisma.requestOutcome.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.succeeded === true ? 900 : 1000),
      );
      const budget = await service.computeBudget(SLO_PATHS.Checkout);
      expect(budget.successRatePct).toBeCloseTo(90, 5);
      expect(budget.overBudget).toBe(true);
      expect(budget.remainingBudgetMinutes).toBeLessThan(0);
    });

    it('replication.sync carries no percentage target or error-budget minutes', async () => {
      const budget = await service.computeBudget(SLO_PATHS.ReplicationSync);
      expect(budget.successTargetPct).toBeNull();
      expect(budget.remainingBudgetMinutes).toBeNull();
      expect(budget.latencyTargetLabel).toContain('4h');
    });
  });
});
