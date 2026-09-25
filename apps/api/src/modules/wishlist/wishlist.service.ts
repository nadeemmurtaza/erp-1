import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { AddWishlistItemDto } from './dto/wishlist.dto';

export interface WishlistItemView {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number;
  variantId: string | null;
  variantLabel: string | null;
  inStock: boolean;
  createdAt: Date;
}

const itemInclude = {
  product: { include: { translations: true, images: { take: 1, orderBy: { order: 'asc' as const } } } },
  variant: true,
} as const;

function toView(item: {
  id: string;
  productId: string;
  variantId: string | null;
  createdAt: Date;
  product: {
    slug: string;
    basePrice: number;
    translations: { locale: string; name: string }[];
    images: { url: string }[];
  };
  variant: { id: string; label: string | null; priceOverride: number | null; stock: number } | null;
}): WishlistItemView {
  const name = item.product.translations.find((t) => t.locale === 'en')?.name ?? item.product.translations[0]?.name ?? '';
  return {
    id: item.id,
    productId: item.productId,
    slug: item.product.slug,
    name,
    imageUrl: item.product.images[0]?.url ?? null,
    price: item.variant?.priceOverride ?? item.product.basePrice,
    variantId: item.variantId,
    variantLabel: item.variant?.label ?? null,
    inStock: item.variant ? item.variant.stock > 0 : true,
    createdAt: item.createdAt,
  };
}

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<WishlistItemView[]> {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: itemInclude,
    });
    return items.map(toView);
  }

  /**
   * A plain findFirst-then-create rather than an upsert keyed on
   * `[userId, productId, variantId]`: Postgres does not treat two NULLs as
   * equal under a unique constraint, so `ON CONFLICT` (what `upsert`
   * compiles to) would never fire for the common case of saving a product
   * with no specific variant chosen — two clicks would silently create two
   * rows. A small race window between the check and the create is an
   * acceptable cost for a wishlist (unlike the money-moving ledgers
   * elsewhere in this codebase, which use a real database-level guard).
   */
  async add(userId: string, dto: AddWishlistItemDto): Promise<WishlistItemView> {
    const variantId = dto.variantId ?? null;
    const existing = await this.prisma.wishlistItem.findFirst({
      where: { userId, productId: dto.productId, variantId },
      include: itemInclude,
    });
    if (existing) return toView(existing);

    const item = await this.prisma.wishlistItem.create({
      data: { userId, productId: dto.productId, variantId },
      include: itemInclude,
    });
    return toView(item);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.prisma.wishlistItem.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Wishlist item not found.');
  }

  /**
   * WO-7.6's own migration step. Best-effort: an id the browser saved that no
   * longer exists (deleted product) is silently skipped rather than failing
   * the whole migration — a customer would rather keep the 9 saved items
   * that still exist than lose all 10 because 1 was discontinued.
   */
  async migrate(userId: string, productIds: string[]): Promise<{ migrated: number }> {
    if (productIds.length === 0) return { migrated: 0 };
    const validProducts = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    if (validProducts.length === 0) return { migrated: 0 };

    // `skipDuplicates` compiles to ON CONFLICT, which — same reasoning as
    // add() above — never fires for two NULL variantId rows in Postgres.
    // Filtering out what is already saved first is what actually makes a
    // second migrate() call (a second device, a retried request) a no-op.
    const alreadySaved = await this.prisma.wishlistItem.findMany({
      where: { userId, productId: { in: validProducts.map((p) => p.id) }, variantId: null },
      select: { productId: true },
    });
    const alreadySavedIds = new Set(alreadySaved.map((row) => row.productId));
    const toCreate = validProducts.filter((p) => !alreadySavedIds.has(p.id));
    if (toCreate.length === 0) return { migrated: 0 };

    await this.prisma.wishlistItem.createMany({
      data: toCreate.map((p) => ({ userId, productId: p.id, variantId: null })),
    });
    return { migrated: toCreate.length };
  }

  async requestBackInStockAlert(userId: string, variantId: string): Promise<{ requested: boolean }> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('Variant not found.');
    if (variant.stock > 0) return { requested: false };

    await this.prisma.backInStockRequest.upsert({
      where: { userId_variantId: { userId, variantId } },
      update: {},
      create: { userId, variantId },
    });
    return { requested: true };
  }

  async myBackInStockRequests(userId: string) {
    return this.prisma.backInStockRequest.findMany({
      where: { userId },
      include: { variant: { include: { product: { include: { translations: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelBackInStockAlert(userId: string, variantId: string): Promise<void> {
    await this.prisma.backInStockRequest.deleteMany({ where: { userId, variantId } });
  }

  /** Staff report: what is wanted and currently out of stock — feeds Phase 1's reorder suggestions. */
  async outOfStockReport() {
    const rows = await this.prisma.wishlistItem.groupBy({
      by: ['productId'],
      _count: { _all: true },
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      include: { translations: true, variants: { select: { stock: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows
      .map((row) => {
        const product = byId.get(row.productId);
        if (!product) return null;
        const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
        if (totalStock > 0) return null;
        return {
          productId: product.id,
          name: product.translations.find((t) => t.locale === 'en')?.name ?? product.translations[0]?.name ?? '',
          wishlistCount: row._count._all,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.wishlistCount - a.wishlistCount);
  }
}
