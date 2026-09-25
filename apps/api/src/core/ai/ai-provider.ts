/**
 * Extension point: AI providers (Phase 9, 09-ai-layer.md, House Rule 8 —
 * same idiom as PaymentProvider and StorageDriver). The model is a config
 * change, never a rewrite: switching from Anthropic to a different vendor,
 * or running both at once for different capabilities, is an entry in the
 * AI_PROVIDERS env allowlist, not a code change.
 *
 * Every feature that calls `complete`/`embed`/`describeImage` goes through
 * AiService, never a provider directly — AiService is what enforces the
 * doc's own two rules that govern this entire phase: every call is logged
 * (cost/tokens, AiUsageLog) and stopped once the monthly budget is spent,
 * and every call has a timeout with the pre-AI behaviour as its fallback.
 * A provider itself only ever talks to its one vendor's API; it knows
 * nothing about budgets, features, or fallbacks.
 *
 * Adding a provider: implement this interface, add the class to AiService's
 * constructor list, add its key to the allowlist. Nothing else changes.
 */
export interface CompletionInput {
  /** System/instruction prompt — never includes untrusted user text verbatim without saying so. */
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** 0 = deterministic. Omit for the provider's own default. */
  temperature?: number;
  /**
   * Requests a JSON object back, when the provider supports structured
   * output. Callers still parse and validate the result themselves — this
   * is a hint to the model, not a schema-enforced guarantee.
   */
  jsonMode?: boolean;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface EmbeddingResult {
  vectors: number[][];
  inputTokens: number;
  model: string;
}

export interface DescribeImageResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AiProvider {
  /** Stable key, matching the AI_PROVIDERS allowlist. */
  readonly key: string;
  /** True when this provider can serve `embed()` — not every vendor offers embeddings. */
  readonly supportsEmbeddings: boolean;
  /** True when this provider can serve `describeImage()` — not every model is vision-capable. */
  readonly supportsVision: boolean;
  complete(input: CompletionInput): Promise<CompletionResult>;
  /** Implement only when `supportsEmbeddings` is true. */
  embed?(texts: string[]): Promise<EmbeddingResult>;
  /** Implement only when `supportsVision` is true. `imageUrl` must be publicly fetchable — see StorageService.urlFor(). */
  describeImage?(imageUrl: string, prompt: string): Promise<DescribeImageResult>;
}
