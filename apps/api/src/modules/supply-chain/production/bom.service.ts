import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { UpsertBillOfMaterialDto } from './dto/bom.dto';

/**
 * Recipes for variants made in-house. One BOM per variant — see
 * production.prisma's comment on why it is keyed by ProductVariant rather
 * than a garment concept.
 */
@Injectable()
export class BomService {
  constructor(private readonly prisma: PrismaService) {}

  async getForVariant(variantId: string) {
    return this.prisma.billOfMaterial.findUnique({
      where: { variantId },
      include: { components: { include: { componentVariant: { select: { id: true, sku: true, label: true } } } } },
    });
  }

  async upsert(variantId: string, dto: UpsertBillOfMaterialDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('That variant no longer exists.');
    if (!variant.producedInHouse) {
      throw new BadRequestException('Only a producedInHouse variant can have a bill of materials.');
    }
    if (dto.components.some((c) => c.componentVariantId === variantId)) {
      throw new BadRequestException('A variant cannot be a component of its own bill of materials.');
    }

    return this.prisma.$transaction(async (tx) => {
      const bom = await tx.billOfMaterial.upsert({
        where: { variantId },
        create: { variantId, name: dto.name },
        update: { name: dto.name },
      });

      await tx.billOfMaterialLine.deleteMany({ where: { billOfMaterialId: bom.id } });
      if (dto.components.length > 0) {
        await tx.billOfMaterialLine.createMany({
          data: dto.components.map((c) => ({
            billOfMaterialId: bom.id,
            componentVariantId: c.componentVariantId,
            quantityPerUnit: c.quantityPerUnit,
          })),
        });
      }

      return tx.billOfMaterial.findUniqueOrThrow({
        where: { id: bom.id },
        include: { components: true },
      });
    });
  }

  async remove(variantId: string) {
    const bom = await this.prisma.billOfMaterial.findUnique({ where: { variantId } });
    if (!bom) return { deleted: false };
    await this.prisma.billOfMaterial.delete({ where: { id: bom.id } });
    return { deleted: true };
  }
}
