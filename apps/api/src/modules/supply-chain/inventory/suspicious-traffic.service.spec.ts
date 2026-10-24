import { SuspiciousTrafficService } from './suspicious-traffic.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CameraPeopleCountRegistry } from '../../../core/extension-points/camera-people-count.registry';

describe('SuspiciousTrafficService — 156-single-employee-branch-loss-prevention.md §4', () => {
  let service: SuspiciousTrafficService;
  let prisma: any;
  let cameraRegistry: any;

  beforeEach(() => {
    prisma = { stockMovement: { findMany: jest.fn().mockResolvedValue([]) } };
    cameraRegistry = { countForDate: jest.fn() };
    service = new SuspiciousTrafficService(prisma as PrismaService, cameraRegistry as CameraPeopleCountRegistry);
  });

  it('degrades to an explicit "not available" state — a null cameraFootTraffic, never a fabricated ratio — when no camera provider is registered', async () => {
    cameraRegistry.countForDate.mockResolvedValue(null);
    prisma.stockMovement.findMany.mockResolvedValue([{ refId: 'order1' }, { refId: 'order2' }]);

    const report = await service.report('loc1', new Date('2026-06-01T12:00:00Z'));

    expect(report.cameraFootTraffic).toBeNull();
    expect(report.posTransactionCount).toBe(2);
    expect(report.ratio).toBeNull();
  });

  it('computes a ratio only when both a camera count and at least one transaction exist', async () => {
    cameraRegistry.countForDate.mockResolvedValue(60);
    prisma.stockMovement.findMany.mockResolvedValue([{ refId: 'o1' }, { refId: 'o2' }, { refId: 'o3' }]);

    const report = await service.report('loc1', new Date('2026-06-01T12:00:00Z'));

    expect(report.cameraFootTraffic).toBe(60);
    expect(report.posTransactionCount).toBe(3);
    expect(report.ratio).toBe(20);
  });

  it('never divides by zero — a camera count with zero transactions still returns a null ratio, not Infinity', async () => {
    cameraRegistry.countForDate.mockResolvedValue(15);
    prisma.stockMovement.findMany.mockResolvedValue([]);

    const report = await service.report('loc1', new Date('2026-06-01T12:00:00Z'));

    expect(report.ratio).toBeNull();
  });

  it('counts DISTINCT orders, not stock-movement rows — an order with several lines is still one transaction', async () => {
    prisma.stockMovement.findMany.mockImplementation(({ distinct }: any) => {
      expect(distinct).toEqual(['refId']);
      return Promise.resolve([{ refId: 'order1' }]); // distinct already applied by the (mocked) query
    });
    cameraRegistry.countForDate.mockResolvedValue(null);

    const report = await service.report('loc1', new Date('2026-06-01T12:00:00Z'));

    expect(report.posTransactionCount).toBe(1);
  });

  it('is a pure report — no write of any kind, never itself a disciplinary action', async () => {
    cameraRegistry.countForDate.mockResolvedValue(10);
    prisma.stockMovement.findMany.mockResolvedValue([{ refId: 'o1' }]);

    await service.report('loc1', new Date());

    const writeKeys = Object.keys(prisma).filter((k) => k !== 'stockMovement');
    expect(writeKeys).toHaveLength(0);
  });
});
