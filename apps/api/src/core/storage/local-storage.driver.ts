import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { slugify } from '@newax/shared';
import { AppConfigService } from '../config/app-config.service';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';

/**
 * Writes uploads to a directory on disk and serves them back through the API.
 * Fine for development and a single-server deployment; switch STORAGE_DRIVER to
 * s3 before running more than one API instance.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  constructor(private readonly config: AppConfigService) {}

  private get root(): string {
    return resolve(this.config.get('LOCAL_STORAGE_DIR'));
  }

  async put(input: PutFileInput): Promise<StoredFile> {
    const key = buildKey(input.folder, input.filename);
    const target = this.resolveKey(key);

    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, input.body);

    return {
      key,
      url: this.urlFor(key),
      size: input.body.byteLength,
      contentType: input.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  urlFor(key: string): string {
    return `${this.config.get('LOCAL_STORAGE_PUBLIC_URL').replace(/\/$/, '')}/${key}`;
  }

  /**
   * Resolves a key to an absolute path, refusing anything that escapes the
   * storage root — a key like "../../etc/passwd" must not be writable.
   */
  private resolveKey(key: string): string {
    const target = resolve(this.root, normalize(key));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`Refusing to access a path outside the storage root: ${key}`);
    }
    return target;
  }
}

/** "products" + "Lawn Suit.JPG" -> "products/2026/08/lawn-suit-4f2a1b.jpg" */
export function buildKey(folder: string, filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  const extension = extname(filename).toLowerCase().slice(0, 10);
  const base = slugify(filename.slice(0, filename.length - extension.length)) || 'file';
  const unique = randomBytes(4).toString('hex');

  return `${slugify(folder) || 'misc'}/${year}/${month}/${base}-${unique}${extension}`;
}
