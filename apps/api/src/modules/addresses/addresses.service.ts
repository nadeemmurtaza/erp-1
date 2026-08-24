import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/** A customer's own saved delivery addresses. Every method is scoped to userId — there is no cross-account read here. */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }

      return tx.address.create({
        data: {
          userId,
          label: dto.label?.trim() || null,
          fullName: dto.fullName.trim(),
          phone: dto.phone.trim(),
          line1: dto.line1.trim(),
          line2: dto.line2?.trim() || null,
          city: dto.city.trim(),
          province: dto.province.trim(),
          postalCode: dto.postalCode?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.ownAddress(userId, addressId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, NOT: { id: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() || null } : {}),
          ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.line1 !== undefined ? { line1: dto.line1.trim() } : {}),
          ...(dto.line2 !== undefined ? { line2: dto.line2.trim() || null } : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.province !== undefined ? { province: dto.province.trim() } : {}),
          ...(dto.postalCode !== undefined ? { postalCode: dto.postalCode.trim() || null } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.ownAddress(userId, addressId);
    await this.prisma.address.delete({ where: { id: addressId } });
  }

  private async ownAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: { userId: true },
    });
    if (!address) {
      throw new NotFoundException('That address no longer exists.');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('That address belongs to another account.');
    }
  }
}
