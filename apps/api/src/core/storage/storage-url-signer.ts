import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service';

/**
 * The `aud` of a storage URL token. No other token here carries it: sessions
 * carry none, embeds `embed-widget`, fragments `micro-frontend-fragment`, so
 * none of them opens a file, and a storage token cannot be replayed as a
 * session either (`JwtStrategy` looks `sub` up as a `User.id`; a key holds `/`).
 */
export const STORAGE_URL_AUDIENCE = 'storage-object';

/**
 * The longest life a signed URL may have: 7 days, AWS Signature V4's own
 * ceiling for a presigned URL — so a TTL is accepted or refused identically
 * on the local and S3 drivers. ADR-091's parameter table.
 */
export const MAX_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Rejects a TTL that is not a whole number of seconds from 1 to MAX_SIGNED_URL_TTL_SECONDS — a caller's bug, never silently clamped. */
export function assertSignedUrlTtl(expiresInSeconds: number): void {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new RangeError(
      `A signed URL lives 1 to ${MAX_SIGNED_URL_TTL_SECONDS} whole seconds; ${expiresInSeconds} was asked for.`,
    );
  }
}

/**
 * Mints and checks the token of a local-driver signed URL (ADR-091): the same
 * short-lived JWT under `JWT_ACCESS_SECRET`, with its own `aud`, that
 * `EmbedWidgetsService` and `FragmentsService` already issue. The token names
 * one key and expires; `FilesController` serves a private object only when
 * the request's token verifies for exactly the key requested.
 */
@Injectable()
export class StorageUrlSigner {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /** Rejects (never throws synchronously) on an out-of-range lifetime or a signing failure. */
  async sign(key: string, expiresInSeconds: number): Promise<string> {
    assertSignedUrlTtl(expiresInSeconds);
    return this.jwt.signAsync(
      { sub: key, aud: STORAGE_URL_AUDIENCE },
      { secret: this.secret(), expiresIn: expiresInSeconds, algorithm: 'HS256' },
    );
  }

  /** True only for an unexpired HS256 token, signed here, for `aud: storage-object`, naming exactly `key`. Never throws. */
  async verify(token: unknown, key: string): Promise<boolean> {
    if (typeof token !== 'string' || token.length === 0) return false;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: unknown }>(token, {
        secret: this.secret(),
        audience: STORAGE_URL_AUDIENCE,
        algorithms: ['HS256'],
      });
      return payload.sub === key;
    } catch {
      return false;
    }
  }

  private secret(): string {
    return this.config.get('JWT_ACCESS_SECRET');
  }
}
