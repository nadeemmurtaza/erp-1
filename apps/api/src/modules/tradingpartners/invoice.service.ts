import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AppConfigService } from '../../core/config/app-config.service';
import { SettingsService } from '../../core/settings/settings.service';
import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../core/settings/document-number';
import { Prisma } from '../../core/prisma/client';
import { TradingPartnersService } from './trading-partners.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { BRAND } from '@newax/shared';

const INVOICE_NUMBER_LOCK_NAMESPACE = 8_241_130;

/**
 * Bare R6-style numbering (advisory lock + MAX scan), the same shape as
 * `nextPONumber` (purchasing.service.ts) — NOT R18's fiscal-year-gapless
 * legal sequence, which needs the accounting module's FiscalYear/
 * FiscalPeriod machinery. See invoicing.prisma's file header.
 */
async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'invoice');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "Invoice"
    WHERE "number" LIKE ${`${like}%`}
  `;
  return documentNumber(config, prefix, year, (max ?? 0) + 1);
}

/**
 * The "forth" direction's billing document (WO-18.3) — issuing one auto-
 * pushes it to the linked TradingPartner immediately, the same "create and
 * send in one action" shape as `QuoteService`. Lives inside the
 * tradingpartners module rather than a general `invoicing` module: every
 * Invoice here belongs to a TradingPartner, so there is no cross-module
 * boundary to cross and `pushOutbound` is called directly, not through a
 * domain event.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly tradingPartners: TradingPartnersService,
  ) {}

  async issue(dto: CreateInvoiceDto) {
    const partner = await this.prisma.tradingPartner.findUnique({ where: { id: dto.tradingPartnerId } });
    if (!partner) throw new NotFoundException('Trading partner not found');

    const invoice = await this.prisma.$transaction(async (tx) => {
      const number = await nextInvoiceNumber(tx, this.settings, this.config);
      const lines = dto.lines.map((line) => ({
        sku: line.sku,
        nameEn: line.nameEn,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.quantity * line.unitPriceMinor,
      }));
      const subtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
      const taxMinor = dto.taxMinor ?? 0;

      return tx.invoice.create({
        data: {
          number,
          tradingPartnerId: dto.tradingPartnerId,
          orderId: dto.orderId,
          currency: BRAND.locale.currency,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          subtotalMinor,
          taxMinor,
          totalMinor: subtotalMinor + taxMinor,
          lines: { create: lines },
        },
        include: { lines: true },
      });
    });

    await this.tradingPartners.pushOutbound(dto.tradingPartnerId, 'invoice.issued', {
      number: invoice.number,
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      subtotalMinor: invoice.subtotalMinor,
      taxMinor: invoice.taxMinor,
      totalMinor: invoice.totalMinor,
      lines: invoice.lines.map((line) => ({
        sku: line.sku,
        nameEn: line.nameEn,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    });

    return invoice;
  }

  async findAll() {
    return this.prisma.invoice.findMany({ orderBy: { createdAt: 'desc' }, include: { lines: true } });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
