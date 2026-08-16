import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { UpsertGarmentTypeDto } from './dto/measurements.dto';

/**
 * Dashboard management of garment types and their measurement fields.
 *
 * This is what makes "we now also ask for cuff width" a five-second edit rather
 * than a deploy: fields are rows, and every measurement form is generated from
 * them.
 */
@Injectable()
export class MeasurementsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async createGarmentType(actorId: string, dto: UpsertGarmentTypeDto) {
    const key = slugify(dto.key).replace(/-/g, '_');
    if (!key) {
      throw new BadRequestException('The garment key must contain letters or digits.');
    }

    assertUniqueFieldKeys(dto);

    const garment = await this.prisma.garmentType.create({
      data: {
        key,
        labelEn: dto.labelEn.trim(),
        labelUr: dto.labelUr.trim(),
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
        fields: {
          create: (dto.fields ?? []).map((field, index) => ({
            key: slugify(field.key).replace(/-/g, '_'),
            labelEn: field.labelEn.trim(),
            labelUr: field.labelUr.trim(),
            unit: field.unit ?? 'INCH',
            min: field.min,
            max: field.max,
            required: field.required ?? true,
            order: field.order ?? index,
            helpEn: field.helpEn?.trim() || null,
            helpUr: field.helpUr?.trim() || null,
            isActive: field.isActive ?? true,
          })),
        },
      },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    await this.audit.record({
      actorId,
      action: 'garment_type.created',
      entity: 'GarmentType',
      entityId: garment.id,
      data: { key: garment.key },
    });

    return garment;
  }

  async updateGarmentType(actorId: string, id: string, dto: UpsertGarmentTypeDto) {
    const existing = await this.prisma.garmentType.findUnique({
      where: { id },
      include: { fields: true },
    });
    if (!existing) {
      throw new NotFoundException('That garment type no longer exists.');
    }

    assertUniqueFieldKeys(dto);

    const garment = await this.prisma.$transaction(async (tx) => {
      await tx.garmentType.update({
        where: { id },
        data: {
          labelEn: dto.labelEn.trim(),
          labelUr: dto.labelUr.trim(),
          order: dto.order ?? existing.order,
          isActive: dto.isActive ?? existing.isActive,
        },
      });

      if (dto.fields) {
        const incoming = dto.fields.map((field, index) => ({
          key: slugify(field.key).replace(/-/g, '_'),
          labelEn: field.labelEn.trim(),
          labelUr: field.labelUr.trim(),
          unit: field.unit ?? ('INCH' as const),
          min: field.min,
          max: field.max,
          required: field.required ?? true,
          order: field.order ?? index,
          helpEn: field.helpEn?.trim() || null,
          helpUr: field.helpUr?.trim() || null,
          isActive: field.isActive ?? true,
        }));

        // Fields removed from the form are deactivated, never deleted —
        // existing profiles and in-production jobs still reference them.
        const incomingKeys = new Set(incoming.map((field) => field.key));
        await tx.measurementField.updateMany({
          where: { garmentTypeId: id, key: { notIn: [...incomingKeys] } },
          data: { isActive: false },
        });

        for (const field of incoming) {
          await tx.measurementField.upsert({
            where: { garmentTypeId_key: { garmentTypeId: id, key: field.key } },
            create: { garmentTypeId: id, ...field },
            update: field,
          });
        }
      }

      return tx.garmentType.findUniqueOrThrow({
        where: { id },
        include: { fields: { orderBy: { order: 'asc' } } },
      });
    });

    await this.audit.record({
      actorId,
      action: 'garment_type.updated',
      entity: 'GarmentType',
      entityId: id,
      data: { key: garment.key },
    });

    return garment;
  }

  /**
   * Deactivates a garment type. It is never hard-deleted: saved profiles,
   * stitching services and jobs in production all point at it.
   */
  async deactivateGarmentType(actorId: string, id: string) {
    const garment = await this.prisma.garmentType.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'garment_type.deactivated',
      entity: 'GarmentType',
      entityId: id,
      data: { key: garment.key },
    });

    return garment;
  }
}

function assertUniqueFieldKeys(dto: UpsertGarmentTypeDto): void {
  if (!dto.fields) return;

  const keys = dto.fields.map((field) => slugify(field.key).replace(/-/g, '_'));
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

  if (duplicates.length > 0) {
    throw new BadRequestException(
      `Duplicate measurement keys: ${[...new Set(duplicates)].join(', ')}`,
    );
  }

  for (const field of dto.fields) {
    if (field.min >= field.max) {
      throw new BadRequestException(
        `"${field.labelEn}": the minimum must be less than the maximum.`,
      );
    }
  }
}
