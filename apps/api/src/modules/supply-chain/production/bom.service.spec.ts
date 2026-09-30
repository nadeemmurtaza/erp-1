import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BomService } from './bom.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

describe('BomService', () => {
  let service: BomService;
  let prisma: any;
  let tx: any;

  beforeEach(async () => {
    tx = {
      billOfMaterial: { upsert: jest.fn(), findUniqueOrThrow: jest.fn() },
      billOfMaterialLine: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    prisma = {
      productVariant: { findUnique: jest.fn() },
      billOfMaterial: { findUnique: jest.fn(), delete: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BomService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(BomService);
  });

  it('rejects a variant that no longer exists', async () => {
    prisma.productVariant.findUnique.mockResolvedValue(null);
    await expect(service.upsert('v1', { components: [] })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a variant not marked producedInHouse', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', producedInHouse: false });
    await expect(service.upsert('v1', { components: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a self-referencing component', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', producedInHouse: true });
    await expect(
      service.upsert('v1', { components: [{ componentVariantId: 'v1', quantityPerUnit: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replaces the line set atomically', async () => {
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'v1', producedInHouse: true });
    tx.billOfMaterial.upsert.mockResolvedValue({ id: 'bom1' });
    tx.billOfMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'bom1', components: [] });

    await service.upsert('v1', {
      name: 'Recipe',
      components: [{ componentVariantId: 'c1', quantityPerUnit: 2 }],
    });

    expect(tx.billOfMaterialLine.deleteMany).toHaveBeenCalledWith({ where: { billOfMaterialId: 'bom1' } });
    expect(tx.billOfMaterialLine.createMany).toHaveBeenCalledWith({
      data: [{ billOfMaterialId: 'bom1', componentVariantId: 'c1', quantityPerUnit: 2 }],
    });
  });
});
