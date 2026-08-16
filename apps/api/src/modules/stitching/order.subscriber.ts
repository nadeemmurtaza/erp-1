import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type OrderPlacedPayload } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { StitchingJobsService } from './jobs.service';

/**
 * Turns the stitched lines of a new order into tailor jobs, and tells the
 * customer when their garment reaches a stage worth hearing about.
 *
 * Like the CRM subscriber, this needed no edit to the orders module — the event
 * already named the stitched line ids.
 */
@Injectable()
export class StitchingOrderSubscriber {
  private readonly logger = new Logger(StitchingOrderSubscriber.name);

  constructor(
    private readonly jobs: StitchingJobsService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.OrderPlaced)
  async onOrderPlaced(payload: OrderPlacedPayload): Promise<void> {
    if (payload.stitchingItemIds.length === 0) return;

    for (const orderItemId of payload.stitchingItemIds) {
      // createForOrderItem is idempotent on the line id, so a redelivered
      // event cannot queue the same garment twice.
      await this.jobs.createForOrderItem(orderItemId);
    }

    this.logger.log(
      `Queued ${payload.stitchingItemIds.length} tailoring job(s) for ${payload.orderNumber}`,
    );
  }

  /**
   * Tells the customer when the garment is ready. The intermediate stages are
   * for the workshop; a message per stage would be noise.
   */
  @OnDomainEvent(DomainEvent.StitchingJobStageChanged)
  async onStageChanged(payload: {
    jobId: string;
    jobNumber: string;
    toStage: string;
  }): Promise<void> {
    if (payload.toStage !== 'READY') return;

    const job = await this.prisma.stitchingJob.findUnique({
      where: { id: payload.jobId },
      include: {
        garmentType: true,
        orderItem: {
          include: {
            order: { select: { number: true, guestName: true, guestPhone: true, guestEmail: true } },
          },
        },
        stitchingOrder: {
          select: { number: true, guestName: true, guestPhone: true, guestEmail: true },
        },
      },
    });

    const customer = job?.orderItem?.order ?? job?.stitchingOrder;
    if (!job || !customer) return;

    await this.notifications.send({
      template: 'stitching.ready',
      recipient: {
        name: customer.guestName,
        phone: customer.guestPhone,
        email: customer.guestEmail,
      },
      subject: `Your ${job.garmentType.labelEn} is ready`,
      body: `Your ${job.garmentType.labelEn} for ${
        job.orderItem?.order.number ?? job.stitchingOrder?.number
      } has been stitched and checked. It will be dispatched shortly.`,
      data: { jobNumber: job.number },
    });
  }
}
