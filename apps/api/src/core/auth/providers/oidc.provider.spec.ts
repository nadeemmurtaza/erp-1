import { UnauthorizedException } from '@nestjs/common';
import { encryptSecret } from '@newax/shared/secret-crypto';
import { Issuer, generators } from 'openid-client';
import type { AppConfigService } from '../../config/app-config.service';
import type { SsoConnection } from '../../prisma/client';
import { SsoSignInRefused } from '../identity-provider';
import { OidcProvider, identityFromClaims } from './oidc.provider';

// Discovery is the only network call before the code exchange; the client it
// builds is a test double. The real `generators` stay, so PKCE is real.
jest.mock('openid-client', () => ({
  ...jest.requireActual('openid-client'),
  Issuer: { discover: jest.fn() },
}));

/** 161-sso-identity-federation.md, WO-161.2 — what OidcProvider refuses to believe. */
describe('OidcProvider', () => {
  const KEY = 'k'.repeat(32);
  const REDIRECT = 'https://api.shop.test/api/v1/auth/sso/callback';
  const EXPECTED = { state: 'state-abc', nonce: 'nonce-abc', codeVerifier: 'verifier-abcdefghijklmnopqrstuvwxyz0123456789' };

  const connection = (overrides: Partial<SsoConnection> = {}): SsoConnection => ({
    id: 'c1',
    protocol: 'OIDC',
    label: 'Head office Workspace',
    issuerUrl: 'https://idp.shop.test',
    clientId: 'client-1',
    credentialEncrypted: encryptSecret('client-secret', KEY),
    allowedEmailDomains: ['shop.test'],
    defaultRoleName: 'Staff',
    status: 'ACTIVE',
    enforceSso: false,
    createdByUserId: 'admin-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  let provider: OidcProvider;
  let client: { authorizationUrl: jest.Mock; callback: jest.Mock };
  let ClientCtor: jest.Mock;

  const discover = (issuer = 'https://idp.shop.test') => {
    (Issuer.discover as jest.Mock).mockResolvedValue({ metadata: { issuer }, Client: ClientCtor });
  };
  const idTokenClaims = (claims: Record<string, unknown>) => {
    client.callback.mockResolvedValue({ claims: () => claims });
  };

  beforeEach(() => {
    client = {
      authorizationUrl: jest.fn().mockReturnValue('https://idp.shop.test/authorize?…'),
      callback: jest.fn(),
    };
    ClientCtor = jest.fn().mockImplementation(() => client);
    discover();
    provider = new OidcProvider({ get: (key: string) => (key === 'APP_ENCRYPTION_KEY' ? KEY : undefined) } as unknown as AppConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleCallback', () => {
    it('refuses an ID token with no email claim', async () => {
      idTokenClaims({ iss: 'https://idp.shop.test', sub: 'sub-1' });

      await expect(
        provider.handleCallback(connection(), { code: 'code', state: EXPECTED.state }, EXPECTED, REDIRECT),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('refuses an email the provider explicitly says it has not verified', async () => {
      idTokenClaims({ iss: 'https://idp.shop.test', sub: 'sub-1', email: 'sana@shop.test', email_verified: false });

      await expect(
        provider.handleCallback(connection(), { code: 'code', state: EXPECTED.state }, EXPECTED, REDIRECT),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the verified identity, namespaced by issuer, after the library checked state, nonce and PKCE', async () => {
      idTokenClaims({ iss: 'https://idp.shop.test', sub: 'sub-1', email: 'sana@shop.test', email_verified: true });

      await expect(
        provider.handleCallback(
          connection(),
          { code: 'code-1', state: EXPECTED.state, iss: 'https://idp.shop.test' },
          EXPECTED,
          REDIRECT,
        ),
      ).resolves.toEqual({ email: 'sana@shop.test', externalId: 'https://idp.shop.test#sub-1' });

      expect(client.callback).toHaveBeenCalledWith(
        REDIRECT,
        { code: 'code-1', state: EXPECTED.state, iss: 'https://idp.shop.test' },
        { response_type: 'code', state: EXPECTED.state, nonce: EXPECTED.nonce, code_verifier: EXPECTED.codeVerifier },
      );
      expect(ClientCtor).toHaveBeenCalledWith({
        client_id: 'client-1',
        client_secret: 'client-secret',
        redirect_uris: [REDIRECT],
        response_types: ['code'],
      });
    });

    it('turns a library refusal into a sign-in refusal whose log detail masks the state it quotes', async () => {
      client.callback.mockRejectedValue(
        new Error('state mismatch, expected state-abcdefghijklmnopqrstuvwxyz, got: forged-abcdefghijklmnopqrstuvwxyz'),
      );

      const refusal = await provider
        .handleCallback(connection(), { code: 'code', state: EXPECTED.state }, EXPECTED, REDIRECT)
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(SsoSignInRefused);
      expect((refusal as SsoSignInRefused).detail).toContain('state mismatch');
      expect((refusal as SsoSignInRefused).detail).not.toContain('abcdefghijklmnopqrstuvwxyz');
      // The person is told only that it failed.
      expect((refusal as SsoSignInRefused).message).not.toContain('state');
    });
  });

  describe('trusting the discovery document', () => {
    it.each([
      ['names a different issuer', 'https://attacker.test'],
      ['is multi-tenant ("{tenantid}")', 'https://login.microsoftonline.com/{tenantid}/v2.0'],
    ])('refuses one that %s', async (_label, issuer) => {
      discover(issuer);
      await expect(
        provider.buildAuthorizationUrl(connection(), 's', 'n', EXPECTED.codeVerifier, REDIRECT),
      ).rejects.toBeInstanceOf(SsoSignInRefused);
      expect(ClientCtor).not.toHaveBeenCalled();
    });

    it('accepts the issuer with or without a trailing slash', async () => {
      discover('https://idp.shop.test/');
      await expect(
        provider.buildAuthorizationUrl(connection(), 's', 'n', EXPECTED.codeVerifier, REDIRECT),
      ).resolves.toBeDefined();
    });

    it('refuses when the stored secret cannot be decrypted (APP_ENCRYPTION_KEY rotated)', async () => {
      await expect(
        provider.buildAuthorizationUrl(
          connection({ credentialEncrypted: encryptSecret('client-secret', 'z'.repeat(32)) }),
          's',
          'n',
          EXPECTED.codeVerifier,
          REDIRECT,
        ),
      ).rejects.toBeInstanceOf(SsoSignInRefused);
    });

    it('refuses when discovery itself fails', async () => {
      (Issuer.discover as jest.Mock).mockRejectedValue(new Error('expected 200 OK, got: 404 Not Found'));
      await expect(
        provider.buildAuthorizationUrl(connection(), 's', 'n', EXPECTED.codeVerifier, REDIRECT),
      ).rejects.toBeInstanceOf(SsoSignInRefused);
    });
  });

  describe('buildAuthorizationUrl', () => {
    it('asks for a code with a PKCE S256 challenge of the verifier, the state and the nonce', async () => {
      await provider.buildAuthorizationUrl(connection(), 'state-1', 'nonce-1', EXPECTED.codeVerifier, REDIRECT);

      expect(client.authorizationUrl).toHaveBeenCalledWith({
        scope: 'openid email profile',
        response_type: 'code',
        redirect_uri: REDIRECT,
        state: 'state-1',
        nonce: 'nonce-1',
        code_challenge: generators.codeChallenge(EXPECTED.codeVerifier),
        code_challenge_method: 'S256',
      });
    });
  });
});

describe('identityFromClaims', () => {
  const base = { iss: 'https://idp.shop.test', sub: 'sub-1', aud: 'client-1', exp: 0, iat: 0 };

  it.each([
    ['no email claim', { ...base }],
    ['an empty email claim', { ...base, email: '  ' }],
    ['email_verified: false', { ...base, email: 'a@shop.test', email_verified: false }],
    ['email_verified: "false"', { ...base, email: 'a@shop.test', email_verified: 'false' }],
    ['email_verified: null', { ...base, email: 'a@shop.test', email_verified: null }],
    ['no subject', { ...base, sub: '', email: 'a@shop.test' }],
  ])('refuses %s', (_label, claims) => {
    expect(() => identityFromClaims(claims as never, 'c1')).toThrow(SsoSignInRefused);
  });

  it('accepts a verified email, and one from a provider that sends no email_verified at all (Entra ID)', () => {
    expect(identityFromClaims({ ...base, email: 'a@shop.test', email_verified: true } as never, 'c1')).toEqual({
      email: 'a@shop.test',
      externalId: 'https://idp.shop.test#sub-1',
    });
    expect(identityFromClaims({ ...base, email: 'a@shop.test' } as never, 'c1').email).toBe('a@shop.test');
  });

  it('keeps two providers’ identical `sub` values apart', () => {
    const google = identityFromClaims({ ...base, iss: 'https://accounts.google.com', email: 'a@shop.test' } as never, 'c1');
    const okta = identityFromClaims({ ...base, iss: 'https://shop.okta.com', email: 'a@shop.test' } as never, 'c2');
    expect(google.externalId).not.toBe(okta.externalId);
  });
});
