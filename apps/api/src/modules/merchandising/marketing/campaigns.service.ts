import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@newax/shared';
import { AppConfigService } from '../../../core/config/app-config.service';
import { segmentFilterToWhere } from '../../../core/crm/segment-filter-engine';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type { Prisma } from '../../../core/prisma/client';
import type { SegmentFilter } from '@newax/shared';
import type { CreateCampaignDto, ScheduleCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

const CHANNEL_NOTIFICATION_NAME: Record<string, string> = {
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
};

const campaignInclude = { segment: { select: { id: true, name: true } } } satisfies Prisma.CampaignInclude;

/**
 * WO-8.4. Campaign/CampaignRecipient are marketing's own tables
 * (marketing.prisma); resolving WHO the audience is reads Contact directly
 * via segmentFilterToWhere (core/crm/segment-filter-engine.ts) rather than
 * importing crm's SegmentsService — see that file's own header comment for
 * why it lives in core instead of being duplicated.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfigService,
  ) {}

  listCampaigns() {
    return this.prisma.campaign.findMany({ include: campaignInclude, orderBy: { createdAt: 'desc' } });
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { ...campaignInclude, recipients: { include: { contact: { select: { name: true } } } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private async getCampaignOrThrow(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async createCampaign(dto: CreateCampaignDto, createdById: string) {
    const segment = await this.prisma.segment.findUnique({ where: { id: dto.segmentId } });
    if (!segment) throw new BadRequestException('Unknown segment');

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        channel: dto.channel,
        segmentId: dto.segmentId,
        content: dto.content as Prisma.InputJsonValue,
        createdById,
      },
      include: campaignInclude,
    });
  }

  async updateCampaign(id: string, dto: UpdateCampaignDto) {
    const campaign = await this.getCampaignOrThrow(id);
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT campaign can be edited');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { name: dto.name, segmentId: dto.segmentId, content: dto.content as Prisma.InputJsonValue | undefined },
      include: campaignInclude,
    });
  }

  async cancelCampaign(id: string) {
    const campaign = await this.getCampaignOrThrow(id);
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new BadRequestException('Only a DRAFT or SCHEDULED campaign can be cancelled');
    }
    return this.prisma.campaign.update({ where: { id }, data: { status: 'CANCELLED' }, include: campaignInclude });
  }

  /** Moves DRAFT -> SCHEDULED. The dispatch cron picks it up once scheduledAt has passed. */
  async scheduleCampaign(id: string, dto: ScheduleCampaignDto) {
    const campaign = await this.getCampaignOrThrow(id);
    if (campaign.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT campaign can be scheduled');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: { status: 'SCHEDULED', scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date() },
      include: campaignInclude,
    });
  }

  /**
   * Materialises CampaignRecipient rows for every SCHEDULED campaign whose
   * time has come, moving it to SENDING. Called by CampaignDispatchCron —
   * split from the actual sending step so a very large segment's recipient
   * rows exist (and are visible in the admin) even before the rate-limited
   * send loop has worked through all of them.
   */
  async materializeScheduledCampaigns(): Promise<void> {
    const due = await this.prisma.campaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: new Date() } },
    });

    for (const campaign of due) {
      try {
        const segment = await this.prisma.segment.findUniqueOrThrow({ where: { id: campaign.segmentId } });
        const members = await this.prisma.contact.findMany({
          where: segmentFilterToWhere(segment.filter as unknown as SegmentFilter),
          select: { id: true },
        });

        await this.prisma.$transaction([
          this.prisma.campaignRecipient.createMany({
            data: members.map((m) => ({ campaignId: campaign.id, contactId: m.id })),
            skipDuplicates: true,
          }),
          this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } }),
        ]);
      } catch (error) {
        this.logger.error(
          `failed to materialize recipients for campaign ${campaign.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Sends up to `batchSize` PENDING recipients across every SENDING
   * campaign — CampaignDispatchCron's own rate limit
   * (marketing.campaign_send_rate_per_minute), spread across one cron tick
   * per minute. Opt-out is checked HERE, at send time, never at list-build
   * time — the doc's own non-negotiable, since a contact can opt out
   * between materialisation and send.
   */
  async sendPendingBatch(batchSize: number): Promise<number> {
    const pending = await this.prisma.campaignRecipient.findMany({
      where: { status: 'PENDING' },
      take: batchSize,
      include: { campaign: true, contact: true },
    });

    let sent = 0;
    for (const recipient of pending) {
      await this.sendOne(recipient);
      sent += 1;
    }

    await this.closeFullySentCampaigns();
    return sent;
  }

  private async sendOne(
    recipient: Prisma.CampaignRecipientGetPayload<{ include: { campaign: true; contact: true } }>,
  ): Promise<void> {
    const { campaign, contact } = recipient;

    if (contact.marketingOptOut) {
      await this.markRecipient(recipient.id, 'SKIPPED_OPT_OUT');
      return;
    }

    const channelKey = CHANNEL_NOTIFICATION_NAME[campaign.channel];
    const reachable =
      campaign.channel === 'EMAIL'
        ? Boolean(contact.email)
        : Boolean(contact.phoneE164) &&
          (await this.prisma.phoneOptOut.findUnique({ where: { phoneE164: contact.phoneE164! } })) === null;
    if (!reachable) {
      await this.markRecipient(recipient.id, campaign.channel === 'EMAIL' || !contact.phoneE164 ? 'SKIPPED_NO_CONTACT' : 'SKIPPED_OPT_OUT');
      return;
    }

    const content = campaign.content as unknown as Record<string, { subject?: string; body: string }>;
    const locale: Locale = DEFAULT_LOCALE;
    const rendered = content[locale] ?? Object.values(content)[0];
    if (!rendered) {
      await this.markRecipient(recipient.id, 'FAILED', 'No content for any locale');
      return;
    }

    try {
      const pixelUrl = campaign.channel === 'EMAIL' ? this.openTrackingUrl(recipient.id) : null;
      const body = pixelUrl
        ? `${rendered.body}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none" />`
        : rendered.body;

      await this.notifications.send({
        template: 'marketing.campaign',
        recipient: {
          name: contact.name,
          email: contact.email,
          phone: contact.phoneE164,
          locale: isLocale(locale) ? locale : DEFAULT_LOCALE,
        },
        subject: rendered.subject ?? campaign.name,
        body,
        data: { campaignId: campaign.id, channel: channelKey },
      });
      await this.markRecipient(recipient.id, 'SENT');
    } catch (error) {
      await this.markRecipient(recipient.id, 'FAILED', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * A 1x1 tracking pixel URL, auto-appended to every EMAIL campaign send.
   * Click tracking exists too (recordClick(), below) but is not
   * auto-rewritten into a campaign's own links — the admin wraps a link
   * through it manually; rewriting arbitrary HTML links safely is a named
   * follow-on (Phase 8 status note), not something to fake with a regex.
   */
  private openTrackingUrl(recipientId: string): string | null {
    const base = this.config.get('API_PUBLIC_URL');
    if (!base) return null;
    return `${base.replace(/\/+$/, '')}/campaigns/r/${recipientId}/open.gif`;
  }

  async recordOpen(recipientId: string): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { id: recipientId, openedAt: null },
      data: { openedAt: new Date() },
    });
  }

  async recordClick(recipientId: string): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { id: recipientId, clickedAt: null },
      data: { clickedAt: new Date() },
    });
  }

  private async markRecipient(id: string, status: string, failureReason?: string): Promise<void> {
    await this.prisma.campaignRecipient.update({
      where: { id },
      data: { status: status as never, sentAt: status === 'SENT' ? new Date() : undefined, failureReason },
    });
  }

  private async closeFullySentCampaigns(): Promise<void> {
    const sending = await this.prisma.campaign.findMany({ where: { status: 'SENDING' } });
    for (const campaign of sending) {
      const remaining = await this.prisma.campaignRecipient.count({
        where: { campaignId: campaign.id, status: 'PENDING' },
      });
      if (remaining === 0) {
        await this.prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SENT', sentAt: new Date() } });
      }
    }
  }
}
