import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { DependencyGraphService } from './dependency-graph';
import { NarrationService } from './narration.service';
import { PlanningService } from './planning.service';

describe('PlanningService', () => {
  let service: PlanningService;
  let prisma: any;
  let graph: any;
  let narration: any;

  beforeEach(async () => {
    prisma = {
      stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
      productVariant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    graph = { build: jest.fn().mockResolvedValue([]) };
    narration = { narrate: jest.fn().mockResolvedValue({ text: 'ok', citations: [] }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: prisma },
        { provide: DependencyGraphService, useValue: graph },
        { provide: NarrationService, useValue: narration },
      ],
    }).compile();
    service = module.get(PlanningService);
  });

  it('never calls narrate() unless includeNarration is requested', async () => {
    await service.runPropagation({ kind: 'CashShock', amountMinor: 1000 });
    expect(narration.narrate).not.toHaveBeenCalled();
  });

  it('calls narrate() with the computed propagation/ranked-actions when includeNarration is true', async () => {
    const result = await service.runPropagation({ kind: 'CashShock', amountMinor: 1000 }, { includeNarration: true });
    expect(narration.narrate).toHaveBeenCalledWith(result.propagation, result.rankedActions);
    expect(result.narration).toEqual({ text: 'ok', citations: [] });
  });

  it('returns an empty propagation with no risk rows when the graph has no Sku edges', async () => {
    const result = await service.runPropagation({ kind: 'CashShock', amountMinor: 1000 });
    expect(result.propagation.perSkuLocation).toEqual([]);
  });
});
