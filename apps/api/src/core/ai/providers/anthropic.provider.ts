import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import type {
  AiProvider,
  CompletionInput,
  CompletionResult,
  DescribeImageResult,
} from '../ai-provider';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 1024;

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Anthropic's Messages API. Text completion and vision (both are one
 * endpoint — a vision call just adds an image content block to the same
 * `messages` shape). No embeddings: Anthropic publishes no embeddings
 * endpoint, so `supportsEmbeddings` is false and OpenAiProvider is what
 * `embed()`-needing features fall through to (AiService's own selection
 * logic, not this file).
 *
 * Stays OFF until `anthropic` is added to AI_PROVIDERS and ANTHROPIC_API_KEY
 * is set — every AI feature degrades to its pre-AI behaviour until then
 * (House Rule 8).
 */
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly key = 'anthropic';
  readonly supportsEmbeddings = false;
  readonly supportsVision = true;

  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(private readonly config: AppConfigService) {}

  private apiKey(): string {
    const key = this.config.get('ANTHROPIC_API_KEY');
    if (!key) throw new Error('ANTHROPIC_API_KEY is not configured.');
    return key;
  }

  private model(): string {
    return this.config.get('ANTHROPIC_MODEL') || DEFAULT_MODEL;
  }

  async complete(input: CompletionInput): Promise<CompletionResult> {
    const model = this.model();
    const body: Record<string, unknown> = {
      model,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: [{ role: 'user', content: input.prompt }],
    };
    if (input.system) body.system = input.system;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    // Anthropic has no dedicated JSON mode; the closest honest equivalent is
    // asking for it in the system prompt, which the caller already controls
    // via `input.system` — nothing to add to the request body itself.

    const response = await this.post(body);
    return {
      text: textFrom(response),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
    };
  }

  async describeImage(imageUrl: string, prompt: string): Promise<DescribeImageResult> {
    const model = this.model();
    const imageBlock = await this.fetchImageAsBase64(imageUrl);

    const response = await this.post({
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: imageBlock },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    return {
      text: textFrom(response),
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model,
    };
  }

  private async post(body: Record<string, unknown>): Promise<AnthropicResponse> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey(),
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Anthropic API responded ${response.status}: ${detail.slice(0, 500)}`);
      throw new Error(`Anthropic API responded ${response.status}`);
    }

    return (await response.json()) as AnthropicResponse;
  }

  /**
   * Anthropic's image content block wants base64, not a bare URL — fetched
   * server-side so the caller only ever deals in the storage URL StorageService
   * already hands out.
   */
  private async fetchImageAsBase64(
    imageUrl: string,
  ): Promise<{ type: 'base64'; media_type: string; data: string }> {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Could not fetch image at ${imageUrl}: ${response.status}`);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { type: 'base64', media_type: contentType, data: buffer.toString('base64') };
  }
}

function textFrom(response: AnthropicResponse): string {
  return response.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();
}
