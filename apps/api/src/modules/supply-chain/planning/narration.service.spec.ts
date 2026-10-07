import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from '../../../core/ai/ai.service';
import { NarrationService } from './narration.service';
import type { PropagationResult } from './propagation';
import type { CandidateAction } from './action-ranking';

describe('NarrationService', () => {
  let service: NarrationService;
  let ai: any;

  const PROPAGATION: PropagationResult = {
    shock: { kind: 'DemandShock', variantId: 'v1', pctChange: 10 },
    perSkuLocation: [{ variantId: 'v1', locationId: 'l1', projectedOnHand: 40, daysOfCoverRemaining: 4, stockoutInDays: 4, unmetDemandUnitsPerDay: 2 }],
  };
  const ACTIONS: CandidateAction[] = [
    { kind: 'TRANSFER_STOCK', description: '', cashPreservedMinor: 5000, rupeesSpentMinor: 0, score: 5000, feasible: true, reversibilityRank: 2, sourceEdges: [] },
  ];

  beforeEach(async () => {
    ai = { isAvailable: jest.fn().mockReturnValue(true), complete: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [NarrationService, { provide: AiService, useValue: ai }],
    }).compile();
    service = module.get(NarrationService);
  });

  it('returns null when AI is unavailable, never attempting a call', async () => {
    ai.isAvailable.mockReturnValue(false);
    const result = await service.narrate(PROPAGATION, ACTIONS);
    expect(result).toBeNull();
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('accepts a narration that cites only the given figures', async () => {
    ai.complete.mockResolvedValue({ text: 'Stock at l1 covers 4 days; a transfer preserves 5000 paisa.' });
    const result = await service.narrate(PROPAGATION, ACTIONS);
    expect(result).not.toBeNull();
    expect(result!.text).toContain('5000');
  });

  it('refuses a narration that originates a figure not in the citation set', async () => {
    ai.complete.mockResolvedValue({ text: 'Stock at l1 covers 4 days; a transfer preserves 99999 paisa.' });
    const result = await service.narrate(PROPAGATION, ACTIONS);
    expect(result).toBeNull();
  });

  it('assertNoOriginatedFigures strips every cited figure and rejects any remaining digit', () => {
    const citations = [{ value: '40' }, { value: '4' }];
    expect(service.assertNoOriginatedFigures('on-hand 40, stockout in 4 days', citations)).toBe(true);
    expect(service.assertNoOriginatedFigures('on-hand 40, stockout in 4 days, plus 7 more', citations)).toBe(false);
  });
});
