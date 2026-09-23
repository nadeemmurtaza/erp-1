# 35 — Scalable retrieval-augmented generation over millions of documents

**Read `09-ai-layer.md` first — this document extends it, it does not
replace it.** `AiProvider.embed()` already exists; `pgvector` is already the
chosen embedding store for WO-9.6's product search; the "everything AI-
generated is a draft a human confirms" rule and the cost/latency/failure
constraints already govern every AI feature in this repository. A RAG
system is exactly one more `AiProvider` consumer, built on the same
interface — never a second AI subsystem with its own rules.

## Scoping the claim before designing against it

**"Millions of PDFs" and "billions of users" are stated as the design
ceiling this document engineers toward, not as this platform's current or
near-term reality, and that distinction matters for what gets built now
versus what gets named and deferred.** `CLAUDE.md`'s own axes are explicit:
**"One deployment serves one brand, resolved at build time... do not build
toward multi-brand speculatively."** A single retail brand — even at
Organization edition, even a large regional chain — has thousands to low
millions of generated documents (receipts, contracts, supplier invoices)
over its lifetime, and a customer base in the thousands to low millions, not
billions. Billions of end users only becomes a real number if this
capability is eventually offered as a **shared, hosted, cross-tenant
service** — every Newax deployment's documents indexed centrally — which is
a materially different architecture (multi-tenant at the platform layer,
not the brand layer) that this repository has not decided to build and this
document does not assume. What follows is designed so that decision, if it
is ever made, is a scaling change to this module's own storage/isolation
layer — never a rewrite of the ingestion, chunking, retrieval or generation
logic, which are identical at either scale.

This is the same discipline `RETAIL-ERP.md` already applies to the
Solo → Chain → Organization tiers, extended one tier further: **Brand →
Platform**, named here explicitly so nobody mistakes "designed for" as
"built for," and so the escalation trigger (below) is a documented decision
point, not a surprise.

## 1. A document is ingested once and produces chunks, never re-parsed per query

```prisma
// new: rag.prisma

model DocumentSource {
  id             String  @id @default(cuid())
  organizationId String
  /// Where this document actually lives — never re-stored here. Points at
  /// StorageService the same way doc 28's EmployeeDocument does.
  storageKey     String
  originalName   String
  /// What corpus this belongs to, so retrieval can be scoped to a purpose
  /// as well as a tenant — an HR assistant must never surface a supplier
  /// contract, even within the same organization.
  corpus         DocumentCorpus
  status         IngestStatus @default(QUEUED)
  pageCount      Int?
  ingestedAt     DateTime?
  failureReason  String?
  createdAt      DateTime @default(now())

  chunks DocumentChunk[]

  @@index([organizationId, corpus, status])
}

enum DocumentCorpus {
  EMPLOYEE_DOCUMENTS   /// doc 28's vault
  SUPPLIER_CATALOG     /// spec sheets, product manuals from tradingpartners
  BUSINESS_DOCUMENTS   /// generated invoices, contracts, statements
  KNOWLEDGE_BASE       /// policy docs, help content, curated for customer-facing answers
}

enum IngestStatus { QUEUED EXTRACTING CHUNKING EMBEDDING READY FAILED }

/// One row per chunk, not per document — chunking is what makes retrieval
/// precise instead of "here's a 40-page PDF, good luck."
model DocumentChunk {
  id         String  @id @default(cuid())
  sourceId   String
  organizationId String  /// denormalized from DocumentSource — the isolation lens below explains why this is not optional
  pageFrom   Int
  pageTo     Int
  text       String
  /// pgvector column — see "Where the vectors live" below.
  embedding  Unsupported("vector(1536)")

  source DocumentSource @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([organizationId, sourceId])
}
```

`organizationId` denormalized onto `DocumentChunk` rather than joined
through `DocumentSource` on every query is deliberate: the isolation filter
below must be a column on the table being searched, not a join a future
query can forget — the same reasoning every branch-scoped table in this
repository already follows.

## 2. Where the vectors live, and the one trigger that changes it

**Default: `pgvector`, partitioned by `organizationId`.** This follows
`09-ai-layer.md` WO-9.6's own decision exactly — "no extra service" — and is
correct for the realistic scale named above: a brand's own document corpus,
even at Organization edition, is comfortably within what a properly
indexed (HNSW, per-partition) Postgres table serves with sub-second
retrieval.

**The named escalation trigger, decided in advance so it is never an
emergency:** if a single deployment's `DocumentChunk` table exceeds roughly
50 million rows, or p95 retrieval latency exceeds 300ms under real query
load after index tuning, the retrieval layer (below) swaps its
`VectorStore` implementation for a dedicated vector service (e.g. a managed
pgvector-compatible cluster, or a purpose-built vector database) —
**a driver swap, not a redesign**, because retrieval is already built
against an interface:

```ts
export interface VectorStore {
  upsertChunks(chunks: DocumentChunk[]): Promise<void>;
  query(embedding: number[], filter: { organizationId: string; corpus?: DocumentCorpus }, topK: number): Promise<DocumentChunk[]>;
}
```

This is `StorageDriver`'s exact shape, applied to vectors instead of files —
the same extension-point discipline, so the platform-scale question named
above, if it ever arrives, changes one class registration, never the
ingestion pipeline, the chunking logic, or a single API caller.

## 3. Ingestion is async, idempotent, and never blocks a request

```
PDF uploaded (doc 28's vault, a supplier catalog import, a generated invoice)
  -> DocumentSource row, status QUEUED
  -> background job: extract text (OCR fallback for scanned PDFs)
  -> chunk (page-aware, ~500 tokens with overlap)
  -> AiProvider.embed() per chunk, batched
  -> VectorStore.upsertChunks()
  -> status READY
```

Every step is a cron/queue-driven job, following `finance.cron.ts`'s
existing pattern — nothing here runs synchronously in a request path,
which is `09-ai-layer.md`'s own latency rule applied to ingestion instead of
generation. Re-ingesting an already-`READY` document (a corrected PDF
re-uploaded) replaces its chunks in one transaction — old chunks deleted,
new ones inserted — never left to accumulate stale duplicates alongside
current ones.

## 4. Retrieval is scoped before it is ranked

```ts
async function retrieve(query: string, scope: { organizationId: string; corpus: DocumentCorpus }, topK = 8) {
  const embedding = await aiProvider.embed([query]);
  return vectorStore.query(embedding[0], scope, topK); // scope is a WHERE clause, not a post-filter
}
```

**The `organizationId`/`corpus` filter is applied inside the vector query,
never after it.** Retrieving the nearest 200 chunks platform-wide and then
discarding the ones from the wrong tenant is the exact bug class that leaks
one customer's confidential document into another's AI answer — the filter
must be a predicate the vector index itself honors, the same "row-level
scoping enforced server-side, never trusted from the client" rule
`16-pbac-row-scoping.md` already states for every other query in this
repository.

## 5. Generation reuses `AiProvider.complete()` and 09-ai-layer's own rule

A RAG answer is `AiProvider.complete()` given the retrieved chunks as
context, with citations back to `DocumentSource.originalName`/page range —
**never a bare answer with no traceable source**, which is this document's
own version of `CLAUDE.md`'s "click the number" lens applied to a generated
sentence instead of a dashboard tile.

Whether the answer needs the "draft a human confirms" gate depends on what
it does, exactly as `09-ai-layer.md` already draws the line:

- **An internal staff query** ("what does our return policy say about
  damaged goods") is a read — no gate needed, the same way WO-9.6's
  semantic search needs none.
- **A customer-facing answer** (WO-9.7's WhatsApp assistant, extended to
  cite the knowledge base) stays a read-only information response under
  WO-9.7's own existing bound: it answers, it never decides, prices, cancels
  or refunds — anything the answer implies the customer wants done still
  routes to the existing human-reviewed action, unchanged.
- **Anything the retrieved content is used to draft** (a suggested reply
  to a supplier dispute, a summarized contract clause presented for a
  manager's sign-off) goes through the gate like every other AI draft in
  this repository.

## Scope lenses

**The actor with three tables** — n/a: no new counterparty; ingestion and
retrieval act on behalf of the existing `User`/`ApiClient` (doc 34) caller.
**The principal with no permission key** — n/a.
**The grant that ends itself** — n/a.
**Whose rows, and which columns** — restated because it is this document's
central risk: every retrieval is filtered by `organizationId` inside the
vector query itself, and further by `corpus` so an HR assistant cannot
surface a supplier contract even within the same organization; `rag.query`
permission is required to call retrieval directly (as opposed to through a
narrower feature like WO-9.7's assistant, which carries its own scope).
**The threshold nobody approves alone** — n/a: no money or stock committed;
the closest analogue is the cost budget below, which is a hard stop, not an
approval.
**The toxic pair** — n/a.
**Authority and blast radius** — who may register a new `DocumentCorpus`
source class or change which corpora an assistant may query (org-wide
admin); the worst value is a knowledge-base assistant accidentally scoped
to `EMPLOYEE_DOCUMENTS`, which the corpus enum makes a one-line, reviewable
config rather than a query someone forgot to filter.
**Audience is a capability, not an address** — n/a: this module answers
queries, it does not push notifications.
**Request or record** — a query is a REQUEST (refused if the caller lacks
`rag.query` or the scope's corpus); an ingestion is effectively a RECORD
once a document exists to be indexed — ingestion does not get to disagree
that the PDF is there, only whether it could be parsed (failure path,
below).
**The movement with no address** — n/a: no stock or cash movement.
**Four hours down, the counter stays open** — n/a for this module
specifically (it is a read-augmentation layer, not a system of record); if
the AI provider or vector store is unreachable, retrieval degrades to
"unavailable, try again" or to the pre-AI fallback (keyword search over
`DocumentSource.originalName`), never blocking whatever workflow asked the
question.
**Click the number** — restated from §5: every generated answer carries the
source documents and page ranges it was generated from, clickable through
to `StorageService`'s own file view.
**The unwritten posting rule / Every column or none / The period that
already moved** — n/a: posts no `JournalLine`.
**The second legal entity** — `DocumentSource`/`DocumentChunk` scoped per
`organizationId`; a second legal entity's documents are never in the same
partition, retrievable or otherwise.
**Dry run before live** — `retrieve()` itself is the preview: an admin
screen can run a query against a corpus and see the retrieved chunks with
no generation step, useful for tuning chunk size/overlap before trusting
the assistant's answers.
**Three silhouettes, extended with the platform tier named above** — Solo:
no RAG, or a handful of policy documents in `KNOWLEDGE_BASE`, `pgvector`
never stressed. Chain: doc 28's vault plus supplier catalogs across
branches, still comfortably `pgvector`. Organization: potentially the
50-million-row/300ms trigger above, still a driver swap, not a rewrite.
Platform (named, not built): the cross-tenant hosted case — out of scope
for this document, and would need its own scope-lens pass on isolation
before a single line of that variant is written.
**The absent collaborator** — with no `AiProvider` configured, this entire
module is invisible — no ingestion runs, no query button renders — exactly
`09-ai-layer.md`'s own rule, restated because it is the correct behavior
here too, not a new one.
**The second copy of the write** — re-ingesting a `DocumentSource` replaces
its chunks in one transaction (delete-then-insert), so a redelivered
ingestion job never leaves duplicate chunks answering the same question
twice with stale and current content both retrievable.
**The hundred-thousandth row — restated at the row count this document is
actually about.** `DocumentChunk` is the volume driver named throughout:
indexed by `[organizationId, sourceId]` for management queries, and by the
vector index itself (HNSW, partitioned per organization) for retrieval;
the 50-million-row escalation trigger above is this lens's own answer,
made explicit rather than left implicit the way it is in every other
document in this set.
**The reversal document** — n/a: a query is not reversed; a wrongly-
ingested document is corrected by re-ingestion (§3), and a document that
should never have been indexed is removed via `DocumentSource` deletion,
cascading its chunks — never a soft "hide it and hope."
**The undo fan-out** — deleting a `DocumentSource` removes its chunks
(automatic, `onDelete: Cascade`) but does not retroactively correct an
answer already given to a user in a past conversation (deliberately
irreversible — that answer's citation is now a broken link, surfaced as
such, never silently rewritten).
**The version stamp** — a generated answer's citations name the
`DocumentSource`/page range as of the query, not a live pointer; if the
source is later re-ingested with different content, past citations still
resolve to what was actually cited, via the file's own version if
`StorageService` keeps one, or are marked "source since updated" if not.
**The erasure the ledger cannot obey** — a `DocumentSource` in
`EMPLOYEE_DOCUMENTS` inherits doc 28's own retention basis exactly (its
`EmployeeDocument` row is the source of truth for whether it may be
erased); `BUSINESS_DOCUMENTS` inherits whatever record it documents
(an invoice's own retention rule); erasing a source document deletes its
`DocumentChunk` rows in the same transaction, so an erased PDF never
survives as retrievable text in the index after the file itself is gone.
**The failure path** — an extraction failure (corrupted PDF, OCR
timeout) sets `status = FAILED` with `failureReason`, visible on an admin
ingestion-queue screen with a manual retry; an `AiProvider` outage during
embedding leaves the document `QUEUED` for the next cron pass, never half-
indexed with some chunks embedded and others silently missing.

## Cost and latency, restated for this module specifically

`09-ai-layer.md`'s three constraints, applied here:

- **Cost.** Embedding millions of chunks is the expensive step, not
  generation — batch it, log token cost per ingestion job against the same
  monthly-budget setting `09-ai-layer.md` already requires, and stop
  ingesting (queue, don't drop) when the budget is hit.
- **Latency.** Retrieval must be fast enough to sit inside a request a
  human is waiting on (unlike ingestion) — this is the entire reason for
  the indexed, scoped vector query in §4 and the escalation trigger in §2,
  rather than a linear scan that gets slower with every document ever
  ingested.
- **Failure.** An `AiProvider` or `VectorStore` outage degrades retrieval
  to unavailable or to keyword-only search over document titles — it never
  takes down whatever screen or assistant asked the question, exactly as
  `09-ai-layer.md` already requires for every other AI feature.

## Work orders

**WO-35.1 — schema**: `DocumentSource`, `DocumentChunk` with the `pgvector`
column, partitioned/indexed per `organizationId`.
**WO-35.2 — ingestion pipeline**: extraction (+ OCR fallback), page-aware
chunking, batched `AiProvider.embed()`, idempotent re-ingestion.
**WO-35.3 — `VectorStore` interface** + `PgVectorStore` implementation,
built to the interface from day one even though only one implementation
exists, so WO-35.7's escalation is a registration change.
**WO-35.4 — scoped retrieval**: `retrieve()` with `organizationId`/`corpus`
as an index-level predicate, never a post-filter.
**WO-35.5 — generation + citations**: `AiProvider.complete()` wired with
retrieved context, every answer carrying its source/page citations.
**WO-35.6 — permissions**: `rag.ingest.manage` (corpus/source
administration), `rag.query` (direct retrieval access, distinct from a
narrower feature like WO-9.7 that carries its own scope).
**WO-35.7 — escalation path (deferred until the trigger fires)**: a second
`VectorStore` implementation against a dedicated vector service, swapped in
by configuration once the 50-million-row/300ms threshold is actually
crossed — not built speculatively ahead of it.

## Acceptance

- A query scoped to organization A never returns a chunk whose
  `DocumentSource.organizationId` is B — proven by a spec that seeds both
  and asserts on the boundary, the same isolation proof `16-pbac-row-
  scoping.md` already requires elsewhere.
- Re-ingesting a document replaces its chunks with no duplicates and no
  stale survivors.
- Every generated answer includes at least one citation resolvable back to
  a real `DocumentSource`.
- With no `AiProvider` configured, the ingestion queue never starts and no
  query UI renders — pack-absence behavior identical to every other AI
  feature in `09-ai-layer.md`.
- A forced `AiProvider`/`VectorStore` failure during retrieval degrades to
  the stated fallback and never 500s the calling screen.

## Out of scope

The cross-tenant "platform" hosting tier named in the scoping section above
— a real architectural decision with its own isolation lenses, not assumed
or partially built here. Fine-tuning or training a custom embedding model
(this document uses `AiProvider.embed()`'s existing provider-hosted
models, unchanged). Real-time collaborative document editing or annotation
— this is a read-and-cite retrieval system, not a document workspace.
Non-PDF source types (Word, HTML, scanned images with no OCR layer) —
named as a natural extension of the same `DocumentSource`/ingestion
pipeline, not a different design, but not built until a real corpus needs
it.
