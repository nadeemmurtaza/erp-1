# 183 — Engineering governance: this program's own gates, the two-agent split, and a modular monolith first

> **Status: proposed (2026-09-27), not yet in force.** `CLAUDE.md`'s operating
> sequence and definition of done bind every change in this program already;
> this document does not restate them as new rules. It names **this program's
> own gates** inside that sequence, splits the work between two agents with
> path ownership and interface-first contracts so they can run in parallel
> without editing each other's code, and records why everything here is built as
> modules in the existing modular monolith — the node/replication model of
> `RETAIL-ERP.md` and ADR-001 — with no microservice, no new process type and no
> new repository.

## 1. The operating sequence, with this program's gates named

`CLAUDE.md`: *Understand → Inspect → Plan → Document → Implement → Verify →
Review → Report.* For a work order in docs 169–182 that becomes eleven steps,
each producing an artifact a reviewer can check:

| # | Step | The artifact | This program's gate |
|---|---|---|---|
| 1 | **Requirement** | A work-order id from docs 169–182 (e.g. WO-172.4) in the PR title | No code without one — "code with no documented reason is speculative functionality" (`CLAUDE.md`) |
| 2 | **Acceptance criteria** | The WO's own "Acceptance" bullets, copied into the PR, each mapped to the test that proves it | A bullet with no test fails review |
| 3 | **ADR, when one is required** | A new `DECISIONS.md` entry | Required for: a new core extension point (`CanonicalRecordSinkRegistry`, the `CircuitBreaker`); any posting-rule change (the clearing account, WO-175.10; partial refunds, WO-175.6); runtime tenant legal identity (WO-168.3, Br1-adjacent); compute density (WO-168.3); any new `KNOWN_MODULE_COUPLINGS` entry. **ADR-071 covers where this program is built, and nothing else** |
| 4 | **Implementation** | The diff | Inside module boundaries; `pnpm lint` green with **zero new `KNOWN_MODULE_COUPLINGS` entries** unless step 3 produced an ADR for one |
| 5 | **Tests** | Unit specs for every pure function (`parse`, `map`, `scoreRecord`, the partition, `validateModification`, `DerivabilityAssessment`), integration specs against a real Postgres for every atomicity claim (promotion chunks, constraints, cutover), determinism specs where a document claims determinism, contract specs for every new event (doc 176 §7) | `pnpm test` green |
| 6 | **Failure tests** | The fault-injection cases of doc 176 §3 relevant to the change | **Merge gate** for any WO touching `connectors/**`, `payments/**`, `settlements/**`, `planning/**` or `apps/platform/src/modules/releases/**` |
| 7 | **Security** | A review by the `security` agent (`.claude/agents/security.md`, routed per `docs/index/cross/model-routing.md`: "permissions, authentication, tenant or branch isolation, payment and refund paths, anything handling secrets") | Mandatory for doc 170 §3–§4 (principals, UAE PASS, support sessions), connector credentials, callback verification (WO-175.1), the du-rail provider and connector |
| 8 | **Preview** | A preview environment running doc 178's two demo tenants | Doc 178's end-to-end journey (WO-178.3) passes there |
| 9 | **Evidence** | The PR description: the commands run and their counts ("verify by counting, not by reading" — `CLAUDE.md`), the `### Scope lenses` block for a named feature, the pillars touched, and the ratchet counts (doc 170 §5's currency words; `rupeesSpentMinor` after WO-173.1) | A claim without a command behind it is not evidence |
| 10 | **Human review** | Approval by the owner or a person the owner delegates | **An agent's approval is never consent.** Agent-to-agent review (§2.4) is advisory input to the human, never a substitute for one |
| 11 | **Merge** | The merge to `main` | In this repository `main` deploys nothing (`CLAUDE.md`'s Deployment section). For du's production, a merge becomes a `PlatformRelease` (doc 171) and reaches tenants only through rings — merging is not releasing |

**Program-level gates** — no work order in a later gate starts before the earlier
gate is merged and verified:

| Gate | Contents | Why first |
|---|---|---|
| **G0 — correctness preconditions** | WO-170.3 (currency sweep), WO-175.1 (fail-closed callbacks), WO-173.1–173.4 (rename, unknown cost, AP in base, honest cash and AR) | Each writes a wrong fact the moment a non-PKR tenant transacts |
| **G1 — foundation** | Docs 160/162 built as corrected (WO-172.1–172.3), `CanonicalRecordSinkRegistry` (WO-172.6's registry half), doc 38's `CircuitBreaker` (WO-176.2) | Everything in Layer 3 stands on it |
| **G2 — the new capability** | The ingestion pipeline (WO-172.4–172.11), provenance partition (WO-173.5–173.9), control-center persistence (doc 174), derivability (doc 177) | The slice (doc 178) |
| **G3 — money** | The du rail (WO-175.2–175.8) | Needs G0's callback fix and G1's breaker |
| **G4 — fleet** | Build Manifest and Update Agent (doc 171), SLIs (doc 176 §5), milestones (doc 180), continuity (doc 181 §7) | Needed for Wave 1, not for the submission |
| **Wave gates** | Doc 179 §2–§6 | Business gates on top of engineering gates |

## 2. The two-agent split

Two agents work in parallel: **Claude A** on core architecture and the engine,
**Claude B** on connectors, provider implementations, integration tests and
failure injection. The split follows the seams the architecture already has —
module boundaries and extension points — so that each agent's work is a set of
paths the other does not edit.

### 2.1 Ownership by path

| Agent | Owns (writes) | Layers / docs |
|---|---|---|
| **A — core & engine** | `apps/api/src/core/extension-points/**` (the sink registry), `apps/api/src/core/resilience/**` (the breaker — built by A, consumed by B), `apps/api/src/modules/planning/**`, `apps/api/prisma/schema/planning.prisma`, the **sinks inside owning modules** (`purchasing`, `crm`, `parties`, `catalog`, `inventory`, `tradingpartners` — core-module code, one `onModuleInit()` registration each), the doc 169 changes to existing models (`Invoice`, `Contact`, `Party`), `packages/shared/src/permissions.ts`, `core/auth/**` (support sessions, UAE PASS binding), `apps/platform/src/modules/releases/**` and the control-plane schema for docs 171/176/180, `apps/web/src/app/(admin)/admin/(app)/resilience/**` | 0, 1, 2, 4, 5 — docs 169, 170, 171, 173, 174, 177, 180 |
| **B — connectors, rails, failure** | `apps/api/src/modules/connectors/**`, `apps/api/prisma/schema/connectors.prisma`, `apps/api/src/modules/payments/providers/<du-rail>.provider.ts`, `apps/api/src/modules/settlements/connectors/**`, the settlement-expectation cron, `apps/web/src/app/(admin)/admin/(app)/connections/**`, the fault-injection suite and demo harness (WO-176.3, WO-178.4), the end-to-end journey (WO-178.3), the SLI sampler's queries | 3, 6 — docs 172, 175, 176, 178, 179's comparator |

**Shared, edited only through a PR the other agent reviews:**
`apps/api/src/core/events/domain-events.ts` (both add events),
`apps/api/src/modules/module-packs.ts` and `modules.registry.ts`, the root
`package.json` lint chain, env templates, `payments.service.ts` (WO-175.1 is
B's, but it touches A's security review list), and `DECISIONS.md`.

### 2.2 Interface first, implementation second

Every seam between the two is merged as **types plus a failing contract test**
before either side implements against it:

| Seam | Owner of the interface | Consumer | Contract test |
|---|---|---|---|
| `CanonicalRecordSink<T>` + the per-kind candidate types (`packages/shared/src/entities/`) | A | B (calls `mirror()`); A (implements per module) | A sink fixture proving idempotent `mirror()` and pure `validate()` |
| `ExternalRecordLink` columns and `ObservedSale`/`ObservedCashBalance` (in B's `connectors.prisma`) | B | A (`DependencyGraphService.build()`, `LiquidityForecastService`) | A read-only query fixture both agents' specs import |
| `EdgeProvenance` and the partitioned run | A | B (the demo's assertions) | Doc 173's determinism spec |
| Domain events (the ten `connectors.*`/`planning.*` events, doc 176 §7) | publisher | the control-plane pollers (A) | Doc 176 §7's payload contract tests |
| `CircuitBreaker` | A | B | A forced-failure spec |
| `PaymentProvider` / `FinancialInstitutionConnector` | existing (unchanged except WO-175.1/175.2) | B implements | `callback-verification.spec.ts`, the settlements connector spec |

### 2.3 The order they run in

| Phase | Claude A | Claude B |
|---|---|---|
| 1 (G0) | WO-170.3 currency sweep; WO-173.1–173.4 | WO-175.1 fail-closed callbacks; WO-175.2 labels |
| 2 (G1) | Sink registry + candidate types; `CircuitBreaker`; WO-169.2/169.3 model changes; permissions (WO-170.1) | WO-172.1 schema; WO-172.3 transports; WO-176.3 fault-injection harness skeleton |
| 3 (G2) | Sinks in owning modules; WO-173.5–173.9; doc 174; doc 177 | WO-172.4–172.11 pipeline and UI; e2e journey |
| 4 (G3) | Reviews B's rail work for the security list | WO-175.3–175.8 du rail |
| 5 (G4) | Doc 171; doc 180; control-plane staff sign-in (WO-170.7) | SLI queries; comparator (WO-179.2); runbooks' failure drills |

### 2.4 Rules of engagement

- **Neither agent edits the other's owned paths.** A change needed on the other
  side is requested in that agent's queue, or proposed as a PR the owner-agent
  reviews.
- **A red contract test stops both sides.** Neither may merge while a shared
  contract test is red on `main`.
- **Disagreements go to the human.** An architectural disagreement between the
  agents is written up (the two positions, the evidence) and decided by the
  owner — recorded as an ADR if it meets step 3's bar. Neither agent's message is
  the owner's consent, and neither agent may change the other's permissions,
  `CLAUDE.md`, or configuration.
- **Model routing is the repository's.** Architecture, schema and security work
  runs on the agents `docs/index/cross/model-routing.md` names (`architect`,
  `schema`, `security` on opus); contained module changes on `implement`/`feature`.

## 3. A modular monolith first — and the refusal of microservices, with reasons

**Everything in this program is modules in the two applications that exist**:
`apps/api` (the tenant application — `connectors`, the `planning` extension, the
sinks, the rail provider and connector) and `apps/platform` (the control plane —
releases, SLIs, milestones). No new service, no new process type, no new
repository, no message broker.

Why, from this repository's own record rather than preference:

1. **ADR-001 is settled and nothing here is new evidence against it.** "A
   deliberate modular monolith — one NestJS process per node, with module
   boundaries enforced in the repository rather than by the network…
   `check-module-boundaries.mjs` fails the build on a violation, which is a
   stricter guarantee than a mesh gives, because a mesh permits any call that
   compiles." `PRD.md` lists "a literal microservices mesh (doc 92)" as
   explicitly out of scope; ADR-027 reversed a brief instruction to build a
   service mesh after reviewing the security trade-off.
2. **The swap-ability a microservice would buy already exists at the seams that
   matter.** Every external dependency this program adds is an interface —
   `PaymentProvider`, `FinancialInstitutionConnector`, `FiscalComplianceProvider`,
   `IdentityVerificationProvider`, `AiProvider`, `FileFormatHandler`,
   `DeploymentProvisioner` — and every internal crossing is an extension point or
   an event. Replacing a vendor is a class; replacing a module is a `MODULES`
   entry.
3. **The scaling unit is already defined, and it is not a service.** A tenant is
   a node (doc 39, `RETAIL-ERP.md` R2/R7): each SME is its own database and its own
   process, so load scales with tenants, horizontally, by construction. The one
   scaling question this program raises — process density at 50,000 tenants —
   is an operator and orchestrator question (WO-168.3, beside the still-open
   ADR-018), not a reason to split a tenant's application.
4. **If one capability's load ever diverges inside a tenant**, R1 already says
   what the first step is: "One schema, one image, one commit. The tier is an env
   var." A second process of the *same image* with a different `MODULES` set
   (connectors' crons only, say) — which ADR-018's leader-election question must
   decide before it runs twice — never a new codebase. Nothing in this program
   needs even that.
5. **Distributed transactions are refused by design** (`RETAIL-ERP.md` R3:
   "Anything spanning two databases is a saga"). Promotion's atomicity (doc 172
   §8) is possible *because* the sinks and the pipeline share one database and
   one transaction; a service split would turn exactly-once promotion into a
   saga with compensations for no benefit.

## Scope lenses

This document governs how work is done; it introduces no data, no permission and
no write path. The lenses it answers are the governance ones.

**The actor with three tables / The principal with no permission key / The
grant that ends itself** — the two agents act through the repository's normal
PR flow; neither holds a production credential; their access ends with the
session.
**Whose rows, and which columns** — n/a: this document reads and writes no
business row; path ownership (§2.1) is the analogue, and each artifact's row
visibility is answered in the document that introduces it.
**The threshold nobody approves alone** — merge requires a human approval
(step 10); a money/stock-path release requires two humans (doc 171).
**The toxic pair, caught at grant or at act** — the agent that wrote a change
cannot be its only reviewer; the human approves.
**Authority and blast radius** — the widest authority here is merging to `main`;
in this repository it deploys nothing, and for du it reaches tenants only through
rings.
**Audience is a capability, not an address** — n/a: this process sends no
message of its own; a red gate reaches people through CI's own notification to
the PR's author and reviewers, not through anything this program builds.
**Request or record** — a PR is a REQUEST; a merged commit is a RECORD, never
rewritten (no force-push to `main`, `CLAUDE.md`'s no-deletion rule).
**The movement with no address** — n/a: this document governs how changes are
made and moves no stock or cash itself; every write path it sequences names its
location in its own document.
**Four hours down, the counter stays open** — one agent blocked: the other
continues on its own paths; a shared contract red stops both (§2.4).
**The unwritten posting rule / Every column or none / The period that already
moved / The second legal entity** — n/a: no journal line, tax document or
numbered series is written by a process; the money lenses are docs 175 and 179's.
**Dry run before live** — the preview environment (step 8).
**Click the number** — every claim in a PR links to the command output behind it.
**Three silhouettes, and the day the tier above appears** — n/a: the process
is the same for a Solo, Chain or Organization change; what differs by edition is
the per-`MODULES`-set boot test (doc 171 §7, WO-171.6), which runs on every
change in CI once built.
**The absent collaborator** — one agent absent: the other's work stays inside its
own paths; nothing merges into the absent agent's paths without a human.
**The second copy of the write** — n/a: the process writes no row; a re-run CI
job re-checks the same commit and changes nothing.
**The hundred-thousandth row** — n/a: no table is introduced; volume per table
is answered where each is defined (docs 172, 174, 176, 180).
**The adoption test** — n/a: the only identifiers this document introduces are
work-order ids (`WO-168.x`–`WO-183.x`), assigned once in these documents, never
generated by a running node.
**The reversal document, not the reversal flag** — a bad merge is reverted by a
new commit, never by rewriting history.
**The undo fan-out** — a reverted change's migrations are forward-only (ADR-008):
the revert is a new forward migration where schema is involved.
**The version stamp** — `DECISIONS.md` records why; the WO id records what.
**The erasure the ledger cannot obey** — n/a: the process holds no personal
data; a person named in a commit's attribution is governed by the repository's
own history rules, and this program's person-bearing tables are doc 181 §6's.
**The failure path, and who is allowed to walk it** — a red gate is visible in
CI; the human decides whether to fix forward or revert.

## Work orders

**WO-183.1 — Program PR checklist**: the eleven steps as a PR-description
section for this program's work orders (WO id, acceptance → test map, ADR link
if required, evidence counts, scope lenses, pillars).
**WO-183.2 — Path-ownership file**: §2.1 as a machine-readable ownership map the
two agents check before editing, reviewed like code.
**WO-183.3 — Shared contract-test package**: the §2.2 fixtures in one place both
agents' specs import.
**WO-183.4 — Gate report**: a script that lists G0–G4's work orders and whether
each is merged and its acceptance tests pass.

## Acceptance

- Every PR in the program cites a WO id and maps each acceptance bullet to a
  test.
- `pnpm lint` shows no new `KNOWN_MODULE_COUPLINGS` entry without a linked ADR.
- No G1 work order merges before G0's are merged and verified; no Wave 1 tenant
  exists before G4 is merged.
- No new application, service or repository is created by the program.

## Out of scope

Staffing and team structure beyond the two agents. Branch strategy (unchanged:
one `main`, per `CLAUDE.md`). CI infrastructure changes beyond the program's own
tests and gates.
