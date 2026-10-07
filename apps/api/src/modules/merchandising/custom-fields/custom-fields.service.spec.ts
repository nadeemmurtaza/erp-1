import { BadRequestException } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    customFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn(),
    },
    supplier: {
      findUnique: jest.fn().mockResolvedValue({ customFields: {} }),
      update: jest.fn(),
    },
    ...overrides,
  } as any;
}

describe('CustomFieldsService — WO-104.2', () => {
  it('lists the wired entity types', () => {
    const service = new CustomFieldsService(makePrisma());
    expect(service.listEntityTypes()).toEqual(['Supplier']);
  });

  it('rejects an entity type not on the wired list, never reaching Prisma', async () => {
    const prisma = makePrisma();
    const service = new CustomFieldsService(prisma);

    await expect(service.listDefinitions('Product')).rejects.toThrow(BadRequestException);
    expect(prisma.customFieldDefinition.findMany).not.toHaveBeenCalled();
  });

  it('defines a field for a wired entity type', async () => {
    const prisma = makePrisma();
    prisma.customFieldDefinition.create.mockResolvedValue({ id: 'cfd1', entityType: 'Supplier', key: 'carbon_footprint_kg' });
    const service = new CustomFieldsService(prisma);

    await service.defineField({ entityType: 'Supplier', key: 'carbon_footprint_kg', label: 'Carbon footprint (kg)', valueType: 'NUMBER' });

    expect(prisma.customFieldDefinition.create).toHaveBeenCalledWith({
      data: { entityType: 'Supplier', key: 'carbon_footprint_kg', label: 'Carbon footprint (kg)', valueType: 'NUMBER', isRequired: false },
    });
  });

  it('rejects setting a value for a key with no matching definition', async () => {
    const prisma = makePrisma();
    const service = new CustomFieldsService(prisma);

    await expect(service.setValues('Supplier', 'sup1', { unknown_key: 'x' })).rejects.toThrow(BadRequestException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it('rejects a value of the wrong type for its own definition', async () => {
    const prisma = makePrisma({
      customFieldDefinition: {
        findMany: jest.fn().mockResolvedValue([{ key: 'carbon_footprint_kg', label: 'Carbon footprint (kg)', valueType: 'NUMBER', isRequired: false }]),
      },
    });
    const service = new CustomFieldsService(prisma);

    await expect(service.setValues('Supplier', 'sup1', { carbon_footprint_kg: 'not-a-number' as any })).rejects.toThrow(BadRequestException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it('rejects a missing value for a required field', async () => {
    const prisma = makePrisma({
      customFieldDefinition: {
        findMany: jest.fn().mockResolvedValue([{ key: 'compliance_note', label: 'Compliance note', valueType: 'TEXT', isRequired: true }]),
      },
      supplier: { findUnique: jest.fn().mockResolvedValue({ customFields: {} }), update: jest.fn() },
    });
    const service = new CustomFieldsService(prisma);

    await expect(service.setValues('Supplier', 'sup1', { compliance_note: '' })).rejects.toThrow(BadRequestException);
  });

  it('merges a new value into the existing customFields JSON, never overwriting unrelated keys', async () => {
    const prisma = makePrisma({
      customFieldDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'carbon_footprint_kg', label: 'Carbon footprint (kg)', valueType: 'NUMBER', isRequired: false },
          { key: 'notes', label: 'Notes', valueType: 'TEXT', isRequired: false },
        ]),
      },
      supplier: {
        findUnique: jest.fn().mockResolvedValue({ customFields: { notes: 'already here' } }),
        update: jest.fn().mockResolvedValue({}),
      },
    });
    const service = new CustomFieldsService(prisma);

    const result = await service.setValues('Supplier', 'sup1', { carbon_footprint_kg: 42.5 });

    expect(result).toEqual({ notes: 'already here', carbon_footprint_kg: 42.5 });
    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'sup1' },
      data: { customFields: { notes: 'already here', carbon_footprint_kg: 42.5 } },
    });
  });

  it('removing a definition never touches entity rows — an orphaned key is left inert', async () => {
    const prisma = makePrisma();
    const service = new CustomFieldsService(prisma);

    await service.deleteDefinition('cfd1');

    expect(prisma.customFieldDefinition.delete).toHaveBeenCalledWith({ where: { id: 'cfd1' } });
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it('getValues throws for an entity id that does not exist, rather than returning an empty object silently', async () => {
    const prisma = makePrisma({ supplier: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() } });
    const service = new CustomFieldsService(prisma);

    await expect(service.getValues('Supplier', 'missing')).rejects.toThrow(BadRequestException);
  });
});
