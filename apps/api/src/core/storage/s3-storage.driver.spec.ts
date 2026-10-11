import type { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageDriver } from './s3-storage.driver';
import type { AppConfigService } from '../config/app-config.service';

const ENV: Record<string, unknown> = {
  S3_REGION: 'us-east-1',
  S3_ENDPOINT: 'http://minio.test:9000',
  S3_FORCE_PATH_STYLE: true,
  S3_ACCESS_KEY: 'test-access-key',
  S3_SECRET_KEY: 'test-secret-key',
  S3_BUCKET: 'uploads',
  S3_PUBLIC_URL: 'https://cdn.example.test',
};

function driver(): S3StorageDriver {
  return new S3StorageDriver({ get: jest.fn((name: string) => ENV[name]) } as unknown as AppConfigService);
}

/** ADR-091 — the S3 half: object metadata decides caching at upload, and a signed URL is a real presign. */
describe('S3StorageDriver', () => {
  describe('put', () => {
    async function cacheControlFor(folder: string): Promise<string | undefined> {
      const s3 = driver();
      const send = jest.fn().mockResolvedValue({});
      // The client is built lazily; hand the driver a fake one instead.
      (s3 as unknown as { client: unknown }).client = { send };
      await s3.put({ folder, filename: 'a.webp', contentType: 'image/webp', body: Buffer.from('x') });
      return (send.mock.calls[0][0] as PutObjectCommand).input.CacheControl;
    }

    it('marks a public folder immutable for a year', async () => {
      await expect(cacheControlFor('products')).resolves.toBe('public, max-age=31536000, immutable');
      await expect(cacheControlFor('auction-lots')).resolves.toBe('public, max-age=31536000, immutable');
    });

    it.each(['payment-receipts', 'receipts', 'visual-search', 'rag-sources', 'documents'])(
      'never lets a shared cache keep a %s object',
      async (folder) => {
        await expect(cacheControlFor(folder)).resolves.toBe('private, no-store');
      },
    );
  });

  describe('signedUrlFor', () => {
    it('is a real presigned GET for the key, never the public URL', async () => {
      const s3 = driver();
      const key = 'visual-search/2026/10/shopper.webp';

      const signed = new URL(await s3.signedUrlFor(key, 300));

      expect(signed.toString()).not.toBe(s3.urlFor(key));
      expect(signed.pathname).toBe(`/uploads/${key}`);
      expect(signed.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(signed.searchParams.get('X-Amz-Signature')).toBeTruthy();
    });

    it('rejects an out-of-range lifetime, as the local driver does', async () => {
      await expect(driver().signedUrlFor('visual-search/2026/10/a.webp', 0)).rejects.toThrow(RangeError);
      await expect(driver().signedUrlFor('visual-search/2026/10/a.webp', 604_801)).rejects.toThrow(RangeError);
    });
  });
});
