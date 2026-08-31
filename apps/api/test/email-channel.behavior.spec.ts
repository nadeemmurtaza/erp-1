/**
 * Behavior tests for the email notification channel.
 *
 * Exercises the actual logic — interface contract, env validation, and
 * the send path with a mocked nodemailer transport.
 */

// Mock nodemailer BEFORE any imports that use it
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { validateEnv } from '../src/core/config/env.validation';
import { EmailNotificationChannel } from '../src/core/notifications/email.channel';

// ── 1. Env validation: cross-field check ─────────────────────────────────────

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yaseen',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('env.validation — email cross-field check', () => {
  it('accepts email channel when SMTP_HOST and SMTP_PASSWORD are provided', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: 'mail.example.com',
      SMTP_PASSWORD: 'secret',
    });
    expect(env.NOTIFICATION_CHANNELS).toContain('email');
    expect(env.SMTP_HOST).toBe('mail.example.com');
  });

  it('rejects when email is enabled but SMTP_HOST is missing', () => {
    expect(() =>
      validateEnv({
        ...base,
        NOTIFICATION_CHANNELS: 'log,email',
        SMTP_PASSWORD: 'secret',
      }),
    ).toThrow(/SMTP_HOST/);
  });

  it('rejects when email is enabled but SMTP_PASSWORD is missing', () => {
    expect(() =>
      validateEnv({
        ...base,
        NOTIFICATION_CHANNELS: 'log,email',
        SMTP_HOST: 'mail.example.com',
      }),
    ).toThrow(/SMTP_PASSWORD/);
  });

  it('rejects when both SMTP_HOST and SMTP_PASSWORD are missing', () => {
    expect(() =>
      validateEnv({
        ...base,
        NOTIFICATION_CHANNELS: 'log,email',
      }),
    ).toThrow(/SMTP_HOST, SMTP_PASSWORD/);
  });

  it('accepts log-only channel without any SMTP vars', () => {
    const env = validateEnv({ ...base, NOTIFICATION_CHANNELS: 'log' });
    expect(env.NOTIFICATION_CHANNELS).toEqual(['log']);
  });

  it('defaults SMTP_PORT to 587', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: 'mail.example.com',
      SMTP_PASSWORD: 'secret',
    });
    expect(env.SMTP_PORT).toBe(587);
  });

  it('defaults SMTP_SECURE to false', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: 'mail.example.com',
      SMTP_PASSWORD: 'secret',
    });
    expect(env.SMTP_SECURE).toBe(false);
  });

  it('parses SMTP_SECURE=true and SMTP_PORT=465 for Cloudflare', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: 'smtp.mx.cloudflare.net',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_PASSWORD: 'token',
    });
    expect(env.SMTP_SECURE).toBe(true);
    expect(env.SMTP_PORT).toBe(465);
  });
});

// ── 2. EmailNotificationChannel interface contract ────────────────────────────

function mockConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'admin@test.com',
    SMTP_PASSWORD: 'pass',
    MAIL_FROM: 'Store <no-reply@test.com>',
    MAIL_REPLY_TO: 'hello@test.com',
  };
  // Use hasOwnProperty to allow explicit undefined overrides
  return {
    get(key: string) {
      if (key in overrides) return overrides[key];
      return defaults[key];
    },
  } as any;
}

beforeEach(() => {
  mockSendMail.mockClear();
  mockCreateTransport.mockClear();
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
});

describe('EmailNotificationChannel — interface contract', () => {
  it('name is "email"', () => {
    const ch = new EmailNotificationChannel(mockConfig());
    expect(ch.name).toBe('email');
  });

  it('supports() returns true when recipient has an email', () => {
    const ch = new EmailNotificationChannel(mockConfig());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: 'customer@gmail.com' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(true);
  });

  it('supports() returns false when recipient has no email', () => {
    const ch = new EmailNotificationChannel(mockConfig());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { phone: '+923001234567' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('supports() returns false for empty email', () => {
    const ch = new EmailNotificationChannel(mockConfig());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: '' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('send() creates transporter with correct SMTP config', async () => {
    const ch = new EmailNotificationChannel(mockConfig());

    await ch.send({
      template: 'order.confirmed',
      recipient: { email: 'customer@gmail.com', name: 'Ahmed' },
      subject: 'Your order is confirmed',
      body: 'Thank you for your order!',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 587,
      secure: false,
      auth: {
        user: 'admin@test.com',
        pass: 'pass',
      },
    });
  });

  it('send() calls sendMail with correct message params', async () => {
    const ch = new EmailNotificationChannel(mockConfig());

    await ch.send({
      template: 'order.confirmed',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Your order is confirmed',
      body: 'Thank you for your order!',
    });

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'Store <no-reply@test.com>',
      replyTo: 'hello@test.com',
      to: 'customer@gmail.com',
      subject: 'Your order is confirmed',
      text: 'Thank you for your order!',
    });
  });

  it('send() omits replyTo when MAIL_REPLY_TO is not set', async () => {
    const ch = new EmailNotificationChannel(mockConfig({ MAIL_REPLY_TO: undefined }));

    await ch.send({
      template: 'order.confirmed',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Test',
      body: 'Test body',
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call).not.toHaveProperty('replyTo');
  });

  it('reuses the transporter across multiple sends', async () => {
    const ch = new EmailNotificationChannel(mockConfig());

    await ch.send({
      template: 'order.confirmed',
      recipient: { email: 'a@test.com' },
      subject: 'First',
      body: 'First email',
    });
    await ch.send({
      template: 'order.confirmed',
      recipient: { email: 'b@test.com' },
      subject: 'Second',
      body: 'Second email',
    });

    // createTransport called only ONCE (lazy, reused)
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    // sendMail called twice
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('send() propagates nodemailer errors', async () => {
    mockCreateTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const ch = new EmailNotificationChannel(mockConfig());

    await expect(
      ch.send({
        template: 'order.confirmed',
        recipient: { email: 'fail@test.com' },
        subject: 'Will fail',
        body: 'Body',
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('uses SMTP_USER as auth user, falling back to "api_token"', async () => {
    const ch = new EmailNotificationChannel(mockConfig({ SMTP_USER: undefined }));

    await ch.send({
      template: 'test',
      recipient: { email: 'x@test.com' },
      subject: 'T',
      body: 'B',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({ user: 'api_token' }),
      }),
    );
  });

  it('configures Cloudflare SMTP (port 465, secure=true)', async () => {
    const ch = new EmailNotificationChannel(
      mockConfig({
        SMTP_HOST: 'smtp.mx.cloudflare.net',
        SMTP_PORT: 465,
        SMTP_SECURE: true,
        SMTP_USER: 'api_token',
      }),
    );

    await ch.send({
      template: 'test',
      recipient: { email: 'x@test.com' },
      subject: 'T',
      body: 'B',
    });

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.mx.cloudflare.net',
      port: 465,
      secure: true,
      auth: {
        user: 'api_token',
        pass: 'pass',
      },
    });
  });
});

// ── 3. NotificationsService fan-out behavior ──────────────────────────────────

describe('NotificationsService — email channel integration', () => {
  it('email channel is included when NOTIFICATION_CHANNELS contains "email"', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log,email',
      SMTP_HOST: '127.0.0.1',
      SMTP_PASSWORD: 'pass',
    });
    expect(env.NOTIFICATION_CHANNELS).toContain('email');
  });

  it('email channel is excluded when NOTIFICATION_CHANNELS is only "log"', () => {
    const env = validateEnv({
      ...base,
      NOTIFICATION_CHANNELS: 'log',
    });
    expect(env.NOTIFICATION_CHANNELS).not.toContain('email');
  });
});
