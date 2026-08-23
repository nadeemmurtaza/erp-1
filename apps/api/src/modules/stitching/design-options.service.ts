import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { slugify } from '@yaseen/shared';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma } from '../../core/prisma/client';
import type {
  CreateStitchingOptionDto,
  CreateStitchingOptionGroupDto,
  UpdateStitchingOptionDto,
  UpdateStitchingOptionGroupDto,
} from './dto/stitching.dto';

const groupInclude = {
  options: { orderBy: { order: 'asc' } },
  garmentType: { select: { id: true, key: true, labelEn: true } },
} satisfies Prisma.StitchingOptionGroupInclude;

/**
 * Dashboard management of the design catalogue — the style groups a customer
 * picks from when having fabric made up, and the options inside them.
 *
 * Nothing here is ever hard-deleted. A saved cart, a placed order and a job on
 * the workshop floor all point back at these rows, so removing one would leave
 * a customer's chosen neckline pointing at nothing.
 */
@Injectable()
export class StitchingDesignOptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Every group, deactivated ones included; the dashboard edits both. */
  listOptionGroups() {
    return this.prisma.stitchingOptionGroup.findMany({
      // Ordered by body region, the way the storefront lays the picker out.
      // Postgres sorts NULLs last, which drops the area-less groups under
      // "other" at the end on its own.
      orderBy: [{ area: 'asc' }, { order: 'asc' }, { labelEn: 'asc' }],
      include: groupInclude,
    });
  }

  async createOptionGroup(actorId: string, dto: CreateStitchingOptionGroupDto) {
    const key = normaliseKey(dto.key);
    if (!key) {
      throw new BadRequestException('The group key must contain letters or digits.');
    }

    await this.assertGarmentTypeExists(dto.garmentTypeId);

    // A new group lands at the end of the form rather than jumping to the front.
    const order = dto.order ?? (await this.prisma.stitchingOptionGroup.count());

    const group = await asConflict(
      () =>
        this.prisma.stitchingOptionGroup.create({
          data: {
            key,
            labelEn: dto.labelEn.trim(),
            labelUr: dto.labelUr.trim(),
            garmentTypeId: dto.garmentTypeId ?? null,
            area: dto.area ?? null,
            selectionType: dto.selectionType ?? 'SINGLE',
            required: dto.required ?? false,
            allowCustomText: dto.allowCustomText ?? false,
            helpEn: dto.helpEn?.trim() || null,
            helpUr: dto.helpUr?.trim() || null,
            order,
            isActive: dto.isActive ?? true,
          },
          include: groupInclude,
        }),
      `A design group with the key "${key}" already exists.`,
    );

    await this.audit.record({
      actorId,
      action: 'stitching_option_group.created',
      entity: 'StitchingOptionGroup',
      entityId: group.id,
      data: { key: group.key, area: group.area },
    });

    return group;
  }

  async updateOptionGroup(
    actorId: string,
    id: string,
    dto: UpdateStitchingOptionGroupDto,
  ) {
    const existing = await this.prisma.stitchingOptionGroup.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('That design group no longer exists.');
    }

    if (dto.garmentTypeId !== undefined) {
      await this.assertGarmentTypeExists(dto.garmentTypeId);
    }

    // Unchecked, because garmentTypeId is set as a plain column rather than
    // through a connect/disconnect: null here means "offer on every garment".
    const data: Prisma.StitchingOptionGroupUncheckedUpdateInput = {};
    let key = existing.key;

    if (dto.key !== undefined) {
      key = normaliseKey(dto.key);
      if (!key) {
        throw new BadRequestException('The group key must contain letters or digits.');
      }
      // Custom design text is saved against the group key, so a rename leaves
      // the text already in open carts filed under the old one.
      data.key = key;
    }
    if (dto.labelEn !== undefined) data.labelEn = dto.labelEn.trim();
    if (dto.labelUr !== undefined) data.labelUr = dto.labelUr.trim();
    if (dto.garmentTypeId !== undefined) data.garmentTypeId = dto.garmentTypeId ?? null;
    if (dto.area !== undefined) data.area = dto.area ?? null;
    if (dto.selectionType !== undefined) data.selectionType = dto.selectionType;
    if (dto.required !== undefined) data.required = dto.required;
    if (dto.allowCustomText !== undefined) data.allowCustomText = dto.allowCustomText;
    if (dto.helpEn !== undefined) data.helpEn = dto.helpEn?.trim() || null;
    if (dto.helpUr !== undefined) data.helpUr = dto.helpUr?.trim() || null;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const group = await asConflict(
      () =>
        this.prisma.stitchingOptionGroup.update({
          where: { id },
          data,
          include: groupInclude,
        }),
      `A design group with the key "${key}" already exists.`,
    );

    await this.audit.record({
      actorId,
      action: 'stitching_option_group.updated',
      entity: 'StitchingOptionGroup',
      entityId: id,
      data: { key: group.key },
    });

    return group;
  }

  /**
   * Takes a group off the form. Soft, never a hard delete — carts, orders and
   * jobs in production reference it.
   *
   * The options inside are left alone, so reactivating restores the group
   * exactly as it was last arranged.
   */
  async deactivateOptionGroup(actorId: string, id: string) {
    const group = await this.prisma.stitchingOptionGroup.update({
      where: { id },
      data: { isActive: false },
      include: groupInclude,
    });

    await this.audit.record({
      actorId,
      action: 'stitching_option_group.deactivated',
      entity: 'StitchingOptionGroup',
      entityId: id,
      data: { key: group.key },
    });

    return group;
  }

  async createOption(actorId: string, groupId: string, dto: CreateStitchingOptionDto) {
    const group = await this.prisma.stitchingOptionGroup.findUnique({
      where: { id: groupId },
      select: { id: true, key: true, labelEn: true },
    });
    if (!group) {
      throw new NotFoundException('That design group no longer exists.');
    }

    const key = normaliseKey(dto.key);
    if (!key) {
      throw new BadRequestException('The option key must contain letters or digits.');
    }

    // A new option lands at the end of its group rather than jumping to the front.
    const order =
      dto.order ?? (await this.prisma.stitchingOption.count({ where: { groupId } }));

    const option = await asConflict(
      () =>
        this.prisma.stitchingOption.create({
          data: {
            groupId,
            key,
            labelEn: dto.labelEn.trim(),
            labelUr: dto.labelUr.trim(),
            // Negative is legitimate: a plainer finish costs the customer less.
            priceDelta: dto.priceDelta ?? 0,
            imageUrl: dto.imageUrl?.trim() || null,
            order,
            isActive: dto.isActive ?? true,
          },
        }),
      `"${group.labelEn}" already has an option with the key "${key}".`,
    );

    await this.audit.record({
      actorId,
      action: 'stitching_option.created',
      entity: 'StitchingOption',
      entityId: option.id,
      data: { groupKey: group.key, key: option.key, priceDelta: option.priceDelta },
    });

    return option;
  }

  async updateOption(actorId: string, id: string, dto: UpdateStitchingOptionDto) {
    const existing = await this.prisma.stitchingOption.findUnique({
      where: { id },
      include: { group: { select: { labelEn: true } } },
    });
    if (!existing) {
      throw new NotFoundException('That option no longer exists.');
    }

    const data: Prisma.StitchingOptionUncheckedUpdateInput = {};
    let key = existing.key;

    if (dto.key !== undefined) {
      key = normaliseKey(dto.key);
      if (!key) {
        throw new BadRequestException('The option key must contain letters or digits.');
      }
      data.key = key;
    }
    if (dto.labelEn !== undefined) data.labelEn = dto.labelEn.trim();
    if (dto.labelUr !== undefined) data.labelUr = dto.labelUr.trim();
    if (dto.priceDelta !== undefined) data.priceDelta = dto.priceDelta;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl?.trim() || null;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const option = await asConflict(
      () => this.prisma.stitchingOption.update({ where: { id }, data }),
      `"${existing.group.labelEn}" already has an option with the key "${key}".`,
    );

    await this.audit.record({
      actorId,
      action: 'stitching_option.updated',
      entity: 'StitchingOption',
      entityId: id,
      data: { key: option.key, priceDelta: option.priceDelta },
    });

    return option;
  }

  /** Soft, for the same reason a group is: chosen options are referenced rows. */
  async deactivateOption(actorId: string, id: string) {
    const option = await this.prisma.stitchingOption.update({
      where: { id },
      data: { isActive: false },
    });

    await this.audit.record({
      actorId,
      action: 'stitching_option.deactivated',
      entity: 'StitchingOption',
      entityId: id,
      data: { key: option.key },
    });

    return option;
  }

  /** A group with no garment type is offered on every garment. */
  private async assertGarmentTypeExists(garmentTypeId: string | null | undefined) {
    if (!garmentTypeId) return;

    const garment = await this.prisma.garmentType.findUnique({
      where: { id: garmentTypeId },
      select: { id: true },
    });
    if (!garment) {
      throw new BadRequestException(`No garment type "${garmentTypeId}".`);
    }
  }
}

/** Keys are read back out of saved cart JSON, so they stay snake_case ASCII. */
function normaliseKey(input: string): string {
  return slugify(input).replace(/-/g, '_');
}

/**
 * Turns a unique-constraint failure into a 409 that names the key which
 * clashed. The global filter would report the column instead, which tells the
 * admin nothing about which row to go and fix.
 */
async function asConflict<T>(work: () => Promise<T>, message: string): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
