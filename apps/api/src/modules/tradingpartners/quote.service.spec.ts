import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuoteService } from './quote.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { SettingsService } from '../../core/settings/settings.service';
import { TradingPartnersService } from './trading-partners.service';

describe('QuoteService', () => {
  let service: QuoteService;
  let prisma: any;
  let tx: any;
  let tradingPartners: any;

  beforeEach(async () => {
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
      quote: { create: jest.fn() },
    };
    prisma = {
      tradingPartner: { findUnique: jest.fn() },
      quote: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    tradingPartners = { pushOutbound: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: '' } },
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: TradingPartnersService, useValue: tradingPartners },
      ],
    }).compile();

    service = module.get(QuoteService);
  });

  describe('send', () => {
    it('404s for a trading partner that does not exist', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue(null);

      await expect(
        service.send({ tradingPartnerId: 'missing', lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 1, unitPriceMinor: 1000 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('defaults validUntil to 14 days out when omitted', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE' });
      tx.quote.create.mockResolvedValue({ number: 'QTE-2026-0001', lines: [] });

      await service.send({ tradingPartnerId: 'tp1', lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 1, unitPriceMinor: 1000 }] });

      const createCall = tx.quote.create.mock.calls[0][0];
      const daysOut = (createCall.data.validUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysOut).toBeGreaterThan(13.9);
      expect(daysOut).toBeLessThan(14.1);
    });

    it('honors an explicit validUntil and pushes the quote outbound', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE' });
      tx.quote.create.mockResolvedValue({
        number: 'QTE-2026-0002',
        currency: 'PKR',
        validUntil: new Date('2026-12-31'),
        lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 3, unitPriceMinor: 1500 }],
      });

      const result = await service.send({
        tradingPartnerId: 'tp1',
        validUntil: '2026-12-31',
        lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 3, unitPriceMinor: 1500 }],
      });

      const createCall = tx.quote.create.mock.calls[0][0];
      expect(createCall.data.validUntil).toEqual(new Date('2026-12-31'));
      expect(tradingPartners.pushOutbound).toHaveBeenCalledWith(
        'tp1',
        'quote.sent',
        expect.objectContaining({ number: 'QTE-2026-0002' }),
      );
      expect(result.number).toBe('QTE-2026-0002');
    });
  });

  describe('findOne', () => {
    it('404s for a quote that does not exist', async () => {
      prisma.quote.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
