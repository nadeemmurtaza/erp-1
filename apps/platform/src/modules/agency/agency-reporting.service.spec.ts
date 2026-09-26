import { AgencyReportingService } from './agency-reporting.service';

describe('AgencyReportingService', () => {
  let prisma: any;
  let config: any;
  let service: AgencyReportingService;

  beforeEach(() => {
    prisma = {
      agencyUsageSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      platformInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      platformTenant: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          resourceTier: 'STANDARD',
          plan: { key: 'starter' },
        }),
      },
    };
    config = { get: () => 'usd' };
    service = new AgencyReportingService(prisma, config);
  });

  it('usage() scopes strictly to the given tenant id', async () => {
    await service.usage('tenant-a');
    expect(prisma.agencyUsageSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-a' }) }),
    );
    expect(prisma.platformTenant.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant-a' } }),
    );
  });

  it('usage() carries the tenant\'s own plan/status alongside the snapshots', async () => {
    const result = await service.usage('tenant-a');
    expect(result).toEqual(expect.objectContaining({ status: 'ACTIVE', planKey: 'starter', resourceTier: 'STANDARD', snapshots: [] }));
  });

  it('invoices() scopes strictly to the given tenant id and never selects another tenant\'s rows', async () => {
    await service.invoices('tenant-a');
    expect(prisma.platformInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
    );
  });

  it('invoices() travels with the configured billing currency, never a hardcoded one', async () => {
    config.get = () => 'eur';
    const result = await service.invoices('tenant-a');
    expect(result.currency).toEqual('eur');
  });
});
