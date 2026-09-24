<!-- POINTER FILE — not the source of truth, never edited to add architecture. -->

# Architecture

This repository's architecture is documented across a small set of
documents of record, each owning a distinct layer. Nothing here
duplicates them — this file only says where each question is actually
answered.

| Question | Document |
|---|---|
| The shape of the whole system: modular monolith, module packs, the sector/brand/branch axes | [`CLAUDE.md`](./CLAUDE.md) — "Scale: the three axes" and "The five pillars, made concrete for this codebase" |
| How one codebase serves many sectors (clothing, grocery, pharmacy, …) without a branch per client | [`docs/implementation/MULTI-SECTOR.md`](./docs/implementation/MULTI-SECTOR.md) |
| The hard, enforced rules for module independence, one-writer-per-invariant, and what is *not yet* machine-checked | [`docs/implementation/ENTERPRISE-SCALE.md`](./docs/implementation/ENTERPRISE-SCALE.md) |
| Multi-branch chains, node replication, the three commercial editions (Solo/Chain/Organization), and the numbered `R1`–`R26` rules everything else in this document set cites by number | [`docs/implementation/RETAIL-ERP.md`](./docs/implementation/RETAIL-ERP.md) |
| Why this is a modular monolith and not a microservice mesh — the trade actually made, and what it costs | [`docs/implementation/architecture-patterns/92-microservices-module-decoupling.md`](./docs/implementation/architecture-patterns/92-microservices-module-decoupling.md) |
| Why the existing `*Provider`/`*Driver`/`*Channel` extension points already are hexagonal architecture, without a formal ports-and-adapters rewrite | [`docs/implementation/architecture-patterns/115-hexagonal-architecture-ports-adapters.md`](./docs/implementation/architecture-patterns/115-hexagonal-architecture-ports-adapters.md) |
| The generic, vendor-agnostic connectivity system (outbound, inbound, OAuth2, scheduled-pull, file-based) that every external integration in this repository is built on | [`docs/implementation/integrations-connectivity/36-universal-connectivity-integration-framework.md`](./docs/implementation/integrations-connectivity/36-universal-connectivity-integration-framework.md), `132`, `160`, `162` |
| Every other architectural decision, including the two the owner explicitly reversed after reconsidering the risk | [`docs/implementation/DECISIONS.md`](./docs/implementation/DECISIONS.md) — also pointed to from [`Memory.md`](./Memory.md) |
| A generated, always-current map of the actual codebase — every module, route, table, event, and permission, as it exists today | [`docs/index/01-MAP.md`](./docs/index/01-MAP.md) (regenerate with `pnpm index`) |

**One rule stated once, not repeated per document**: a sector is a
configuration (a module pack), a brand is a value (`packages/shared/src/brand.ts`),
a branch is a row (a `Location`, or a node at chain scale) — never a git
branch, never a literal, never an unscoped read. Every architecture
document above already assumes this; `CLAUDE.md`'s own "Scale: the three
axes" section is where it is stated in full, with the reasoning.

**This file exists only so "Architecture.md" is findable by name.** The
documents above are where the actual architecture — and the reasoning
behind it — lives.
