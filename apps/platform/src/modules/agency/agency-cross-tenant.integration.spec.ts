import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AppConfigService } from '../../core/config/app-config.service';
import { AgencyApiKeyGuard } from './agency-api-key.guard';
import { AgencyReportingService } from './agency-reporting.service';
import { generateAgencyApiKey, hashAgencyApiKey } from './agency-key';

/**
 * doc 14's own acceptance criteria, proven against a REAL Postgres database
 * — not mocks. Every other spec in this module mocks `PrismaService`;
 * these two properties (cross-tenant isolation, and the nightly snapshot's
 * one-row-per-day guarantee) are exactly the ones the task's own
 * verification bar names as needing real-DB proof, so this file is the one
 * place in the suite that connects for real.
 *
 * Requires `PLATFORM_DATABASE_URL` (and the matching
 * `PLATFORM_AGENCY_KEY_PEPPER`) to point at a real, migrated Postgres
 * database — `apps/platform/.env` (gitignored) during local development,
 * a `PLATFORM_DATABASE_URL`-backed Postgres service in CI once one exists
 * for this app (see this task's own final report: apps/platform's `pnpm
 * test` step is not currently wired to a Postgres service in
 * `.github/workflows/ci.yml`, a pre-existing gap this feature does not
 * silently paper over). Skipped, not failed, when that variable is unset —
 * an honest skip rather than a green check that proved nothing.
 */
const describeIfRealDb = process.env.PLATFORM_DATABASE_URL ? describe : describe.skip;

describeIfRealDb('Agency managed-services — real-Postgres cross-tenant isolation & snapshot idempotency', () => {
  let prisma: PrismaService;
  let config: AppConfigService;
  let planId: string;
  let tenantAId: string;
  let tenantBId: string;

  const pepper = process.env.PLATFORM_AGENCY_KEY_PEPPER as string;
  const keyA = generateAgencyApiKey();
  const keyB = generateAgencyApiKey();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    config = { get: (key: string) => (key === 'PLATFORM_AGENCY_KEY_PEPPER' ? pepper : undefined) } as unknown as AppConfigService;

    const plan = await prisma.platformPlan.create({
      data: {
        key: `agency-it-plan-${suffix}`,
        editionCap: 'solo',
        monthlyPriceMinor: 10_000,
        includedResourceTier: 'STANDARD',
      },
    });
    planId = plan.id;

    const tenantA = await prisma.platformTenant.create({
      data: {
        slug: `agency-it-a-${suffix}`,
        legalName: 'Agency Integration Test — Tenant A',
        planId,
        apiKeyHash: hashAgencyApiKey(keyA, pepper),
        apiKeyRotatedAt: new Date(),
      },
    });
    tenantAId = tenantA.id;

    const tenantB = await prisma.platformTenant.create({
      data: {
        slug: `agency-it-b-${suffix}`,
        legalName: 'Agency Integration Test — Tenant B',
        planId,
        apiKeyHash: hashAgencyApiKey(keyB, pepper),
        apiKeyRotatedAt: new Date(),
      },
    });
    tenantBId = tenantB.id;
  });

  afterAll(async () => {
    await prisma.agencyUsageSnapshot.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await prisma.platformTenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
    await prisma.platformPlan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  function requestWithKey(key: string) {
    const request: any = { headers: { 'x-agency-api-key': key } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    return { request, context };
  }

  it("client A's real key resolves to tenant A only", async () => {
    const guard = new AgencyApiKeyGuard(prisma, config);
    const { request, context } = requestWithKey(keyA);

    await guard.canActivate(context);

    expect(request.agencyClient.id).toEqual(tenantAId);
    expect(request.agencyClient.id).not.toEqual(tenantBId);
  });

  it("client B's real key resolves to tenant B only", async () => {
    const guard = new AgencyApiKeyGuard(prisma, config);
    const { request, context } = requestWithKey(keyB);

    await guard.canActivate(context);

    expect(request.agencyClient.id).toEqual(tenantBId);
    expect(request.agencyClient.id).not.toEqual(tenantAId);
  });

  it("presenting client A's key can never read client B's usage rows — the doc's own acceptance criterion, proven end to end against real rows", async () => {
    await prisma.agencyUsageSnapshot.create({
      data: { tenantId: tenantBId, snapshotDate: new Date('2026-09-01'), databaseBytes: BigInt(999), activeUsers30d: 4 },
    });

    const guard = new AgencyApiKeyGuard(prisma, config);
    const { request, context } = requestWithKey(keyA);
    await guard.canActivate(context);

    const reportingConfig = { get: () => 'usd' } as unknown as AppConfigService;
    const reporting = new AgencyReportingService(prisma, reportingConfig);
    const result = await reporting.usage(request.agencyClient.id);

    expect(result.snapshots.every((row) => row.tenantId === tenantAId)).toBe(true);
    expect(result.snapshots.some((row) => row.tenantId === tenantBId)).toBe(false);
  });

  it('an unknown or rotated-out key is rejected outright — it never falls back to any tenant', async () => {
    const guard = new AgencyApiKeyGuard(prisma, config);
    const { context } = requestWithKey('not-a-real-key-at-all');

    await expect(guard.canActivate(context)).rejects.toThrow();
  });

  it('the nightly snapshot upsert enforces one row per (tenant, day) at the DATABASE level — a same-day rerun updates, never inserts a sibling row', async () => {
    const snapshotDate = new Date('2026-09-15');
    const where = { tenantId_snapshotDate: { tenantId: tenantAId, snapshotDate } };

    await prisma.agencyUsageSnapshot.upsert({
      where,
      create: { tenantId: tenantAId, snapshotDate, databaseBytes: BigInt(100), activeUsers30d: 1 },
      update: { databaseBytes: BigInt(100), activeUsers30d: 1 },
    });
    await prisma.agencyUsageSnapshot.upsert({
      where,
      create: { tenantId: tenantAId, snapshotDate, databaseBytes: BigInt(200), activeUsers30d: 2 },
      update: { databaseBytes: BigInt(200), activeUsers30d: 2 },
    });

    const rows = await prisma.agencyUsageSnapshot.findMany({ where: { tenantId: tenantAId, snapshotDate } });
    expect(rows).toHaveLength(1);
    expect(rows[0].databaseBytes).toEqual(BigInt(200));
  });
});
