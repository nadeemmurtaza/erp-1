# ADR-078 — Doc 209 (semantic caching): applied to exactly one of ten AiFeature call sites — RAG_GENERATION, the only one where the answer depends solely on question meaning — and explicitly refused for WHATSAPP_ASSISTANT, where every prompt is already personalized per contact and a semantic cache would risk leaking one customer's data into another's answer

[← Decision log](../DECISIONS.md)


### Context

The owner asked to consider semantic caching alongside doc 208's L1/L2/L3
work. Investigated across all ten `AiFeature` call sites before choosing
one: `WHATSAPP_ASSISTANT` builds every prompt from
`buildGroundingContext(contact.id)` — per-customer order/conversation
history baked into the prompt itself; `SEMANTIC_SEARCH` only ever makes one
cheap embedding call per search with no completion step; `RAG_GENERATION`
scopes to `{ organizationId, corpus }` with no per-user dimension at all,
and its completion step is the genuinely expensive, cacheable cost.

### Options Considered

1. **Apply semantic caching generically across every AI-feature call site.**
   Rejected — for `WHATSAPP_ASSISTANT` specifically this is not merely
   unhelpful but actively dangerous: caching by question-embedding
   similarity while ignoring that every prompt also carries per-contact
   grounding context would serve one customer's cached answer, containing
   another customer's order context, to a semantically similar question
   from someone else. A real cross-customer data leak, not a hypothetical.
2. **Apply it to `SEMANTIC_SEARCH`.** Rejected — the only AI cost there is
   one embedding call per search with no completion step; a semantic cache
   still requires embedding the incoming query to check for a match, so it
   cannot avoid the one call this path makes. Doc 208's own general L2 Redis
   cache, keyed on the normalized search term, already captures the real
   repeat-query savings with no new infrastructure.
3. **Build a new Redis-based vector index for whichever target(s) are
   chosen.** Rejected — pgvector is already proven, working infrastructure
   in this codebase (`DocumentChunk.embedding`, `ProductTranslation.embedding`,
   both `vector(1536)`); a second vector-search mechanism in Redis duplicates
   a capability that already exists.
4. **Apply semantic caching to `RAG_GENERATION` only**, using pgvector (not
   a new Redis vector index), a conservative 0.95 cosine-similarity
   threshold, a 24-hour TTL backstopped by explicit invalidation on
   ingestion completion for the affected corpus, and cached citations
   carried forward unchanged rather than re-derived. Chosen.

### Decision

Doc 209, as written. One target (`RAG_GENERATION`), two explicit refusals
(`WHATSAPP_ASSISTANT`, `SEMANTIC_SEARCH`) with reasons recorded so neither
is silently reconsidered later without the same evidence being re-examined.

### Reasoning

The deciding question for every candidate was the same: does the answer
depend only on the question's meaning, or also on who's asking? Only
`RAG_GENERATION` answered "only on meaning." This is the same discipline
doc 208 already applied (attach a tier to a found, measured hot path, never
apply a technique uniformly because it's available) — extended here to
ruling a technique *out* with equal rigor when applying it would be a
correctness or privacy defect, not just unhelpful.

### Consequences

`RagGenerationService` gains a cache-check/cache-write path and a new
table; `RagIngestionService` gains one new call at its existing completion
point rather than a new generic event topic. `WHATSAPP_ASSISTANT` and
`SEMANTIC_SEARCH` are unaffected by this document — their absence of
caching here is a decision, not an oversight, and doc 209 itself is the
record a future reader checks before assuming otherwise.

### Status
**Accepted.**
