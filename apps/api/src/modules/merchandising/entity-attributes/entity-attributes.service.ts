import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { EntityAttribute } from '../../../core/prisma/client';

export const ENTITY_ATTRIBUTE_VALUE_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE'] as const;
export type EntityAttributeValueType = (typeof ENTITY_ATTRIBUTE_VALUE_TYPES)[number];

/**
 * architecture-patterns/140-general-eav-extensibility-model.md (WO-140.2) —
 * a general EAV model, built by explicit owner override (ADR-026,
 * DECISIONS.md ADR-046). `entityType` carries no code-known allowlist —
 * unlike doc 104's own bounded `CustomFieldDefinition`, any entity may
 * adopt this table without a code change — but every write is checked
 * against `Prisma.ModelName`, the live, auto-generated registry of every
 * real Prisma model, so a typo ("Suplier") is rejected at write time
 * without a hand-maintained list that could drift from the schema.
 *
 * `entityId` is never a real foreign key (entityType varies), so deleting
 * an entity does not cascade to its attributes automatically —
 * `deleteAll()` must be called explicitly by every entity's own deletion
 * path that opts in. This is a real, standing maintenance obligation.
 */
@Injectable()
export class EntityAttributeService {
  constructor(private readonly prisma: PrismaService) {}

  async getAttributes(entityType: string, entityId: string): Promise<EntityAttribute[]> {
    this.assertKnownEntityType(entityType);
    return this.prisma.entityAttribute.findMany({
      where: { entityType, entityId },
      orderBy: { attributeKey: 'asc' },
    });
  }

  /** Upserts one attribute — `@@unique([entityType, entityId, attributeKey])` makes this idempotent, never a duplicate row for the same key. */
  async setAttribute(input: {
    entityType: string;
    entityId: string;
    attributeKey: string;
    attributeValue: string;
    valueType?: EntityAttributeValueType;
  }): Promise<EntityAttribute> {
    this.assertKnownEntityType(input.entityType);
    const valueType = input.valueType ?? 'TEXT';
    return this.prisma.entityAttribute.upsert({
      where: {
        entityType_entityId_attributeKey: {
          entityType: input.entityType,
          entityId: input.entityId,
          attributeKey: input.attributeKey,
        },
      },
      create: { ...input, valueType },
      update: { attributeValue: input.attributeValue, valueType },
    });
  }

  /**
   * Every entity's own deletion path that opts into this mechanism must
   * call this explicitly — there is no database-level cascade, since
   * `entityId` is not a real foreign key. Never called automatically.
   */
  async deleteAll(entityType: string, entityId: string): Promise<void> {
    await this.prisma.entityAttribute.deleteMany({ where: { entityType, entityId } });
  }

  /**
   * The one mitigation doc 140 names for "no compile-time guarantee an
   * entityType string is spelled correctly": validated against the live
   * `Prisma.ModelName` registry, generated fresh from the schema on every
   * `prisma generate` — never a hand-maintained array that can drift.
   */
  private assertKnownEntityType(entityType: string): void {
    if (!(entityType in Prisma.ModelName)) {
      throw new BadRequestException(`"${entityType}" is not a known entity type.`);
    }
  }
}
