import { HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { apiKeySurfaceOf, effectiveApiKeyPermissions, expandCustomerScopes } from '@newax/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { hashApiKey } from '../../security/api-token';
import type { AuthenticatedUser } from '../auth.constants';
import { PermissionsResolverService } from '../permissions.service';

/** `lastUsedAt` is stamped at most this often per key — a key making 300 requests a minute writes it once. */
export const API_KEY_LAST_USED_RESOLUTION_MS = 60_000;

/**
 * Failed key authentications one client address may make per window before
 * its key attempts are refused with a 429, without a database lookup.
 *
 * Needed because the global guards run authenticate → permissions →
 * throttle: a request whose credential fails never reaches ThrottlerGuard,
 * so without this a stream of well-formed garbage keys would be an
 * unthrottled, unauthenticated path to a database query. Only failures
 * count — a legitimate integration's traffic is limited by ThrottlerGuard
 * alone, exactly as a session's is.
 */
export const API_KEY_FAILURE_LIMIT = 20;
export const API_KEY_FAILURE_WINDOW_MS = 60_000;

/**
 * How many addresses the failure table tracks at once. Past this, expired
 * windows are pruned, then the oldest — so a flood from many addresses costs
 * bounded memory. Per process, the same scope as ThrottlerGuard's own
 * in-memory storage; horizontal replicas (ADR-018, open) would move both to
 * shared storage together.
 */
const MAX_TRACKED_ADDRESSES = 10_000;

const NOT_VALID = 'This API key is not valid.';

export interface ApiKeyAuthContext {
  /** The client address the request came from (Express `request.ip`) — what failures are counted against. */
  clientIp?: string;
  now?: Date;
}

/**
 * Turns a raw personal API key into the principal it acts as — or a 401 that
 * says why not (163-personal-api-keys.md §2).
 *
 * Everything that decides what the key may do is read fresh on every call,
 * never cached: whether it is revoked or expired, whether its owner is still
 * active, and — for an ADMIN key — its owner's live permissions, intersected
 * with the key's own through `effectiveApiKeyPermissions()`. The same
 * guarantee JwtStrategy.validate() gives a session: a demoted owner's keys
 * shrink on their very next request, and a revoked key is refused on its
 * very next request, with no cache to wait out.
 *
 * The same scheme as TradingPartnersService.verifyInboundKey() and
 * NodeCredentialService.verify(): the raw key is hashed and looked up by a
 * unique index; it is never compared, logged or stored.
 */
@Injectable()
export class ApiKeyAuthService {
  private readonly logger = new Logger(ApiKeyAuthService.name);
  /** Failed attempts per client address, in the current window. Insertion order ≈ age, for pruning. */
  private readonly failures = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsResolverService,
  ) {}

  async authenticate(raw: string, { clientIp, now = new Date() }: ApiKeyAuthContext = {}): Promise<AuthenticatedUser> {
    const claimedSurface = apiKeySurfaceOf(raw);
    if (!claimedSurface) throw new UnauthorizedException(NOT_VALID);

    this.assertNotLockedOut(clientIp, now);
    const refuse = (message: string, keyId?: string, why?: string): UnauthorizedException => {
      if (keyId) this.logger.warn(`Refused API key ${keyId}: ${why}`);
      this.recordFailure(clientIp, now);
      return new UnauthorizedException(message);
    };

    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(raw) },
      select: {
        id: true,
        userId: true,
        surface: true,
        permissionKeys: true,
        customerScopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        user: { select: { id: true, email: true, phone: true, isActive: true } },
      },
    });

    // A prefix that disagrees with the stored surface is not a key this
    // system issued — refused the same way as one it has never seen.
    if (!key || key.surface !== claimedSurface) throw refuse(NOT_VALID);

    if (key.revokedAt) throw refuse('This API key has been revoked.', key.id, 'revoked');
    if (key.expiresAt.getTime() <= now.getTime()) throw refuse('This API key has expired.', key.id, 'expired');
    if (!key.user.isActive) {
      throw refuse('The account this API key belongs to is no longer active.', key.id, 'its owner is deactivated');
    }

    let permissions: string[] = [];
    let customerScopes: string[] = [];
    if (key.surface === 'ADMIN') {
      const live = await this.permissions.resolveForUser(key.userId);
      permissions = effectiveApiKeyPermissions(key.permissionKeys, live.permissions);
    } else {
      customerScopes = expandCustomerScopes(key.customerScopes);
    }

    this.recordUse(key.id, key.lastUsedAt, now);

    return {
      id: key.user.id,
      roles: [],
      permissions,
      email: key.user.email,
      phone: key.user.phone,
      apiKey: { id: key.id, surface: key.surface, customerScopes },
    };
  }

  /** Refuses, with a 429 and no lookup, an address that has failed too often in the current window. */
  private assertNotLockedOut(clientIp: string | undefined, now: Date): void {
    if (!clientIp) return;
    const entry = this.failures.get(clientIp);
    if (entry && entry.resetAt > now.getTime() && entry.count >= API_KEY_FAILURE_LIMIT) {
      throw new HttpException(
        'Too many failed API key attempts from this address. Wait a minute, then check the key and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private recordFailure(clientIp: string | undefined, now: Date): void {
    if (!clientIp) return;
    const time = now.getTime();
    const entry = this.failures.get(clientIp);

    if (entry && entry.resetAt > time) {
      entry.count += 1;
      if (entry.count === API_KEY_FAILURE_LIMIT) {
        this.logger.warn(
          `Locked ${clientIp} out of API-key authentication for this window after ${API_KEY_FAILURE_LIMIT} failures`,
        );
      }
      return;
    }

    // A new window: re-inserted so the map's order stays oldest-first.
    this.failures.delete(clientIp);
    this.failures.set(clientIp, { count: 1, resetAt: time + API_KEY_FAILURE_WINDOW_MS });
    if (this.failures.size > MAX_TRACKED_ADDRESSES) this.pruneFailures(time);
  }

  private pruneFailures(time: number): void {
    for (const [address, entry] of this.failures) {
      if (entry.resetAt <= time) this.failures.delete(address);
    }
    for (const address of this.failures.keys()) {
      if (this.failures.size <= MAX_TRACKED_ADDRESSES) break;
      this.failures.delete(address);
    }
  }

  /**
   * Operational, not evidence: a dropped write here must never fail an
   * otherwise-valid request (the same discipline NodeCredentialService uses
   * for `lastSeenAt`), so it is fire-and-forget — but logged, never
   * swallowed silently. The predicate keeps concurrent requests from all
   * writing, and never touches a revoked row.
   */
  private recordUse(id: string, lastUsedAt: Date | null, now: Date): void {
    if (lastUsedAt && now.getTime() - lastUsedAt.getTime() < API_KEY_LAST_USED_RESOLUTION_MS) return;

    const stale = new Date(now.getTime() - API_KEY_LAST_USED_RESOLUTION_MS);
    void this.prisma.apiKey
      .updateMany({
        where: { id, revokedAt: null, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: stale } }] },
        data: { lastUsedAt: now },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Could not record the use of API key ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
