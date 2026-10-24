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
