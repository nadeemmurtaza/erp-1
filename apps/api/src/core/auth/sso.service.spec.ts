import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { decryptSecret } from '@newax/shared/secret-crypto';
import { AuditService } from '../audit/audit.service';
import { AppConfigService } from '../config/app-config.service';
import { DomainEvent } from '../events/domain-events';
import { EventBusService } from '../events/event-bus.service';
import { Prisma } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SsoSignInRefused } from './identity-provider';
import { OidcProvider } from './providers/oidc.provider';
import { RolesService } from './roles.service';
import { SsoService, ssoCallbackUrl } from './sso.service';

/**
 * 161-sso-identity-federation.md — the domain gate (§2), resolve-or-provision
 * (§3) and the connection lifecycle. Prisma, AuthService and the identity
 * provider are test doubles; the provider's own protocol checks are
 * oidc.provider.spec.ts's job.
 */
describe('SsoService', () => {
  const KEY = 'k'.repeat(32);
  let env: Record<string, string | undefined>;

  let service: SsoService;
  let prisma: any;
  let auth: { issueSession: jest.Mock };
  let roles: { assign: jest.Mock };
  let audit: { recordEvidence: jest.Mock; record: jest.Mock };
  let events: { publish: jest.Mock };
  let oidc: { protocol: 'OIDC'; buildAuthorizationUrl: jest.Mock; handleCallback: jest.Mock };

  const CONNECTION = {
    id: 'c1',
    protocol: 'OIDC',
    label: 'Head office Workspace',
    issuerUrl: 'https://idp.shop.test',
    clientId: 'client-1',
    credentialEncrypted: 'sealed',
    allowedEmailDomains: ['shop.test'],
    defaultRoleName: 'Staff',
    status: 'ACTIVE',
    createdByUserId: 'admin-1',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };
  const FLOW = { state: 'state-abc', nonce: 'nonce-abc', codeVerifier: 'verifier-abc' };
  const PARAMS = { code: 'code-1', state: 'state-abc' };
  const EXTERNAL_ID = 'https://idp.shop.test#sub-1';
  const SESSION = { accessToken: 'access', refreshToken: 'refresh', expiresIn: '15m', user: { id: 'u1' } };
  const STAFF_ROLE = {
    id: 'role-staff',
    name: 'Staff',
    grants: [{ permission: { key: 'account.change_own_password' } }, { permission: { key: 'orders.manage' } }],
  };
  const ADMIN_ROLE = {
    id: 'role-admin',
    name: 'Admin',
    grants: [{ permission: { key: 'account.change_own_password' } }, { permission: { key: 'users.manage' } }],
  };

  const existingUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'u1',
    email: 'sana@shop.test',
    phone: null,
    firstName: 'Sana',
    lastName: null,
    isActive: true,
    ssoExternalId: null,
    ...overrides,
  });

  /**
   * What Prisma returns for a `select`: those columns and no others — so a
   * test double never hands back a column the service did not ask for, and
   * a select that started asking for the credential would show up here.
   */
  const selected = (row: Record<string, unknown>, select?: Record<string, unknown>) =>
    select ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, row[key]])) : row;

  const signInAs = (email: string, externalId = EXTERNAL_ID) => {
    prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);
    oidc.handleCallback.mockResolvedValue({ email, externalId });
  };

  beforeEach(async () => {
    env = { API_PUBLIC_URL: 'https://api.shop.test', API_PREFIX: 'api', APP_ENCRYPTION_KEY: KEY };

    prisma = {
      ssoConnection: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        updateManyAndReturn: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
      role: { findUnique: jest.fn().mockResolvedValue(STAFF_ROLE) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
    };
    auth = { issueSession: jest.fn().mockResolvedValue(SESSION) };
    roles = { assign: jest.fn().mockResolvedValue(undefined) };
    audit = { recordEvidence: jest.fn().mockResolvedValue(undefined), record: jest.fn() };
    events = { publish: jest.fn().mockResolvedValue(undefined) };
    oidc = {
      protocol: 'OIDC',
      buildAuthorizationUrl: jest.fn().mockResolvedValue('https://idp.shop.test/authorize?x=1'),
      handleCallback: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SsoService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
        { provide: RolesService, useValue: roles },
        { provide: AuditService, useValue: audit },
        { provide: EventBusService, useValue: events },
        { provide: AppConfigService, useValue: { get: jest.fn((key: string) => env[key]), isProduction: false } },
        { provide: OidcProvider, useValue: oidc },
      ],
    }).compile();

    service = module.get(SsoService);
  });

  describe('the domain gate (§2)', () => {
    it('refuses an address outside allowedEmailDomains before any User lookup', async () => {
      signInAs('someone@elsewhere.test');

      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it.each([
      ['a subdomain of an allowed domain', 'sana@mail.shop.test'],
      ['an address that only ends like one', 'sana@evilshop.test'],
      ['an address with a second @', 'sana@shop.test@elsewhere.test'],
    ])('refuses %s', async (_label, email) => {
      signInAs(email);
      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(SsoSignInRefused);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('matches the domain case-insensitively and looks the account up by its normalised email', async () => {
      signInAs('Sana@SHOP.test');
      prisma.user.findUnique.mockResolvedValue(existingUser({ ssoExternalId: EXTERNAL_ID }));

      await expect(service.completeLogin('c1', PARAMS, FLOW)).resolves.toBe(SESSION);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'sana@shop.test' } }));
    });
  });

  describe('CSRF', () => {
    it("refuses a callback whose state is not this browser's own, before the provider is asked anything", async () => {
      signInAs('sana@shop.test');

      await expect(service.completeLogin('c1', { ...PARAMS, state: 'forged' }, FLOW)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(oidc.handleCallback).not.toHaveBeenCalled();
      expect(prisma.ssoConnection.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('resolve-or-provision (§3)', () => {
    it('JIT-provisions a brand-new user into defaultRoleName as a back-office account, and never publishes UserRegistered', async () => {
      signInAs('new.person@shop.test');
      prisma.user.create.mockResolvedValue(existingUser({ id: 'u-new', email: 'new.person@shop.test', ssoExternalId: EXTERNAL_ID }));

      await expect(service.completeLogin('c1', PARAMS, FLOW)).resolves.toBe(SESSION);

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new.person@shop.test',
            ssoExternalId: EXTERNAL_ID,
            role: 'STAFF',
            isActive: true,
          }),
        }),
      );
      const created = prisma.user.create.mock.calls[0][0].data;
      expect(created).not.toHaveProperty('organizationId');
      expect(created).not.toHaveProperty('passwordHash');

      expect(roles.assign).toHaveBeenCalledWith('u-new', 'role-staff', prisma);
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          actorId: 'u-new',
          action: 'sso.user_provisioned',
          entity: 'SsoConnection',
          entityId: 'c1',
          data: expect.objectContaining({ userId: 'u-new', role: 'Staff' }),
        }),
      );
      expect(events.publish).toHaveBeenCalledWith(
        DomainEvent.SsoUserProvisioned,
        { userId: 'u-new', connectionId: 'c1' },
        prisma,
      );
      const published = events.publish.mock.calls.map(([name]) => name);
      expect(published).not.toContain(DomainEvent.UserRegistered);
      expect(published).not.toContain(DomainEvent.SsoAccountLinked);
      expect(auth.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-new' }));
    });

    it('links an existing unlinked account, audits it as evidence, and publishes SsoAccountLinked for the mail', async () => {
      signInAs('sana@shop.test');
      prisma.user.findUnique.mockResolvedValue(existingUser());

      await expect(service.completeLogin('c1', PARAMS, FLOW)).resolves.toBe(SESSION);

      // Predicate-on-write: only a still-unlinked, still-active account.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', ssoExternalId: null, isActive: true },
        data: expect.objectContaining({ ssoExternalId: EXTERNAL_ID }),
      });
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'sso.account_linked', entity: 'SsoConnection', entityId: 'c1' }),
      );
      expect(events.publish).toHaveBeenCalledWith(DomainEvent.SsoAccountLinked, { userId: 'u1', connectionId: 'c1' }, prisma);
      expect(audit.record).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(auth.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1', ssoExternalId: EXTERNAL_ID }));
    });

    it('signs an already-linked account straight in — no new audit row, no event, no mail', async () => {
      signInAs('sana@shop.test');
      prisma.user.findUnique.mockResolvedValue(existingUser({ ssoExternalId: EXTERNAL_ID }));

      await expect(service.completeLogin('c1', PARAMS, FLOW)).resolves.toBe(SESSION);

      expect(audit.recordEvidence).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { lastLoginAt: expect.any(Date) } });
    });

    it('refuses a deactivated account — no link, no session', async () => {
      signInAs('sana@shop.test');
      prisma.user.findUnique.mockResolvedValue(existingUser({ isActive: false }));

      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('never silently re-links an account already linked to a different identity', async () => {
      signInAs('sana@shop.test');
      prisma.user.findUnique.mockResolvedValue(existingUser({ ssoExternalId: 'https://idp.shop.test#someone-else' }));

      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });

    it('never lands one external identity on a second account (its email changed at the provider)', async () => {
      signInAs('sana.new@shop.test');
      prisma.user.findFirst.mockResolvedValue({ id: 'u-original' });

      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('resolves the loser of two simultaneous first sign-ins as the existing account, never a duplicate User', async () => {
      signInAs('new.person@shop.test');
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingUser({ id: 'u-new', email: 'new.person@shop.test', ssoExternalId: EXTERNAL_ID }));
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`email`)', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.completeLogin('c1', PARAMS, FLOW)).resolves.toBe(SESSION);

      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      expect(auth.issueSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-new' }));
    });

    it('withholds a default role that has since gained an access-widening permission — least privilege survives the edit', async () => {
      signInAs('new.person@shop.test');
      prisma.role.findUnique.mockResolvedValue(ADMIN_ROLE);
      prisma.user.create.mockResolvedValue(existingUser({ id: 'u-new', ssoExternalId: EXTERNAL_ID }));

      await service.completeLogin('c1', PARAMS, FLOW);

      expect(roles.assign).not.toHaveBeenCalled();
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({
          action: 'sso.user_provisioned',
          data: expect.objectContaining({ role: null, roleWithheld: expect.stringContaining('users.manage') }),
        }),
      );
    });
  });

  describe('a suspended or missing connection', () => {
    it.each([
      ['suspended', { ...CONNECTION, status: 'SUSPENDED' }],
      ['missing', null],
    ])('refuses to start a sign-in through a %s connection', async (_label, row) => {
      prisma.ssoConnection.findUnique.mockResolvedValue(row);
      await expect(service.startLogin('c1')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(oidc.buildAuthorizationUrl).not.toHaveBeenCalled();
    });

    it('refuses to complete one, even with a valid state', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue({ ...CONNECTION, status: 'SUSPENDED' });
      await expect(service.completeLogin('c1', PARAMS, FLOW)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(oidc.handleCallback).not.toHaveBeenCalled();
      expect(auth.issueSession).not.toHaveBeenCalled();
    });
  });

  describe('startLogin', () => {
    it('mints fresh, unguessable state, nonce and PKCE verifier and hands them to the provider with the callback URL', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);

      const first = await service.startLogin('c1');
      const second = await service.startLogin('c1');

      expect(first.authorizationUrl).toBe('https://idp.shop.test/authorize?x=1');
      for (const value of [first.state, first.nonce, first.codeVerifier]) {
        expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
      }
      expect(new Set([first.state, first.nonce, first.codeVerifier]).size).toBe(3);
      expect(second.state).not.toBe(first.state);
      expect(oidc.buildAuthorizationUrl).toHaveBeenCalledWith(
        CONNECTION,
        first.state,
        first.nonce,
        first.codeVerifier,
        'https://api.shop.test/api/v1/auth/sso/callback',
      );
    });

    it('stays off until API_PUBLIC_URL gives it a callback URL to register', async () => {
      env.API_PUBLIC_URL = undefined;
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);

      await expect(service.startLogin('c1')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(service.listSignInOptions()).resolves.toEqual([]);
      expect(prisma.ssoConnection.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ssoCallbackUrl', () => {
    it('uses only the origin of API_PUBLIC_URL, so a value already ending in /api/v1 still works', () => {
      const config = { get: (key: string) => ({ API_PUBLIC_URL: 'https://api.shop.test/api/v1/', API_PREFIX: 'api' })[key] };
      expect(ssoCallbackUrl(config as unknown as AppConfigService)).toBe('https://api.shop.test/api/v1/auth/sso/callback');
    });
  });

  describe('listConnections', () => {
    it('returns the callback URL beside the rows, so it can be registered before the first connection exists', async () => {
      await expect(service.listConnections()).resolves.toEqual({
        redirectUri: 'https://api.shop.test/api/v1/auth/sso/callback',
        connections: [],
      });
      expect(prisma.ssoConnection.findMany.mock.calls[0][0].select).not.toHaveProperty('credentialEncrypted');
    });
  });

  describe('defaultRoleOptions', () => {
    it('marks every role that could widen access, so the picker offers only what the server accepts', async () => {
      prisma.role.findMany = jest.fn().mockResolvedValue([ADMIN_ROLE, STAFF_ROLE]);

      await expect(service.defaultRoleOptions()).resolves.toEqual([
        { name: 'Admin', accessWidening: ['users.manage'] },
        // account.change_own_password reaches no one else's account.
        { name: 'Staff', accessWidening: [] },
      ]);
    });
  });

  describe('listSignInOptions', () => {
    it('offers ACTIVE connections only, id and label only', async () => {
      prisma.ssoConnection.findMany.mockResolvedValue([{ id: 'c1', label: 'Head office Workspace' }]);

      await expect(service.listSignInOptions()).resolves.toEqual([{ id: 'c1', label: 'Head office Workspace' }]);
      expect(prisma.ssoConnection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' }, select: { id: true, label: true } }),
      );
    });
  });

  describe('createConnection', () => {
    const DTO = {
      protocol: 'OIDC' as const,
      label: '  Head office Workspace ',
      issuerUrl: 'https://idp.shop.test/',
      clientId: 'client-1',
      credential: 'client-secret-value',
      allowedEmailDomains: ['@Shop.Test', 'shop.test'],
      defaultRoleName: 'Staff',
    };

    beforeEach(() => {
      prisma.ssoConnection.create.mockImplementation(({ data, select }: any) =>
        Promise.resolve(selected({ ...CONNECTION, ...data }, select)),
      );
    });

    it('stores the secret encrypted, returns and audits everything but the secret', async () => {
      const view = await service.createConnection(DTO, 'admin-1');

      const data = prisma.ssoConnection.create.mock.calls[0][0].data;
      expect(data.credentialEncrypted).not.toContain('client-secret-value');
      expect(decryptSecret(data.credentialEncrypted, KEY)).toBe('client-secret-value');
      expect(data).toEqual(
        expect.objectContaining({
          label: 'Head office Workspace',
          issuerUrl: 'https://idp.shop.test',
          allowedEmailDomains: ['shop.test'],
          createdByUserId: 'admin-1',
        }),
      );
      expect(prisma.ssoConnection.create.mock.calls[0][0].select).not.toHaveProperty('credentialEncrypted');

      expect(view).not.toHaveProperty('credentialEncrypted');
      expect(view).not.toHaveProperty('credential');
      expect(view.redirectUri).toBe('https://api.shop.test/api/v1/auth/sso/callback');

      const entry = audit.recordEvidence.mock.calls[0][1];
      expect(entry).toEqual(expect.objectContaining({ actorId: 'admin-1', action: 'sso.connection_created', entity: 'SsoConnection' }));
      expect(JSON.stringify(entry)).not.toContain('client-secret-value');
    });

    it('refuses an admin-capable default role — never provisions strangers into one', async () => {
      prisma.role.findUnique.mockResolvedValue(ADMIN_ROLE);
      await expect(service.createConnection({ ...DTO, defaultRoleName: 'Admin' }, 'admin-1')).rejects.toThrow(/users\.manage/);
      expect(prisma.ssoConnection.create).not.toHaveBeenCalled();
    });

    it('refuses a default role that does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.createConnection({ ...DTO, defaultRoleName: 'Nobody' }, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it.each([
      ['a domain anyone can register an address at', { allowedEmailDomains: ['gmail.com'] }],
      ['a wildcard', { allowedEmailDomains: ['*.shop.test'] }],
      ['an issuer fetched in clear text', { issuerUrl: 'http://idp.shop.test' }],
      ["Microsoft's multi-tenant endpoint", { issuerUrl: 'https://login.microsoftonline.com/common/v2.0' }],
      ['an issuer URL with a query string', { issuerUrl: 'https://idp.shop.test?tenant=x' }],
    ])('refuses %s', async (_label, override) => {
      await expect(service.createConnection({ ...DTO, ...override }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.ssoConnection.create).not.toHaveBeenCalled();
    });

    it('allows a plain-http issuer on loopback only, for local testing', async () => {
      await expect(
        service.createConnection({ ...DTO, issuerUrl: 'http://localhost:8080/realms/dev' }, 'admin-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('updateConnection', () => {
    beforeEach(() => {
      prisma.ssoConnection.findUnique.mockImplementation(({ select }: any) =>
        Promise.resolve(selected(CONNECTION, select)),
      );
      prisma.ssoConnection.updateManyAndReturn.mockImplementation(({ data, select }: any) =>
        Promise.resolve([selected({ ...CONNECTION, ...data }, select)]),
      );
      prisma.role.findUnique.mockResolvedValue({ ...STAFF_ROLE, name: 'Cashier' });
    });

    it('audits the old and the new value of allowedEmailDomains and defaultRoleName, predicated on the row it read', async () => {
      const view = await service.updateConnection(
        'c1',
        { allowedEmailDomains: ['shop.test', 'branch.shop.test'], defaultRoleName: 'Cashier', label: CONNECTION.label },
        'admin-1',
      );

      expect(prisma.ssoConnection.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', updatedAt: CONNECTION.updatedAt } }),
      );
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, {
        actorId: 'admin-1',
        action: 'sso.connection_updated',
        entity: 'SsoConnection',
        entityId: 'c1',
        data: {
          // The unchanged label is neither written nor audited.
          from: { allowedEmailDomains: ['shop.test'], defaultRoleName: 'Staff' },
          to: { allowedEmailDomains: ['shop.test', 'branch.shop.test'], defaultRoleName: 'Cashier' },
          credentialReplaced: false,
        },
      });
      expect(view).not.toHaveProperty('credentialEncrypted');
    });

    it('replaces the secret without ever putting it in the audit row or the response', async () => {
      const view = await service.updateConnection('c1', { credential: 'rotated-secret' }, 'admin-1');

      const data = prisma.ssoConnection.updateManyAndReturn.mock.calls[0][0].data;
      expect(decryptSecret(data.credentialEncrypted, KEY)).toBe('rotated-secret');
      const entry = audit.recordEvidence.mock.calls[0][1];
      expect(entry.data).toEqual({ from: {}, to: {}, credentialReplaced: true });
      expect(JSON.stringify(entry)).not.toContain('rotated-secret');
      expect(JSON.stringify(view)).not.toContain('rotated-secret');
      expect(view).not.toHaveProperty('credentialEncrypted');
    });

    it('names a status-only change as a suspension or resumption', async () => {
      await service.updateConnection('c1', { status: 'SUSPENDED' }, 'admin-1');
      expect(audit.recordEvidence.mock.calls[0][1].action).toBe('sso.connection_suspended');
    });

    it('refuses an edit that changes nothing', async () => {
      await expect(service.updateConnection('c1', { label: CONNECTION.label }, 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('refuses to overwrite an edit that landed in between', async () => {
      prisma.ssoConnection.updateManyAndReturn.mockResolvedValue([]);
      await expect(service.updateConnection('c1', { label: 'Renamed' }, 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });

    it('answers 404 for a connection that does not exist', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(null);
      await expect(service.updateConnection('nope', { label: 'x' }, 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('suspendConnection', () => {
    it('suspends and audits in one transaction', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);
      prisma.ssoConnection.updateManyAndReturn.mockResolvedValue([{ ...CONNECTION, status: 'SUSPENDED' }]);

      const view = await service.suspendConnection('c1', 'admin-1');

      expect(view.status).toBe('SUSPENDED');
      expect(prisma.ssoConnection.updateManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c1', status: 'ACTIVE' }, data: { status: 'SUSPENDED' } }),
      );
      expect(audit.recordEvidence).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ action: 'sso.connection_suspended', entityId: 'c1' }),
      );
    });

    it('is idempotent — a suspended connection is left alone and not audited again', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue({ ...CONNECTION, status: 'SUSPENDED' });
      await service.suspendConnection('c1', 'admin-1');
      expect(prisma.ssoConnection.updateManyAndReturn).not.toHaveBeenCalled();
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });
  });

  describe('unlinkAccount', () => {
    it('clears the identity and signs the account out everywhere, audited in the same transaction', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', ssoExternalId: EXTERNAL_ID });

      await service.unlinkAccount('c1', 'u1', 'admin-1');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', ssoExternalId: EXTERNAL_ID },
        data: { ssoExternalId: null },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.recordEvidence).toHaveBeenCalledWith(prisma, {
        actorId: 'admin-1',
        action: 'sso.account_unlinked',
        entity: 'SsoConnection',
        entityId: 'c1',
        data: { userId: 'u1', from: EXTERNAL_ID, to: null, sessionsRevoked: 2 },
      });
    });

    it('does nothing for an account with no linked identity', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', ssoExternalId: null });

      await service.unlinkAccount('c1', 'u1', 'admin-1');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(audit.recordEvidence).not.toHaveBeenCalled();
    });
  });

  describe('listAccounts', () => {
    it('reads the accounts from the audit rows, in one user query, and says which are still linked', async () => {
      prisma.ssoConnection.findUnique.mockResolvedValue(CONNECTION);
      prisma.auditLog.findMany.mockResolvedValue([
        { action: 'sso.account_linked', createdAt: new Date('2026-09-20'), data: { userId: 'u1', externalId: EXTERNAL_ID } },
        { action: 'sso.user_provisioned', createdAt: new Date('2026-09-10'), data: { userId: 'u2', externalId: 'https://idp.shop.test#sub-2' } },
      ]);
      prisma.auditLog.count.mockResolvedValue(2);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'sana@shop.test', firstName: 'Sana', lastName: null, isActive: true, ssoExternalId: EXTERNAL_ID },
        { id: 'u2', email: 'ali@shop.test', firstName: 'Ali', lastName: null, isActive: true, ssoExternalId: null },
      ]);

      const result = await service.listAccounts('c1', 1, 20);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entity: 'SsoConnection', entityId: 'c1', action: { in: ['sso.user_provisioned', 'sso.account_linked'] } },
        }),
      );
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
      expect(result.meta.total).toBe(2);
      expect(result.data.map(({ userId, how, linked }) => ({ userId, how, linked }))).toEqual([
        { userId: 'u1', how: 'LINKED', linked: true },
        { userId: 'u2', how: 'PROVISIONED', linked: false },
      ]);
    });
  });
});
