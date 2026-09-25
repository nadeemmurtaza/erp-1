import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { MarkdownSuggestionStatus, Prisma } from '../../core/prisma/client';

const suggestionInclude = {
  variant: {
    select: {
      id: true,
      sku: true,
      size: true,
      color: true,
      stock: true,
      product: { select: { id: true, slug: true, translations: { where: { locale: 'en' }, take: 1 } } },
    },
  },
} satisfies Prisma.MarkdownSuggestionInclude;

/**
 * WO-9.8 (09-ai-layer.md) — the review queue MarkdownSuggestionsCron (via
 * InventoryCron's own nightly pass) fills. Every suggestion is a PENDING
 * draft, same rule as WO-9.1's AiSuggestionsService: nothing here ever
 * touches a live Discount on its own.
 *
 * activate() creates the Discount at PRODUCT scope, not per-variant — the
 * promotions engine (Discount.productIds) has no variant-level scope today.
 * A markdown suggestion is computed per-SKU (one size can be ageing while
 * others of the same product sell fine), so activating one marks the whole
 * product down; the admin screen says so plainly rather than implying a
 * precision the engine cannot deliver.
 *
 * Not routed through PromotionsService — this is not the same-transaction
 * write KNOWN_MODULE_COUPLINGS exists for, so it reads/writes promotions'
 * own Discount table directly via Prisma, same reasoning as
 * marketing-automation.cron.ts's own recoveryDiscountId().
 */
@Injectable()
export class MarkdownSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(status: MarkdownSuggestionStatus = 'PENDING') {
    return this.prisma.markdownSuggestion.findMany({
      where: { status },
      include: suggestionInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async activate(id: string, actorId: string) {
    const suggestion = await this.loadPending(id);

    const discount = await this.prisma.discount.create({
      data: {
        name: `Markdown — ${suggestion.variant.sku}`,
        type: 'PERCENTAGE',
        scope: 'PRODUCT',
        value: suggestion.suggestedBps,
        productIds: [suggestion.variant.product.id],
        isActive: true,
        isStackable: false,
      },
    });

    const updated = await this.prisma.markdownSuggestion.update({
      where: { id },
      data: { status: 'CREATED', discountId: discount.id, resolvedAt: new Date() },
      include: suggestionInclude,
    });

    await this.audit.record({
      actorId,
      action: 'inventory.markdown_suggestion_activated',
      entity: 'MarkdownSuggestion',
      entityId: id,
      data: { variantId: suggestion.variantId, discountId: discount.id, suggestedBps: suggestion.suggestedBps },
    });

    return updated;
  }

  async dismiss(id: string, actorId: string) {
    await this.loadPending(id);

    const updated = await this.prisma.markdownSuggestion.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedAt: new Date() },
      include: suggestionInclude,
    });

    await this.audit.record({
      actorId,
      action: 'inventory.markdown_suggestion_dismissed',
      entity: 'MarkdownSuggestion',
      entityId: id,
      data: {},
    });

    return updated;
  }

  private async loadPending(id: string) {
    const suggestion = await this.prisma.markdownSuggestion.findUnique({
      where: { id },
      include: suggestionInclude,
    });
    if (!suggestion) throw new NotFoundException('That suggestion no longer exists.');
    if (suggestion.status !== 'PENDING') {
      throw new BadRequestException('This suggestion has already been reviewed.');
    }
    return suggestion;
  }
}
