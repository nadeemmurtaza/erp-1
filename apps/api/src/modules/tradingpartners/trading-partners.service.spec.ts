import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
});
