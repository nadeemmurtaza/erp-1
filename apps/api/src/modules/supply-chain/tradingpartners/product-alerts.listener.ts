import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import {
  DomainEvent,
  type ProductPriceChangedPayload,
  type ProductPublishedPayload,
} from '../../../core/events/domain-events';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';

/**
 * The "forth" direction: a new product going live, or a price changing,
 * pushed to every connected CUSTOMER (or BOTH) partner — a distributor or
 * retailer downstream finding out from us directly rather than re-scraping
 * the storefront. Never a SUPPLIER-kind partner: they sell to us, this news
 * is not theirs. Payloads carry only what ProductAdminService already
 * published — sku/name/price, never a cost price or margin.
 */
@Injectable()
export class ProductAlertsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradingPartners: TradingPartnersService,
  ) {}

  @OnDomainEvent(DomainEvent.ProductPublished)
  async onProductPublished(payload: ProductPublishedPayload): Promise<void> {
    await this.broadcast('product.new', { ...payload });
  }

  @OnDomainEvent(DomainEvent.ProductPriceChanged)
  async onProductPriceChanged(payload: ProductPriceChangedPayload): Promise<void> {
    await this.broadcast('product.price_changed', { ...payload });
  }

  private async broadcast(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const partners = await this.prisma.tradingPartner.findMany({
      where: { status: 'ACTIVE', kind: { in: ['CUSTOMER', 'BOTH'] }, outboundBaseUrl: { not: null } },
      select: { id: true },
    });
    await Promise.all(partners.map((partner) => this.tradingPartners.pushOutbound(partner.id, eventType, payload)));
  }
}
