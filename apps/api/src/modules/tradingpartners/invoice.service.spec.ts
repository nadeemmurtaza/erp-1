import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from './invoice.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { SettingsService } from '../../core/settings/settings.service';
import { TradingPartnersService } from './trading-partners.service';

describe('InvoiceService', () => {
  let service: InvoiceService;
  let prisma: any;
  let tx: any;
  let tradingPartners: any;

  beforeEach(async () => {
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ max: null }]),
      invoice: { create: jest.fn() },
    };
    prisma = {
      tradingPartner: { findUnique: jest.fn() },
      invoice: { findMany: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };
    tradingPartners = { pushOutbound: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: { nodeRole: 'STANDALONE', nodeId: '' } },
        { provide: SettingsService, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: TradingPartnersService, useValue: tradingPartners },
      ],
    }).compile();

    service = module.get(InvoiceService);
  });

  describe('issue', () => {
    it('404s for a trading partner that does not exist', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue(null);

      await expect(
        service.issue({ tradingPartnerId: 'missing', lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 1, unitPriceMinor: 1000 }] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('computes line totals, subtotal and total, and pushes the invoice outbound', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE' });
      tx.invoice.create.mockResolvedValue({
        number: 'INV-2026-0001',
        currency: 'PKR',
        issueDate: new Date(),
        dueDate: null,
        subtotalMinor: 3000,
        taxMinor: 0,
        totalMinor: 3000,
        lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 2, unitPriceMinor: 1500, lineTotalMinor: 3000 }],
      });

      const result = await service.issue({
        tradingPartnerId: 'tp1',
        lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 2, unitPriceMinor: 1500 }],
      });

      const createCall = tx.invoice.create.mock.calls[0][0];
      expect(createCall.data.subtotalMinor).toBe(3000);
      expect(createCall.data.totalMinor).toBe(3000);
      expect(createCall.data.lines.create[0]).toMatchObject({ sku: 'SKU1', lineTotalMinor: 3000 });

      expect(tradingPartners.pushOutbound).toHaveBeenCalledWith(
        'tp1',
        'invoice.issued',
        expect.objectContaining({ number: 'INV-2026-0001', totalMinor: 3000 }),
      );
      expect(result.number).toBe('INV-2026-0001');
    });

    it('adds taxMinor on top of the line subtotal', async () => {
      prisma.tradingPartner.findUnique.mockResolvedValue({ id: 'tp1', status: 'ACTIVE' });
      tx.invoice.create.mockResolvedValue({ number: 'INV-2026-0002', lines: [] });

      await service.issue({
        tradingPartnerId: 'tp1',
        taxMinor: 200,
        lines: [{ sku: 'SKU1', nameEn: 'Shirt', quantity: 1, unitPriceMinor: 1000 }],
      });

      const createCall = tx.invoice.create.mock.calls[0][0];
      expect(createCall.data.subtotalMinor).toBe(1000);
      expect(createCall.data.taxMinor).toBe(200);
      expect(createCall.data.totalMinor).toBe(1200);
    });
  });

  describe('findOne', () => {
    it('404s for an invoice that does not exist', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('overdueInvoicesSummary — WO-56.1', () => {
    it('matches an independent count/total/oldest-date computed separately over the same rows (Acceptance)', async () => {
      // Already in the order the real query's own `orderBy: { dueDate: 'asc' }`
      // would return — the service trusts that ordering, it does not re-sort.
      const rows = [
        { totalMinor: 2500, dueDate: new Date('2026-01-05') },
        { totalMinor: 1000, dueDate: new Date('2026-01-10') },
      ];
      prisma.invoice.findMany.mockResolvedValue(rows);

      const result = await service.overdueInvoicesSummary();

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ISSUED', dueDate: { lt: expect.any(Date) } } }),
      );
      const independentCount = rows.length;
      const independentTotal = rows.reduce((sum, r) => sum + r.totalMinor, 0);
      const independentOldest = rows.map((r) => r.dueDate).sort((a, b) => a.getTime() - b.getTime())[0];
      expect(result).toEqual({ count: independentCount, totalMinor: independentTotal, oldestDueDate: independentOldest });
    });

    it('reports zero count, zero total and a null oldest date when nothing is overdue', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      const result = await service.overdueInvoicesSummary();
      expect(result).toEqual({ count: 0, totalMinor: 0, oldestDueDate: null });
    });
  });

  describe('findAll — overdue filter', () => {
    it('filters to ISSUED invoices past their due date when overdue is requested', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll({ overdue: true });
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ISSUED', dueDate: { lt: expect.any(Date) } } }),
      );
    });

    it('applies no filter when overdue is not requested', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });
  });
});
