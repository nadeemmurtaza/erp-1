import { Test, TestingModule } from '@nestjs/testing';
import { ImportAssistantService } from './import-assistant.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AiService } from '../../../core/ai/ai.service';

function csv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

describe('ImportAssistantService', () => {
  let service: ImportAssistantService;
  let prisma: any;
  let ai: any;

  beforeEach(async () => {
    prisma = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
    };
    ai = { isAvailable: jest.fn().mockReturnValue(true), complete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportAssistantService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
      ],
    }).compile();

    service = module.get(ImportAssistantService);
  });

  describe('column mapping', () => {
    it('skips the AI call entirely when every header already matches a canonical column', async () => {
      const file = csv([
        ['sku', 'name_en', 'name_ur', 'price_pkr', 'stock'],
        ['SKU-1', 'Lawn Suit', 'لان سوٹ', '3000', '10'],
      ]);

      const result = await service.assist(file);

      expect(result.headersAlreadyMatch).toBe(true);
      expect(ai.complete).not.toHaveBeenCalled();
      expect(result.columnMapping).toEqual([
        { header: 'sku', column: 'sku' },
        { header: 'name_en', column: 'name_en' },
        { header: 'name_ur', column: 'name_ur' },
        { header: 'price_pkr', column: 'price_pkr' },
        { header: 'stock', column: 'stock' },
      ]);
    });

    it('asks the AI to map relabeled headers onto canonical columns', async () => {
      const file = csv([
        ['Product Code', 'Product Name', 'Urdu Name', 'Price'],
        ['SKU-1', 'Lawn Suit', 'لان سوٹ', '3000'],
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([
          { header: 'product code', column: 'sku' },
          { header: 'product name', column: 'name_en' },
          { header: 'urdu name', column: 'name_ur' },
          { header: 'price', column: 'price_pkr' },
        ]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.headersAlreadyMatch).toBe(false);
      expect(ai.complete).toHaveBeenCalledTimes(1);
      expect(result.columnMapping).toEqual([
        { header: 'product code', column: 'sku' },
        { header: 'product name', column: 'name_en' },
        { header: 'urdu name', column: 'name_ur' },
        { header: 'price', column: 'price_pkr' },
      ]);
    });

    it('never accepts a column name the model invented outside the canonical list', async () => {
      const file = csv([
        ['weird header'],
        ['x'],
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ header: 'weird header', column: 'made_up_column' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.columnMapping).toEqual([{ header: 'weird header', column: null }]);
    });

    it('maps every header to null without calling the AI when no provider is configured', async () => {
      ai.isAvailable.mockReturnValue(false);
      const file = csv([
        ['weird header'],
        ['x'],
      ]);

      const result = await service.assist(file);

      expect(ai.complete).not.toHaveBeenCalled();
      expect(result.columnMapping).toEqual([{ header: 'weird header', column: null }]);
    });
  });

  describe('value normalization', () => {
    it('suggests a canonical spelling for values that are the same thing written differently', async () => {
      const file = csv([
        ['sku', 'name_en', 'color'],
        ['SKU-1', 'Lawn Suit', 'red'],
        ['SKU-2', 'Lawn Suit', 'Red '],
        ['SKU-3', 'Silk Suit', 'blue'],
      ]);
      ai.complete.mockImplementation((_feature: unknown, input: { prompt: string }) => {
        if (input.prompt.includes('Column: color')) {
          return Promise.resolve({
            text: JSON.stringify([{ raw: 'Red', suggested: 'red' }]),
            inputTokens: 1,
            outputTokens: 1,
            model: 'test',
          });
        }
        return Promise.resolve(null);
      });

      const result = await service.assist(file);

      expect(result.valueSuggestions).toEqual([{ column: 'color', raw: 'Red', suggested: 'red' }]);
    });

    it('never accepts a suggestion for a raw value that was not actually in the file', async () => {
      const file = csv([
        ['sku', 'name_en', 'color'],
        ['SKU-1', 'Lawn Suit', 'red'],
        ['SKU-2', 'Silk Suit', 'blue'],
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ raw: 'green', suggested: 'red' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.valueSuggestions).toEqual([]);
    });

    it('skips a column with fewer than two distinct values', async () => {
      const file = csv([
        ['sku', 'name_en', 'color'],
        ['SKU-1', 'Lawn Suit', 'red'],
        ['SKU-2', 'Silk Suit', 'red'],
      ]);

      const result = await service.assist(file);

      expect(result.valueSuggestions).toEqual([]);
    });
  });

  describe('duplicate flagging (pure arithmetic, no AI call)', () => {
    it('flags two rows in the same category with near-identical names', async () => {
      const file = csv([
        ['sku', 'name_en', 'category_slug'],
        ['SKU-1', 'Printed Lawn Suit Three Piece', 'lawn'],
        ['SKU-2', 'Printed Lawn Suit Three Piece Set', 'lawn'],
      ]);

      const result = await service.assist(file);

      expect(result.duplicateFlags).toHaveLength(1);
      expect(result.duplicateFlags[0]!.rows).toEqual([2, 3]);
    });

    it('does not flag two genuinely different product names', async () => {
      const file = csv([
        ['sku', 'name_en', 'category_slug'],
        ['SKU-1', 'Printed Lawn Suit', 'lawn'],
        ['SKU-2', 'Embroidered Silk Kurta', 'lawn'],
      ]);

      const result = await service.assist(file);

      expect(result.duplicateFlags).toEqual([]);
    });

    it('does not flag the same name repeated within one already-grouped variant set', async () => {
      const file = csv([
        ['sku', 'name_en', 'category_slug', 'size'],
        ['SKU-1', 'Printed Lawn Suit', 'lawn', 'S'],
        ['SKU-2', 'Printed Lawn Suit', 'lawn', 'M'],
      ]);

      const result = await service.assist(file);

      expect(result.duplicateFlags).toEqual([]);
    });
  });

  describe('category suggestions', () => {
    it('only ever suggests a category slug that genuinely exists today', async () => {
      const file = csv([
        ['sku', 'name_en'],
        ['SKU-1', 'Printed Lawn Suit'],
      ]);
      prisma.category.findMany.mockResolvedValue([
        { slug: 'lawn', translations: [{ name: 'Lawn' }] },
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ row: 2, suggestedCategorySlug: 'invented-slug' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.categorySuggestions).toEqual([]);
    });

    it('accepts a suggestion matching a real existing category', async () => {
      const file = csv([
        ['sku', 'name_en'],
        ['SKU-1', 'Printed Lawn Suit'],
      ]);
      prisma.category.findMany.mockResolvedValue([
        { slug: 'lawn', translations: [{ name: 'Lawn' }] },
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ row: 2, suggestedCategorySlug: 'lawn' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.categorySuggestions).toEqual([{ row: 2, suggestedCategorySlug: 'lawn' }]);
    });

    it('does not call the AI at all when every row already has a category', async () => {
      const file = csv([
        ['sku', 'name_en', 'category_slug'],
        ['SKU-1', 'Printed Lawn Suit', 'lawn'],
      ]);

      await service.assist(file);

      expect(prisma.category.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when the shop has no active categories at all', async () => {
      const file = csv([
        ['sku', 'name_en', 'name_ur'],
        ['SKU-1', 'Printed Lawn Suit', 'لان سوٹ'],
      ]);
      prisma.category.findMany.mockResolvedValue([]);

      const result = await service.assist(file);

      expect(result.categorySuggestions).toEqual([]);
      expect(ai.complete).not.toHaveBeenCalled();
    });
  });

  describe('translation suggestions', () => {
    it('suggests Urdu text only for rows missing it, never overwriting an existing translation', async () => {
      const file = csv([
        ['sku', 'name_en', 'name_ur'],
        ['SKU-1', 'Lawn Suit', ''],
        ['SKU-2', 'Silk Suit', 'ریشمی سوٹ'],
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ row: 2, field: 'name_ur', suggestedText: 'لان سوٹ' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.translationSuggestions).toEqual([{ row: 2, field: 'name_ur', suggestedText: 'لان سوٹ' }]);
    });

    it('rejects a suggestion for a row/field pair that was never asked for', async () => {
      const file = csv([
        ['sku', 'name_en', 'name_ur'],
        ['SKU-1', 'Lawn Suit', ''],
      ]);
      ai.complete.mockResolvedValue({
        text: JSON.stringify([{ row: 99, field: 'name_ur', suggestedText: 'انجانا' }]),
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.translationSuggestions).toEqual([]);
    });

    it('does nothing when nothing needs translating', async () => {
      const file = csv([
        ['sku', 'name_en', 'name_ur'],
        ['SKU-1', 'Lawn Suit', 'لان سوٹ'],
      ]);

      const result = await service.assist(file);

      expect(result.translationSuggestions).toEqual([]);
      expect(ai.complete).not.toHaveBeenCalled();
    });
  });

  describe('degradation when no AI provider is configured', () => {
    beforeEach(() => {
      ai.isAvailable.mockReturnValue(false);
    });

    it('still returns duplicate flags (pure arithmetic) with every AI-backed field empty', async () => {
      const file = csv([
        ['sku', 'name_en', 'category_slug'],
        ['SKU-1', 'Printed Lawn Suit Three Piece', 'lawn'],
        ['SKU-2', 'Printed Lawn Suit Three Piece Set', 'lawn'],
      ]);

      const result = await service.assist(file);

      expect(ai.complete).not.toHaveBeenCalled();
      expect(result.valueSuggestions).toEqual([]);
      expect(result.categorySuggestions).toEqual([]);
      expect(result.translationSuggestions).toEqual([]);
      expect(result.duplicateFlags).toHaveLength(1);
    });
  });

  describe('resilience to a malformed model reply', () => {
    it('extracts a JSON array even when the model wraps it in prose', async () => {
      const file = csv([
        ['Product Code'],
        ['SKU-1'],
      ]);
      ai.complete.mockResolvedValue({
        text: 'Sure, here you go:\n[{"header":"product code","column":"sku"}]\nLet me know if you need more!',
        inputTokens: 1,
        outputTokens: 1,
        model: 'test',
      });

      const result = await service.assist(file);

      expect(result.columnMapping).toEqual([{ header: 'product code', column: 'sku' }]);
    });

    it('treats a completely unparseable reply as no suggestions rather than throwing', async () => {
      const file = csv([
        ['Product Code'],
        ['SKU-1'],
      ]);
      ai.complete.mockResolvedValue({ text: 'not json at all', inputTokens: 1, outputTokens: 1, model: 'test' });

      const result = await service.assist(file);

      expect(result.columnMapping).toEqual([{ header: 'product code', column: null }]);
    });

    it('treats a null completion (provider failure) as no suggestions rather than throwing', async () => {
      const file = csv([
        ['Product Code'],
        ['SKU-1'],
      ]);
      ai.complete.mockResolvedValue(null);

      const result = await service.assist(file);

      expect(result.columnMapping).toEqual([{ header: 'product code', column: null }]);
    });
  });
});
