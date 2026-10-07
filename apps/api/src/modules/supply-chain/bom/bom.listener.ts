import { Injectable } from '@nestjs/common';
import { DomainEvent, type GoodsReceivedPayload } from '../../../core/events/domain-events';
import { OnDomainEvent } from '../../../core/events/on-domain-event.decorator';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RecipeService } from './recipe.service';

/**
 * Rule 3 in action, no new event needed: receiving fabric against a PO
 * already publishes GoodsReceived (purchasing.service.ts, unmodified); this
 * listener is the only thing that needs to know a raw material's cost may
 * have just changed. recompute() is a pure read-then-write per recipe, so
 * firing this twice for the same receipt (at-least-once delivery) lands on
 * the identical rolledUpUnitCost both times.
 */
@Injectable()
export class BomListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipeService,
  ) {}

  @OnDomainEvent(DomainEvent.GoodsReceived)
  async recomputeAffectedRecipes(payload: GoodsReceivedPayload): Promise<void> {
    const items = await this.prisma.goodsReceiptItem.findMany({
      where: { goodsReceiptId: payload.goodsReceiptId },
      select: { variantId: true },
    });
    if (items.length === 0) return;

    const variantIds = [...new Set(items.map((item) => item.variantId))];

    const materials = await this.prisma.rawMaterial.findMany({
      where: { variantId: { in: variantIds } },
      select: { id: true },
    });
    if (materials.length === 0) return;

    const components = await this.prisma.bomComponent.findMany({
      where: { rawMaterialId: { in: materials.map((material) => material.id) } },
      select: { recipeId: true },
    });
    const recipeIds = [...new Set(components.map((component) => component.recipeId))];

    for (const recipeId of recipeIds) {
      await this.recipes.recompute(recipeId);
    }
  }
}
