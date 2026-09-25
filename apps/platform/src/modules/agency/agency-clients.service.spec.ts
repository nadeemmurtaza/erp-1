import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgencyClientsService } from './agency-clients.service';

describe('AgencyClientsService', () => {
  const pepper = 'test-pepper-at-least-32-characters-long';
  let prisma: any;
  let config: any;
  let service: AgencyClientsService;

  beforeEach(() => {
    prisma = {
      platformTenant: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    config = { get: () => pepper };
    service = new AgencyClientsService(prisma, config);
  });

  describe('list', () => {
    it('only returns tenants already onboarded (apiKeyHash set)', async () => {
      await service.list();
      expect(prisma.platformTenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { apiKeyHash: { not: null } } }),
      );
    });
  });

  describe('register', () => {
    it('throws NotFoundException for an unknown tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue(null);
      await expect(service.register('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('refuses to re-register an already-registered tenant', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', apiKeyHash: 'already-set' });
      await expect(service.register('t1', {})).rejects.toThrow(BadRequestException);
      expect(prisma.platformTenant.update).not.toHaveBeenCalled();
    });

    it('stores only the HASH of the newly generated key and returns the plaintext exactly once', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', apiKeyHash: null });
      prisma.platformTenant.update.mockImplementation(({ data }: any) => ({ id: 't1', ...data }));

      const { tenant, apiKey } = await service.register('t1', { mailDomain: 'acme.example.com' });

      expect(apiKey).toMatch(/^[0-9a-f]{64}$/);
      const [[updateArgs]] = prisma.platformTenant.update.mock.calls;
      expect(updateArgs.data.apiKeyHash).not.toEqual(apiKey);
      expect(updateArgs.data.mailDomain).toEqual('acme.example.com');
      expect(tenant.apiKeyHash).not.toEqual(apiKey);
    });
  });

  describe('rotateKey', () => {
    it('refuses a tenant never registered', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', apiKeyHash: null });
      await expect(service.rotateKey('t1')).rejects.toThrow(NotFoundException);
    });

    it('invalidates the old hash by overwriting it — no code path recovers the previous key', async () => {
      prisma.platformTenant.findUnique.mockResolvedValue({ id: 't1', apiKeyHash: 'old-hash' });
      prisma.platformTenant.update.mockImplementation(({ data }: any) => ({ id: 't1', ...data }));

      const { apiKey } = await service.rotateKey('t1');

      const [[updateArgs]] = prisma.platformTenant.update.mock.calls;
      expect(updateArgs.data.apiKeyHash).not.toEqual('old-hash');
      expect(updateArgs.data.apiKeyHash).not.toEqual(apiKey);
      expect(updateArgs.data.apiKeyRotatedAt).toBeInstanceOf(Date);
    });
  });
});
