import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SecurityNotificationSubscriber } from './security-notification.subscriber';

/**
 * 161-sso-identity-federation.md §3 — an account linked to single sign-on is
 * never linked silently: its holder is mailed, from a fresh lookup, with
 * nothing about the identity provider on the event or in the mail.
 */
describe('SecurityNotificationSubscriber.onSsoAccountLinked', () => {
  let prisma: { user: { findUnique: jest.Mock }; deviceToken: { findFirst: jest.Mock } };
  let notifications: { send: jest.Mock };
  let subscriber: SecurityNotificationSubscriber;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      deviceToken: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };
    subscriber = new SecurityNotificationSubscriber(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  it('mails the account holder the sso-linked template, looked up fresh by id', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'sana@shop.test', firstName: 'Sana', lastName: 'Mehreen' });

    await subscriber.onSsoAccountLinked({ userId: 'u1', connectionId: 'c1' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { email: true, firstName: true, lastName: true },
    });
    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith({
      template: 'user.sso_account_linked',
      recipient: { name: 'Sana Mehreen', email: 'sana@shop.test', phone: null, userId: 'u1', locale: 'en' },
      subject: expect.any(String),
      body: expect.any(String),
      data: {},
    });
  });

  it('writes in the language of the account’s most recent device', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'sana@shop.test', firstName: null, lastName: null });
    prisma.deviceToken.findFirst.mockResolvedValue({ locale: 'ur-PK' });

    await subscriber.onSsoAccountLinked({ userId: 'u1', connectionId: 'c1' });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipient: expect.objectContaining({ name: null, locale: 'ur' }) }),
    );
  });

  it('sends nothing when the account has no email address, or no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ email: null, firstName: 'Sana', lastName: null });
    await subscriber.onSsoAccountLinked({ userId: 'u1', connectionId: 'c1' });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await subscriber.onSsoAccountLinked({ userId: 'u-gone', connectionId: 'c1' });

    expect(notifications.send).not.toHaveBeenCalled();
  });
});
