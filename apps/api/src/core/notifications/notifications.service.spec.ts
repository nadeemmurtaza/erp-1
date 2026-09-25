import { NotificationsService } from './notifications.service';
import { DomainEvent } from '../events/domain-events';
import type { NotificationMessage } from './notification-channel';

const message: NotificationMessage = {
  template: 'order.confirmed',
  recipient: { email: 'a@b.test' },
  subject: 'Your order',
  body: 'Thanks!',
};

// Cast to `any`: NotificationsService's constructor is typed against the
// concrete channel classes (LogNotificationChannel, EmailChannel, ...) for
// production DI, but at runtime any object shaped like NotificationChannel
// works — the same partial-test-double allowance `.claude/rules/testing.md`
// already grants `*.spec.ts` for `any`.
function fakeChannel(name: string, supports: boolean, sendImpl?: () => Promise<void>): any {
  return {
    name,
    supports: () => supports,
    send: sendImpl ?? jest.fn().mockResolvedValue(undefined),
  };
}

function makeConfig(enabled: string[]) {
  return { isNotificationChannelEnabled: (name: string) => enabled.includes(name) } as any;
}

describe('NotificationsService', () => {
  let events: { publish: jest.Mock };

  beforeEach(() => {
    events = { publish: jest.fn().mockResolvedValue(undefined) };
  });

  it(
    // doc 153 §2 — one consolidated meter, not one per channel.
    'publishes exactly one NotificationSent event when several channels match the same message',
    async () => {
      const log = fakeChannel('log', true);
      const email = fakeChannel('email', true);
      const service = new NotificationsService(
        makeConfig(['log', 'email']),
        log,
        fakeChannel('expo_push', false),
        email,
        fakeChannel('whatsapp', false),
        fakeChannel('sms', false),
        events as any,
      );

      await service.send(message);

      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(DomainEvent.NotificationSent, {
        template: 'order.confirmed',
        channelsAttempted: 2,
      });
    },
  );

  it('never publishes NotificationSent when no enabled channel matches the message', async () => {
    const service = new NotificationsService(
      makeConfig([]),
      fakeChannel('log', false),
      fakeChannel('expo_push', false),
      fakeChannel('email', false),
      fakeChannel('whatsapp', false),
      fakeChannel('sms', false),
      events as any,
    );

    await service.send(message);

    expect(events.publish).not.toHaveBeenCalled();
  });

  it('still publishes NotificationSent when a matched channel throws — a failed send is not "unattempted"', async () => {
    const failing = fakeChannel('email', true, jest.fn().mockRejectedValue(new Error('SMTP down')));
    const service = new NotificationsService(
      makeConfig(['email']),
      fakeChannel('log', false),
      fakeChannel('expo_push', false),
      failing,
      fakeChannel('whatsapp', false),
      fakeChannel('sms', false),
      events as any,
    );

    await expect(service.send(message)).resolves.toBeUndefined();

    expect(events.publish).toHaveBeenCalledWith(DomainEvent.NotificationSent, {
      template: 'order.confirmed',
      channelsAttempted: 1,
    });
  });
});
