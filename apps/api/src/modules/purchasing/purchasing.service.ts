import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto, AddSupplierProductDto } from './dto/supplier.dto';
import { CatalogService } from '../catalog/catalog.service';

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService, private readonly catalogService: CatalogService) {}

  async findAll() {
    return this.prisma.supplier.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        products: {
          include: { variant: true }
        }
      }
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    // Note: if making isActive=false, it warns (in UI), but allowed here.
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  // Note: deleting a supplier with purchase history is refused. However, purchaseOrders aren't there yet.
  // The spec says soft-delete via isActive, never hard-delete if it has history.
  async remove(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.delete({ where: { id } });
  }

  async getProducts(supplierId: string) {
    return this.prisma.supplierProduct.findMany({
      where: { supplierId },
      include: { variant: true }
    });
  }

  async addProduct(supplierId: string, dto: AddSupplierProductDto) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: dto.variantId } });
    if (!variant) throw new NotFoundException('Variant not found');

    const supplierProduct = await this.prisma.supplierProduct.upsert({
      where: { supplierId_variantId: { supplierId, variantId: dto.variantId } },
      update: {
        supplierSku: dto.supplierSku,
        lastCost: dto.lastCost,
        moq: dto.moq,
        leadTimeDays: dto.leadTimeDays,
        isPreferred: dto.isPreferred,
      },
      create: {
        supplierId,
        variantId: dto.variantId,
        supplierSku: dto.supplierSku,
        lastCost: dto.lastCost ?? 0,
        moq: dto.moq ?? 1,
        leadTimeDays: dto.leadTimeDays,
        isPreferred: dto.isPreferred ?? false,
      },
    });

    if (dto.isPreferred) {
      // Update the ProductVariant to point to this supplier.
      await this.prisma.productVariant.update({
        where: { id: dto.variantId },
        data: { preferredSupplierId: supplierId },
      });
      // Also unset isPreferred on other supplierProducts for this variant
      await this.prisma.supplierProduct.updateMany({
        where: { variantId: dto.variantId, supplierId: { not: supplierId } },
        data: { isPreferred: false },
      });
    }

    return supplierProduct;
  }

  async removeProduct(supplierId: string, variantId: string) {
    const supplierProduct = await this.prisma.supplierProduct.findUnique({
      where: { supplierId_variantId: { supplierId, variantId } },
    });
    if (!supplierProduct) return { deleted: false };

    await this.prisma.supplierProduct.delete({
      where: { id: supplierProduct.id },
    });

    // Note: If this was the preferred supplier, the relation preferredSupplierId 
    // won't automatically be nulled if the SupplierProduct is deleted, because the 
    // preferredSupplierId relation points to Supplier directly. But conceptually it should be cleared.
    if (supplierProduct.isPreferred) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { preferredSupplierId: null },
      });
    }

    return { deleted: true };
  }
}
