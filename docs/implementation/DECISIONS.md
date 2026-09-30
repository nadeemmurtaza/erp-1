# Architectural decisions

The log of significant technical decisions in this repository: what was
decided, what else was on the table, why this option won, and what it costs.

`CLAUDE.md` requires a decision of this weight to be recorded here, and three
things in the repository already point at this file — the Observable row of the
five pillars, the load-balancer note, and the `architect` subagent's own
instructions. It exists so that a settled decision is not relitigated every time
a new person or a new agent meets it, and so that the ones still genuinely open
are visible as open rather than quietly assumed.

## How to read this

Every entry uses the template in `CLAUDE.md` — Context, Options Considered,
Decision, Reasoning, Consequences, Status.

**Entries are a record, not a substitute for the documents of record.** Where an
entry has a long-form home — `ENTERPRISE-SCALE.md`, `MULTI-SECTOR.md`,
`RETAIL-ERP.md`, `00-HOUSE-RULES.md` — it links there and does not restate it.
If this file and a document of record ever disagree, the document wins and this
entry is stale.

**On provenance.** ADR-001 to ADR-013 were decided before this file existed and
are recorded here retrospectively, reconstructed from the documents and code
comments that already carried them; each cites its source so the reasoning can
be checked rather than taken on trust. Where those sources name the alternatives
that were rejected, the Options section reports them; where they do not, it
describes the design space that was actually available and says so. ADR-014 to
ADR-016 were decided in the work that created this file. ADR-017 and ADR-018 are
open — `CLAUDE.md` defers both here explicitly and forbids assuming either into
existence.

**Adding one.** Create `decisions/ADR-NNN-short-title.md` with the next number
and add one row to the table below. Do not renumber, and do not edit a decided
entry to reflect a change of mind — supersede it with a new entry and set the
old one's status to `Superseded by ADR-NNN`, so the history of the thinking
survives. Each entry is its own file so it can be read, linked and reviewed alone.

| # | Decision | Status |
|---|---|---|
| [ADR-001](./decisions/ADR-001-a-modular-monolith-one-process-per-node.md) | A modular monolith, one process per node | Accepted. |
| [ADR-002](./decisions/ADR-002-a-sector-is-a-module-pack-behind-an-allowlist.md) | A sector is a module pack behind an allowlist | Accepted. |
| [ADR-003](./decisions/ADR-003-modules-are-independent-side-effects-cross-through-events.md) | Modules are independent; side effects cross through events | Accepted. |
| [ADR-004](./decisions/ADR-004-events-are-delivered-through-a-transactional-outbox.md) | Events are delivered through a transactional outbox | Accepted. |
| [ADR-005](./decisions/ADR-005-money-is-an-integer-in-minor-units.md) | Money is an integer in minor units | Accepted. |
| [ADR-006](./decisions/ADR-006-customer-facing-text-is-a-row-not-a-column.md) | Customer-facing text is a row, not a column | Accepted. |
| [ADR-007](./decisions/ADR-007-access-control-is-permission-based-and-the-grants-are-data.md) | Access control is permission-based, and the grants are data | Accepted. |
| [ADR-008](./decisions/ADR-008-migrations-are-hand-written-and-forward-only.md) | Migrations are hand-written and forward-only | Accepted. |
| [ADR-009](./decisions/ADR-009-a-branch-is-a-node-with-its-own-database-not-a-tenant-row.md) | A branch is a node with its own database, not a tenant row | Accepted. |
| [ADR-010](./decisions/ADR-010-in-transit-stock-is-a-location-not-a-flag.md) | In-transit stock is a Location, not a flag | Accepted. |
| [ADR-011](./decisions/ADR-011-a-till-sale-is-a-channel-of-orders.md) | A till sale is a channel of `orders` | Accepted. |
| [ADR-012](./decisions/ADR-012-cross-module-references-are-bare-scalars-not-foreign-keys.md) | Cross-module references are bare scalars, not foreign keys | Accepted. |
| [ADR-013](./decisions/ADR-013-one-deployment-serves-one-brand.md) | One deployment serves one brand | Accepted. |
| [ADR-014](./decisions/ADR-014-the-repository-index-is-generated-and-enforced-not-written.md) | The repository index is generated and enforced, not written | Accepted. |
| [ADR-015](./decisions/ADR-015-model-and-effort-are-routed-per-job-from-one-policy.md) | Model and effort are routed per job, from one policy | Accepted. |
| [ADR-016](./decisions/ADR-016-rules-that-apply-to-one-kind-of-file-are-path-scoped.md) | Rules that apply to one kind of file are path-scoped | Accepted. |
| [ADR-017](./decisions/ADR-017-an-observability-backend.md) | An observability backend | **Open.** Needs an owner and the operating inputs above. |
| [ADR-018](./decisions/ADR-018-horizontal-replicas-and-load-balancing.md) | Horizontal replicas and load balancing | **Open.** Triggered by the first node that needs horizontal replicas. |
| [ADR-019](./decisions/ADR-019-wo-b-4-ships-against-the-live-reports-idiom-not-track-a-s-unbuilt.md) | WO-B.4 ships against the live reports idiom, not Track A's unbuilt registry | **Accepted.** |
| [ADR-020](./decisions/ADR-020-bom-track-c-ships-as-a-new-module-production-stays-as-is.md) | `bom` (Track C) ships as a new module, `production` stays as-is | **Accepted.** |
| [ADR-021](./decisions/ADR-021-wo-23-3-s-scopelevel-pattern-a-new-core-owned-enum-fail-closed-on-the.md) | WO-23.3's scopeLevel pattern: a new core-owned enum, fail-closed on the money switch, and originNodeId as the… | **Accepted.** |
| [ADR-022](./decisions/ADR-022-wo-23-3b-enforces-allowbranchlocalpurchasing-through-a-new.md) | WO-23.3b enforces `allowBranchLocalPurchasing` through a new BranchPolicyRegistry extension point, keyed off the… | **Accepted.** |
| [ADR-023](./decisions/ADR-023-wo-23-3c-e-node-retailbrandid-a-separate-policyquarantine-table-and.md) | WO-23.3c/e: Node.retailBrandId, a separate PolicyQuarantine table, and apply() drawing exactly one distinction per… | **Accepted.** |
| [ADR-024](./decisions/ADR-024-wo-23-3d-org-central-purchasing-recognized-narrowly-in.md) | WO-23.3d: org-central purchasing recognized narrowly in `resolveTransferSettlement()`; landed cost snapshotted at… | **Accepted.** |
| [ADR-025](./decisions/ADR-025-wo-e-2-is-not-executed-its-own-prerequisites-wo-a-1-wo-a-2-were-never.md) | WO-E.2 is not executed: its own prerequisites (WO-A.1, WO-A.2) were never built, and building them now would be the… | **Accepted.** |
| — | [doc 22's leave schema is struck in favour of payroll's (WO-19.3)](./decisions/unnumbered-doc-22-s-leave-schema-is-struck-in-favour-of-payroll-s-wo-19-3.md) | **Accepted.** |
| — | [adopt a shared cross-tenant hosting tier via shared-infrastructure/isolated-data, not shared-schema multi-tenancy](./decisions/unnumbered-adopt-a-shared-cross-tenant-hosting-tier-via-shared-infrastructure.md) | **Accepted.** |
| [ADR-026](./decisions/ADR-026-seven-heavier-extensibility-mechanisms-adopted-by-explicit-owner.md) | Seven heavier extensibility mechanisms adopted by explicit owner override: EAV, a metadata-rendering engine, BPMN,… | **Accepted for docs 140–143 (EAV, metadata-UI engine, BPMN, micro- |
| [ADR-027](./decisions/ADR-027-the-three-highest-risk-items-from-adr-026-withdrawn-no-wasm-sandbox.md) | The three highest-risk items from ADR-026 withdrawn: no WASM sandbox, no service mesh, no dedicated crypto microservice | **Accepted.** |
| [ADR-028](./decisions/ADR-028-wo-5-phase-5-discounts-promo-codes-gift-cards-store-credit-built-from.md) | WO-5 (Phase 5: discounts, promo codes, gift cards, store credit) built from zero — permission split, checkout… | **Accepted.** |
| [ADR-029](./decisions/ADR-029-third-party-gift-card-redemption-at-checkout-giftkarta-a.md) | Third-party gift-card redemption at checkout (Giftkarta): a `PaymentProvider`, not a WO-5 tender field; code… | **Accepted.** |
| [ADR-030](./decisions/ADR-030-docs-implementation-docs-erp-lenses-and-docs-design-reorganized-into.md) | `docs/implementation/`, `docs/erp-lenses/` and `docs/design/` reorganized into domain subfolders, filenames unchanged | **Accepted.** |
| [ADR-031](./decisions/ADR-031-wo-7-phase-7-customer-portal-reviews-wishlist-returns-loyalty-mobile.md) | WO-7 (Phase 7: customer portal, reviews, wishlist, returns, loyalty, mobile parity) built against a missing Phase 6… | **Accepted.** |
| [ADR-032](./decisions/ADR-032-phase-10-track-a-built-end-to-end-wo-a-1-a-5-superseding-adr-019-adr.md) | Phase 10 Track A built end-to-end (WO-A.1–A.5), superseding ADR-019/ADR-025; Tracks D and B wired into the registry;… | **Accepted.** |
| [ADR-033](./decisions/ADR-033-admin-platform-docs-02-44-72-75-completed-doc-75-s-own-claims.md) | `admin-platform` docs 02/44/72/75 completed; doc 75's own claims corrected after they were found false against the… | **Accepted.** |
| [ADR-034](./decisions/ADR-034-the-wallet-module-doc-155-built-in-full-shipped-module-off-and.md) | The wallet module (doc 155) built in full, shipped module-off and checkout-disconnected pending WO-155.0's own legal… | **Accepted, pending legal review before enablement.** WO-155.0 is… |
| [ADR-036](./decisions/ADR-036-wo-145-receivables-creditnote-debitnote-credit-limits-dunning-keys.md) | WO-145 (receivables: CreditNote/DebitNote, credit limits, dunning) keys the customer to `Contact`, not R18's own… | **Accepted.** |
| [ADR-035](./decisions/ADR-035-phase-8-content-marketing-and-search-audited-and-confirmed-built-the.md) | Phase 8 (content, marketing and search) audited and confirmed built; the ranking rule's missing availability tier… | **Accepted.** |
| [ADR-037](./decisions/ADR-037-personal-api-keys-a-user-bound-token-capped-live-by-its-owner-an.md) | Personal API keys: a user-bound token capped live by its owner, an explicit non-delegatable list, and no service… | **Accepted.** Service accounts: **deferred** — reopen by… |
| [ADR-038](./decisions/ADR-038-doc-153-usage-based-pricing-metering-reads-a-tenant-s-own.md) | Doc 153 (usage-based pricing): metering reads a tenant's own transactional outbox through `apps/platform`'s existing… | **Accepted.** |
| [ADR-040](./decisions/ADR-040-finance-accounting-docs-04-56-68-79-137-147-151-49-completed-a.md) | `finance-accounting` docs 04/56/68/79/137/147/151/49 completed; a department-permission planning doc (164) added,… | **Accepted.** |
| [ADR-039](./decisions/ADR-039-doc-14-managed-services-built-in-full-overriding-its-own-not-now.md) | Doc 14 (managed services) built in full, overriding its own "not now": `PlatformTenant`/`PlatformInvoice` extended… | **Accepted.** |
| [ADR-041](./decisions/ADR-041-an-intentrouter-core-extension-point-one-dispatch-shape-for-every.md) | An `IntentRouter` core extension point: one dispatch shape for every future calling modality, proven against one… | **Accepted.** WO-135.2 and WO-135.3: **deferred**, exactly as doc… |
| [ADR-042](./decisions/ADR-042-doc-154-three-headline-commercial-plans-public-pricing-page-copy.md) | Doc 154 (three headline commercial plans): public pricing-page copy lives as four columns on `PlatformPlan` itself,… | **Accepted.** |
| [ADR-043](./decisions/ADR-043-access-control-identity-docs-126-161-built-16-18-163-re-verified-125.md) | `access-control-identity` docs 126/161 built; 16/18/163 re-verified; 125 corrected; 21 reported blocked on missing… | **Accepted.** |
| [ADR-044](./decisions/ADR-044-docs-19-20-org-tree-positions-and-ranks-orgunit-kept-orthogonal-to.md) | Docs 19/20 (org tree, positions and ranks): `OrgUnit` kept orthogonal to `Node` exactly as specified; no separate… | **Accepted.** |
| [ADR-045](./decisions/ADR-045-doc-21-access-over-the-org-tree-orgunitgrant-built-exactly-as.md) | Doc 21 (access over the org tree): `OrgUnitGrant` built exactly as specified; `MAX_GRANT_DAYS` as a plain Setting,… | **Accepted.** |
| [ADR-046](./decisions/ADR-046-doc-22-attendance-shifts-and-leave-attendanceevent-partitioned-by.md) | Doc 22 (attendance, shifts and leave): `AttendanceEvent` partitioned by month exactly as specified;… | **Accepted.** |
| [ADR-050](./decisions/ADR-050-doc-23-task-allotment-status-and-tracking-built-exactly-as-specified.md) | Doc 23 (task allotment, status and tracking): built exactly as specified, with `Employee` translated to `User` per… | **Accepted.** |
| [ADR-047](./decisions/ADR-047-doc-165-cross-tenant-marketplace-directory-a-new-apps-platform-module.md) | Doc 165 (cross-tenant marketplace directory): a new `apps/platform` module, not a shared `Product` table; the… | **Accepted.** |
| [ADR-048](./decisions/ADR-048-doc-166-unified-product-reference-registry-a-globalproductreference.md) | Doc 166 (unified product reference registry): a `GlobalProductReference` keyed by barcode in the same platform… | **Accepted.** |
| [ADR-049](./decisions/ADR-049-docs-140-143-general-eav-metadata-driven-ui-bpmn-workflow-editor.md) | Docs 140–143 (general EAV, metadata-driven UI, BPMN workflow editor, micro-frontend fragments): the four mechanisms… | See entry |
| [ADR-051](./decisions/ADR-051-docs-47-146-150-category-presets-wholesale-pricing-product-bundles.md) | Docs 47, 146, 150 (category presets, wholesale pricing, product bundles): three independently-scoped… | **Accepted.** |
| [ADR-052](./decisions/ADR-052-docs-127-128-136-hardcoded-policy-sweep-extension-point-coverage.md) | Docs 127/128/136 (hardcoded-policy sweep, extension-point coverage audit, database/cache portability audit): two… | **Accepted.** |
| [ADR-053](./decisions/ADR-053-doc-149-accounts-approvals-sector-packs-a-genuine-request-record.md) | Doc 149 (`accounts`/`approvals` sector packs): a genuine REQUEST/RECORD split (`B2BOrderRequest`) rather than gating… | **Accepted.** |
| [ADR-054](./decisions/ADR-054-doc-139-websocket-sse-gateway-verified-deliberately-left-unbuilt-doc.md) | Doc 139 (WebSocket/SSE gateway) verified, deliberately left unbuilt; doc 157 (client `Idempotency-Key`) built, with… | **Accepted.** |
| [ADR-055](./decisions/ADR-055-doc-117-choreography-and-idempotency-and-doc-118-headless-composable.md) | Doc 117 (choreography and idempotency) and doc 118 (headless, composable, agent-consumable capabilities): both… | **Accepted.** |
| [ADR-056](./decisions/ADR-056-docs-122-data-lake-130-capability-manifest-and-131-versioned-domain.md) | Docs 122 (data lake), 130 (capability manifest) and 131 (versioned domain events): one more fabricated citation, one… | **Accepted.** |
| [ADR-057](./decisions/ADR-057-docs-133-dry-run-harness-134-hexagonal-purity-ci-check-and-138.md) | Docs 133 (dry-run harness), 134 (hexagonal-purity CI check) and 138 (technology substitution playbook): a naming… | **Accepted.** |
| [ADR-058](./decisions/ADR-058-doc-165-cross-tenant-marketplace-directory-part-two-wo-165-1-165-2.md) | Doc 165 (cross-tenant marketplace directory), part two: WO-165.1/165.2/165.6 built; WO-165.3/165.4/165.5 deferred… | **Accepted.** |
| [ADR-059](./decisions/ADR-059-doc-166-unified-product-reference-registry-the-erp-1-side-pieces.md) | Doc 166 (unified product reference registry), the erp-1-side pieces: `adopt()`/`apply()` split instead of one… | **Accepted.** |
| [ADR-060](./decisions/ADR-060-doc-24-internal-notifications-meetings-and-escalation-built-in-full.md) | Doc 24 (internal notifications, meetings and escalation): built in full, with one new model beyond its own sketch… | **Accepted.** |
| [ADR-061](./decisions/ADR-061-docs-47-and-150-category-presets-product-bundles-the-missing-admin-ui.md) | Docs 47 and 150 (category presets, product bundles), the missing admin UI: "start from a template" and the… | **Accepted.** |
| [ADR-062](./decisions/ADR-062-doc-61-policy-communications-bulletin-board-built-inside-the-notify.md) | Doc 61 (policy communications bulletin board): built inside the `notify` module rather than `hr`, an author-side… | **Accepted.** |
| [ADR-063](./decisions/ADR-063-doc-167-bank-facility-management-promoted-from-a-gap-report-to-a.md) | Doc 167 (bank facility management): promoted from a gap report to a built capability, mirroring doc 49's own… | **Accepted.** |
| [ADR-064](./decisions/ADR-064-doc-64-in-app-help-desk-built-as-a-new-standalone-module-with-a-per.md) | Doc 64 (in-app help desk): built as a new standalone module, with a per-instance transition-authority rule and a… | **Accepted.** |
| [ADR-065](./decisions/ADR-065-doc-148-external-customer-support-portal-built-as-a-second-contact.md) | Doc 148 (external customer support portal): built as a second, `Contact`-keyed model alongside doc 64's own… | **Accepted.** |
| [ADR-066](./decisions/ADR-066-doc-144-r20-r26-supply-chain-resilience-planning-engine-built-as-a.md) | Doc 144 (R20–R26 supply-chain resilience planning engine): built as a pure read/recommendation engine, generating… | **Accepted.** |
| [ADR-067](./decisions/ADR-067-docs-31-66-67-76-pos-hardware-category-the-till-hardware-layer-as.md) | Docs 31/66/67/76 (`pos-hardware/` category): the till hardware layer as extension points, ad-hoc modifiers over a… | **Accepted.** |
| [ADR-068](./decisions/ADR-068-doc-37-scalability-future-upgrades-the-versioning-policy-ships-inert.md) | Doc 37 (scalability future upgrades): the versioning policy ships inert, `FeatureFlag` gains two fields its own… | **Accepted.** |
| [ADR-069](./decisions/ADR-069-docs-32-71-158-lots-serials-traceability-the-move-call-site-scoping.md) | Docs 32/71/158 (`lots-serials-traceability/`): the `move()` call-site scoping boundary, a doc-158 internal… | **Accepted.** |
| [ADR-070](./decisions/ADR-070-doc-38-resilience-engineering-a-table-driven-contract-test-over-the.md) | Doc 38 (resilience engineering): a table-driven contract test over the real source tree instead of 69 hand-written… | See entry |
| [ADR-071](./decisions/ADR-071-docs-168-183-a-composable-resilience-first-sme-platform-for-du-built.md) | Docs 168–183 (a composable, resilience-first SME platform for du): built inside erp-1 as new core-classified modules… | **Superseded by ADR-072.** |
| [ADR-072](./decisions/ADR-072-docs-168-183-revised-newax-s-own-product-not-a-du-owned-platform-du.md) | Docs 168–183 revised: NEWAX's own product, not a du-owned platform — du was a quality-bar reference only, never a… | **Accepted.** |
| [ADR-073](./decisions/ADR-073-third-party-apps-docs-184-195-an-open-reviewed-directory-of-remote.md) | Third-party apps (docs 184–195): an open, reviewed directory of remote services — never in-process code — installed… | **Accepted** — the architecture and the remote-only rule. Every… |
| [ADR-074](./decisions/ADR-074-doc-205-video-rooms-for-doc-24-s-meetings-self-host-livekit-as-newax.md) | Doc 205 (video rooms for doc 24's meetings): self-host LiveKit as NEWAX's own SFU behind a new… | **Accepted** — the engine, the seam and the deployment decision.… |
| [ADR-075](./decisions/ADR-075-doc-206-rate-limiting-sudden-logout-ram-ceilings-connection-pooling.md) | Doc 206 (rate limiting, sudden-logout, RAM ceilings, connection pooling, API caching, lazy loading, compression):… | **Accepted.** |
| [ADR-076](./decisions/ADR-076-doc-207-checkout-admission-queue-prevent-overselling-during-rush.md) | Doc 207 (checkout admission queue): "prevent overselling during rush hours" corrected — overselling is already… | **Accepted.** |
| [ADR-077](./decisions/ADR-077-doc-208-l1-l2-l3-caching-each-tier-attached-to-a-found-hot-path-not.md) | Doc 208 (L1/L2/L3 caching): each tier attached to a found hot path, not applied blindly — permission resolution's… | **Accepted.** |
| [ADR-078](./decisions/ADR-078-doc-209-semantic-caching-applied-to-exactly-one-of-ten-aifeature-call.md) | Doc 209 (semantic caching): applied to exactly one of ten AiFeature call sites — RAG_GENERATION, the only one where… | **Accepted.** |
| [ADR-079](./decisions/ADR-079-doc-210-caching-third-party-api-calls-to-save-charges-checked-every.md) | Doc 210: caching third-party API calls to save charges — checked every real integration in this codebase and found… | **Accepted.** |
| [ADR-080](./decisions/ADR-080-doc-211-cloud-subscription-and-offline-license-locked-to-strictly.md) | Doc 211: cloud (subscription) and offline (license) locked to strictly separate… | **Accepted.** |
| [ADR-081](./decisions/ADR-081-doc-212-role-permission-scope-enforcement-confirmed-as-a-live.md) | Doc 212: role/permission scope enforcement confirmed as a live adoption gap, not a hypothetical — `AdminScope` has… | **Accepted.** |
| [ADR-082](./decisions/ADR-082-doc-48-native-desktop-deployment-wo-48-1-48-3-48-4-48-5-built-as-real.md) | Doc 48 (native desktop deployment): WO-48.1/48.3/48.4/48.5 built as real code in a new `packages/desktop-runtime`;… | **Accepted.** |
