# 32g generate automation and ai surface

Output of the `gen:32:automation-and-ai-surface` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

What the feature exposes to automation

## File

docs/erp-lenses/automation-and-ai-surface/32-automation-and-ai-surface.md

## Lenses

### The machine caller's own scope

**Question:** For this feature's non-human caller (service account, scheduled job, or connected partner's key), which exact PermissionKey values does it carry, and where in the request path is that list checked?

**Grounding:** apps/api/src/modules/tradingpartners/trading-partner-portal.controller.ts (every route @Public(), verifies via verifyInboundKey in trading-partners.service.ts:137); PosTerminal.deviceKeyHash and Node.inboundApiKeyHash as two more independent hash-a-key patterns; packages/shared/src/permissions.ts PermissionKey catalogue; decorators.ts RequirePermission/PermissionsGuard never invoked on the machine-caller path.

### Quota has no owner

**Question:** For this feature's API, webhook or bulk endpoint, what is the per-caller request or row quota, where is it configured, and what happens to the request that exceeds it?

**Grounding:** apps/api/src/main.ts (no ThrottlerModule, no rate-limit decorator anywhere, verified by grep); TradingPartnerPortalController.stock (trading-partner-portal.controller.ts:20) accepting an unbounded comma-separated skus list on a @Public() route; outbox.dispatcher.ts BATCH_SIZE=25 / 2000ms poll as an internal-only precedent; core.prisma:153 Setting has no per-caller quota column.

### Narrate, never post

**Question:** If this feature calls a generative model, name the exact downstream write (a JournalLine amount, ProductVariant.costPrice, a PurchaseOrder quantity, a permission grant) the model's output must never reach directly, and which existing deterministic function still owns that number or decision.

**Grounding:** AccountingService.postEntry() as the sole journal writer, called only by PostingRulesSubscriber and FiscalPeriodsService.closeFiscalYear(); weightedAverageCost() in purchasing.service.ts:386 as the sole cost formula; confirmed by grep that no AI/model/draft field exists anywhere in the prisma schema or packages/shared/src/permissions.ts; JournalEntry has no postedByUserId and posts instantly with no maker-checker.

## Absences

- No shared service-account/API-key principal: TradingPartner, PosTerminal and Node each hash their own credential independently with no PermissionKey scoping
- No rate limiting or per-caller quota mechanism anywhere in apps/api (no ThrottlerModule, no @Throttle, no quota column on any model)
- No generic webhook/subscribable-event model: outbound partner delivery is hand-coded per document type; DomainEvent delivery is in-process EventEmitter2 only
- No AI/model integration, draft field, or human-confirmation-of-model-output pattern exists anywhere in the schema or packages/shared today

