import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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

  /** Stores an image after checking its type and size. */
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
    return this.driver.put(input);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  urlFor(key: string): string {
    return this.driver.urlFor(key);
  }
}
