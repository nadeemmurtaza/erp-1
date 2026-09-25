import { Test } from '@nestjs/testing';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { AnalyticsService } from './analytics.service';
import { MetricRegistryService } from '../../core/metrics/metric-registry.service';

/**
 * WO-D.6 (10-admin-dashboard.md Track D, the last one) — covers only
 * `workshopOutput()`. Real PrismaService + SettingsService against the
 * seeded test database, same idiom as the rest of Track D's spec files.
 */
describe('AnalyticsService — WO-D.6 workshop output', () => {
  let service: AnalyticsService;
  let prisma: PrismaService;
  let garmentTypeId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MetricRegistryService,
        PrismaService,
        SettingsService,
        { provide: AppConfigService, useValue: { isModuleEnabled: jest.fn().mockReturnValue(true) } },
      ],
    }).compile();

    service = module.get(AnalyticsService);
    prisma = module.get(PrismaService);

    const garmentType = await prisma.garmentType.create({
      data: { key: `d6-spec-${Date.now()}`, labelEn: 'd6-spec garment', labelUr: 'd6-spec garment' },
    });
    garmentTypeId = garmentType.id;
  });

  afterAll(async () => {
    await prisma.garmentType.delete({ where: { id: garmentTypeId } });
  });

  afterEach(async () => {
    await prisma.stitchingJobEvent.deleteMany({ where: { job: { number: { startsWith: 'd6-spec-' } } } });
    await prisma.stitchingJob.deleteMany({ where: { number: { startsWith: 'd6-spec-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'd6-spec-' } } });
  });

  let seq = 0;
  function uid(): string {
    seq += 1;
    return `d6-spec-${Date.now()}-${seq}`;
  }

  function hoursAgo(n: number): Date {
    return new Date(Date.now() - n * 60 * 60 * 1000);
  }

  async function makeTailor(displayName?: string) {
    const user = await prisma.user.create({ data: { email: `${uid()}@test.com`, firstName: 'd6-spec', lastName: uid() } });
    if (displayName) {
      await prisma.tailorProfile.create({ data: { userId: user.id, displayName } });
    }
    return user;
  }

  async function makeJob(opts: {
    assignedTailorId?: string;
    startedAt?: Date;
    completedAt?: Date;
    createdAt?: Date;
    stage?: 'RECEIVED' | 'CUTTING' | 'STITCHING' | 'QC' | 'READY' | 'DISPATCHED';
  }) {
    return prisma.stitchingJob.create({
      data: {
        number: uid(),
        garmentTypeId,
        measurementSnapshot: {},
        stage: opts.stage ?? 'RECEIVED',
        assignedTailorId: opts.assignedTailorId,
        startedAt: opts.startedAt,
        completedAt: opts.completedAt,
        createdAt: opts.createdAt,
      },
    });
  }

  async function makeEvent(jobId: string, from: string, to: string, at: Date) {
    return prisma.stitchingJobEvent.create({
      data: { jobId, fromStage: from as never, toStage: to as never, createdAt: at },
    });
  }

  describe('series', () => {
    it('counts started/completed by day from the job\'s own timestamps', async () => {
      await makeJob({ startedAt: hoursAgo(1) });
      await makeJob({ startedAt: hoursAgo(1), completedAt: hoursAgo(0.5) });

      const result = await service.workshopOutput(7);
      const totalStarted = result.series.reduce((sum, point) => sum + point.started, 0);
      const totalCompleted = result.series.reduce((sum, point) => sum + point.completed, 0);
      expect(totalStarted).toBeGreaterThanOrEqual(2);
      expect(totalCompleted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('byStage', () => {
    // The full suite shares one long-lived test database, and other spec
    // files' own StitchingJob/StitchingJobEvent fixtures already sit inside
    // this method's 30-day window (confirmed: RECEIVED alone averages
    // around -7h across ~34 pre-existing rows, at least one of them itself
    // backdated past its own job's createdAt). An exact avgHours assertion
    // is not reliable against that; an outsized, unmistakable duration is
    // — nothing else in this table plausibly reaches thousands of hours.

    it('increases a stage\'s avg hours after adding a large, unmistakable duration in it', async () => {
      const before = await service.workshopOutput(3650);
      const stitchingBefore = before.byStage.find((row) => row.stage === 'STITCHING')?.avgHours ?? 0;

      const job = await makeJob({ stage: 'QC', startedAt: hoursAgo(6000), createdAt: hoursAgo(6000) });
      await makeEvent(job.id, 'RECEIVED', 'CUTTING', hoursAgo(5999));
      await makeEvent(job.id, 'CUTTING', 'STITCHING', hoursAgo(5000)); // ~999h in CUTTING
      await makeEvent(job.id, 'STITCHING', 'QC', hoursAgo(999)); // ~4001h in STITCHING — the outsized one

      const after = await service.workshopOutput(3650);
      const stitchingAfter = after.byStage.find((row) => row.stage === 'STITCHING')?.avgHours ?? 0;

      expect(stitchingAfter).toBeGreaterThan(stitchingBefore);
    });

    it('identifies the bottleneck as the stage with an outsized average duration', async () => {
      const job = await makeJob({ stage: 'QC', startedAt: hoursAgo(20000), createdAt: hoursAgo(20000) });
      await makeEvent(job.id, 'RECEIVED', 'CUTTING', hoursAgo(19999));
      await makeEvent(job.id, 'CUTTING', 'STITCHING', hoursAgo(10000)); // ~9999h — unmistakably the bottleneck
      await makeEvent(job.id, 'STITCHING', 'QC', hoursAgo(9999));

      const result = await service.workshopOutput(3650);
      expect(result.bottleneck?.stage).toBe('CUTTING');
    });
  });

  describe('byTailor', () => {
    it('ranks tailors by jobsCompleted, resolving name from TailorProfile.displayName', async () => {
      const tailor = await makeTailor('d6-spec Ayesha');
      await makeJob({ assignedTailorId: tailor.id, startedAt: hoursAgo(10), completedAt: hoursAgo(5) });
      await makeJob({ assignedTailorId: tailor.id, startedAt: hoursAgo(8), completedAt: hoursAgo(2) });

      const result = await service.workshopOutput(30);
      const row = result.byTailor.find((r) => r.tailorId === tailor.id);
      expect(row?.jobsCompleted).toBe(2);
      expect(row?.name).toBe('d6-spec Ayesha');
      expect(row?.avgHours).toBeGreaterThan(0);
    });

    it('falls back to firstName/lastName when no TailorProfile exists', async () => {
      const tailor = await makeTailor(); // no profile
      await makeJob({ assignedTailorId: tailor.id, startedAt: hoursAgo(6), completedAt: hoursAgo(1) });

      const result = await service.workshopOutput(30);
      const row = result.byTailor.find((r) => r.tailorId === tailor.id);
      expect(row?.name).toBe(`${tailor.firstName} ${tailor.lastName}`);
    });

    it('excludes a job with no assignedTailorId', async () => {
      await makeJob({ startedAt: hoursAgo(6), completedAt: hoursAgo(1) });
      // No assertion possible on a specific tailorId; just confirm no throw
      // and every returned row has a real tailorId.
      const result = await service.workshopOutput(30);
      expect(result.byTailor.every((row) => row.tailorId)).toBe(true);
    });
  });

  it('renders a well-shaped, non-throwing response with no fixtures of its own', async () => {
    await expect(service.workshopOutput(7)).resolves.toEqual(
      expect.objectContaining({
        series: expect.any(Array),
        byStage: expect.any(Array),
        byTailor: expect.any(Array),
      }),
    );
  });
});
