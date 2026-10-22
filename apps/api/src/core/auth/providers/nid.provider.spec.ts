import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth.service';
import { NidProvider } from './nid.provider';

describe('NidProvider (WO-255.2)', () => {
  let provider: NidProvider;
  let config: jest.Mocked<AppConfigService>;
  let prisma: any;
  let auth: jest.Mocked<AuthService>;
  let audit: jest.Mocked<AuditService>;
  let redis: any;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;

    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'NID_BASE_URL') return 'http://nid.local:4000';
        if (key === 'NID_CLIENT_ID') return 'client-erp-1';
        if (key === 'NID_CLIENT_SECRET') return 'secret-erp-1';
        if (key === 'NID_REDIRECT_URI') return 'http://erp.local/api/v1/auth/nid/callback';
        return undefined;
      }),
    } as any;

    prisma = {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    auth = {
      issueSession: jest.fn().mockImplementation((user) => ({
        accessToken: 'access-jwt',
        refreshToken: 'refresh-jwt',
        user: { id: user.id, email: user.email, role: user.role },
      })),
    } as any;

    audit = {
      recordEvidence: jest.fn().mockResolvedValue(undefined),
    } as any;

    const redisStore = new Map<string, string>();
    redis = {
      client: jest.fn().mockReturnValue({
        set: jest.fn().mockImplementation(async (k, v) => {
          redisStore.set(k, v);
          return 'OK';
        }),
        get: jest.fn().mockImplementation(async (k) => redisStore.get(k) ?? null),
        del: jest.fn().mockImplementation(async (k) => {
          const existed = redisStore.has(k);
          redisStore.delete(k);
          return existed ? 1 : 0;
        }),
      }),
    };

    provider = new NidProvider(config, prisma, auth, audit, redis);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('startLogin', () => {
    it('throws ServiceUnavailableException when credentials are missing', async () => {
      config.get.mockImplementation((k: string) => (k === 'NID_BASE_URL' ? 'http://nid:4000' : undefined));

      await expect(provider.startLogin()).rejects.toThrow(ServiceUnavailableException);
    });

    it('successfully initiates login and returns authorization URL', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ pollToken: 'poll-xyz', expiresAt: new Date().toISOString() }),
      });

      const res = await provider.startLogin();

      expect(res.pollToken).toBe('poll-xyz');
      expect(res.authorizeUrl).toBe('http://nid.local:4000/authorize/poll-xyz');
      expect(res.state).toBeDefined();
    });
  });

  describe('handleCallback', () => {
    it('throws BadRequestException if code or state is missing', async () => {
      await expect(provider.handleCallback('', 'state')).rejects.toThrow(BadRequestException);
      await expect(provider.handleCallback('code', '')).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException if state is invalid or expired', async () => {
      await expect(provider.handleCallback('code123', 'invalid-state')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('successfully links existing user and issues session', async () => {
      // Seed valid state in provider
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pollToken: 'poll-test', expiresAt: new Date().toISOString() }),
      });
      const start = await provider.startLogin();

      // Mock nID token response
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account: {
            id: 'acc-nid-444',
            phone: '+923001234567',
            email: 'user@example.com',
          },
        }),
      });

      // User exists by email
      prisma.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'u-123',
        email: 'user@example.com',
        role: 'STAFF',
        isActive: true,
      });

      prisma.user.update.mockResolvedValueOnce({
        id: 'u-123',
        email: 'user@example.com',
        ssoExternalId: 'nid#acc-nid-444',
        role: 'STAFF',
        isActive: true,
      });

      const session = await provider.handleCallback('auth-code-123', start.state);

      expect(session.accessToken).toBe('access-jwt');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u-123' },
          data: expect.objectContaining({ ssoExternalId: 'nid#acc-nid-444' }),
        }),
      );
      expect(audit.recordEvidence).toHaveBeenCalled();
    });

    it('provisions a new user when no matching account exists', async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pollToken: 'poll-provision', expiresAt: new Date().toISOString() }),
      });
      const start = await provider.startLogin();

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account: {
            id: 'acc-new-999',
            phone: '+923009999999',
            email: 'newuser@example.com',
          },
        }),
      });

      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValueOnce({
        id: 'u-new',
        email: 'newuser@example.com',
        ssoExternalId: 'nid#acc-new-999',
        role: 'STAFF',
        isActive: true,
      });

      const session = await provider.handleCallback('code-new', start.state);

      expect(session.accessToken).toBe('access-jwt');
      expect(prisma.user.create).toHaveBeenCalled();
      expect(audit.recordEvidence).toHaveBeenCalled();
    });

    it('throws ForbiddenException if existing user account is deactivated', async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ pollToken: 'poll-deact', expiresAt: new Date().toISOString() }),
      });
      const start = await provider.startLogin();

      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          account: {
            id: 'acc-deactivated',
            phone: '+923001112233',
            email: 'inactive@example.com',
          },
        }),
      });

      prisma.user.findFirst.mockResolvedValueOnce({
        id: 'u-deact',
        email: 'inactive@example.com',
        ssoExternalId: 'nid#acc-deactivated',
        isActive: false,
      });

      await expect(provider.handleCallback('code-deact', start.state)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
