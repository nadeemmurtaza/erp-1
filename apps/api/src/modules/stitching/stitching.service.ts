import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

/**
 * Stitching style options — the neckline, sleeve, cut and finishing a customer
 * chooses when having fabric made up.
 *
 * The production side of stitching (jobs, the tailor queue, standalone orders)
 * joins this module later; the tables are already in
 * prisma/schema/stitching.prisma.
 */
@Injectable()
export class StitchingService {
  constructor(private readonly prisma: PrismaService) {}

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
