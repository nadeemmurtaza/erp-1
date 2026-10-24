import { UnauthorizedException } from '@nestjs/common';
import { MarketplaceCredentialGuard } from './marketplace-credential.guard';
import { hashMarketplaceApiKey } from './product-reference-key';

function contextWith(header?: string) {
  const request: any = { headers: { 'x-marketplace-api-key': header } };
  return {
    request,
    context: { switchToHttp: () => ({ getRequest: () => request }) } as any,
  };
}

describe('MarketplaceCredentialGuard', () => {
  const pepper = 'test-pepper-at-least-32-characters-long';
  let prisma: any;
  let config: any;

  beforeEach(() => {
    prisma = { marketplacePublisherCredential: { findUnique: jest.fn() } };
    config = { get: () => pepper };
  });

  it('rejects a request with no X-Marketplace-Api-Key header', async () => {
    const { context } = contextWith(undefined);
    const guard = new MarketplaceCredentialGuard(prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown key', async () => {
    prisma.marketplacePublisherCredential.findUnique.mockResolvedValue(null);
    const { context } = contextWith('bogus-key');
    const guard = new MarketplaceCredentialGuard(prisma, config);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('looks the credential up by the HASH of the presented key, never the raw key', async () => {
    prisma.marketplacePublisherCredential.findUnique.mockResolvedValue(null);
    const rawKey = 'a-real-looking-marketplace-key';
    const { context } = contextWith(rawKey);
    const guard = new MarketplaceCredentialGuard(prisma, config);

    await guard.canActivate(context).catch(() => undefined);

    expect(prisma.marketplacePublisherCredential.findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: hashMarketplaceApiKey(rawKey, pepper) },
      include: { tenant: true },
    });
  });

  it('attaches exactly the one tenant the hash resolved to, and no other', async () => {
    const tenantA = { id: 'tenant-a' };
    prisma.marketplacePublisherCredential.findUnique.mockResolvedValue({
      apiKeyHash: hashMarketplaceApiKey('key-a', pepper),
      tenant: tenantA,
    });
    const { context, request } = contextWith('key-a');
    const guard = new MarketplaceCredentialGuard(prisma, config);

    const allowed = await guard.canActivate(context);

    expect(allowed).toBe(true);
    expect(request.publisherTenant).toBe(tenantA);
  });

  it('never accepts a tenant id from the request itself — canActivate reads only the header', async () => {
    const tenantA = { id: 'tenant-a' };
    prisma.marketplacePublisherCredential.findUnique.mockResolvedValue({
      apiKeyHash: hashMarketplaceApiKey('key-a', pepper),
      tenant: tenantA,
    });
    const request: any = {
      headers: { 'x-marketplace-api-key': 'key-a' },
      params: { tenantId: 'tenant-b' },
      query: { tenantId: 'tenant-b' },
    };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };
    const guard = new MarketplaceCredentialGuard(prisma, config);

    await guard.canActivate(context);

    expect(request.publisherTenant.id).toEqual('tenant-a');
  });
});
