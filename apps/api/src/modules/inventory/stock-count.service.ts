import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { InventoryService } from './inventory.service';
import { Prisma } from '../../core/prisma/client';

const SC_NUMBER_LOCK_NAMESPACE = 8_241_122;

async function nextSCNumber(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SC-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SC_NUMBER_LOCK_NAMESPACE}::int, ${year}::int)`;
  const [{ max }] = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(split_part("countNumber", '-', 3) AS INTEGER)) AS max
    FROM "StockCount"
    WHERE "countNumber" LIKE ${`${prefix}%`}
  `;
  const nextSequence = (max ?? 0) + 1;
  return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
}

@Injectable()
export class StockCountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  async findAll() {
    return this.prisma.stockCount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async findOne(id: string) {
    const count = await this.prisma.stockCount.findUnique({
      where: { id },
      include: {
        creator: { select: { firstName: true, lastName: true } },
        assignee: { select: { firstName: true, lastName: true } },
        lines: {
          include: {
            variant: {
              include: {
                product: {
                  include: { translations: { where: { locale: 'en' }, take: 1 } },
                },
              },
            },
          },
          orderBy: { variantId: 'asc' },
        },
      },
    });
    if (!count) throw new NotFoundException('Stock count not found');
    return count;
  }

  async create(data: { note?: string; assignedTo?: string }, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const number = await nextSCNumber(tx);
      return tx.stockCount.create({
        data: {
          countNumber: number,
          status: 'DRAFT',
          note: data.note,
          assignedTo: data.assignedTo,
          createdBy: userId,
        },
      });
    });
  }

  async start(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id } });
      if (!count) throw new NotFoundException('Stock count not found');
      if (count.status !== 'DRAFT') throw new BadRequestException('Count is not in DRAFT status');

      const activeVariants = await tx.productVariant.findMany({
        where: { isActive: true },
        select: { id: true, stock: true },
      });

      await tx.stockCountLine.createMany({
        data: activeVariants.map((v) => ({
          stockCountId: id,
          variantId: v.id,
          expected: v.stock,
          counted: null,
        })),
      });

      return tx.stockCount.update({
        where: { id },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date(),
        },
      });
    });
  }

  async scan(id: string, barcode: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id } });
      if (!count) throw new NotFoundException('Stock count not found');
      if (count.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Can only scan when count is IN_PROGRESS');
      }

      const variant = await tx.productVariant.findUnique({
        where: { barcode },
      });
      if (!variant) throw new NotFoundException('Barcode not found');

      const existingLine = await tx.stockCountLine.findUnique({
        where: { stockCountId_variantId: { stockCountId: id, variantId: variant.id } },
      });

      if (!existingLine) {
        // Line didn't exist at start time. Create it now.
        return tx.stockCountLine.create({
          data: {
            stockCountId: id,
            variantId: variant.id,
            expected: variant.stock, // Fallback if created late
            counted: 1,
          },
        });
      } else {
        return tx.stockCountLine.update({
          where: { id: existingLine.id },
          data: {
            counted: (existingLine.counted ?? 0) + 1,
          },
        });
      }
    });
  }
  
  async updateLine(id: string, variantId: string, counted: number | null) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({ where: { id } });
      if (!count) throw new NotFoundException('Stock count not found');
      if (count.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Can only edit lines when count is IN_PROGRESS');
      }
      
      const existingLine = await tx.stockCountLine.findUnique({
        where: { stockCountId_variantId: { stockCountId: id, variantId } },
      });
      if (!existingLine) throw new NotFoundException('Line not found');

      return tx.stockCountLine.update({
         where: { id: existingLine.id },
         data: { counted },
      });
    });
  }

  async complete(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findUnique({
        where: { id },
        include: { lines: true },
      });
      if (!count) throw new NotFoundException('Stock count not found');
      if (count.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Can only complete an IN_PROGRESS count');
      }

      const linesToMove = count.lines.filter(l => l.counted !== null);
      
      // Load current stock
      const variantIds = linesToMove.map(l => l.variantId);
      const variants = await tx.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, stock: true },
      });
      const stockMap = new Map(variants.map(v => [v.id, v.stock]));

      const locationId = await this.inventoryService.defaultLocationId(tx);
      const moveInputs = [];
      for (const line of linesToMove) {
        const currentStock = stockMap.get(line.variantId) ?? 0;
        const delta = line.counted! - currentStock;
        if (delta !== 0) {
          moveInputs.push({
            variantId: line.variantId,
            locationId,
            delta,
            reason: 'COUNT' as const,
            refType: 'StockCount',
            refId: count.id,
            actorId: userId,
          });
        }
      }

      if (moveInputs.length > 0) {
        await this.inventoryService.moveMany(moveInputs, tx);
      }

      return tx.stockCount.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
    });
  }
}
