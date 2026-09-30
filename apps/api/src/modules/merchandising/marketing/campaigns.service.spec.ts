import { Test } from '@nestjs/testing';
import { AppConfigService } from '../../../core/config/app-config.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: PrismaService;
  const send = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CampaignsService,
        PrismaService,
        { provide: NotificationsService, useValue: { send } },
        { provide: AppConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get(CampaignsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => send.mockClear());

  let seq = 0;
  function tag(): string {
    seq += 1;
    return `campaign-test-${Date.now()}-${seq}`;
  }

  /** Every contact carries a fresh, unique tag so a segment can be scoped to exactly this test's own rows — the shared test DB has plenty of other contacts an unscoped filter would also match. */
  async function makeContact(name: string, data: Partial<{ email: string | null; marketingOptOut: boolean }>, tagName: string) {
    return prisma.contact.create({
      data: {
        name,
        ...data,
        tags: { create: [{ tag: { connectOrCreate: { where: { name: tagName }, create: { name: tagName } } } }] },
      },
    });
  }

  async function makeSegment(tagName: string) {
    return prisma.segment.create({
      data: { name: tag(), filter: { all: [{ field: 'tag', operator: 'eq', value: tagName }] } as never },
    });
  }

  afterEach(async () => {
    await prisma.campaignRecipient.deleteMany({ where: { campaign: { name: { contains: 'campaign-test' } } } });
    await prisma.campaign.deleteMany({ where: { name: { contains: 'campaign-test' } } });
    await prisma.segment.deleteMany({ where: { name: { contains: 'campaign-test' } } });
    await prisma.contact.deleteMany({ where: { name: { contains: 'campaign-test' } } });
    await prisma.tag.deleteMany({ where: { name: { contains: 'campaign-test' } } });
  });

  it('skips an opted-out contact at send time, not at list-build time', async () => {
    const marker = tag();
    const optedOut = await makeContact(marker, { email: `${marker}@example.com`, marketingOptOut: true }, marker);
    const eligible = await makeContact(`${marker}-b`, { email: `${marker}-b@example.com`, marketingOptOut: false }, marker);
    const segment = await makeSegment(marker);

    const campaign = await service.createCampaign(
      { name: tag(), channel: 'EMAIL', segmentId: segment.id, content: { en: { subject: 'Hi', body: 'Hello' } } },
      null as unknown as string,
    );
    await service.scheduleCampaign(campaign.id, {});
    await service.materializeScheduledCampaigns();
    await service.sendPendingBatch(10);

    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id } });
    expect(recipients).toHaveLength(2);
    expect(recipients.find((r) => r.contactId === optedOut.id)?.status).toBe('SKIPPED_OPT_OUT');
    expect(recipients.find((r) => r.contactId === eligible.id)?.status).toBe('SENT');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips a contact the channel cannot reach', async () => {
    const marker = tag();
    const noEmail = await makeContact(marker, { email: null }, marker);
    const segment = await makeSegment(marker);

    const campaign = await service.createCampaign(
      { name: tag(), channel: 'EMAIL', segmentId: segment.id, content: { en: { subject: 'Hi', body: 'Hello' } } },
      null as unknown as string,
    );
    await service.scheduleCampaign(campaign.id, {});
    await service.materializeScheduledCampaigns();
    await service.sendPendingBatch(10);

    const recipient = await prisma.campaignRecipient.findFirst({ where: { campaignId: campaign.id, contactId: noEmail.id } });
    expect(recipient?.status).toBe('SKIPPED_NO_CONTACT');
    expect(send).not.toHaveBeenCalled();
  });

  it('closes a campaign to SENT once every recipient is resolved', async () => {
    const marker = tag();
    await makeContact(marker, { email: `${marker}@example.com` }, marker);
    const segment = await makeSegment(marker);

    const campaign = await service.createCampaign(
      { name: tag(), channel: 'EMAIL', segmentId: segment.id, content: { en: { subject: 'Hi', body: 'Hello' } } },
      null as unknown as string,
    );
    await service.scheduleCampaign(campaign.id, {});
    await service.materializeScheduledCampaigns();
    await service.sendPendingBatch(10);

    const refreshed = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(refreshed.status).toBe('SENT');
  });

  it('rejects editing a campaign that has left DRAFT', async () => {
    const marker = tag();
    const segment = await makeSegment(marker);
    const campaign = await service.createCampaign(
      { name: tag(), channel: 'EMAIL', segmentId: segment.id, content: { en: { subject: 'Hi', body: 'Hello' } } },
      null as unknown as string,
    );
    await service.scheduleCampaign(campaign.id, {});

    await expect(service.updateCampaign(campaign.id, { name: 'changed' })).rejects.toThrow();
  });
});
