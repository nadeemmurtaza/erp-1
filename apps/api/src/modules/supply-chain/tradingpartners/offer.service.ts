import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';
import { CreateOfferDto } from './dto/offer.dto';

/**
 * The "forth" direction's marketing push (WO-18.3) — the same broadcast
 * shape as `ProductAlertsListener`, fanned out to every ACTIVE CUSTOMER/BOTH
 * partner, except there is no upstream event to listen for: an Offer is
 * created directly by staff, here, so this calls `pushOutbound` itself
 * rather than publishing a domain event nothing else needs to react to.
 */
@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradingPartners: TradingPartnersService,
  ) {}

  async publish(dto: CreateOfferDto) {
    const offer = await this.prisma.offer.create({
      data: {
        title: dto.title,
        description: dto.description,
        discountLabel: dto.discountLabel,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });

    const partners = await this.prisma.tradingPartner.findMany({
      where: { status: 'ACTIVE', kind: { in: ['CUSTOMER', 'BOTH'] }, outboundBaseUrl: { not: null } },
      select: { id: true },
    });
    await Promise.all(
      partners.map((partner) =>
        this.tradingPartners.pushOutbound(partner.id, 'offer.published', {
          title: offer.title,
          description: offer.description,
          discountLabel: offer.discountLabel,
          validFrom: offer.validFrom,
          validUntil: offer.validUntil,
        }),
      ),
    );

    return offer;
  }

  async findAll() {
    return this.prisma.offer.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
