import { JwtService } from '@nestjs/jwt';
import { MAX_SIGNED_URL_TTL_SECONDS, STORAGE_URL_AUDIENCE, StorageUrlSigner, assertSignedUrlTtl } from './storage-url-signer';
import type { AppConfigService } from '../config/app-config.service';

const SECRET = 'storage-url-signer-spec-secret-at-least-32-characters';
const KEY = 'visual-search/2026/10/shopper-0123456789abcdef0123456789abcdef.webp';

/**
 * The token behind a local signed URL (ADR-091). Every way it can fail must
 * read as `false` — never a throw that a caller might catch and serve anyway.
 */
describe('StorageUrlSigner', () => {
  const jwt = new JwtService();
  const config = { get: jest.fn(() => SECRET) } as unknown as AppConfigService;
  const signer = new StorageUrlSigner(jwt, config);

  it('verifies its own token for exactly the key it names', async () => {
    const token = await signer.sign(KEY, 60);
    await expect(signer.verify(token, KEY)).resolves.toBe(true);
    await expect(signer.verify(token, `${KEY}.other`)).resolves.toBe(false);
  });

  it('puts the audience, the key and the expiry in the token, HS256', async () => {
    const token = await signer.sign(KEY, 300);
    const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string }; payload: { sub: string; aud: string; iat: number; exp: number } };
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload).toMatchObject({ sub: KEY, aud: STORAGE_URL_AUDIENCE });
    expect(decoded.payload.exp - decoded.payload.iat).toBe(300);
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 600;
    const token = await jwt.signAsync({ sub: KEY, aud: STORAGE_URL_AUDIENCE, iat: past, exp: past + 300 }, { secret: SECRET, algorithm: 'HS256' });
    await expect(signer.verify(token, KEY)).resolves.toBe(false);
  });

  it('rejects a token signed with another secret', async () => {
    const token = await jwt.signAsync({ sub: KEY, aud: STORAGE_URL_AUDIENCE }, { secret: `${SECRET}-other`, expiresIn: 60 });
    await expect(signer.verify(token, KEY)).resolves.toBe(false);
  });

  it.each([
    ['a session access token (no aud)', { sub: KEY }],
    ['an embed-widget token', { sub: KEY, aud: 'embed-widget' }],
    ['a micro-frontend fragment token', { sub: KEY, aud: 'micro-frontend-fragment' }],
  ])('rejects %s signed with the same secret', async (_label, payload) => {
    const token = await jwt.signAsync(payload, { secret: SECRET, expiresIn: 60 });
    await expect(signer.verify(token, KEY)).resolves.toBe(false);
  });

  it('rejects an unsigned (alg: none) token', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: KEY, aud: STORAGE_URL_AUDIENCE, exp })}.`;
    await expect(signer.verify(token, KEY)).resolves.toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await signer.sign(KEY, 60);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'rag-ocr/2026/10/page-1.webp', aud: STORAGE_URL_AUDIENCE, exp: 9_999_999_999 })).toString('base64url');
    await expect(signer.verify(`${header}.${forged}.${signature}`, 'rag-ocr/2026/10/page-1.webp')).resolves.toBe(false);
  });

  it.each([[undefined], [''], [42], [['a', 'b']], ['not-a-jwt']])('rejects %j without throwing', async (token) => {
    await expect(signer.verify(token, KEY)).resolves.toBe(false);
  });

  describe('lifetime', () => {
    it.each([0, -1, 1.5, Number.NaN, MAX_SIGNED_URL_TTL_SECONDS + 1])('refuses %p seconds rather than clamping it', (ttl) => {
      expect(() => assertSignedUrlTtl(ttl)).toThrow(RangeError);
    });

    it('accepts 1 second up to the 7-day ceiling S3 itself enforces', () => {
      expect(MAX_SIGNED_URL_TTL_SECONDS).toBe(604_800);
      expect(() => assertSignedUrlTtl(1)).not.toThrow();
      expect(() => assertSignedUrlTtl(MAX_SIGNED_URL_TTL_SECONDS)).not.toThrow();
    });

    it('sign() refuses an out-of-range lifetime before minting anything', async () => {
      await expect(signer.sign(KEY, 0)).rejects.toThrow(RangeError);
    });
  });
});
