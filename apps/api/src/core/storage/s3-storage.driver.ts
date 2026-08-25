import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { buildKey } from './local-storage.driver';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';

/**
 * S3-compatible object storage: MinIO locally, Cloudflare R2 or AWS S3 in
 * production. Selected with STORAGE_DRIVER=s3; the required credentials are
 * checked at boot by env.validation.ts.
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
        CacheControl: 'public, max-age=31536000, immutable',
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
}
