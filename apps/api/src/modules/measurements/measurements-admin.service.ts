import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { slugify } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import type { MeasurementField, Prisma } from '../../core/prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { GARMENT_SIZE_TOKENS, type GarmentSizeChartRowDto, type UpsertGarmentTypeDto } from './dto/measurements.dto';

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
        stitchingPrice: dto.stitchingPrice ?? 0,
        stitchingEnabled: dto.stitchingEnabled ?? true,
        baseFabricGaz: dto.baseFabricGaz ?? null,
        aliasesEn: dto.aliasesEn ?? [],
        aliasesUr: dto.aliasesUr ?? [],
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
          stitchingPrice: dto.stitchingPrice ?? existing.stitchingPrice,
          stitchingEnabled: dto.stitchingEnabled ?? existing.stitchingEnabled,
          baseFabricGaz: dto.baseFabricGaz ?? existing.baseFabricGaz,
          aliasesEn: dto.aliasesEn ?? existing.aliasesEn,
          aliasesUr: dto.aliasesUr ?? existing.aliasesUr,
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

  /**
   * Full-replace upsert of a garment's RTW size chart (XS-XXL). Only the size
   * tokens present in `rows` are touched — an admin who only has data for
   * XS/S/M so far never wipes the sizes they haven't filled in yet.
   */
  async replaceSizeChart(actorId: string, garmentTypeId: string, rows: GarmentSizeChartRowDto[]) {
    const garment = await this.prisma.garmentType.findUnique({
      where: { id: garmentTypeId },
      include: { fields: { where: { isActive: true } } },
    });
    if (!garment) {
      throw new NotFoundException('That garment type no longer exists.');
    }

    assertUniqueSizeTokens(rows);

    // A size-chart row is a reference table, not a customer's own order — the
    // RTW matrix only gives Shoulder/Chest/Waist/Hips/Length for a garment
    // that may have twice that many fields, so unlike @yaseen/shared's
    // validateMeasurements (which demands every required field), a size row
    // only needs the keys it actually supplies to be real, active fields
    // within their bounds.
    for (const row of rows) {
      assertValuesWithinFieldBounds(garment.fields, row.sizeToken, row.values);
    }

    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.garmentSizeChart.upsert({
          where: { garmentTypeId_sizeToken: { garmentTypeId, sizeToken: row.sizeToken } },
          create: {
            garmentTypeId,
            sizeToken: row.sizeToken,
            values: row.values as Prisma.InputJsonValue,
            order: GARMENT_SIZE_TOKENS.indexOf(row.sizeToken),
          },
          update: {
            values: row.values as Prisma.InputJsonValue,
            order: GARMENT_SIZE_TOKENS.indexOf(row.sizeToken),
          },
        }),
      ),
    );

    await this.audit.record({
      actorId,
      action: 'garment_type.size_chart_replaced',
      entity: 'GarmentType',
      entityId: garmentTypeId,
      data: { key: garment.key, sizeTokens: rows.map((row) => row.sizeToken) },
    });

    return this.prisma.garmentSizeChart.findMany({
      where: { garmentTypeId },
      orderBy: { order: 'asc' },
    });
  }
}

function assertUniqueSizeTokens(rows: GarmentSizeChartRowDto[]): void {
  const tokens = rows.map((row) => row.sizeToken);
  const duplicates = tokens.filter((token, index) => tokens.indexOf(token) !== index);

  if (duplicates.length > 0) {
    throw new BadRequestException(`Duplicate size tokens: ${[...new Set(duplicates)].join(', ')}`);
  }
}

/** Every key must be an active measurement field on the garment, in bounds. */
function assertValuesWithinFieldBounds(
  fields: MeasurementField[],
  sizeToken: string,
  values: Record<string, number>,
): void {
  const byKey = new Map(fields.map((field) => [field.key, field]));

  for (const [key, value] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field) {
      throw new BadRequestException(
        `${sizeToken}: "${key}" is not a measurement field on this garment.`,
      );
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${sizeToken}: "${field.labelEn}" must be a number.`);
    }
    if (value < field.min || value > field.max) {
      throw new BadRequestException(
        `${sizeToken}: "${field.labelEn}" must be between ${field.min} and ${field.max}.`,
      );
    }
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
