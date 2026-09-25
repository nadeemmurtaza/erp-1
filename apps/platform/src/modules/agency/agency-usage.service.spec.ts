import { Test, TestingModule } from '@nestjs/testing';
import { AgencyUsageService } from './agency-usage.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { TenantCredentialResolverService } from '../../core/tenant-credentials/tenant-credential-resolver.service';
import { StalwartAdminClient } from './stalwart-admin.client';

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

jest.mock('pg', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    query: mockQuery,
    end: mockEnd,
  })),
}));

describe('AgencyUsageService', () => {
  let prisma: any;
  let credentials: any;
  let stalwart: any;
  let service: AgencyUsageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      platformTenant: { findUnique: jest.fn(), findMany: jest.fn() },
      agencyUsageSnapshot: { upsert: jest.fn() },
    };
    credentials = { resolveConnectionString: jest.fn().mockResolvedValue('postgresql://x/tenant_acme') };
    stalwart = { getSentCount30d: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgencyUsageService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantCredentialResolverService, useValue: credentials },
        { provide: StalwartAdminClient, useValue: stalwart },
      ],
    }).compile();

    service = module.get(AgencyUsageService);
  });

  describe('listRegisteredTenantIds', () => {
    it('only lists tenants onboarded (apiKeyHash set) and not torn down', async () => {
      prisma.platformTenant.findMany.mockResolvedValue([{ id: 't1' }]);
      await service.listRegisteredTenantIds();
      expect(prisma.platformTenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { apiKeyHash: { not: null }, status: { not: 'DEPROVISIONED' } } }),
      );
    });
  });

  describe('captureSnapshotForTenant', () => {
    it('upserts on (tenantId, snapshotDate) — a second call the same day updates, never inserts a second row', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', mailDomain: null });
      mockQuery.mockResolvedValue({ rows: [{ size: '123456', count: '3' }] });

      await service.captureSnapshotForTenant('t1');
      await service.captureSnapshotForTenant('t1');

      expect(prisma.agencyUsageSnapshot.upsert).toHaveBeenCalledTimes(2);
      const [firstCall, secondCall] = prisma.agencyUsageSnapshot.upsert.mock.calls;
      expect(firstCall[0].where).toEqual(secondCall[0].where); // identical (tenantId, snapshotDate) key both times
      expect(firstCall[0].where.tenantId_snapshotDate.tenantId).toEqual('t1');
    });

    it('records databaseBytes as a BigInt from pg_database_size', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', mailDomain: null });
      mockQuery.mockResolvedValue({ rows: [{ size: '999', count: '0' }] });

      await service.captureSnapshotForTenant('t1');

      const [[{ create }]] = prisma.agencyUsageSnapshot.upsert.mock.calls;
      expect(create.databaseBytes).toEqual(BigInt(999));
    });

    it('leaves emailsSent30d null when the tenant has no mailDomain, and never calls Stalwart', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', mailDomain: null });
      mockQuery.mockResolvedValue({ rows: [{ size: '1', count: '0' }] });

      await service.captureSnapshotForTenant('t1');

      expect(stalwart.getSentCount30d).not.toHaveBeenCalled();
      const [[{ create }]] = prisma.agencyUsageSnapshot.upsert.mock.calls;
      expect(create.emailsSent30d).toBeNull();
    });

    it('reads the mail-send count from Stalwart when mailDomain is set, and still records the DB size if Stalwart fails', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', mailDomain: 'acme.example.com' });
      mockQuery.mockResolvedValue({ rows: [{ size: '1', count: '0' }] });
      stalwart.getSentCount30d.mockResolvedValue(null); // StalwartAdminClient's own honest-degrade contract

      await service.captureSnapshotForTenant('t1');

      expect(stalwart.getSentCount30d).toHaveBeenCalledWith('acme.example.com');
      const [[{ create }]] = prisma.agencyUsageSnapshot.upsert.mock.calls;
      expect(create.emailsSent30d).toBeNull();
      expect(create.databaseBytes).toEqual(BigInt(1)); // the DB-size half still recorded
    });

    it('defers the WHOLE snapshot (writes nothing) when the tenant database itself is unreachable', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', mailDomain: null });
      mockQuery.mockRejectedValue(new Error('connection reset'));

      await service.captureSnapshotForTenant('t1');

      expect(prisma.agencyUsageSnapshot.upsert).not.toHaveBeenCalled();
    });

    it('is a no-op for a tenant that no longer exists', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(null);
      await service.captureSnapshotForTenant('gone');
      expect(prisma.agencyUsageSnapshot.upsert).not.toHaveBeenCalled();
    });
  });
});
