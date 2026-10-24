import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import type { AiProvider, CompletionInput, CompletionResult, EmbeddingResult } from '../ai-provider';

const CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

interface ChatResponse {
  choices: Array<{ message: { content: string | null } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

interface EmbeddingsResponse {
  data: Array<{ embedding: number[] }>;
  usage: { prompt_tokens: number };
  model: string;
}

/**
 * OpenAI's chat completions and embeddings APIs. The `embed()` half of this
 * codebase's two-provider setup — Anthropic (anthropic.provider.ts) has no
 * public embeddings endpoint, and `text-embedding-3-small`'s 1536 dimensions
 * are exactly what ProductTranslation.embedding's `vector(1536)` column is
 * sized for (catalog.prisma's own comment on that column).
 *
 * Stays OFF until `openai` is added to AI_PROVIDERS and OPENAI_API_KEY is
 * set (House Rule 8) — WO-9.5's semantic search simply has no embeddings to
 * rank against until then, falling back to Phase 8's ts_rank/trigram search
 * alone.
 */
@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly key = 'openai';
  readonly supportsEmbeddings = true;
  readonly supportsVision = false;

  private readonly logger = new Logger(OpenAiProvider.name);

  constructor(private readonly config: AppConfigService) {}

  private apiKey(): string {
    const key = this.config.get('OPENAI_API_KEY');
    if (!key) throw new Error('OPENAI_API_KEY is not configured.');
    return key;
  }

  private model(): string {
    return this.config.get('OPENAI_MODEL') || DEFAULT_MODEL;
  }

  private embeddingModel(): string {
    return this.config.get('OPENAI_EMBEDDING_MODEL') || DEFAULT_EMBEDDING_MODEL;
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const model = this.model();
    const messages: Array<{ role: string; content: string }> = [];
    if (input.system) messages.push({ role: 'system', content: input.system });
    messages.push({ role: 'user', content: input.prompt });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: input.maxTokens ?? 1024,
    };
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.jsonMode) body.response_format = { type: 'json_object' };

    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey()}` },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`OpenAI chat API responded ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`OpenAI chat API responded ${response.status}`);
    }

    const data = (await response.json()) as ChatResponse;
    return {
      text: (data.choices[0]?.message.content ?? '').trim(),
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      model: data.model || model,
    };
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const model = this.embeddingModel();
    const response = await fetch(EMBEDDINGS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey()}` },
      body: JSON.stringify({ model, input: texts }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`OpenAI embeddings API responded ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`OpenAI embeddings API responded ${response.status}`);
    }

    const data = (await response.json()) as EmbeddingsResponse;
    return {
      vectors: data.data.map((row) => row.embedding),
      inputTokens: data.usage.prompt_tokens,
      model: data.model || model,
    };
  }
}
