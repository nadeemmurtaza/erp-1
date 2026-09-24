# Product Requirements Document

The one document of the six requested that did not already exist under a
different name. Built from what this repository's own documents of record
already establish — cited throughout, not re-derived — with the one
section that genuinely has no answer yet (Success Metrics) named as an
open item rather than invented.

## Vision

A single, multi-sector commerce and business-management platform that
serves a shop with one till today and a group running a hundred branches
across several brands tomorrow, without a rewrite in between. The
platform started as a clothing-and-stitching store's own system
(`docs/implementation/README.md`'s own framing) and generalized into a
**universal commerce core** — inventory, purchasing, orders, payments,
shipping, finance, HR/payroll, analytics — plus **sector packs** that add
what one vertical needs (apparel's `measurements`/`stitching`; a future
grocery pack's `batches`; a future pharmacy pack's `prescriptions`) without
ever touching the core (`MULTI-SECTOR.md`).

## Problem statement

A small or mid-sized business today typically runs on some mix of: a
generic POS with no real inventory costing, a spreadsheet for purchasing,
a separate payroll process, no real multi-branch visibility, and no path
to add e-commerce, B2B trading, or a second brand without changing
software entirely. This platform's own standing instruction (`CLAUDE.md`'s
"Feature scope: build the whole capability") is that a feature named
narrowly — "a cart," "payroll," "a wallet" — is not done until it can
actually carry a real transaction through: the operator side, the
after-"done" half (returns, disputes, reversals), the real integrations a
business needs (not a status enum standing in for a payment gateway), and
the policy layer that governs it.

## Target users

Established across the actor-focused documents this whole set requires
("The actor with three tables," `CLAUDE.md`'s own scope lens) rather than
assumed:

| Actor | What they need from this platform |
|---|---|
| **Solo shop owner** | Everything, running as simply as a single-till system, with the complexity of the platform underneath never visible (Law 2/3) |
| **Chain/Organization admin** | Cross-branch visibility, org/brand/branch-scoped permissions, consolidated finance, without losing any one branch's own operational autonomy |
| **Branch staff / POS cashier** | A fast till, offline-tolerant, with no dead ends and a permission model that shows them only what their role and branch allow |
| **HR / payroll admin** | Attendance, leave, payroll, org structure, without a second, disconnected HR system |
| **Warehouse / inventory staff** | Accurate stock, purchasing, transfers, cycle counts, serial/lot tracking where the sector needs it |
| **Customer** | A storefront and self-service portal — cart through checkout through return — that never stalls mid-transaction for a missing integration |
| **Trading partner** (supplier, distributor, wholesaler) | EDI-style document exchange without re-keying a PO as a sales order as an invoice at every hop (`docs/implementation/18-trading-partner-network.md`) |
| **Platform operator (Newax)** | Multi-tenant hosting, commercial licensing, usage metering, and the ability to serve every actor above without a bespoke build per client |

## Product pillars

The seven laws (`CLAUDE.md`) bind every surface — admin, storefront,
customer account, mobile, API — and are the test every other requirement
in this document is filtered through:

1. No hardcoding — every brand/locale/design value resolves through
   `packages/shared/src/brand.ts`.
2. Hide complexity in depth — power is moved, never removed.
3. It should feel like there are only a few features.
4. Seven screens, no dead space (280/380/640/768/1024/1280/1536).
5. One main job per page.
6. No clutter at all.
7. Overview first, detail on click.

Underneath those, the five engineering pillars (`CLAUDE.md`'s own table):
proper architecture (module packs, the three axes), scalable systems
(sector/brand/branch, pagination, indexing), secure by design (PBAC,
server-side-only enforcement), stable & reliable (the transactional
outbox, idempotent handlers, predicate-on-write), and observable
(structured logging, an audit trail) — each with its own honestly-stated
enforcement level, not claimed where it isn't real yet.

## Scope

**In scope**, and already either built or specified in
`docs/implementation/`: universal commerce (catalog, inventory, orders,
payments, shipping, promotions, finance), the apparel sector pack, HR/
payroll/org structure, multi-branch chain operation, B2B/EDI trading,
commercial licensing and usage-based billing, and the dynamic,
provider-agnostic connectivity layer for VoIP/SMS/WhatsApp/email,
marketplaces, accounting software, SSO, and file-based bank/payroll
exchange (docs 33, 36, 132, 159, 160, 161, 162).

**Explicitly out of scope**, decided and recorded rather than silently
assumed: a literal microservices mesh (doc 92), a generic no-code
rules engine (doc 95), a visual BPMN workflow designer (declined three
times — docs 63, 96, 107), more than one brand per deployment outside
the named shared-hosting exception (doc 39), and — reversed after the
owner's own reconsideration, recorded in `DECISIONS.md`'s ADR-027 — a
general WASM sandbox, a service mesh, and a dedicated crypto
microservice.

## Editions and commercial model

Three editions of the identical codebase — Solo, Chain, Organization
(`RETAIL-ERP.md` R14) — distinguished by which tier-bearing columns and
which node/replication topology are in play, never by a fork. Four
commercial `PricingModel` shapes exist (`docs/implementation/50-*.md`,
`153-*.md`): per-seat, flat-monthly, one-time-license, and usage-based
(a per-feature meter plus a percentage of gross sales). Three of those
are packaged as the customer-facing headline plans — Lifetime License,
Per Month, Pay As You Grow (doc 154) — with per-seat reachable as a
fourth option for the specific case it fits (doc 84's HR-only micro-SaaS).

## Current state

Most of `docs/implementation/`'s 160+ documents are specifications, not
yet built code — each says so plainly in its own status line. What is
confirmed built as of this document: the core commerce phases (1–10),
tax (15), PBAC row-scoping (16), identity verification (18), the
trading-partner network (18), payroll (19), and the admin-shell
components most recently completed. `docs/index/` is the generated,
always-current source of truth for exactly what exists in code today —
this document is not it, and should never be read as a substitute for it.

## Success metrics

**Not yet defined, and this document does not invent them.** No formal
KPI framework has been specified anywhere in this document set. Real
candidates exist in the data the platform already produces — active
`PlatformTenant` count per edition, module-pack adoption via the
`MODULES` allowlist, GMV flowing through doc 153's own usage-based fee
meter, plan mix across the three headline plans — but naming any of
these as *the* success metric is a product decision for the owner to
make, not one this document should make on their behalf. Flagged here
so it is visibly open rather than silently skipped.

## References

Every claim above traces to a cited document rather than this document's
own authority: `CLAUDE.md`, `docs/implementation/README.md`,
`MULTI-SECTOR.md`, `RETAIL-ERP.md`, `ENTERPRISE-SCALE.md`,
`DECISIONS.md`, and the individual numbered documents named inline.
