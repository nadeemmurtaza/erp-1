import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hashApiKey } from '../../core/security/api-token';
import { encryptSecret } from '@newax/shared';
import { TradingPartnersService } from './trading-partners.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

const ENCRYPTION_KEY = 'dev-app-encryption-key-32-bytes0';

describe('TradingPartnersService', () => {
  let service: TradingPartnersService;
  let prisma: any;
  let config: any;

  beforeEach(async () => {
    prisma = {
      tradingPartner: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      productVariant: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    config = {
      get: jest.fn((key: string) => (key === 'STOREFRONT_URL' ? 'https://yaseen.pk' : 'dev-app-encryption-key-32-bytes0')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TradingPartnersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<TradingPartnersService>(TradingPartnersService);
  });

  describe('create', () => {
    it('creates a partner with the summary shape, never a credential column', async () => {
      prisma.tradingPartner.create.mockResolvedValue({
        id: 'tp1',
        name: 'Acme Textiles',
        kind: 'SUPPLIER',
        outboundBaseUrl: null,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.create({ name: 'Acme Textiles', kind: 'SUPPLIER' });

      expect(result.name).toBe('Acme Textiles');
      const call = prisma.tradingPartner.create.mock.calls[0][0];
      expect(call.select).not.toHaveProperty('outboundApiKeyEncrypted');
      expect(call.select).not.toHaveProperty('inboundApiKeyHash');
    });
  });

  describe('findOne / update / remove — the not-found guard', () => {
    it('404s reading a partner that does not exist', async () => {
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404s updating a partner that does not exist', async () => {
      await expect(service.update('missing', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tradingPartner.update).not.toHaveBeenCalled();
    });

    it('404s removing a partner that does not exist', async () => {
      await expect(service.remove('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tradingPartner.delete).not.toHaveBeenCalled();
    });

    it('removes an existing partner — Supplier.tradingPartnerId unlinking is the database\'s job (onDelete: SetNull)', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1' });
      prisma.tradingPartner.delete.mockResolvedValue({});

      const result = await service.remove('tp1');

      expect(result).toEqual({ deleted: true });
      expect(prisma.tradingPartner.delete).toHaveBeenCalledWith({ where: { id: 'tp1' } });
    });
  });

  describe('rotateInboundKey', () => {
    it('returns a fresh raw key and stores only its SHA-256 hash', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1' });
      prisma.tradingPartner.update.mockResolvedValue({});

      const { apiKey } = await service.rotateInboundKey('tp1');

      expect(apiKey).toMatch(/^tp_/);
      const call = prisma.tradingPartner.update.mock.calls[0][0];
      expect(call.data.inboundApiKeyHash).toHaveLength(64); // hex sha256
      expect(call.data.inboundApiKeyHash).not.toBe(apiKey);
    });

    it('404s rotating a key for a partner that does not exist', async () => {
      await expect(service.rotateInboundKey('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('two rotations produce two different keys — the prior key stops working', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1' });
      prisma.tradingPartner.update.mockResolvedValue({});

      const first = await service.rotateInboundKey('tp1');
      const second = await service.rotateInboundKey('tp1');

      expect(first.apiKey).not.toBe(second.apiKey);
    });
  });

  describe('setOutboundApiKey', () => {
    it('encrypts the key before storing it — never stored plain', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1' });
      prisma.tradingPartner.update.mockResolvedValue({});

      await service.setOutboundApiKey('tp1', 'their-real-secret-key');

      const call = prisma.tradingPartner.update.mock.calls[0][0];
      expect(call.data.outboundApiKeyEncrypted).not.toBe('their-real-secret-key');
      expect(call.data.outboundApiKeyEncrypted).not.toContain('their-real-secret-key');
      // iv:authTag:ciphertext — see @newax/shared's secret-crypto.ts
      expect(call.data.outboundApiKeyEncrypted.split(':')).toHaveLength(3);
    });

    it('refuses a blank key', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1' });

      await expect(service.setOutboundApiKey('tp1', '   ')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tradingPartner.update).not.toHaveBeenCalled();
    });

    it('404s for a partner that does not exist', async () => {
      await expect(service.setOutboundApiKey('missing', 'a-key')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('verifyInboundKey — WO-18.2', () => {
    it('resolves the partner whose stored hash matches the presented raw key', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE' });

      const partner = await service.verifyInboundKey('tp_theirrawkey');

      expect(partner).toEqual({ id: 'tp1', status: 'ACTIVE' });
      expect(prisma.tradingPartner.findUnique).toHaveBeenCalledWith({
        where: { inboundApiKeyHash: hashApiKey('tp_theirrawkey') },
      });
    });

    it('refuses a key matching no partner', async () => {
      await expect(service.verifyInboundKey('tp_unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a blank key without a database round trip', async () => {
      await expect(service.verifyInboundKey('   ')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.tradingPartner.findUnique).not.toHaveBeenCalled();
    });

    it('refuses a SUSPENDED partner even though its key still hashes correctly', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'SUSPENDED' });

      await expect(service.verifyInboundKey('tp_theirrawkey')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses a PENDING partner — registered but never activated', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'PENDING' });

      await expect(service.verifyInboundKey('tp_theirrawkey')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getLiveStock — WO-18.2', () => {
    it('refuses a SUPPLIER-kind partner — stock visibility is for a partner buying from us', async () => {
      await expect(service.getLiveStock({ kind: 'SUPPLIER' } as any, ['SKU-1'])).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    });

    it('returns stock and the effective price (override, else the product base price) for a CUSTOMER partner', async () => {
      prisma.productVariant.findMany.mockResolvedValue([
        { sku: 'SKU-1', stock: 12, priceOverride: null, product: { basePrice: 5000 } },
        { sku: 'SKU-2', stock: 3, priceOverride: 4500, product: { basePrice: 5000 } },
      ]);

      const result = await service.getLiveStock({ kind: 'CUSTOMER' } as any, ['SKU-1', 'SKU-2']);

      expect(result).toEqual([
        { sku: 'SKU-1', found: true, stock: 12, priceMinor: 5000 },
        { sku: 'SKU-2', found: true, stock: 3, priceMinor: 4500 },
      ]);
    });

    it('reports a SKU it does not recognise as not found, rather than omitting it silently', async () => {
      prisma.productVariant.findMany.mockResolvedValue([]);

      const result = await service.getLiveStock({ kind: 'BOTH' } as any, ['SKU-GHOST']);

      expect(result).toEqual([{ sku: 'SKU-GHOST', found: false }]);
    });

    it('returns an empty list without a database round trip when no SKUs are asked for', async () => {
      const result = await service.getLiveStock({ kind: 'CUSTOMER' } as any, []);

      expect(result).toEqual([]);
      expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('pushOutbound — WO-18.3', () => {
    const encryptedKey = encryptSecret('their-real-outbound-key', ENCRYPTION_KEY);
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    });

    afterEach(() => {
      fetchSpy.mockRestore();
    });

    it('POSTs the payload to outboundBaseUrl with the decrypted key as a Bearer token', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        name: 'Acme Distribution',
        status: 'ACTIVE',
        outboundBaseUrl: 'https://acme.example/webhook',
        outboundApiKeyEncrypted: encryptedKey,
      });

      await service.pushOutbound('tp1', 'product.new', { sku: 'SKU-1' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://acme.example/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer their-real-outbound-key' }),
        }),
      );
      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body).toMatchObject({ eventType: 'product.new', payload: { sku: 'SKU-1' } });
    });

    it('does nothing when the partner does not exist', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue(null);

      await service.pushOutbound('missing', 'product.new', {});

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when the partner is not ACTIVE', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        status: 'PENDING',
        outboundBaseUrl: 'https://acme.example/webhook',
        outboundApiKeyEncrypted: encryptedKey,
      });

      await service.pushOutbound('tp1', 'product.new', {});

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does nothing when no outboundBaseUrl or key is on file', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        status: 'ACTIVE',
        outboundBaseUrl: null,
        outboundApiKeyEncrypted: null,
      });

      await service.pushOutbound('tp1', 'product.new', {});

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('never throws when the partner endpoint is unreachable — logs and swallows the failure', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        name: 'Acme',
        status: 'ACTIVE',
        outboundBaseUrl: 'https://acme.example/webhook',
        outboundApiKeyEncrypted: encryptedKey,
      });
      fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.pushOutbound('tp1', 'product.new', {})).resolves.toBeUndefined();
    });

    it('never throws on a non-2xx response — logs and swallows it', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        name: 'Acme',
        status: 'ACTIVE',
        outboundBaseUrl: 'https://acme.example/webhook',
        outboundApiKeyEncrypted: encryptedKey,
      });
      fetchSpy.mockResolvedValue({ ok: false, status: 500 } as Response);

      await expect(service.pushOutbound('tp1', 'product.new', {})).resolves.toBeUndefined();
    });
  });

  describe('inviteConnection / acceptConnection — first-connection handshake', () => {
    it('issues a one-time token for a PENDING, not-yet-accepted partner and returns an accept link', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({
        id: 'tp1',
        status: 'PENDING',
        acceptedAt: null,
      });
      prisma.tradingPartner.update.mockResolvedValue({});

      const result = await service.inviteConnection('tp1');

      expect(result.token).toEqual(expect.any(String));
      expect(result.acceptUrl).toBe(`https://yaseen.pk/partner-invite?token=${encodeURIComponent(result.token)}`);
      const call = prisma.tradingPartner.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'tp1' });
      expect(call.data.inviteTokenHash).toBe(hashApiKey(result.token));
      expect(call.data.invitedAt).toBeInstanceOf(Date);
    });

    it('refuses to invite a partner that already accepted', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE', acceptedAt: new Date() });

      await expect(service.inviteConnection('tp1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tradingPartner.update).not.toHaveBeenCalled();
    });

    it('refuses to invite a partner that is SUSPENDED', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'SUSPENDED', acceptedAt: null });

      await expect(service.inviteConnection('tp1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404s inviting a partner that does not exist', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue(null);

      await expect(service.inviteConnection('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['SUPPLIER', 'SUPPLIER'],
      ['MANUFACTURER', 'SUPPLIER'],
      ['DISTRIBUTOR', 'CUSTOMER'],
      ['RETAILER', 'CUSTOMER'],
    ] as const)('accepting as %s derives kind %s, activates, and consumes the token', async (role, expectedKind) => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', inviteTokenHash: hashApiKey('raw-token') });
      prisma.tradingPartner.update.mockResolvedValue({ id: 'tp1', name: 'Acme', kind: expectedKind, status: 'ACTIVE' });

      await service.acceptConnection('raw-token', role);

      const call = prisma.tradingPartner.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'tp1' });
      expect(call.data).toMatchObject({
        acceptedRole: role,
        status: 'ACTIVE',
        kind: expectedKind,
        inviteTokenHash: null,
      });
      expect(call.data.acceptedAt).toBeInstanceOf(Date);
    });

    it('rejects an invalid or already-used token', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue(null);

      await expect(service.acceptConnection('bad-token', 'RETAILER')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.tradingPartner.update).not.toHaveBeenCalled();
    });

    it('rejects a blank token', async () => {
      await expect(service.acceptConnection('  ', 'RETAILER')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.tradingPartner.findUnique).not.toHaveBeenCalled();
    });
  });
});
