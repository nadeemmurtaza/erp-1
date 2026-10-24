import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { InventoryService } from './inventory.service';
import type { SpotCheckPolicy } from '../../../core/prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CreateSpotCheckPolicyInput {
  locationId?: string | null;
  minSkusPerCheck?: number;
  frequencyDays?: number;
}

/**
 * 156-single-employee-branch-loss-prevention.md §3. A small, unscheduled
 * StockCount-like sheet — a handful of SKUs, never the whole shop,
 * completable in minutes — fired at an unpredictable time within an
 * EXPECTED cadence, never a fixed schedule ("we always count on the 1st").
 */
@Injectable()
export class SpotCheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  // --- Policy CRUD -----------------------------------------------------

  async listPolicies() {
    return this.prisma.spotCheckPolicy.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createPolicy(input: CreateSpotCheckPolicyInput): Promise<SpotCheckPolicy> {
    if ((input.minSkusPerCheck ?? 5) < 1) throw new BadRequestException('minSkusPerCheck must be at least 1.');
    if ((input.frequencyDays ?? 3) < 1) throw new BadRequestException('frequencyDays must be at least 1.');
    return this.prisma.spotCheckPolicy.create({
      data: {
        locationId: input.locationId ?? null,
        minSkusPerCheck: input.minSkusPerCheck ?? 5,
        frequencyDays: input.frequencyDays ?? 3,
      },
    });
  }

  async updatePolicy(id: string, input: Partial<CreateSpotCheckPolicyInput> & { isActive?: boolean }) {
    const existing = await this.prisma.spotCheckPolicy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Spot-check policy not found.');
    return this.prisma.spotCheckPolicy.update({
      where: { id },
      data: {
        minSkusPerCheck: input.minSkusPerCheck,
        frequencyDays: input.frequencyDays,
        isActive: input.isActive,
      },
    });
  }

  // --- The unpredictability rule, pure and testable ---------------------

  /**
   * A policy that expects a check roughly every `frequencyDays` but fires at
   * a randomized time within that window, never the identical day-of-week
   * twice running. Once overdue, each hourly tick carries a small,
   * independent chance of firing — the exact hour is unpredictable, but the
   * check is still guaranteed to eventually land. `rng` is injectable so a
   * spec can seed it deterministically.
   */
  dueForRandomCheck(policy: Pick<SpotCheckPolicy, 'frequencyDays'>, lastScheduledFor: Date | null, now: Date, rng: () => number = Math.random): boolean {
    if (!lastScheduledFor) {
      // No history yet — settle into the same cadence as an overdue policy
      // rather than firing immediately on the very first tick after setup.
      return rng() < 1 / (policy.frequencyDays * 24);
    }
    const daysSince = (now.getTime() - lastScheduledFor.getTime()) / MS_PER_DAY;
    if (daysSince < policy.frequencyDays) return false;
    return rng() < 1 / (policy.frequencyDays * 24);
  }

  /**
   * Called hourly by InventoryCron. Never lets one location's failure skip
   * the rest — a failure here is logged and the loop continues (services.md:
   * "never silently skipping every location because one failed").
   */
  async maybeTriggerDueChecks(now: Date = new Date()): Promise<string[]> {
    const policies = await this.prisma.spotCheckPolicy.findMany({ where: { isActive: true } });
    const created: string[] = [];

    for (const policy of policies) {
      const locationIds = await this.resolveLocationIds(policy);
      for (const locationId of locationIds) {
        const lastCheck = await this.prisma.spotCheck.findFirst({
          where: { policyId: policy.id, locationId },
          orderBy: { scheduledFor: 'desc' },
        });

        // Idempotency: a PENDING/IN_PROGRESS check already outstanding for
        // this policy+location is never doubled by a second cron tick.
        if (lastCheck && (lastCheck.status === 'PENDING' || lastCheck.status === 'IN_PROGRESS')) continue;

        if (this.dueForRandomCheck(policy, lastCheck?.scheduledFor ?? null, now)) {
          const check = await this.createSpotCheck(policy, locationId, now);
          if (check) created.push(check.id);
        }
      }
    }

    return created;
  }

  private async resolveLocationIds(policy: SpotCheckPolicy): Promise<string[]> {
    if (policy.locationId) return [policy.locationId];
    const specificLocationIds = new Set(
      (await this.prisma.spotCheckPolicy.findMany({ where: { locationId: { not: null }, isActive: true }, select: { locationId: true } })).map(
        (p) => p.locationId as string,
      ),
    );
    const locations = await this.prisma.location.findMany({ where: { isActive: true }, select: { id: true } });
    return locations.map((l) => l.id).filter((id) => !specificLocationIds.has(id));
  }

  private async createSpotCheck(policy: SpotCheckPolicy, locationId: string, scheduledFor: Date) {
    const sample = await this.prisma.$queryRaw<Array<{ variantId: string; quantity: number }>>`
      SELECT "variantId", quantity FROM "VariantLocationStock"
      WHERE "locationId" = ${locationId}
      ORDER BY RANDOM()
      LIMIT ${policy.minSkusPerCheck}
    `;
    if (sample.length === 0) return null;

    return this.prisma.spotCheck.create({
      data: {
        policyId: policy.id,
        locationId,
        scheduledFor,
        lines: { create: sample.map((row) => ({ variantId: row.variantId, expected: row.quantity })) },
      },
    });
  }

  // --- Counting, the same expected-is-frozen-at-start discipline as
  //     WO-1.7's StockCountLine -------------------------------------------

  async findAll() {
    return this.prisma.spotCheck.findMany({
      orderBy: { scheduledFor: 'desc' },
      include: { location: { select: { id: true, name: true, code: true } }, lines: { select: { id: true } } },
    });
  }

  async findOne(id: string) {
    const check = await this.prisma.spotCheck.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, code: true } },
        lines: { include: { variant: { select: { id: true, sku: true, label: true, barcode: true } } } },
      },
    });
    if (!check) throw new NotFoundException('Spot check not found.');
    return check;
  }

  async start(id: string) {
    const check = await this.prisma.spotCheck.findUnique({ where: { id } });
    if (!check) throw new NotFoundException('Spot check not found.');
    if (check.status !== 'PENDING') throw new BadRequestException('Only a PENDING spot check can be started.');
    return this.prisma.spotCheck.update({ where: { id }, data: { status: 'IN_PROGRESS', startedAt: new Date() } });
  }

  async scan(id: string, barcode: string) {
    return this.prisma.$transaction(async (tx) => {
      const check = await tx.spotCheck.findUnique({ where: { id } });
      if (!check) throw new NotFoundException('Spot check not found.');
      if (check.status !== 'IN_PROGRESS') throw new BadRequestException('Can only scan while a spot check is IN_PROGRESS.');

      const variant = await tx.productVariant.findUnique({ where: { barcode } });
      if (!variant) throw new NotFoundException('Barcode not found.');

      const line = await tx.spotCheckLine.findUnique({ where: { spotCheckId_variantId: { spotCheckId: id, variantId: variant.id } } });
      if (!line) throw new BadRequestException('That SKU is not part of this spot check.');

      return tx.spotCheckLine.update({ where: { id: line.id }, data: { counted: (line.counted ?? 0) + 1 } });
    });
  }

  /**
   * Posts each non-zero variance against CURRENT stock (never `expected`,
   * exactly WO-1.7's own rule) through InventoryService.move(), so a sale
   * mid-check is never mistaken for shrinkage.
   */
  async complete(id: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const check = await tx.spotCheck.findUnique({ where: { id }, include: { lines: true } });
      if (!check) throw new NotFoundException('Spot check not found.');
      if (check.status !== 'IN_PROGRESS') throw new BadRequestException('Can only complete an IN_PROGRESS spot check.');

      const countedLines = check.lines.filter((l) => l.counted !== null);
      const currentStocks = await tx.variantLocationStock.findMany({
        where: { locationId: check.locationId, variantId: { in: countedLines.map((l) => l.variantId) } },
      });
      const currentByVariant = new Map(currentStocks.map((s) => [s.variantId, s.quantity]));

      const moveInputs = [];
      for (const line of countedLines) {
        const current = currentByVariant.get(line.variantId) ?? 0;
        const variance = line.counted! - current;
        await tx.spotCheckLine.update({ where: { id: line.id }, data: { variance } });
        if (variance !== 0) {
          moveInputs.push({
            variantId: line.variantId,
            locationId: check.locationId,
            delta: variance,
            reason: 'COUNT' as const,
            refType: 'SpotCheck',
            refId: check.id,
            actorId: userId,
          });
        }
      }

      if (moveInputs.length > 0) {
        await this.inventory.moveMany(moveInputs, tx);
      }

      return tx.spotCheck.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    });
  }
}
