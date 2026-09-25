import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  API_KEY_MAX_ACTIVE_PER_SURFACE,
  API_KEY_MAX_LIFETIME_DAYS,
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PREFIXES,
  effectiveApiKeyPermissions,
  expandCustomerScopes,
  nonDelegatableReason,
  refuseApiKeyPermissions,
  unknownCustomerScopes,
  type ApiKeyPermissionRefusal,
  type ApiKeySurface,
} from '@newax/shared';
import { AuditService, type AuditEntry } from '../../audit/audit.service';
import { paginated, type PaginatedResult } from '../../common/dto/pagination.dto';
import { DomainEvent } from '../../events/domain-events';
import { EventBusService } from '../../events/event-bus.service';
import type { ApiKeyRevocationReason, Prisma } from '../../prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateApiKey, hashApiKey } from '../../security/api-token';
import type { AuthenticatedUser } from '../auth.constants';
import { PermissionsResolverService } from '../permissions.service';

const DAY_MS = 86_400_000;

export type ApiKeyStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export const API_KEY_STATUSES: readonly ApiKeyStatus[] = ['ACTIVE', 'EXPIRED', 'REVOKED'];

/** One key, as its owner sees it. Never the secret, never its hash. */
export interface ApiKeyView {
  id: string;
  name: string;
  surface: ApiKeySurface;
  /** `nxa_`/`nxs_` — with `lastFour`, how a list tells keys apart. */
  prefix: string;
  lastFour: string;
  /** What the owner chose (ADMIN keys). */
  permissionKeys: string[];
  /** What the owner chose (STOREFRONT keys). */
  customerScopes: string[];
  /**
   * What the key can do on its next request: an ADMIN key's permissions
   * still held by its owner right now, a STOREFRONT key's scopes expanded
   * (write ⇒ read). Empty once it is expired or revoked.
   */
  effectiveScopes: string[];
  /**
   * ADMIN only: carried but paused, because the owner no longer holds them
   * (or they have since become non-delegatable). They resume by themselves
   * if the owner is granted them again — the key's scopes are a ceiling, the
   * owner's live access is the other one.
   */
  pausedScopes: string[];
  status: ApiKeyStatus;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: ApiKeyRevocationReason | null;
}

/** A key together with its raw secret — returned by create and rotate, and by nothing else, ever. */
export interface IssuedApiKey {
  key: ApiKeyView;
  secret: string;
}

/** One key, as the `users.manage` oversight list sees it: its owner, its stored scopes, its state — no secret, no hash. */
export interface ApiKeyOversightView extends Omit<ApiKeyView, 'effectiveScopes' | 'pausedScopes'> {
  owner: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    role: string;
    isActive: boolean;
  };
}

export interface CreateApiKeyInput {
  surface: ApiKeySurface;
  name: string;
  permissionKeys?: string[];
  customerScopes?: string[];
  expiresInDays: number;
}

export interface UpdateApiKeyInput {
  name?: string;
  permissionKeys?: string[];
  customerScopes?: string[];
}

export interface ApiKeyOversightQuery {
  surface?: ApiKeySurface;
  status?: ApiKeyStatus;
  q?: string;
  page: number;
  pageSize: number;
}

const KEY_SELECT = {
  id: true,
  userId: true,
  name: true,
  surface: true,
  lastFour: true,
  permissionKeys: true,
  customerScopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  rotatedAt: true,
  revokedAt: true,
  revokedReason: true,
  // Never selected: keyHash — write-only from this service outward, the same
  // discipline TradingPartner, Node and PosTerminal credentials follow.
} satisfies Prisma.ApiKeySelect;

const OWNER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
} satisfies Prisma.UserSelect;

type KeyRow = Prisma.ApiKeyGetPayload<{ select: typeof KEY_SELECT }>;
type KeyRowWithOwner = Prisma.ApiKeyGetPayload<{ select: typeof KEY_SELECT & { user: { select: typeof OWNER_SELECT } } }>;

/**
 * The lifecycle of personal API keys — and the only code that writes
 * `ApiKey` (163-personal-api-keys.md §5).
 *
 * Every method that acts for the owner refuses an API-key principal itself
 * (`assertSession`), beneath the `@SessionOnly()` its controller already
 * carries: a key never manages keys, by two independent checks.
 *
 * Every change to what a key may do — create, rotate, scope edit, revoke —
 * writes its audit row inside the same transaction (canonical ruling 9,
 * evidence class): if the audit write fails, the change does not happen.
 * Create and rotate put `ApiKeyIssued` in the outbox in that transaction
 * too, so the owner's security mail cannot be lost to a crash between the
 * two.
 */
@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsResolverService,
    private readonly audit: AuditService,
    private readonly events: EventBusService,
  ) {}

  /** The owner's own keys on one surface, newest first. */
  async listMine(
    actor: AuthenticatedUser,
    surface: ApiKeySurface,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<ApiKeyView>> {
    this.assertSession(actor);

    const where: Prisma.ApiKeyWhereInput = { userId: actor.id, surface };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.apiKey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: KEY_SELECT,
      }),
      this.prisma.apiKey.count({ where }),
    ]);

    const live = await this.livePermissions(actor.id, surface);
    const now = new Date();
    return paginated(
      rows.map((row) => this.toView(row, live, now)),
      total,
      { page, pageSize },
    );
  }

  async create(actor: AuthenticatedUser, input: CreateApiKeyInput): Promise<IssuedApiKey> {
    this.assertSession(actor);

    const now = new Date();
    const name = this.cleanName(input.name);
    const expiresAt = this.expiryFrom(now, input.expiresInDays);
    // Re-resolved here rather than read off `actor.permissions`: this
    // service's guarantee — a key is only ever granted what its owner holds
    // right now — must not depend on what a caller passed in.
    const live = await this.livePermissions(actor.id, input.surface);
    const scopes = this.validateScopes(input.surface, input.permissionKeys, input.customerScopes, live);

    const active = await this.prisma.apiKey.count({
      where: { userId: actor.id, surface: input.surface, revokedAt: null, expiresAt: { gt: now } },
    });
    if (active >= API_KEY_MAX_ACTIVE_PER_SURFACE) {
      throw new ConflictException(
        `You already have ${API_KEY_MAX_ACTIVE_PER_SURFACE} active keys here. Revoke one you no longer use, then create this one.`,
      );
    }

    const secret = generateApiKey(API_KEY_PREFIXES[input.surface]);
    const lastFour = secret.slice(-4);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          userId: actor.id,
          surface: input.surface,
          name,
          keyHash: hashApiKey(secret),
          lastFour,
          permissionKeys: scopes.permissionKeys,
          customerScopes: scopes.customerScopes,
          expiresAt,
        },
        select: KEY_SELECT,
      });

      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'api_key.created',
        entity: 'ApiKey',
        entityId: created.id,
        data: {
          ownerId: actor.id,
          surface: created.surface,
          name,
          permissionKeys: scopes.permissionKeys,
          customerScopes: scopes.customerScopes,
          expiresAt: expiresAt.toISOString(),
          lastFour,
        },
      });

      await this.events.publish(
        DomainEvent.ApiKeyIssued,
        { userId: actor.id, apiKeyId: created.id, surface: created.surface, lastFour, reason: 'CREATED' },
        tx,
      );

      return created;
    });

    this.logger.log(`User ${actor.id} created ${row.surface} API key ${row.id}`);
    return { key: this.toView(row, live, now), secret };
  }

  /** Renames a key and/or replaces its scopes — re-validated exactly as at create. */
  async update(actor: AuthenticatedUser, id: string, input: UpdateApiKeyInput): Promise<ApiKeyView> {
    this.assertSession(actor);

    const scopesChanging = input.permissionKeys !== undefined || input.customerScopes !== undefined;
    if (input.name === undefined && !scopesChanging) {
      throw new BadRequestException('Nothing to change — send a new name, new scopes, or both.');
    }

    const existing = await this.findOwn(actor.id, id);
    if (existing.revokedAt) {
      throw new ConflictException('This key is revoked, and a revoked key cannot be changed. Create a new one.');
    }

    const now = new Date();
    const name = input.name !== undefined ? this.cleanName(input.name) : existing.name;
    const live = await this.livePermissions(actor.id, existing.surface);
    // A permission the key already carries may stay on it even while paused
    // (the owner no longer holds it): keeping it widens nothing, and it
    // resumes only if the owner is granted it again. Anything added must be
    // held right now.
    const scopes = scopesChanging
      ? this.validateScopes(existing.surface, input.permissionKeys, input.customerScopes, live, existing.permissionKeys)
      : { permissionKeys: existing.permissionKeys, customerScopes: existing.customerScopes };

    const row = await this.prisma.$transaction(async (tx) => {
      // The values read above are the write's own predicate (House Rule 10),
      // so the audit row's `from` is exactly what this write replaced: a
      // revoke or another edit landing in between makes this match nothing.
      const [updated] = await tx.apiKey.updateManyAndReturn({
        where: {
          id,
          userId: actor.id,
          revokedAt: null,
          name: existing.name,
          permissionKeys: { equals: existing.permissionKeys },
          customerScopes: { equals: existing.customerScopes },
        },
        data: { name, permissionKeys: scopes.permissionKeys, customerScopes: scopes.customerScopes },
        select: KEY_SELECT,
      });
      if (!updated) {
        throw new ConflictException('This key was changed or revoked while you were editing it. Reload it and try again.');
      }

      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: scopesChanging ? 'api_key.scopes_changed' : 'api_key.renamed',
        entity: 'ApiKey',
        entityId: id,
        // The old and the new value, not a list of changed fields.
        data: {
          ownerId: actor.id,
          from: {
            name: existing.name,
            permissionKeys: existing.permissionKeys,
            customerScopes: existing.customerScopes,
          },
          to: { name, permissionKeys: scopes.permissionKeys, customerScopes: scopes.customerScopes },
        },
      });

      return updated;
    });

    return this.toView(row, live, now);
  }

  /**
   * A new secret and a new expiry for the same key. The scopes do not change
   * — rotation never widens — and the old secret stops working on its next
   * request, because its hash is overwritten, not kept beside the new one.
   * Renews an expired key; never a revoked one.
   */
  async rotate(actor: AuthenticatedUser, id: string, expiresInDays: number): Promise<IssuedApiKey> {
    this.assertSession(actor);

    // The one read that selects keyHash — only to use it as the write's own
    // predicate below; it never leaves this method.
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, userId: actor.id },
      select: { ...KEY_SELECT, keyHash: true },
    });
    if (!existing) throw new NotFoundException('That API key does not exist.');
    if (existing.revokedAt) {
      throw new ConflictException('This key is revoked, and a revoked key cannot be rotated. Create a new one.');
    }

    const now = new Date();
    const expiresAt = this.expiryFrom(now, expiresInDays);
    const secret = generateApiKey(API_KEY_PREFIXES[existing.surface]);
    const lastFour = secret.slice(-4);

    const row = await this.prisma.$transaction(async (tx) => {
      // Predicated on the secret being replaced: of two concurrent rotations
      // exactly one wins, so no caller is handed a secret that is already
      // dead, and the audit row's `from` is the secret this write replaced.
      const [rotated] = await tx.apiKey.updateManyAndReturn({
        where: { id, userId: actor.id, revokedAt: null, keyHash: existing.keyHash },
        data: { keyHash: hashApiKey(secret), lastFour, expiresAt, rotatedAt: now },
        select: KEY_SELECT,
      });
      if (!rotated) {
        throw new ConflictException('This key was rotated or revoked by another request. Reload it and try again.');
      }

      await this.audit.recordEvidence(tx, {
        actorId: actor.id,
        action: 'api_key.rotated',
        entity: 'ApiKey',
        entityId: id,
        data: {
          ownerId: actor.id,
          from: { lastFour: existing.lastFour, expiresAt: existing.expiresAt.toISOString() },
          to: { lastFour, expiresAt: expiresAt.toISOString() },
        },
      });

      await this.events.publish(
        DomainEvent.ApiKeyIssued,
        { userId: actor.id, apiKeyId: id, surface: existing.surface, lastFour, reason: 'ROTATED' },
        tx,
      );

      return rotated;
    });

    this.logger.log(`User ${actor.id} rotated API key ${id}`);
    const live = await this.livePermissions(actor.id, row.surface);
    return { key: this.toView(row, live, now), secret };
  }

  /** Revokes one of the owner's own keys. Final, and idempotent — revoking a revoked key changes nothing. */
  async revoke(actor: AuthenticatedUser, id: string): Promise<ApiKeyView> {
    this.assertSession(actor);

    const existing = await this.findOwn(actor.id, id);
    const now = new Date();
    const row = await this.revokeRow(existing, actor.id, 'OWNER', now);
    const live = await this.livePermissions(actor.id, row.surface);
    return this.toView(row, live, now);
  }

  /** Every account's keys, for `users.manage` — metadata only; no secret can be read after issue. */
  async listAll(actor: AuthenticatedUser, query: ApiKeyOversightQuery): Promise<PaginatedResult<ApiKeyOversightView>> {
    this.assertSession(actor);

    const now = new Date();
    const search = query.q?.trim();
    const where: Prisma.ApiKeyWhereInput = {
      ...(query.surface ? { surface: query.surface } : {}),
      ...statusFilter(query.status, now),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { firstName: { contains: search, mode: 'insensitive' } } },
              { user: { lastName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.apiKey.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { ...KEY_SELECT, user: { select: OWNER_SELECT } },
      }),
      this.prisma.apiKey.count({ where }),
    ]);

    return paginated(
      rows.map((row) => this.toOversightView(row, now)),
      total,
      { page: query.page, pageSize: query.pageSize },
    );
  }

  /** A `users.manage` holder revokes anyone's key. Recorded as the owner's own revoke when it is their own. */
  async revokeAsAdministrator(actor: AuthenticatedUser, id: string): Promise<ApiKeyOversightView> {
    this.assertSession(actor);

    const existing = await this.prisma.apiKey.findUnique({
      where: { id },
      select: { ...KEY_SELECT, user: { select: OWNER_SELECT } },
    });
    if (!existing) throw new NotFoundException('That API key does not exist.');

    const now = new Date();
    const reason: ApiKeyRevocationReason = existing.userId === actor.id ? 'OWNER' : 'ADMINISTRATOR';
    const row = await this.revokeRow(existing, actor.id, reason, now);
    return this.toOversightView({ ...row, user: existing.user }, now);
  }

  /**
   * Revokes every key a person still holds, inside the caller's transaction —
   * `UsersAdminService.update()` calls it in the same transaction that sets
   * `isActive = false` (canonical ruling 6: deactivation removes authority
   * synchronously). Expired-but-unrevoked keys are revoked too, so
   * reactivating the account can never revive any of them, and each gets its
   * own evidence-class audit row. Idempotent: a second call finds nothing.
   */
  async revokeAllForUserInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    actorId: string,
    now: Date = new Date(),
  ): Promise<number> {
    // One statement, returning exactly the rows it revoked — so the audit
    // names those and no others, even if the owner revoked one a moment ago.
    const revoked = await tx.apiKey.updateManyAndReturn({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, revokedReason: 'OWNER_DEACTIVATED', revokedById: actorId },
      select: { id: true, surface: true, lastFour: true },
    });
    if (revoked.length === 0) return 0;

    await this.audit.recordEvidence(
      tx,
      revoked.map(
        (key): AuditEntry => ({
          actorId,
          action: 'api_key.revoked',
          entity: 'ApiKey',
          entityId: key.id,
          data: { ownerId: userId, reason: 'OWNER_DEACTIVATED', surface: key.surface, lastFour: key.lastFour },
        }),
      ),
    );

    this.logger.log(`Revoked ${revoked.length} API key(s) of deactivated user ${userId}`);
    return revoked.length;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  /** A key never manages keys — refused here as well as by `@SessionOnly()` on every route that reaches this service. */
  private assertSession(actor: AuthenticatedUser): void {
    if (actor.apiKey) {
      throw new ForbiddenException('API keys cannot manage API keys. Sign in to do this.');
    }
  }

  private async findOwn(userId: string, id: string): Promise<KeyRow> {
    // Someone else's key and no key at all answer identically — no oracle
    // for which ids exist.
    const row = await this.prisma.apiKey.findFirst({ where: { id, userId }, select: KEY_SELECT });
    if (!row) throw new NotFoundException('That API key does not exist.');
    return row;
  }

  private async revokeRow<T extends KeyRow>(
    existing: T,
    actorId: string,
    reason: ApiKeyRevocationReason,
    now: Date,
  ): Promise<KeyRow> {
    if (existing.revokedAt) return existing;

    return this.prisma.$transaction(async (tx) => {
      const [revoked] = await tx.apiKey.updateManyAndReturn({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: reason, revokedById: actorId },
        select: KEY_SELECT,
      });

      // A concurrent revoke landed first: the key is already final, and only
      // the request that actually revoked it writes the audit row.
      if (!revoked) {
        return tx.apiKey.findUniqueOrThrow({ where: { id: existing.id }, select: KEY_SELECT });
      }

      await this.audit.recordEvidence(tx, {
        actorId,
        action: 'api_key.revoked',
        entity: 'ApiKey',
        entityId: existing.id,
        data: { ownerId: existing.userId, reason, surface: existing.surface, lastFour: existing.lastFour },
      });
      this.logger.log(`API key ${existing.id} revoked (${reason}) by ${actorId}`);
      return revoked;
    });
  }

  /** The owner's live permissions — only an ADMIN key is capped by them; a storefront key's cap is the account being active. */
  private async livePermissions(userId: string, surface: ApiKeySurface): Promise<string[]> {
    if (surface !== 'ADMIN') return [];
    return (await this.permissions.resolveForUser(userId)).permissions;
  }

  /**
   * The scopes a key may be given right now, or a 400 naming every refusal.
   * Each surface takes only its own catalogue. A future order-placement
   * storefront scope must add its toxic-pair refusal (with `addresses:write`)
   * here — 163-personal-api-keys.md §7.
   */
  private validateScopes(
    surface: ApiKeySurface,
    permissionKeys: string[] | undefined,
    customerScopes: string[] | undefined,
    ownerLivePermissions: readonly string[],
    alreadyCarried: readonly string[] = [],
  ): { permissionKeys: string[]; customerScopes: string[] } {
    if (surface === 'ADMIN') {
      if (customerScopes?.length) {
        throw new BadRequestException('An admin key carries permissions, not storefront scopes.');
      }
      const requested = [...new Set(permissionKeys ?? [])];
      if (requested.length === 0) {
        throw new BadRequestException('Choose at least one permission for this key.');
      }
      const refusals = refuseApiKeyPermissions(requested, ownerLivePermissions).filter(
        ({ key, refusal }) => !(refusal === 'NOT_HELD' && alreadyCarried.includes(key)),
      );
      if (refusals.length > 0) {
        throw new BadRequestException(refusals.map(describeRefusal).join(' '));
      }
      return { permissionKeys: requested, customerScopes: [] };
    }

    if (permissionKeys?.length) {
      throw new BadRequestException('A storefront key carries storefront scopes, not admin permissions.');
    }
    const requested = [...new Set(customerScopes ?? [])];
    if (requested.length === 0) {
      throw new BadRequestException('Choose at least one scope for this key.');
    }
    const unknown = unknownCustomerScopes(requested);
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown storefront scope(s): ${unknown.join(', ')}.`);
    }
    return { permissionKeys: [], customerScopes: requested };
  }

  private cleanName(raw: string): string {
    const name = raw.trim();
    if (!name) throw new BadRequestException('Give the key a name, so you can tell it apart later.');
    if (name.length > API_KEY_NAME_MAX_LENGTH) {
      throw new BadRequestException(`A key name can be at most ${API_KEY_NAME_MAX_LENGTH} characters.`);
    }
    return name;
  }

  private expiryFrom(now: Date, days: number): Date {
    if (!Number.isInteger(days) || days < 1 || days > API_KEY_MAX_LIFETIME_DAYS) {
      throw new BadRequestException(`A key lives between 1 and ${API_KEY_MAX_LIFETIME_DAYS} days.`);
    }
    return new Date(now.getTime() + days * DAY_MS);
  }

  private toView(row: KeyRow, ownerLivePermissions: readonly string[], now: Date): ApiKeyView {
    const status = statusOf(row, now);
    const effectiveScopes =
      status !== 'ACTIVE'
        ? []
        : row.surface === 'ADMIN'
          ? effectiveApiKeyPermissions(row.permissionKeys, ownerLivePermissions)
          : expandCustomerScopes(row.customerScopes);
    const pausedScopes =
      status === 'ACTIVE' && row.surface === 'ADMIN'
        ? row.permissionKeys.filter((key) => !effectiveScopes.includes(key))
        : [];

    return {
      ...this.baseView(row, status),
      effectiveScopes,
      pausedScopes,
    };
  }

  private toOversightView(row: KeyRowWithOwner, now: Date): ApiKeyOversightView {
    return { ...this.baseView(row, statusOf(row, now)), owner: row.user };
  }

  private baseView(row: KeyRow, status: ApiKeyStatus): Omit<ApiKeyView, 'effectiveScopes' | 'pausedScopes'> {
    return {
      id: row.id,
      name: row.name,
      surface: row.surface,
      prefix: `${API_KEY_PREFIXES[row.surface]}_`,
      lastFour: row.lastFour,
      permissionKeys: row.permissionKeys,
      customerScopes: row.customerScopes,
      status,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      rotatedAt: row.rotatedAt,
      revokedAt: row.revokedAt,
      revokedReason: row.revokedReason,
    };
  }
}

function statusOf(row: { revokedAt: Date | null; expiresAt: Date }, now: Date): ApiKeyStatus {
  if (row.revokedAt) return 'REVOKED';
  return row.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE';
}

function statusFilter(status: ApiKeyStatus | undefined, now: Date): Prisma.ApiKeyWhereInput {
  switch (status) {
    case 'ACTIVE':
      return { revokedAt: null, expiresAt: { gt: now } };
    case 'EXPIRED':
      return { revokedAt: null, expiresAt: { lte: now } };
    case 'REVOKED':
      return { revokedAt: { not: null } };
    default:
      return {};
  }
}

function describeRefusal({ key, refusal }: { key: string; refusal: ApiKeyPermissionRefusal }): string {
  switch (refusal) {
    case 'NON_DELEGATABLE':
      return `"${key}" can never be put in an API key: ${nonDelegatableReason(key)}`;
    case 'NOT_HELD':
      return `You do not hold "${key}", so a key of yours cannot carry it.`;
    case 'UNKNOWN':
      return `"${key}" is not a permission.`;
  }
}
