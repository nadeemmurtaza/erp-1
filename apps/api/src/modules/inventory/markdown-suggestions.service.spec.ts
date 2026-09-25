import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarkdownSuggestionsService } from './markdown-suggestions.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';

const PENDING_SUGGESTION = {
  id: 'sug1',
  variantId: 'v1',
  discountId: null,
  suggestedBps: 2000,
  estimatedClearancePct: 60,
  estimatedClearanceDays: 25,
  marginBeforePaisa: 100000,
  marginAfterPaisa: 60000,
  status: 'PENDING' as const,
  createdAt: new Date(),
  resolvedAt: null,
  variant: {
    id: 'v1',
    sku: 'SKU-1',
    size: 'M',
    color: 'Blue',
    stock: 2,
    product: { id: 'p1', slug: 'lawn-suit', translations: [{ name: 'Lawn Suit' }] },
  },
};

describe('MarkdownSuggestionsService', () => {
  let service: MarkdownSuggestionsService;
  let prisma: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      markdownSuggestion: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      discount: { create: jest.fn() },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarkdownSuggestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(MarkdownSuggestionsService);
  });

  describe('list', () => {
    it('defaults to the PENDING queue', async () => {
      prisma.markdownSuggestion.findMany.mockResolvedValue([]);
      await service.list();
      expect(prisma.markdownSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'PENDING' } }),
      );
    });

    it('accepts an explicit status', async () => {
      prisma.markdownSuggestion.findMany.mockResolvedValue([]);
      await service.list('CREATED');
      expect(prisma.markdownSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'CREATED' } }),
      );
    });
  });

  describe('activate', () => {
    it('creates a PRODUCT-scoped PERCENTAGE discount at the suggested bps', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(PENDING_SUGGESTION);
      prisma.discount.create.mockResolvedValue({ id: 'disc1' });
      prisma.markdownSuggestion.update.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'CREATED', discountId: 'disc1' });

      await service.activate('sug1', 'staff1');

      expect(prisma.discount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'PERCENTAGE',
            scope: 'PRODUCT',
            value: 2000,
            productIds: ['p1'],
            isActive: true,
          }),
        }),
      );
    });

    it('marks the suggestion CREATED and records the new discountId', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(PENDING_SUGGESTION);
      prisma.discount.create.mockResolvedValue({ id: 'disc1' });
      prisma.markdownSuggestion.update.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'CREATED', discountId: 'disc1' });

      await service.activate('sug1', 'staff1');

      expect(prisma.markdownSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sug1' },
          data: expect.objectContaining({ status: 'CREATED', discountId: 'disc1' }),
        }),
      );
    });

    it('audits the activation with the variant and new discount', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(PENDING_SUGGESTION);
      prisma.discount.create.mockResolvedValue({ id: 'disc1' });
      prisma.markdownSuggestion.update.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'CREATED', discountId: 'disc1' });

      await service.activate('sug1', 'staff1');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'staff1',
          action: 'inventory.markdown_suggestion_activated',
          entity: 'MarkdownSuggestion',
          entityId: 'sug1',
        }),
      );
    });

    it('throws for a suggestion that does not exist', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(null);
      await expect(service.activate('missing', 'staff1')).rejects.toThrow(NotFoundException);
      expect(prisma.discount.create).not.toHaveBeenCalled();
    });

    it('refuses to re-activate an already-resolved suggestion', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'CREATED' });
      await expect(service.activate('sug1', 'staff1')).rejects.toThrow(BadRequestException);
      expect(prisma.discount.create).not.toHaveBeenCalled();
    });
  });

  describe('dismiss', () => {
    it('marks the suggestion DISMISSED without creating a discount', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(PENDING_SUGGESTION);
      prisma.markdownSuggestion.update.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'DISMISSED' });

      await service.dismiss('sug1', 'staff1');

      expect(prisma.discount.create).not.toHaveBeenCalled();
      expect(prisma.markdownSuggestion.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DISMISSED' }) }),
      );
    });

    it('throws for a suggestion that does not exist', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue(null);
      await expect(service.dismiss('missing', 'staff1')).rejects.toThrow(NotFoundException);
    });

    it('refuses to dismiss an already-resolved suggestion', async () => {
      prisma.markdownSuggestion.findUnique.mockResolvedValue({ ...PENDING_SUGGESTION, status: 'DISMISSED' });
      await expect(service.dismiss('sug1', 'staff1')).rejects.toThrow(BadRequestException);
    });
  });
});
