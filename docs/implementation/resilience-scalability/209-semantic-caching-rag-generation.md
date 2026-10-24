# 209 — Semantic caching: one real target, one explicit refusal, one non-target

> **Status: proposed (2026-09-28), not yet built.** "Semantic caching" is a
> real, valuable technique — for exactly one of this codebase's ten
> `AiFeature` call sites. The other two candidates investigated here are
> named and ruled out with reasons, not silently skipped: `WHATSAPP_ASSISTANT`
> because applying it would risk leaking one customer's data into another's
> answer; `SEMANTIC_SEARCH` because the thing worth caching there isn't
> actually expensive enough to need semantic matching. Extends doc 208's
> caching architecture; does not duplicate its Redis tiers, because the
> mechanism a true semantic cache needs — similarity search — is a database
> capability this codebase already has, not a new one.

## 1. What semantic caching actually is, precisely, so it isn't misapplied

Not "cache API responses with a fuzzy key." Specifically: when the *expensive*
step is an LLM generating text from a question (not a cheap lookup), and
different users phrase the same underlying question differently ("what's
your return window" / "how long do I have to return something"), an
exact-string cache never hits — but the two questions' embeddings are close
in vector space. A semantic cache embeds the incoming question, searches for
a previously-answered question within a similarity threshold, and — only
above that threshold — reuses the prior answer instead of paying for a new
completion. The mechanism that makes this correct or dangerous is entirely in
*what the answer is allowed to depend on*: if the answer only depends on
question meaning, this is safe; if it also depends on who's asking, it is not,
because two people can ask the "same" question and need different answers.

## 2. Where this is genuinely dangerous — `WHATSAPP_ASSISTANT`, ruled out

Traced the real call site (`whatsapp-assistant.service.ts`): every single
completion is built from `buildPrompt(grounding, message.body)`, where
`grounding` is `buildGroundingContext(contact.id)` — **per-contact order and
conversation history, baked directly into every prompt, every time, with no
exception.** Two different customers asking "where's my order" are asking
semantically identical questions that must get *different* answers, because
the answer depends on whose order it is. A semantic cache here — even one
that tried to scope by contact — would still be solving nothing, since the
entire value of semantic caching is reusing an answer across differently-
phrased-but-equivalent questions, and here no two customers' questions are
ever actually equivalent once grounding is accounted for. Applying it anyway,
carelessly, is the failure mode worth naming explicitly: a cache keyed only
on the embedding of `message.body` (ignoring that grounding varies) would
serve customer B customer A's order status. **Not built, for this reason,
stated here rather than left to be rediscovered by whoever next reads
`WHATSAPP_ASSISTANT` and wonders why it has no cache.**

## 3. Where it isn't needed — `SEMANTIC_SEARCH`, ruled out for a different reason

Traced `search.service.ts`'s `vectorCandidatesForText(term, locale)`: it
embeds the search term (one cheap `AiService.embed()` call) and runs a
pgvector similarity search over *product* embeddings — there is no LLM
completion step at all; the result is database rows, not generated text.
The only AI cost here is a single embedding call per search, and embedding
calls are the cheap side of this codebase's own `AiService` (no
`AiCallKind.COMPLETION`, just `AiCallKind.EMBEDDING`, priced and latency-
bounded accordingly). A true semantic cache still requires embedding the
*incoming* query before it can compare against anything cached — so it
cannot skip the one AI call this path makes; it could only save a *repeat* of
the exact same call, which doc 208's own general L2 Redis cache (keyed on the
normalized search term) already does, more simply, with no new
infrastructure. Building vector-similarity matching on top of a single cheap
embedding call is complexity without the savings that justify it elsewhere.
**Not built — doc 208's existing L2 tier already covers the real repeat-query
case here.**

## 4. Where it's the right tool — `RAG_GENERATION`

Traced `rag-generation.service.ts` and `RagScope` (`rag-retrieval.service.ts`):
`{ organizationId, corpus }` — **no per-user, per-contact, or per-session
dimension anywhere in scope.** The answer to a RAG question depends only on
the organization's own document corpus, never on who within that
organization is asking. This is exactly the condition §1 requires: two
different employees at the same organization asking differently-worded
versions of the same question about the same document corpus should get the
same answer, and paying for a second full completion to produce it is pure
waste. The completion step here is real, priced `AiCallKind.COMPLETION` cost
— the expensive side of `AiService`, unlike search's embedding-only cost.
`RagGenerationResult.citations` is never empty when `text` is non-null
(existing guarantee, `rag-generation.service.ts:70`'s own doc comment) — a
cached answer must carry its original citations forward, never re-derive or
drop them, so a cache hit is exactly as trustworthy as the original.

### Exact parameters

**Parameter: storage mechanism.**
**Exact value:** a new `RagAnswerCache` table (`organizationId`, `corpus`,
`queryEmbedding vector(1536)`, `answer`, `citations Json`, `createdAt`) using
Postgres + pgvector — **not** a new Redis vector index. **Why:** pgvector is
already proven, working infrastructure in this exact codebase
(`DocumentChunk.embedding`, `ProductTranslation.embedding`, both
`vector(1536)`) — introducing a second vector-similarity mechanism in Redis
(which has no native vector search without an additional module never
confirmed present here) would be exactly the duplicate-capability trap
CLAUDE.md's own rules warn against. `1536` matches the existing embedding
dimension throughout this codebase, not a new model/dimension choice.

**Parameter: similarity threshold for a cache hit.**
**Exact value:** cosine similarity **≥ 0.95** (`1 - (queryEmbedding <=>
$new) >= 0.95` in the pgvector query).
**Why 0.95, not 0.85 or lower:** the cost of a false hit (returning a
plausible but subtly wrong cached answer for a question that was actually
different) is worse than the cost of a false miss (paying for one redundant
completion). 0.95 is the conservative end of what semantic-cache literature
generally uses, chosen here specifically because a wrong answer that reads
as confident is a worse failure than a slow one — matching this codebase's
own posture on `PLANNING_NARRATION`'s `assertNoOriginatedFigures()`: prefer
a correct refusal to a fluent, ungrounded answer.

**Parameter: cache entry TTL.**
**Exact value:** **24 hours.**
**Why 24 hours, not 5 minutes or a week:** a document corpus changes when
someone runs `RAG_INGESTION`, not on a predictable schedule; 24 hours bounds
the worst-case staleness for a document edit that doesn't trigger explicit
invalidation (below) for some reason, while being long enough that a
genuinely repeated question within a working day is still served from cache.

**Parameter: explicit invalidation on ingestion.**
**Exact value:** when `RagIngestionService` completes an ingestion batch for
a given `(organizationId, corpus)` (its existing completion path — no
ingestion-completion event exists today, so this is a new, narrow call added
at that exact point, not a new generic event bus topic), every
`RagAnswerCache` row for that same `(organizationId, corpus)` is deleted.
**Why delete-all-for-scope rather than trying to invalidate only affected
answers:** determining which *specific* cached answers a given document
edit could have affected would require re-running retrieval for every cached
question — more expensive than just accepting a full cache clear for that
corpus, which is a rare event (ingestion, not everyday traffic).

**Parameter: what a cache hit skips.**
**Exact value:** both the retrieval step (`RagRetrievalService.retrieve()`)
and the completion step (`AiService.complete()`) are skipped entirely on a
hit — not just the completion. The cached `citations` (the chunks the
original answer actually cited) are returned as-is, preserving the "never
empty when text is non-null" guarantee without re-deriving it.

**Parameter: what counts toward the AI budget on a hit.**
**Exact value:** the one embedding call made to check for a cache hit still
counts and is logged (`AiCallKind.EMBEDDING`, as today); the skipped
completion is not logged as a completion, since none happened — the budget
and usage log stay an honest record of what was actually called, per
`AiService`'s own existing "every call is logged" rule, not a place to
fabricate a saved-cost entry.

## Work orders

**WO-209.1** — `RagAnswerCache` schema (pgvector column, migration).
**WO-209.2** — cache-check path in `RagGenerationService`: embed the
incoming query, pgvector similarity lookup, return on a ≥0.95 hit within 24h.
**WO-209.3** — cache-write path: on a miss, after a successful generation,
store the query embedding, answer, and citations.
**WO-209.4** — invalidation hook at `RagIngestionService`'s completion path.
**WO-209.5** — tests: a paraphrased question within threshold hits; a
genuinely different question below threshold misses; an ingestion completion
clears exactly that corpus's entries and no other corpus's; citations survive
a cache hit unchanged.

## Acceptance

- Two differently-worded questions with cosine similarity ≥ 0.95 against the
  same corpus produce the same cached answer and citations, with only one
  completion call logged between them, provable by test.
- A question below the 0.95 threshold always triggers a fresh completion,
  never a mismatched cached answer, provable by test.
- Completing an ingestion batch for one corpus clears only that corpus's
  cache entries; a different corpus's entries in the same organization are
  untouched, provable by test.
- `WHATSAPP_ASSISTANT` and `SEMANTIC_SEARCH` remain uncached by this
  document — confirmed by absence of any `RagAnswerCache`-style mechanism
  wired into either.

## Out of scope

Semantic caching for `WHATSAPP_ASSISTANT` (§2 — actively wrong to build).
A generalized "semantic cache anything" utility (this is scoped to
`RAG_GENERATION`'s specific, safe conditions — a future candidate is
evaluated against §1's own criterion, not assumed to qualify by analogy).
Cross-organization cache sharing (each `RagAnswerCache` row is scoped to one
`organizationId`; two organizations never share a cached answer even if
their corpora happen to contain similar text, matching this repo's own
tenant-isolation rule).
