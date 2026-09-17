import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../core/settings/document-number';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PurchaseOrderStatus } from '../../core/prisma/client';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto, AddSupplierProductDto } from './dto/supplier.dto';
import { CreatePurchaseOrderDto, ReceiveGoodsDto } from './dto/purchase-order.dto';
import { InventoryService } from '../inventory/inventory.service';
import { SettingsService } from '../../core/settings/settings.service';
import { Prisma } from '../../core/prisma/client';
import { allocateLandedCost, weightedAverageCost } from '@newax/shared';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';

const PO_NUMBER_LOCK_NAMESPACE = 8_241_120;
const GRN_NUMBER_LOCK_NAMESPACE = 8_241_121;

async function nextPONumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  // The prefix is a Setting, so a shop can match paperwork it already
  // numbers its own way. See core/settings/document-prefix.ts.
  const prefix = await documentPrefix(settings, 'purchaseOrder');
  // Scanning by this node's own prefix — see document-number.ts — keeps the
  // MAX scan correct once a chain deployment's numbers carry a node id: a
  // branch's scan still only ever sees its own node's rows. The sequence is
  // always the LAST '-'-separated field (split_part's negative n counts
  // from the end), which stays true whether or not NODE_ID itself contains
  // a hyphen (RETAIL-ERP.md's own example, "lhr-01", does).
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PO_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "PurchaseOrder"
    WHERE "number" LIKE ${`${like}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return documentNumber(config, prefix, year, nextSequence);
}

async function nextGRNNumber(
  tx: Prisma.TransactionClient,
  settings: SettingsService,
  config: AppConfigService,
): Promise<string> {
  const year = new Date().getFullYear();
  // The prefix is a Setting, so a shop can match paperwork it already
  // numbers its own way. See core/settings/document-prefix.ts.
  const prefix = await documentPrefix(settings, 'goodsReceipt');
  const like = documentNumberPrefix(config, prefix, year);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GRN_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("number", '-', -1) AS INTEGER)) AS max
    FROM "GoodsReceipt"
    WHERE "number" LIKE ${`${like}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return documentNumber(config, prefix, year, nextSequence);
}

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly settingsService: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
  ) {}

  async findAll() {
    return this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findAllPurchaseOrders(status?: string) {
    return this.prisma.purchaseOrder.findMany({
      where: status ? { status: status as PurchaseOrderStatus } : undefined,
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOnePurchaseOrder(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, email: true, phone: true } },
        items: {
          include: {
            variant: {
              include: {
                product: { include: { translations: { where: { locale: 'en' }, take: 1 } } },
              },
            },
          },
        },
        receipts: {
          include: {
            receivedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        bills: true,
      },
    });
    if (!po) throw new NotFoundException(`PurchaseOrder ${id} not found`);
    return po;
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          include: { variant: true }
        }
      }
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.delete({ where: { id } });
  }

  async getProducts(supplierId: string) {
    return this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: { variant: true }
    });
  }

  async addProduct(supplierId: string, dto: AddSupplierProductDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant) throw new NotFoundException('Variant not found');

    const supplierProduct = await this.prisma.supplierProduct.upsert({
      where: { supplierId_variantId: { supplierId, variantId: dto.variantId } },
      update: {
        supplierSku: dto.supplierSku,
        lastCost: dto.lastCost,
        moq: dto.moq,
        leadTimeDays: dto.leadTimeDays,
        isPreferred: dto.isPreferred,
      },
      create: {
        supplierId,
        variantId: dto.variantId,
        supplierSku: dto.supplierSku,
        lastCost: dto.lastCost ?? 0,
        moq: dto.moq ?? 1,
        leadTimeDays: dto.leadTimeDays,
        isPreferred: dto.isPreferred ?? false,
      },
    });

    if (dto.isPreferred) {
      await this.prisma.productVariant.update({
        where: { id: dto.variantId },
        data: { preferredSupplierId: supplierId },
      });
      await this.prisma.supplierProduct.updateMany({
        where: { variantId: dto.variantId, supplierId: { not: supplierId } },
        data: { isPreferred: false },
      });
    }

    return supplierProduct;
  }

  async removeProduct(supplierId: string, variantId: string) {
    const supplierProduct = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_variantId: { supplierId, variantId } },
    });
    if (!supplierProduct) return { deleted: false };

    await this.prisma.supplierProduct.delete({
      where: { id: supplierProduct.id },
    });

    if (supplierProduct.isPreferred) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { preferredSupplierId: null },
      });
    }

    return { deleted: true };
  }

  async createPurchaseOrder(dto: CreatePurchaseOrderDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const number = await nextPONumber(tx, this.settingsService, this.config);
      const subtotal = dto.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0);
      const freightCost = dto.freightCost ?? 0;
      const dutyCost = dto.dutyCost ?? 0;
      const otherCost = dto.otherCost ?? 0;
      const total = subtotal + freightCost + dutyCost + otherCost;

      return tx.purchaseOrder.create({
        data: {
          number,
          supplierId: dto.supplierId,
          status: 'DRAFT',
          subtotal,
          freightCost,
          dutyCost,
          otherCost,
          total,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null,
          notes: dto.notes,
          createdById: userId,
          items: {
            create: dto.items.map(item => ({
              variantId: item.variantId,
              quantityOrdered: item.quantityOrdered,
              unitCost: item.unitCost,
              lineTotal: item.quantityOrdered * item.unitCost,
              note: item.note,
            })),
          },
        },
      });
    });
  }

  async markPurchaseOrderSent(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException('PO not found');
    if (po.status !== 'DRAFT') throw new BadRequestException('PO must be in DRAFT status to be marked as sent');

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    });
  }

  async receiveGoods(poId: string, dto: ReceiveGoodsDto, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: true },
      });

      if (!po) throw new NotFoundException('PO not found');
      if (po.status !== 'SENT' && po.status !== 'PARTIAL') {
        throw new BadRequestException(`Cannot receive against PO in ${po.status} status`);
      }

      const toleranceRaw = await this.settingsService.get('purchasing.over_receipt_tolerance');
      const tolerance = (toleranceRaw as number) || 0;

      const itemsToReceive = dto.items.map(reqItem => {
        const poLine = po.items.find(i => i.id === reqItem.purchaseOrderItemId);
        if (!poLine) throw new BadRequestException(`PO Line ${reqItem.purchaseOrderItemId} not found in this PO`);
        if (reqItem.quantity <= 0) throw new BadRequestException('Quantity must be greater than 0');

        const newReceived = poLine.quantityReceived + reqItem.quantity;
        const maxAllowed = poLine.quantityOrdered * (1 + tolerance);

        if (newReceived > maxAllowed) {
          throw new BadRequestException(`Over-receipt tolerance exceeded for variant ${poLine.variantId}`);
        }
        return { reqItem, poLine };
      });

      const grnNumber = await nextGRNNumber(tx, this.settingsService, this.config);
      const freightCost = dto.freightCost ?? 0;
      const dutyCost = dto.dutyCost ?? 0;
      const otherCost = dto.otherCost ?? 0;
      const extraCost = freightCost + dutyCost + otherCost;

      const linesInput = itemsToReceive.map(i => ({
        quantity: i.reqItem.quantity,
        unitCost: i.poLine.unitCost,
      }));
      const extraShares = allocateLandedCost(linesInput, extraCost);

      const receiptItemsData = itemsToReceive.map((i, index) => {
        const sharePerUnit = extraShares[index] / i.reqItem.quantity;
        const landedUnitCost = i.poLine.unitCost + Math.round(sharePerUnit);
        return {
          purchaseOrderItemId: i.poLine.id,
          variantId: i.poLine.variantId,
          quantity: i.reqItem.quantity,
          unitCost: i.poLine.unitCost,
          landedUnitCost,
        };
      });

      const receipt = await tx.goodsReceipt.create({
        data: {
          number: grnNumber,
          purchaseOrderId: poId,
          receivedById: userId,
          notes: dto.notes,
          freightCost,
          dutyCost,
          otherCost,
          items: {
            create: receiptItemsData,
          },
        },
      });

      const sortedItems = [...receiptItemsData].sort((a, b) => a.variantId.localeCompare(b.variantId));
      const locationId = await this.inventoryService.defaultLocationId(tx);

      const movements = await this.inventoryService.moveMany(
        sortedItems.map(item => ({
          variantId: item.variantId,
          locationId,
          delta: item.quantity,
          reason: 'PURCHASE_RECEIPT',
          refType: 'GoodsReceipt',
          refId: receipt.id,
          // What we actually paid per unit, freight and duty included. This is
          // what the stock valuation report reconciles against.
          unitCost: item.landedUnitCost,
          actorId: userId,
        })),
        tx,
      );

      for (const item of receiptItemsData) {
        const movement = movements.find(m => m.variantId === item.variantId);
        if (!movement) throw new Error('Missing movement');
        const stockBefore = movement.resultingStock - item.quantity;
        
        const variant = await tx.productVariant.findUnique({ where: { id: item.variantId } });
        if (!variant) throw new Error('Missing variant');

        const newCost = weightedAverageCost(stockBefore, variant.costPrice, item.quantity, item.landedUnitCost);

        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            costPrice: newCost,
            lastReceivedAt: new Date(),
          },
        });
      }

      for (const item of receiptItemsData) {
        await tx.purchaseOrderItem.update({
          where: { id: item.purchaseOrderItemId },
          data: {
            quantityReceived: { increment: item.quantity },
          },
        });
      }

      const updatedPoItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poId },
      });
      const allReceived = updatedPoItems.every(i => i.quantityReceived >= i.quantityOrdered);
      const newStatus = allReceived ? 'RECEIVED' : 'PARTIAL';

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: newStatus,
          ...(newStatus === 'RECEIVED' ? { receivedAt: new Date() } : {}),
        },
      });

      await this.events.publish(
        DomainEvent.GoodsReceived,
        {
          goodsReceiptId: receipt.id,
          number: receipt.number,
          purchaseOrderId: poId,
          supplierId: po.supplierId,
        },
        tx,
      );

      return receipt;
    });
  }
}
