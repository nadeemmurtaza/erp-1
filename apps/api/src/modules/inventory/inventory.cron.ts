import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';

@Injectable()
export class InventoryCron {
  private readonly logger = new Logger(InventoryCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Cron('0 2 * * *')
  async computeNightlyStats() {
    this.logger.log('Starting nightly inventory computation');

    const slowMoverDays = await this.settings.get<number>(SettingKey.InventorySlowMoverDays);
    const deadStockDays = await this.settings.get<number>(SettingKey.InventoryDeadStockDays);
    const autoDraft = await this.settings.get<boolean>(SettingKey.PurchasingAutoDraftReorder);

    const variants = await this.prisma.productVariant.findMany({
      where: { isActive: true },
      select: { 
        id: true, 
        stock: true, 
        reorderPoint: true, 
        reorderQuantity: true, 
        preferredSupplierId: true,
        createdAt: true 
      }
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // To group PO drafts by supplier
    const draftsToUpdate = new Map<string, { variantId: string; qty: number; unitCost: number }[]>();

    for (const variant of variants) {
      // 1. Compute sales stats
      const sales = await this.prisma.stockMovement.findMany({
        where: {
          variantId: variant.id,
          reason: 'SALE',
        },
        select: { delta: true, createdAt: true }
      });

      let units30 = 0;
      let units90 = 0;
      let lastSoldAt: Date | null = null;

      for (const sale of sales) {
        const qty = -sale.delta;
        if (sale.createdAt >= ninetyDaysAgo) {
          units90 += qty;
        }
        if (sale.createdAt >= thirtyDaysAgo) {
          units30 += qty;
        }
        if (!lastSoldAt || sale.createdAt > lastSoldAt) {
          lastSoldAt = sale.createdAt;
        }
      }

      const velocityPerDay = units30 / 30;
      const daysOfCover = velocityPerDay > 0 ? variant.stock / velocityPerDay : null;

      const lastReceipt = await this.prisma.stockMovement.findFirst({
        where: { variantId: variant.id, reason: 'PURCHASE_RECEIPT' },
        orderBy: { createdAt: 'desc' }
      });
      
      const ageDays = lastReceipt 
        ? Math.floor((now.getTime() - lastReceipt.createdAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;

      const daysSinceLastSale = lastSoldAt 
        ? Math.floor((now.getTime() - lastSoldAt.getTime()) / (24 * 60 * 60 * 1000))
        : (ageDays ?? 0);

      let isSlowMover = false;
      let isDeadStock = false;

      if (variant.stock > 0) {
        if (daysSinceLastSale >= deadStockDays) {
          isDeadStock = true;
        } else if (daysSinceLastSale >= slowMoverDays) {
          isSlowMover = true;
        }
      }

      await this.prisma.variantSalesStat.upsert({
        where: { variantId: variant.id },
        create: {
          variantId: variant.id,
          units30,
          units90,
          lastSoldAt,
          daysOfCover,
          ageDays,
          isSlowMover,
          isDeadStock,
          computedAt: now
        },
        update: {
          units30,
          units90,
          lastSoldAt,
          daysOfCover,
          ageDays,
          isSlowMover,
          isDeadStock,
          computedAt: now
        }
      });

      // 2. Draft reorder POs
      if (autoDraft && variant.reorderPoint !== null && variant.stock <= variant.reorderPoint && variant.preferredSupplierId) {
        let qty = variant.reorderQuantity || (variant.reorderPoint - variant.stock);
        if (qty < 1) qty = 1;

        // Get last unit cost (costPrice)
        const vFull = await this.prisma.productVariant.findUnique({
          where: { id: variant.id },
          select: { costPrice: true }
        });

        const drafts = draftsToUpdate.get(variant.preferredSupplierId) || [];
        drafts.push({ variantId: variant.id, qty, unitCost: vFull?.costPrice || 0 });
        draftsToUpdate.set(variant.preferredSupplierId, drafts);
      }
    }

    // 3. Upsert DRAFT POs for suppliers
    for (const [supplierId, lines] of draftsToUpdate.entries()) {
      let po = await this.prisma.purchaseOrder.findFirst({
        where: { supplierId, status: 'DRAFT' },
        include: { items: true }
      });

      if (!po) {
        const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
        const count = await this.prisma.purchaseOrder.count({ where: { supplierId } });
        const number = `${supplier?.name.substring(0, 3).toUpperCase() || 'PO'}-${String(count + 1).padStart(4, '0')}`;

        po = await this.prisma.purchaseOrder.create({
          data: {
            supplierId,
            number,
            status: 'DRAFT',
            currency: 'PKR',
          },
          include: { items: true }
        });
      }

      for (const line of lines) {
        const existingLine = po.items.find((i) => i.variantId === line.variantId);
        if (existingLine) {
          if (existingLine.quantityOrdered < line.qty) {
             await this.prisma.purchaseOrderItem.update({
               where: { id: existingLine.id },
               data: { 
                 quantityOrdered: line.qty,
                 lineTotal: line.qty * existingLine.unitCost 
               }
             });
          }
        } else {
          await this.prisma.purchaseOrderItem.create({
            data: {
              purchaseOrderId: po.id,
              variantId: line.variantId,
              quantityOrdered: line.qty,
              unitCost: line.unitCost,
              lineTotal: line.qty * line.unitCost
            }
          });
        }
      }

      // Update PO subtotal/total
      const updatedItems = await this.prisma.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id }
      });
      const subtotal = updatedItems.reduce((acc, i) => acc + i.lineTotal, 0);
      await this.prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { subtotal, total: subtotal }
      });
    }

    this.logger.log('Nightly inventory computation complete');
  }
}
