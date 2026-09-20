/**
 * Behavior tests for the email notification channel.
 *
 * Exercises the actual logic — interface contract, env validation, and the
 * send path with a mocked nodemailer transport.
 */

// Mock nodemailer BEFORE any imports that use it
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockClose = jest.fn();
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail, close: mockClose });

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { Logger } from '@nestjs/common';
import { BRAND } from '@newax/shared';
import { validateEnv } from '../src/core/config/env.validation';
import { EmailChannel, isDeliverable } from '../src/core/notifications/email.channel';
import type { EmailAccountsService } from '../src/core/notifications/email-accounts/email-accounts.service';
import type { AppConfigService } from '../src/core/config/app-config.service';
import type { EmailAccount } from '../src/core/prisma/client';

// ── 1. Env validation: cross-field check ─────────────────────────────────────

const base = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yaseen',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  APP_ENCRYPTION_KEY: 'c'.repeat(32),
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

/** No connected mailbox configured by default — exercises the SMTP_* fallback path most tests rely on. */
function fakeAccounts(
  resolveResult: { account: EmailAccount; password: string } | null = null,
): EmailAccountsService {
  return {
    resolveFor: jest.fn().mockResolvedValue(resolveResult),
  } as unknown as EmailAccountsService;
}

function fakeEmailAccount(overrides: Partial<EmailAccount> = {}): EmailAccount {
  return {
    id: 'acct_1',
    label: 'Marketing PK',
    purpose: 'MARKETING',
    isActive: true,
    isDefault: true,
    fromName: 'Yaseen Deals',
    fromEmail: 'deals@yaseen.pk',
    replyTo: null,
    smtpHost: 'smtp.marketing.example',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'deals-user',
    smtpPasswordEncrypted: 'irrelevant-already-decrypted-by-the-service',
    smtpVerifiedAt: null,
    imapHost: null,
    imapPort: null,
    imapSecure: true,
    imapUser: null,
    imapPasswordEncrypted: null,
    imapVerifiedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as EmailAccount;
}

beforeEach(() => {
  mockSendMail.mockClear();
  mockClose.mockClear();
  mockCreateTransport.mockClear();
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail, close: mockClose });
});

describe('EmailChannel — interface contract', () => {
  it('name is "email"', () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());
    expect(ch.name).toBe('email');
  });

  it('builds the transporter once, at construction, from the SMTP config', () => {
    new EmailChannel(fakeConfig(), fakeAccounts());

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
    new EmailChannel(fakeConfig({ SMTP_USER: undefined }), fakeAccounts());

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ auth: undefined }),
    );
  });

  it('never builds a transporter when SMTP_HOST is unset, and warns instead', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    mockCreateTransport.mockClear();

    new EmailChannel(fakeConfig({ SMTP_HOST: undefined }), fakeAccounts());

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST is not set'));
    warnSpy.mockRestore();
  });

  it('warns at construction when MAIL_FROM sends as a free-mail domain', () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    new EmailChannel(fakeConfig({ MAIL_FROM: 'Store <no-reply@gmail.com>' }), fakeAccounts());

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('@gmail.com'));
    errorSpy.mockRestore();
  });

  it('supports() returns true when there is a transporter and a deliverable email', () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());
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
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());
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
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: 'not-an-email' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(false);
  });

  it('supports() is unaffected by SMTP configuration — availability is resolved per-send, not at construction', () => {
    const ch = new EmailChannel(fakeConfig({ SMTP_HOST: undefined }), fakeAccounts());
    expect(
      ch.supports({
        template: 'order.placed',
        recipient: { email: 'customer@gmail.com' },
        subject: 'Order confirmed',
        body: 'Thanks!',
      }),
    ).toBe(true);
  });

  it('send() does nothing when there is neither a connected mailbox nor an SMTP_* fallback', async () => {
    const ch = new EmailChannel(fakeConfig({ SMTP_HOST: undefined }), fakeAccounts());

    await ch.send({
      template: 'order.placed',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Order confirmed',
      body: 'Thanks!',
    });

    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('send() builds a hardened message: envelope, Message-ID domain, and anti-autoresponder headers', async () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());

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
        'X-Newax-Template': 'user.welcome',
      }),
    );
    expect(call.disableFileAccess).toBe(true);
    expect(call.disableUrlAccess).toBe(true);
  });

  it('send() sends to a plain address when the recipient has no name', async () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Subject',
      body: 'Body',
    });

    expect(mockSendMail.mock.calls[0][0].to).toBe('customer@gmail.com');
  });

  it('send() renders a registered template rather than the raw subject/body', async () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback subject — should not appear',
      body: 'Fallback body — should not appear',
      data: { name: 'Sania' },
    });

    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toBe(`Welcome to ${BRAND.identity.shortName}`);
    expect(call.html).toContain('Sania');
    expect(call.subject).not.toBe('Fallback subject — should not appear');
  });

  it('send() falls back to a plain wrapped message for an unregistered template', async () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());

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
    const ch = new EmailChannel(fakeConfig(), fakeAccounts());
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

    const ch = new EmailChannel(fakeConfig(), fakeAccounts());

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
      fakeAccounts(),
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

// ── 5. Connected-mailbox routing (EmailAccountsService) ───────────────────────

describe('EmailChannel — routes through a connected mailbox when one is configured', () => {
  it('asks EmailAccountsService for the template’s purpose, and sends from that account rather than SMTP_*', async () => {
    const account = fakeEmailAccount();
    const accounts = fakeAccounts({ account, password: 'decrypted-pass' });
    const ch = new EmailChannel(fakeConfig(), accounts);
    mockCreateTransport.mockClear();

    await ch.send({
      template: 'marketing.flash_sale',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback',
      body: 'Fallback',
    });

    expect(accounts.resolveFor).toHaveBeenCalledWith('MARKETING');
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.marketing.example',
        port: 587,
        secure: false,
        auth: { user: 'deals-user', pass: 'decrypted-pass' },
      }),
    );

    const call = mockSendMail.mock.calls[0][0];
    expect(call.from).toBe('Yaseen Deals <deals@yaseen.pk>');
    expect(call.envelope).toEqual({ from: 'deals@yaseen.pk', to: 'customer@gmail.com' });
  });

  it('resolves a transactional template to the TRANSACTIONAL purpose', async () => {
    const accounts = fakeAccounts(null);
    const ch = new EmailChannel(fakeConfig(), accounts);

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback',
      body: 'Fallback',
    });

    expect(accounts.resolveFor).toHaveBeenCalledWith('TRANSACTIONAL');
  });

  it('falls back to SMTP_* when EmailAccountsService has nothing configured for the purpose', async () => {
    const ch = new EmailChannel(fakeConfig(), fakeAccounts(null));

    await ch.send({
      template: 'marketing.flash_sale',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback',
      body: 'Fallback',
    });

    expect(mockSendMail.mock.calls[0][0].from).toBe('Store <no-reply@test.com>');
  });

  it('reuses the cached transporter for the same account across sends, and rebuilds it once the account changes', async () => {
    const account = fakeEmailAccount();
    const accounts = fakeAccounts({ account, password: 'decrypted-pass' });
    const ch = new EmailChannel(fakeConfig(), accounts);
    mockCreateTransport.mockClear();

    await ch.send({
      template: 'marketing.flash_sale',
      recipient: { email: 'a@gmail.com' },
      subject: 'First',
      body: 'First',
    });
    await ch.send({
      template: 'marketing.flash_sale',
      recipient: { email: 'b@gmail.com' },
      subject: 'Second',
      body: 'Second',
    });
    expect(mockCreateTransport).toHaveBeenCalledTimes(1);

    // A password rotation bumps updatedAt — must not send on stale creds.
    const rotated = fakeEmailAccount({ updatedAt: new Date('2026-02-01') });
    (accounts.resolveFor as jest.Mock).mockResolvedValue({
      account: rotated,
      password: 'new-password',
    });

    await ch.send({
      template: 'marketing.flash_sale',
      recipient: { email: 'c@gmail.com' },
      subject: 'Third',
      body: 'Third',
    });

    expect(mockCreateTransport).toHaveBeenCalledTimes(2);
    expect(mockCreateTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({ auth: { user: 'deals-user', pass: 'new-password' } }),
    );
  });

  it('falls back to SMTP_* and logs a warning when EmailAccountsService itself throws', async () => {
    const accounts: EmailAccountsService = {
      resolveFor: jest.fn().mockRejectedValue(new Error('DB unreachable')),
    } as unknown as EmailAccountsService;
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const ch = new EmailChannel(fakeConfig(), accounts);

    await ch.send({
      template: 'user.welcome',
      recipient: { email: 'customer@gmail.com' },
      subject: 'Fallback',
      body: 'Fallback',
    });

    expect(mockSendMail.mock.calls[0][0].from).toBe('Store <no-reply@test.com>');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('DB unreachable'));
    errorSpy.mockRestore();
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
