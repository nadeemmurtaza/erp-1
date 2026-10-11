import { JwtService } from '@nestjs/jwt';
import { LocalStorageDriver, buildKey } from './local-storage.driver';
import { StorageUrlSigner } from './storage-url-signer';
import type { AppConfigService } from '../config/app-config.service';

const SECRET = 'local-storage-driver-spec-secret-at-least-32-characters';
const BASE = 'https://api.example.test/api/v1/files';
const KEY = 'rag-ocr/2026/10/page-1-0123456789abcdef0123456789abcdef.webp';

function driverWith(env: Record<string, string | undefined>) {
  const config = { get: jest.fn((name: string) => env[name]) } as unknown as AppConfigService;
  const signer = new StorageUrlSigner(new JwtService(), config);
  return { driver: new LocalStorageDriver(config, signer), signer };
}

/** ADR-091 — the local driver's signed URL is real, and it never degrades to the plain one. */
describe('LocalStorageDriver.signedUrlFor', () => {
  it('returns the object URL plus a token that verifies for exactly that key', async () => {
    const { driver, signer } = driverWith({ JWT_ACCESS_SECRET: SECRET, LOCAL_STORAGE_PUBLIC_URL: BASE });

    const signed = new URL(await driver.signedUrlFor(KEY, 300));

    expect(`${signed.origin}${signed.pathname}`).toBe(`${BASE}/${KEY}`);
    const token = signed.searchParams.get('token');
    expect(token).toBeTruthy();
    await expect(signer.verify(token, KEY)).resolves.toBe(true);
    await expect(signer.verify(token, 'rag-ocr/2026/10/page-2.webp')).resolves.toBe(false);
  });

  it('is never the bare public URL', async () => {
    const { driver } = driverWith({ JWT_ACCESS_SECRET: SECRET, LOCAL_STORAGE_PUBLIC_URL: BASE });
    await expect(driver.signedUrlFor(KEY, 60)).resolves.not.toBe(driver.urlFor(KEY));
  });

  it('rejects when it cannot sign, rather than falling back to the public URL', async () => {
    const { driver } = driverWith({ JWT_ACCESS_SECRET: undefined, LOCAL_STORAGE_PUBLIC_URL: BASE });
    await expect(driver.signedUrlFor(KEY, 60)).rejects.toThrow();
  });

  it('rejects an out-of-range lifetime, as the S3 driver does', async () => {
    const { driver } = driverWith({ JWT_ACCESS_SECRET: SECRET, LOCAL_STORAGE_PUBLIC_URL: BASE });
    await expect(driver.signedUrlFor(KEY, 0)).rejects.toThrow(RangeError);
    await expect(driver.signedUrlFor(KEY, 604_801)).rejects.toThrow(RangeError);
  });
});

describe('buildKey', () => {
  it('keeps the folder/year/month/slug shape and adds 128 random bits', () => {
    expect(buildKey('products', 'Lawn Suit.JPG')).toMatch(/^products\/\d{4}\/\d{2}\/lawn-suit-[0-9a-f]{32}\.jpg$/);
  });

  it('never repeats a key for the same folder and filename', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => buildKey('payment-receipts', 'image.jpg')));
    expect(keys.size).toBe(1000);
  });
});
