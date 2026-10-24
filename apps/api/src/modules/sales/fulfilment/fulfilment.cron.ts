import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { FulfilmentService } from './fulfilment.service';

const TERMINAL_STATUSES = ['DELIVERED', 'RETURNED', 'LOST'] as const;
/** Stop polling every 30 minutes once a shipment has sat still this long — polled at most once a day after that (WO-6.5's own backoff rule). */
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const STALE_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** A courier's own attempt cap before a shipment surfaces as needing a human rather than being polled forever. */
const MAX_FAILED_ATTEMPTS = 10;

/**
 * WO-6.5 — polls every non-terminal shipment's courier every 30 minutes and
 * feeds the result through FulfilmentService.applyStatusChange(), the same
 * writer a staff-recorded status uses. `manual` shipments are skipped
 * entirely: ManualCourierProvider.track() has nothing to ask (its own doc
 * comment) — their status only ever changes through the admin "record
 * status" action.
 */
@Injectable()
export class FulfilmentCron {
  private readonly logger = new Logger(FulfilmentCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fulfilment: FulfilmentService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async pollActiveShipments(): Promise<void> {
    const now = Date.now();
    const shipments = await this.prisma.shipment.findMany({
      where: {
        status: { notIn: [...TERMINAL_STATUSES] },
        failedAttempts: { lt: MAX_FAILED_ATTEMPTS },
      },
      select: { id: true, trackingNumber: true, courier: true, status: true, updatedAt: true, lastPolledAt: true },
    });

    let polled = 0;
    let changed = 0;
    let failed = 0;

    for (const shipment of shipments) {
      if (shipment.courier === 'manual' || !shipment.trackingNumber) continue;

      const isStale = now - shipment.updatedAt.getTime() > STALE_AFTER_MS;
      if (isStale && shipment.lastPolledAt && now - shipment.lastPolledAt.getTime() < STALE_POLL_INTERVAL_MS) {
        continue;
      }

      polled += 1;
      try {
        const provider = this.fulfilment.getProvider(shipment.courier);
        const result = await provider.track(shipment.trackingNumber);
        await this.fulfilment.applyStatusChange(
          shipment.id,
          { status: result.status, rawStatus: result.rawStatus, meta: result.meta },
          null,
        );
        if (shipment.status !== result.status) changed += 1;
      } catch (error) {
        failed += 1;
        await this.prisma.shipment.update({
          where: { id: shipment.id },
          data: { failedAttempts: { increment: 1 } },
        });
        this.logger.warn(
          `Tracking poll failed for shipment ${shipment.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (polled > 0 || failed > 0) {
      this.logger.log(`Tracking sweep: ${polled} polled, ${changed} changed status, ${failed} failed`);
    }
  }
}
