import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { documentPrefix } from '../../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../../core/settings/document-number';
import { Prisma } from '../../../core/prisma/client';
import { BRAND } from '@newax/shared';
import { TradingPartnersService } from './trading-partners.service';
import { CreateQuoteDto } from './dto/quote.dto';

const QUOTE_NUMBER_LOCK_NAMESPACE = 8_241_131;

/** Same shape as `nextInvoiceNumber` / `nextPONumber` — see invoice.service.ts. */
async function nextQuoteNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = await documentPrefix(settings, 'quote');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "Quote"
    WHERE "number" LIKE ${`${like}%`}
  `;
  return documentNumber(config, prefix, year, (max ?? 0) + 1);
}

/**
 * The "forth" direction's price-quotation document (WO-18.3) — issuing one
 * auto-pushes it to the linked TradingPartner immediately. See
 * InvoiceService's own doc comment for why this lives inside the
 * tradingpartners module and calls `pushOutbound` directly.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly settings: SettingsService,
    private readonly tradingPartners: TradingPartnersService,
  ) {}

  async send(dto: CreateQuoteDto) {
    const partner = await this.prisma.tradingPartner.findUnique({ where: { id: dto.tradingPartnerId } });
    if (!partner) throw new NotFoundException('Trading partner not found');

    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(Date.now() + (await this.settings.get<number>(SettingKey.TradingPartnersQuoteDefaultValidityDays)) * 24 * 60 * 60 * 1000);

    const quote = await this.prisma.$transaction(async (tx) => {
      const number = await nextQuoteNumber(tx, this.settings, this.config);
      return tx.quote.create({
        data: {
          number,
          tradingPartnerId: dto.tradingPartnerId,
          currency: BRAND.locale.currency,
          validUntil,
          lines: {
            create: dto.lines.map((line) => ({
              sku: line.sku,
              nameEn: line.nameEn,
              quantity: line.quantity,
              unitPriceMinor: line.unitPriceMinor,
            })),
          },
        },
        include: { lines: true },
      });
    });

    await this.tradingPartners.pushOutbound(dto.tradingPartnerId, 'quote.sent', {
      number: quote.number,
      currency: quote.currency,
      validUntil: quote.validUntil,
      lines: quote.lines.map((line) => ({
        sku: line.sku,
        nameEn: line.nameEn,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })),
    });

    return quote;
  }

  async findAll() {
    return this.prisma.quote.findMany({ orderBy: { createdAt: 'desc' }, include: { lines: true } });
  }

  async findOne(id: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: { lines: true } });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }
}
