import { BadRequestException, ConflictException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { Asset, AssetAssignment, AssetStatus } from '../../core/prisma/client';
import { EmployeeOffboardingRegistry } from '../../core/extension-points/employee-offboarding.registry';
import { CreateAssetDto } from './dto/asset.dto';

/**
 * Which physical equipment is issued to which employee, and whether it came
 * back (hr-people-org/79-employee-asset-management.md). `AssetAssignment`
 * is a history table, never a mutable current-holder column — the same
 * discipline `StockMovement` already establishes for stock: `returnedAt IS
 * NULL` is the one query answering "who currently has this."
 */
@Injectable()
export class AssetsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly offboarding: EmployeeOffboardingRegistry,
  ) {}

  /**
   * Registers `EmployeeOffboardingRegistry`'s handler (WO-79.4), so `users`
   * (always-on) can ask "does this person still hold company equipment?"
   * before deactivating their account, without importing `hr` directly.
   */
  onModuleInit(): void {
    this.offboarding.register({
      unreturnedAssetsFor: async (userId) => {
        const open = await this.unreturnedAssetsFor(userId);
        return open.map((a) => ({ assetTag: a.asset.assetTag, category: a.asset.category }));
      },
    });
  }

  async listAssets(status?: AssetStatus): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAsset(id: string) {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { issuedAt: 'desc' },
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            issuedBy: { select: { id: true, firstName: true, lastName: true } },
            returnedBy: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!asset) throw new NotFoundException('No such asset.');
    return asset;
  }

  async createAsset(dto: CreateAssetDto): Promise<Asset> {
    const existing = await this.prisma.asset.findUnique({ where: { assetTag: dto.assetTag } });
    if (existing) throw new ConflictException(`An asset tagged "${dto.assetTag}" already exists.`);

    return this.prisma.asset.create({
      data: {
        assetTag: dto.assetTag,
        category: dto.category,
        description: dto.description,
        purchaseCostMinor: dto.purchaseCostMinor,
        purchasedOn: dto.purchasedOn ? new Date(dto.purchasedOn) : undefined,
      },
    });
  }

  /**
   * Refuses an already-`ASSIGNED` asset — checked against `Asset.status`
   * itself, not a second query over open assignments, so the same
   * transaction that flips status to `ASSIGNED` is what a concurrent second
   * issue call collides with.
   */
  async issue(assetId: string, userId: string, issuedById: string): Promise<AssetAssignment> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new NotFoundException('No such asset.');
      if (asset.status !== 'AVAILABLE') {
        throw new BadRequestException(`${asset.assetTag} is ${asset.status}, not AVAILABLE — it cannot be issued.`);
      }

      const assignment = await tx.assetAssignment.create({
        data: { assetId, userId, issuedById },
      });
      await tx.asset.update({ where: { id: assetId }, data: { status: 'ASSIGNED' } });
      return assignment;
    });
  }

  async returnAsset(assignmentId: string, returnedById: string, condition?: string): Promise<AssetAssignment> {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.findUnique({ where: { id: assignmentId } });
      if (!assignment) throw new NotFoundException('No such assignment.');
      if (assignment.returnedAt) throw new BadRequestException('This assignment was already returned.');

      const updated = await tx.assetAssignment.update({
        where: { id: assignmentId },
        data: { returnedAt: new Date(), returnedById, condition },
      });
      await tx.asset.update({ where: { id: assignment.assetId }, data: { status: 'AVAILABLE' } });
      return updated;
    });
  }

  /**
   * Marks an asset `RETIRED`/`LOST` — a real, gated cost
   * (`hr.assets.writeoff`, distinct from day-to-day `hr.assets.manage`).
   * Closes any open assignment as part of the same write, with a note
   * naming the write-off, so a written-off asset never keeps blocking its
   * former holder's offboarding via `unreturnedAssetsFor()`.
   */
  async writeOff(assetId: string, status: Extract<AssetStatus, 'RETIRED' | 'LOST'>, actorId: string): Promise<Asset> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({ where: { id: assetId } });
      if (!asset) throw new NotFoundException('No such asset.');
      if (asset.status === 'RETIRED' || asset.status === 'LOST') {
        throw new BadRequestException(`${asset.assetTag} is already ${asset.status}.`);
      }

      const openAssignment = await tx.assetAssignment.findFirst({
        where: { assetId, returnedAt: null },
      });
      if (openAssignment) {
        await tx.assetAssignment.update({
          where: { id: openAssignment.id },
          data: { returnedAt: new Date(), returnedById: actorId, condition: `Written off: ${status}` },
        });
      }

      return tx.asset.update({ where: { id: assetId }, data: { status } });
    });
  }

  /** The one query an offboarding flow calls before letting an exit complete. */
  async unreturnedAssetsFor(userId: string): Promise<(AssetAssignment & { asset: Asset })[]> {
    return this.prisma.assetAssignment.findMany({
      where: { userId, returnedAt: null },
      include: { asset: true },
    });
  }
}
