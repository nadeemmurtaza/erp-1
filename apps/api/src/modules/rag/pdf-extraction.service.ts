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
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';
import type { PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.js';
import { AiService } from '../../core/ai/ai.service';
import { StorageService } from '../../core/storage/storage.service';
import { AiFeature } from '../../core/prisma/client';

const { OPS } = pdfjsLib;

/** Below this many non-whitespace characters, a page is treated as having no usable text layer — a scanned page, not a short one. */
const MIN_TEXT_CHARS_PER_PAGE = 20;

const OCR_PROMPT =
  'Transcribe every word of legible text in this scanned document page, verbatim, in reading order. ' +
  'Output only the transcribed text — no commentary, no description of the layout or the image itself.';

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
 * dependency, no new native binary), uploaded through `StorageService` (the
 * interface requires a publicly-fetchable URL — see `AiProvider
 * .describeImage`'s own doc comment), and transcribed by the vision model.
 * A page with neither a text layer nor an embedded image (blank, or vector
 * art alone) legitimately produces no text — nothing to retrieve, not a
 * failure.
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
    });

    const doc = await loadingTask.promise;
    try {
      const pages: ExtractedPage[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          if (text.length >= MIN_TEXT_CHARS_PER_PAGE) {
            pages.push({ pageNumber, text, fromOcr: false });
            continue;
          }

          const ocrText = await this.ocrPage(page, pageNumber);
          pages.push({ pageNumber, text: ocrText ?? text, fromOcr: ocrText !== null });
        } finally {
          page.cleanup();
        }
      }
      return { pageCount: doc.numPages, pages };
    } finally {
      await loadingTask.destroy();
    }
  }

  /**
   * `null` whenever OCR could not run at all (no vision-capable provider
   * configured, no embedded image found, the call failed or timed out) —
   * the caller keeps whatever text was already extracted (usually empty)
   * rather than treating "could not OCR" as "this page has no content."
   */
  private async ocrPage(page: PDFPageProxy, pageNumber: number): Promise<string | null> {
    if (!this.ai.isAvailable('vision')) return null;

    const image = await this.extractPageImage(page);
    if (!image) return null;

    try {
      const png = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels } })
        .png()
        .toBuffer();
      const stored = await this.storage.putImage({
        folder: 'rag-ocr',
        filename: `page-${pageNumber}.png`,
        contentType: 'image/png',
        body: png,
      });
      const described = await this.ai.describeImage(AiFeature.RAG_INGESTION, stored.url, OCR_PROMPT);
      return described?.text.trim() || null;
    } catch (error) {
      this.logger.warn(`OCR fallback failed for page ${pageNumber}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * The largest embedded raster image on the page, decoded to raw pixels —
   * a real scanned page is, in the overwhelming majority of scanners'
   * output, exactly one full-page image XObject with no other content.
   * `null` when the page has none (a blank page, or vector-only content —
   * nothing for OCR to read).
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

    const image = await new Promise<PdfImageObject | null>((resolve) => {
      page.objs.get(targetName as string, (resolved: PdfImageObject) => resolve(resolved));
    });
    if (!image?.data || !image.width || !image.height) return null;

    const channels = channelsForKind(image.kind, image.data.length, image.width, image.height);
    if (!channels) return null;

    return { data: Buffer.from(image.data.buffer ?? image.data, image.data.byteOffset ?? 0, image.data.byteLength ?? image.data.length), width: image.width, height: image.height, channels };
  }
}

/**
 * pdfjs's own `ImageKind` enum (1 = 1bpp grayscale — not produced by
 * `page.objs.get()`'s already-decoded form, 2 = RGB 24bpp, 3 = RGB 32bpp
 * i.e. RGBA). Falls back to inferring channel count from the buffer length
 * when `kind` is unset, which some embedded-image codepaths leave unset.
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
