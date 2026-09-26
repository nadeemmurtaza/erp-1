-- WO-35, docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md.
-- Retrieval-augmented generation over a document corpus: DocumentSource,
-- DocumentChunk (pgvector, same 1536-dim space WO-9.5's ProductTranslation
-- already uses), and three new AiFeature values for cost/usage logging.
-- The `vector` extension itself was already created by the WO-9
-- (20260925050000_add_ai_layer) migration — not repeated here.

-- CreateEnum
CREATE TYPE "DocumentCorpus" AS ENUM ('EMPLOYEE_DOCUMENTS', 'SUPPLIER_CATALOG', 'BUSINESS_DOCUMENTS', 'KNOWLEDGE_BASE');

-- CreateEnum
CREATE TYPE "IngestStatus" AS ENUM ('QUEUED', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "AiFeature" ADD VALUE 'RAG_INGESTION';
ALTER TYPE "AiFeature" ADD VALUE 'RAG_RETRIEVAL';
ALTER TYPE "AiFeature" ADD VALUE 'RAG_GENERATION';

-- CreateTable
CREATE TABLE "DocumentSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "corpus" "DocumentCorpus" NOT NULL,
    "status" "IngestStatus" NOT NULL DEFAULT 'QUEUED',
    "pageCount" INTEGER,
    "ingestedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "uploadedById" TEXT,
    -- Security review M7 — set while this row is atomically claimed by an
    -- ingestion worker (QUEUED -> EXTRACTING); cleared on every exit. The
    -- cron reaper resets a claim older than STALE_CLAIM_MINUTES back to
    -- QUEUED.
    "claimedAt" TIMESTAMP(3),
    -- Security review M8 — consecutive embedding failures; backs off
    -- exponentially via "nextAttemptAt" and moves to FAILED past
    -- MAX_EMBED_ATTEMPTS instead of requeueing forever.
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "corpus" "DocumentCorpus" NOT NULL,
    "pageFrom" INTEGER NOT NULL,
    "pageTo" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentSource_organizationId_corpus_status_idx" ON "DocumentSource"("organizationId", "corpus", "status");

-- CreateIndex
CREATE INDEX "DocumentSource_status_idx" ON "DocumentSource"("status");

-- CreateIndex
CREATE INDEX "DocumentChunk_organizationId_corpus_sourceId_idx" ON "DocumentChunk"("organizationId", "corpus", "sourceId");

-- CreateIndex (L18, security review — the admin sources list's chunk-count
-- query reads by sourceId alone; the composite index above requires
-- organizationId/corpus too and does not serve it.)
CREATE INDEX "DocumentChunk_sourceId_idx" ON "DocumentChunk"("sourceId");

-- CreateIndex (WO-35 §2 — HNSW over ivfflat for the same reason WO-9.5 chose
-- it: no "lists" tuning, builds fine as chunks arrive incrementally rather
-- than needing representative data up front. One index over the whole
-- table, not a physical partition per organizationId — the doc's own
-- escalation trigger (50M rows / 300ms p95) is what would justify that, and
-- it has not fired; see rag.prisma's header comment.)
CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DocumentSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
