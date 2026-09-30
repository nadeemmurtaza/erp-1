import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { DomainEvent, type SupplierDigestReadyPayload } from '../../../core/events/domain-events';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { TradingPartnersService } from './trading-partners.service';

/**
 * The "back" direction: SupplyChainDigestCron's own nightly stock/velocity
 * computation, delivered to a connected SUPPLIER's own system as a
 * structured push — the same content its email digest already carries,
 * for a supplier whose system can act on JSON rather than a person reading
 * a mailbox. A supplier with no linked, ACTIVE TradingPartner (the common
 * case today) costs nothing here — the lookup below just finds none.
 */
@Injectable()
export class SupplierDigestListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tradingPartners: TradingPartnersService,
  ) {}

  @OnDomainEvent(DomainEvent.SupplierDigestReady)
  async onSupplierDigestReady(payload: SupplierDigestReadyPayload): Promise<void> {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: payload.supplierId },
      select: { tradingPartnerId: true },
    });
    if (!supplier?.tradingPartnerId) return;

    await this.tradingPartners.pushOutbound(supplier.tradingPartnerId, 'supplier.stock_digest', {
      items: payload.items,
    });
  }
}
