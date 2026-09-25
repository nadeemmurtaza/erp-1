import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type ProductReorderPointReachedPayload } from '../../core/events/domain-events';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import { PrismaService } from '../../core/prisma/prisma.service';
import { suggestReorderQuantity } from '@newax/shared';
import { PurchasingService } from './purchasing.service';

/**
 * Turns a real-time reorder-point crossing into an immediate DRAFT PO line,
 * for variants sourced from an external supplier. The mirror case —
 * producedInHouse variants — is handled by production's own
 * reorder-work-order.listener.ts; the two never fire for the same variant.
 *
 * WO-9.3 (09-ai-layer.md): a static reorderQuantity always wins outright;
 * only when it's unset does this reach for VariantForecast — populated
 * nightly by InventoryCron, so a variant that has never seen that pass yet
 * (brand new, or crossing its point before the first nightly run) simply
 * falls back to the old reorderPoint-minus-stock guess, same as before this
 * feature existed.
 */
@Injectable()
export class PurchasingReorderListener {
  private readonly logger = new Logger(PurchasingReorderListener.name);

  constructor(
    private readonly purchasing: PurchasingService,
    private readonly settings: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnDomainEvent(DomainEvent.ProductReorderPointReached)
  async onReorderPointReached(payload: ProductReorderPointReachedPayload): Promise<void> {
    if (payload.producedInHouse) return;
    if (!payload.preferredSupplierId) return;

    const autoDraft = await this.settings.get<boolean>(SettingKey.PurchasingAutoDraftReorder);
    if (!autoDraft) return;

    const [variant, forecast] = await Promise.all([
      this.prisma.productVariant.findUnique({ where: { id: payload.variantId }, select: { costPrice: true } }),
      this.prisma.variantForecast.findUnique({ where: { variantId: payload.variantId } }),
    ]);

    let quantity = payload.reorderQuantity ?? 0;
    let note: string | undefined;

    if (!payload.reorderQuantity && forecast) {
      const leadTimeDays = await this.resolveLeadTimeDays(payload.preferredSupplierId, payload.variantId);
      if (leadTimeDays !== null) {
        const safetyStockDays = await this.settings.get<number>(SettingKey.DemandForecastSafetyStockDays);
        quantity = suggestReorderQuantity(forecast.forecastedDailyDemand, leadTimeDays, safetyStockDays);
        note = forecast.reasonEn ?? undefined;
      }
    }

    if (!quantity) quantity = payload.reorderPoint - payload.stock;
    if (quantity < 1) quantity = 1;

    await this.purchasing.upsertReorderDraftLine({
      supplierId: payload.preferredSupplierId,
      variantId: payload.variantId,
      quantity,
      unitCost: variant?.costPrice ?? 0,
      note,
    });

    this.logger.log(`Real-time reorder: drafted PO line for ${payload.sku} (qty ${quantity})`);
  }

  private async resolveLeadTimeDays(supplierId: string, variantId: string): Promise<number | null> {
    const supplierProduct = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_variantId: { supplierId, variantId } },
      select: { leadTimeDays: true },
    });
    if (supplierProduct?.leadTimeDays != null) return supplierProduct.leadTimeDays;

    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId }, select: { leadTimeDays: true } });
    return supplier?.leadTimeDays ?? null;
  }
}
