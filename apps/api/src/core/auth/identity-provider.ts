import { UnauthorizedException } from '@nestjs/common';
import type { SsoConnection, SsoProtocol } from '../prisma/client';

/** All a person is ever told when single sign-on fails. */
export const SSO_SIGN_IN_FAILED = 'Single sign-on did not complete. Try again, or sign in with your password.';

/**
 * A refused single sign-on (161-sso-identity-federation.md, "The failure
 * path"). `detail` names the check that refused it, for the operator's log;
 * the response only ever carries SSO_SIGN_IN_FAILED — never a stack trace,
 * and never which account or domain was turned away.
 */
export class SsoSignInRefused extends UnauthorizedException {
  constructor(readonly detail: string) {
    super(SSO_SIGN_IN_FAILED);
  }
}

/**
 * What an identity provider sends back to the callback in an
 * authorization-code flow — and only that. Front-channel tokens
 * (`id_token`, `access_token`, a JARM `response`) are never part of this
 * flow, so they are never accepted from the query string at all.
 */
export interface SsoCallbackParams {
  code: string;
  state: string;
  /** RFC 9207 — the issuer, when the provider sends it (mix-up protection). */
  iss?: string;
  /** OIDC Session Management, when the provider sends it. */
  session_state?: string;
}

/**
 * Minted by the start step and required again by the callback. They live in
 * a sealed, httpOnly cookie between the two, never in a URL.
 */
export interface SsoFlowSecrets {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/** Who the provider says signed in, after every protocol check has passed. */
export interface VerifiedIdentity {
  /** As asserted and verified by the provider — SsoService normalizes it. */
  email: string;
  /**
   * Stable across email changes and unique across providers: for OIDC,
   * `<iss>#<sub>`, since a `sub` is only unique within its own issuer
   * (OIDC Core §5.7).
   */
  externalId: string;
}

/**
 * One sign-in protocol (161-sso-identity-federation.md §1, doc 128's own
 * interface). Implemented once per protocol and chosen by
 * `SsoConnection.protocol` — never a class per vendor, since Google, Entra
 * and Okta all speak the same OIDC.
 *
 * Doc 128 sketched one `verifyAssertion(rawAssertion)` method; a real
 * browser-redirect OIDC flow has two steps — sending the person to the
 * provider, and completing the code exchange when they come back — so the
 * interface has exactly those two.
 */
export interface IdentityProvider {
  readonly protocol: SsoProtocol;

  /** Where to send the browser to sign in, carrying `state`, `nonce` and a PKCE (S256) challenge for `codeVerifier`. */
  buildAuthorizationUrl(
    connection: SsoConnection,
    state: string,
    nonce: string,
    codeVerifier: string,
    redirectUri: string,
  ): Promise<string>;

  /**
   * Exchanges the code and verifies the ID token — signature, issuer,
   * audience, expiry, nonce, state and PKCE. Throws on anything it cannot
   * verify; it never returns an identity it did not prove.
   */
  handleCallback(
    connection: SsoConnection,
    params: SsoCallbackParams,
    expected: SsoFlowSecrets,
    redirectUri: string,
  ): Promise<VerifiedIdentity>;
}
