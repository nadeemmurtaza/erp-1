import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { AppConfigService } from '../config/app-config.service';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);

/** Matches Next.js's own default WebP quality — a well-tested size/quality balance. */
const WEBP_QUALITY = 75;

/**
 * Front door for file storage. Callers never touch a driver directly, so
 * switching STORAGE_DRIVER from local to s3 changes nothing but the env file.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  constructor(
    config: AppConfigService,
    local: LocalStorageDriver,
    s3: S3StorageDriver,
  ) {
    this.driver = config.get('STORAGE_DRIVER') === 's3' ? s3 : local;
    this.logger.log(`Storage driver: ${this.driver.name}`);
  }

  put(input: PutFileInput): Promise<StoredFile> {
    return this.driver.put(input);
  }

  /**
   * Stores an image after checking its type and size, converting it to WebP
   * first — every image this app serves ends up in one format, smaller than
   * JPEG/PNG at equal visual quality, which is exactly what Lighthouse's
   * "serve images in next-gen formats" check (and so, page-speed SEO) rewards.
   */
  async putImage(input: PutFileInput): Promise<StoredFile> {
    if (!ALLOWED_IMAGE_TYPES.has(input.contentType)) {
      throw new BadRequestException(
        `Unsupported image type "${input.contentType}". Use JPEG, PNG, WebP or AVIF.`,
      );
    }
    if (input.body.byteLength > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }

    let body: Buffer;
    try {
      body = await sharp(input.body).rotate().webp({ quality: WEBP_QUALITY }).toBuffer();
    } catch {
      throw new BadRequestException('That file is not a valid image.');
    }

    return this.driver.put({
      ...input,
      body,
      filename: `${input.filename.replace(/\.[^./]+$/, '')}.webp`,
      contentType: 'image/webp',
    });
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  urlFor(key: string): string {
    return this.driver.urlFor(key);
  }
}
