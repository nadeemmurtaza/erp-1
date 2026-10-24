import { randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { isDelegatablePermission, normalizeEmail } from '@newax/shared';
import { encryptSecret } from '@newax/shared/secret-crypto';
import { AuditService } from '../audit/audit.service';
import { paginated, type PaginatedResult } from '../common/dto/pagination.dto';
import { AppConfigService } from '../config/app-config.service';
import { DomainEvent } from '../events/domain-events';
import { EventBusService, type PrismaLike } from '../events/event-bus.service';
import { Prisma, type SsoConnection, type SsoProtocol } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type AuthResult } from './auth.service';
import type { CreateSsoConnectionDto, UpdateSsoConnectionDto } from './dto/sso.dto';
import {
  SsoSignInRefused,
  type IdentityProvider,
  type SsoCallbackParams,
  type SsoFlowSecrets,
} from './identity-provider';
import { OidcProvider } from './providers/oidc.provider';
import { RolesService } from './roles.service';

/**
 * `/api/v1/auth/sso` — the path both SSO cookies are scoped to, so no other
 * route ever receives them. `v1` is main.ts's default URI version.
 */
export function ssoCookiePath(config: AppConfigService): string {
  return `/${config.get('API_PREFIX')}/v1/auth/sso`;
}

/**
 * The one callback URL every identity provider is registered with: the
 * API's own public origin (API_PUBLIC_URL — only its origin is used, so a
 * value that already ends in /api/v1 works too) plus the callback route.
 * Null until API_PUBLIC_URL is set: with no known public address there is
 * no redirect URI to register, so single sign-on stays off rather than
 * guessing one from a request's Host header.
 */
export function ssoCallbackUrl(config: AppConfigService): string | null {
  const base = config.get('API_PUBLIC_URL');
  if (!base) return null;
  try {
    const { origin } = new URL(base);
    return origin === 'null' ? null : `${origin}${ssoCookiePath(config)}/callback`;
  } catch {
    return null;
  }
}

/**
 * An admin-authored table, one row per trusted identity provider (doc 161,
 * "The hundred-thousandth row"). Bounded rather than paginated.
 */
const MAX_LISTED_CONNECTIONS = 100;

/**
 * Domains anyone can create an address at. Allowing one would let anyone on
 * the internet sign in and be provisioned into the default role, so it is
 * refused at configuration — the one mistake a shop whose staff use
 * personal mailboxes is most likely to make. Not exhaustive by design.
 */
const OPEN_SIGNUP_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
]);

/**
 * Microsoft's multi-tenant endpoints accept ID tokens from every tenant (see
 * OidcProvider, which refuses a templated issuer at sign-in too).
 */
const MULTI_TENANT_PATH_SEGMENTS: ReadonlySet<string> = new Set(['common', 'organizations', 'consumers']);

/** A discovery document fetched in clear text is only acceptable where no network sits in between. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * On NON_DELEGATABLE_PERMISSIONS because a key must not take over its own
 * account — not because it reaches anyone else's. Every seeded role holds
 * it, so it is the one entry that does not make a role admin-capable.
 */
const SELF_ONLY_NON_DELEGATABLE = 'account.change_own_password';

const LINK_AUDIT_ACTIONS = ['sso.user_provisioned', 'sso.account_linked'] as const;

const CONNECTION_SELECT = {
  id: true,
  protocol: true,
  label: true,
  issuerUrl: true,
  clientId: true,
  allowedEmailDomains: true,
  defaultRoleName: true,
  status: true,
  enforceSso: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  // Never selected: credentialEncrypted — write-only from this service
  // outward, the discipline TradingPartner and ApiKey credentials follow.
} satisfies Prisma.SsoConnectionSelect;

type ConnectionRow = Prisma.SsoConnectionGetPayload<{ select: typeof CONNECTION_SELECT }>;

/** The fields an admin edits, audited old-and-new on every change. */
type EditableFields = Pick<
  ConnectionRow,
  'protocol' | 'label' | 'issuerUrl' | 'clientId' | 'allowedEmailDomains' | 'defaultRoleName' | 'status' | 'enforceSso'
>;

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  isActive: true,
  ssoExternalId: true,
} satisfies Prisma.UserSelect;

type SessionUser = Prisma.UserGetPayload<{ select: typeof SESSION_USER_SELECT }>;

const ROLE_SELECT = {
  id: true,
  name: true,
  grants: { select: { permission: { select: { key: true } } } },
} satisfies Prisma.RoleSelect;

type RoleWithGrants = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

/** A connection as the admin screen sees it — never the credential. */
export interface SsoConnectionView extends ConnectionRow {
  /** The callback URL to register at the provider; null until API_PUBLIC_URL is set. */
  redirectUri: string | null;
}

/**
 * The admin list. `redirectUri` sits beside the rows, not only on them: an
 * admin needs it BEFORE the first connection exists, to register the client
 * at the identity provider.
 */
export interface SsoConnectionList {
  redirectUri: string | null;
  connections: SsoConnectionView[];
}

/** A role, and what disqualifies it as a connection's default — empty when it may be one. */
export interface SsoDefaultRoleOption {
  name: string;
  accessWidening: string[];
}

/** What the sign-in screen needs to draw one button. */
export interface SsoSignInOption {
  id: string;
  label: string;
}

/** One account provisioned or linked through a connection — doc 161, "Click the number". */
export interface SsoAccountView {
  userId: string;
  /** Null once the account itself has been erased; the audit row remains. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean | null;
  how: 'PROVISIONED' | 'LINKED';
  at: Date;
  /** Still linked to the identity this connection linked — only then can it be unlinked. */
  linked: boolean;
}

export interface SsoLoginStart extends SsoFlowSecrets {
  authorizationUrl: string;
}

/** A concurrent link or deactivation won the race; the sign-in is resolved again. */
class LinkRaceLost extends Error {}

/**
 * Single sign-on (access-control-identity/161-sso-identity-federation.md):
 * the connections an admin registers, and the sign-in that goes through
 * them. It changes authentication only — an SSO user holds exactly what
 * their roles grant, and a session is minted by `AuthService.issueSession()`,
 * the same `issue()` a password sign-in ends in.
 *
 * Every write that changes who may sign in — a connection created, edited
 * or suspended, an account linked, provisioned or unlinked — writes its
 * evidence-class audit row inside the same transaction (canonical ruling 9):
 * if the audit write fails, the change does not happen.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly providers = new Map<SsoProtocol, IdentityProvider>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
    private readonly config: AppConfigService,
    oidc: OidcProvider,
  ) {
    // One entry per protocol, the way PaymentsService lists its providers;
    // WO-161.2b's SamlProvider joins this list once a client needs it.
    for (const provider of [oidc]) {
      this.providers.set(provider.protocol, provider);
    }
  }

  // ─── the sign-in screen and the flow ────────────────────────────────────

  /**
   * What the admin sign-in screen offers: ACTIVE connections, label only.
   * Empty until API_PUBLIC_URL is set, so the screen never shows a button
   * that cannot work — and with nothing configured it is unchanged.
   */
  async listSignInOptions(): Promise<SsoSignInOption[]> {
    if (!ssoCallbackUrl(this.config)) return [];
    return this.prisma.ssoConnection.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, label: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_LISTED_CONNECTIONS,
    });
  }

  /** Step one: fresh state, nonce and PKCE verifier, and where to send the browser. */
  async startLogin(connectionId: string): Promise<SsoLoginStart> {
    const redirectUri = this.requireCallbackUrl();
    const connection = await this.activeConnection(connectionId);
    const secrets: SsoFlowSecrets = { state: randomToken(), nonce: randomToken(), codeVerifier: randomToken() };

    const authorizationUrl = await this.providerFor(connection.protocol).buildAuthorizationUrl(
      connection,
      secrets.state,
      secrets.nonce,
      secrets.codeVerifier,
      redirectUri,
    );
    return { authorizationUrl, ...secrets };
  }

  /**
   * Step two (doc 161's `ssoLogin()`): the callback, checked against what
   * step one sealed into this browser's own cookie, then the domain gate,
   * then resolve-or-provision, then a session.
   */
  async completeLogin(
    connectionId: string,
    params: SsoCallbackParams,
    expected: SsoFlowSecrets,
  ): Promise<AuthResult> {
    // CSRF: the response must answer the sign-in THIS browser started.
    if (!sameSecret(params.state, expected.state)) {
      throw new SsoSignInRefused(`connection ${connectionId}: the state did not match this browser's sign-in`);
    }

    const connection = await this.activeConnection(connectionId);
    const redirectUri = this.requireCallbackUrl();
    const identity = await this.providerFor(connection.protocol).handleCallback(
      connection,
      params,
      expected,
      redirectUri,
    );

    // §2 — the domain allowlist, refused BEFORE any User lookup: a correctly
    // signed ID token for the wrong domain proves nothing about who may sign
    // in here. The domain is everything after the one '@'; an address with
    // more than one is refused rather than guessed at.
    const email = normalizeEmail(identity.email);
    const at = email ? email.indexOf('@') : -1;
    const domain = email && at > 0 && at === email.lastIndexOf('@') ? email.slice(at + 1) : '';
    if (!email || !domain || !connection.allowedEmailDomains.includes(domain)) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: ${domain ? `"${domain}"` : 'the address'} is not an allowed email domain`,
      );
    }

    const user = await this.resolveOrProvision(connection, email, identity.externalId);
    return this.auth.issueSession(user);
  }

  // ─── connections (settings.sso.manage) ──────────────────────────────────

  async listConnections(): Promise<SsoConnectionList> {
    const rows = await this.prisma.ssoConnection.findMany({
      select: CONNECTION_SELECT,
      orderBy: { createdAt: 'asc' },
      take: MAX_LISTED_CONNECTIONS,
    });
    return { redirectUri: ssoCallbackUrl(this.config), connections: rows.map((row) => this.toView(row)) };
  }

  /**
   * Every role, each with the access-widening permissions that disqualify it
   * as a default — so the admin screen's picker offers only what
   * `assertSafeDefaultRole()` accepts, without needing
   * `roles.manage_permissions` to read the roles screen.
   */
  async defaultRoleOptions(): Promise<SsoDefaultRoleOption[]> {
    const roles = await this.prisma.role.findMany({ select: ROLE_SELECT, orderBy: { name: 'asc' }, take: 500 });
    return roles.map((role) => ({ name: role.name, accessWidening: accessWideningPermissions(role) }));
  }

  async getConnection(id: string): Promise<SsoConnectionView> {
    return this.toView(await this.findConnectionRow(id));
  }

  async createConnection(dto: CreateSsoConnectionDto, actorId: string): Promise<SsoConnectionView> {
    const fields = {
      protocol: dto.protocol,
      label: cleanRequired(dto.label, 'a label — it is what the sign-in button says'),
      issuerUrl: cleanIssuerUrl(dto.issuerUrl),
      clientId: cleanRequired(dto.clientId, 'the client ID'),
      allowedEmailDomains: cleanDomains(dto.allowedEmailDomains),
      defaultRoleName: await this.assertSafeDefaultRole(dto.defaultRoleName),
    };
    const credential = cleanRequired(dto.credential, 'the client secret');

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ssoConnection.create({
        data: {
          ...fields,
          credentialEncrypted: encryptSecret(credential, this.encryptionKey()),
          createdByUserId: actorId,
        },
        select: CONNECTION_SELECT,
      });

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'sso.connection_created',
        entity: 'SsoConnection',
        entityId: created.id,
        // Every value it was created with — never the secret.
        data: { to: { ...fields, status: created.status } },
      });

      return created;
    });

    this.logger.log(`User ${actorId} created SSO connection ${row.id}`);
    return this.toView(row);
  }

  /**
   * Edits a connection. The audit row names the old and the new value of
   * every field that changed — `allowedEmailDomains` and `defaultRoleName`
   * above all, doc 161's "Authority and blast radius" — and whether the
   * secret was replaced, never the secret.
   */
  async updateConnection(id: string, dto: UpdateSsoConnectionDto, actorId: string): Promise<SsoConnectionView> {
    const existing = await this.findConnectionRow(id);

    const next: Partial<EditableFields> = {};
    if (dto.protocol !== undefined) next.protocol = dto.protocol;
    if (dto.label !== undefined) next.label = cleanRequired(dto.label, 'a label — it is what the sign-in button says');
    if (dto.issuerUrl !== undefined) next.issuerUrl = cleanIssuerUrl(dto.issuerUrl);
    if (dto.clientId !== undefined) next.clientId = cleanRequired(dto.clientId, 'the client ID');
    if (dto.allowedEmailDomains !== undefined) next.allowedEmailDomains = cleanDomains(dto.allowedEmailDomains);
    if (dto.defaultRoleName !== undefined) next.defaultRoleName = await this.assertSafeDefaultRole(dto.defaultRoleName);
    if (dto.status !== undefined) next.status = dto.status;
    if (dto.enforceSso !== undefined) next.enforceSso = dto.enforceSso;
    const credential = dto.credential !== undefined ? cleanRequired(dto.credential, 'the client secret') : undefined;

    const changed = (Object.keys(next) as (keyof EditableFields)[]).filter(
      (field) => JSON.stringify(next[field]) !== JSON.stringify(existing[field]),
    );
    if (changed.length === 0 && credential === undefined) {
      throw new BadRequestException('Nothing to change — this connection already has those values.');
    }

    const from = pickFields(existing, changed);
    const to = pickFields(next, changed);
    const action =
      changed.length === 1 && changed[0] === 'status' && credential === undefined
        ? next.status === 'SUSPENDED'
          ? 'sso.connection_suspended'
          : 'sso.connection_resumed'
        : 'sso.connection_updated';

    const row = await this.prisma.$transaction(async (tx) => {
      // The row read above is this write's own predicate (House Rule 10),
      // so the audit's `from` is exactly what the write replaced: an edit
      // landing in between makes this match nothing.
      const [updated] = await tx.ssoConnection.updateManyAndReturn({
        where: { id, updatedAt: existing.updatedAt },
        data: {
          ...to,
          ...(credential !== undefined ? { credentialEncrypted: encryptSecret(credential, this.encryptionKey()) } : {}),
        },
        select: CONNECTION_SELECT,
      });
      if (!updated) {
        throw new ConflictException('This connection was changed while you were editing it. Reload it and try again.');
      }

      await this.audit.recordEvidence(tx, {
        actorId,
        action,
        entity: 'SsoConnection',
        entityId: id,
        data: { from, to, credentialReplaced: credential !== undefined },
      });

      return updated;
    });

    this.logger.log(`User ${actorId} changed SSO connection ${id} (${action})`);
    return this.toView(row);
  }

  /** Stops new sign-ins through the connection at once; no account it provisioned or linked is touched. Idempotent. */
  async suspendConnection(id: string, actorId: string): Promise<SsoConnectionView> {
    const existing = await this.findConnectionRow(id);
    if (existing.status === 'SUSPENDED') return this.toView(existing);

    const row = await this.prisma.$transaction(async (tx) => {
      const [suspended] = await tx.ssoConnection.updateManyAndReturn({
        where: { id, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
        select: CONNECTION_SELECT,
      });
      // A concurrent suspend landed first: only the request that actually
      // suspended it writes the audit row.
      if (!suspended) {
        return tx.ssoConnection.findUniqueOrThrow({ where: { id }, select: CONNECTION_SELECT });
      }

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'sso.connection_suspended',
        entity: 'SsoConnection',
        entityId: id,
        data: { from: { status: 'ACTIVE' }, to: { status: 'SUSPENDED' } },
      });
      return suspended;
    });

    this.logger.log(`User ${actorId} suspended SSO connection ${id}`);
    return this.toView(row);
  }

  /**
   * Every account provisioned or linked through this connection, newest
   * first, read from the audit rows those acts wrote (doc 161, "Click the
   * number") — an index range on AuditLog(entity, entityId).
   */
  async listAccounts(connectionId: string, page: number, pageSize: number): Promise<PaginatedResult<SsoAccountView>> {
    await this.findConnectionRow(connectionId);

    const where: Prisma.AuditLogWhereInput = {
      entity: 'SsoConnection',
      entityId: connectionId,
      action: { in: [...LINK_AUDIT_ACTIONS] },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { action: true, createdAt: true, data: true },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const events = rows.map((row) => ({ ...row, ...linkEventData(row.data) }));
    const userIds = [...new Set(events.map((event) => event.userId).filter((id): id is string => id !== null))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true, isActive: true, ssoExternalId: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    const data = events
      .filter((event): event is typeof event & { userId: string } => event.userId !== null)
      .map((event): SsoAccountView => {
        const user = byId.get(event.userId);
        return {
          userId: event.userId,
          email: user?.email ?? null,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          isActive: user?.isActive ?? null,
          how: event.action === 'sso.user_provisioned' ? 'PROVISIONED' : 'LINKED',
          at: event.createdAt,
          linked: !!user?.ssoExternalId && user.ssoExternalId === event.externalId,
        };
      });

    return paginated(data, total, { page, pageSize });
  }

  /**
   * Unlinks an account's single sign-on identity (doc 161, "The reversal
   * document"). Back to password sign-in means back to it now: every
   * session the account holds is revoked in the same transaction, as a
   * password change does. Idempotent — an unlinked account is left alone.
   */
  async unlinkAccount(connectionId: string, userId: string, actorId: string): Promise<void> {
    await this.findConnectionRow(connectionId);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, ssoExternalId: true } });
    if (!user) throw new NotFoundException('That account does not exist.');
    const externalId = user.ssoExternalId;
    if (!externalId) return;

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id: userId, ssoExternalId: externalId },
        data: { ssoExternalId: null },
      });
      if (count === 0) {
        throw new ConflictException('This account was linked or unlinked by someone else just now. Reload and try again.');
      }

      const sessions = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'sso.account_unlinked',
        entity: 'SsoConnection',
        entityId: connectionId,
        data: { userId, from: externalId, to: null, sessionsRevoked: sessions.count },
      });
    });

    this.logger.log(`User ${actorId} unlinked the single sign-on identity of account ${userId}`);
  }

  // ─── resolve-or-provision (doc 161 §3) ──────────────────────────────────

  private async resolveOrProvision(
    connection: SsoConnection,
    email: string,
    externalId: string,
    retried = false,
  ): Promise<SessionUser> {
    const existing = await this.prisma.user.findUnique({ where: { email }, select: SESSION_USER_SELECT });

    // A deactivated account signs in by no method at all.
    if (existing && !existing.isActive) {
      throw new SsoSignInRefused(`connection ${connection.id}: account ${existing.id} is deactivated`);
    }

    // Already linked to this identity: an ordinary sign-in.
    if (existing && existing.ssoExternalId === externalId) {
      await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      return existing;
    }

    // Linked to a different identity: never silently re-linked — an admin
    // unlinks it first.
    if (existing?.ssoExternalId) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: account ${existing.id} is already linked to a different sign-in identity`,
      );
    }

    // One external identity never lands on a second account — say, after its
    // email changed at the provider. (The User.ssoExternalId index's query.)
    const holder = await this.prisma.user.findFirst({ where: { ssoExternalId: externalId }, select: { id: true } });
    if (holder) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: this identity is already linked to account ${holder.id}, under a different email`,
      );
    }

    try {
      return existing
        ? await this.link(connection, existing, externalId)
        : await this.provision(connection, email, externalId);
    } catch (error) {
      // Doc 161, "The second copy of the write": the loser of two
      // near-simultaneous first sign-ins hits User.email @unique (or finds
      // the row already linked), and resolves once more as the
      // existing-account path — never a duplicate User.
      if (!retried && (error instanceof LinkRaceLost || isUniqueViolation(error))) {
        return this.resolveOrProvision(connection, email, externalId, true);
      }
      throw error;
    }
  }

  /**
   * An existing account at an allowed, provider-verified address is linked
   * automatically — the domain gate is the same trust boundary that makes
   * the allowlist mean anything (whoever controls that mailbox could reset
   * the password anyway). Never silently: audited, and the account holder
   * is mailed (DomainEvent.SsoAccountLinked → SecurityNotificationSubscriber).
   */
  private async link(connection: SsoConnection, user: SessionUser, externalId: string): Promise<SessionUser> {
    return this.prisma.$transaction(async (tx) => {
      // Predicate-on-write (House Rule 10): only a still-unlinked, still-
      // active account. A concurrent link or deactivation makes this match
      // nothing, and the sign-in is resolved again.
      const { count } = await tx.user.updateMany({
        where: { id: user.id, ssoExternalId: null, isActive: true },
        data: { ssoExternalId: externalId, lastLoginAt: new Date() },
      });
      if (count === 0) throw new LinkRaceLost();

      await this.audit.recordEvidence(tx, {
        actorId: user.id,
        action: 'sso.account_linked',
        entity: 'SsoConnection',
        entityId: connection.id,
        data: { userId: user.id, externalId, from: null },
      });
      await this.events.publish(DomainEvent.SsoAccountLinked, { userId: user.id, connectionId: connection.id }, tx);

      return { ...user, ssoExternalId: externalId };
    });
  }

  /**
   * A brand-new account, JIT-provisioned into the connection's default role
   * — least privilege by default. Deliberately NOT UserRegistered: that
   * event's CRM subscriber would file a staff login as a customer Contact.
   * No mail: the person just signed in, live, at their provider.
   */
  private async provision(connection: SsoConnection, email: string, externalId: string): Promise<SessionUser> {
    return this.prisma.$transaction(async (tx) => {
      const { role, withheld } = await this.provisioningRole(tx, connection);

      const user = await tx.user.create({
        data: {
          email,
          ssoExternalId: externalId,
          // The account KIND, never its permissions (those come from the
          // role below): a back-office account, so it is listed in Team &
          // Access, where its roles are managed. The column's CUSTOMER
          // default would hide it from that screen.
          role: 'STAFF',
          isActive: true,
          lastLoginAt: new Date(),
        },
        select: SESSION_USER_SELECT,
      });

      if (role) await this.roles.assign(user.id, role.id, tx);

      await this.audit.recordEvidence(tx, {
        actorId: user.id,
        action: 'sso.user_provisioned',
        entity: 'SsoConnection',
        entityId: connection.id,
        data: { userId: user.id, externalId, role: role?.name ?? null, ...(withheld ? { roleWithheld: withheld } : {}) },
      });
      await this.events.publish(DomainEvent.SsoUserProvisioned, { userId: user.id, connectionId: connection.id }, tx);

      return user;
    });
  }

  /**
   * The role checked at configuration, checked again now — it may have been
   * removed, or given an access-widening permission, since. Either way the
   * account is created with no role (the way self-registration degrades
   * when "Customer" is missing) and an admin assigns one by hand; never
   * provisioned into more than was agreed.
   */
  private async provisioningRole(
    tx: PrismaLike,
    connection: SsoConnection,
  ): Promise<{ role: RoleWithGrants | null; withheld: string | null }> {
    const role = await tx.role.findUnique({ where: { name: connection.defaultRoleName }, select: ROLE_SELECT });
    const widening = role ? accessWideningPermissions(role) : [];
    const withheld = !role
      ? `role "${connection.defaultRoleName}" no longer exists`
      : widening.length > 0
        ? `role "${role.name}" now carries ${widening.join(', ')}`
        : null;

    if (withheld) {
      this.logger.warn(
        `SSO connection ${connection.id}: ${withheld}; the new account gets no role until an admin assigns one.`,
      );
      return { role: null, withheld };
    }
    return { role, withheld: null };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /**
   * Doc 161: never an admin-capable default role. A role new sign-ins land
   * in automatically must exist, and must not let its holder widen anyone's
   * access — NON_DELEGATABLE_PERMISSIONS, this codebase's own list of
   * exactly those (users.manage, roles.manage_permissions, settings.manage,
   * settings.sso.manage, …). Grant more by hand after a first sign-in.
   */
  private async assertSafeDefaultRole(rawName: string): Promise<string> {
    const name = rawName.trim();
    const role = name ? await this.prisma.role.findUnique({ where: { name }, select: ROLE_SELECT }) : null;
    if (!role) {
      throw new BadRequestException(`There is no role named "${name}". Pick an existing role for new sign-ins.`);
    }

    const widening = accessWideningPermissions(role);
    if (widening.length > 0) {
      throw new BadRequestException(
        `New sign-ins cannot be given "${name}": it can change other people's access (${widening.join(', ')}). ` +
          'Pick a role without those permissions, and grant more by hand after someone first signs in.',
      );
    }
    return name;
  }

  private async findConnectionRow(id: string): Promise<ConnectionRow> {
    const row = await this.prisma.ssoConnection.findUnique({ where: { id }, select: CONNECTION_SELECT });
    if (!row) throw new NotFoundException('That single sign-on connection does not exist.');
    return row;
  }

  /** The full row, credential included — for the provider only; it never leaves this service. */
  private async activeConnection(id: string): Promise<SsoConnection> {
    const connection = await this.prisma.ssoConnection.findUnique({ where: { id } });
    if (!connection || connection.status !== 'ACTIVE') {
      throw new SsoSignInRefused(`connection ${id} does not exist or is suspended`);
    }
    return connection;
  }

  private providerFor(protocol: SsoProtocol): IdentityProvider {
    const provider = this.providers.get(protocol);
    if (!provider) throw new SsoSignInRefused(`no identity provider is registered for ${protocol}`);
    return provider;
  }

  private requireCallbackUrl(): string {
    const url = ssoCallbackUrl(this.config);
    if (!url) throw new SsoSignInRefused('API_PUBLIC_URL is not set, so there is no callback URL to sign in through');
    return url;
  }

  private encryptionKey(): string {
    return this.config.get('APP_ENCRYPTION_KEY');
  }

  private toView(row: ConnectionRow): SsoConnectionView {
    return { ...row, redirectUri: ssoCallbackUrl(this.config) };
  }
}

function pickFields(source: Partial<EditableFields>, fields: readonly (keyof EditableFields)[]): Partial<EditableFields> {
  const picked: Partial<EditableFields> = {};
  for (const field of fields) {
    Object.assign(picked, { [field]: source[field] });
  }
  return picked;
}

function accessWideningPermissions(role: RoleWithGrants): string[] {
  return role.grants
    .map((grant) => grant.permission.key)
    .filter((key) => key !== SELF_ONLY_NON_DELEGATABLE && !isDelegatablePermission(key));
}

function cleanRequired(raw: string, what: string): string {
  const value = raw.trim();
  if (!value) throw new BadRequestException(`Enter ${what}.`);
  return value;
}

/**
 * An issuer identifier, normalised the way OidcProvider compares it with
 * the discovery document: no trailing slash, no well-known suffix.
 */
function cleanIssuerUrl(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/\/\.well-known\/openid-configuration\/?$/i, '')
    .replace(/\/+$/, '');

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new BadRequestException('The issuer URL is not a valid URL — for example https://accounts.google.com.');
  }

  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))) {
    throw new BadRequestException(
      'The issuer URL must use https — the keys every sign-in is checked against are read from it.',
    );
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new BadRequestException('The issuer URL cannot carry a user name, a query string or a fragment.');
  }

  const firstSegment = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  if (firstSegment && MULTI_TENANT_PATH_SEGMENTS.has(firstSegment)) {
    throw new BadRequestException(
      `"/${firstSegment}" is a multi-tenant endpoint: it accepts sign-ins from every organization that uses this provider. ` +
        "Use your own tenant's issuer URL instead (it contains your tenant ID).",
    );
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

function cleanDomains(raw: readonly string[]): string[] {
  const domains = [...new Set(raw.map((domain) => domain.trim().toLowerCase().replace(/^@/, '')))].filter(Boolean);
  if (domains.length === 0) {
    throw new BadRequestException('Allow at least one email domain.');
  }

  for (const domain of domains) {
    if (!DOMAIN_PATTERN.test(domain)) {
      throw new BadRequestException(`"${domain}" is not a domain. Enter it as example.com — no @, no wildcard.`);
    }
    if (OPEN_SIGNUP_EMAIL_DOMAINS.has(domain)) {
      throw new BadRequestException(
        `Anyone can create an address at ${domain}, so allowing it would let anyone sign in and be given the default role. ` +
          "Allow your organization's own email domain instead.",
      );
    }
  }
  return domains;
}

function linkEventData(data: Prisma.JsonValue): { userId: string | null; externalId: string | null } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { userId: null, externalId: null };
  const record = data as Record<string, unknown>;
  return {
    userId: typeof record.userId === 'string' ? record.userId : null,
    externalId: typeof record.externalId === 'string' ? record.externalId : null,
  };
}

function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
