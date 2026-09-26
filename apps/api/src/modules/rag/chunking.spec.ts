import { chunkPages } from './chunking';
import type { ExtractedPage } from './pdf-extraction.service';

function page(pageNumber: number, wordCount: number): ExtractedPage {
  const words = Array.from({ length: wordCount }, (_, i) => `p${pageNumber}w${i}`);
  return { pageNumber, text: words.join(' '), fromOcr: false };
}

describe('chunkPages', () => {
  it('returns nothing for an empty document', () => {
    expect(chunkPages([])).toEqual([]);
  });

  it('returns nothing when every page is blank text', () => {
    expect(chunkPages([{ pageNumber: 1, text: '   ', fromOcr: false }])).toEqual([]);
  });

  it('produces one chunk for a short page, spanning just that page', () => {
    const chunks = chunkPages([page(1, 50)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks[0].pageTo).toBe(1);
    expect(chunks[0].text.split(' ')).toHaveLength(50);
  });

  it('chunks a long single page into overlapping windows', () => {
    const chunks = chunkPages([page(1, 1200)]);
    // 500-word windows, 450-word step: 0-500, 450-950, 900-1200 (partial) = 3 windows.
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text.split(' ')).toHaveLength(500);
    // Overlap: the last 50 words of the first window are the first 50 of the second.
    const firstWords = chunks[0].text.split(' ');
    const secondWords = chunks[1].text.split(' ');
    expect(firstWords.slice(-50)).toEqual(secondWords.slice(0, 50));
  });

  it('reports the real page range when a window spans several short pages', () => {
    const chunks = chunkPages([page(1, 100), page(2, 100), page(3, 100)]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks[0].pageTo).toBe(3);
  });

  it('never includes an empty page\'s own (nonexistent) words in a chunk\'s page range', () => {
    const chunks = chunkPages([page(1, 50), { pageNumber: 2, text: '', fromOcr: false }, page(3, 50)]);
    // Page 2 contributes no words, so the single chunk's range should still
    // legitimately span 1-3 (word order is still page 1 then page 3) —
    // asserting it does not silently drop to 1-1.
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageFrom).toBe(1);
    expect(chunks[0].pageTo).toBe(3);
  });
});
