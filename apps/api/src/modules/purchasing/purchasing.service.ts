import { documentPrefix } from '../../core/settings/document-prefix';
import { documentNumber, documentNumberPrefix } from '../../core/settings/document-number';
import { AppConfigService } from '../../core/config/app-config.service';
import type { PurchaseOrderStatus } from '../../core/prisma/client';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto, AddSupplierProductDto } from './dto/supplier.dto';
import { CreatePurchaseOrderDto, ReceiveGoodsDto } from './dto/purchase-order.dto';
import { CreateSupplierBillDto, RecordSupplierBillPaymentDto } from './dto/supplier-bill.dto';
import { InventoryService } from '../inventory/inventory.service';
import { PartiesService } from '../parties/parties.service';
import { SettingsService } from '../../core/settings/settings.service';
import { Prisma } from '../../core/prisma/client';
import { allocateLandedCost, weightedAverageCost, convertToBase, BRAND } from '@newax/shared';
import { DomainEvent } from '../../core/events/domain-events';
import { EventBusService } from '../../core/events/event-bus.service';
import { BranchPolicyRegistry } from '../../core/extension-points/branch-policy.registry';

const PO_NUMBER_LOCK_NAMESPACE = 8_241_120;
const GRN_NUMBER_LOCK_NAMESPACE = 8_241_121;
const DRAFT_PO_LOCK_NAMESPACE = 8_241_122;

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
    private readonly parties: PartiesService,
    private readonly settingsService: SettingsService,
    private readonly config: AppConfigService,
    private readonly events: EventBusService,
    private readonly branchPolicy: BranchPolicyRegistry,
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
        },
        // TradingPartner is owned by the tradingpartners module, but both
        // it and purchasing are 'core' pack (module-packs.ts) — a core<->core
        // relation is allowed, unlike a relation into a sector pack would be.
        tradingPartner: { select: { id: true, name: true, status: true } },
      }
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  /**
   * Creates the Supplier and its backing Party in one transaction — a
   * Supplier must never exist without the permanent counterparty profile it
   * is the SUPPLIER-role extension of (parties.prisma). Dedupes on
   * phone/taxId: creating a supplier for a business already known under
   * another role (or a prior Supplier with the same phone) links the
   * existing Party rather than creating a second profile for the same
   * real business.
   */
  async create(dto: CreateSupplierDto) {
    return this.prisma.$transaction(async (tx) => {
      const party = await this.parties.findOrCreateForRole(
        {
          name: dto.name,
          contactName: dto.contactName,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          city: dto.city,
        },
        'SUPPLIER',
        tx,
      );
      return tx.supplier.create({ data: { ...dto, partyId: party.id } });
    });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const deleted = await this.prisma.supplier.delete({ where: { id } });
    // 140-general-eav-extensibility-model.md (WO-140.3) — EntityAttribute rows
    // are not a real foreign key to Supplier, so nothing cascades them.
    // Published as an event, never a direct cross-module call, so purchasing
    // stays independent of entity-attributes (check-module-boundaries.mjs);
    // EntityAttributeSupplierDeletedListener does the actual cleanup.
    await this.events.publish(DomainEvent.SupplierDeleted, { supplierId: id });
    return deleted;
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

  /**
   * `tx` lets a caller that already opened its own transaction (e.g.
   * RequisitionService.convertToPurchaseOrder(), which must create this PO
   * and claim the requisition atomically — "the second copy of the write"
   * lens) compose into it instead of opening a second, unrelated one.
   * Without one, this method opens its own, exactly as before.
   */
  async createPurchaseOrder(dto: CreatePurchaseOrderDto, userId: string, tx?: Prisma.TransactionClient) {
    const scopeLevel = dto.scopeLevel ?? 'BRAND';
    if (scopeLevel === 'BRANCH' && !(await this.branchPolicy.allowsBranchLocalPurchasing(userId))) {
      throw new ForbiddenException(
        "This brand does not allow branch-local purchasing — ask a brand admin to turn it on, or create this purchase order at BRAND scope instead.",
      );
    }

    const run = async (t: Prisma.TransactionClient) => {
      const number = await nextPONumber(t, this.settingsService, this.config);
      const subtotal = dto.items.reduce((sum, item) => sum + (item.quantityOrdered * item.unitCost), 0);
      const freightCost = dto.freightCost ?? 0;
      const dutyCost = dto.dutyCost ?? 0;
      const otherCost = dto.otherCost ?? 0;
      const total = subtotal + freightCost + dutyCost + otherCost;

      return t.purchaseOrder.create({
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
          scopeLevel,
          originNodeId: this.config.nodeId,
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
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
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

      const locationId = dto.locationId || (await this.inventoryService.defaultLocationId(tx));

      const receipt = await tx.goodsReceipt.create({
        data: {
          number: grnNumber,
          purchaseOrderId: poId,
          receivedById: userId,
          notes: dto.notes,
          freightCost,
          dutyCost,
          otherCost,
          locationId,
          items: {
            create: receiptItemsData,
          },
        },
      });

      const sortedItems = [...receiptItemsData].sort((a, b) => a.variantId.localeCompare(b.variantId));

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
          scopeLevel: po.scopeLevel,
          originNodeId: po.originNodeId,
          receivedAtIso: receipt.receivedAt.toISOString(),
        },
        tx,
      );

      return receipt;
    });
  }

  /**
   * Adds (or tops up) one reorder line on a supplier's open DRAFT PO,
   * creating that PO if none exists. Called from two places that must stay
   * behaviourally identical: the real-time reorder.listener.ts (fires the
   * moment a variant crosses reorderPoint) and purchasing.cron.ts (the
   * nightly safety-net sweep for anything the real-time path missed, e.g. a
   * bulk stock import that bypasses InventoryService.move()).
   */
  async upsertReorderDraftLine(input: {
    supplierId: string;
    variantId: string;
    quantity: number;
    unitCost: number;
    /** WO-9.3 (09-ai-layer.md) — VariantForecast.reasonEn, when the quantity was demand-forecast-driven and there's a notable seasonal signal worth a buyer's attention. Never overwrites an existing line's note with nothing. */
    note?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Serializes concurrent callers for the SAME supplier — otherwise two
      // near-simultaneous low-stock events (or a real-time event racing the
      // nightly sweep) could each see "no DRAFT PO yet" and create two.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_PO_LOCK_NAMESPACE}::int, hashtext(${input.supplierId})::int)`;

      let po = await tx.purchaseOrder.findFirst({
        where: { supplierId: input.supplierId, status: 'DRAFT' },
        include: { items: true },
      });

      if (!po) {
        const number = await nextPONumber(tx, this.settingsService, this.config);
        po = await tx.purchaseOrder.create({
          data: {
            supplierId: input.supplierId,
            number,
            status: 'DRAFT',
            currency: BRAND.locale.currency,
            originNodeId: this.config.nodeId,
          },
          include: { items: true },
        });
      }

      const existingLine = po.items.find((i) => i.variantId === input.variantId);
      if (existingLine) {
        if (existingLine.quantityOrdered < input.quantity) {
          await tx.purchaseOrderItem.update({
            where: { id: existingLine.id },
            data: {
              quantityOrdered: input.quantity,
              lineTotal: input.quantity * existingLine.unitCost,
              note: input.note ?? existingLine.note,
            },
          });
        }
      } else {
        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            variantId: input.variantId,
            quantityOrdered: input.quantity,
            unitCost: input.unitCost,
            lineTotal: input.quantity * input.unitCost,
            note: input.note,
          },
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
      const subtotal = updatedItems.reduce((acc, i) => acc + i.lineTotal, 0);
      await tx.purchaseOrder.update({ where: { id: po.id }, data: { subtotal, total: subtotal } });
    });
  }

  async findAllSupplierBills(supplierId?: string) {
    return this.prisma.supplierBill.findMany({
      where: supplierId ? { supplierId } : undefined,
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOneSupplierBill(id: string) {
    const bill = await this.prisma.supplierBill.findUnique({
      where: { id },
      include: { supplier: { select: { id: true, name: true, currency: true } } },
    });
    if (!bill) throw new NotFoundException('Supplier bill not found');
    return bill;
  }

  /**
   * Raises a bill against a supplier — a demand for payment distinct from
   * the goods receipt it may relate to (R18). `fxRateScaled` is the booked
   * rate for a foreign-currency bill (R16): snapshotted here and never
   * re-derived (House Rule 7), so a later FX rate move shows up as a
   * realised gain/loss at payment time, not a silent rewrite of this bill.
   */
  async createSupplierBill(dto: CreateSupplierBillDto) {
    return this.prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      if (dto.purchaseOrderId) {
        const po = await tx.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });
        if (!po) throw new NotFoundException('Purchase order not found');
        if (po.supplierId !== dto.supplierId) {
          throw new BadRequestException('That purchase order belongs to a different supplier.');
        }
      }

      const currency = dto.currency ?? supplier.currency;
      const isBase = currency === BRAND.locale.currency;
      if (!isBase && !dto.fxRateScaled) {
        throw new BadRequestException(
          `fxRateScaled is required to raise a bill in ${currency} (not the base currency, ${BRAND.locale.currency}).`,
        );
      }
      const fxRateScaled = isBase ? 1_000_000 : dto.fxRateScaled!;
      const baseAmountMinor = convertToBase(dto.amount, fxRateScaled);

      const bill = await tx.supplierBill.create({
        data: {
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          reference: dto.reference,
          amount: dto.amount,
          currency,
          fxRateScaled,
          baseAmountMinor,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          notes: dto.notes,
        },
      });

      await this.events.publish(
        DomainEvent.SupplierBillRaised,
        {
          billId: bill.id,
          supplierId: bill.supplierId,
          purchaseOrderId: bill.purchaseOrderId,
          amountMinor: bill.amount,
          currency: bill.currency,
          fxRateScaled: bill.fxRateScaled,
          baseAmountMinor: bill.baseAmountMinor,
          issuedAt: bill.issuedAt.toISOString(),
        },
        tx,
      );

      return bill;
    });
  }

  /**
   * Records a payment against a bill, in the bill's own currency. For a
   * foreign-currency bill, `settlementFxRateScaled` is the rate actually
   * used to buy the currency today — the posting rule
   * (posting-rules.subscriber.ts) compares it against the bill's own booked
   * rate to post the realised FX gain/loss (R16); this method never
   * computes that difference itself, matching accounting's "couples to
   * nothing" boundary (R15).
   */
  async recordSupplierBillPayment(billId: string, dto: RecordSupplierBillPaymentDto) {
    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.supplierBill.findUnique({ where: { id: billId } });
      if (!bill) throw new NotFoundException('Supplier bill not found');
      if (bill.status === 'PAID') {
        throw new BadRequestException('This bill is already fully paid.');
      }

      const outstanding = bill.amount - bill.amountPaid;
      if (dto.amountMinor > outstanding) {
        throw new BadRequestException(
          `Payment of ${dto.amountMinor} exceeds the outstanding balance of ${outstanding}.`,
        );
      }

      const isBase = bill.currency === BRAND.locale.currency;
      if (!isBase && !dto.fxRateScaled) {
        throw new BadRequestException(
          `fxRateScaled is required to record a payment against a bill in ${bill.currency}.`,
        );
      }
      const settlementFxRateScaled = isBase ? 1_000_000 : dto.fxRateScaled!;

      const amountPaid = bill.amountPaid + dto.amountMinor;
      const status = amountPaid >= bill.amount ? 'PAID' : 'PARTIAL';
      const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

      const updated = await tx.supplierBill.update({
        where: { id: billId },
        data: {
          amountPaid,
          status,
          ...(status === 'PAID' ? { paidAt } : {}),
        },
      });

      await this.events.publish(
        DomainEvent.SupplierBillPaid,
        {
          billId: bill.id,
          supplierId: bill.supplierId,
          amountMinor: dto.amountMinor,
          currency: bill.currency,
          billFxRateScaled: bill.fxRateScaled,
          settlementFxRateScaled,
          paidAt: paidAt.toISOString(),
        },
        tx,
      );

      return updated;
    });
  }
}
