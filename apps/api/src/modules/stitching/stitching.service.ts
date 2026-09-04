import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { CartLineValidatorRegistry } from '../../core/extension-points/cart-line-validator.registry';
import { PrismaService } from '../../core/prisma/prisma.service';

/** A design note is a sentence for the tailor to read, not an essay. */
const CUSTOM_DESIGN_TEXT_MAX = 500;

export interface StitchingOptionSelection {
  optionIds: string[];
  customDesignText: Record<string, string> | null;
}

/**
 * Stitching style options — the neckline, sleeve, cut and finishing a customer
 * chooses when having fabric made up.
 *
 * The production side of stitching (jobs, the tailor queue, standalone orders)
 * joins this module later; the tables are already in
 * prisma/schema/stitching.prisma.
 */
@Injectable()
export class StitchingService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartValidators: CartLineValidatorRegistry,
  ) {}

  /**
   * Registers this pack's option-selection validation for cart.service.ts's
   * `validate('stitchingOptions', ...)` call — the same `cart -> apparel`
   * extension point measurements already uses (see
   * MeasurementsService.onModuleInit()), so cart (core) never imports
   * StitchingOption/StitchingOptionGroup or this service directly. Without
   * this registration a stitching selection would pass through unvalidated
   * (CartLineValidatorRegistry.validate() returns its input unchanged when
   * nothing is registered for the kind) — acceptable only because the
   * `stitching` pack is effectively always on; a deployment that disables it
   * while still accepting stitching selections would need its own guard,
   * which is out of scope here.
   */
  onModuleInit(): void {
    this.cartValidators.register(
      'stitchingOptions',
      (garmentTypeId: string, request: { optionIds: string[]; customDesignText?: Record<string, string> }) =>
        this.validateOptionSelection(garmentTypeId, request.optionIds, request.customDesignText),
    );
  }

  /**
   * Checks that a chosen set of style options is coherent for one garment:
   * every option exists and is active, belongs to that garment (or is
   * shop-wide), a SINGLE-select group was answered at most once, and every
   * REQUIRED group was answered. Also cleans the customer's free-text design
   * notes down to the groups still asking for them.
   *
   * Moved here from cart.service.ts (P1-8, MULTI-SECTOR.md's `cart ->
   * stitching` entry) — cart no longer runs StitchingOption/
   * StitchingOptionGroup queries itself.
   */
  async validateOptionSelection(
    garmentTypeId: string,
    optionIds: string[],
    customDesignTextInput: Record<string, string> | undefined,
  ): Promise<StitchingOptionSelection> {
    const options = await this.prisma.stitchingOption.findMany({
      where: { id: { in: optionIds }, isActive: true },
      include: { group: true },
    });

    if (options.length !== optionIds.length) {
      throw new BadRequestException('One of the chosen style options is unavailable.');
    }

    for (const option of options) {
      if (option.group.garmentTypeId && option.group.garmentTypeId !== garmentTypeId) {
        throw new BadRequestException(`"${option.labelEn}" does not apply to this garment.`);
      }
    }

    // A SINGLE-select group may only be answered once.
    const perGroup = new Map<string, number>();
    for (const option of options) {
      perGroup.set(option.groupId, (perGroup.get(option.groupId) ?? 0) + 1);
    }
    for (const option of options) {
      if (option.group.selectionType === 'SINGLE' && perGroup.get(option.groupId)! > 1) {
        throw new BadRequestException(`Choose only one ${option.group.labelEn.toLowerCase()}.`);
      }
    }

    const requiredGroups = await this.prisma.stitchingOptionGroup.findMany({
      where: { garmentTypeId, required: true, isActive: true },
    });
    for (const group of requiredGroups) {
      if (!perGroup.has(group.id)) {
        throw new BadRequestException(`Choose a ${group.labelEn.toLowerCase()}.`);
      }
    }

    return {
      optionIds,
      customDesignText: await this.cleanCustomDesignText(garmentTypeId, customDesignTextInput),
    };
  }

  /**
   * Keeps only the free text that belongs to a design area still taking it.
   *
   * Text for a group that has since had its box turned off is dropped rather
   * than rejected — the customer answered the form they were shown, and losing
   * a whole cart line over it would be the shop's mistake charged to them.
   */
  private async cleanCustomDesignText(
    garmentTypeId: string,
    input: Record<string, string> | undefined,
  ): Promise<Record<string, string> | null> {
    const entries = Object.entries(input ?? {});
    if (entries.length === 0) return null;

    const groups = await this.prisma.stitchingOptionGroup.findMany({
      where: {
        key: { in: entries.map(([key]) => key) },
        allowCustomText: true,
        isActive: true,
        OR: [{ garmentTypeId }, { garmentTypeId: null }],
      },
      select: { key: true },
    });

    const takesText = new Set(groups.map((group) => group.key));
    const cleaned: Record<string, string> = {};

    for (const [key, value] of entries) {
      if (!takesText.has(key) || typeof value !== 'string') continue;

      const text = value.trim().slice(0, CUSTOM_DESIGN_TEXT_MAX);
      if (text) cleaned[key] = text;
    }

    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }

  /**
   * The stitching price list: every garment that can be made up, with the
   * measurements to collect and the styles to choose from.
   *
   * One call, because the storefront panel needs all three together — asking
   * per garment would cost a round trip on every chip the customer taps.
   */
  async listGarments() {
    const [garments, sharedGroups] = await Promise.all([
      this.prisma.garmentType.findMany({
        where: { isActive: true, stitchingEnabled: true },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          key: true,
          labelEn: true,
          labelUr: true,
          stitchingPrice: true,
          baseFabricGaz: true,
          aliasesEn: true,
          aliasesUr: true,
          fields: { where: { isActive: true }, orderBy: { order: 'asc' } },
          sizeChart: {
            orderBy: { order: 'asc' },
            select: { sizeToken: true, values: true },
          },
          optionGroups: {
            where: { isActive: true },
            orderBy: { order: 'asc' },
            include: {
              options: { where: { isActive: true }, orderBy: { order: 'asc' } },
            },
          },
        },
      }),
      this.prisma.stitchingOptionGroup.findMany({
        where: { isActive: true, garmentTypeId: null },
        orderBy: { order: 'asc' },
        include: {
          options: { where: { isActive: true }, orderBy: { order: 'asc' } },
        },
      }),
    ]);

    // Shop-wide groups belong to every garment; fetched once, folded in here.
    return garments.map((garment) => ({
      ...garment,
      optionGroups: [...garment.optionGroups, ...sharedGroups].sort(
        (a, b) => a.order - b.order,
      ),
    }));
  }

  /**
   * Option groups for a garment.
   *
   * Groups with no garment type apply to every garment, so a shop-wide option
   * such as "add a lining" does not have to be duplicated per garment.
   */
  async listOptionGroups(garmentTypeKeyOrId?: string) {
    if (!garmentTypeKeyOrId) {
      return this.prisma.stitchingOptionGroup.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        include: {
          options: { where: { isActive: true }, orderBy: { order: 'asc' } },
        },
      });
    }

    const garment = await this.prisma.garmentType.findFirst({
      where: { OR: [{ id: garmentTypeKeyOrId }, { key: garmentTypeKeyOrId }] },
      select: { id: true },
    });

    if (!garment) {
      throw new NotFoundException(`No garment type "${garmentTypeKeyOrId}".`);
    }

    return this.prisma.stitchingOptionGroup.findMany({
      where: {
        isActive: true,
        OR: [{ garmentTypeId: garment.id }, { garmentTypeId: null }],
      },
      orderBy: { order: 'asc' },
      include: {
        options: { where: { isActive: true }, orderBy: { order: 'asc' } },
      },
    });
  }
}
