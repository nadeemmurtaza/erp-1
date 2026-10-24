import { UnauthorizedException } from '@nestjs/common';

/**
 * Extracts the raw credential from an `Authorization: Bearer <token>`
 * header — shared by every machine-to-machine auth path (the trading
 * partner portal, WO-18.2; node-to-node replication, WO-20.2) so a missing
 * or malformed header reads as the caller's own mistake rather than "no
 * key presented", the same way in both places.
 */
export function bearerToken(authorization: string | undefined): string {
  if (!authorization?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing or malformed Authorization header — expected "Bearer <api key>".');
  }
  return authorization.slice('Bearer '.length);
}

/**
 * The credential in an `Authorization: Bearer <credential>` header, or
 * undefined — never throws. For JwtAuthGuard, which must look at the
 * credential before deciding which path authenticates it (a personal API
 * key, or a session JWT). Parsed exactly as passport-jwt's
 * `fromAuthHeaderAsBearerToken()` parses it — the first two
 * whitespace-separated tokens, scheme compared case-insensitively — so the
 * two paths can never disagree about which string is the credential.
 */
export function bearerCredential(authorization: string | undefined): string | undefined {
  const match = /(\S+)\s+(\S+)/.exec(authorization ?? '');
  if (!match || match[1].toLowerCase() !== 'bearer') return undefined;
  return match[2];
}
