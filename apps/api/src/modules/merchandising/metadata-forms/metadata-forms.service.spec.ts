import { BadRequestException } from '@nestjs/common';
import { MetadataFormsService } from './metadata-forms.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    formMetadata: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      ...(overrides.formMetadata as Record<string, unknown> | undefined),
    },
  } as any;
}

const VALID_FIELDS = [{ key: 'certification_number', label: 'Certification number', valueType: 'TEXT' as const }];

describe('MetadataFormsService — WO-141.1', () => {
  it('returns null when no form is defined for an entity type, rather than throwing', async () => {
    const prisma = makePrisma();
    const service = new MetadataFormsService(prisma);

    await expect(service.getFormMetadata('Supplier')).resolves.toBeNull();
  });

  it('rejects an entityType that is not a real Prisma model, never reaching Prisma', async () => {
    const prisma = makePrisma();
    const service = new MetadataFormsService(prisma);

    await expect(service.defineForm('NotARealModel', { fields: VALID_FIELDS })).rejects.toThrow(BadRequestException);
    expect(prisma.formMetadata.upsert).not.toHaveBeenCalled();
  });

  it('rejects two fields sharing the same key', async () => {
    const prisma = makePrisma();
    const service = new MetadataFormsService(prisma);

    await expect(
      service.defineForm('Supplier', {
        fields: [
          { key: 'note', label: 'Note', valueType: 'TEXT' },
          { key: 'note', label: 'Note again', valueType: 'TEXT' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.formMetadata.upsert).not.toHaveBeenCalled();
  });

  it('rejects a SELECT field with no options', async () => {
    const prisma = makePrisma();
    const service = new MetadataFormsService(prisma);

    await expect(
      service.defineForm('Supplier', { fields: [{ key: 'tier', label: 'Tier', valueType: 'SELECT' }] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts a well-formed form definition on the entity type’s own unique key', async () => {
    const prisma = makePrisma();
    prisma.formMetadata.upsert.mockResolvedValue({ id: 'fm1', entityType: 'Supplier', fields: VALID_FIELDS });
    const service = new MetadataFormsService(prisma);

    await service.defineForm('Supplier', { fields: VALID_FIELDS });

    expect(prisma.formMetadata.upsert).toHaveBeenCalledWith({
      where: { entityType: 'Supplier' },
      create: { entityType: 'Supplier', fields: VALID_FIELDS },
      update: { fields: VALID_FIELDS },
    });
  });
});
