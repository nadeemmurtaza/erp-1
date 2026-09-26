import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AiService } from '../../core/ai/ai.service';
import { AiFeature } from '../../core/prisma/client';
import { RagRetrievalService, type RagScope } from './rag-retrieval.service';

export interface RagCitation {
  sourceId: string;
  originalName: string;
  pageFrom: number;
  pageTo: number;
}

export interface RagAnswer {
  text: string;
  citations: RagCitation[];
}

const SYSTEM_PROMPT =
  'You are answering a question using only the numbered source excerpts you are given. ' +
  'Cite the excerpt number(s) your answer relies on, in square brackets, next to each claim. ' +
  'If the excerpts do not contain the answer, say so plainly — never invent one.';

/**
 * WO-35.5 — generation reuses `AiService.complete()` and `09-ai-layer.md`'s
 * own rule (§5, restated in the doc's own scope lenses): this is an
 * internal-staff read (the admin query console — `RagAdminController`'s
 * `ask()`), so it carries no "draft a human confirms" gate, exactly the way
 * WO-9.6's semantic search needs none. A customer-facing extension of this
 * (WO-9.7's WhatsApp assistant citing the knowledge base) and anything that
 * drafts something for a human to act on (a supplier-dispute reply, a
 * contract-clause summary for sign-off) are both named in the doc's §5 but
 * are not this work order's — WO-9.7 keeps its own existing scope
 * unchanged, and a drafting use of RAG is its own future work order, gated
 * like `AiSuggestionsService` when it exists, not stubbed here.
 *
 * The doc's own non-negotiable: "never a bare answer with no traceable
 * source." `citations` is never empty when `text` is non-null — every chunk
 * actually handed to the model as context is listed, not only the subset
 * the model's own prose happens to reference (its own citation markers are
 * advisory text, not a machine-checked fact).
 */
@Injectable()
export class RagGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly retrieval: RagRetrievalService,
  ) {}

  isAvailable(): boolean {
    return this.ai.isAvailable('embed') && this.ai.isAvailable('complete');
  }

  /** `null` when nothing relevant was retrieved — a real "no answer," not a failure. Throws `ServiceUnavailableException` when retrieval or completion itself is unavailable. */
  async answer(query: string, scope: RagScope, topK?: number): Promise<RagAnswer | null> {
    const hits = await this.retrieval.retrieve(query, scope, topK);
    if (hits.length === 0) return null;

    const sources = await this.prisma.documentSource.findMany({
      where: { id: { in: [...new Set(hits.map((hit) => hit.sourceId))] } },
    });
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    const context = hits
      .map((hit, index) => {
        const source = sourceById.get(hit.sourceId);
        return `[${index + 1}] (${source?.originalName ?? 'unknown source'}, p.${hit.pageFrom}-${hit.pageTo})\n${hit.text}`;
      })
      .join('\n\n');

    const result = await this.ai.complete(AiFeature.RAG_GENERATION, {
      system: SYSTEM_PROMPT,
      prompt: `Question: ${query}\n\nSource excerpts:\n${context}`,
      maxTokens: 800,
    });
    if (!result) {
      throw new ServiceUnavailableException('Generation is not available right now — try again shortly.');
    }

    return {
      text: result.text,
      citations: hits.map((hit) => ({
        sourceId: hit.sourceId,
        originalName: sourceById.get(hit.sourceId)?.originalName ?? 'Unknown source',
        pageFrom: hit.pageFrom,
        pageTo: hit.pageTo,
      })),
    };
  }
}
