import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { OnsiteMessagesService } from './onsite-messages.service';

describe('OnsiteMessagesService', () => {
  let service: OnsiteMessagesService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [OnsiteMessagesService, PrismaService],
    }).compile();
    service = module.get(OnsiteMessagesService);
    prisma = module.get(PrismaService);
  });

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `onsite-test-${Date.now()}-${seq}`;
  }

  afterEach(async () => {
    await prisma.onsiteMessage.deleteMany({ where: { linkUrl: { contains: 'onsite-test' } } });
    await prisma.newsletterSubscriber.deleteMany({ where: { email: { contains: 'onsite-test' } } });
    await prisma.segment.deleteMany({ where: { name: { contains: 'onsite-test' } } });
    await prisma.contact.deleteMany({ where: { name: { contains: 'onsite-test' } } });
  });

  it('creates a message with translations and reads it back', async () => {
    const created = await service.createMessage({
      kind: 'ANNOUNCEMENT_BAR',
      linkUrl: `/onsite-test-${tag()}`,
      translations: [{ locale: 'en', headline: 'Free shipping this week' }],
    });

    const found = await service.getMessage(created.id);
    expect(found.translations[0]?.headline).toBe('Free shipping this week');
  });

  it('throws on an unknown message id', async () => {
    await expect(service.getMessage('does-not-exist')).rejects.toThrow(NotFoundException);
  });

  it('only returns an active message within its scheduled window', async () => {
    const past = await service.createMessage({
      kind: 'ANNOUNCEMENT_BAR',
      linkUrl: tag(),
      startsAt: new Date(Date.now() - 86_400_000).toISOString(),
      endsAt: new Date(Date.now() - 3600_000).toISOString(),
      translations: [{ locale: 'en', headline: 'Expired' }],
    });
    const current = await service.createMessage({
      kind: 'ANNOUNCEMENT_BAR',
      linkUrl: tag(),
      translations: [{ locale: 'en', headline: 'Live' }],
    });

    const active = await service.activeMessages('/', 'en');
    const ids = active.map((m) => m.id);
    expect(ids).toContain(current.id);
    expect(ids).not.toContain(past.id);
  });

  it('matches a message to its pagePattern as a path prefix, and excludes it elsewhere', async () => {
    const message = await service.createMessage({
      kind: 'POPUP',
      pagePattern: '/shop',
      linkUrl: tag(),
      translations: [{ locale: 'en', headline: 'Shop only' }],
    });

    const onShop = await service.activeMessages('/shop/dresses', 'en');
    const onHome = await service.activeMessages('/', 'en');
    expect(onShop.map((m) => m.id)).toContain(message.id);
    expect(onHome.map((m) => m.id)).not.toContain(message.id);
  });

  it('excludes an inactive message from public reads', async () => {
    const message = await service.createMessage({
      kind: 'COOKIE_CONSENT',
      isActive: false,
      linkUrl: tag(),
      translations: [{ locale: 'en', headline: 'Hidden' }],
    });

    const active = await service.activeMessages('/', 'en');
    expect(active.map((m) => m.id)).not.toContain(message.id);
  });

  it('only shows a segment-targeted message to a signed-in customer who is actually a member', async () => {
    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    const contact = await prisma.contact.create({
      data: { name: tag(), phoneE164: null, userId: user.id, orderCount: 5 },
    });
    const segment = await prisma.segment.create({
      data: { name: tag(), filter: { all: [{ field: 'orderCount', operator: 'gte', value: 1 }] } },
    });
    const message = await service.createMessage({
      kind: 'POPUP',
      segmentId: segment.id,
      linkUrl: tag(),
      translations: [{ locale: 'en', headline: 'Loyal customer offer' }],
    });

    const asAnonymous = await service.activeMessages('/', 'en', undefined);
    const asMember = await service.activeMessages('/', 'en', user.id);

    expect(asAnonymous.map((m) => m.id)).not.toContain(message.id);
    expect(asMember.map((m) => m.id)).toContain(message.id);

    await prisma.contact.delete({ where: { id: contact.id } });
  });

  it('newsletter signup upserts by email and clears a prior opt-out on resubscribe', async () => {
    const email = `${tag()}@example.com`;
    await service.subscribeNewsletter(email, 'en');
    const first = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    await prisma.newsletterSubscriber.update({ where: { id: first.id }, data: { optedOutAt: new Date() } });

    await service.subscribeNewsletter(email, 'en');
    const resubscribed = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    expect(resubscribed.optedOutAt).toBeNull();
  });

  it('opts out a subscriber by id', async () => {
    const email = `${tag()}@example.com`;
    await service.subscribeNewsletter(email, 'en');
    const subscriber = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });

    await service.optOutSubscriber(subscriber.id);

    const refreshed = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email } });
    expect(refreshed.optedOutAt).not.toBeNull();
  });
});
