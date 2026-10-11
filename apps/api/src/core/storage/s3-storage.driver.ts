import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { buildKey } from './local-storage.driver';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';
import { assertSignedUrlTtl } from './storage-url-signer';
import { cacheControlFor, visibilityOf } from './storage-visibility';

/**
 * S3-compatible object storage: MinIO locally, Cloudflare R2 or AWS S3 in
 * production. Selected with STORAGE_DRIVER=s3; the required credentials are
 * checked at boot by env.validation.ts.
 *
 * Deployment requirement (ADR-091): only the public folders' prefixes
 * (`storage-visibility.ts` — `products/`, `auction-lots/`) may be anonymously
 * readable. Code cannot check the bucket policy; a bucket readable as a whole
 * makes every private object public at its `urlFor()` URL. A private object
 * is reached only on `signedUrlFor()`, a real presigned GET.
 */
@Injectable()
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3';
  private client?: S3Client;

  constructor(private readonly config: AppConfigService) {}

  // Built lazily, on first actual use: StorageService injects this driver
  // unconditionally even when STORAGE_DRIVER=local, and local deployments
  // leave the S3_* vars blank — an eager S3Client in the constructor would
  // crash the whole API on boot for a driver nothing ever calls.
  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: this.config.get('S3_REGION'),
        endpoint: this.config.get('S3_ENDPOINT'),
        // MinIO serves buckets as a path, not a subdomain.
        forcePathStyle: this.config.get('S3_FORCE_PATH_STYLE'),
        credentials: {
          accessKeyId: this.config.get('S3_ACCESS_KEY') as string,
          secretAccessKey: this.config.get('S3_SECRET_KEY') as string,
        },
      });
    }
    return this.client;
  }

  private get bucket(): string {
    return this.config.get('S3_BUCKET') as string;
  }

  async put(input: PutFileInput): Promise<StoredFile> {
    const key = buildKey(input.folder, input.filename);

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        // Immutable for a public folder; never kept by a shared cache otherwise (ADR-091).
        CacheControl: cacheControlFor(visibilityOf(key)),
      }),
    );

    return {
      key,
      url: this.urlFor(key),
      size: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  urlFor(key: string): string {
    const publicBase = this.config.get('S3_PUBLIC_URL');
    if (publicBase) {
      return `${publicBase.replace(/\/$/, '')}/${key}`;
    }
    const endpoint = (this.config.get('S3_ENDPOINT') ?? '').replace(/\/$/, '');
    return `${endpoint}/${this.bucket}/${key}`;
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.getClient().send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Object "${key}" in bucket "${this.bucket}" returned no body.`);
    }
    return Buffer.from(bytes);
  }

  /** A real presigned GET, expiring in `expiresInSeconds` — unlike `urlFor()`'s permanently-public URL, this one stops working once it expires even if the object itself is never deleted. Same TTL range as the local driver (ADR-091). */
  async signedUrlFor(key: string, expiresInSeconds: number): Promise<string> {
    assertSignedUrlTtl(expiresInSeconds);
    return getSignedUrl(this.getClient(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }
}
