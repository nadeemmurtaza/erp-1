import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { OnDomainEvent } from '../../core/events/on-domain-event.decorator';
import { DomainEvent, type BulletinPublishedPayload } from '../../core/events/domain-events';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AudienceService } from './audience.service';

/**
 * tasks-notifications-support/61-policy-communications-bulletin.md
 * (WO-61.3). The only subscriber to `BulletinPublished` — resolves the
 * audience through `AudienceService.resolve()`, the identical mechanism
 * `NotifyService` already uses for a broadcast, and sends through
 * `NotificationsService`. No new channel, no bulletin-specific audience
 * resolution.
 */
@Injectable()
export class BulletinNotificationListener {
  private readonly logger = new Logger(BulletinNotificationListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: AudienceService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnDomainEvent(DomainEvent.BulletinPublished)
  async onBulletinPublished(payload: BulletinPublishedPayload): Promise<void> {
    const bulletin = await this.prisma.bulletin.findUnique({ where: { id: payload.bulletinId } });
    if (!bulletin || bulletin.archivedAt) return; // retracted before the outbox delivered it

    const resolution = await this.audience.resolve({ orgUnitId: payload.audienceOrgUnitId }, bulletin.authorId);
    for (const recipient of resolution.recipients) {
      await this.notifications.send({
        template: 'notify.bulletin',
        recipient: { name: recipient.name, email: recipient.email, phone: recipient.phone, userId: recipient.userId },
        subject: bulletin.title,
        body: `A new notice has been posted: ${bulletin.title}`,
        data: { bulletinId: bulletin.id, category: bulletin.category },
      });
    }
    this.logger.debug(`bulletin ${bulletin.id} notified ${resolution.recipients.length} recipient(s)`);
  }
}
