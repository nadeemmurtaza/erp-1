import { Module } from '@nestjs/common';
import { RagAdminController } from './rag-admin.controller';
import { RagCorpusService } from './rag-corpus.service';
import { RagIngestionService } from './rag-ingestion.service';
import { RagIngestionCron } from './rag-ingestion.cron';
import { RagRetrievalService } from './rag-retrieval.service';
import { RagGenerationService } from './rag-generation.service';
import { PdfExtractionService } from './pdf-extraction.service';
import { PgVectorStore } from './pg-vector.store';
import { VECTOR_STORE } from './vector-store';

/**
 * WO-35 (docs/implementation/ai-layer/35-scalable-rag-document-retrieval.md).
 *
 * `VECTOR_STORE` is bound to `PgVectorStore` here — the one line WO-35.7's
 * escalation changes (a second class registered in its place) when the
 * doc's own named trigger (50M rows / 300ms p95) actually fires. Every
 * consumer in this module depends on the `VectorStore` interface
 * (`vector-store.ts`), never `PgVectorStore` directly.
 */
@Module({
  controllers: [RagAdminController],
  providers: [
    RagCorpusService,
    RagIngestionService,
    RagIngestionCron,
    RagRetrievalService,
    RagGenerationService,
    PdfExtractionService,
    { provide: VECTOR_STORE, useClass: PgVectorStore },
  ],
})
export class RagModule {}
