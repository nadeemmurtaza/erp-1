import { Injectable } from '@nestjs/common';
import { AiFeature } from '../../../core/prisma/client';
import { AiService } from '../../../core/ai/ai.service';
import type { PropagationResult } from './propagation';
import type { CandidateAction } from './action-ranking';

export interface Citation {
  /** The exact figure as it appears in the narration text. */
  value: string;
}

export interface NarrationResult {
  text: string;
  citations: Citation[];
}

/**
 * R23 — GenAI narrates, cites, never computes. `AiService.complete()` is
 * handed the STRUCTURED propagation/ranking result and asked only for
 * prose around it; `assertNoOriginatedFigures()` is the acceptance test
 * R23 states as mechanical, not aspirational — every bare number in the
 * text must strip to nothing once every already-computed figure is
 * removed, or the narration is refused rather than shown uncited.
 */
@Injectable()
export class NarrationService {
  constructor(private readonly ai: AiService) {}

  async narrate(propagation: PropagationResult, rankedActions: CandidateAction[]): Promise<NarrationResult | null> {
    if (!this.ai.isAvailable('complete')) return null;

    const citations = this.buildCitations(propagation, rankedActions);
    const figures = citations.map((c) => c.value).join(', ');

    const result = await this.ai.complete(AiFeature.PLANNING_NARRATION, {
      system:
        'You narrate a supply-chain risk report in plain business English. ' +
        'You may only reference the exact figures given to you below — never ' +
        'estimate, round differently, or introduce a number not in this list. ' +
        `Figures you may cite: ${figures}.`,
      prompt: this.summarizeForPrompt(propagation, rankedActions),
      maxTokens: 400,
    });
    if (!result) return null;

    if (!this.assertNoOriginatedFigures(result.text, citations)) {
      // The model cited a number outside the given set — refused, never
      // shown uncited (R23's own acceptance test, enforced at call time).
      return null;
    }

    return { text: result.text, citations };
  }

  private buildCitations(propagation: PropagationResult, rankedActions: CandidateAction[]): Citation[] {
    const citations: Citation[] = [];
    for (const row of propagation.perSkuLocation) {
      citations.push({ value: String(row.projectedOnHand) });
      if (row.stockoutInDays !== null) citations.push({ value: String(Math.round(row.stockoutInDays)) });
    }
    for (const action of rankedActions) {
      citations.push({ value: String(action.cashPreservedMinor) });
      citations.push({ value: String(action.rupeesSpentMinor) });
    }
    return citations.filter((c) => c.value !== '0');
  }

  private summarizeForPrompt(propagation: PropagationResult, rankedActions: CandidateAction[]): string {
    const rows = propagation.perSkuLocation
      .slice(0, 20)
      .map((r) => `${r.variantId}@${r.locationId}: on-hand ${r.projectedOnHand}, stockout in ${r.stockoutInDays ?? 'n/a'} days`)
      .join('\n');
    const actions = rankedActions
      .slice(0, 10)
      .map((a) => `${a.kind}: preserves ${a.cashPreservedMinor} paisa, costs ${a.rupeesSpentMinor} paisa`)
      .join('\n');
    return `Shock: ${propagation.shock.kind}\n\nRisk rows:\n${rows}\n\nRanked actions:\n${actions}`;
  }

  /**
   * Strips every cited figure from the text; a standalone number token
   * remaining means the model originated a figure of its own — refused,
   * per R23's own mechanical acceptance test. `\b\d+\b` deliberately never
   * flags a digit embedded in an identifier ("l1", "v42") — R23 is about
   * originated FIGURES, not entity ids the narration is free to name.
   */
  assertNoOriginatedFigures(text: string, citations: Citation[]): boolean {
    let stripped = text;
    for (const citation of citations) {
      stripped = stripped.split(citation.value).join('');
    }
    return !/\b\d+\b/.test(stripped);
  }
}
