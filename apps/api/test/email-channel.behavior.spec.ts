/**
 * Behavior tests for the email notification channel.
 *
 * Exercises the actual logic — interface contract, env validation, and the
 * send path with a mocked nodemailer transport.
 */

// Mock nodemailer BEFORE any imports that use it
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { Logger } from '@nestjs/common';
import { validateEnv } from '../src/core/config/env.validation';
import { EmailChannel, isDeliverable } from '../src/core/notifications/email.channel';
import type { AppConfigService } from '../src/core/config/app-config.service';

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

// ── 2. isDeliverable — the shape check that guards supports() ────────────────

describe('isDeliverable', () => {
  it('accepts an ordinary address', () => {
    expect(isDeliverable('customer@example.com')).toBe(true);
  });

  it.each([null, undefined, '', 'no-at-sign', '@example.com', 'name@', 'has space@example.com'])(
    'rejects %p',
    (value) => {
      expect(isDeliverable(value)).toBe(false);
    },
  );
});

// ── 3. EmailChannel — interface contract ─────────────────────────────────────

function fakeConfig(overrides: Record<string, unknown> = {}): AppConfigService {
  const defaults: Record<string, unknown> = {
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'admin@test.com',
    SMTP_PASSWORD: 'pass',
    MAIL_FROM: 'Store <no-reply@test.com>',
    MAIL_REPLY_TO: 'hello@test.com',
    STORE_NAME: 'Store',
    STOREFRONT_URL: 'https://test.com',
    SEED_ADMIN_EMAIL: 'admin@test.com',
    SUPPORT_WHATSAPP: undefined,
    BANK_TRANSFER_DETAILS: undefined,
  };
  return {
    get(key: string) {
      return key in overrides ? overrides[key] : defaults[key];
    },
  } as unknown as AppConfigService;
}

beforeEach(() => {
  mockSendMail.mockClear();
  mockCreateTransport.mockClear();
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
});

describe('EmailChannel — interface contract', () => {
  it('name is "email"', () => {
    const ch = new EmailChannel(fakeConfig());
    expect(ch.name).toBe('email');
  });

  it('builds the transporter once, at construction, from the SMTP config', () => {
    new EmailChannel(fakeConfig());

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: '127.0.0.1',
        port: 587,
        secure: false,
        auth: { user: 'admin@test.com', pass: 'pass' },
        pool: true,
      }),
    );
  });

  it('leaves auth undefined when SMTP_USER or SMTP_PASSWORD is missing', () => {
    new EmailChannel(fakeConfig({ SMTP_USER: undefined }));

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it('never builds a transporter when SMTP_HOST is unset, and warns instead', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    mockCreateTransport.mockClear();

    new EmailChannel(fakeConfig({ SMTP_HOST: undefined }));

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST is not set'));
    warnSpy.mockRestore();
  });

  it('warns at construction when MAIL_FROM sends as a free-mail domain', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new EmailChannel(fakeConfig({ MAIL_FROM: 'Store <no-reply@gmail.com>' }));

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('@gmail.com'));
    errorSpy.mockRestore();
  });

  it('supports() returns true when there is a transporter and a deliverable email', () => {
    const ch = new EmailChannel(fakeConfig());
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
    const ch = new EmailChannel(fakeConfig());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { phone: '+923001234567' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('supports() returns false when the recipient email is not shaped like one', () => {
    const ch = new EmailChannel(fakeConfig());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: 'not-an-email' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('supports() returns false when there is no transporter at all', () => {
    const ch = new EmailChannel(fakeConfig({ SMTP_HOST: undefined }));
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: 'customer@gmail.com' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('send() does nothing when there is no transporter', async () => {
    const ch = new EmailChannel(fakeConfig({ SMTP_HOST: undefined }));

    await ch.send({
      template: 'order.placed',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Order confirmed',
      body: 'Thanks!',
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('send() builds a hardened message: envelope, Message-ID domain, and anti-autoresponder headers', async () => {
    const ch = new EmailChannel(fakeConfig());

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com', name: 'Ahmed' },
      subject: 'Fallback subject',
      body: 'Fallback body',
    });

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const call = mockSendMail.mock.calls[0][0];

    expect(call.from).toBe('Store <no-reply@test.com>');
    expect(call.to).toEqual({ name: 'Ahmed', address: 'customer@gmail.com' });
    expect(call.replyTo).toBe('hello@test.com');
    expect(call.envelope).toEqual({ from: 'no-reply@test.com', to: 'customer@gmail.com' });
    expect(call.messageId).toMatch(/^<[^@]+@test\.com>$/);
    expect(call.headers).toEqual(
      expect.objectContaining({
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
        'X-Yaseen-Template': 'user.welcome',
      }),
    );
    expect(call.disableFileAccess).toBe(true);
    expect(call.disableUrlAccess).toBe(true);
  });

  it('send() sends to a plain address when the recipient has no name', async () => {
    const ch = new EmailChannel(fakeConfig());

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Subject',
      body: 'Body',
    });

    expect(mockSendMail.mock.calls[0][0].to).toBe('customer@gmail.com');
  });

  it('send() renders a registered template rather than the raw subject/body', async () => {
    const ch = new EmailChannel(fakeConfig());

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback subject — should not appear',
      body: 'Fallback body — should not appear',
      data: { name: 'Sania' },
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toBe('Welcome to Yaseen');
    expect(call.html).toContain('Sania');
    expect(call.subject).not.toBe('Fallback subject — should not appear');
  });

  it('send() falls back to a plain wrapped message for an unregistered template', async () => {
    const ch = new EmailChannel(fakeConfig());

    await ch.send({
      template: 'nope.not_a_template',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Custom subject',
      body: 'Custom body',
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toBe('Custom subject');
    expect(call.html).toContain('Custom body');
    expect(call.text).toContain('Custom body');
  });

  it('reuses the transporter across multiple sends', async () => {
    const ch = new EmailChannel(fakeConfig());
    mockCreateTransport.mockClear();

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'a@test.com' },
      subject: 'First',
      body: 'First email',
    });
    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'b@test.com' },
      subject: 'Second',
      body: 'Second email',
    });

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it('send() propagates nodemailer errors', async () => {
    mockCreateTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue(new Error('Connection refused')),
    });

    const ch = new EmailChannel(fakeConfig());

    await expect(
      ch.send({
        template: 'user.welcome',
        recipient: { email: 'fail@test.com' },
        subject: 'Will fail',
        body: 'Body',
      }),
    ).rejects.toThrow('Connection refused');
  });

  it('configures Cloudflare SMTP (port 465, secure=true)', () => {
    new EmailChannel(
      fakeConfig({
        SMTP_HOST: 'smtp.mx.cloudflare.net',
        SMTP_PORT: 465,
        SMTP_SECURE: true,
        SMTP_USER: 'api_token',
      }),
    );

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.mx.cloudflare.net',
        port: 465,
        secure: true,
        auth: { user: 'api_token', pass: 'pass' },
      }),
    );
  });
});

// ── 4. NotificationsService fan-out behavior ──────────────────────────────────

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
