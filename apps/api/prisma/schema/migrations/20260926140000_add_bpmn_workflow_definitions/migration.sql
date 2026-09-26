-- A BPMN visual workflow engine, built by explicit owner override
-- (ADR-026). architecture-patterns/142-bpmn-visual-workflow-engine.md
-- (WO-142.3), DECISIONS.md ADR-049.
--
-- Hand-written, forward-only (ADR-008). Purely additive. No organizationId
-- (ADR-044/ADR-040): this deployment IS the tenant.

-- CreateTable
CREATE TABLE "BpmnWorkflowDefinition" (
    "id" TEXT NOT NULL,
    "subjectType" "ApprovalSubjectType" NOT NULL,
    "diagramXml" TEXT NOT NULL,
    "compiledSteps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BpmnWorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BpmnWorkflowDefinition_subjectType_key" ON "BpmnWorkflowDefinition"("subjectType");
