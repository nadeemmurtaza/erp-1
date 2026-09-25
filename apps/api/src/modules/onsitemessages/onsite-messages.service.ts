import { Injectable, NotFoundException } from '@nestjs/common';
import { pickTranslation, type ActiveOnsiteMessage, type SegmentFilter } from '@newax/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, type NewsletterSubscriber } from '../../core/prisma/client';
import { paginated, type PaginatedResult } from '../../core/common/dto/pagination.dto';
import { segmentFilterToWhere } from '../../core/crm/segment-filter-engine';
import type { CreateOnsiteMessageDto, UpdateOnsiteMessageDto } from './dto/onsite-message.dto';

const messageInclude = { translations: true } satisfies Prisma.OnsiteMessageInclude;

type OnsiteMessageWithTranslations = Prisma.OnsiteMessageGetPayload<{ include: typeof messageInclude }>;

/**
 * WO-8.6. Reads Segment (crm's own table) and Contact directly through
 * Prisma rather than importing SegmentsService — the same read-across-
 * modules idiom marketing's CampaignsService already uses for the identical
 * problem (segment-filter-engine.ts's own header comment); a page render is
 * not the same-transaction-write case KNOWN_MODULE_COUPLINGS exists for.
 */
@Injectable()
export class OnsiteMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Admin CRUD ---------------------------------------------------------

  listMessages() {
    return this.prisma.onsiteMessage.findMany({ include: messageInclude, orderBy: { createdAt: 'desc' } });
  }

  async getMessage(id: string) {
    const message = await this.prisma.onsiteMessage.findUnique({ where: { id }, include: messageInclude });
    if (!message) throw new NotFoundException('On-site message not found');
    return message;
  }

  private async getMessageOrThrow(id: string) {
    const message = await this.prisma.onsiteMessage.findUnique({ where: { id } });
    if (!message) throw new NotFoundException('On-site message not found');
    return message;
  }

  createMessage(dto: CreateOnsiteMessageDto) {
    return this.prisma.onsiteMessage.create({
      data: {
        kind: dto.kind,
        pagePattern: dto.pagePattern,
        segmentId: dto.segmentId,
        trigger: dto.trigger,
        delaySeconds: dto.delaySeconds,
        linkUrl: dto.linkUrl,
        isActive: dto.isActive ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        translations: { create: dto.translations },
      },
      include: messageInclude,
    });
  }

  async updateMessage(id: string, dto: UpdateOnsiteMessageDto) {
    await this.getMessageOrThrow(id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.translations) {
        for (const t of dto.translations) {
          await tx.onsiteMessageTranslation.upsert({
            where: { onsiteMessageId_locale: { onsiteMessageId: id, locale: t.locale } },
            create: { onsiteMessageId: id, ...t },
            update: t,
          });
        }
      }
      return tx.onsiteMessage.update({
        where: { id },
        data: {
          kind: dto.kind,
          pagePattern: dto.pagePattern,
          segmentId: dto.segmentId,
          trigger: dto.trigger,
          delaySeconds: dto.delaySeconds,
          linkUrl: dto.linkUrl,
          isActive: dto.isActive,
          startsAt: dto.startsAt === null ? null : dto.startsAt ? new Date(dto.startsAt) : undefined,
          endsAt: dto.endsAt === null ? null : dto.endsAt ? new Date(dto.endsAt) : undefined,
        },
        include: messageInclude,
      });
    });
  }

  async deleteMessage(id: string): Promise<void> {
    await this.getMessageOrThrow(id);
    await this.prisma.onsiteMessage.delete({ where: { id } });
  }

  // --- Public reads ---------------------------------------------------------

  /**
   * Every message that should show right now, for this page and this
   * visitor. `path` matches a message's `pagePattern` as a prefix — null
   * targets every page. A `segmentId`-targeted message only ever matches a
   * signed-in customer with a linked Contact row: an anonymous visitor has
   * no order history to be "in a segment" of, so it simply never sees one —
   * an honest limit, not a bug, the same shape as search's own
   * canRouteThroughSearch note in apps/web/src/lib/api.ts.
   */
  async activeMessages(path: string, locale: string, userId?: string): Promise<ActiveOnsiteMessage[]> {
    const now = new Date();
    const candidates = await this.prisma.onsiteMessage.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: messageInclude,
    });

    const pageMatched = candidates.filter(
      (message) => !message.pagePattern || path.startsWith(message.pagePattern),
    );

    const segmented = pageMatched.filter((message) => message.segmentId);
    const unsegmented = pageMatched.filter((message) => !message.segmentId);

    const matchedSegmented = segmented.length > 0 ? await this.filterBySegment(segmented, userId) : [];

    return [...unsegmented, ...matchedSegmented].map((message) => {
      const translation = pickTranslation(message.translations, locale);
      return {
        id: message.id,
        kind: message.kind,
        trigger: message.trigger,
        delaySeconds: message.delaySeconds,
        linkUrl: message.linkUrl,
        headline: translation?.headline ?? null,
        body: translation?.body ?? null,
        ctaLabel: translation?.ctaLabel ?? null,
      };
    });
  }

  private async filterBySegment(
    messages: OnsiteMessageWithTranslations[],
    userId: string | undefined,
  ): Promise<OnsiteMessageWithTranslations[]> {
    if (!userId) return [];
    const contact = await this.prisma.contact.findUnique({ where: { userId }, select: { id: true } });
    if (!contact) return [];

    const segmentIds = [...new Set(messages.map((m) => m.segmentId).filter((id): id is string => Boolean(id)))];
    const segments = await this.prisma.segment.findMany({ where: { id: { in: segmentIds } } });

    const matchingSegmentIds = new Set<string>();
    for (const segment of segments) {
      const isMember = await this.prisma.contact.findFirst({
        where: { AND: [{ id: contact.id }, segmentFilterToWhere(segment.filter as unknown as SegmentFilter)] },
        select: { id: true },
      });
      if (isMember) matchingSegmentIds.add(segment.id);
    }

    return messages.filter((m) => m.segmentId && matchingSegmentIds.has(m.segmentId));
  }

  // --- Newsletter -----------------------------------------------------------

  /** Re-subscribing clears a prior opt-out — a customer signing up again means it again. */
  async subscribeNewsletter(email: string, locale: string): Promise<void> {
    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email, locale },
      update: { locale, optedOutAt: null },
    });
  }

  async listSubscribers(page: number, pageSize: number): Promise<PaginatedResult<NewsletterSubscriber>> {
    const [data, total] = await Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        orderBy: { subscribedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.newsletterSubscriber.count(),
    ]);
    return paginated(data, total, { page, pageSize });
  }

  /** Every still-subscribed row, for CSV export — same "the whole matching set, not one page" idiom as crm's contacts export. */
  listAllActiveSubscribers(): Promise<NewsletterSubscriber[]> {
    return this.prisma.newsletterSubscriber.findMany({
      where: { optedOutAt: null },
      orderBy: { subscribedAt: 'desc' },
    });
  }

  /** The admin-side opt-out — a staff member honouring an unsubscribe request made outside the product (a reply, a call), since no campaign send targets this list yet to carry a self-service link. */
  async optOutSubscriber(id: string): Promise<void> {
    const subscriber = await this.prisma.newsletterSubscriber.findUnique({ where: { id } });
    if (!subscriber) throw new NotFoundException('Subscriber not found');
    await this.prisma.newsletterSubscriber.update({ where: { id }, data: { optedOutAt: new Date() } });
  }
}
