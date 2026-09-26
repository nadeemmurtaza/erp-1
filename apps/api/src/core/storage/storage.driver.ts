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
  /** Publicly reachable URL for the stored object. */
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
  urlFor(key: string): string;
  /** Reads an object's bytes back into this process — for a stored file that is never meant to be publicly fetchable (security review H2), unlike `urlFor()`. */
  get(key: string): Promise<Buffer>;
  /** A time-limited URL an external service may fetch. Real presigning where the driver supports it; falls back to the plain public URL where it doesn't (documented per-driver). */
  signedUrlFor(key: string, expiresInSeconds: number): Promise<string>;
}
