import type { ExtractedPage } from './pdf-extraction.service';

/** ~500 tokens (doc §3) approximated as words — roughly 1.3 tokens per English word, and an exact tokenizer is not worth the dependency at this repo's own stated scale (see rag.prisma's header). */
const WORDS_PER_CHUNK = 500;
/** ~10% overlap — a chunk boundary never silently drops the sentence it fell on. */
const OVERLAP_WORDS = 50;
const STEP_WORDS = WORDS_PER_CHUNK - OVERLAP_WORDS;

export interface TextChunk {
  pageFrom: number;
  pageTo: number;
  text: string;
}

/**
 * WO-35.2's own "page-aware chunking (~500 tokens with overlap)." Page-aware
 * means every chunk still knows which page(s) it came from (so a citation —
 * WO-35.5 — can point at a real page range), not that a chunk may never
 * cross a page boundary: a short page's last sentence and the next page's
 * first sentence belong in the same retrieval unit exactly as often as they
 * belong in the same paragraph, so this slides one window across the whole
 * document's words and reports the actual page range each window touched.
 *
 * Pure — no I/O, no `AiService` call — so it is unit-testable on its own and
 * reusable by anything that wants to preview chunk boundaries before paying
 * for an embedding.
 */
export function chunkPages(pages: readonly ExtractedPage[]): TextChunk[] {
  const words: Array<{ word: string; page: number }> = [];
  for (const page of pages) {
    for (const word of page.text.split(/\s+/).filter(Boolean)) {
      words.push({ word, page: page.pageNumber });
    }
  }
  if (words.length === 0) return [];

  const chunks: TextChunk[] = [];
  for (let start = 0; start < words.length; start += STEP_WORDS) {
    const windowWords = words.slice(start, start + WORDS_PER_CHUNK);
    if (windowWords.length === 0) break;

    const pageNumbers = windowWords.map((w) => w.page);
    chunks.push({
      pageFrom: Math.min(...pageNumbers),
      pageTo: Math.max(...pageNumbers),
      text: windowWords.map((w) => w.word).join(' '),
    });

    if (start + WORDS_PER_CHUNK >= words.length) break;
  }
  return chunks;
}
