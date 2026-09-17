import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hashApiKey } from '../../core/security/api-token';
import { TradingPartnersService } from './trading-partners.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';

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
    config = { get: jest.fn().mockReturnValue('dev-app-encryption-key-32-bytes0') };

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
      // iv:authTag:ciphertext — see secret-crypto.ts
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
});
