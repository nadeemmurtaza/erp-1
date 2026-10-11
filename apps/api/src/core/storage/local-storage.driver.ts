import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { slugify } from '@newax/shared';
import { AppConfigService } from '../config/app-config.service';
import type { PutFileInput, StorageDriver, StoredFile } from './storage.driver';
import { StorageUrlSigner } from './storage-url-signer';

/**
 * Writes uploads to a directory on disk and serves them back through the API
 * (`FilesController`, which decides per folder who may fetch what — ADR-091).
 * Fine for development and a single-server deployment; switch STORAGE_DRIVER to
 * s3 before running more than one API instance.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  readonly name = 'local';

  constructor(
    private readonly config: AppConfigService,
    private readonly signer: StorageUrlSigner,
  ) {}

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

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  /**
   * A real time-limited URL: the object's URL plus a token that names this key
   * and expires (ADR-091), which `FilesController` checks before serving a
   * private object. Never the bare URL: if signing fails this rejects, and the
   * caller handles it.
   */
  async signedUrlFor(key: string, expiresInSeconds: number): Promise<string> {
    const token = await this.signer.sign(key, expiresInSeconds);
    return `${this.urlFor(key)}?token=${encodeURIComponent(token)}`;
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

/**
 * 128 random bits per key (ADR-091). For a folder still served by bare URL the
 * key is the only thing standing between a stranger and the file, and
 * everything before the random part — folder, year, month, the uploader's own
 * filename — is guessable; 32 bits behind that is searchable by a distributed
 * client despite the per-IP throttle, 128 is not.
 */
const KEY_RANDOM_BYTES = 16;

/** "products" + "Lawn Suit.JPG" -> "products/2026/08/lawn-suit-<32 hex characters>.jpg" */
export function buildKey(folder: string, filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  const extension = extname(filename).toLowerCase().slice(0, 10);
  const base = slugify(filename.slice(0, filename.length - extension.length)) || 'file';
  const unique = randomBytes(KEY_RANDOM_BYTES).toString('hex');

  return `${slugify(folder) || 'misc'}/${year}/${month}/${base}-${unique}${extension}`;
}
