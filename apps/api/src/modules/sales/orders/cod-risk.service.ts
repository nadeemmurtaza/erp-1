import { Injectable, Logger } from '@nestjs/common';
import { computeCodRiskScore, normalizePhone, type CodRiskAction } from '@newax/shared';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { SettingKey } from '../../../core/settings/settings.defaults';
import { shopLocalHour } from '../../../core/time/shop-time';

export interface CodRiskScoreInput {
  address: { line1: string; line2?: string | null; postalCode?: string | null; phone: string; city: string };
  /** paisa, the order's grandTotal. */
  orderValue: number;
  userId: string | null;
  placedAt: Date;
}

export interface CodRiskScoreResult {
  score: number;
  action: CodRiskAction;
  reasonEn: string;
}

/**
 * WO-9.4 (09-ai-layer.md) — gathers every input `computeCodRiskScore` (the
 * pure rule) needs and calls it. Reads Contact directly by phone rather than
 * through Order.contactId: CrmOrderSubscriber links contactId asynchronously
 * off the outbox, so at place() time it is still null — a phone lookup gives
 * exactly this customer's history BEFORE this order, which is the correct
 * base for a risk signal anyway.
 *
 * Never throws. A COD order's checkout must never fail because a risk signal
 * couldn't be computed — a null result here means place() stores no score at
 * all, same as it already does for a non-COD order.
 */
@Injectable()
export class CodRiskService {
  private readonly logger = new Logger(CodRiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async score(input: CodRiskScoreInput): Promise<CodRiskScoreResult | null> {
    try {
      const phone = normalizePhone(input.address.phone).e164;

      const [contact, cityStats, timeZone, minCityOrders, confirmationCall, advancePayment] = await Promise.all([
        phone
          ? this.prisma.contact.findUnique({ where: { phoneE164: phone }, select: { orderCount: true, rtoCount: true } })
          : null,
        this.prisma.cityCodRiskStat.findUnique({ where: { city: input.address.city } }),
        this.settings.get<string>(SettingKey.StoreTimezone),
        this.settings.get<number>(SettingKey.CodRiskMinCityOrders),
        this.settings.get<number>(SettingKey.CodRiskConfirmationCallThreshold),
        this.settings.get<number>(SettingKey.CodRiskAdvancePaymentThreshold),
      ]);

      const trustedCityStats =
        cityStats && cityStats.totalShipments >= minCityOrders
          ? {
              rtoRatePercent: (cityStats.rtoShipments / cityStats.totalShipments) * 100,
              avgOrderValue: cityStats.avgOrderValue,
            }
          : null;

      return computeCodRiskScore({
        address: {
          line1: input.address.line1,
          line2: input.address.line2 ?? null,
          postalCode: input.address.postalCode ?? null,
          phone: input.address.phone,
        },
        orderValue: input.orderValue,
        hasAccount: input.userId !== null,
        localHour: shopLocalHour(input.placedAt, timeZone),
        cityStats: trustedCityStats,
        customerHistory: contact && contact.orderCount > 0 ? { orderCount: contact.orderCount, rtoCount: contact.rtoCount } : null,
        thresholds: { confirmationCall, advancePayment },
      });
    } catch (error) {
      this.logger.warn(`COD risk scoring failed — placing the order without a score: ${error}`);
      return null;
    }
  }
}
