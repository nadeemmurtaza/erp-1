import 'reflect-metadata';
import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '@newax/shared/secret-crypto';
import type { Request, Response } from 'express';
import type { AppConfigService } from '../config/app-config.service';
import { REFRESH_COOKIE, SSO_HANDOFF_COOKIE, SSO_STATE_COOKIE } from './auth.constants';
import type { AuthService } from './auth.service';
import { SsoSignInRefused } from './identity-provider';
import { SsoController } from './sso.controller';
import type { SsoService } from './sso.service';

/**
 * 161-sso-identity-federation.md — the browser half: what the two SSO
 * cookies carry, that a forged, stale or missing one is refused, that every
 * failure ends in a redirect rather than a stranded error page, and that no
 * token is ever put in a URL.
 */
describe('SsoController', () => {
  const KEY = 'k'.repeat(32);
  const env: Record<string, string> = {
    APP_ENCRYPTION_KEY: KEY,
    API_PREFIX: 'api',
    STOREFRONT_URL: 'https://shop.test/',
    JWT_REFRESH_TTL: '30d',
  };
  const FAILED = 'https://shop.test/admin/login?sso=failed';
  const COMPLETE = 'https://shop.test/admin/login/sso-complete';
  const FLOW = { connectionId: 'c1', state: 'state-abc', nonce: 'nonce-abc', codeVerifier: 'verifier-abc' };

  let sso: { startLogin: jest.Mock; completeLogin: jest.Mock; listSignInOptions: jest.Mock };
  let auth: { refresh: jest.Mock };
  let controller: SsoController;

  const response = () => {
    const res = {
      cookies: {} as Record<string, { value: string; options: Record<string, unknown> }>,
      cleared: [] as string[],
      redirectedTo: null as string | null,
      status: null as number | null,
      cookie: jest.fn((name: string, value: string, options: Record<string, unknown>) => {
        res.cookies[name] = { value, options };
      }),
      clearCookie: jest.fn((name: string) => {
        res.cleared.push(name);
      }),
      redirect: jest.fn((status: number, url: string) => {
        res.status = status;
        res.redirectedTo = url;
      }),
    };
    return res;
  };
  const request = (cookies: Record<string, string> = {}) => ({ cookies }) as unknown as Request;
  const sealed = (payload: object, expiresAt = Date.now() + 60_000) =>
    encryptSecret(JSON.stringify({ ...payload, expiresAt }), KEY);

  beforeEach(() => {
    sso = {
      startLogin: jest.fn(),
      completeLogin: jest.fn(),
      listSignInOptions: jest.fn().mockResolvedValue([]),
    };
    auth = { refresh: jest.fn() };
    controller = new SsoController(
      sso as unknown as SsoService,
      auth as unknown as AuthService,
      { get: (key: string) => env[key], isProduction: false } as unknown as AppConfigService,
    );
  });

  describe('start', () => {
    it('seals the flow into a short-lived, httpOnly cookie scoped to /auth/sso, then redirects to the provider', async () => {
      sso.startLogin.mockResolvedValue({ authorizationUrl: 'https://idp.test/authorize?x', ...FLOW, connectionId: undefined });
      const res = response();

      await controller.start('c1', res as unknown as Response);

      const cookie = res.cookies[SSO_STATE_COOKIE];
      expect(cookie.options).toEqual(
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/api/v1/auth/sso', maxAge: 10 * 60_000 }),
      );
      // Sealed: neither readable nor forgeable without APP_ENCRYPTION_KEY.
      expect(cookie.value).not.toContain('state-abc');
      expect(JSON.parse(decryptSecret(cookie.value, KEY))).toEqual(expect.objectContaining(FLOW));
      expect(res.status).toBe(302);
      expect(res.redirectedTo).toBe('https://idp.test/authorize?x');
    });

    it('redirects a refused start to the sign-in page, with no cookie set', async () => {
      sso.startLogin.mockRejectedValue(new SsoSignInRefused('connection c1 does not exist or is suspended'));
      const res = response();

      await controller.start('c1', res as unknown as Response);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirectedTo).toBe(FAILED);
    });
  });

  describe('callback', () => {
    it('completes the sign-in, hands the session over in a sealed cookie, and puts no token in the URL', async () => {
      sso.completeLogin.mockResolvedValue({ accessToken: 'access-token', refreshToken: 'refresh-token', user: {} });
      const res = response();

      await controller.callback(
        // Google adds scope/authuser/hd/prompt; they are ignored, never an error.
        { code: 'code-1', state: 'state-abc', scope: 'openid email', authuser: '0', hd: 'shop.test', prompt: 'none' },
        request({ [SSO_STATE_COOKIE]: sealed(FLOW) }),
        res as unknown as Response,
      );

      expect(sso.completeLogin).toHaveBeenCalledWith('c1', { code: 'code-1', state: 'state-abc' }, expect.objectContaining(FLOW));
      expect(res.cleared).toContain(SSO_STATE_COOKIE);

      const handoff = res.cookies[SSO_HANDOFF_COOKIE];
      expect(handoff.options).toEqual(expect.objectContaining({ httpOnly: true, path: '/api/v1/auth/sso', maxAge: 2 * 60_000 }));
      expect(JSON.parse(decryptSecret(handoff.value, KEY)).refreshToken).toBe('refresh-token');

      expect(res.redirectedTo).toBe(COMPLETE);
      expect(res.redirectedTo).not.toContain('token');
    });

    it.each([
      ['no state cookie at all', {}],
      ['a forged state cookie', { [SSO_STATE_COOKIE]: 'not-a-sealed-value' }],
      ['a state cookie sealed under another key', { [SSO_STATE_COOKIE]: encryptSecret(JSON.stringify({ ...FLOW, expiresAt: Date.now() + 60_000 }), 'z'.repeat(32)) }],
      ['an expired state cookie', { [SSO_STATE_COOKIE]: sealed(FLOW, Date.now() - 1) }],
      ['a state cookie missing its verifier', { [SSO_STATE_COOKIE]: sealed({ connectionId: 'c1', state: 's', nonce: 'n' }) }],
    ])('refuses %s — redirected, nothing completed', async (_label, cookies) => {
      const res = response();

      await controller.callback({ code: 'code-1', state: 'state-abc' }, request(cookies), res as unknown as Response);

      expect(sso.completeLogin).not.toHaveBeenCalled();
      expect(res.cookies[SSO_HANDOFF_COOKIE]).toBeUndefined();
      expect(res.redirectedTo).toBe(FAILED);
    });

    it('treats a provider error (the person cancelled) as a failed sign-in, never an error page', async () => {
      const res = response();

      await controller.callback(
        { error: 'access_denied', state: 'state-abc' },
        request({ [SSO_STATE_COOKIE]: sealed(FLOW) }),
        res as unknown as Response,
      );

      expect(sso.completeLogin).not.toHaveBeenCalled();
      expect(res.redirectedTo).toBe(FAILED);
    });

    it('refuses a repeated parameter', async () => {
      const res = response();

      await controller.callback(
        { code: ['a', 'b'], state: 'state-abc' },
        request({ [SSO_STATE_COOKIE]: sealed(FLOW) }),
        res as unknown as Response,
      );

      expect(sso.completeLogin).not.toHaveBeenCalled();
      expect(res.redirectedTo).toBe(FAILED);
    });

    it('redirects when the service refuses the sign-in', async () => {
      sso.completeLogin.mockRejectedValue(new SsoSignInRefused('connection c1: "elsewhere.test" is not an allowed email domain'));
      const res = response();

      await controller.callback({ code: 'c', state: 'state-abc' }, request({ [SSO_STATE_COOKIE]: sealed(FLOW) }), res as unknown as Response);

      expect(res.redirectedTo).toBe(FAILED);
      expect(res.cookies[SSO_HANDOFF_COOKIE]).toBeUndefined();
    });

    it("is not refused by the global ValidationPipe — a Record<string, unknown> query is passed through untouched", async () => {
      const [metatype] = Reflect.getMetadata('design:paramtypes', SsoController.prototype, 'callback') as unknown[];
      expect(metatype).toBe(Object);

      // main.ts's own options.
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: false },
      });
      const query = { code: 'c', state: 's', scope: 'openid', authuser: '0', hd: 'shop.test', prompt: 'none' };
      await expect(pipe.transform(query, { type: 'query', metatype: Object })).resolves.toEqual(query);
    });
  });

  describe('session', () => {
    it('redeems the handoff once: rotates it through the ordinary refresh path and writes the refresh cookie', async () => {
      const result = { accessToken: 'a', refreshToken: 'rotated', expiresIn: '15m', user: { id: 'u1' } };
      auth.refresh.mockResolvedValue(result);
      const res = response();

      await expect(
        controller.session(request({ [SSO_HANDOFF_COOKIE]: sealed({ refreshToken: 'from-callback' }) }), res as unknown as Response),
      ).resolves.toBe(result);

      expect(auth.refresh).toHaveBeenCalledWith('from-callback');
      expect(res.cleared).toContain(SSO_HANDOFF_COOKIE);
      expect(res.cookies[REFRESH_COOKIE].value).toBe('rotated');
      expect(res.cookies[REFRESH_COOKIE].options).toEqual(expect.objectContaining({ httpOnly: true, path: '/' }));
    });

    it.each([
      ['no handoff cookie — a visit that did not come from a callback', {}],
      ['an expired handoff', { [SSO_HANDOFF_COOKIE]: sealed({ refreshToken: 'x' }, Date.now() - 1) }],
      ['a forged handoff', { [SSO_HANDOFF_COOKIE]: 'forged' }],
    ])('refuses %s, touching no session', async (_label, cookies) => {
      const res = response();
      await expect(controller.session(request(cookies), res as unknown as Response)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(res.cookies[REFRESH_COOKIE]).toBeUndefined();
    });
  });
});
