/**
 * Extension point: file storage.
 *
 * `local` writes to disk and is what development uses; `s3` targets MinIO,
 * Cloudflare R2 or AWS S3 in production. A new backend is a new class
 * implementing this interface plus a case in StorageService — no caller changes.
 */
export interface StoredFile {
  /** Storage key, e.g. "products/2026/08/abc123.jpg". */
  key: string;
  /**
   * The object's plain URL. It returns the bytes to anyone only for a public
   * folder, or one of the ungated folders still awaiting authorised reads
   * (`storage-visibility.ts`). For a private object it is refused: hand out
   * `signedUrlFor()` instead (ADR-091).
   */
  url: string;
  size: number;
  contentType: string;
}

export interface PutFileInput {
  /** Folder prefix, e.g. "products" or "stitching-jobs". */
  folder: string;
  filename: string;
  contentType: string;
  body: Buffer;
}

export interface StorageDriver {
  readonly name: string;
  put(input: PutFileInput): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  /** The object's plain URL — see `StoredFile.url` for when it actually serves the bytes. */
  urlFor(key: string): string;
  /** Reads an object's bytes back into this process — for a stored file that is never meant to be publicly fetchable (security review H2), unlike `urlFor()`. */
  get(key: string): Promise<Buffer>;
  /**
   * A time-limited URL an external service may fetch, private objects
   * included; `expiresInSeconds` is a whole number from 1 to 604,800. Never an
   * unsigned URL: a driver that cannot sign rejects, and the caller handles
   * that failure — a storage fault is never silently turned into a permanent
   * public link (ADR-091).
   */
  signedUrlFor(key: string, expiresInSeconds: number): Promise<string>;
}
