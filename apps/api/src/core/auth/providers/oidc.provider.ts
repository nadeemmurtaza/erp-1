import { Injectable } from '@nestjs/common';
import { decryptSecret } from '@newax/shared/secret-crypto';
import { Issuer, generators, type Client, type IdTokenClaims } from 'openid-client';
import { AppConfigService } from '../../config/app-config.service';
import { SsoProtocol, type SsoConnection } from '../../prisma/client';
import {
  SsoSignInRefused,
  type IdentityProvider,
  type SsoCallbackParams,
  type SsoFlowSecrets,
  type VerifiedIdentity,
} from '../identity-provider';

/*
 * Dependency record (.claude/rules/dependencies.md), for openid-client:
 *
 *   Dependency: openid-client 5.7.1 — pinned exactly, like every dependency
 *     in apps/api/package.json.
 *   Purpose: OIDC discovery, PKCE, the authorization-code exchange and
 *     ID-token verification (JWKS fetch and key rotation, signature,
 *     iss/aud/exp/nonce) for single sign-on (doc 161, WO-161.2).
 *   Existing Alternative: none. @nestjs/jwt verifies this API's own HS256
 *     tokens; nothing here verifies another party's rotating RS256 keys.
 *   Why Existing Alternative Is Insufficient: verifying an identity
 *     provider's ID tokens is security-critical protocol code — discovery,
 *     key sets, a dozen claim checks — that must not be written by hand.
 *   Security Considerations: an OpenID-certified relying-party library. The
 *     5.x line because 6.x is ESM-only and this API is CommonJS. The client
 *     secret is decrypted only inside the call that needs it.
 *   Maintenance Considerations: 5.x still receives fixes; four small
 *     runtime dependencies (jose 4, lru-cache 6, object-hash 2,
 *     oidc-token-hash 5).
 *   Bundle / Runtime Impact: server-side only; nothing reaches a browser.
 *   Approval Required: named in the WO-161.2 brief; recorded in doc 161's
 *     status note for the owner's review.
 */

/** `email` for the gate, `profile` so a provider that only puts email in the ID token when asked does. */
const SCOPE = 'openid email profile';

/**
 * Every OIDC provider — Google Workspace, Microsoft Entra ID, Okta — through
 * one class, chosen by `SsoConnection.protocol` (doc 161 §1).
 *
 * Discovery runs per sign-in step rather than being cached: sign-in is rare
 * (once per session), and an uncached read can never serve a key set the
 * provider has since rotated away from.
 */
@Injectable()
export class OidcProvider implements IdentityProvider {
  readonly protocol = SsoProtocol.OIDC;

  constructor(private readonly config: AppConfigService) {}

  async buildAuthorizationUrl(
    connection: SsoConnection,
    state: string,
    nonce: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<string> {
    const client = await this.clientFor(connection, redirectUri);
    return client.authorizationUrl({
      scope: SCOPE,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      nonce,
      code_challenge: generators.codeChallenge(codeVerifier),
      code_challenge_method: 'S256',
    });
  }

  async handleCallback(
    connection: SsoConnection,
    params: SsoCallbackParams,
    expected: SsoFlowSecrets,
    redirectUri: string,
  ): Promise<VerifiedIdentity> {
    const client = await this.clientFor(connection, redirectUri);

    let claims: IdTokenClaims;
    try {
      // The library checks state, the RFC 9207 `iss` where the provider
      // advertises it, and a provider-side error; exchanges the code with
      // the PKCE verifier; and verifies the ID token's signature against the
      // provider's key set, its issuer, audience, expiry and nonce.
      const tokenSet = await client.callback(
        redirectUri,
        {
          code: params.code,
          state: params.state,
          ...(params.iss !== undefined ? { iss: params.iss } : {}),
          ...(params.session_state !== undefined ? { session_state: params.session_state } : {}),
        },
        {
          response_type: 'code',
          state: expected.state,
          nonce: expected.nonce,
          code_verifier: expected.codeVerifier,
        },
      );
      claims = tokenSet.claims();
    } catch (error) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: the code exchange or ID token check failed (${describeCause(error)})`,
      );
    }

    return identityFromClaims(claims, connection.id);
  }

  private async clientFor(connection: SsoConnection, redirectUri: string): Promise<Client> {
    let issuer: Issuer;
    try {
      issuer = await Issuer.discover(connection.issuerUrl);
    } catch (error) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: the discovery document could not be read (${describeCause(error)})`,
      );
    }

    // OIDC Discovery §4.3: a discovery document must name the issuer it was
    // fetched for — openid-client 5 does not check that itself. A templated
    // issuer ("{tenantid}", Microsoft's multi-tenant endpoints) would accept
    // ID tokens from ANY tenant of that provider, and Entra's `email` claim
    // is not verified: refused outright, whatever the stored URL looks like.
    const discovered = typeof issuer.metadata.issuer === 'string' ? issuer.metadata.issuer : '';
    if (discovered.includes('{') || trimTrailingSlashes(discovered) !== trimTrailingSlashes(connection.issuerUrl)) {
      throw new SsoSignInRefused(
        `connection ${connection.id}: the discovery document names a different or multi-tenant issuer ("${discovered}")`,
      );
    }

    let clientSecret: string;
    try {
      clientSecret = decryptSecret(connection.credentialEncrypted, this.config.get('APP_ENCRYPTION_KEY'));
    } catch {
      throw new SsoSignInRefused(
        `connection ${connection.id}: the stored client secret could not be decrypted — was APP_ENCRYPTION_KEY rotated? Re-enter the secret.`,
      );
    }

    return new issuer.Client({
      client_id: connection.clientId,
      client_secret: clientSecret,
      redirect_uris: [redirectUri],
      response_types: ['code'],
    });
  }
}

/**
 * The identity a verified ID token proves. Refuses a token with no email,
 * and one whose provider says the email is NOT verified — an unverified
 * email claim proves nothing about who owns the mailbox. A provider that
 * sends no `email_verified` at all (Entra ID) is accepted: its connection is
 * pinned to one tenant (above, and at configuration), whose own
 * administrators own that directory's addresses.
 */
export function identityFromClaims(claims: IdTokenClaims, connectionId: string): VerifiedIdentity {
  const email = typeof claims.email === 'string' ? claims.email.trim() : '';
  if (!email) {
    throw new SsoSignInRefused(`connection ${connectionId}: the ID token carried no email claim`);
  }

  const verified: unknown = claims.email_verified;
  if (verified !== undefined && verified !== true && verified !== 'true') {
    throw new SsoSignInRefused(
      `connection ${connectionId}: the identity provider has not verified the email address (email_verified is ${String(verified)})`,
    );
  }

  if (typeof claims.iss !== 'string' || !claims.iss || typeof claims.sub !== 'string' || !claims.sub) {
    throw new SsoSignInRefused(`connection ${connectionId}: the ID token carried no issuer or subject`);
  }

  return { email, externalId: `${claims.iss}#${claims.sub}` };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * A library error, safe to log: its class and message, with anything long
 * enough to be a state, nonce, code or token masked — openid-client puts
 * the expected and received values into messages like "state mismatch".
 */
function describeCause(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  const message = error.message.replace(/[A-Za-z0-9_\-.~+/=]{16,}/g, '…');
  return `${error.name}: ${message}`;
}
