import { BadRequestException, Injectable } from '@nestjs/common';
import { CUSTOM_FIELD_ENTITY_TYPES, type CustomFieldEntityType, type CustomFieldValueType } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CustomFieldDefinition } from '../../core/prisma/client';

type CustomFieldValue = string | number | boolean | null;

/**
 * architecture-patterns/104-jsonb-eav-extensibility.md (WO-104.2) — a
 * bounded, per-entity JSONB overlay, never a general EAV model.
 * `entityType` is checked against `CUSTOM_FIELD_ENTITY_TYPES`, the one
 * place this mechanism's "wired-up" entities are named; `readRow`/`writeRow`
 * below are the only two places that need a new `case` when an entity is
 * added — everything else (validation, definitions) is already generic.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  listEntityTypes(): readonly CustomFieldEntityType[] {
    return CUSTOM_FIELD_ENTITY_TYPES;
  }

  async listDefinitions(entityType: string): Promise<CustomFieldDefinition[]> {
    this.assertWiredEntityType(entityType);
    return this.prisma.customFieldDefinition.findMany({ where: { entityType }, orderBy: { createdAt: 'asc' } });
  }

  async defineField(input: {
    entityType: string;
    key: string;
    label: string;
    valueType: CustomFieldValueType;
    isRequired?: boolean;
  }): Promise<CustomFieldDefinition> {
    this.assertWiredEntityType(input.entityType);
    return this.prisma.customFieldDefinition.create({
      data: {
        entityType: input.entityType,
        key: input.key,
        label: input.label,
        valueType: input.valueType,
        isRequired: input.isRequired ?? false,
      },
    });
  }

  /**
   * Removing a definition leaves any already-stored value under its key
   * orphaned in the entity's own `customFields` JSON — harmless and never
   * read once the definition is gone (doc 104's own "a stale key in a JSON
   * blob is inert" reasoning), so this never touches entity rows.
   */
  async deleteDefinition(id: string): Promise<void> {
    await this.prisma.customFieldDefinition.delete({ where: { id } });
  }

  async getValues(entityType: string, entityId: string): Promise<Record<string, CustomFieldValue>> {
    const row = await this.readRow(entityType, entityId);
    if (!row) throw new BadRequestException(`No ${entityType} with id "${entityId}".`);
    return (row.customFields as Record<string, CustomFieldValue>) ?? {};
  }

  /**
   * Validates every incoming value against its own `CustomFieldDefinition`
   * (unknown key, wrong type, or a missing required field are all rejected
   * here, server-side, never silently coerced) and merges it into the
   * entity's existing `customFields` — an ordinary field update on that
   * row, no different from any other column write.
   */
  async setValues(
    entityType: string,
    entityId: string,
    values: Record<string, CustomFieldValue>,
  ): Promise<Record<string, CustomFieldValue>> {
    const definitions = await this.listDefinitions(entityType);
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

    for (const [key, value] of Object.entries(values)) {
      const definition = byKey.get(key);
      if (!definition) throw new BadRequestException(`No custom field "${key}" is defined for ${entityType}.`);
      this.assertValueMatchesType(definition, value);
    }

    const current = await this.getValues(entityType, entityId);
    const merged = { ...current, ...values };

    for (const definition of definitions) {
      const value = merged[definition.key];
      if (definition.isRequired && (value === null || value === undefined || value === '')) {
        throw new BadRequestException(`"${definition.label}" is required.`);
      }
    }

    await this.writeRow(entityType, entityId, merged);
    return merged;
  }

  private assertWiredEntityType(entityType: string): asserts entityType is CustomFieldEntityType {
    if (!CUSTOM_FIELD_ENTITY_TYPES.includes(entityType as CustomFieldEntityType)) {
      throw new BadRequestException(`"${entityType}" is not a supported custom-field entity type.`);
    }
  }

  private assertValueMatchesType(definition: CustomFieldDefinition, value: CustomFieldValue): void {
    if (value === null || value === undefined) return;
    switch (definition.valueType) {
      case 'TEXT':
        if (typeof value !== 'string') throw new BadRequestException(`"${definition.label}" must be text.`);
        return;
      case 'NUMBER':
        if (typeof value !== 'number' || Number.isNaN(value)) throw new BadRequestException(`"${definition.label}" must be a number.`);
        return;
      case 'BOOLEAN':
        if (typeof value !== 'boolean') throw new BadRequestException(`"${definition.label}" must be true or false.`);
        return;
      case 'DATE':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          throw new BadRequestException(`"${definition.label}" must be a valid date.`);
        }
        return;
    }
  }

  private async readRow(entityType: string, entityId: string): Promise<{ customFields: unknown } | null> {
    this.assertWiredEntityType(entityType);
    switch (entityType) {
      case 'Supplier':
        return this.prisma.supplier.findUnique({ where: { id: entityId }, select: { customFields: true } });
      default:
        // Unreachable while CUSTOM_FIELD_ENTITY_TYPES and this switch stay in
        // sync — assertWiredEntityType already rejected anything else.
        throw new BadRequestException(`"${entityType}" has no wired custom-field storage.`);
    }
  }

  private async writeRow(entityType: string, entityId: string, customFields: Record<string, CustomFieldValue>): Promise<void> {
    this.assertWiredEntityType(entityType);
    switch (entityType) {
      case 'Supplier':
        await this.prisma.supplier.update({ where: { id: entityId }, data: { customFields } });
        return;
    }
  }
}
