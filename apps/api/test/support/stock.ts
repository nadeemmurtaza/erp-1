import { PrismaService } from '../../src/core/prisma/prisma.service';

/**
 * B6 (17-inventory-locations.md): ProductVariant.stock is now a denormalized
 * aggregate over VariantLocationStock, recomputed only inside
 * InventoryService.move(). Test setup that pokes ProductVariant.stock
 * directly (as this suite did before B6) leaves VariantLocationStock stale,
 * so the very next real move() — a checkout — sees the OLD location quantity
 * and can reject a sale "sold out" even though .stock looks fine. Use these
 * helpers instead of writing ProductVariant.stock directly in test setup.
 */
export async function setVariantStock(
  prisma: PrismaService,
  variantId: string,
  quantity: number,
): Promise<void> {
  const location = await prisma.location.findFirstOrThrow({ where: { isDefault: true } });
  await prisma.$transaction([
    prisma.variantLocationStock.upsert({
      where: { variantId_locationId: { variantId, locationId: location.id } },
      create: { variantId, locationId: location.id, quantity },
      update: { quantity },
    }),
    prisma.productVariant.update({ where: { id: variantId }, data: { stock: quantity } }),
  ]);
}

export async function incrementVariantStock(
  prisma: PrismaService,
  variantId: string,
  delta: number,
): Promise<void> {
  const location = await prisma.location.findFirstOrThrow({ where: { isDefault: true } });
  await prisma.$transaction([
    prisma.variantLocationStock.upsert({
      where: { variantId_locationId: { variantId, locationId: location.id } },
      create: { variantId, locationId: location.id, quantity: Math.max(0, delta) },
      update: { quantity: { increment: delta } },
    }),
    prisma.productVariant.update({ where: { id: variantId }, data: { stock: { increment: delta } } }),
  ]);
}
