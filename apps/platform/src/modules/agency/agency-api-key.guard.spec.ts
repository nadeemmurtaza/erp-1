import { UnauthorizedException } from '@nestjs/common';
import { AgencyApiKeyGuard } from './agency-api-key.guard';
import { hashAgencyApiKey } from './agency-key';

function contextWith(header?: string) {
  const request: any = { headers: { 'x-agency-api-key': header } };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
  };
}

describe('AgencyApiKeyGuard', () => {
  const pepper = 'test-pepper-at-least-32-characters-long';
  let prisma: any;
  let config: any;

  beforeEach(() => {
    prisma = { platformTenant: { findUnique: jest.fn() } };
    config = { get: () => pepper };
  });

  it('rejects a request with no X-Agency-Api-Key header', async () => {
    const { context } = contextWith(undefined);
    const guard = new AgencyApiKeyGuard(prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown key', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    const { context } = contextWith('bogus-key');
    const guard = new AgencyApiKeyGuard(prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('looks the tenant up by the HASH of the presented key, never the raw key — the raw key is never sent to Prisma/logged as a query value', async () => {
    prisma.platformTenant.findUnique.mockResolvedValue(null);
    const rawKey = 'a-real-looking-agency-key';
    const { context } = contextWith(rawKey);
    const guard = new AgencyApiKeyGuard(prisma, config);

    await guard.canActivate(context).catch(() => undefined);

    expect(prisma.platformTenant.findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: hashAgencyApiKey(rawKey, pepper) },
    });
  });

  it('attaches exactly the one tenant the hash resolved to, and no other', async () => {
    const tenantA = { id: 'tenant-a', apiKeyHash: hashAgencyApiKey('key-a', pepper) };
    prisma.platformTenant.findUnique.mockResolvedValue(tenantA);
    const { context, request } = contextWith('key-a');
    const guard = new AgencyApiKeyGuard(prisma, config);

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.agencyClient).toBe(tenantA);
    expect(request.agencyClient.id).toEqual('tenant-a');
  });

  it('never accepts a client id from the request itself — canActivate reads only the header', async () => {
    const tenantA = { id: 'tenant-a', apiKeyHash: hashAgencyApiKey('key-a', pepper) };
    prisma.platformTenant.findUnique.mockResolvedValue(tenantA);
    const request: any = {
      headers: { 'x-agency-api-key': 'key-a' },
      params: { tenantId: 'tenant-b' }, // an attacker-controlled param, if this controller ever grew one
      query: { clientId: 'tenant-b' },
    };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    const guard = new AgencyApiKeyGuard(prisma, config);

    await guard.canActivate(context);

    expect(request.agencyClient.id).toEqual('tenant-a'); // never tenant-b
  });
});
