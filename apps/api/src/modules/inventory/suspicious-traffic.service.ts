import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { CameraPeopleCountRegistry } from '../../core/extension-points/camera-people-count.registry';

export interface SuspiciousTrafficReport {
  locationId: string;
  date: string;
  cameraFootTraffic: number | null;
  posTransactionCount: number;
  /** null when cameraFootTraffic is unavailable or there were no transactions to divide by. */
  ratio: number | null;
}

/**
 * 156-single-employee-branch-loss-prevention.md §4. A camera reporting 60
 * people entered while the till recorded 12 transactions is not proof of
 * anything on its own — it is a SIGNAL for a human to look at the footage
 * for that day, never an automated accusation. This is a REPORT, never
 * itself a disciplinary action, and it degrades to an explicit "no camera
 * people-count available" state rather than a fabricated ratio.
 */
@Injectable()
export class SuspiciousTrafficService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cameraPeopleCount: CameraPeopleCountRegistry,
  ) {}

  async report(locationId: string, date: Date): Promise<SuspiciousTrafficReport> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [cameraFootTraffic, posSales] = await Promise.all([
      this.cameraPeopleCount.countForDate(locationId, dayStart),
      // Distinct Orders, not StockMovement rows — one order can carry
      // several lines/movements. locationId is already named directly on
      // every POS_SALE movement (WO-17), never a defaultLocationId() guess.
      this.prisma.stockMovement.findMany({
        where: { locationId, reason: 'POS_SALE', createdAt: { gte: dayStart, lt: dayEnd } },
        select: { refId: true },
        distinct: ['refId'],
      }),
    ]);

    const posTransactionCount = posSales.filter((m) => m.refId !== null).length;
    const ratio = cameraFootTraffic !== null && posTransactionCount > 0 ? cameraFootTraffic / posTransactionCount : null;

    return {
      locationId,
      date: dayStart.toISOString().slice(0, 10),
      cameraFootTraffic,
      posTransactionCount,
      ratio,
    };
  }
}
