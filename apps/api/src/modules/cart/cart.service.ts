import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  computeLineItem,
  computeOrderTotals,
  computeStitchingFee,
  DEFAULT_LOCALE,
  type Locale,
} from '@yaseen/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { SettingKey } from '../../core/settings/settings.defaults';
import type { Prisma } from '../../core/prisma/client';
import { pickTranslation } from '../catalog/catalog.service';
import type { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';

/** Guest carts live for a month; long enough to come back after payday. */
const CART_TTL_DAYS = 30;

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: { include: { translations: true, images: true, garmentTypes: true } },
      variant: true,
      stitchingService: {
        include: { translations: true, garmentType: true },
      },
      measurementProfile: { include: { garmentType: true } },
      stitchingOptions: { include: { option: { include: { group: true } } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface CartLineView {
  id: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  variantId: string;
  variantLabel: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  /** Stock available for this variant right now. */
  availableStock: number;
  /** True when the line asks for more than is in stock. */
  exceedsStock: boolean;
  stitching: {
    serviceId: string;
    serviceName: string;
    garmentKey: string;
    garmentLabel: string;
    measurementProfileId: string | null;
    measurementProfileLabel: string | null;
    options: Array<{ id: string; groupLabel: string; label: string; priceDelta: number }>;
    /** Base fee plus option deltas, for ONE unit. */
    feePerUnit: number;
    notes: string | null;
  } | null;
  productTotal: number;
  stitchingTotal: number;
  lineTotal: number;
}

export interface CartView {
  id: string;
  token: string;
  items: CartLineView[];
  itemCount: number;
  totals: {
    itemsSubtotal: number;
    stitchingSubtotal: number;
    grandTotal: number;
  };
  /** Lines that cannot be checked out as they stand. */
  issues: string[];
}

/**
 * The cart, including the stitching add-on.
 *
 * Prices are recomputed from the database on every read — the client's numbers
 * are never trusted and never stored on the cart. The same helpers in
 * @yaseen/shared price the cart here and the order at checkout, so the total a
 * customer is shown is the total they are charged.
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Finds a cart by token, or creates one. Used on every storefront request. */
  async getOrCreate(
    token: string | undefined,
    userId: string | undefined,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<CartView> {
    const cart = await this.resolveCart(token, userId);
    return this.toView(cart, locale);
  }

  async addItem(
    token: string | undefined,
    userId: string | undefined,
    dto: AddCartItemDto,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<CartView> {
    const cart = await this.resolveCart(token, userId);

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: { include: { garmentTypes: true } } },
    });

    if (!variant || !variant.isActive || variant.product.status !== 'ACTIVE') {
      throw new NotFoundException('That item is no longer available.');
    }
    if (variant.stock < dto.quantity) {
      throw new BadRequestException(
        variant.stock === 0
          ? 'That item is out of stock.'
          : `Only ${variant.stock} left in stock.`,
      );
    }

    const stitching = dto.stitching
      ? await this.validateStitching(variant.product, dto, userId)
      : null;

    // An identical line — same variant, same stitching choices — increments
    // instead of stacking duplicates in the cart.
    const twin = stitching
      ? null
      : await this.prisma.cartItem.findFirst({
          where: { cartId: cart.id, variantId: dto.variantId, stitchingServiceId: null },
        });

    if (twin) {
      const quantity = twin.quantity + dto.quantity;
      if (variant.stock < quantity) {
        throw new BadRequestException(`Only ${variant.stock} left in stock.`);
      }
      await this.prisma.cartItem.update({
        where: { id: twin.id },
        data: { quantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: variant.productId,
          variantId: variant.id,
          quantity: dto.quantity,
          stitchingServiceId: stitching?.serviceId ?? null,
          measurementProfileId: stitching?.measurementProfileId ?? null,
          stitchingNotes: stitching?.notes ?? null,
          ...(stitching && stitching.optionIds.length > 0
            ? {
                stitchingOptions: {
                  create: stitching.optionIds.map((optionId) => ({ optionId })),
                },
              }
            : {}),
        },
      });
    }

    return this.toView(await this.reload(cart.id), locale);
  }

  async updateItem(
    token: string | undefined,
    userId: string | undefined,
    itemId: string,
    dto: UpdateCartItemDto,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<CartView> {
    const cart = await this.resolveCart(token, userId);
    const item = await this.findItem(cart.id, itemId);

    if (dto.quantity !== undefined) {
      if (dto.quantity === 0) {
        await this.prisma.cartItem.delete({ where: { id: item.id } });
        return this.toView(await this.reload(cart.id), locale);
      }

      const variant = await this.prisma.productVariant.findUniqueOrThrow({
        where: { id: item.variantId },
      });
      if (variant.stock < dto.quantity) {
        throw new BadRequestException(`Only ${variant.stock} left in stock.`);
      }

      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: dto.quantity },
      });
    }

    if (dto.measurementProfileId !== undefined) {
      await this.assertOwnedProfile(dto.measurementProfileId, userId);
      await this.prisma.cartItem.update({
        where: { id: item.id },
        data: { measurementProfileId: dto.measurementProfileId },
      });
    }

    return this.toView(await this.reload(cart.id), locale);
  }

  async removeItem(
    token: string | undefined,
    userId: string | undefined,
    itemId: string,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<CartView> {
    const cart = await this.resolveCart(token, userId);
    const item = await this.findItem(cart.id, itemId);

    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.toView(await this.reload(cart.id), locale);
  }

  async clear(
    token: string | undefined,
    userId: string | undefined,
    locale: Locale = DEFAULT_LOCALE,
  ): Promise<CartView> {
    const cart = await this.resolveCart(token, userId);
    await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return this.toView(await this.reload(cart.id), locale);
  }

  /**
   * Merges a guest cart into the account's cart on sign-in.
   *
   * A shopper who filled a basket, then logged in to check out, must not lose
   * it. Lines are moved rather than copied, and the emptied guest cart is
   * deleted.
   */
  async mergeGuestCart(guestToken: string, userId: string): Promise<CartView> {
    const guest = await this.prisma.cart.findUnique({
      where: { token: guestToken },
      include: { items: true },
    });

    const own = await this.resolveCart(undefined, userId);

    if (!guest || guest.id === own.id || guest.items.length === 0) {
      return this.toView(await this.reload(own.id), DEFAULT_LOCALE);
    }
    if (guest.userId && guest.userId !== userId) {
      throw new ForbiddenException('That cart belongs to another account.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cartItem.updateMany({
        where: { cartId: guest.id },
        data: { cartId: own.id },
      });
      await tx.cart.delete({ where: { id: guest.id } });
    });

    return this.toView(await this.reload(own.id), DEFAULT_LOCALE);
  }

  // --- internals ------------------------------------------------------------

  private async resolveCart(
    token: string | undefined,
    userId: string | undefined,
  ): Promise<CartWithItems> {
    if (userId) {
      const existing = await this.prisma.cart.findFirst({
        where: { userId },
        include: cartInclude,
        orderBy: { updatedAt: 'desc' },
      });
      if (existing) return existing;
    }

    if (token) {
      const existing = await this.prisma.cart.findUnique({
        where: { token },
        include: cartInclude,
      });

      if (existing) {
        // A guest cart claimed after sign-in becomes the account's cart.
        if (userId && !existing.userId) {
          return this.prisma.cart.update({
            where: { id: existing.id },
            data: { userId },
            include: cartInclude,
          });
        }
        if (!existing.userId || existing.userId === userId) {
          return existing;
        }
      }
    }

    return this.prisma.cart.create({
      data: {
        token: randomBytes(24).toString('base64url'),
        userId: userId ?? null,
        expiresAt: new Date(Date.now() + CART_TTL_DAYS * 86_400_000),
      },
      include: cartInclude,
    });
  }

  private reload(cartId: string): Promise<CartWithItems> {
    return this.prisma.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: cartInclude,
    });
  }

  private async findItem(cartId: string, itemId: string) {
    const item = await this.prisma.cartItem.findUnique({ where: { id: itemId } });
    if (!item || item.cartId !== cartId) {
      throw new NotFoundException('That item is not in your cart.');
    }
    return item;
  }

  /**
   * Checks that a stitching request is coherent: the fabric offers stitching,
   * the service stitches a garment the fabric can be made into, the options
   * belong to that garment, and required option groups were answered.
   */
  private async validateStitching(
    product: { id: string; kind: string; stitchingAvailable: boolean; garmentTypes: Array<{ garmentTypeId: string }> },
    dto: AddCartItemDto,
    userId: string | undefined,
  ): Promise<{
    serviceId: string;
    measurementProfileId: string | null;
    optionIds: string[];
    notes: string | null;
  }> {
    const request = dto.stitching!;

    if (product.kind !== 'UNSTITCHED' || !product.stitchingAvailable) {
      throw new BadRequestException('This item cannot be stitched to measure.');
    }

    const service = await this.prisma.product.findUnique({
      where: { id: request.stitchingServiceId },
      include: { garmentType: true },
    });

    if (!service || service.kind !== 'STITCHING_SERVICE' || service.status !== 'ACTIVE') {
      throw new NotFoundException('That stitching service is not available.');
    }
    if (!service.garmentTypeId || !service.garmentType) {
      throw new BadRequestException('That stitching service has no garment type set.');
    }

    const allowed = product.garmentTypes.some(
      (link) => link.garmentTypeId === service.garmentTypeId,
    );
    if (!allowed) {
      throw new BadRequestException(
        `This fabric cannot be stitched as ${service.garmentType.labelEn}.`,
      );
    }

    if (request.measurementProfileId) {
      const profile = await this.assertOwnedProfile(request.measurementProfileId, userId);
      if (profile.garmentTypeId !== service.garmentTypeId) {
        throw new BadRequestException(
          `Those measurements are for a different garment than ${service.garmentType.labelEn}.`,
        );
      }
    }

    const optionIds = request.optionIds ?? [];
    const options = await this.prisma.stitchingOption.findMany({
      where: { id: { in: optionIds }, isActive: true },
      include: { group: true },
    });

    if (options.length !== optionIds.length) {
      throw new BadRequestException('One of the chosen style options is unavailable.');
    }

    for (const option of options) {
      if (option.group.garmentTypeId && option.group.garmentTypeId !== service.garmentTypeId) {
        throw new BadRequestException(
          `"${option.labelEn}" does not apply to ${service.garmentType.labelEn}.`,
        );
      }
    }

    // A SINGLE-select group may only be answered once.
    const perGroup = new Map<string, number>();
    for (const option of options) {
      perGroup.set(option.groupId, (perGroup.get(option.groupId) ?? 0) + 1);
    }
    for (const option of options) {
      if (option.group.selectionType === 'SINGLE' && perGroup.get(option.groupId)! > 1) {
        throw new BadRequestException(
          `Choose only one ${option.group.labelEn.toLowerCase()}.`,
        );
      }
    }

    const requiredGroups = await this.prisma.stitchingOptionGroup.findMany({
      where: { garmentTypeId: service.garmentTypeId, required: true, isActive: true },
    });
    for (const group of requiredGroups) {
      if (!perGroup.has(group.id)) {
        throw new BadRequestException(`Choose a ${group.labelEn.toLowerCase()}.`);
      }
    }

    return {
      serviceId: service.id,
      measurementProfileId: request.measurementProfileId ?? null,
      optionIds,
      notes: request.notes?.trim() || null,
    };
  }

  private async assertOwnedProfile(profileId: string | null, userId: string | undefined) {
    if (!profileId) {
      throw new BadRequestException('Choose a measurement profile.');
    }
    if (!userId) {
      throw new ForbiddenException('Sign in to use a saved measurement profile.');
    }

    const profile = await this.prisma.measurementProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('That measurement profile no longer exists.');
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException('That measurement profile belongs to another account.');
    }

    return profile;
  }

  private async toView(cart: CartWithItems, locale: Locale): Promise<CartView> {
    const lines: CartLineView[] = cart.items.map((item) => {
      const unitPrice = item.variant.priceOverride ?? item.product.basePrice;

      const options = item.stitchingOptions.map((selection) => ({
        id: selection.option.id,
        groupLabel:
          locale === 'ur' ? selection.option.group.labelUr : selection.option.group.labelEn,
        label: locale === 'ur' ? selection.option.labelUr : selection.option.labelEn,
        priceDelta: selection.option.priceDelta,
      }));

      const stitchingFeePerUnit = item.stitchingService
        ? computeStitchingFee({
            baseFee: item.stitchingService.basePrice,
            optionDeltas: options.map((option) => option.priceDelta),
          })
        : 0;

      const totals = computeLineItem({
        unitPrice,
        quantity: item.quantity,
        stitchingFeePerUnit,
      });

      const translation = pickTranslation(item.product.translations, locale);
      const image =
        item.product.images.find((candidate) => candidate.isPrimary) ??
        item.product.images[0];

      return {
        id: item.id,
        productId: item.productId,
        slug: item.product.slug,
        name: translation?.name ?? item.product.slug,
        imageUrl: image?.url ?? null,
        variantId: item.variantId,
        variantLabel:
          [item.variant.size, item.variant.color].filter(Boolean).join(' / ') || null,
        sku: item.variant.sku,
        quantity: item.quantity,
        unitPrice,
        availableStock: item.variant.stock,
        exceedsStock: item.quantity > item.variant.stock,
        stitching:
          item.stitchingService && item.stitchingService.garmentType
            ? {
                serviceId: item.stitchingService.id,
                serviceName:
                  pickTranslation(item.stitchingService.translations, locale)?.name ??
                  item.stitchingService.slug,
                garmentKey: item.stitchingService.garmentType.key,
                garmentLabel:
                  locale === 'ur'
                    ? item.stitchingService.garmentType.labelUr
                    : item.stitchingService.garmentType.labelEn,
                measurementProfileId: item.measurementProfileId,
                measurementProfileLabel: item.measurementProfile?.label ?? null,
                options,
                feePerUnit: stitchingFeePerUnit,
                notes: item.stitchingNotes,
              }
            : null,
        productTotal: totals.productTotal,
        stitchingTotal: totals.stitchingTotal,
        lineTotal: totals.lineTotal,
      };
    });

    const totals = computeOrderTotals({
      items: lines.map((line) => ({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        stitchingFeePerUnit: line.stitching?.feePerUnit ?? 0,
      })),
    });

    return {
      id: cart.id,
      token: cart.token,
      items: lines,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
      totals: {
        itemsSubtotal: totals.itemsSubtotal,
        stitchingSubtotal: totals.stitchingSubtotal,
        grandTotal: totals.grandTotal,
      },
      issues: this.collectIssues(lines),
    };
  }

  /** Everything standing between this cart and a checkout. */
  private collectIssues(lines: CartLineView[]): string[] {
    const issues: string[] = [];

    for (const line of lines) {
      if (line.availableStock === 0) {
        issues.push(`${line.name} is out of stock.`);
      } else if (line.exceedsStock) {
        issues.push(`Only ${line.availableStock} of ${line.name} left in stock.`);
      }

      if (line.stitching && !line.stitching.measurementProfileId) {
        issues.push(`Add measurements for the stitched ${line.stitching.garmentLabel}.`);
      }
    }

    return issues;
  }

  /** Exposed for the checkout module, which needs the priced cart. */
  async viewFor(cartId: string, locale: Locale = DEFAULT_LOCALE): Promise<CartView> {
    return this.toView(await this.reload(cartId), locale);
  }

  /** Minimum order value, read from settings rather than hard-coded. */
  async getMinimumOrderValue(): Promise<number> {
    return this.settings.get<number>(SettingKey.MinOrderValue);
  }
}
