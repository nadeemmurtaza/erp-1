import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import type { AuthenticatedUser } from '../../core/auth/auth.constants';
import type { PriceList } from '../../core/prisma/client';
import type { CreatePriceListDto, UpdatePriceListDto, SetPriceListAssignmentDto } from './dto/pricing.dto';

/**
 * 146-wholesale-tiered-pricing.md — "what does THIS buyer pay for THIS
 * variant in THIS context." The ONE resolution function, replacing every
 * inline `variant.priceOverride ?? product.basePrice` call site MULTI-
 * SECTOR.md's own text already names as the thing to replace. Batched by
 * design (`resolvePrices`, not one query per line item) — a cart or order
 * with N lines resolves in two queries total, never N: the exact "N+1
 * queries is a performance defect" rule this repository's own
 * `.claude/rules/performance.md` states.
 *
 * `resolvePrice()` (single-variant) exists only for the admin "preview
 * this customer's price" tool (WO-146.5) and is a thin wrapper over the
 * same batched path — never a second, divergent resolution algorithm.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolves an assigned PriceList's own quantity-break entry for each
   * requested (variantId, quantity) pair. Returns a Map covering ONLY the
   * variants that actually resolved to a wholesale price — a caller
   * missing from the map has no applicable price list and must fall
   * through to its own existing `priceOverride ?? basePrice` expression
   * unchanged, per this document's own "byte-identical when off" rule.
   */
  async resolvePrices(
    items: readonly { variantId: string; quantity: number }[],
    customerId?: string | null,
  ): Promise<Map<string, number>> {
    const resolved = new Map<string, number>();
    if (items.length === 0) return resolved;

    const priceListId = await this.resolveAssignedPriceListId(customerId);
    if (!priceListId) return resolved;

    const variantIds = [...new Set(items.map((item) => item.variantId))];
    const entries = await this.prisma.priceListEntry.findMany({
      where: { priceListId, variantId: { in: variantIds } },
      orderBy: { minQuantity: 'desc' },
    });

    // Grouped once, then the highest minQuantity <= quantity wins per line —
    // entries are already ordered desc, so the first match per variant is
    // the correct one; a minQuantity=1 row (the flat-override case) is
    // always a match, guaranteeing every listed variant resolves to
    // something once a price list is assigned at all.
    const entriesByVariant = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = entriesByVariant.get(entry.variantId) ?? [];
      list.push(entry);
      entriesByVariant.set(entry.variantId, list);
    }

    for (const item of items) {
      const candidates = entriesByVariant.get(item.variantId);
      if (!candidates) continue;
      const match = candidates.find((entry) => entry.minQuantity <= item.quantity);
      if (match) resolved.set(item.variantId, match.unitPriceMinor);
    }

    return resolved;
  }

  /** The single-item convenience wrapper — WO-146.5's own "preview price" tool. */
  async resolvePrice(variantId: string, quantity: number, customerId?: string | null): Promise<number | null> {
    const resolved = await this.resolvePrices([{ variantId, quantity }], customerId);
    return resolved.get(variantId) ?? null;
  }

  /**
   * Customer-specific assignment wins over a tag-based one — a buyer with
   * both an explicit assignment and a matching tag always gets their own
   * negotiated list, never the broader segment's.
   */
  private async resolveAssignedPriceListId(customerId?: string | null): Promise<string | null> {
    if (!customerId) return this.resolveByTag(null);

    const direct = await this.prisma.priceListAssignment.findFirst({
      where: { customerId, priceList: { isActive: true } },
      select: { priceListId: true },
    });
    if (direct) return direct.priceListId;

    return this.resolveByTag(customerId);
  }

  private async resolveByTag(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;

    const tags = await this.prisma.contactTag.findMany({ where: { contactId: customerId }, select: { tagId: true } });
    if (tags.length === 0) return null;

    const byTag = await this.prisma.priceListAssignment.findFirst({
      where: { tagId: { in: tags.map((t) => t.tagId) }, priceList: { isActive: true } },
      select: { priceListId: true },
    });
    return byTag?.priceListId ?? null;
  }

  // --- Admin CRUD (WO-146.5) ---

  async listPriceLists(): Promise<(PriceList & { entries: unknown[]; assignments: unknown[] })[]> {
    return this.prisma.priceList.findMany({
      include: { entries: { orderBy: [{ variantId: 'asc' }, { minQuantity: 'asc' }] }, assignments: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPriceList(actor: AuthenticatedUser, dto: CreatePriceListDto, hasApprovalPermission: boolean): Promise<PriceList> {
    const existing = await this.prisma.priceList.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException(`A price list with key "${dto.key}" already exists.`);

    if (!hasApprovalPermission) await this.assertEntriesNeedNoApproval(dto.entries);

    const priceList = await this.prisma.priceList.create({
      data: {
        key: dto.key,
        name: dto.name,
        entries: { create: dto.entries?.map((e) => ({ variantId: e.variantId, minQuantity: e.minQuantity ?? 1, unitPriceMinor: e.unitPriceMinor })) ?? [] },
      },
      include: { entries: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.price_list_created',
      entity: 'PriceList',
      entityId: priceList.id,
      data: { after: { key: priceList.key, name: priceList.name, entryCount: dto.entries?.length ?? 0 } },
    });

    return priceList;
  }

  /**
   * A price-list entry that meaningfully undercuts the product's own
   * `basePrice` is a real margin decision — gated one level higher than
   * ordinary management, at the controller's own `pricing.price-lists.approve`
   * permission (this document's own "threshold nobody approves alone" lens),
   * never re-checked here: the service trusts its own caller's permission
   * gate, exactly as every other service in this codebase does.
   */
  async updatePriceList(actor: AuthenticatedUser, id: string, dto: UpdatePriceListDto, hasApprovalPermission: boolean): Promise<PriceList> {
    const existing = await this.prisma.priceList.findUnique({ where: { id }, include: { entries: true } });
    if (!existing) throw new NotFoundException(`No price list with id ${id}`);

    if (!hasApprovalPermission) await this.assertEntriesNeedNoApproval(dto.entries);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.entries) {
        await tx.priceListEntry.deleteMany({ where: { priceListId: id } });
        await tx.priceListEntry.createMany({
          data: dto.entries.map((e) => ({ priceListId: id, variantId: e.variantId, minQuantity: e.minQuantity ?? 1, unitPriceMinor: e.unitPriceMinor })),
        });
      }
      return tx.priceList.update({
        where: { id },
        data: {
          name: dto.name,
          isActive: dto.isActive,
        },
        include: { entries: true },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.price_list_updated',
      entity: 'PriceList',
      entityId: id,
      data: {
        before: { name: existing.name, isActive: existing.isActive, entryCount: existing.entries.length },
        after: { name: updated.name, isActive: updated.isActive, entryCount: updated.entries.length },
      },
    });

    return updated;
  }

  async setAssignment(actor: AuthenticatedUser, priceListId: string, dto: SetPriceListAssignmentDto): Promise<void> {
    if (!dto.customerId && !dto.tagId) {
      throw new BadRequestException('An assignment needs either customerId or tagId.');
    }
    const priceList = await this.prisma.priceList.findUnique({ where: { id: priceListId } });
    if (!priceList) throw new NotFoundException(`No price list with id ${priceListId}`);

    await this.prisma.priceListAssignment.create({
      data: { priceListId, customerId: dto.customerId, tagId: dto.tagId },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.assignment_created',
      entity: 'PriceListAssignment',
      entityId: priceListId,
      data: { after: { customerId: dto.customerId ?? null, tagId: dto.tagId ?? null } },
    });
  }

  async removeAssignment(actor: AuthenticatedUser, assignmentId: string): Promise<void> {
    const assignment = await this.prisma.priceListAssignment.findUnique({ where: { id: assignmentId } });
    if (!assignment) throw new NotFoundException(`No assignment with id ${assignmentId}`);

    await this.prisma.priceListAssignment.delete({ where: { id: assignmentId } });

    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.assignment_removed',
      entity: 'PriceListAssignment',
      entityId: assignmentId,
      data: { before: { customerId: assignment.customerId, tagId: assignment.tagId } },
    });
  }

  /**
   * The "threshold nobody approves alone" enforcement point: a
   * `pricing.price-lists.manage` holder without `.approve` may create or
   * edit ordinary entries, but the moment one entry sets a unit price
   * below the variant's own `product.basePrice` — a real margin decision —
   * this refuses the whole write. Deliberately whole-request, not
   * per-entry: a caller cannot smuggle one below-cost line past an
   * otherwise-ordinary edit.
   */
  private async assertEntriesNeedNoApproval(entries: { variantId: string; unitPriceMinor: number }[] | undefined): Promise<void> {
    if (!entries || entries.length === 0) return;

    const variantIds = [...new Set(entries.map((e) => e.variantId))];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, priceOverride: true, product: { select: { basePrice: true } } },
    });
    const basePriceByVariant = new Map(variants.map((v) => [v.id, v.priceOverride ?? v.product.basePrice]));

    for (const entry of entries) {
      const basePrice = basePriceByVariant.get(entry.variantId);
      if (basePrice !== undefined && entry.unitPriceMinor < basePrice) {
        throw new ForbiddenException(
          `Setting ${entry.variantId} below its base price of ${basePrice} paisa requires the pricing.price-lists.approve permission.`,
        );
      }
    }
  }
}
