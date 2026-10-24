import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../../core/prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { FormMetadata } from '../../../core/prisma/client';
import type { DefineFormMetadataDto, FieldMetadataDto } from './dto/form-metadata.dto';

export const FIELD_METADATA_VALUE_TYPES = ['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT'] as const;
export type FieldMetadataValueType = (typeof FIELD_METADATA_VALUE_TYPES)[number];

/**
 * architecture-patterns/141-general-metadata-driven-ui-engine.md (WO-141.1)
 * — this service owns the FORM SHAPE only. Values are never stored here:
 * the one screen this document wires up (Supplier, WO-141.4) reuses doc
 * 140's own `EntityAttributeService`, never a second, parallel write path.
 */
@Injectable()
export class MetadataFormsService {
  constructor(private readonly prisma: PrismaService) {}

  getFormMetadata(entityType: string): Promise<FormMetadata | null> {
    return this.prisma.formMetadata.findUnique({ where: { entityType } });
  }

  /**
   * `entityType` is validated against the live `Prisma.ModelName` registry
   * — the same mitigation doc 140 already established for the identical
   * "a typo silently creates an orphaned, unfindable definition" risk.
   */
  async defineForm(entityType: string, dto: DefineFormMetadataDto): Promise<FormMetadata> {
    if (!(entityType in Prisma.ModelName)) {
      throw new BadRequestException(`"${entityType}" is not a known entity type.`);
    }
    this.assertFieldsAreWellFormed(dto.fields);

    return this.prisma.formMetadata.upsert({
      where: { entityType },
      create: { entityType, fields: dto.fields as unknown as Prisma.InputJsonValue },
      update: { fields: dto.fields as unknown as Prisma.InputJsonValue },
    });
  }

  private assertFieldsAreWellFormed(fields: FieldMetadataDto[]): void {
    const keys = new Set<string>();
    for (const field of fields) {
      if (keys.has(field.key)) throw new BadRequestException(`Duplicate field key "${field.key}".`);
      keys.add(field.key);
      if (field.valueType === 'SELECT' && (!field.options || field.options.length === 0)) {
        throw new BadRequestException(`Field "${field.key}" is SELECT but names no options.`);
      }
    }
  }
}
