import { BadRequestException } from '@nestjs/common';
import { EntityAttributeService } from './entity-attributes.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    entityAttribute: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      ...(overrides.entityAttribute as Record<string, unknown> | undefined),
    },
  } as any;
}

describe('EntityAttributeService — WO-140.2', () => {
  it('rejects an entityType that is not a real Prisma model, never reaching Prisma', async () => {
    const prisma = makePrisma();
    const service = new EntityAttributeService(prisma);

    await expect(service.getAttributes('NotARealModel', 'e1')).rejects.toThrow(BadRequestException);
    expect(prisma.entityAttribute.findMany).not.toHaveBeenCalled();
  });

  it('rejects setAttribute for an unknown entityType before upserting', async () => {
    const prisma = makePrisma();
    const service = new EntityAttributeService(prisma);

    await expect(
      service.setAttribute({ entityType: 'NotARealModel', entityId: 'e1', attributeKey: 'k', attributeValue: 'v' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.entityAttribute.upsert).not.toHaveBeenCalled();
  });

  it('lists a known entity type’s own attributes ordered by key', async () => {
    const prisma = makePrisma();
    const service = new EntityAttributeService(prisma);

    await service.getAttributes('Supplier', 'sup1');

    expect(prisma.entityAttribute.findMany).toHaveBeenCalledWith({
      where: { entityType: 'Supplier', entityId: 'sup1' },
      orderBy: { attributeKey: 'asc' },
    });
  });

  it('upserts on the composite unique key, defaulting valueType to TEXT', async () => {
    const prisma = makePrisma();
    prisma.entityAttribute.upsert.mockResolvedValue({ id: 'ea1' });
    const service = new EntityAttributeService(prisma);

    await service.setAttribute({ entityType: 'Supplier', entityId: 'sup1', attributeKey: 'certification_number', attributeValue: 'ISO-1234' });

    expect(prisma.entityAttribute.upsert).toHaveBeenCalledWith({
      where: {
        entityType_entityId_attributeKey: { entityType: 'Supplier', entityId: 'sup1', attributeKey: 'certification_number' },
      },
      create: { entityType: 'Supplier', entityId: 'sup1', attributeKey: 'certification_number', attributeValue: 'ISO-1234', valueType: 'TEXT' },
      update: { attributeValue: 'ISO-1234', valueType: 'TEXT' },
    });
  });

  it('upserting an existing key never touches other attributes, since it is scoped to one key', async () => {
    const prisma = makePrisma();
    const service = new EntityAttributeService(prisma);

    await service.setAttribute({ entityType: 'Supplier', entityId: 'sup1', attributeKey: 'note', attributeValue: 'updated', valueType: 'NUMBER' });

    expect(prisma.entityAttribute.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { attributeValue: 'updated', valueType: 'NUMBER' } }),
    );
  });

  it('deleteAll removes only the target entity’s own attribute rows', async () => {
    const prisma = makePrisma();
    const service = new EntityAttributeService(prisma);

    await service.deleteAll('Supplier', 'sup1');

    expect(prisma.entityAttribute.deleteMany).toHaveBeenCalledWith({ where: { entityType: 'Supplier', entityId: 'sup1' } });
  });
});
