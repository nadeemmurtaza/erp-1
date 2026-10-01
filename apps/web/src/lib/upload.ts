import { formatBytes, formatNumber } from '@newax/shared';

/**
 * What an upload accepts, and the checks that enforce it at drop time (UPL-3).
 *
 * Pure: no DOM, no clock, no network. A rule here is the same number the server
 * enforces (the caller copies it from the API, with the file and line, never from
 * a guess), so a file the server would refuse never starts. This is a
 * convenience for the person dropping the file and never authorization: the
 * server checks again.
 *
 * Bytes and counts are formatted by `@newax/shared` (`formatBytes`,
 * `formatNumber`), never a locale call written here, so a reader in another
 * locale sees their own digits.
 */
export interface UploadRules {
  /**
   * What is accepted: a MIME type (`image/png`), a wildcard (`image/*`) or an
   * extension (`.csv`), in any case. The same list is the `accept` of the file
   * input. Empty accepts anything.
   */
  accept: readonly string[];
  /**
   * The largest file, in bytes. `Number.POSITIVE_INFINITY` where the server sets
   * no cap of its own: nothing is then refused for size and no size is printed,
   * because a limit nobody enforces must not be invented.
   */
  maxBytes: number;
  /** The most files at once, queued included. Absent means no count limit. */
  maxFiles?: number;
}

/** The three fields of a `File` the checks read, so a spec needs no DOM. */
export type FileLike = Pick<File, 'name' | 'size' | 'type'>;

export type RefusalCode = 'type' | 'size' | 'empty' | 'count';

/**
 * A refused file. `reason` says what is wrong with it and names it, `remedy`
 * says what to do (`FLO-7`: a refusal states its remedy); `refusalMessage` joins
 * them into the one sentence a person reads.
 */
export interface Refusal<F extends FileLike = FileLike> {
  file: F;
  code: RefusalCode;
  reason: string;
  remedy: string;
}

export type FileCheck = { ok: true } | { ok: false; code: RefusalCode; reason: string; remedy: string };

/** "hero.tiff is a TIFF. Use JPG, PNG, WebP or AVIF." */
export function refusalMessage(refusal: Pick<Refusal, 'reason' | 'remedy'>): string {
  return `${refusal.reason} ${refusal.remedy}`;
}

/** The value of the file input's `accept` attribute for these rules. */
export function acceptAttribute(rules: UploadRules): string {
  return rules.accept.join(',');
}

/** What people call the types, so a limit reads "JPG, PNG" and not "image/jpeg, image/png". */
const TYPE_LABELS: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/avif': 'AVIF',
  'image/gif': 'GIF',
  'image/tiff': 'TIFF',
  'application/pdf': 'PDF',
  'text/csv': 'CSV',
  '.jpg': 'JPG',
  '.jpeg': 'JPG',
};

const WILDCARD_LABELS: Readonly<Record<string, string>> = {
  'image/*': 'Images',
  'video/*': 'Videos',
  'audio/*': 'Audio',
  'text/*': 'Text files',
};

function labelFor(entry: string): string {
  const key = entry.trim().toLowerCase();
  const known = TYPE_LABELS[key] ?? WILDCARD_LABELS[key];
  if (known) return known;
  if (key.startsWith('.')) return key.slice(1).toUpperCase();
  const subtype = key.split('/')[1];
  return (subtype ?? key).toUpperCase();
}

/** "A, B or C"; one entry alone; two as "A or B". */
function joinOr(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

/** The types as short labels, each once (`.csv` and `text/csv` are one CSV). */
function typeLabels(accept: readonly string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const entry of accept) {
    if (!entry.trim()) continue;
    const label = labelFor(entry);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * The limits as one line, printed inside the drop zone before anyone has done
 * anything wrong (UPL-4): "JPG, PNG, WebP or AVIF · up to 8 MB each · 10 files".
 * A part is left out when it does not apply (no size where the server sets none,
 * no count for a single file).
 */
export function describeLimits(rules: UploadRules): string {
  const parts: string[] = [];
  const labels = typeLabels(rules.accept);
  if (labels.length > 0) parts.push(joinOr(labels));
  if (Number.isFinite(rules.maxBytes) && rules.maxBytes > 0) {
    parts.push(`up to ${formatBytes(rules.maxBytes)}${rules.maxFiles === 1 ? '' : ' each'}`);
  }
  if (rules.maxFiles !== undefined && rules.maxFiles > 1) parts.push(`${formatNumber(rules.maxFiles)} files`);
  return parts.join(' · ');
}

/** `text/csv;charset=utf-8` is `text/csv`. */
function baseType(type: string): string {
  return (type.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * Does the file match an entry of `accept`? An extension matches the file name,
 * a MIME type or wildcard matches what the browser reported. The browser's type
 * is what the server will see too (multer reads the part's content type), so a
 * file the browser cannot type (an `.avif` on an old system reports nothing) is
 * refused here for the reason the server would refuse it, not accepted to fail
 * after the transfer.
 */
function matchesType(file: FileLike, accept: readonly string[]): boolean {
  const entries = accept.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (entries.length === 0) return true;
  const type = baseType(file.type);
  const name = file.name.toLowerCase();
  return entries.some((entry) => {
    if (entry.startsWith('.')) return name.endsWith(entry);
    if (entry.endsWith('/*')) return type.startsWith(entry.slice(0, -1));
    return type === entry;
  });
}

/** What the file is, for "hero.tiff is a TIFF": its known label, else its extension, else its MIME subtype. */
function describeFileType(file: FileLike): string | null {
  const known = TYPE_LABELS[baseType(file.type)];
  if (known) return known;
  const dot = file.name.lastIndexOf('.');
  if (dot > 0 && dot < file.name.length - 1) return file.name.slice(dot + 1).toUpperCase();
  const subtype = baseType(file.type).split('/')[1];
  return subtype ? subtype.toUpperCase() : null;
}

/**
 * "a" or "an" for a label read aloud: an all-capitals label is spelled out
 * (an FTP, an MP4, a TIFF), a word is read as a word (an AVIF is spelled, a WebP
 * is not).
 */
function article(label: string): 'a' | 'an' {
  const first = label.charAt(0).toUpperCase();
  const spelled = label === label.toUpperCase() ? 'AEFHILMNORSX' : 'AEIOU';
  return spelled.includes(first) ? 'an' : 'a';
}

/**
 * One file against the rules. Type first (the most basic mismatch), then empty,
 * then size, and each refusal names the file and what to do. The count is not
 * here: it depends on the other files, so `checkFiles` owns it.
 */
export function checkFile(file: FileLike, rules: UploadRules): FileCheck {
  if (!matchesType(file, rules.accept)) {
    const accepted = joinOr(typeLabels(rules.accept));
    const actual = describeFileType(file);
    return {
      ok: false,
      code: 'type',
      reason: actual
        ? `${file.name} is ${article(actual)} ${actual}.`
        : `${file.name} is not a type this upload accepts.`,
      remedy: `Use ${accepted}.`,
    };
  }
  if (file.size <= 0) {
    return {
      ok: false,
      code: 'empty',
      reason: `${file.name} is empty.`,
      remedy: 'Choose a file that has something in it.',
    };
  }
  if (file.size > rules.maxBytes) {
    return {
      ok: false,
      code: 'size',
      reason: `${file.name} is ${formatBytes(file.size)}, over the ${formatBytes(rules.maxBytes)} limit.`,
      remedy: `Choose a file up to ${formatBytes(rules.maxBytes)}.`,
    };
  }
  return { ok: true };
}

/**
 * A dropped batch against the rules, one result per file in the same order.
 * `alreadyQueued` is how many files already hold a place (the count limit is for
 * the whole queue, not each drop). A file that fails its own checks takes no
 * place, so one wrong file never costs a right one its slot; the files past the
 * limit are refused whole, in order, never silently dropped.
 */
export function checkFiles(files: readonly FileLike[], rules: UploadRules, alreadyQueued = 0): FileCheck[] {
  let places = rules.maxFiles === undefined ? Number.POSITIVE_INFINITY : Math.max(0, rules.maxFiles - alreadyQueued);
  return files.map((file): FileCheck => {
    const own = checkFile(file, rules);
    if (!own.ok) return own;
    if (places <= 0) {
      return {
        ok: false,
        code: 'count',
        reason: `${file.name} was not added.`,
        remedy:
          rules.maxFiles === 1
            ? 'Choose one file at a time.'
            : `Up to ${formatNumber(rules.maxFiles ?? 0)} files at a time. Remove one or wait for an upload to finish.`,
      };
    }
    places -= 1;
    return own;
  });
}

/** `checkFiles`, split into the files to send and the refusals to show. */
export function partitionFiles<F extends FileLike>(
  files: readonly F[],
  rules: UploadRules,
  alreadyQueued = 0,
): { accepted: F[]; refusals: Refusal<F>[] } {
  const accepted: F[] = [];
  const refusals: Refusal<F>[] = [];
  checkFiles(files, rules, alreadyQueued).forEach((check, index) => {
    const file = files[index]!;
    if (check.ok) accepted.push(file);
    else refusals.push({ file, code: check.code, reason: check.reason, remedy: check.remedy });
  });
  return { accepted, refusals };
}

/** A transfer speed: "1.2 MB/s". */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * The time left, rounded up so it never promises less than it will take:
 * "4 s", "1 min 20 s", "12 min", "2 h 5 min". Seconds are dropped from ten
 * minutes on, where they are noise.
 */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const total = Math.ceil(seconds);
  if (total < 60) return `${formatNumber(total)} s`;
  if (total < 600) {
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest > 0 ? `${formatNumber(minutes)} min ${formatNumber(rest)} s` : `${formatNumber(minutes)} min`;
  }
  // From ten minutes on the seconds are noise: round the whole to minutes, up.
  const minutes = Math.ceil(total / 60);
  if (minutes < 60) return `${formatNumber(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${formatNumber(hours)} h ${formatNumber(rest)} min` : `${formatNumber(hours)} h`;
}
