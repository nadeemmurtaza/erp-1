import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  validateMeasurements,
  type MeasurementFieldDef,
  type MeasurementValues,
} from '@newax/shared';
import { CartLineValidatorRegistry } from '../../../core/extension-points/cart-line-validator.registry';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { MeasurementField, Prisma } from '../../../core/prisma/client';

/**
 * Garment types, their measurement fields, and customers' saved profiles.
 *
 * Validation is delegated to @newax/shared so the API, the website and the
 * mobile app apply identical rules — the field definitions are database rows,
 * so a measurement added in the dashboard is enforced everywhere immediately.
 */
@Injectable()
export class MeasurementsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartValidators: CartLineValidatorRegistry,
  ) {}

  /**
   * Registers this pack's measurement validation for cart.service.ts's
   * `validate('measurements', ...)` call (B7, MULTI-SECTOR.md's
   * `cart -> measurements` entry) — legal because measurements (a pack)
   * depends on core's registry, not the other way round. Without this
   * registration, cart.service.ts:485 silently returned typed-in
   * measurements unvalidated (CartLineValidatorRegistry.validate() passes
   * values through unchanged when nothing is registered for the kind) —
   * confirmed by re-running the stitching e2e suite, which is what
   * surfaced this while verifying an unrelated schema change.
   */
  onModuleInit(): void {
    this.cartValidators.register('measurements', (fields: MeasurementField[], values: unknown) =>
      this.validate(fields, values),
    );
  }

  // --- Garment types --------------------------------------------------------

  async listGarmentTypes(includeInactive = false) {
    return this.prisma.garmentType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        fields: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async getGarmentType(idOrKey: string) {
    const garment = await this.prisma.garmentType.findFirst({
      where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
      include: { fields: { orderBy: { order: 'asc' } } },
    });

    if (!garment) {
      throw new NotFoundException(`No garment type "${idOrKey}".`);
    }
    return garment;
  }

  // --- Saved measurement profiles ------------------------------------------

  async listProfiles(userId: string) {
    return this.prisma.measurementProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { garmentType: { select: { id: true, key: true, labelEn: true, labelUr: true } } },
    });
  }

  async getProfile(userId: string, profileId: string) {
    const profile = await this.prisma.measurementProfile.findUnique({
      where: { id: profileId },
      include: { garmentType: { include: { fields: { orderBy: { order: 'asc' } } } } },
    });

    if (!profile) {
      throw new NotFoundException('That measurement profile no longer exists.');
    }
    if (profile.userId !== userId) {
      throw new ForbiddenException('That measurement profile belongs to another account.');
    }
    return profile;
  }

  async createProfile(
    userId: string,
    input: { label: string; garmentTypeId: string; values: unknown; notes?: string; isDefault?: boolean },
  ) {
    const garment = await this.getGarmentType(input.garmentTypeId);
    const values = this.validate(garment.fields, input.values);

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.measurementProfile.updateMany({
          where: { userId, garmentTypeId: garment.id },
          data: { isDefault: false },
        });
      }

      return tx.measurementProfile.create({
        data: {
          userId,
          garmentTypeId: garment.id,
          label: input.label.trim(),
          values: values as Prisma.InputJsonValue,
          notes: input.notes?.trim() || null,
          isDefault: input.isDefault ?? false,
        },
        include: { garmentType: { select: { key: true, labelEn: true, labelUr: true } } },
      });
    });
  }

  async updateProfile(
    userId: string,
    profileId: string,
    input: { label?: string; values?: unknown; notes?: string; isDefault?: boolean },
  ) {
    const existing = await this.getProfile(userId, profileId);

    const data: Prisma.MeasurementProfileUpdateInput = {};
    if (input.label !== undefined) data.label = input.label.trim();
    if (input.notes !== undefined) data.notes = input.notes.trim() || null;
    if (input.values !== undefined) {
      data.values = this.validate(
        existing.garmentType.fields,
        input.values,
      ) as Prisma.InputJsonValue;
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.measurementProfile.updateMany({
          where: { userId, garmentTypeId: existing.garmentTypeId },
          data: { isDefault: false },
        });
        data.isDefault = true;
      } else if (input.isDefault === false) {
        data.isDefault = false;
      }

      return tx.measurementProfile.update({ where: { id: profileId }, data });
    });
  }

  async deleteProfile(userId: string, profileId: string): Promise<void> {
    await this.getProfile(userId, profileId);
    // Cart items reference profiles with onDelete: SetNull, and orders hold a
    // snapshot, so removing a profile never damages an order.
    await this.prisma.measurementProfile.delete({ where: { id: profileId } });
  }

  /**
   * Validates raw values against a garment's fields, raising a 400 whose
   * message names the offending measurement.
   */
  validate(fields: MeasurementField[], input: unknown): MeasurementValues {
    const result = validateMeasurements(toFieldDefs(fields), input);

    if (!result.valid) {
      throw new BadRequestException({
        message: result.errors.map((error) => `${error.field}: ${error.message}`),
        error: 'INVALID_MEASUREMENTS',
        statusCode: 400,
      });
    }

    return result.values as MeasurementValues;
  }
}

/** Prisma rows -> the plain definitions @newax/shared validates against. */
export function toFieldDefs(fields: MeasurementField[]): MeasurementFieldDef[] {
  return fields
    .filter((field) => field.isActive)
    .map((field) => ({
      key: field.key,
      labelEn: field.labelEn,
      labelUr: field.labelUr,
      unit: field.unit,
      min: field.min,
      max: field.max,
      required: field.required,
      order: field.order,
      helpEn: field.helpEn ?? undefined,
      helpUr: field.helpUr ?? undefined,
    }));
}
