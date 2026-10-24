import { Test, TestingModule } from '@nestjs/testing';
import { BomListener } from './bom.listener';
import { RecipeService } from './recipe.service';
import { PrismaService } from '../../core/prisma/prisma.service';

describe('BomListener', () => {
  let listener: BomListener;
  let prisma: any;
  let recipes: any;

  const payload = { goodsReceiptId: 'gr1', number: 'GRN-1', purchaseOrderId: 'po1', supplierId: 'sup1' };

  beforeEach(async () => {
    prisma = {
      goodsReceiptItem: { findMany: jest.fn() },
      rawMaterial: { findMany: jest.fn() },
      bomComponent: { findMany: jest.fn() },
    };
    recipes = { recompute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomListener,
        { provide: PrismaService, useValue: prisma },
        { provide: RecipeService, useValue: recipes },
      ],
    }).compile();

    listener = module.get(BomListener);
  });

  it('does nothing when the receipt carries no raw materials', async () => {
    prisma.goodsReceiptItem.findMany.mockResolvedValue([{ variantId: 'v-finished' }]);
    prisma.rawMaterial.findMany.mockResolvedValue([]);

    await listener.recomputeAffectedRecipes(payload);

    expect(prisma.bomComponent.findMany).not.toHaveBeenCalled();
    expect(recipes.recompute).not.toHaveBeenCalled();
  });

  it('does nothing when the receipt has no line items at all', async () => {
    prisma.goodsReceiptItem.findMany.mockResolvedValue([]);

    await listener.recomputeAffectedRecipes(payload);

    expect(prisma.rawMaterial.findMany).not.toHaveBeenCalled();
    expect(recipes.recompute).not.toHaveBeenCalled();
  });

  it('recomputes every distinct recipe that consumes a received raw material', async () => {
    prisma.goodsReceiptItem.findMany.mockResolvedValue([{ variantId: 'v-fabric' }, { variantId: 'v-button' }]);
    prisma.rawMaterial.findMany.mockResolvedValue([{ id: 'rm-fabric' }, { id: 'rm-button' }]);
    prisma.bomComponent.findMany.mockResolvedValue([
      { recipeId: 'recipe-1' },
      { recipeId: 'recipe-1' },
      { recipeId: 'recipe-2' },
    ]);

    await listener.recomputeAffectedRecipes(payload);

    expect(recipes.recompute).toHaveBeenCalledTimes(2);
    expect(recipes.recompute).toHaveBeenCalledWith('recipe-1');
    expect(recipes.recompute).toHaveBeenCalledWith('recipe-2');
  });

  it('is idempotent — firing the same event twice recomputes the same recipes both times, with no accumulation', async () => {
    prisma.goodsReceiptItem.findMany.mockResolvedValue([{ variantId: 'v-fabric' }]);
    prisma.rawMaterial.findMany.mockResolvedValue([{ id: 'rm-fabric' }]);
    prisma.bomComponent.findMany.mockResolvedValue([{ recipeId: 'recipe-1' }]);

    await listener.recomputeAffectedRecipes(payload);
    await listener.recomputeAffectedRecipes(payload);

    expect(recipes.recompute).toHaveBeenCalledTimes(2);
    expect(recipes.recompute).toHaveBeenNthCalledWith(1, 'recipe-1');
    expect(recipes.recompute).toHaveBeenNthCalledWith(2, 'recipe-1');
  });
});
