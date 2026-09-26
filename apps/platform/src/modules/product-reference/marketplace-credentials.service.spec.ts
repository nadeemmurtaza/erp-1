import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketplaceCredentialsService } from './marketplace-credentials.service';

describe('MarketplaceCredentialsService', () => {
  const pepper = 'test-pepper-at-least-32-characters-long';
  let prisma: any;
  let config: any;
  let service: MarketplaceCredentialsService;

  beforeEach(() => {
    prisma = {
      platformTenant: { findUnique: jest.fn() },
      marketplacePublisherCredential: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };
    config = { get: () => pepper };
    service = new MarketplaceCredentialsService(prisma, config);
  });

  describe('issue', () => {
    it('throws NotFoundException for an unknown tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(null);
      await expect(service.issue('missing')).rejects.toThrow(NotFoundException);
    });

    it('refuses a tenant that already has a credential — use rotate instead', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1' });
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue({ tenantId: 't1' });

      await expect(service.issue('t1')).rejects.toThrow(BadRequestException);
      expect(prisma.marketplacePublisherCredential.create).not.toHaveBeenCalled();
    });

    it('stores only the HASH of the newly generated key and returns the plaintext exactly once', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1' });
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue(null);
      prisma.marketplacePublisherCredential.create.mockImplementation(({ data }: any) => ({ id: 'cred-1', ...data }));

      const { credential, apiKey } = await service.issue('t1');

      expect(apiKey).toMatch(/^[0-9a-f]{64}$/);
      const [[createArgs]] = prisma.marketplacePublisherCredential.create.mock.calls;
      expect(createArgs.data.apiKeyHash).not.toEqual(apiKey);
      expect(createArgs.data.tenantId).toEqual('t1');
      expect(credential.apiKeyHash).not.toEqual(apiKey);
    });
  });

  describe('rotate', () => {
    it('throws NotFoundException when the tenant has no credential yet', async () => {
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue(null);
      await expect(service.rotate('t1')).rejects.toThrow(NotFoundException);
    });

    it('replaces the hash so the old key stops matching, and returns a new plaintext', async () => {
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue({ tenantId: 't1', apiKeyHash: 'old-hash' });
      prisma.marketplacePublisherCredential.update.mockImplementation(({ data }: any) => ({ tenantId: 't1', ...data }));

      const { credential, apiKey } = await service.rotate('t1');

      expect(credential.apiKeyHash).not.toEqual('old-hash');
      expect(credential.apiKeyHash).not.toEqual(apiKey);
      expect(credential.rotatedAt).toBeInstanceOf(Date);
    });
  });

  describe('revoke', () => {
    it('throws NotFoundException when the tenant has no credential', async () => {
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue(null);
      await expect(service.revoke('t1')).rejects.toThrow(NotFoundException);
    });

    it('deletes the credential row entirely, not a status flag', async () => {
      prisma.marketplacePublisherCredential.findUnique.mockResolvedValue({ tenantId: 't1' });
      await service.revoke('t1');
      expect(prisma.marketplacePublisherCredential.delete).toHaveBeenCalledWith({ where: { tenantId: 't1' } });
    });
  });
});
