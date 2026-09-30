import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AudienceService } from './audience.service';
import { BulletinNotificationListener } from './bulletin-notification.listener';

describe('BulletinNotificationListener', () => {
  let listener: BulletinNotificationListener;
  let prisma: any;
  let audienceResolve: jest.Mock;
  let notifications: any;

  beforeEach(async () => {
    audienceResolve = jest.fn();
    prisma = { bulletin: { findUnique: jest.fn() } };
    notifications = { send: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulletinNotificationListener,
        { provide: PrismaService, useValue: prisma },
        { provide: AudienceService, useValue: { resolve: audienceResolve } },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    listener = module.get(BulletinNotificationListener);
  });

  it('resolves the audience through AudienceService and sends through NotificationsService, once per recipient', async () => {
    prisma.bulletin.findUnique.mockResolvedValue({ id: 'b1', authorId: 'author1', title: 'New policy', category: 'POLICY', archivedAt: null });
    audienceResolve.mockResolvedValue({
      recipients: [
        { userId: 'u1', name: 'A', email: 'a@x.test', phone: null },
        { userId: 'u2', name: 'B', email: 'b@x.test', phone: null },
      ],
      requestedCount: 2,
      excludedCount: 0,
    });

    await listener.onBulletinPublished({ bulletinId: 'b1', audienceOrgUnitId: 'north' });

    expect(audienceResolve).toHaveBeenCalledWith({ orgUnitId: 'north' }, 'author1');
    expect(notifications.send).toHaveBeenCalledTimes(2);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'notify.bulletin', subject: 'New policy' }),
    );
  });

  it('does nothing for a bulletin retracted before the outbox delivered the event', async () => {
    prisma.bulletin.findUnique.mockResolvedValue({ id: 'b1', archivedAt: new Date() });

    await listener.onBulletinPublished({ bulletinId: 'b1', audienceOrgUnitId: null });

    expect(audienceResolve).not.toHaveBeenCalled();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('does nothing for a bulletin that no longer exists', async () => {
    prisma.bulletin.findUnique.mockResolvedValue(null);

    await listener.onBulletinPublished({ bulletinId: 'gone', audienceOrgUnitId: null });

    expect(notifications.send).not.toHaveBeenCalled();
  });
});
