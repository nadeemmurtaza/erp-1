import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
// Pinned to the last major (3.x) whose "legacy" Node build ships as
// CommonJS (`legacy/build/pdf.js`, no `"type": "module"`, `main` points at
// a `.js` bundle) — every 4.x+ release is ESM-only (`import.meta.url`
// inside it), which this codebase's CommonJS compile target
// (`packages/config/tsconfig.nest.json`) cannot `require()` at all, and a
// dynamic `import()` fares no better: under `"module": "commonjs"`, `tsc`
// itself rewrites it into `Promise.resolve().then(() => require(...))` —
// the identical failure one level down. Plain `require()` semantics, no
// workaround needed, at the cost of missing two years of upstream pdf.js
// fixes; re-evaluate this pin if a real ingested PDF ever needs a feature
// only a newer parser has.
//
// Security review M5 — this 3.x range is inside CVE-2024-4367 /
// GHSA-wgrm-67xf-hhpq (a crafted font can reach pdf.js's `new
// Function`-based glyph-compiler path when `isEvalSupported` is left at its
// default of `true`). `getDocument()` below sets `isEvalSupported: false`
// explicitly, which closes that path regardless of version — this pin does
// not need to move to be safe from it. Revisit this pin (and re-check
// whether `isEvalSupported: false` is still the right default) if canvas
// rendering is ever added to this service, since disabling it also disables
// some glyph rendering optimizations this text/OCR-only usage never needed.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.js';
import { AiService } from '../../core/ai/ai.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiFeature } from '../../core/prisma/client';

const { OPS } = pdfjsLib;

/** Below this many non-whitespace characters, a page is treated as having no usable text layer — a scanned page, not a short one. */
const MIN_TEXT_CHARS_PER_PAGE = 20;

const OCR_PROMPT =
  'Transcribe every word of legible text in this scanned document page, verbatim, in reading order. ' +
  'Output only the transcribed text — no commentary, no description of the layout or the image itself.';

/** M6 (security review) — a real bound against a crafted PDF requesting a much larger raster decode than any real scanned page needs (64 megapixels is generous for a real scan). */
const MAX_IMAGE_SIZE_PIXELS = 64_000_000;
/** M6 — past this many pages, a document is refused outright rather than ingested — no legitimate corpus document in this codebase's own scope needs more, and an unbounded page loop is a real cost-exhaustion vector. */
const MAX_PAGES = 500;
/** M6 — past this many extracted characters across all pages, extraction stops and finishes with what it already has (a warning, not a failure) — a huge-but-legitimate document still gets a usable, if truncated, index rather than failing outright. */
const MAX_TOTAL_CHARS = 2_000_000;
/** M6 — wall-clock bound on the whole `extract()` pass, so one pathological document can never hang an entire ingestion batch. */
const EXTRACT_TIMEOUT_MS = 180_000;
/** H3 (security review) — a single stuck `page.objs`/`page.commonObjs` object resolution (pdf.js callback that, for certain image-reference shapes, never fires) must never hang the whole pipeline; `null` (no image found) is already a legitimate, handled outcome. */
const PAGE_OBJECT_TIMEOUT_MS = 10_000;
/** H2 (security review) — long enough for the configured vision provider to fetch the OCR scratch image, short enough to close the exposure window quickly; the image is deleted immediately after use regardless (M10). */
const OCR_SIGNED_URL_TTL_SECONDS = 300;

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  /** True when the text layer was empty and this page's text came from the OCR (vision) fallback instead. */
  fromOcr: boolean;
}

export interface ExtractionResult {
  pageCount: number;
  pages: ExtractedPage[];
}

/**
 * WO-35.2's own "extract text (+ OCR fallback for scanned PDFs)" step.
 *
 * A page with a real text layer is read directly (`page.getTextContent()`).
 * A page with none (the doc's own "scanned PDF" case) falls back to the
 * SAME `AiProvider.describeImage()` extension point WO-9.5's visual search
 * already uses — never a second, dedicated OCR library/subsystem: the page's
 * own embedded image is decoded, re-encoded as a PNG via `sharp` (already a
 * dependency, no new native binary), uploaded through `StorageService` and
 * handed to the vision model as a short-lived signed URL (H2, security
 * review — the scratch image is deleted again immediately after, M10), and
 * transcribed. A page with neither a text layer nor an embedded image
 * (blank, or vector art alone) legitimately produces no text — nothing to
 * retrieve, not a failure. A page whose image WAS found but could not
 * actually be read (a decode error, a vision-call failure) is different
 * again — that propagates as a real failure (M9, security review) rather
 * than silently becoming "this page has no content."
 */
@Injectable()
export class PdfExtractionService {
  private readonly logger = new Logger(PdfExtractionService.name);

  constructor(
    private readonly ai: AiService,
    private readonly storage: StorageService,
  ) {}

  async extract(buffer: Buffer): Promise<ExtractionResult> {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      useSystemFonts: true,
      // M5 — see this file's top-of-file comment: closes CVE-2024-4367 /
      // GHSA-wgrm-67xf-hhpq regardless of the 3.x pin.
      isEvalSupported: false,
      disableFontFace: true,
      // M6 — bounds the largest single image decode pdf.js will attempt.
      maxImageSize: MAX_IMAGE_SIZE_PIXELS,
    });

    const doc = await loadingTask.promise;
    try {
      // M6 — rejects (never resolves-to-null) on timeout, so `ingestOne()`'s
      // catch marks the source FAILED with a real "timed out" reason instead
      // of the batch hanging.
      return await withDeadline(this.extractPages(doc), EXTRACT_TIMEOUT_MS, 'PDF processing timed out.');
    } finally {
      await loadingTask.destroy();
    }
  }

  private async extractPages(doc: PDFDocumentProxy): Promise<ExtractionResult> {
    if (doc.numPages > MAX_PAGES) {
      throw new Error(`This PDF has more than ${MAX_PAGES} pages — not supported for RAG ingestion.`);
    }

    const pages: ExtractedPage[] = [];
    let totalChars = 0;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        let pageText = text;
        let fromOcr = false;
        if (text.length < MIN_TEXT_CHARS_PER_PAGE) {
          const ocrText = await this.ocrPage(page, pageNumber);
          pageText = ocrText ?? text;
          fromOcr = ocrText !== null;
        }

        if (totalChars + pageText.length > MAX_TOTAL_CHARS) {
          this.logger.warn(`Truncating extraction at page ${pageNumber} of ${doc.numPages} — MAX_TOTAL_CHARS (${MAX_TOTAL_CHARS}) reached.`);
          break;
        }
        totalChars += pageText.length;
        pages.push({ pageNumber, text: pageText, fromOcr });
      } finally {
        page.cleanup();
      }
    }
    return { pageCount: doc.numPages, pages };
  }

  /**
   * `null` whenever OCR could not run at all (no vision-capable provider
   * configured, or no embedded image found on the page — both real,
   * legitimate "nothing to OCR" cases) — the caller keeps whatever text was
   * already extracted (usually empty) rather than treating "could not OCR"
   * as "this page has no content." Once an image IS found and a
   * vision-capable provider IS configured, any further failure (a decode
   * error, a failed or timed-out `describeImage` call) PROPAGATES (M9,
   * security review) rather than being swallowed — a scanned page that
   * genuinely could not be read must surface as a real ingestion failure,
   * never silently disappear from the index.
   */
  private async ocrPage(page: PDFPageProxy, pageNumber: number): Promise<string | null> {
    if (!this.ai.isAvailable('vision')) return null;

    const image = await this.extractPageImage(page);
    if (!image) return null;

    const png = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels } })
      .png()
      .toBuffer();
    const stored = await this.storage.putImage({
      folder: 'rag-ocr',
      filename: `page-${pageNumber}.png`,
      contentType: 'image/png',
      body: png,
    });

    try {
      const signedUrl = await this.storage.signedUrlFor(stored.key, OCR_SIGNED_URL_TTL_SECONDS);
      const described = await this.ai.describeImage(AiFeature.RAG_INGESTION, signedUrl, OCR_PROMPT);
      return described?.text.trim() || null;
    } finally {
      // M10 (security review) — OCR scratch images must never accumulate in
      // storage: deleted regardless of outcome, success or a propagating
      // failure, and regardless of what later happens to this `DocumentSource`.
      await this.storage.delete(stored.key).catch((error) => {
        this.logger.warn(`Could not delete OCR scratch image ${stored.key}: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  /**
   * The largest embedded raster image on the page, decoded to raw pixels —
   * a real scanned page is, in the overwhelming majority of scanners'
   * output, exactly one full-page image XObject with no other content.
   * `null` when the page has none (a blank page, or vector-only content —
   * nothing for OCR to read), OR when resolving it timed out (H3,
   * defense-in-depth — treated the same as "not found" rather than hanging).
   */
  private async extractPageImage(page: PDFPageProxy): Promise<{ data: Buffer; width: number; height: number; channels: 1 | 3 | 4 } | null> {
    const operatorList = await page.getOperatorList();
    // The first image XObject the content stream paints — a real scanned
    // page has exactly one, filling the page; a page with several embedded
    // images (a letterhead logo plus a photo) is not the scanned-page case
    // this fallback targets, and OCR on the first one is still strictly
    // better than OCR on none.
    let targetName: string | null = null;
    for (let i = 0; i < operatorList.fnArray.length; i += 1) {
      if (operatorList.fnArray[i] !== OPS.paintImageXObject) continue;
      targetName = operatorList.argsArray[i][0] as string;
      break;
    }
    if (targetName === null) return null;

    // H3 (security review) — pdf.js promotes an image XObject reused across
    // 2+ pages into document-level `commonObjs` (name prefixed `g_`) instead
    // of this page's own `objs`; asking `page.objs` to resolve a `g_`-named
    // object never fires its callback at all, hanging this promise forever.
    // pdf.js's own canvas backend already branches on this exact prefix
    // (`legacy/build/pdf.js`'s `CanvasGraphics.paintImageXObject`) — mirrored
    // here rather than invented.
    const objectPool = targetName.startsWith('g_') ? page.commonObjs : page.objs;
    const image = await withFallbackTimeout(
      new Promise<PdfImageObject | null>((resolve) => {
        objectPool.get(targetName as string, (resolved: PdfImageObject) => resolve(resolved));
      }),
      PAGE_OBJECT_TIMEOUT_MS,
      null,
    );
    if (!image?.data || !image.width || !image.height) return null;

    const channels = channelsForKind(image.kind, image.data.length, image.width, image.height);
    if (!channels) return null;

    let data = Buffer.from(image.data.buffer ?? image.data, image.data.byteOffset ?? 0, image.data.byteLength ?? image.data.length);

    // M9 (security review) — a `kind === 1` (1bpp grayscale) image is
    // bit-packed (8 pixels per byte); sharp's raw decoder requires one full
    // byte per pixel and rejects the packed form outright ("should be N
    // bytes, you passed N/8"). Unpacked here, before this method's only
    // caller ever hands it to sharp.
    if (image.kind === 1) {
      data = unpack1BitGrayscale(data, image.width, image.height);
    }

    return { data, width: image.width, height: image.height, channels };
  }
}

/**
 * Resolves to `onTimeout` if `promise` has not settled after `ms` — used
 * where a single stuck lookup must never hang the whole pipeline (H3), and
 * where the timed-out outcome is itself a legitimate, already-handled
 * result ("no image found").
 */
export function withFallbackTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

/**
 * Rejects if `promise` has not settled after `ms` — used for the whole
 * extraction pass (M6), where a timeout is a real failure `ingestOne()`'s
 * catch should mark FAILED with, never a silent partial result.
 */
export function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Expands a bit-packed 1bpp grayscale buffer (pdf.js's own packing: rows
 * byte-aligned, `Math.ceil(width / 8)` bytes per row, MSB-first) to one full
 * byte (0x00 or 0xFF) per pixel — sharp's raw decoder requires the latter
 * and rejects the packed form (M9, security review).
 */
export function unpack1BitGrayscale(data: Uint8Array | Buffer, width: number, height: number): Buffer {
  const bytesPerRow = Math.ceil(width / 8);
  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * bytesPerRow;
    for (let x = 0; x < width; x += 1) {
      const byte = data[rowStart + (x >> 3)] ?? 0;
      const bit = (byte >> (7 - (x % 8))) & 1;
      out[y * width + x] = bit ? 0xff : 0x00;
    }
  }
  return out;
}

/**
 * pdfjs's own `ImageKind` enum (1 = 1bpp grayscale, packed — see
 * `unpack1BitGrayscale()`; 2 = RGB 24bpp; 3 = RGB 32bpp i.e. RGBA). Falls
 * back to inferring channel count from the buffer length when `kind` is
 * unset, which some embedded-image codepaths leave unset.
 */
function channelsForKind(kind: number | undefined, dataLength: number, width: number, height: number): 1 | 3 | 4 | null {
  const pixels = width * height;
  if (pixels === 0) return null;
  if (kind === 3) return 4;
  if (kind === 2) return 3;
  if (kind === 1) return 1;
  const perPixel = dataLength / pixels;
  if (perPixel === 4) return 4;
  if (perPixel === 3) return 3;
  if (perPixel === 1) return 1;
  return null;
}

interface PdfImageObject {
  width: number;
  height: number;
  kind?: number;
  data: Uint8ClampedArray | Uint8Array;
}
