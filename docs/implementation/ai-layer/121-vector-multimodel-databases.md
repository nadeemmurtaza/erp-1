# 121 — Vector databases: already doc 35's own extension point

"Run vector databases alongside standard relational ledgers to natively
store unstructured data embeddings, preparing the infrastructure to
immediately ingest future generative AI agents or predictive models" is
doc 35's own `VectorStore` extension point
(`35-scalable-rag-document-retrieval.md`), already cited repeatedly across
this session (doc 36's own table lists it alongside `PaymentProvider`/
`StorageDriver`/`AiProvider` as one of the "typed provider interface"
shapes this repository already independently arrived at). "Alongside
standard relational ledgers" is doc 35's own stated design already —
a vector store is a *specialized secondary store for one workload*
(semantic search/retrieval), never a replacement for Postgres as the
system of record, exactly the "financial ledgers isolated and secure"
half of doc 110's own CQRS bullet, restated here for embeddings instead
of read-projections.

## What already exists

- **`VectorStore`** (doc 35) — a typed interface, one implementation per
  vector database vendor (or a Postgres `pgvector` implementation, kept
  in the *same* database if a client's scale does not yet justify a
  separate specialized store — doc 35's own design does not force a
  second database to exist before it is needed).
- **Registered, never hardcoded** — exactly `PaymentProvider`/
  `StorageDriver`'s own pattern: a deployment with no `VectorStore`
  implementation registered simply has no RAG/semantic-search capability,
  a correct, silent absence per this repository's own absent-collaborator
  discipline, never an error.

## Scope lenses

Not repeated — doc 35's own scope lenses already answer every lens for
this exact mechanism.

## Work orders

None beyond doc 35's own already-specified work. A specific vector
database vendor (or `pgvector`, for a smaller deployment) is chosen and
implemented against the existing `VectorStore` interface once a real RAG
or semantic-search requirement names it.

## Acceptance

- No schema or code change — verified by citation to doc 35's existing
  `VectorStore` extension point.

## Out of scope

Nothing further — this domain has no remaining gap; this note exists so
this batch's own "AI & Data Readiness" heading has a citable answer.
