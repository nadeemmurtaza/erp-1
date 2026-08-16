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
