import { Test } from '@nestjs/testing';
import { AiService } from '../../core/ai/ai.service';
import { StorageService } from '../../core/storage/storage.service';
import { PdfExtractionService } from './pdf-extraction.service';

/** A minimal, hand-built one-page PDF with a real text layer — no PDF-writing library needed for a fixture this small. */
function buildTextPdf(text: string): Buffer {
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),
  ];
  const content = Buffer.from(`BT /F1 24 Tf 72 700 Td (${text}) Tj ET`, 'latin1');
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
  return assemblePdf(objects);
}

/** A minimal one-page PDF whose only content is a tiny embedded raster image — no text layer at all, standing in for a scanned page. */
function buildImageOnlyPdf(): Buffer {
  const width = 4;
  const height = 4;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 3;
      pixels[offset] = (x * 60) % 256;
      pixels[offset + 1] = (y * 60) % 256;
      pixels[offset + 2] = 128;
    }
  }

  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /MediaBox [0 0 100 100] /Contents 5 0 R >>'),
  ];
  const imageDict = Buffer.from(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`,
  );
  objects.push(Buffer.concat([imageDict, pixels, Buffer.from('\nendstream')]));
  const content = Buffer.from('q 100 0 0 100 0 0 cm /Im1 Do Q');
  objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('\nendstream')]));
  return assemblePdf(objects);
}

function assemblePdf(objects: Buffer[]): Buffer {
  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let position = chunks[0].length;

  objects.forEach((obj, index) => {
    offsets.push(position);
    const header = Buffer.from(`${index + 1} 0 obj\n`);
    const footer = Buffer.from('\nendobj\n');
    chunks.push(header, obj, footer);
    position += header.length + obj.length + footer.length;
  });

  const xrefOffset = position;
  const n = objects.length + 1;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  chunks.push(Buffer.from(xref));
  chunks.push(Buffer.from(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));

  return Buffer.concat(chunks);
}

describe('PdfExtractionService', () => {
  let service: PdfExtractionService;
  let ai: { isAvailable: jest.Mock; describeImage: jest.Mock };
  let storage: { putImage: jest.Mock };

  beforeEach(async () => {
    ai = { isAvailable: jest.fn(), describeImage: jest.fn() };
    storage = { putImage: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [PdfExtractionService, { provide: AiService, useValue: ai }, { provide: StorageService, useValue: storage }],
    }).compile();
    service = module.get(PdfExtractionService);
  });

  it('extracts a real text layer without calling OCR at all', async () => {
    const pdf = buildTextPdf('Hello RAG World, this is a real text layer.');

    const result = await service.extract(pdf);

    expect(result.pageCount).toBe(1);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].text).toBe('Hello RAG World, this is a real text layer.');
    expect(result.pages[0].fromOcr).toBe(false);
    expect(ai.isAvailable).not.toHaveBeenCalled();
  });

  describe('the scanned-page (OCR) fallback', () => {
    it('falls back to describeImage() when the page has no text layer, and returns its transcription', async () => {
      const pdf = buildImageOnlyPdf();
      ai.isAvailable.mockReturnValue(true);
      storage.putImage.mockResolvedValue({ key: 'rag-ocr/page-1.png', url: 'https://files.local/rag-ocr/page-1.png', size: 100, contentType: 'image/png' });
      ai.describeImage.mockResolvedValue({ text: 'Transcribed page text.', inputTokens: 20, outputTokens: 10, model: 'x' });

      const result = await service.extract(pdf);

      expect(result.pages[0].text).toBe('Transcribed page text.');
      expect(result.pages[0].fromOcr).toBe(true);
      expect(storage.putImage).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/png' }));
      expect(ai.describeImage).toHaveBeenCalledWith('RAG_INGESTION', 'https://files.local/rag-ocr/page-1.png', expect.stringContaining('Transcribe'));
    });

    it('never calls OCR when no vision-capable provider is configured — the page just has empty text', async () => {
      const pdf = buildImageOnlyPdf();
      ai.isAvailable.mockReturnValue(false);

      const result = await service.extract(pdf);

      expect(result.pages[0].text).toBe('');
      expect(result.pages[0].fromOcr).toBe(false);
      expect(storage.putImage).not.toHaveBeenCalled();
      expect(ai.describeImage).not.toHaveBeenCalled();
    });

    it('degrades to empty text (never throws) when the vision call itself fails', async () => {
      const pdf = buildImageOnlyPdf();
      ai.isAvailable.mockReturnValue(true);
      storage.putImage.mockResolvedValue({ key: 'k', url: 'https://files.local/k', size: 1, contentType: 'image/png' });
      ai.describeImage.mockRejectedValue(new Error('vendor timeout'));

      const result = await service.extract(pdf);

      expect(result.pages[0].text).toBe('');
      expect(result.pages[0].fromOcr).toBe(false);
    });
  });
});
