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

**Adding one.** Append it with the next number. Do not renumber, and do not edit
a decided entry to reflect a change of mind — supersede it with a new entry and
set the old one's status to `Superseded by ADR-NNN`, so the history of the
thinking survives.

| # | Decision | Status |
|---|---|---|
| [ADR-001](#adr-001--a-modular-monolith-one-process-per-node) | A modular monolith, one process per node | Accepted |
| [ADR-002](#adr-002--a-sector-is-a-module-pack-behind-an-allowlist) | A sector is a module pack behind an allowlist | Accepted |
| [ADR-003](#adr-003--modules-are-independent-side-effects-cross-through-events) | Modules are independent; side effects cross through events | Accepted |
| [ADR-004](#adr-004--events-are-delivered-through-a-transactional-outbox) | Events are delivered through a transactional outbox | Accepted |
| [ADR-005](#adr-005--money-is-an-integer-in-minor-units) | Money is an integer in minor units | Accepted |
| [ADR-006](#adr-006--customer-facing-text-is-a-row-not-a-column) | Customer-facing text is a row, not a column | Accepted |
| [ADR-007](#adr-007--access-control-is-permission-based-and-the-grants-are-data) | Access control is permission-based, and the grants are data | Accepted |
| [ADR-008](#adr-008--migrations-are-hand-written-and-forward-only) | Migrations are hand-written and forward-only | Accepted |
| [ADR-009](#adr-009--a-branch-is-a-node-with-its-own-database-not-a-tenant-row) | A branch is a node with its own database, not a tenant row | Accepted |
| [ADR-010](#adr-010--in-transit-stock-is-a-location-not-a-flag) | In-transit stock is a Location, not a flag | Accepted |
| [ADR-011](#adr-011--a-till-sale-is-a-channel-of-orders) | A till sale is a channel of `orders` | Accepted |
| [ADR-012](#adr-012--cross-module-references-are-bare-scalars-not-foreign-keys) | Cross-module references are bare scalars, not foreign keys | Accepted |
| [ADR-013](#adr-013--one-deployment-serves-one-brand) | One deployment serves one brand | Accepted |
| [ADR-014](#adr-014--the-repository-index-is-generated-and-enforced-not-written) | The repository index is generated and enforced, not written | Accepted |
| [ADR-015](#adr-015--model-and-effort-are-routed-per-job-from-one-policy) | Model and effort are routed per job, from one policy | Accepted |
| [ADR-016](#adr-016--rules-that-apply-to-one-kind-of-file-are-path-scoped) | Rules that apply to one kind of file are path-scoped | Accepted |
| [ADR-017](#adr-017--an-observability-backend) | An observability backend | **Open** |
| [ADR-018](#adr-018--horizontal-replicas-and-load-balancing) | Horizontal replicas and load balancing | **Open** |

---

## ADR-001 — A modular monolith, one process per node

### Context
The product serves several sectors, several clients, and clients with several
branches, and it has to stay extensible for sectors nobody has specified yet. The
shape of the deployment had to be settled before any module boundary meant
anything.

### Options Considered
- A microservice mesh, one service per business capability.
- A single application with no internal boundaries.
- A modular monolith: one deployable process, with enforced internal boundaries.

### Decision
A **deliberate modular monolith** — one NestJS process per node, with module
boundaries enforced in the repository rather than by the network.

### Reasoning
The boundaries a mesh buys are real, but so is its cost: a distributed
transaction problem on every write that spans two capabilities, an operational
surface no single-shop deployment can staff, and a deployment story that a
client running one till cannot run at all. The boundaries can be had without the
network — `scripts/check-module-boundaries.mjs` fails the build on a violation,
which is a stricter guarantee than a mesh gives, because a mesh permits any call
that compiles.

Long-form: `ENTERPRISE-SCALE.md`, `RETAIL-ERP.md`.

### Consequences
- Every infrastructure box a reference architecture names still has to exist, but
  inside the process: the API gateway is the entrypoint's own hardening, the
  cache is a precomputed table, and so on. `CLAUDE.md` maps each one.
- A module cannot be scaled independently. If one ever must be, that is a new
  decision, not a silent refactor.
- The boundary rules become load-bearing: they are the only thing standing
  between this and an unmodular monolith.

### Status
Accepted.

---

## ADR-002 — A sector is a module pack behind an allowlist

### Context
"Can it also do pharmacy / automotive / grocery?" is the most common question
asked of this codebase, and the obvious answers all end with a codebase that
cannot be maintained.

### Options Considered
- A branch or a fork per sector.
- A `sector` column and `if (sector === …)` conditionals in shared code.
- A module pack per sector, enabled per deployment through a `MODULES` allowlist.

### Decision
**A sector is a folder.** Packs are declared in
`apps/api/src/modules/module-packs.ts`; a deployment enables what it needs
through `MODULES`. There is no `if (sector === …)` anywhere and there must
never be.

### Reasoning
A branch encodes a configuration in time, which means every fix has to be
cherry-picked into every client forever. A conditional puts every sector's
knowledge into core, so a grocery deployment carries tailoring logic it can
never use, and core becomes the one file nobody can change safely. A pack is
additive: adding a sector adds a folder and never edits a core module, which is
the only one of the three that stays true at the tenth sector.

Long-form: `MULTI-SECTOR.md`.

### Consequences
- Core may never import a pack, and a pack may never import another pack.
  `pnpm lint` fails either.
- Every pack must be survivably absent — booting without it has to work. This is
  **not machine-enforced yet**; `ENTERPRISE-SCALE.md` names it as a known gap.
- A module missing from `MODULE_PACKS` fails the build on purpose: "would a
  grocery shop need this?" is not a question a new module gets to skip.

### Status
Accepted.

---

## ADR-003 — Modules are independent; side effects cross through events

### Context
Module packs only pay off if a module can actually be dropped, replaced, or
shipped alone for a client. A single direct import between two modules destroys
that property quietly.

### Options Considered
- Allow direct service calls between modules, relying on review.
- Allow them within a pack, forbid them across packs.
- Forbid them entirely, with a named exception list for same-transaction writes.

### Decision
**No direct import between any two modules**, core or pack alike. Side effects
cross through a domain event or an extension point. `KNOWN_MODULE_COUPLINGS` in
`scripts/check-module-boundaries.mjs` is the only exception, and it stays small
on purpose.

### Reasoning
The middle option was the first rule and it left the real gap: two core modules
could import each other freely, which is most of the codebase. The exception
list exists because a small number of writes genuinely must commit in the same
database transaction as the write that caused them — an order's stock deduction
is the clearest case, and decoupling it through an event would trade a
correctness guarantee for architectural purity, reintroducing exactly the race
that House Rule 10's predicate-on-write exists to eliminate.

Long-form: `00-HOUSE-RULES.md` Rules 2 and 3; `MULTI-SECTOR.md`.

### Consequences
- Adding behaviour to another module's workflow is a new file, not an edit.
- The exception list is a burn-down list, not a configuration knob. Each entry is
  a place the platform is less portable than it claims.
- `pnpm idx event <name>` shows every publisher and subscriber, because the
  indirection makes the wiring invisible in the source.

### Status
Accepted.

---

## ADR-004 — Events are delivered through a transactional outbox

### Context
If a module's side effects are events, then losing an event loses business
state — an order placed but never tailored, a sale never posted to the ledger.
In-process emission after a commit can drop an event whenever the process dies
between the two.

### Options Considered
- Emit in-process after the transaction commits.
- A message broker (Redis, RabbitMQ, Kafka).
- A transactional outbox table drained by a dispatcher.

### Decision
**A transactional outbox.** `EventBusService.publish()` takes the transaction
client and writes the event row in the same transaction as the state change;
`OutboxDispatcher` delivers pending rows with backoff.

### Reasoning
Either the order and its event both exist, or neither does — there is no "order
saved but the tailor job was never created" state, which is the failure mode the
other two options both permit at some probability. A broker would add an
operational dependency that a single-shop deployment cannot justify, and would
not remove the same dual-write problem at the boundary.

### Consequences
- Delivery is **at-least-once**, so every subscriber must be idempotent. This is
  a real obligation on every handler, not a footnote.
- The outbox table is a queue in the primary database and shares its capacity.
- Events become a natural audit trail of what happened and when.

### Status
Accepted.

---

## ADR-005 — Money is an integer in minor units

### Context
The system computes prices, discounts, tax, refunds, ledger postings and
multi-currency conversions, and any rounding disagreement between two of them is
a real financial defect.

### Options Considered
- Floating point.
- A decimal type in the database, floats in application code.
- Integer minor units (paisa) end to end.

### Decision
**Integer paisa, everywhere.** Rs 3,499 is `349900`. Never a float.

### Reasoning
Floating point cannot represent most decimal money values exactly, so equality
and summation become approximate in a domain where they must not be. Mixing a
database decimal with application floats just moves the defect to the boundary.
An integer is exact, sums exactly, and compares exactly.

Long-form: `00-HOUSE-RULES.md` Rule 5; extended to multi-currency by
`RETAIL-ERP.md` R16.

### Consequences
- Every amount needs formatting at the edge — `formatMoney` from `@newax/shared`,
  never `toLocaleString` at a call site.
- Multi-currency uses a scaled integer rate (`fxRateScaled`) for the same reason.
- A new money column that is not an integer is a defect, not a style choice.

### Status
Accepted.

---

## ADR-006 — Customer-facing text is a row, not a column

### Context
The storefront ships in English and Urdu today and must be able to add a
language without a schema change.

### Options Considered
- A column per locale (`nameEn`, `nameUr`).
- A JSON blob of locales per record.
- A `*Translation` table, one row per locale.

### Decision
**One `*Translation` row per locale.** No customer-facing string is a column on
its parent.

### Reasoning
A column per locale makes every new language a migration across every table that
has text. A JSON blob avoids the migration but gives up querying, constraints and
partial-translation reporting. Rows cost a join and buy an unbounded number of
languages with no migration at all.

Long-form: `00-HOUSE-RULES.md` Rule 6.

### Consequences
- Reads of customer-facing entities join translations, and lists must avoid the
  N+1 that invites.
- A missing translation is a row that does not exist, which is queryable — a
  genuine operational advantage over a null column.

### Status
Accepted.

---

## ADR-007 — Access control is permission-based, and the grants are data

### Context
Roles as the unit of authorization mean every new capability edits a hardcoded
role check, and a client who wants "a manager who cannot see cost prices" needs
a code change.

### Options Considered
- Role checks at each route (`if (user.role === 'ADMIN')`).
- Permissions in code, role→permission mapping in code.
- Permissions in code, role→permission mapping as data, plus per-user overrides.

### Decision
**PBAC.** Every route states `@RequirePermission('…')` against the catalogue in
`packages/shared/src/permissions.ts`. Which role holds which permission is a
`RolePermission` row, editable from `/admin/settings`, with `UserPermission`
GRANT/REVOKE overrides on top.

### Reasoning
The capability a route needs is a property of the route and belongs in code
beside it. Who holds that capability is a property of the business and changes
without a deploy. Separating them is what lets a client reshape their own roles
without a release, while keeping the guard itself reviewable.

Long-form: `00-HOUSE-RULES.md` Rule 9; `16-pbac-row-scoping.md`;
`RETAIL-ERP.md` R10.

### Consequences
- `JwtAuthGuard` and `PermissionGuard` are global, so a route with no decorator
  is authenticated-but-unrestricted — almost never intended, and **not
  machine-enforced**; `scripts/check-route-permissions.mjs` reports it.
- A permission is not shipped until it reaches a role a live user holds. A key in
  the catalogue that no role grants is scaffolding.
- `pnpm idx perm <key>` reports all three layers at once for this reason.

### Status
Accepted.

---

## ADR-008 — Migrations are hand-written and forward-only

### Context
Migrations run against real customer data in deployments this team does not
operate directly. A bad one is not a revert; it is a restore.

### Options Considered
- Generate with `prisma migrate dev` / `migrate diff` against a database.
- Generate, then hand-review before committing.
- Hand-write every migration, forward-only.

### Decision
**Hand-written, forward-only.** Never `migrate diff` against a real database,
never `migrate dev` against production. Every migration states its reason.

### Reasoning
A generated migration is written by a tool that knows the schema and nothing
about the data — it will happily drop a column, or add a `NOT NULL` with no
default, because both satisfy the schema. Hand-writing forces the author to
answer what happens to existing rows, which is the question that actually breaks
deployments. Forward-only removes the temptation of a down-migration that has
never been tested.

Long-form: `00-HOUSE-RULES.md` D1/D2.

### Consequences
- The discipline has **no automated guard** — it is a reviewer's job, and
  `CLAUDE.md` says so rather than implying otherwise.
- The schema can drift ahead of the migrations silently, because Prisma
  generates its client from the schema, not the database. This repository
  carried five such tables and four such enum values until
  `scripts/build-index.mjs` was taught to compare the two; the report now lives
  in `docs/index/cross/migrations.md`.

### Status
Accepted.

---

## ADR-009 — A branch is a node with its own database, not a tenant row

### Context
A chain has several locations plus a website and offline tills, on connections
that fail. The question is where a branch's facts live.

### Options Considered
- One database with a `branchId` column on every table (multi-tenancy).
- One database per branch, with replication between tiers.
- A branch as a tenant of a central system, always online.

### Decision
**A branch is a node.** It has its own database, is authoritative for its own
facts, and holds a read-only cache of the brand's policy. Facts flow up, policy
flows down, ledgers merge, nothing flows sideways.

### Reasoning
A `branchId` column makes every read a correctness question — one missing
`where` clause leaks another branch's data — and makes the whole chain depend on
one database being reachable from every shop. A node keeps a branch trading when
the link is down, which is the actual operating condition, and turns cross-branch
reads into an explicit decision rather than a default.

Long-form: `RETAIL-ERP.md` R2, R3, R7.

### Consequences
- No distributed transactions: anything spanning two databases is a saga (R3).
- Every movement of value names its location, and any query that can span
  branches must say which. There is no implicit "all branches" read — **not
  machine-enforced yet**.
- Natural keys, not ids, are the merge risk (R6), because ids are already
  collision-safe and codes like `Location.code` are not.
- If two "branches" must not see each other's customers, they are two brands —
  a different axis entirely.

### Status
Accepted.

---

## ADR-010 — In-transit stock is a Location, not a flag

### Context
Stock moving between branches is neither at its source nor its destination, and
it can be in that state for days. It has to stay countable and auditable
throughout.

### Options Considered
- A status field on the transfer, with quantities held on the transfer rows.
- A boolean or enum on the stock row.
- A real `Location` of type `IN_TRANSIT`, created per transfer.

### Decision
**A `Location`.** Each dispatch creates its own in-transit location, holding
exactly the quantity currently between two real places.

### Reasoning
Everything `VariantLocationStock` and the stock ledger already do for a real
location — balances, movements, valuation, variance — comes free for goods on a
truck, with no schema change and no cross-database constraint. A flag would have
required every one of those to learn a second way of counting, and would have
left the in-transit quantity outside the ledger it belongs in.

Long-form: `RETAIL-ERP.md` R4; `17-inventory-locations.md`.

### Consequences
- The in-transit row is never deleted after the transfer completes: it is the
  transfer's ledger anchor, and every `TRANSFER_OUT`/`TRANSFER_IN` movement
  references it.
- `LocationType` must be excluded wherever "real, staffed places" are listed —
  the API is explicit about never returning an in-transit bucket as a location.
- A short receipt writes the difference off from the in-transit location rather
  than letting it vanish.

### Status
Accepted.

---

## ADR-011 — A till sale is a channel of `orders`

### Context
A point of sale could reasonably be its own subsystem with its own records. Every
report, refund path and ledger posting then has to know about two of everything.

### Options Considered
- A parallel `PosSale` model alongside `Order`.
- A shared abstract sale with two subtypes.
- `Order` with a `channel` discriminator and additive nullable columns.

### Decision
**A channel of `orders`.** `Order.channel` is `WEB` or `POS`, with
`locationId`, `terminalId` and `shiftId` null for every web order.

### Reasoning
Two order systems means two of every report, two refund flows, two posting
rules, and a permanent question about which one a given figure came from. One
model with a discriminator keeps a single fulfilment queue, a single revenue
number and a single returns path, and costs four nullable columns.

Long-form: `RETAIL-ERP.md` R11.

### Consequences
- `POS_SALE` is a distinct `StockMovementReason` from `SALE`, so a ledger read
  can tell the channel apart without joining `Order`.
- The POS module can be absent entirely and `orders` is unaffected.
- Nullable columns carry a real obligation: any query that assumes `locationId`
  is present is wrong for every web order.

### Status
Accepted.

---

## ADR-012 — Cross-module references are bare scalars, not foreign keys

### Context
Module independence (ADR-003) is enforced for TypeScript imports. The Prisma
schema is the other place two modules can become inseparable, and a foreign key
is harder to remove than an import.

### Options Considered
- Normal Prisma relations across module schema files.
- Relations within a pack, scalars across packs.
- Bare scalar columns for every cross-module reference, validated in the service.

### Decision
**A bare scalar.** `Order.locationId`, `PosTerminal.locationId`,
`StockTransfer.sourceLocationId` and `PosReceipt.orderId` are plain strings; the
owning service checks existence at write time.

### Reasoning
A cross-module foreign key makes the two modules undeployable apart — the
constraint has to exist in the database whether or not the module is enabled,
which contradicts the allowlist that makes packs useful. It also becomes
impossible at chain scale, where the two tables can live in different databases
(ADR-009). Losing referential integrity at that boundary is the price; it is
paid deliberately, and the check moves into the service that owns the write.

### Consequences
- The database will not stop an orphaned reference. The owning service must, and
  its tests must cover it.
- A `JOIN` across the boundary is not available; reads assemble in the service.
- The same reasoning applies to order lines, which are snapshots rather than
  references, for a different reason — a price change must not rewrite history
  (`00-HOUSE-RULES.md` Rule 7).

### Status
Accepted.

---

## ADR-013 — One deployment serves one brand

### Context
Several clients run this platform. Multi-brand could be a runtime concern or a
build-time one, and the choice shapes every query in the system.

### Options Considered
- Multi-brand at runtime, with a brand resolved per request.
- One deployment per brand, brand resolved at build time.

### Decision
**One deployment serves one brand**, resolved at build time from
`packages/shared/src/brand.ts`.

### Reasoning
Runtime multi-brand puts a brand filter on every query and a brand check in
every permission, and one missed filter is a cross-client data leak. Build-time
resolution makes that class of bug unrepresentable. The cost is a deployment per
client, which is already the operating model.

### Consequences
- **Do not build toward multi-brand speculatively.** It is a deliberate
  boundary, not an unfinished feature.
- Brand, locale and design literals resolve through `BRAND` — no hex, no company
  name, no support address in application code (House Rule 1).
- The `RetailBrand` rows that exist are sub-brands within one deployment's
  brand, which is a different axis and must not be confused with this one.

### Status
Accepted.

---

## ADR-014 — The repository index is generated and enforced, not written

### Context
The repository is ~900 files and ~145k lines across four applications. Every
agent session, and every new contributor, spent its first stretch rediscovering
that shape by searching — from zero, every time.

### Options Considered
- A hand-written architecture guide.
- Better search conventions and naming, and accept the cost.
- An index generated from the code, regenerated on every commit.

### Decision
**Generated.** `scripts/build-index.mjs` reads controllers, decorators, the
event catalogue, the permission catalogue, the Prisma schema, the app router and
the nav registry, and renders `docs/index/`. `.githooks/pre-commit` regenerates
and stages it; `pnpm index:check` fails CI when it is stale.

### Reasoning
A hand-maintained map of a repository this size is wrong within a week, and a
wrong map is worse than none because it is trusted. Deriving it from the code
makes drift impossible rather than unlikely, which is the only property that
makes it safe to tell people to read it before searching. The generator is
deliberately zero-dependency and line-scanner based: it has to run in a hook
where `node_modules` may be absent, and an index needs pointers rather than
semantics.

### Consequences
- `docs/index/` is never edited by hand; the next commit overwrites it.
- The index is a map, not the territory — its scanners are not a type checker,
  and it must never be cited as evidence that code does something.
- Deriving facts from two sources at once found real defects the code review had
  not: five tables and four enum values declared but never migrated, and two
  permissions enforcing no route.
- `pnpm idx` queries it, because a 12,000-token page is the wrong way to answer
  a 30-token question.

### Status
Accepted.

---

## ADR-015 — Model and effort are routed per job, from one policy

### Context
Work in this repository ranges from "which file is this in" to "does this
migration lose data". Running all of it at one model and one effort level is
either wasteful or careless, depending which level is chosen.

### Options Considered
- A skill that instructs the model to pick its own level.
- A hook that sets the model based on the prompt.
- Subagent definitions that pin `model` and `effort` per job.

### Decision
**Subagent definitions.** `scripts/lib/model-routing.mjs` is the single policy;
the eight definitions in `.claude/agents/`, the page in
`docs/index/cross/model-routing.md`, the advisory hook and the table in every
agent-instruction file are all generated from it.

### Reasoning
A skill is instructions loaded into the current context and cannot change the
model; a hook is documented as unable to set model or effort. A subagent
definition carries both and is delegated to automatically by matching its
description, which is the only mechanism that actually selects per job with
nobody choosing. The default direction is **down**: nothing has to justify
staying at `sonnet`/`medium`, going above it does. The expensive models are
spent where being wrong is a breach or a restore — permissions, money,
migrations, module boundaries — and nothing extra is spent on a lookup, which is
the most frequent operation.

### Consequences
- The main session's own model and effort remain manual (`/model`, `/effort`);
  the hook advises and says that it is advising.
- Cache TTL follows effort rather than frequency: a cache read refreshes the
  entry for free, so fast agents keep the cheaper 5-minute default and only
  long-running ones take the 1-hour TTL's doubled write price.
- Other tools have their own model pickers, so for them the table is guidance,
  not configuration. That limit is stated rather than papered over.

### Status
Accepted.

---

## ADR-016 — Rules that apply to one kind of file are path-scoped

### Context
`CLAUDE.md` was ~12,500 tokens loaded on every session, every non-Claude tool
and every new agent — the largest fixed cost in the repository, and growing,
because more rules are coming.

### Options Considered
- Leave it whole and accept the cost.
- Compact it by summarising, accepting some loss of rule and reasoning.
- Move job-specific rules into `.claude/rules/*.md` with `paths:` frontmatter,
  which Claude Code loads only when a matching file is opened.

### Decision
**Path-scoped rule files.** Twelve sections moved verbatim into nine topic
files. `CLAUDE.md` keeps an index naming every one, what it governs and when it
loads. Nothing was reworded or summarised.

### Reasoning
Summarising trades rules for tokens, and the rule that gets trimmed is the one
nobody was applying anyway — which is the one most worth keeping. Scoping trades
nothing: a rule that arrives the moment you open the file it governs is *more*
likely to be followed than one skimmed in a 12,000-token preamble. The index
keeps every rule visible at all times, so an agent planning work it has not yet
opened files for still knows the rule exists.

### Consequences
- Always-on context fell from ~12,510 to ~9,658 tokens; ~4,474 became
  conditional.
- Scoping introduces a failure mode the single file never had: a rule can become
  unreachable silently — a typo in a glob is a rule that has quietly stopped
  applying. `scripts/check-rules.mjs` guards it and runs in `pnpm lint`.
- Every rule file states that it is **binding**, so scoping is never read as
  optionality.
- Adding a rule: everything → `CLAUDE.md`; one kind of file → the matching rules
  file plus a row in the index. The checker fails the build if those disagree.

### Status
Accepted.

---

## ADR-017 — An observability backend

### Context
The Observable pillar in `CLAUDE.md` is the one the five-pillar table marks as
**not enforced**. The repository has structured logging through Nest's `Logger`,
an audit trail, and domain events as a natural trace — but no APM, no error
tracker and no metrics backend is wired in. `CLAUDE.md` forbids claiming
monitoring exists where only logging does, and defers the choice here.

### Options Considered
Not yet evaluated. The shape of the decision is at least: a hosted APM, a
self-hosted stack, error tracking only as a first step, or OpenTelemetry
instrumentation with the backend chosen later.

### Decision
**None yet.** This entry exists so that the absence is visible and deliberate
rather than assumed away.

### Reasoning
Choosing this properly needs inputs the repository does not currently have: who
operates a deployment, what they are on call for, what the per-node cost budget
is, and whether a client's data may leave their infrastructure. Picking a vendor
before answering those would be the kind of speculative infrastructure the
house rules forbid.

### Consequences
- Until this is decided, no code may assume monitoring exists, and no
  documentation may describe it as present.
- Instrumenting with OpenTelemetry first would keep the backend choice open,
  which is the direction the flexibility-first ordering favours — but that is a
  recommendation for whoever takes this up, not a decision.

### Status
**Open.** Needs an owner and the operating inputs above.

---

## ADR-018 — Horizontal replicas and load balancing

### Context
The deployment is one process per node (ADR-001). A load balancer is a box a
reference architecture names, and `CLAUDE.md` records it as "not applicable at
today's single-process-per-node scale" — with the explicit condition that when a
node needs horizontal replicas, it "gets a real answer in `DECISIONS.md` before
it gets an env var".

### Options Considered
Not yet evaluated. The decision is not only the balancer: replicas make process
state a correctness question. The outbox dispatcher (ADR-004), the cron jobs and
the replication sync agent all currently assume a single runner per node.

### Decision
**None yet.** Recorded so the condition `CLAUDE.md` set is discharged in the
open rather than by the first person who needs more throughput.

### Reasoning
No deployment has presented the load that would justify it, and adding replicas
without first deciding leader election for the scheduled and draining work would
produce duplicate cron runs and competing outbox dispatchers — a correctness
failure, not a scaling one. That coupling is the substance of this decision and
is the reason it cannot be reduced to an env var.

### Consequences
- Until decided, background work may continue to assume a single runner per node.
- Whoever takes this up owns the leader-election question for
  `OutboxDispatcher`, every `@Cron` job (`docs/index/cross/jobs.md` lists them)
  and `ReplicationSyncAgent` — not just the balancer.

### Status
**Open.** Triggered by the first node that needs horizontal replicas.

---

## ADR-019 — WO-B.4 ships against the live reports idiom, not Track A's unbuilt registry

### Context
`10-admin-dashboard.md`'s WO-B.4 ("Expense metrics and the three expense
analytics pages") is specced to modify `card-registry.ts` (+7 cards) and
`report-registry.ts` (+3 reports) — a dashboard-card and report-catalog
architecture the same document's Track A (WO-A.4, WO-A.5) was meant to build
first: a backend `MetricProvider`/`MetricRegistryService` registry, a
`GET /admin/analytics/cards` endpoint, a frontend `DASHBOARD_GROUPS` +
`DashboardCard[]` catalog, and a catch-all `analytics/[...slug]/page.tsx`
report shell. Before starting this work order, a repository-wide search (`git
log --all`, and a grep for `card-registry`, `report-registry`,
`MetricProvider`, `MetricRegistryService`, `DashboardCard`,
`ReportDefinition` across `apps/api/src` and `apps/web/src`) confirmed none
of Track A was ever built — no commit, no file, no partial scaffold. Track B
itself (WO-B.1 through B.3 — expenses, recurring expenses, OrderEconomics)
was built this session and is real and merged; only the registry
infrastructure WO-B.4 assumes as a prerequisite is missing.

What already exists and is live: two hand-authored admin screens
(`/admin/reports`, `/admin/insights`) that call plain REST endpoints
(`analytics.controller.ts`, `reports.controller.ts`) directly via
`adminFetch`, rendered through shared primitives (`Section`, `SectionRail`,
`Tabs`, `MetricStrip`) and four existing inline-SVG chart components
(`sales-chart.tsx`, `donut-chart.tsx`, `gauge-chart.tsx`, `funnel-chart.tsx`).
No card or report in this codebase, today, is reached through a catalog —
every one is a concretely authored page and a concretely authored endpoint.
The one registry that is real is `nav-registry.ts` (sidebar entries only,
gated by permission and module).

### Options Considered
1. **Build a minimal slice of WO-A.4/A.5 first**, then WO-B.4 on top of it as
   specced. Rejected: this would introduce a whole new architectural layer —
   a metric-provider registry, a card catalog, a catch-all report route — as
   a side effect of a small expense-analytics request, which is exactly the
   speculative-infrastructure pattern the house rules forbid ("no
   unnecessary abstractions," "what real boundary justifies its existence?").
   Two screens do not justify a catalog; the catalog was speculative even
   when the doc proposed it, and building it now, unrequested and unused
   anywhere else, would be worse.
2. **Ship WO-B.4's actual acceptance criteria against the live idiom**:
   extend `finance.controller.ts`/`finance.service.ts` with the two
   endpoints the doc's own route table names (`expenses/by-category`,
   `expenses/trend`), and add a hand-authored expense-analytics screen using
   the same primitives and chart components every other admin screen already
   uses. Chosen.
3. **Skip WO-B.4 entirely**, wait for a future work order to build Track A
   properly. Rejected: nothing about the acceptance criteria (a by-category
   breakdown, a trend, a revenue-comparison figure, click-through to the
   filtered ledger, an empty-state) requires the registry — they are ordinary
   endpoint-and-screen requirements that the rest of this app already
   satisfies without one.

### Decision
Deliver WO-B.4 as two new endpoints on the existing `finance` module and one
new admin screen, following this repository's actual, live "one page, one
endpoint" idiom — not the unbuilt Track A registry the source document
assumes. `expenses/overview`, the third "report" the doc names, is the same
by-category data presented as this screen's summary section, not a third
endpoint or a registry entry.

One genuine shared-architecture fix rides along, because the acceptance
criteria require it and not doing it would recreate the exact "revenue three
ways, no stated authority" trap `CLAUDE.md`'s "Click the number" lens warns
against: the "does this order count as revenue" definition
(`VOID_ORDER_STATUSES` — status not `CANCELLED`/`RETURNED`, dated by
`placedAt`) is extracted from `analytics.service.ts` into
`core/common/sales-revenue.ts`, so `finance`'s new `vsRevenueBps` figure and
`analytics`'s dashboard revenue are provably the same computation, not two
copies that happen to agree today. `analytics.service.ts` now imports it
instead of holding its own copy of the constant; this is an import from
`core/`, which every module may already depend on, not a `finance` ↔
`analytics` module coupling.

### Reasoning
The house rules' own scoping method ("Feature scope: build the whole
capability") asks what a named feature cannot work without, not what a
stale plan happened to name as its file list. WO-B.4's real ask —
expense-by-category, expense trend, a revenue comparison, reachable and
correct — is fully satisfiable by the pattern already proven at
`/admin/reports` and `/admin/insights`. Building a registry only WO-B.4
would use is scaffolding, the same trap `CLAUDE.md` already tracks by name
(`seedPermissions()` vs. `seedRoles()`) for a different kind of
unused-infrastructure debt.

### Consequences
- A future Track A, if ever built, will need to migrate `finance`'s two new
  endpoints and its new screen into the card/report catalog the same way it
  would migrate `/admin/reports` and `/admin/insights` — this is not a
  bigger migration than doing nothing here would have left, since none of
  the three used a catalog to begin with.
- `expenses.vs_revenue_bps` lives as a field on the `by-category` response,
  not as a named metric in a provider registry — there is no registry for it
  to be named in yet.
- `VOID_ORDER_STATUSES` has exactly one owner now (`core/common/
  sales-revenue.ts`); a future third consumer (WO-B.5's comparative chart is
  the next likely one) imports the same constant rather than adding a third
  copy.

### Status
**Accepted.**

---

## ADR-020 — `bom` (Track C) ships as a new module, `production` stays as-is

### Context
RETAIL-ERP.md's Tranche 6 names `23.2` `bom` — "build `10-admin-dashboard.md`
§C as written." Before starting, a survey of the current repository found
`apps/api/src/modules/production/` already implements a working, tested,
**actively depended-on** BOM-and-manufacturing mechanism: `BillOfMaterial`/
`BillOfMaterialLine` (a `ProductVariant` built from other `ProductVariant`s,
generic float quantities, no raw-material concept) and `WorkOrder`
(DRAFT → RELEASED → COMPLETED, consuming and producing stock through
`InventoryService.move()`/`moveMany()`). Two other modules call into it:
`apps/api/src/modules/production/reorder-work-order.listener.ts` and
`stitching-cascade.listener.ts` both create `WorkOrder`s as a live part of
the reorder and stitching pipelines — this is not dead or scaffolded code.

Track C (`10-admin-dashboard.md` §C, WO-C.1 through WO-C.4) specifies a
different, more capable system: `RawMaterial` (a `ProductVariant` marker
row with a unit-scale discipline for continuous goods — fabric measured in
milli-gaz, not just countable pieces), `BomRecipe`/`BomComponent` with a
cached, cost-rolled-up recipe, `BomProductionRun`/`BomProductionLine` with
wastage-adjusted consumption and a weighted-average cost write-through to
the finished variant's `costPrice` — none of which exists anywhere in the
repository today. It is a net-new build, not a partially-done module the
existing `production` code is a slice of.

### Options Considered
1. **Build `bom` as a new, separate module**, alongside `production`,
   leaving `BillOfMaterial`/`WorkOrder` untouched. Chosen.
2. **Merge `bom` into the `production` module** — extend `WorkOrder` with
   raw-material/recipe/wastage/cost-rollup concepts in place. Rejected: the
   two solve overlapping but distinct problems (an assembly BOM of finished
   variants vs. a raw-material recipe with a unit-scale and cost discipline
   Track C's own schema comments call out as load-bearing — "QUANTITIES ARE
   INTEGER BASE UNITS, the same discipline money uses"). Forcing them into
   one model risks the same "the wizard was a card, and every step inside
   it drew another" kind of accretion CLAUDE.md's UI rules warn about, but
   for a data model: `WorkOrder` gains fields most of its existing callers
   (reorder, stitching-cascade) never use.
3. **Deprecate `production`'s BOM mechanism and migrate its two callers to
   the new `bom` module as part of this work order.** Rejected as this
   work order's scope: CLAUDE.md's own "Preserve existing systems" and
   "Change minimization" — rewriting two shipped, working listeners because
   a new, unrelated module now exists nearby is a refactor with no stated
   requirement driving it, and would turn a scoped feature build into an
   unscoped migration of code nothing asked to change.

### Decision
Build `bom` as specified in Track C, as its own module (`modules.registry.ts`
entry `{ name: 'bom', module: BomModule }`, its own `bom.prisma`, its own
`bom.view`/`bom.manage`/`bom.produce` permissions, its own nav group). The
existing `production` module — `BillOfMaterial`, `WorkOrder`, both
listeners — is not touched, not deprecated, and not documented as
superseded by this work.

### Reasoning
The two modules answer different questions (`production`: "this variant is
assembled from these other variants"; `bom`: "this variant is manufactured
from these raw materials, with wastage and a real weighted-average cost").
Reconciling or merging them is a real design question worth having, but it
is not one Track C's own spec asks for, has no stated requirement in this
work order, and — per CLAUDE.md's own scoping method — a lens with no
artifact behind it is not this feature's to invent. Coexistence is also the
reversible choice: either module can still be merged, retired or renamed
later without this decision having foreclosed it, whereas quietly
absorbing `production` into `bom` now would not be undoable without a
second migration.

### Consequences
- A `ProductVariant` can in principle carry both a `BillOfMaterial` (generic
  assembly) and a `RawMaterial` marker (a raw-material role) at once today —
  nothing in either model prevents it. Track C's own acceptance criteria
  don't ask this repo to resolve that overlap, so it is not resolved here;
  a future work order that wants one unified "how is this variant made"
  answer will need to design that reconciliation explicitly, informed by
  how each is actually used once `bom` ships.
- Two conceptually similar systems now exist side by side
  (`production.manage` and the new `bom.*` permissions gate two different
  screens for two different kinds of "production"). This is named here so
  it is a known, deliberate state rather than something a future reader
  has to rediscover from the code.
- WO-23.3 (tier-scoped purchasing, RETAIL-ERP.md R13) explicitly bundles
  `PurchaseOrder`, `BomProductionRun` and `Expense` under one shared
  `scopeLevel`/`originNodeId` pattern — it is sequenced after `bom` lands,
  specifically after `BomProductionRun` (WO-C.3) exists, so that pattern is
  designed once against a real model rather than speculatively.

### Status
**Accepted.**

## ADR-021 — WO-23.3's scopeLevel pattern: a new core-owned enum, fail-closed on the money switch, and originNodeId as the node-prefix string

### Context
WO-23.3 (RETAIL-ERP.md R13) asks `PurchaseOrder`, `BomProductionRun` and
`Expense` to each carry `scopeLevel` and `originNodeId` — "one uniform
pattern," per R13's own words. Before writing that migration, a research
pass across the existing replication/organization/accounting infrastructure
(recorded in full in session transcript, summarized here) surfaced four
genuine gaps the roadmap line does not settle on its own, each of which
would otherwise get decided silently inside a migration:

1. **No `scopeLevel`-shaped column exists anywhere yet.** The only
   tier-shaped enums in the schema are `AdminScopeLevel` (`ORG|BRAND|BRANCH`
   — organization.prisma, a *grant's* own scope) and `NodeRole`
   (`BRANCH|BRAND` — a child-node registry entry). Reusing
   `AdminScopeLevel` directly is mechanically free (Prisma enums are
   schema-global) but would make `purchasing`/`finance`/`bom` — three
   always-on core modules — type-depend on `organization.prisma`, an
   off-by-default module's schema file, for a column those three modules
   need whether or not `organization` is ever enabled.
2. **The two existing `BrandPolicy`-adjacent switches disagree on their
   missing-row default.** `transfers.service.ts`'s
   `allowInterBranchTransfers` check *proceeds* when no `BrandPolicy` row
   exists for the brand ("nothing to check yet, matches WO-22.1's
   default" — tested explicitly). `Organization.allowInterBrandTransfers`
   fails *closed* on a missing `Organization` row
   (`ForbiddenException`). `allowBranchLocalPurchasing` needs one of these
   two behaviors and the roadmap does not say which.
3. **`branchNodeId`'s exact meaning is unresolved in the codebase that
   coined it.** `AdminScope.branchNodeId` is a real `@relation` FK to
   `Node.id` (a cuid) — but a branch node has no `Node` row for *itself*
   (`Node` is "recorded on the parent only," per that model's own header);
   a branch's own identity is `NODE_ID` (`config.nodeId`, a string like
   `lhr-01`), the same string `documentNumber()` already node-prefixes
   every generated number with. `JournalLine.branchNodeId` is a bare
   scalar with no stated convention either way. `scopeLevel`'s sibling
   `originNodeId` needs one of the two and R13 does not distinguish them.
4. **R2's own FACT/POLICY table does not list "purchase order" as a
   fact** — only "goods receipt" and "expense" are named. A PO is a
   request a supplier can still refuse or partially fill; a GoodsReceipt
   is a record of what physically arrived. Whether `PurchaseOrder` itself
   needs `ReplicationRegistry` FACT registration, or only its GoodsReceipt
   does, changes what "tier-scoped" means for the two models differently.

### Options Considered
**On the enum:**
1. Reuse `organization.prisma`'s `AdminScopeLevel`. Rejected: creates a
   schema-level dependency from three always-on modules onto one
   off-by-default module's file, for no benefit `AdminScopeLevel`'s own
   job (a grant's scope) doesn't already fully serve on its own — a grant
   and a fact's own recorded scope are different concepts that happen to
   share a vocabulary, not the same fact wearing two hats.
2. **Declare a new `ScopeLevel { ORG BRAND BRANCH }` enum in `core.prisma`**
   — the one schema file this repo's own tooling (`check-module-boundaries.mjs`'s
   `CORE_SCHEMA_FILES`) already treats as foundational rather than
   module-owned, the same status `User`/`Address` already hold. Chosen:
   every deployment gets the enum regardless of which modules are on, and
   no module gains a new schema dependency on another module's file.

**On the missing-`BrandPolicy`-row default for `allowBranchLocalPurchasing`:**
1. Match `allowInterBranchTransfers` (fail open — proceed when no row).
   Rejected for this specific switch: R9's own text is "a branch's claims
   about what it was allowed to do are never trusted… never silently
   honoured," and this switch gates a branch *spending the group's money*
   locally, not moving stock the brand already owns between its own
   locations (the lower-stakes case `allowInterBranchTransfers` governs).
2. **Match `Organization.allowInterBrandTransfers` (fail closed — no row
   means not allowed).** Chosen, for exactly that reason: the two existing
   precedents differ by stakes, not by inconsistency, and a money-gating
   switch takes the stricter one. Recorded here explicitly so the next
   reader does not "fix" it to match the other precedent without knowing
   this was decided on purpose.

**On `originNodeId`'s value:**
1. A cuid FK to `Node.id`, matching `AdminScope`. Rejected: a branch has no
   `Node` row for itself to point at — `Node` rows are recorded on the
   parent only — so every branch-originated fact would need a synthetic
   self-referential `Node` row invented for no other reason than this
   column.
2. **A bare `String?` scalar carrying `config.nodeId`** — the same string
   `documentNumber()` already stamps into every PO/production-run/expense
   number today. Chosen: it is always available locally (no lookup, no
   Node row needed), it is already how R6 disambiguates a node's own
   generated identifiers, and `Location.originNodeId` (the one other
   `originNodeId` column in the schema today) is already typed this exact
   way — `String?`, no relation. This is a *different* thing from
   `AdminScope.branchNodeId`'s cuid FK on purpose: one names a `Node` row
   to scope a grant to, the other stamps a fact with which node produced
   it; the ambiguity the research flagged is resolved by treating them as
   two different columns that happen to share a word, not by picking one
   convention for both.

**On PurchaseOrder vs GoodsReceipt as the FACT:**
1. Register `PurchaseOrder` itself with `ReplicationRegistry` as FACT/UP.
   Rejected: a PO can still be edited or cancelled locally before it is
   ever sent, which is exactly the kind of pre-commitment state R2's FACT
   class ("append-only… never rejected") is not meant to cover.
2. **`scopeLevel`/`originNodeId` land on `PurchaseOrder` for administrative
   tracking (which tier raised it) without FACT registration; `GoodsReceipt`
   — what actually, physically arrived — is the model registered as
   FACT/UP**, mirroring `Order`'s own registration
   (`order-replication.listener.ts`) and matching R2's own naming exactly
   ("goods receipt," not "purchase order"). `BomProductionRun` and
   `Expense` register as FACT/UP directly — both are already completed
   physical/financial events by the time either row exists, with no
   pre-commitment "request" stage the way a PO has.

### Decision
- New enum `ScopeLevel { ORG BRAND BRANCH }` in `core.prisma`.
- `PurchaseOrder`, `BomProductionRun`, `Expense` each gain
  `scopeLevel ScopeLevel @default(BRAND)` and `originNodeId String?` — the
  default is `BRAND` (not `BRANCH`) because "brand purchasing is the
  default and behaves as today" (R13's own words), and every deployment
  running today, without exception, already is exactly one brand.
- `allowBranchLocalPurchasing` fails **closed** on a missing `BrandPolicy`
  row.
- `originNodeId` is a bare `String?` populated from `AppConfigService.nodeId`,
  never a `Node` FK.
- `GoodsReceipt`, `BomProductionRun` and `Expense` are the three models
  registered with `ReplicationRegistry` as `{ dataClass: 'FACT', direction: 'UP' }`;
  `PurchaseOrder` is not registered.
- A genuine, generic "business-rule violation quarantine" (R9's own
  requirement — "a fact arriving in violation is accepted and quarantined
  for review") does not exist yet; today's `ReplicationQuarantine` table is
  narrowly typed to a replication-apply failure (`originNodeId`/`sequence`
  both non-nullable, tied to an inbound push). Building R9's quarantine
  path is sequenced as its own follow-up piece of WO-23.3 rather than
  folded silently into the schema migration, since it is a second real
  table with its own review UI, not a column.

### Reasoning
Every one of the four gaps above is a place a migration author would
otherwise have to guess, and a guess made once inside a Prisma migration is
expensive to undo later (a column rename or an enum value change touches
every row already written). Naming the choice here, with the rejected
alternative and why, costs one paragraph each and saves a second migration.
The fail-closed choice on `allowBranchLocalPurchasing` in particular
follows directly from R9's own stated purpose — the entire point of that
rule is that a periphery node's claims are not trusted by default — so
matching the fail-*open* precedent here would have been the one place this
WO worked against the rule it exists to implement.

### Consequences
- `core.prisma` now owns a second cross-cutting enum
  (`ProductKind`-adjacent in spirit) that no module "owns" — future tier
  concepts should default to living there too, not in whichever module
  happens to need one first.
- A branch deployment whose `BrandPolicy` row was never created (every
  deployment today) cannot locally purchase until an ORG/BRAND-tier admin
  explicitly creates that row and sets the flag true — this is correct per
  R9 but means the admin surface for `BrandPolicy` (which does not exist
  yet — nothing writes that table today) is a hard prerequisite, not a
  nice-to-have, for `allowBranchLocalPurchasing` to ever be exercised in
  practice. Sequenced as part of this same work order.
- `LocationType` gains a `PRODUCTION` member (R13: "runs at a
  WAREHOUSE/PRODUCTION Location") and `GoodsReceipt`/`BomProductionRun`
  gain a real `locationId` — today both silently resolve to
  `InventoryService.defaultLocationId()`, which is correct only for a
  single-location Solo deployment and would misfile every org-warehouse
  receipt or production run otherwise. This is a change inside modules
  already shipped (`purchasing`, `bom`), so it is scoped as a same-feature,
  additive change (a new optional param defaulting to today's behavior),
  never a rewrite of either service's transaction.
- `StockTransfer`'s org-warehouse-to-branch leg (pushing stock down "with
  landed cost") is currently unimplemented on the *receive* side —
  `StockTransferLine.unitCost` is populated only for `INVOICED` transfers
  and `receive()` never feeds it into `InventoryService.move()`'s
  `unitCost`, so a received transfer does not currently update the
  destination's weighted-average cost at all. Fixing this is inside
  WO-23.3's own scope (R13 names it explicitly) and is tracked as its own
  implementation slice, not assumed already correct.

### Status
**Accepted.**

## ADR-022 — WO-23.3b enforces `allowBranchLocalPurchasing` through a new BranchPolicyRegistry extension point, keyed off the caller's own AdminScope grant

### Context
ADR-021 named the `BrandPolicy` admin surface as "a hard prerequisite, not
a nice-to-have" for `allowBranchLocalPurchasing` to ever be exercised, and
sequenced it as part of this same work order (WO-23.3b). Building it
surfaced two questions ADR-021 did not settle:

1. **`purchasing` is always-on; `organization` is off by default**
   (`modules.registry.ts`: `{ name: 'organization', offByDefault: true }`).
   `PurchasingService.createPurchaseOrder()` cannot import
   `OrganizationService` directly to check the switch — that would make an
   always-on core module schema/type-depend on an off-by-default one,
   exactly what `KNOWN_MODULE_COUPLINGS` exists to keep rare and explicit,
   and this coupling has no same-transaction justification the way an
   approved entry does.
2. **`PurchaseOrder` carries `scopeLevel` but no `retailBrandId`**
   (ADR-021's own decision) — so at the point `createPurchaseOrder()` runs,
   there is no column on the row itself naming *which* brand's
   `BrandPolicy` should govern a `BRANCH`-scope request. The only thing
   that names a brand at all is the calling actor's own `AdminScope` grant
   — and a `BRANCH`-level grant already carries both `branchNodeId` *and*
   `retailBrandId` (`AdminScope.retailBrandId` is set for `BRANCH`, not
   only `BRAND` — confirmed in `assertScopeShape()`), so no new column is
   needed to resolve it.

### Options Considered
**On the coupling:**
1. Import `OrganizationService` directly from `purchasing`, guarded by
   `AppConfigService.isModuleEnabled('organization')`. Rejected: still a
   compile-time dependency of an always-on module on an off-by-default
   module's exports, the same shape `accounting`'s own module-independence
   note (finance.prisma's header) already rejects for the same reason.
2. **A new core-internal extension point, `BranchPolicyRegistry`**,
   mirroring `StockIntakeRegistry` exactly: `organization` registers a
   handler from its own `onModuleInit()`; `purchasing` injects the
   registry (global, via `ExtensionPointsModule`) and calls it without
   knowing whether anything is registered. Chosen: this is the named
   precedent for "two core modules, one always-on and one not, need to
   talk" — `StockIntakeRegistry`'s own doc comment says so explicitly.

**On resolving "which brand governs this request":**
1. Add `retailBrandId` to `PurchaseOrder`. Rejected: reopens ADR-021's
   already-accepted column set for a value derivable from data that
   already exists (the actor's own grant), and every deployment that
   never enables `organization` would carry a column that is always null.
2. **Resolve the brand from the calling actor's own `AdminScope` grants**,
   inside the `organization`-owned handler. Chosen: no schema change, and
   it is the actor who is claiming a branch identity by asking for
   `scopeLevel: 'BRANCH'` at all — checking their own grant is the
   correct authority to consult, not the row being created.

**On the handler's own decision logic** (who may create a `BRANCH`-scope PO):
1. Gate every `BRANCH`-scope PO on `BrandPolicy`, regardless of the
   actor's own scope width. Rejected: an ORG-wide or BRAND-level admin
   already holds the authority to flip the switch itself — refusing their
   own `BRANCH`-scope request would not protect anything R9 is meant to
   protect, only add friction for the person who owns the policy.
2. **An ORG-wide or BRAND-level (or wider) grant always passes; a
   BRANCH-only grant is checked against its own brand's `BrandPolicy`,
   fail-closed on a missing row or `false` (ADR-021); an actor with no
   `AdminScope` grant at all (or `organization` not enabled at all —
   `BranchPolicyRegistry` has no handler registered) passes.** Chosen:
   this is the same "absent module changes nothing for a deployment that
   never opted in" default `StockIntakeRegistry` already documents — a
   Solo/STANDALONE deployment never sees "branch" as a concept, so nothing
   about its purchasing flow should start refusing requests once this
   registry exists.

### Reasoning
`BranchPolicyRegistry` is mechanically identical to `StockIntakeRegistry` —
same file, same problem shape ("two core modules, one always-on and one
switchable") — so reusing the pattern rather than inventing a second one
keeps the "extension points, not conditionals" rule legible: a reader who
already understands `StockIntakeRegistry` understands this without new
vocabulary. Resolving the brand from the actor's grant rather than a new
column keeps ADR-021's decision intact and avoids a column that would be
null on every Solo/STANDALONE deployment forever. The fail-closed default
inside the handler is R9's own text ("never silently honoured"); the
pass-through default for a wider grant or an absent module is this
codebase's own "invisible in Solo" rule (R14) — the two do not conflict,
because R9's switch is about a *branch* overreaching, never about refusing
an actor who already holds the authority to set the switch, or a
deployment that never had the concept at all.

### Consequences
- `core/extension-points/branch-policy.registry.ts` is a new, narrow
  extension point — one method, one handler shape — following
  `StockIntakeRegistry`'s own precedent to the letter, including its
  "absent handler → safe default" idiom.
- `PurchasingService` gains one new constructor dependency
  (`BranchPolicyRegistry`, injected globally via `ExtensionPointsModule`,
  no new module import needed) and one new check at the top of
  `createPurchaseOrder()`, before the transaction opens — a `BRANCH`-scope
  refusal is a 403 the caller sees immediately, not a rollback.
- `OrganizationService` gains its first real `BrandPolicy` write path
  (`setBrandPolicy`, upsert-based) and its first real consumer of
  `assertCanManageAtScope()` — built but uncalled anywhere before this ADR.
- A user holding *multiple* `BRANCH`-level grants across different brands
  is allowed the moment *any* one of those brands' policies says `true`
  (`.some()`, not `.every()`) — deliberately the more permissive reading,
  since each grant is independently legitimate authority over its own
  branch; a stricter "every brand must agree" reading was not asked for
  and would refuse a request the actor has clear standing to make on at
  least one of their own branches.
- `WO-23.3c` (the R9 quarantine table for a fact arriving in violation of
  a replicated policy) is unaffected by this ADR — that quarantine is for
  a FACT arriving over replication from another node, never for a
  same-node synchronous write like `createPurchaseOrder()`, which this ADR
  refuses outright (400/403) rather than accepting-then-quarantining. The
  two mechanisms cover different moments in R9's own text ("enforced at
  both ends") and are not redundant with each other.

### Status
**Accepted.**

## ADR-023 — WO-23.3c/e: Node.retailBrandId, a separate PolicyQuarantine table, and apply() drawing exactly one distinction per entity

### Context
WO-23.3c/e registers `GoodsReceipt`, `BomProductionRun` and `Expense` with
`ReplicationRegistry` as FACT/UP (ADR-021's own decision) and builds R9's
"quarantined for review" mechanism ADR-021/ADR-022 both named as still
missing. Doing so surfaced three questions neither prior ADR settled:

1. **Nothing in the schema names "which brand does this branch belong
   to."** `Node` (organization.prisma) carries `role: BRANCH|BRAND` but no
   `retailBrandId` — confirmed in ADR-021's own research. `PurchaseOrder`/
   `GoodsReceipt`/`BomProductionRun`/`Expense` carry `scopeLevel` but,
   per ADR-021, deliberately no `retailBrandId` either. ADR-022's own
   `allowsBranchLocalPurchasing(userId)` sidesteps this by resolving the
   brand from the ACTING USER's own `AdminScope` grant — but a fact
   arriving over replication has no acting user, only the authenticated
   child node that pushed it (`ReplicationController.push()`'s own
   convention: origin is always the credential, never the payload).
2. **`ReplicationQuarantine` cannot hold a policy-violation record
   honestly.** Its schema requires `sequence` (a replication-log position)
   and always pairs with an apply() throw, routed there by
   `ReplicationApplyService`'s own catch block. A policy violation is not
   a failure to apply — R5/R2 forbid treating it as one — so writing it
   into the same table under the same status enum would make "OPEN" mean
   two unrelated things: "we could not process this" and "we processed
   this and it needs a human decision."
3. **Chain-wide consolidation for these three entities is not built**,
   the same gap `OrderReplicationListener`'s own doc comment already
   names for `Order` (WO-20.6): resolving `GoodsReceipt.purchaseOrderId`,
   `BomProductionRun.recipeId`, or `Expense.categoryId` against a parent
   database that was never sent the referenced row (`PurchaseOrder`,
   `BomRecipe`'s owning module state, `ExpenseCategory`) has no answer
   yet. `apply()` must be honest about this without pretending the
   feature is further along than it is.

### Options Considered
**On resolving "which brand governs this node":**
1. Add `retailBrandId` to each of the four scope-carrying models
   (reopening ADR-021). Rejected: ADR-021 already decided against this,
   for a value that is a property of the NODE that raised the fact, not
   of the fact itself — every fact from the same branch would carry an
   identical, redundant copy of the same value.
2. **Add `Node.retailBrandId` (nullable, no backfill).** Chosen: this is
   where the codebase already tracks a child's identity (`nodeId`,
   `role`, `label`, `url`, its credential) — brand membership belongs
   beside those, once, not duplicated onto every fact that node raises.
   Nullable because no existing `Node` row can honestly claim a brand it
   was never asked about; the receiving-tier check (below) treats a null
   the same way ADR-021 already treats a missing `BrandPolicy` row —
   "cannot verify" reads as "not allowed," never as "nothing to check."

**On where the policy-violation record lives:**
1. Add nullable `policyKey`/`retailBrandId` columns to the existing
   `ReplicationQuarantine` and let both cases share one table. Rejected:
   makes every row's meaning conditional on which columns happen to be
   set, and forces every future query ("show me apply failures" vs. "show
   me policy exceptions") to filter on that condition rather than the
   table itself.
2. **A new `PolicyQuarantine` table** (replication.prisma), structurally
   parallel to `ReplicationQuarantine` — same `OPEN`/`RESOLVED` lifecycle,
   reusing `ReplicationQuarantineStatus` since the two states mean the
   same thing in both places — but with its own columns (`policyKey`,
   `retailBrandId`, `resolvedById`, `resolvedNote`) and no `sequence`,
   since this row describes the fact's CONTENT, not its transport
   position. Chosen: two tables, two honest meanings, one shared status
   vocabulary.

**On `apply()`'s own shape for a BRANCH-scope fact:**
1. Always quarantine into `PolicyQuarantine` for a BRANCH-scope fact,
   whether or not the brand actually disallows it, since consolidation
   isn't built anyway. Rejected: this would misfile a compliant fact
   (a brand that DOES allow local purchasing) as a governance exception,
   the exact "silently honoured when it shouldn't be flagged, or flagged
   when it shouldn't be" confusion R9's "never silently" language is
   trying to prevent from the other direction.
2. **`apply()` checks the BrandPolicy switch ONLY for `GoodsReceipt`**
   (the one entity R9 names a real switch for —
   `allowBranchLocalPurchasing`); on violation it performs the quarantine
   write and returns normally (no throw); on a compliant or non-BRANCH
   fact it throws the same "not built yet" error `Order.apply()` already
   throws, routing it into the EXISTING apply-failure quarantine.
   `BomProductionRun`/`Expense` draw no policy distinction at all and
   always throw — R9 names four switches total
   (`allow_branch_product_creation`, `allow_branch_local_purchasing`,
   `allow_inter_branch_transfers`, `org.allow_inter_brand_transfers`); none
   governs branch-local manufacturing or branch-local expenses, so
   inventing one for either would be exactly the kind of speculative
   policy semantics this codebase's own "no speculative functionality"
   rule forbids. Chosen.

### Reasoning
Each option above keeps the SAME two mechanisms ADR-022 already
distinguished (a same-node synchronous refusal vs. a receiving-tier
quarantine) internally honest about what each row means: a `Node` row
either does or does not know its own brand; a `ReplicationQuarantine` row
is always a technical apply-failure; a `PolicyQuarantine` row is always a
governance exception on a fact that DID apply, in the sense that R5/R2
require — accepted, never rejected. Registering `BomProductionRun`/
`Expense` without inventing a policy check for them follows directly from
"scoped, not tier-specific" (R13's own phrase): being tier-aware (carrying
`scopeLevel`) does not obligate every entity to also be policy-gated —
only the ones R9 actually names a switch for.

### Consequences
- `Node.retailBrandId` is unset (null) for every `Node` row that exists
  today — a chain deployment gains no automatic policy enforcement from
  this migration alone; an operator must explicitly badge each branch
  with its brand (new `PATCH /organization/nodes/:nodeId/brand`, WO-23.3c/e's
  own admin surface) before `GoodsReceipt.apply()`'s policy check can ever
  return `true` for it. Silence here reads as "not yet configured," which
  fails closed correctly but is not the same as "configured to disallow."
- `GoodsReceiptReplicationListener.apply()` is the first `apply()`
  implementation in this codebase that can both succeed (quarantine into
  `PolicyQuarantine`, no throw) and fail (throw, quarantine into
  `ReplicationQuarantine`) depending on its input — every other
  registrant (`Order`, `Product`, now `BomProductionRun`/`Expense`) is
  unconditionally one or the other. A future reader diffing entities by
  "does its apply() ever succeed" needs to know this is the one exception
  and why.
- `PolicyQuarantine` rows are scope-filtered the same way `scopeFilterFor`
  already narrows other list reads (`OrganizationService
  .listPolicyQuarantine()`): an ORG-wide viewer sees every open entry, a
  BRAND/BRANCH-scope viewer only entries whose `retailBrandId` their scope
  reaches, and an entry with no resolvable `retailBrandId` at all — the
  node that raised it was never badged — is ORG-only, since a
  brand-scoped viewer has no attributable claim on it.
- WO-23.3d (org-central purchasing, StockTransfer's own landed-cost
  receive-side fix) and full chain-wide consolidation for these three
  entities (the `Order`-shaped "not built yet" throw this ADR keeps) both
  remain explicitly out of scope here, tracked separately, not silently
  assumed solved by this migration.

### Status
**Accepted.**

## ADR-024 — WO-23.3d: org-central purchasing recognized narrowly in `resolveTransferSettlement()`; landed cost snapshotted at dispatch but never re-fed into `ProductVariant.costPrice`

### Context
RETAIL-ERP.md R13's own words: "Organization (central) purchasing buys for
several brands, receives into an org warehouse `Location`, and pushes stock
down as transfers (R4) carrying landed cost." WO-23.3a–c/e built the
scopeLevel/BrandPolicy/replication side of tier-scoped purchasing; this is
the last slice — making a `StockTransfer` able to originate from an org
warehouse at all, and making the landed cost R13 asks for actually reach
the arriving side. Two decisions had to be made that the roadmap line
doesn't settle on its own, plus one gap ADR-021 had already named and
explicitly deferred to this WO ("`StockTransferLine.unitCost` is populated
only for INVOICED transfers and `receive()` never feeds it into
`InventoryService.move()`'s `unitCost`, so a received transfer does not
currently update the destination's weighted-average cost at all").

1. **Does an org warehouse get to dispatch a transfer at all?**
   `resolveTransferSettlement()` (transfers.service.ts) already rejects any
   transfer where either the source or destination `Location.retailBrandId`
   is null, UNLESS both are equal (same-brand, settles `NONE`) or both are
   set and differ (cross-brand, settles `INVOICED`) — a deliberate guard
   against a genuinely misconfigured, unbadged `Location`. An org warehouse
   is, by this codebase's own established convention (the in-transit-bucket
   logic and the cross-brand branch both already use it this way),
   `retailBrandId: null` — there is no `Location.organizationId` field in
   the schema. Left as-is, R13's own flow is unreachable: an org warehouse
   can never dispatch to a branded store, because "one side null" is
   exactly what the existing guard rejects.
2. **What does landed cost update on receive?** `InventoryService.move()`
   only ever stores `input.unitCost ?? null` onto the `StockMovement` row
   it creates — it does not itself touch `ProductVariant.costPrice`; every
   caller that wants `costPrice` recomputed calls
   `weightedAverageCost()` and writes it back itself (confirmed by reading
   `PurchasingService.receiveGoods()`, the one existing caller that does).
   The first implementation attempt here mirrored that pattern directly:
   recompute `costPrice` via `weightedAverageCost()` on every transfer
   receive, the same as a purchase. It was reverted before landing — see
   Options Considered — because `ProductVariant.costPrice` is ONE GLOBAL
   field per variant in the current schema, with no per-location or
   per-node cost tracking anywhere. A `StockTransfer`'s two ends already
   share that one global average (today's single shared-Postgres
   deployment has exactly one `ProductVariant` row per SKU, full stop); a
   transfer is a pure relocation of stock the average already counts, not
   new stock entering the pool the way a purchase or a production run is.
   Recomputing `costPrice` on receive would double-count those units.

### Options Considered
**On recognizing org-central dispatch:**
1. Loosen the existing one-side-null rejection broadly — allow either
   direction, any `Location.type`, whenever one side is brandless. Rejected:
   this also accepts a `STORE`-type `Location` that simply never got
   badged with a brand (a data-entry gap, not org-central intent) and a
   branded store shipping INTO a brandless bucket (not R13's flow — R13 is
   "receives into an org warehouse and pushes stock DOWN," one direction).
   Both would silently launder a misconfiguration into a settlement
   decision.
2. **Add one new, narrow branch to `resolveTransferSettlement()`:
   `source.type === 'WAREHOUSE' && !source.retailBrandId &&
   destination.retailBrandId` → `{ inTransitRetailBrandId: null,
   settlementMode: 'NONE' }`.** Chosen. Requires the source to be
   `WAREHOUSE`-typed (not just brandless), requires the destination to
   already carry a real brand, and only recognizes this one direction — the
   reverse (a branded source shipping to a brandless `WAREHOUSE`) still
   falls through to the pre-existing rejection, same as a brandless `STORE`
   on either side. `settlementMode: NONE` because R13 does not describe
   central purchasing as inter-brand billing — the group already owns the
   stock before and after the move, same reasoning as the existing
   same-brand `NONE` case just above it in the method.

**On landed cost and `costPrice`:**
1. Recompute `ProductVariant.costPrice` via `weightedAverageCost()` on
   every transfer receive, mirroring `PurchasingService.receiveGoods()`
   exactly. Rejected, after landing and reverting it: correct for a
   purchase (new stock entering the average) and wrong for a transfer
   (the same stock already inside the average, relocated). Applied here it
   would silently distort `costPrice` any time another cost-affecting
   event — a purchase, a production run — happened on that variant between
   a transfer's dispatch and its receive, in a way no test or reviewer
   would catch without re-deriving the weighted-average math by hand.
2. **Snapshot `unitCost` onto every `StockTransferLine` at dispatch time
   (previously written only when `settlementMode === 'INVOICED'`, now
   unconditional — a line is a cost-basis snapshot the moment stock leaves
   the source, independent of whether money changes hands for it), and
   pass that same value through into `InventoryService.move()`'s
   `unitCost` on the DESTINATION-crediting call inside `receive()`. Leave
   `ProductVariant.costPrice` untouched by `transfers` entirely.** Chosen.
   This is the literal, narrow fix for ADR-021's own complaint —
   `receive()` now does feed `unitCost` into `move()` — without the
   double-counting risk. The arriving `StockMovement` row carries a true
   landed-cost record (R13's "so a branch's margin reflects what the group
   actually paid" is satisfiable from that row today, by anyone reading
   the movement itself), even though the variant's own blended cost does
   not move.

### Reasoning
Both decisions follow the same shape: recognize exactly the case R13
describes, on the narrowest test the schema and existing conventions
already support, and refuse everything else exactly as before rather than
loosening a guard that exists for a real reason. The `costPrice` reversal
is the more important of the two — it is a genuine architectural fact
about this schema (no per-location cost tracking exists anywhere) that a
naive "copy the purchasing pattern" implementation would have gotten
wrong silently, since the test suite's own fixtures (a single shared
database, one `ProductVariant` row) cannot distinguish "correctly
unchanged" from "incorrectly should have changed" without this reasoning
written down.

### Consequences
- An org warehouse must be `Location.type === 'WAREHOUSE'` and carry
  `retailBrandId: null` to be recognized as org-central; a `STORE`-type
  brandless location is still just a data-entry gap and is still rejected,
  same as before this WO.
- `StockTransferLine.unitCost` is now populated on every transfer, not
  only `INVOICED` ones — a pre-existing test asserting it stayed `null` on
  a same-brand (`NONE`) transfer was rewritten to assert the value instead
  (`transfers.service.spec.ts`). No consumer previously read that column
  expecting `null` on a `NONE` transfer; the only two readers are the
  arriving `StockMovement.unitCost` write this WO adds and the
  `InterBranchInvoice` amount, which already only exists on `INVOICED`
  transfers.
- `ProductVariant.costPrice` remains a single global figure with no
  location or node dimension. The day a real multi-database chain
  deployment exists (`RETAIL-ERP.md`'s own node/replication model, not yet
  built), each node's own `ProductVariant` row becomes genuinely
  independent, and this decision will need to be revisited: at that point
  a `StockTransfer` crossing nodes IS new stock entering the receiving
  node's own local average, the same way a purchase is today, and
  `receive()` will need its own `weightedAverageCost()` call — this ADR's
  "leave `costPrice` untouched" is scoped to today's single-shared-database
  reality, not a permanent architectural stance.
- The minimum web UI to make this reachable (list, dispatch, receive) ships
  in the same change — `/admin/transfers`, `/admin/transfers/new`,
  `/admin/transfers/[id]` — gated by the existing `transfers.manage`
  permission (PRM-2: read-only explanation when absent, not a hidden
  action). No new permission key was needed; `transfers.manage` already
  covers dispatch/receive/cancel and `purchasing.manage` already covers PO
  scope selection, so neither WO-23.3d's backend nor its UI required a
  `ROLE_PERMISSION_SEED` change.

### Status
**Accepted.**

---

## ADR-025 — WO-E.2 is not executed: its own prerequisites (WO-A.1, WO-A.2) were never built, and building them now would be the same speculative-infrastructure trap ADR-019 already rejected

### Context
`10-admin-dashboard.md`'s WO-E.2 ("Retire superseded charts, add guards,
update docs") specs five things, every one of which assumes Track A
shipped first:

1. Delete `sales-chart.tsx` and `donut-chart.tsx`, "only after
   `compactRupees()` is confirmed ported into `chart-theme.ts`" — i.e.
   after WO-A.2 built a `recharts`-based replacement
   (`components/admin/charts/{time-series,comparison,category-bar,share,
   sparkline}-chart.tsx`, `chart-theme.ts`, `chart-data-table.tsx`,
   `scripts/check-chart-imports.mjs`, the `recharts` dependency itself).
2. Enforce that `recharts` is imported only from `components/admin/charts/`.
3. Eliminate every `permissions.includes(` in `apps/web/src`, "achieved by
   A.1's `can()`" — a permission-check helper WO-A.1 was to introduce.
4. Confirm no division-by-100 remains under `components/admin/charts/`.
5. Add a dated note to `04-finance.md` recording that its WO-4.5 rule — "Do
   not add a charting library — those three files are inline SVG and match
   the design system" — was deliberately overridden.

Before starting, the same check ADR-019 ran for Track A's registry
infrastructure was re-run for WO-A.1 and WO-A.2 specifically:
`apps/web/src/components/admin/charts/` does not exist;
`scripts/check-chart-imports.mjs` does not exist; `recharts` is not a
dependency in `apps/web/package.json`; no `can()` permission helper exists
anywhere in `apps/web/src`. Neither work order was ever built — this
session's Track A work stopped exactly where ADR-019 described it: two
hand-authored screens, four existing inline-SVG chart components, no
registry, no `can()`, no chart library.

What does exist, and is live: `sales-chart.tsx` and `donut-chart.tsx`,
each rendered from three real, currently-shipping screens —
`/admin` (the main dashboard), `/admin/insights`, and
`/admin/finance/expenses/analytics` (built this session, WO-B.4). Every
screen built across Tracks B, C, D and E.1 this session — roughly forty
admin pages — uses `getStoredUser()?.permissions.includes('…')` as its
permission check, because that is the only mechanism that has ever existed
in this codebase; `apps/web/src/app/(admin)/admin/(app)/page.tsx`'s own
TAILOR-redirect check (leaned on directly in WO-E.1) is one of the 31
current call sites. `04-finance.md`'s "do not add a charting library" rule
is accurate to the codebase today — no charting library was ever added, so
there is nothing to record as overridden.

### Options Considered
1. **Build WO-A.1 and WO-A.2 now, then execute WO-E.2 as specced.**
   Rejected for the same reason ADR-019 rejected building a minimal slice
   of WO-A.4/A.5 for WO-B.4: it would introduce two new architectural
   layers — a `recharts`-based chart library with its own theme, its own
   accessibility contract, its own import-boundary lint script, and a
   codebase-wide `can()` permission abstraction replacing 31 call sites
   across every module — as a side effect of a work order whose own text
   is "retirement," not "build." Nothing downstream of E.1 asked for a
   second charting vocabulary or a permission-check refactor; both would
   be built solely to satisfy this WO's own acceptance criteria, which is
   the "unused abstraction" and "no real boundary justifies its existence"
   trap `CLAUDE.md` names directly.
2. **Delete `sales-chart.tsx` / `donut-chart.tsx` anyway, replacing their
   three call sites with something ad hoc.** Rejected outright: the
   dashboard, `/admin/insights` and the WO-B.4 expense-analytics screen
   would lose their charts with nothing put back, which is a regression on
   three live, shipped screens — not a retirement of something superseded,
   since nothing supersedes them.
3. **Do the parts of WO-E.2 that do not depend on A.1/A.2, skip the rest,
   record why.** Checked each of the five items individually:
   - Chart retirement (#1) and the `recharts` import boundary (#2): both
     require WO-A.2's unbuilt replacement. Skipped.
   - `permissions.includes(` elimination (#3): requires WO-A.1's unbuilt
     `can()`. This is actually WO-2.8 in `02-admin-shell.md`
     ("Permission-check cleanup"), an earlier, separately-specced,
     similarly never-built work order — not something WO-E.2 itself
     defines. Building it now would be the same speculative-build-to-
     satisfy-an-AC pattern as option 1. Skipped.
   - Division-by-100 check (#4): `components/admin/charts/` does not
     exist, so the check is vacuously satisfied — there is nothing under a
     nonexistent directory to divide by 100. Not a change; just a fact.
   - The `04-finance.md` dated note (#5): would misrepresent history —
     nothing was overridden, so noting an override is false documentation.
     Not written.
   Chosen: this option, which in practice is "no code change."

### Decision
WO-E.2 is not executed. No files are deleted, no dependency is added, no
`can()` helper is introduced, and `04-finance.md` is left as-is because its
existing rule is still true. Track E ends at WO-E.1.

### Reasoning
WO-E.2's title is "retire superseded" — a retirement work order has no
honest content when the thing it retires was never superseded. Every other
work order this session that found its Track A prerequisite missing (B.4,
B.5, D.1–D.6, E.1) had a real, present-tense gap to fill and filled it
against the codebase's actual live idiom instead of the unbuilt registry.
WO-E.2 has no such gap: its acceptance criteria are entirely instructions
to delete, restrict, or document things that depend on infrastructure this
session's own prior decisions (ADR-019, and now this one) declined to
build without a concrete requirement driving it. Building that
infrastructure now, solely to make a deletion-shaped work order have
something to delete, inverts "Feature scope: build the whole capability"
into building a feature nobody asked for so a housekeeping ticket can
close.

### Consequences
- `sales-chart.tsx`, `donut-chart.tsx`, `gauge-chart.tsx` and
  `funnel-chart.tsx` remain the codebase's one and only charting
  vocabulary, exactly as `04-finance.md` WO-4.5 already specifies. Any
  future chart need keeps using them, the same way WO-B.4 and WO-B.5 did
  this session.
- The 31 `permissions.includes(` call sites remain untouched; this is
  `02-admin-shell.md`'s own tracked WO-2.8, not something this ADR
  resolves or claims to resolve.
- If a real future requirement needs a second chart type these four
  inline-SVG components cannot express (e.g. a true multi-series
  time-series with zoom, which `sales-chart.tsx` does not attempt), WO-A.2
  should be scoped and built then, against that requirement — not
  speculatively now.
- `10-admin-dashboard.md` itself is not edited by this ADR; it remains the
  planning document, and its Track A / WO-E.2 text is still accurate as a
  *plan that was not built*, which is exactly what ADR-019, ADR-020 and
  this entry each independently confirm.

### Status
**Accepted.**

## Decision: doc 22's leave schema is struck in favour of payroll's (WO-19.3)

### Context
`22-attendance-shifts-leave.md` was written as a self-contained brief and
sketched its own `LeaveRequest` model with a `typeKey` string field and a
`LeaveStatus` enum (`PENDING`/`APPROVED`/`REJECTED`/`CANCELLED`/`WITHDRAWN`),
deferring "the balance rules" to doc 20. It predates this session's payroll
build (WO-19.1–19.7, `19-payroll.md`), which shipped its own `LeaveType` /
`LeaveKind` (`ANNUAL`/`SICK`/`UNPAID`/`OTHER`) / `LeaveBalance` /
`LeaveRequest` / `LeaveRequestStatus` (`PENDING`/`APPROVED`/`REJECTED`/
`CANCELLED`) models in `payroll.prisma`, live on `main`. Building doc 22 as
written would create a second, incompatible leave system — two tables named
`LeaveRequest` is not possible in one schema, and two different status
vocabularies for the same real-world approval is exactly the "revenue four
ways" trap `CLAUDE.md`'s money lens warns about, applied to leave instead.

### Options Considered
1. Keep doc 22's sketch, rename its model (`AttendanceLeaveRequest`) to avoid
   the collision, and let two leave systems coexist.
2. Strike doc 22's leave schema entirely; WO-22.6 becomes "query the existing
   `payroll` module's `LeaveRequest`/`LeaveBalance`", not a new build.

### Decision
**Option 2.** Doc 22 amended in place: its `LeaveRequest`/`LeaveStatus` block
is replaced with a pointer to `payroll.prisma`'s already-shipped models, and
WO-22.6 is rescoped from "leave, request/approve, and the balance rules" to
"wire `AttendanceException`'s `WHILE_ON_LEAVE` reason against the existing
`LeaveRequest`" — a query, not a schema.

### Reasoning
`payroll`'s leave models are built, tested and posting-integrated; doc 22's
were never implemented. One leave concept is authoritative. `CLAUDE.md`'s own
"No duplicate implementation introduced" and "Preserve existing systems"
rules apply here exactly as they would to two `Order` tables.

### Consequences
- Whoever builds WO-22 (attendance) takes a hard dependency on `payroll`
  being enabled — `LeaveKind`/`LeaveRequest` live there, not in `hr`/
  attendance's own schema. If a deployment runs attendance without payroll,
  `WHILE_ON_LEAVE` degrades to "never fires" rather than failing to boot
  (same absent-collaborator shape doc 22 already specifies for payroll off).
- Doc 20 (`people-positions-ranks.md`)'s deferred "balance rules" reference
  is now stale in the same way; whoever builds doc 20 should point at
  `payroll.prisma` too rather than re-deriving accrual rules.
- No code changes today — both `payroll` and doc 22's build are unaffected;
  this only prevents a future doc-22 implementer from building the second
  model doc 22 used to describe.

### Status
**Accepted.**

## Decision: adopt a shared cross-tenant hosting tier via shared-infrastructure/isolated-data, not shared-schema multi-tenancy

### Context
`ENTERPRISE-SCALE.md`'s Br1 ("one deployment serves exactly one brand")
already names the two conditions under which serving several brands from a
shared operation becomes warranted, and explicitly instructs "do not build
toward this speculatively" until one is real. A request to actually build
a shared, cross-tenant hosting tier is exactly the second condition
("the per-deployment cost stops being justifiable per client") being
exercised on purpose, and doc 39
(`39-shared-cross-tenant-hosting-tier.md`) is the resulting brief. This
entry exists because *how* to share a hosting operation across tenants has
two structurally different answers with very different risk profiles, and
the choice needed to be made explicitly rather than left to whoever
implements doc 39 first.

### Options Considered
1. **Shared-schema multi-tenancy**: one application, one database, every
   table carries a `tenantId`, every query filtered by it.
2. **Shared-infrastructure, isolated-data**: one shared compute/
   orchestration/billing/support layer (the control plane), but every
   tenant keeps its own, fully separate database and application instance
   — a tenant is a node, exactly as `RETAIL-ERP.md` R2/R7 already treat a
   branch.

### Decision
**Option 2.** A tenant's business data is never in the same database, the
same query, or the same schema as another tenant's. The control plane
(`PlatformTenant`, billing, support access) lives in its own separate
database and only ever routes traffic and meters usage — it never reads or
writes a tenant's own business tables.

### Reasoning
Option 1 would introduce a **second, competing isolation model** next to
the one this repository has already built its entire replication and
branch-scoping architecture on (R2/R7's "a node has its own database and is
authoritative for its own facts"). Every isolation guarantee this
repository already makes — tenant/branch-scoped queries, `PermissionsGuard`,
the whole "whose rows, and which columns" lens answered independently in
every document from 20 onward — would need to be re-proven under a shared
schema, where a single missing `WHERE tenantId =` clause is a cross-
customer data breach. Option 2 needs none of that: a request that reaches
the wrong tenant's application instance still cannot reach any other
tenant's database, because no code path exists that connects them. This is
`CLAUDE.md`'s own "can the existing system already solve this?" question,
answered yes — the node/database-per-branch pattern already solves tenant
isolation at one level; this decision is applying it at the level above,
not inventing a new one.

### Consequences
- The cost saving this tier exists to capture comes entirely from the
  compute/operations/billing layer (shared provisioning automation, shared
  monitoring, shared support tooling), not from consolidating data — a
  real, smaller saving than shared-schema multi-tenancy would offer, traded
  deliberately for not having to build and continuously prove a second
  isolation model correct.
- Every tenant's own deployment remains, from its own point of view, an
  ordinary single-brand deployment exactly as Br1 already describes —
  `brand.ts`, the `MODULES` allowlist, and every existing document in this
  set apply completely unchanged inside any one tenant's instance. Nothing
  about this decision touches how a single tenant's own system behaves.
- `SupportAccessGrant` (doc 39 §3) becomes the one new, genuinely
  higher-trust capability this tier introduces — a Newax hosting-ops
  engineer who can, in principle, reach into a tenant's isolated
  deployment for support. It is bounded by an expiry and a full audit
  trail specifically because it is the one place where "isolated data"
  still has a deliberate, narrow, logged door in it.
- `ENTERPRISE-SCALE.md`'s Br1 section and `CLAUDE.md`'s three-axes bullet
  each gain a short pointer to doc 39, the same way `RETAIL-ERP.md` itself
  amended `CLAUDE.md`'s Branch row when it introduced the node/database
  model for chains — Br1 itself is not rewritten, since it still correctly
  describes every individual tenant's own deployment; the pointer only
  names where the control-plane exception is specified.

### Status
**Accepted.**

## ADR-026 — Seven heavier extensibility mechanisms adopted by explicit owner override: EAV, a metadata-rendering engine, BPMN, micro-frontends, a WASM sandbox, a service mesh, and a dedicated crypto microservice

### Context
Docs 104, 105, 107, 113, 114, 125 and 126 each independently scoped a
narrower, cheaper mechanism in place of a general version of the same
capability — a bounded, code-known custom-field overlay instead of a
general EAV model; a purpose-built form renderer instead of a general
metadata-driven UI engine; `ApprovalChain`'s own data-driven tier
configuration instead of a BPMN engine; a scoped iframe/embed-token
pattern instead of full micro-frontend/module-federation architecture;
a restricted expression evaluator instead of a general WASM sandbox; and,
for cryptography and inter-service trust, an in-process versioned
interface instead of a dedicated microservice or a service mesh. Each of
those seven documents gave real, specific engineering reasons: unindexable
EAV queries, a metadata renderer that cannot enforce the design system,
two competing ways to express business logic if BPMN sits next to typed
services, module-federation cost with no independent-deployment benefit at
this team's size, sandbox-escape risk with no example needing more than
arithmetic, and network-hop cost for problems an in-process interface
already solves.

The owner reviewed this reasoning twice, across two separate exchanges,
and instructed explicitly, a third time, that all seven be built anyway —
stating the reason directly: near-term flexibility for "minor upgradation,
additions" as the product's requirements continue to be discovered, and a
deliberate preference for having the heavier mechanism in place *before*
a specific need forces a rushed version of it later. This is a real,
legitimate business judgment a codebase's own architecture documents
cannot make on the owner's behalf — `CLAUDE.md`'s own ordering states
flexibility and resilience outrank other engineering concerns when they
genuinely conflict, and the owner is the party who bears the cost of
being wrong in either direction.

### Options Considered
1. **Continue declining all seven**, holding the position taken in docs
   104/105/107/113/114/125/126. Rejected: the owner's explicit, twice-
   reconfirmed instruction is new evidence this repository's own
   "don't repeatedly revisit a settled decision without new evidence" rule
   is written to respect, not override — an owner's considered business
   decision, made with the trade-offs stated plainly in front of them
   twice, is exactly this kind of evidence.
2. **Build all seven exactly as their maximal, general form implies**
   (an unbounded EAV table with no entity allowlist, a fully generic
   renderer for every screen, a BPMN engine with no typed fallback, true
   independently-deployed micro-frontends, an unrestricted WASM runtime,
   a full service mesh, a standalone crypto service used for every
   operation). Rejected as the literal implementation: this would recreate
   every specific risk named in the original seven documents in its most
   expensive form, for a "minor upgradation, additions" need that does not
   require the maximal version of any of them.
3. **Build all seven, narrowed by the same engineering judgment that
   produced the original bounded alternatives** — each mechanism gets
   built, honoring the owner's explicit instruction, but scoped with the
   same guardrails the declining documents already identified as the real
   risk (an entity allowlist for EAV, a design-system-compliant renderer
   scope for metadata UI, a typed execution core underneath BPMN's visual
   layer, a narrow embed surface for micro-frontends widened only as real
   partners are named, a resource-and-API-limited sandbox for WASM with a
   mandatory security review gate, and a mesh/crypto-service architecture
   that coexists with — rather than replaces — the modular monolith for
   the specific deployments that actually need it).

### Decision
**Option 3.** All seven mechanisms are built. Each is specified in its own
document (140–146), each narrowed exactly the way the original declining
document already identified as the safe boundary, each still gated by the
review discipline its risk level warrants (in particular, WASM sandboxing
and the service mesh/crypto-service split are flagged for the `security`
subagent's review before any production traffic depends on them, per this
repository's own model-routing table).

### Reasoning
Overriding a documented architectural position without a stated reason
would make every future "no" in this repository's own documents
untrustworthy — the next reader would have no way to know whether a
declined pattern stays declined. Recording *why* it was reversed (an
explicit, informed owner decision, not a discovered flaw in the original
reasoning) keeps both things true at once: the original seven documents'
own engineering analysis remains correct and citable on its own terms,
and the decision to build anyway is equally on the record, for the
reason that actually drove it, rather than silently overwritten as if the
original analysis had been wrong.

### Consequences
- Every one of the seven new documents (140–146) inherits a stated
  narrowing from its own predecessor's reasoning — this decision does not
  grant a blank check to build the least-safe version of any of them.
- Docs 104, 105, 107, 113, 114, 125 and 126 are updated with a pointer to
  this entry and to their own successor document, rather than deleted or
  silently contradicted — their own reasoning remains part of the record.
- The WASM sandbox (doc 144) and the service-mesh/crypto-microservice
  split (docs 145–146) are the three highest-risk items in this set; none
  ships to production without the `security` subagent's own review,
  regardless of how this ADR is read later.
- This repository now carries seven additional standing mechanisms with
  their own operational cost (a second rendering pathway, a second way to
  express approval logic, a second frontend composition layer, a sandboxed
  runtime, a mesh, a separate crypto service) that must each be kept
  correct, tested, and maintained going forward — a real, accepted cost,
  not a free option.

### Status
**Accepted for docs 140–143 (EAV, metadata-UI engine, BPMN, micro-
frontends). Partially superseded by ADR-027** for docs 144–146 (the WASM
sandbox, service mesh, and dedicated crypto microservice), which the
owner withdrew after reviewing their actual security exposure — see
ADR-027 below.

## ADR-027 — The three highest-risk items from ADR-026 withdrawn: no WASM sandbox, no service mesh, no dedicated crypto microservice

### Context
ADR-026 recorded the owner's explicit, twice-reconfirmed instruction to
build all seven mechanisms docs 104/105/107/113/114/125/126 had
independently declined, including three flagged in that same ADR as
requiring the `security` subagent's own review before any production
traffic could depend on them: a general WASM sandbox for executing
partner-authored formulas (doc 144), a service mesh (doc 145), and a
dedicated cryptography microservice (doc 146). Before that review took
place, the owner reconsidered the actual security exposure these three
specifically carry — arbitrary code execution against real business
data, a new inter-service trust boundary, and a standalone service
holding every password hash's own verification secret — and asked that
all three be removed, stating plainly that the original request had
misjudged the risk.

### Options Considered
1. **Keep all seven as ADR-026 recorded them**, proceeding to the
   `security` subagent's own review of docs 144–146 before implementation.
   Rejected: the owner's own reconsideration is new evidence overriding
   the *build* decision for these three specifically, arriving before any
   implementation or review work began — there is nothing to review if
   the owner no longer wants the capability built.
2. **Keep the specifications on record as withdrawn-but-documented**
   (mark superseded, retain the files) **vs. delete them outright.**
   Retaining a fully-specified WASM sandbox or crypto-microservice design
   in the repository, even labeled "withdrawn," is itself a standing
   temptation and a maintenance burden for a capability nobody intends to
   build — unlike ADR-026's own seven items, which were live disagreements
   with real alternatives already shipping, these three have no shipped
   code depending on them and no alternative document that needs to point
   at their design details.
3. **Delete docs 144, 145, and 146 outright**, restore docs 114, 125, and
   126 to stating their own original recommendation as this repository's
   current position, and record the reversal here.

### Decision
**Option 3.** Docs 144, 145, and 146 are deleted. Docs 114, 125, and 126
are updated to state that their own original recommendation (a restricted
expression evaluator; the zero-trust principle without a mesh; an
in-process `PasswordHasher` interface) is this repository's current,
standing position, with a pointer to this ADR for the history. The other
four items from ADR-026 (docs 140–143: EAV, the metadata-UI engine, BPMN,
micro-frontends) are unaffected — they carry real but ordinary
engineering trade-offs, not the specific class of security exposure
(arbitrary code execution, a new trust boundary, centralized key
material) that prompted this reversal, and the owner did not ask for them
to be reconsidered.

### Reasoning
An owner recognizing and correcting a misjudged risk is exactly the kind
of new evidence this repository's own "don't repeatedly revisit a settled
decision without new evidence" rule is written to respect — the same
principle ADR-026 itself invoked to justify building these seven items
over the original engineering recommendation now justifies un-building
the three riskiest of them. Deleting the specification documents rather
than leaving them as "withdrawn but present" keeps the repository from
carrying a fully-designed blueprint for capabilities that would need
their own the `security` subagent review before anyone should build them
in the future — a future decision to revisit any of these three starts
from a fresh scoping pass against whatever the actual requirement is at
that time, not from a two-owner-decisions-old design.

### Consequences
- Docs 144, 145, and 146 no longer exist; `docs/implementation/README.md`'s
  own routing table is updated to remove them and to correct the
  144–146 range in its own section header to reflect only 140–143.
- Docs 114, 125, and 126 each carry a short status note pointing to this
  ADR, rather than to a deleted document — a citation to a nonexistent
  file would be a broken reference this repository's own `pnpm check:links`
  discipline exists to catch.
- Doc 128's own `IdentityProvider`/`ShippingCarrier` ports, doc 126's own
  `PasswordHasher` interface, and every other extension point in this
  repository remain the actual, standing mechanism for the legitimate
  underlying needs (algorithm agility, third-party integration) these
  three withdrawn items were never the only way to serve.
- If a genuine future requirement needs sandboxed third-party code
  execution, a service mesh, or a dedicated crypto service, that request
  is scoped fresh, against the actual requirement at that time, and
  routed through the `security` subagent's own review from the start —
  never resumed from these deleted documents' own design.

### Status
**Accepted.**

## ADR-028 — WO-5 (Phase 5: discounts, promo codes, gift cards, store credit) built from zero — permission split, checkout coupling, tender-as-Payment-rows, and the evaluator's own rounding/scope choices

### Context
`docs/implementation/promotions-giftcards/05-promotions-giftcards.md` (WO-5.1 through WO-5.6) was
entirely unbuilt — no `promotions`/`giftcards` module, no `Discount`/
`PromoCode`/`GiftCard`/`StoreCreditTransaction` model, no `evaluateDiscounts`,
no admin or storefront UI. Building the whole capability (per this file's own
"Feature scope" section) required several judgment calls the source document
leaves to the implementer.

### Options Considered and Decisions

1. **Permissions: `promotions.view`/`promotions.manage`,
   `giftcards.view`/`giftcards.manage` — four keys, not the doc's literal two
   (`promotions.manage`, `giftcards.manage`).** Every comparable module in
   this codebase (`finance`, `bom`, `payroll`) splits a read-only `.view` from
   a write `.manage` so a role can see without editing. Shipping only the two
   write keys would leave no way to grant "can see discount performance" or
   "can look up a gift card balance" without also granting the power to
   create one — a real gap the PBAC model exists to avoid. `giftcards.manage`
   is marked `high` sensitivity (creates real monetary liability); STAFF's
   seed gets `promotions.view/manage` and `giftcards.view` but not
   `giftcards.manage` (ADMIN-only), matching how `pos.manage` (high) stays
   ADMIN-only while `pos.operate` (medium) does not.

2. **`orders -> promotions` and `orders -> giftcards` join
   `KNOWN_MODULE_COUPLINGS` as direct NestJS imports, not an extension
   point.** Promo-code/discount usage-count increments and gift-card/store-
   credit balance debits must commit in the SAME transaction as the order
   that consumes them (WO-5's own exit criteria #2 and #3: a race must
   roll back the whole order, not leave an order with no matching ledger
   row). `StockIntakeRegistry`'s own doc comment says exactly this: an
   extension point is for a best-effort write that "didn't happen yet" is
   an acceptable state; a lost promo-code or gift-card race is not — same
   reasoning already accepted for `orders -> inventory`/`orders -> payments`.

3. **`promotions` and `giftcards` are regular core modules (not
   `offByDefault`), expected in every deployment's `MODULES` allowlist —
   not a toggle a shop switches on separately.** The doc's "a shop may want
   one without the other" is satisfied at the DATA level (no `Discount` rows,
   no issued `GiftCard`s — checkout behaves exactly as it does today) rather
   than at Nest-boot time, because `OrdersModule` now hard-imports both
   (per #2) — matching `payments`/`finance`'s own tier, not `pos`/`transfers`'s.

4. **Gift card and store credit tender are each their own PAID `Payment`
   row (`provider: 'gift_card'` / `'store_credit'`), not a discount and not
   a new `Order` column.** The doc is explicit that "a gift card is NOT a
   discount — it is tender." Modeling it as a same-order `Payment` row keeps
   every existing consumer of `Order.payments` (the confirmation email, the
   order detail screen, reconciliation) working unchanged, and reads exactly
   like a split payment: `amount` covered by tender, the remainder charged to
   whatever the customer actually chose. `orders.service.ts`'s `place()`
   computes `remainingToPay` after each tender and still calls
   `PaymentsService.createForOrder` for the rest — even at Rs 0 — rather than
   special-casing "fully covered," so every order keeps exactly the payment
   shape every other consumer already expects.

5. **Evaluator rounding/scope choices, in `packages/shared/src/discounts.ts`**
   (each documented in the file itself, restated here for the record):
   - A `PERCENTAGE`/`TIERED` discount's `maxDiscount` cap on a PRODUCT/
     CATEGORY/COLLECTION scope is applied as an EVEN PER-UNIT ceiling
     (`floor(maxDiscount / matchingQuantity)`), not a lump sum split across
     lines — the lump-sum split can only be expressed by rounding
     `OrderItem.discountUnit` unevenly across one line's own quantity, which
     would make two units on the same receipt line disagree with each other
     for no reason a customer could be told.
   - `TIERED` is evaluated identically to `PERCENTAGE`. The `Discount` model
     (unchanged from the doc) has no tiers array — tiering emerges from
     creating several `TIERED` discounts at different `minSubtotal`
     thresholds and letting the existing "non-stackable: best for the
     customer wins" rule pick the one that applies.
   - `BUY_X_GET_Y`'s discounted units are taken cheapest-first across
     matching lines and averaged evenly across whichever line they land in,
     with the sub-paisa remainder folded into `orderDiscount` so the
     discount's own total is always exact.
   - `COLLECTION` scope reuses the same `productIds`/`categoryIds` match
     arrays as `PRODUCT`/`CATEGORY` — the `Discount` model (unchanged from
     the doc) has no separate collection-membership field, so the caller is
     expected to resolve a collection's member ids before calling in, the
     same way it already resolves a cart line's own `categoryIds`.
   - The storefront's live preview (`/promotions/preview`, called from the
     checkout page before an order exists) sends `categoryIds: []` for every
     line, since `CartLine` (`apps/web/src/types/cart.ts`) carries no
     category data — a `CATEGORY`-scope discount therefore may not show in
     that live preview even though it will still apply correctly at the real
     checkout, where `OrdersService.place()` resolves categories server-side
     via `PromotionsService.categoryIdsByProduct()`. Shipping is previewed at
     Rs 0 for the same reason the existing summary never estimates it
     ("Added for your city" — resolved only at placement), so a
     `FREE_SHIPPING` code's rupee value likewise only shows at the real total.

6. **Selling a gift card as a checkout line item (the `sourceOrderId` field's
   "when it was sold rather than issued by staff" case) is NOT built.**
   `GiftCard.sourceOrderId` exists in the schema exactly as the doc specifies
   it, but making a gift card a purchasable storefront product needs a new
   product kind/checkout path — a separably larger piece of work the doc
   itself only names in passing. Staff-issued gift cards (`POST
   /admin/gift-cards`, `giftcards.manage`) are the complete, real, shipped
   capability; self-serve gift-card purchase is out of scope here and not
   silently stubbed.

7. **`/admin/customers/[id]` ships as a page scoped ONLY to store-credit
   balance and ledger, not a customer profile.** No customer-record admin
   screen exists anywhere in this codebase today (confirmed by search before
   building) — WO-5.6 names this exact route for store credit, and building
   a fuller CRM profile page to go around it would be scope creep this work
   order never asked for. A future customer-profile feature can absorb this
   page's content rather than the reverse.

### Consequences
- `evaluateDiscounts` is pure, shared, and covers both the storefront
  preview and the real checkout with one implementation (18 unit tests in
  `discounts.spec.ts`), per WO-5's exit criterion #1.
- Concurrency exit criteria #2 (a `usageLimit: 1` promo code redeemed by two
  simultaneous checkouts succeeds exactly once) and #3 (a gift card cannot be
  over-redeemed, and its ledger replays to the balance) are proven by a real
  database transaction race in `test/promotions-checkout.e2e-spec.ts`, not
  asserted by convention.
- `Order.orderDiscount`/`itemDiscountTotal`/`OrderItem.discountUnit` are no
  longer dead columns — `04-finance.md`'s own P&L and margin figures now see
  real discount data for the first time.
- Returns/refunds reversing a discount or a spent gift card are Phase 6's own
  work (not yet built) — WO-5 issues store credit for a goodwill/refund
  amount (`StoreCreditService.issueForOrder`) but does not itself reverse a
  `Discount`'s usage count or restore a redeemed `GiftCard`'s balance on an
  order that is later cancelled or returned; that reversal is the same
  "afterlife" gap this file's own scope lenses ask every future work order to
  close explicitly rather than assume.

### Status
**Accepted.**

## ADR-029 — Third-party gift-card redemption at checkout (Giftkarta): a `PaymentProvider`, not a WO-5 tender field; code collected post-order; API contract unverified

### Context
A request came in for "third-party gift card integration" at checkout — a
customer paying with a gift card issued by an outside network, distinct
from this shop's own gift cards (`giftcards` module, WO-5,
`05-promotions-giftcards.md`, ADR-028), which the shop itself issues and
whose ledger it owns. The specific network named was "Giftkarta etc." — no
verified public API reference for a service by that name was available
when this was written.

### Decisions

1. **A third-party gift card is a `PaymentProvider`
   (`apps/api/src/modules/payments/`), not another WO-5-style partial-tender
   field on `PlaceOrderDto`.** WO-5's own gift card and store credit reduce
   `remainingToPay` and still let the customer pick a real payment method for
   whatever is left — that shape fits an asset THIS SHOP owns the ledger for.
   A third-party network's card is, functionally, just another way to pay the
   FULL amount — the same shape COD, bank transfer, JazzCash and Easypaisa
   already are. Reusing that existing extension point (`payment-provider.ts`)
   means the whole settlement lifecycle (PENDING → PAID/FAILED,
   `PaymentSucceeded`/`PaymentFailed`, the `payments.approve` admin surface,
   refunds) is inherited for free; a customer wanting to combine a
   third-party card with another method for a shortfall is not supported —
   exactly as COD/bank transfer/JazzCash don't support that combination
   either, and the shop's OWN gift card/store credit remain the mechanism
   for split tender (ADR-028).

2. **The code is collected on a follow-up screen AFTER the order exists,
   never inside `OrdersService.place()`'s own transaction.** A new
   `PaymentProvider.requiresCode`/`redeemCode()` pair
   (`payment-provider.ts`): `initiate()` makes no external call at all and
   returns `PENDING` immediately; `PaymentsService.redeemGiftCardCode()`
   (called from `POST /payments/:paymentId/redeem-gift-card`, `@Public()`,
   matching `POST /payments/:paymentId/receipt`'s existing unauthenticated
   unguessable-id precedent) validates and redeems the code strictly after
   commit. This mirrors why JazzCash/Easypaisa's own `initiate()` never
   calls their gateway either (only ever prepares a redirect) — a real,
   non-reversible external debit inside a transaction that could still roll
   back for an unrelated reason (a stock race, a promo redemption race) has
   no local undo. `redeemGiftCardCode()` reuses `handleCallback()`'s exact
   settlement shape (update the payment, confirm the order, publish the
   matching event) rather than merging with it, since it is driven by a
   customer-submitted code against one named payment, not an inbound
   webhook matched by reference.

3. **`GiftkartaProvider`'s exact wire format is an explicitly-labeled
   placeholder, not verified vendor documentation.** Unlike
   `JazzCashProvider`/`EasypaisaProvider`/`NidVerificationProvider` in the
   same directory tree — each written against its partner's own published
   API — no confirmed Giftkarta API reference existed when this was built.
   The provider uses the conventions almost every stored-value REST API
   shares (bearer API key, JSON body, a balance-check call, a redeem call
   with an idempotency key) and says so in its own top-of-file comment:
   every endpoint path and field name needs confirming against Giftkarta's
   real API reference before a live card is ever redeemed against it. It
   stays off (`GIFTKARTA_API_KEY`/`GIFTKARTA_API_BASE_URL` unset, `giftkarta`
   absent from `PAYMENT_PROVIDERS`) the same way JazzCash/Easypaisa do.
   Adding a second third-party network later is the same shape: implement
   `PaymentProvider`, add it to `PaymentsService`'s constructor list, add its
   key to the allowlist — nothing else changes (`payment-provider.ts`'s own
   "Adding a provider" note, unchanged by this ADR).

### Consequences
- A failed redemption leaves the Payment `FAILED` and the order `PENDING` —
  visible to staff exactly like a failed JazzCash/Easypaisa attempt already
  is, with no new admin screen needed. The customer can retry with a
  different code against the SAME payment (proven in
  `test/giftkarta-checkout.e2e-spec.ts`); there is no attempt cap beyond the
  endpoint's own throttle (10/min), since the risk is a mistyped code, not
  an attack surface with money at stake on this shop's side.
- The storefront's own follow-up screen
  (`apps/web/.../checkout/page.tsx`) is the ONLY place today that collects
  this code — the order-status page has no matching "finish paying" form,
  the same pre-existing gap bank transfer's own receipt upload already has
  (no storefront upload form exists for it either). A customer who leaves
  before redeeming can still view their (unpaid) order, but cannot complete
  the redemption from there without this gap being closed too — named here,
  not silently left undiscoverable.
- No refund path is built for Giftkarta specifically beyond
  `PaymentsService.refund()`'s existing "staff records that money went back;
  moving it is a manual step" behavior, identical to every other provider.

### Status
**Accepted.**

## ADR-030 — `docs/implementation/`, `docs/erp-lenses/` and `docs/design/` reorganized into domain subfolders, filenames unchanged

### Context
The three largest documentation trees in this repository — 163 numbered
implementation briefs, 195 scope-lens files, 16 design chapters — lived as
flat directories. `docs/implementation/`'s own README explains that its
numbering is chronological (the order requirements were found), not
topical, so "where is the promotions brief" required scanning a 171-entry
table rather than opening a folder. The owner asked for a domain-driven
structure for every `.md` file in the repository.

### Options Considered
1. Leave the flat, numbered layout and rely on the README tables and
   `docs/index/` for navigation.
2. Domain subfolders, drop the numeric prefixes and rename by content.
3. Domain subfolders, **keep every numbered filename exactly as it was**,
   only the containing folder changes.
4. Flat directory with domain-prefixed filenames, no new folders.

### Decision
Option 3, scoped exactly as the owner chose: `docs/implementation/` (163
numbered briefs), `docs/erp-lenses/` (195 files), and `docs/design/` (16
chapters) each gained domain subfolders; every filename — including the
number — is byte-identical to before the move. `docs/implementation/`'s
five meta/governance documents (`00-HOUSE-RULES.md`, `MULTI-SECTOR.md`,
`RETAIL-ERP.md`, `ENTERPRISE-SCALE.md`, `DECISIONS.md`) and its `README.md`
stayed at the tree's root — they are cross-cutting contracts CLAUDE.md
itself cites by exact path, not domain briefs. `docs/erp-lenses/`'s
underscore-prefixed process artifacts (agent drafts, judge outputs, the
cluster/conflict analyses) moved into one `_meta/` folder rather than being
sorted by domain, since they document the catalogue's own authoring
process, not a business domain. Every markdown cross-reference and every
code comment citing one of these paths was rewritten in the same change
(`git mv` plus a scripted pass resolving each `.md` file's relative links
against its own old and new location) — `pnpm check:links` and a
471-link internal-cross-reference sweep both pass clean afterward, with the
sole exception of eight links inside `docs/erp-lenses/_meta/` that were
already unresolvable before this move (a pre-existing "root-style" link
written without a leading `./`) and were deliberately left in the same
broken shape rather than silently "fixed" as an unrelated change.

### Reasoning
Keeping the numeric prefix matters more than it looks: every prose
cross-reference in this corpus ("doc 30", "WO-19.6", "doc 155's own words")
cites a document **by number**, never by folder, so a domain move that
preserved the filename left every one of those thousands of bare-number
citations valid with zero edits — only the minority written as an actual
markdown link or literal path needed rewriting. Dropping the numbers
(option 2) would have broken that convention wholesale for no navigational
gain. Domain folders were chosen per file's actual subject rather than the
README's own chronological batches (a 92–143 "architecture audit" batch,
for instance, split across `architecture-patterns/` and
`integrations-connectivity/` by what each document is actually about), so
the folder someone opens now answers "what is this about," while `docs/
implementation/README.md`'s own table still answers "in what order was
this decided."

### Consequences
- Every future reference to one of these documents should cite its full
  path including the domain folder (or the bare number/filename, which
  remains unambiguous) — a bare `docs/implementation/05-promotions-
  giftcards.md` link now 404s; `docs/implementation/promotions-giftcards/
  05-promotions-giftcards.md` is correct.
- `pnpm index` regenerates `docs/index/` from the moved tree automatically;
  nothing under `docs/index/` was hand-edited.
- The eight pre-existing broken links named above are unchanged business as
  usual — fixing them was out of scope for this move and is tracked here
  only so a future reader does not mistake them for a defect this ADR
  introduced.

### Status
**Accepted.**

## ADR-031 — WO-7 (Phase 7: customer portal, reviews, wishlist, returns, loyalty, mobile parity) built against a missing Phase 6 — tracking/invoice/returns scope narrowed, loyalty math, self-referral guard limits, WO-7.9 mobile parity

### Context
`docs/implementation/customer-portal-loyalty/07-customer-portal.md` (WO-7.1
through WO-7.9) names Phase 6 as a dependency for WO-7.2 (order tracking,
reorder, invoices) and WO-7.3 (self-service returns). Phase 6
(fulfilment/shipping) does not exist anywhere in this codebase — no
shipment, carrier, or tracking-event model, no fulfilment queue. Building
the whole capability per this file's "Feature scope" section required
deciding what to build against a dependency that is not there, rather than
either blocking on it or silently inventing Phase 6 inside this work order.

### Options Considered and Decisions

1. **WO-7.2's tracking timeline reuses the existing `OrderStatusEvent`
   history instead of a new `ShipmentEvent`/carrier model.** Building a real
   shipment model is Phase 6's own job — a fulfilment queue, carrier
   integration, and label/tracking-number lifecycle are separably large
   pieces of work this order only touches in passing ("the other side of
   the same transaction" lens: the operator-facing fulfilment queue this
   would need doesn't exist to feed it). `OrderStatusEvent` already records
   every state transition an order goes through server-side today
   (`PENDING` → `PAID` → ... → `DELIVERED`), so the customer-facing timeline
   renders that real history rather than fabricating carrier-style
   milestones the system has no way to populate honestly. When Phase 6
   ships a real shipment/tracking model, this timeline is the one place
   that needs to switch its data source — not rebuilt from scratch.

2. **Reviews/returns/loyalty permission keys were backfilled as real
   `RoleGrant` rows on the dev database, not left as `Permission` rows with
   no live grant.** This codebase carries a known, tracked two-layer gap
   (`CLAUDE.md`'s own "Feature scope" section names it explicitly):
   `seedPermissions()` is additive and always runs, but `seedRoles()` (the
   backfill from the legacy `RolePermission` enum table into the real
   `Role`/`RoleGrant` system) is strictly one-time and no-ops once any
   `Role` row exists — which this long-lived scratch/dev database already
   has. Adding `reviews.moderate`, `returns.view`/`.manage`,
   `loyalty.view`/`.manage` to `ROLE_PERMISSION_SEED` and re-running the
   seed therefore populated `RolePermission` but granted nothing to a real
   `User` through `UserRoleAssignment`. A one-off script
   (`apps/api/prisma/_scratch-backfill-role-grants.ts`, run once against
   this dev database and then deleted — not committed, since it fixes a
   local database's state, not the codebase) mirrored `seedRoles()`'s own
   backfill logic scoped to just these five keys, so ADMIN/STAFF actually
   hold the grant a real login checks, matching this file's own
   "reachable... every permission seeded through to a real grant" rule
   rather than repeating the exact gap it names as a trap. (`returns.view`/
   `.manage` were later removed outright, not just re-backfilled, when
   WO-7.3's own module was retired in favour of WO-6.6's — see §9.)

3. **The order invoice is a browser `window.print()` page with Tailwind
   `print:` variants, not a server-rendered PDF.** There is no PDF-
   generation library anywhere in this codebase's dependency tree today.
   `.claude/rules/dependencies.md` requires checking the stdlib, the
   framework, and existing utilities before adding a dependency, and
   requires justification for a new one — a one-off "print this order" page
   is fully served by the browser's own print-to-PDF path with print-
   specific CSS (hiding nav/chrome, forcing the receipt-style layout),
   which every modern browser already provides for free. Adding a PDF
   library for a single invoice screen would be exactly the unjustified
   dependency this codebase's own rule warns against; the browser-print
   approach is revisited if a future work order needs invoices generated
   server-side (emailed, bulk-exported) rather than viewed and printed by
   the customer themselves.

4. **WO-7.3's returns are customer-request-and-staff-decision only — no
   automatic refund issuance or stock restock on approval.** `PaymentsService.refund()`
   and `InventoryService.move()` both already exist and are called
   elsewhere in this codebase, but wiring "return approved" to
   automatically reverse the sale (issue the refund, restock the returned
   variant) is exactly the kind of same-transaction afterlife work Phase 6
   is named to own — the doc's own dependency line says so. What WO-7.3
   ships is the complete transaction as far as this phase's dependency
   allows: a customer can request a return against an eligible, delivered
   order (with a quantity guard against the item's own order quantity), see
   its status, and staff can approve or reject it with a reason, generating
   the record and audit trail a future Phase 6 refund/restock step will
   consume as its input — not a return flow that silently claims to
   refund when it does not.

5. **Loyalty earn/redemption math**: points accrue as a flat rate off the
   order subtotal at the moment the order is marked `DELIVERED` (not at
   placement, so a cancelled or returned order before delivery earns
   nothing and needs no reversal path), and are reversible exactly once,
   guarded by the same `rewardedAt IS NULL` conditional-update idiom this
   codebase already uses for backorder/stock idempotency — a second
   `DELIVERED` event or a retried outbox delivery cannot double-award.
   Redemption debits a customer's points balance inside the same
   transaction as the store-credit issuance it produces (via
   `StoreCreditService.creditInTransaction()`, new in this work order),
   guarded by a `balance >= amount` conditional `updateMany` rather than a
   read-then-write, so two simultaneous redemption requests cannot both
   succeed against the same balance.

6. **Referral self-referral guard is a same-account/same-order check only —
   it does not attempt device fingerprinting or IP-based fraud detection.**
   This codebase has no device-fingerprinting or fraud-scoring
   infrastructure anywhere, and building one is a separably large piece of
   work no part of this doc names. The guard blocks the mechanically
   detectable case (a referral code redeemed against the referrer's own
   account, or the same order id credited twice) rather than silently
   claiming to prevent all abuse; a determined bad actor using two real
   accounts is a known, named limitation, not a gap discovered later.

7. **WO-7.9 (mobile app parity) was built as a follow-up pass, once
   WO-7.1–7.8 were verified, rather than folded into the same pass.**
   `apps/mobile` is a separate application with its own build and component
   library; sequencing it after the backend and web surfaces were already
   tested against a real database meant every mobile screen could be built
   directly against a proven API contract rather than a moving target. This
   mirrors this same body of work's own precedent of sequencing genuinely
   separable pieces (Giftkarta after WO-5). Every screen the doc names —
   returns, tracking timeline, credit and gift cards, reviews, wishlist,
   loyalty and referrals — plus notification preferences (named by the
   phase's own work-order list, if not by WO-7.9's one-sentence summary)
   now exists in the Expo app, reachable from the account tab, with wording
   drawn from the same terminology as the web catalogue's `account.*`
   strings (`apps/mobile/src/i18n/messages.ts`'s own test already enforces
   its en/ur catalogues stay in step; there is no separate web-vs-mobile
   wording test, so this ADR is where that intent is recorded instead).

8. **Two narrow, honest gaps inside WO-7.9 itself:** the mobile wishlist
   requires sign-in — there is no on-device guest wishlist store to build
   and migrate the way `apps/web/src/lib/wishlist.ts`'s pre-existing
   `localStorage` implementation forced WO-7.6 to. Building a parallel
   AsyncStorage-backed guest wishlist with its own migration flow, purely
   to mirror a web implementation detail that exists there only because it
   predates the server-side model, would be a duplicate implementation of
   the same migration logic already shipped once for a real reason. A
   signed-out tap on the mobile "Save" button routes to sign-in instead.
   Separately, the order invoice — a browser `window.print()` page — is
   opened from the order screen via `Linking.openURL()` to the storefront's
   own origin (`EXPO_PUBLIC_SITE_URL`, mirroring `EXPO_PUBLIC_API_URL`'s own
   env-var pattern in `src/api/client.ts`) rather than rebuilt as a native
   share sheet or a second PDF pipeline — the same "no PDF dependency to
   build on" reasoning from §3 above, applied to the app that has even less
   precedent for one than the web app does.

### Consequences
- The tracking timeline, invoice, and returns flow are each real, working,
  and honestly scoped to what Phase 6's absence allows — none of them
  fabricate data the system cannot back.
- The two-layer permission-seeding gap is closed for this work order's five
  keys on the dev database specifically; it remains a standing trap for the
  NEXT work order to add a permission key against a long-lived database,
  and is not fixed at the seed-script level by this ADR (that would be a
  separate, larger change to `seedRoles()`'s own one-time-ness, out of
  scope here).
- Phase 6 shipped independently, on a different branch, before this branch
  merged — WO-7.3's own return module was retired outright rather than
  extended in place, since the two turned out to be duplicate
  implementations of the same capability once merged (§9). WO-7.2's
  tracking timeline was NOT revisited to consume Phase 6's real
  `ShipmentEvent` data (a named follow-up, not done here — see the Phase 7
  status blockquote's own §1 note).
- WO-7.9 is built and verified (`apps/mobile` typecheck, its own Jest suite,
  and the repository's full `pnpm typecheck`/`pnpm test` all pass with it
  included) — Phase 7's exit criterion #6 ("every web portal feature exists
  in the Expo app with identical wording") is met for every screen named in
  the work order, with the two narrow, named exceptions in §8 above, and
  its own returns screen was subsequently rewired to WO-6.6's API (§9).

### Status
**Accepted.**

## ADR-031 §9 — WO-7.3's returns module retired in favour of Phase 6's WO-6.6, discovered at merge time

### Context
WO-7.1 through WO-7.9 (this ADR, §1–§8) were built and merged to a local
branch before Phase 6 (`docs/implementation/shipping-fulfilment-returns/
06-shipping-fulfilment-returns.md`) existed anywhere in this codebase —
§1's own reasoning explains why WO-7.2 and WO-7.3 were scoped narrowly
around that absence. Independently, and without visibility into this
branch, another session built the whole of Phase 6 (WO-6.1 through WO-6.8:
shipping zones/rates/methods as real tables, the shipment lifecycle,
courier providers, and — critically — WO-6.6, a complete returns/RMA
module) and merged it to `main` first. Merging this branch into `main`
afterward surfaced a genuine collision, not a textual one: both branches
had independently built a full "customer requests a return on a delivered
order" capability, each with its own Prisma model named `ReturnRequest`,
each with its own API module, and each with storefront pages at the
identical route (`account/returns`, `account/returns/new`,
`account/returns/[id]`). Two Prisma models sharing one name cannot coexist
in a single schema; keeping both implementations was never an option project
architecture allows either way (`CLAUDE.md`'s "a duplicate implementation is
a defect unless a documented boundary requires the separation" — no such
boundary applies here, since both are the same actor performing the same
job on the same entity).

### Options Considered and Decision
Two live implementations existed at merge time:
- **This phase's own** (`returns.prisma`'s `ReturnRequest`/`ReturnRequestLine`,
  the `returns` module, `/returns` and `/admin/returns`): customer
  request → staff approve/reject only, explicitly scoped narrow because
  Phase 6 did not exist yet (§1, §4 above). No restock or refund automation.
- **WO-6.6's** (`fulfilment.prisma`'s `ReturnRequest`/`ReturnRequestItem`/
  `ReturnReasonCode`, the `fulfilment` module's `ReturnsController`/
  `ReturnsAdminController`, `/returns` and `/admin/fulfilment/returns`):
  the full request → approve/reject → in-transit → received → inspect →
  resolve lifecycle, with real inspection-driven restock/write-off and a
  documented refund-issuance hook (`PaymentsService.refund()` first, then
  `resolve()` records the outcome) — exactly the automation this phase's
  own module named as Phase 6's future job.

**Decision: retire this phase's own returns module entirely and keep
WO-6.6's**, rather than keep both, merge them into one hybrid, or keep
this phase's as a "simple" alternative. WO-6.6 is not a rough draft of the
same idea — it is the complete version this phase's own doc comments
(`returns.prisma`'s file header, ADR-031 §1/§4 above) explicitly deferred
to "Phase 6" by name. Keeping the narrower module after the complete one
exists would not be "flexibility" (`CLAUDE.md`'s own "flexibility first"
framing) — it would be two disagreeing sources of truth for the same fact
("has this order been returned, and what happened to the money and the
stock"), which is exactly the kind of drift the "click the number" and
"authoritative source" lenses in `CLAUDE.md`'s feature-scope section exist
to prevent. Because this constituted deleting a chunk of code built earlier
in this same session, the owner was asked explicitly before proceeding
(per this repository's own "No deletion of any kind without the owner's
explicit confirmation" rule) and confirmed retiring the narrower module.

### What changed to retire it
- Deleted `apps/api/prisma/schema/returns.prisma` (the `ReturnReasonCode`/
  `ReturnRequestStatus` enums and `ReturnRequest`/`ReturnRequestLine`
  models), the `returns` field relations it added to `Order`/`OrderItem`/
  `User` in `core.prisma`/`orders.prisma` (WO-6.6 already added its own,
  differently-named equivalents), the `apps/api/src/modules/returns/`
  module (controller, service, DTOs), its `modules.registry.ts`/
  `module-packs.ts` registrations, its `SettingKey.ReturnsWindowDays`
  setting (unused once its only reader was deleted), and the returns-only
  keys from `PERMISSION_CATALOG`/`PERMISSION_GROUPS`/`ROLE_PERMISSION_SEED`
  (`returns.view`/`.manage` — `fulfilment.view`/`.manage` already covers
  the same access, seeded independently by WO-6).
- Stripped the `ReturnRequest`/`ReturnRequestLine` `CREATE TABLE` statements
  out of this phase's own migration (`.../20260924190000_add_customer_
  portal_reviews_wishlist_loyalty/migration.sql`, renamed from its original
  `..._returns_loyalty` to match) rather than leaving a migration that
  creates a table WO-6.6's own later migration also creates — verified by
  running `prisma migrate deploy` against a fresh scratch database, which
  applies both migrations in order with no naming collision.
  `test/customer-portal.e2e-spec.ts`'s own `returns` describe block
  (testing the now-deleted module's endpoints) was removed; return/RMA
  behavior is `fulfilment/returns.spec.ts`'s job now.
- On the web: took WO-6.6's `account/returns` pages as-is, deleted this
  phase's own `apps/web/src/app/(admin)/admin/(app)/returns/page.tsx` and
  its `nav-registry.ts` entry (WO-6.6's `/admin/fulfilment/returns` already
  covers it), removed the duplicate "Request a return" link this phase
  added to the order page (WO-6.6 already added its own, correctly pointed
  at its own `new` sub-route), and repointed `account/overview/page.tsx`'s
  `/returns` fetch to WO-6.6's actual `/returns/mine` route. This phase's
  own orphaned `account.returns.*`, `account.orders.requestReturn` and
  `order.requestReturn` translation keys (built for the now-deleted pages
  and buttons, confirmed unreferenced anywhere in `apps/web/src`) were
  removed from both `messages/en.json` and `messages/ur.json` — WO-6.6 uses
  its own top-level `returns.*` namespace and never reads them.
- On mobile (`apps/mobile`, WO-7.9): rewrote `app/returns.tsx` into
  `app/returns/index.tsx` (list only, mirroring WO-6.6's own
  `MyReturnsPage`) plus a new `app/returns/new.tsx` (the request form,
  mirroring WO-6.6's own `NewReturnRequestPage` — reasons fetched live from
  `GET /returns/reasons` rather than a fixed local enum, since WO-6.6's
  reasons are seeded, editable, and translated server-side), against
  WO-6.6's real API contract (`POST /returns` takes `items:
  [{orderItemId, reasonId, quantity}]`, not this phase's original `lines`/
  `reasonCode` shape). The order screen's "Request a return" button now
  opens `/returns/new?number=...` instead of the deleted list-with-picker
  flow. Mobile's own `returns.*` message keys were updated to match the
  web catalogue's wording exactly (`returns.statusRequested` = "Requested",
  not this phase's original "Awaiting review") — including WO-6.6's four
  additional lifecycle statuses (`IN_TRANSIT`, `RECEIVED`, `INSPECTED`,
  `CLOSED`) this phase's own enum never had.

### Consequences
- One returns system exists, not two — `fulfilment.prisma`'s
  `ReturnRequest` is the only model by that name, `fulfilment`'s
  `ReturnsService` is the only implementation, and every surface (admin
  web, customer web, customer mobile) now points at it.
- The full API/database verification for this consolidation is a single
  paragraph, not a claim: `prisma migrate deploy` against a dropped-and-
  recreated scratch database applies all 65 migrations including both this
  phase's (stripped of returns) and WO-6.6's own, in order, with no
  collision; `prisma generate` succeeds; the full `apps/api` Jest suite
  (120 suites / 1198 tests) passes; `apps/mobile`'s own typecheck and Jest
  suite (including its en/ur parity test) pass; the repository's full
  `pnpm typecheck` (9/9 packages) and `pnpm lint` pass.
- Running the full `pnpm test` surfaced one pre-existing gap in WO-6.6's own
  work, unrelated to the returns consolidation itself:
  `PERMISSION_CATALOG`'s `fulfilment.view`/`.manage` (added by WO-6, both
  branches untouched by each other on this file) were never added to any
  `PERMISSION_GROUPS` entry, which `packages/shared/src/permissions.spec.ts`'s
  own "every catalog key appears in a group" test already existed to catch
  — a test that would have failed on `origin/main` by itself, independent
  of this merge. Fixed here with a new `fulfilment` group (`Shipping &
  returns`), rather than left for a separate PR, since it blocks
  `pnpm test` for anyone building on `main` from this point on.
- WO-7.2's own tracking timeline was not revisited to consume Phase 6's
  real `ShipmentEvent` data even though that data now exists — it still
  renders `OrderStatusEvent` history, same as when it was built under the
  assumption Phase 6 did not exist. This is a real, named follow-up, not
  silently declared done.

### Status
**Accepted.**

---

## ADR-032 — Phase 10 Track A built end-to-end (WO-A.1–A.5), superseding ADR-019/ADR-025; Tracks D and B wired into the registry; WO-E.2 executed

### Context

ADR-019 and ADR-025 both found Track A (`10-admin-dashboard.md`'s
registry/chart/metric infrastructure) unbuilt, and declined to build a
minimal slice of it as a side effect of a narrower work order (WO-B.4,
WO-E.2) — correctly, per `CLAUDE.md`'s own "no speculative functionality"
and "the unused abstraction" traps. This session's task was different: the
owner asked directly for Phase 10 to be completed, so the trade-off those
two ADRs weighed no longer applies — building Track A is the work, not a
side effect of it.

Built, in full, this session:

- **WO-A.1** — confirmed already satisfied by existing primitives rather
  than rebuilt: `FilterBar`/`useFilterParam`/`useSetFilterParam`
  (`filter-bar.tsx`), `useAdminSession().can()` (`session.tsx` — **this
  already existed before this session**, contradicting ADR-025 §"what does
  exist" claim that "no `can()` permission helper exists anywhere in
  `apps/web/src`"; that claim was wrong, not stale — `can()` predates both
  ADR-019 and ADR-025, and `getStoredUser()?.permissions.includes('…')`
  calls were never universally the only mechanism), and
  `admin-shell.tsx`'s `breadcrumbTrail()`. No new primitives were needed.
- **WO-A.2** — `apps/web/src/components/admin/charts/`: `chart-theme.ts`
  (palette added to `packages/shared/src/brand.ts`, not hardcoded — Law 1),
  `chart-data-table.tsx`, `chart-marker.tsx`, `time-series-chart.tsx`,
  `comparison-chart.tsx`, `category-bar-chart.tsx`, `share-chart.tsx`,
  `sparkline-chart.tsx`. Recharts `3.10.1`, pinned exact per D9.
  `scripts/check-chart-imports.mjs` confines it to that folder, wired into
  `pnpm lint`.
- **WO-A.3** — `apps/api/src/core/metrics/`: `metric-provider.ts`,
  `metric-registry.service.ts` (`@Global`, duplicate-key-throws-at-boot,
  permission-gated invocation, per-provider failure isolation, cache keyed
  on from/to/bucket/permission-fingerprint/wanted-keys), `metrics.module.ts`.
  `previousWindow()` added to the existing `core/time/metric-window.ts`
  (not a second file — see Deviations). 100% branch coverage on
  `metric-window.ts`; full spec suite on the registry.
- **WO-A.4** — `GET /admin/analytics/cards` (D2), five metric-provider
  files across `analytics`, `inventory`, `purchasing`, `finance` and `bom`
  modules (11 `MetricProvider` classes total — see Deviations for why more
  than the three the brief names), `card-registry.ts` (~55 cards, 9
  groups), `metric-card.tsx`, `card-group.tsx`, `use-dashboard-metrics.ts`,
  the dashboard's own `RangePicker` extension, `needs-attention-strip.tsx`,
  `comparison-panel.tsx` (wires WO-B.5's already-built `/admin/analytics/
  comparison` endpoint into the new page). `page.tsx` rewritten at 96 lines
  (Stat/BarList/Mini helpers deleted); `loading.tsx` redrawn to match.
- **WO-A.5** — `report-registry.ts` (21 reports across all nine groups —
  see Deviations for why not 25), `analytics-detail-page.tsx`, all seven
  block components (`kpis`/`timeseries`/`share`/`ranking`/`table`/`funnel`/
  `gauge`), `resolve-path.ts` + full spec, the report index page, the
  `[...slug]` catch-all. Four genuinely new endpoints
  (`sales/{revenue,aov,profit,funnel}`) added to the existing
  `analytics.controller.ts`/`analytics.service.ts` rather than a new
  `reports/` subfolder (see Deviations).

Then, in the same session:

- **Track D wiring** — `orders/*`, `purchasing/*`, `products/*`,
  `inventory/*`, `customers/*`, `workshop/*` registry entries, each pointing
  at the endpoint that already existed (built earlier under the "live
  idiom," per ADR-019).
- **Track B wiring** — `expenses/{summary,by-category,trend}` registry
  entries pointing at `finance.controller.ts`'s existing routes; a new
  `FinanceMetricsProvider` (`finance.metrics.ts`) for the Expenses group's
  dashboard cards, which did not exist before this session.
- **The 8 hand-built pages retired**: `/admin/insights`,
  `/admin/orders/insights`, `/admin/customers/insights`,
  `/admin/workshop/insights`, `/admin/inventory/insights`,
  `/admin/products/insights`, `/admin/finance/expenses/analytics`,
  `/admin/purchase-orders/spend` — deleted, every internal link and
  `nav-registry.ts` href repointed to the matching `/admin/analytics/*`
  report, and a permanent `redirects()` entry added in `next.config.mjs`
  for each old path so an external bookmark still lands somewhere real.
- **WO-E.2 executed**: `sales-chart.tsx` and `donut-chart.tsx` deleted
  (their two remaining call sites — the old dashboard and
  `/admin/insights` — were rewritten this session to use the new charts or
  retired outright); the old, pre-Recharts `comparison-chart.tsx` deleted
  too (superseded by `components/admin/charts/comparison-chart.tsx`,
  WO-B.5's own chart). `gauge-chart.tsx` and `funnel-chart.tsx` are kept —
  reused directly by the `gauge`/`funnel` blocks, no wrapper needed. The
  `04-finance.md` dated override note is written (this time truthfully:
  Recharts really was added). This ADR is that note's companion.

### Deviations from the brief, stated here because "an agent that wants to
deviate says so in the PR rather than quietly doing something else"

1. **`MetricValue` gained an optional `label?: string`.** D2's own
   interface (`{value, previous, unit}`) is numeric-only, but D1's card
   inventory requires a `format: 'text'` card
   (`workshop.bottleneck_stage`) and several "+ `_name`" companion pairs
   (`expenses.largest_category_amount` + `_name`,
   `products.top_seller_units` + `_name`, `customers.top_spender_ltv` +
   `_name`). Rather than doubling the registry with a second numeric-only
   key per pair, one optional field carries the name alongside the number.
2. **`previousWindow()` lives in `core/time/metric-window.ts`, not a new
   `core/metrics/metric-window.ts`.** The brief's own file list names a
   second file with the same responsibility (window/bucket maths) as one
   that already existed and was already correct, tested, and DST-safe —
   creating a duplicate would be exactly the "duplicate implementation is a
   defect" case `CLAUDE.md` names. `core/metrics/` holds only the registry
   and provider interface.
3. **Eleven `MetricProvider` classes, not the three
   (`analytics.metrics.ts`, `inventory.metrics.ts`,
   `purchasing.metrics.ts`) WO-A.4 lists.** D2's own permission model is
   one gate per provider ("any one is enough"), but the card inventory
   gates several individual cards (`sales.gross_profit`,
   `purchasing.spend`, `inventory.valuation`, `bom.raw_material_value`,
   `workshop.staff_accounts`) behind a permission STRICTER than their
   group's default. A single provider cannot express two different
   permission gates for two subsets of its own keys, so each such subset
   is its own small provider. `analytics.metrics.ts` alone holds seven
   (`Sales`, `SalesCost`, `Orders`, `Products`, `Customers`, `Workshop`,
   `WorkshopStaff`); `inventory.metrics.ts` and `purchasing.metrics.ts`
   hold two each; `finance.metrics.ts` and `bom-cards.metrics.ts` (new,
   named to avoid colliding with the pre-existing `bom.metrics.ts`
   raw-usage report service) hold one and two respectively.
4. **`cardsFor(enabledModules)` takes one argument, not
   D1's own `cardsFor(permissions, enabledModules)`.** D1's own acceptance
   criterion two lines later — "a zero and 'you may not see this' must
   never look the same" — only holds if a permission-lacking card still
   renders (as an em-dash) rather than disappearing from the list a
   two-argument, permission-filtering `cardsFor` would produce. Permission
   gating happens per-card, inside `metric-card.tsx`, via
   `useAdminSession().can()`; only a missing module removes a card
   outright.
5. **`DASHBOARD_GROUPS`'s ninth group key is `bom`, not D1's own
   `manufacturing`.** Every metric key in that group is prefixed `bom.`
   (`bom.active_recipes`, …), and `MetricRegistryService.keysForGroups()`
   resolves a dashboard `groups=` query param by matching that literal
   prefix — a `groups=` value of `manufacturing` would resolve to zero
   keys. Renaming the group key to match its own metric-key prefix keeps
   the group→key mapping a pure, un-special-cased string match instead of
   a second hand-kept table pairing `manufacturing` with `bom.`.
6. **`ShareBlock`'s `drillTo` and `RankingBlock`'s `href` are declared on
   the block-config types but not wired to a click handler.** Neither
   `ShareChart` nor `CategoryBarChart` (WO-A.2) exposes a per-slice/per-bar
   click callback yet. Faking the navigation with no visible affordance to
   trigger it (an invisible click zone, or a screen-reader-only link list
   with nothing on screen to relate it to) would be a non-functional
   feature dressed as one — worse than the honest gap. `table` blocks
   already deliver "a ranked row you can click," today, via a real,
   visible per-row link (`href` + `interpolateHref`), which is what every
   report in this registry that needs drill-down uses instead.
7. **Only 21 of the "~25" reports are registered**, all of Tracks A, D and
   B (six new sales/orders reports, six existing-endpoint Track D groups
   split into their own reports, three existing-endpoint Track B expense
   reports). `bom/raw-usage` (WO-C.4) is not registered — the BOM &
   Manufacturing dashboard group's own href already points at `/admin/bom`
   directly (D1's own table), and the count of pages retired in WO-E.2
   (eight) already accounted for the full set of hand-built pages that
   needed a registry-entry replacement without it.
8. **The needs-attention strip carries five items, not the six or seven
   the old dashboard's own array held** (`pendingOrders`,
   `paymentsAwaitingApproval`, `followUpsDue`, `lowStockVariants`,
   `failedEvents` — the old page also had `abandonedCarts`, sourced from
   `extendedAnalytics()`, and `pendingPartners`, sourced from a third
   endpoint). Reusing three separate endpoints just for two more pills on
   a strip whose primary job is "orders to confirm right now" was judged
   not worth two more page-load requests; the five kept are exactly
   `GET /admin/analytics/dashboard`'s own `needsAttention` object, unchanged.
9. **`apps/web` gained a real unit-test runner (Vitest) this session.**
   Its `test` script was a placeholder ("no unit tests in web yet") before
   this session — `resolve-path.spec.ts` is WO-A.5's own written
   acceptance criterion, and a spec file that cannot run is not a spec
   file. Vitest, not a second copy of `apps/api`'s Jest config, because
   `apps/web` is a separate `tsconfig`/module-resolution context and
   Vitest needed only a five-line config; `globals: true` keeps the spec
   syntax identical to every `apps/api` spec (`describe`/`it`/`expect`,
   no import). Scoped to pure-logic `*.spec.ts` files only — rendered-page
   coverage stays with Playwright, unchanged.
10. **`admin-shell.tsx`'s own `breadcrumbTrail()` was not extended** to
    reach into `report-registry.ts`'s `parent` chain for the deeper
    analytics slugs. The sidebar's existing longest-href-match logic
    already resolves any `/admin/analytics/*` path to the "Analytics" nav
    item correctly (no broken or missing highlight), and
    `analytics-detail-page.tsx` renders its own full parent-chain
    breadcrumb inside the page itself. The sidebar chrome showing one level
    less depth than the in-page breadcrumb is a real, named gap — not a
    regression — left for whoever next touches nav breadcrumbs generally,
    rather than done as an unplanned addition here.

### Consequences

- Every dashboard card and every analytics report is now a registry entry,
  per D1/D3, with no card or report needing a new component to add.
- Money-in-paisa, permission-gating, and N+1-prevention rules from D2 are
  followed structurally (batched provider queries, never one query per
  metric) with the eleven providers described in Deviation #3, not the
  three the brief names literally.
- `apps/web`'s `test` script now runs real tests (13, all pure-logic) where
  it ran none before; `apps/api`'s test suite grew by the metrics-registry,
  five provider, and four-sales-report spec files (all passing, 100%
  coverage on the two files that specify it: `metric-window.ts`,
  `metric-registry.service.ts`).
- The gaps named in Deviations #6, #7 and #10 are real, scoped, and
  written down rather than silently absent — the next work order that
  needs slice-level drill-down, the `bom/raw-usage` report, or a deeper
  sidebar breadcrumb has a stated starting point instead of a rediscovery.

### Status
**Accepted.**

## ADR-033 — `admin-platform` docs 02/44/72/75 completed; doc 75's own claims corrected after they were found false against the running code

### Context

The owner asked directly for five `admin-platform` documents to be pulled
and checked against the actual codebase, then completed: `02-admin-shell.md`,
`10-admin-dashboard.md` (already complete, ADR-032), `44-manager-action-
hub.md`, `72-fragmented-tool-consolidation-import.md`, and `75-managerial-
todo-widget-coverage-note.md`. Direct verification (`grep -rln
"ActionHubSource" apps/api/src` returning nothing) found doc 75's own text
false: it asserted leave requests, timesheet approvals and expiring
documents were "already registered" against doc 44's action hub, when doc
44's hub did not exist in the codebase at all. This is the same failure
mode ADR-025 found in the opposite direction (Track A claimed unbuilt when
actually blocked) — a doc's prose was never re-verified against the
running code and drifted from it silently. Doc 02 was found genuinely
near-complete (four stray `<table>`s, five stray money conversions); doc
72 was found partially built (`ProductImportService` existed with no
dry-run; `ContactImportService`/`ExpenseImportService` did not exist).

### Decision

Built, this session:

- **Doc 44 (action hub)** — `apps/api/src/core/action-hub/`
  (`ActionHubSource` interface, `ActionHubRegistryService` — duplicate-id
  throws, per-source failure isolation, merge-sorted by due date —
  `ActionHubModule`, `ActionHubController` at `GET /admin/action-hub`),
  registered against `payroll`'s `LeaveRequestActionSource` (the one real,
  buildable source — see Deviations for why not the other five named in
  the brief), the dashboard's `action-hub-widget.tsx`, the `/admin/
  my-actions` overflow screen, and its nav entry. Full spec coverage on
  the registry and the one source.
- **Doc 72 (CSV import consolidation)** — `ContactImportService` (`crm`,
  upsert by phone/email through `CrmService.upsertContact`),
  `ExpenseImportService` (`finance`, create-only through
  `FinanceService.createExpense`), dry-run mode retrofitted onto all
  three importers including the pre-existing `ProductImportService`, a
  shared `IMPORT_ROW_CAP` constant in `@newax/shared` replacing three
  independently-chosen numbers, controller endpoints (template + import
  with `dryRun`) on `crm` and `finance`, and a shared `CsvImportCard`
  component powering new `/admin/contacts/import` and `/admin/finance/
  expenses/import` screens (upload → preview → commit → summary), linked
  from both list pages. Specs for all three importers.
- **Doc 02 (admin shell)** — the last two measured gaps closed: the four
  remaining bare `<table>` usages (`users/[id]`, `finance`, `fulfilment/
  returns/[id]`, `stitching/jobs/[id]`) migrated to `DataTable`
  (`users/[id]`'s permission matrix uses `DataTable`'s own `groupBy`/
  `renderGroupHeader`, built for exactly this case); five stray
  `/100`↔`*100` money conversions (`recipe-editor.tsx`'s `labourCost`/
  `overheadCost`, `ai/page.tsx`'s `monthlyBudgetPaisa`, `payroll/
  compensation` and `payroll/runs/[id]`'s `amountMinor`, `garments/
  [id]`'s `stitchingPrice`) switched to `toMajor()`/`toMinor()`.
- **Doc 75 (coverage note)** — rewritten. It asserted three sources were
  registered against doc 44's hub; only one (`LeaveRequestActionSource`)
  is. The other two named (timesheet approvals, expiring documents) and
  three more claimed in a later paragraph (advances, stalled multi-tier
  approvals, unassigned tickets) all depend on documents (25, 27, 28, 42,
  54, 63, 64) that are themselves unbuilt — their sources cannot register
  because the modules producing their data do not exist. The corrected
  doc states this plainly and names a `grep` a reader can run to re-verify
  it, rather than a claim taken on trust.

### Deviations from the brief, stated here because "an agent that wants to
deviate says so in the PR rather than quietly doing something else"

1. **`ActionHubSource.fetchFor()` takes `AuthenticatedUser`, not doc 44's
   own `fetchFor(actorPositionId: string)`.** No position or
   reporting-hierarchy concept exists anywhere in this codebase's schema
   (Org/Brand/Branch tiers exist; individual management positions do
   not) — `grep` for "position" across `apps/api/src/modules` finds
   nothing resembling one. `AuthenticatedUser` (with its resolved
   `permissions` array) is this codebase's actual authorization
   primitive, and every source's own permission check already gates on
   it identically to every other route in this codebase.
2. **The endpoint is gated on `analytics.view`, not doc 44's own
   `admin.dashboard.view`.** That permission key does not exist in
   `packages/shared/src/permissions.ts` — confirmed by `grep`.
   `analytics.view` is the actual gate on the existing dashboard this
   widget lives on, so the hub is reachable by exactly the roles that can
   already see the dashboard it sits on, no broader and no narrower.
3. **Only one source is registered, not the five-plus doc 44 and doc 75
   both name.** Building the other five would mean building five entire
   unbuilt HR/payroll/support documents (25, 27, 28, 39/42, 63, 64) as a
   side effect of this work order — the exact "unplanned scope, silently
   absorbed" trap `CLAUDE.md` names. `LeaveRequestActionSource` is the one
   source whose underlying model (`LeaveRequest`, `payroll.prisma`)
   already exists, so it is the only one that can be built honestly.
   Doc 44 and doc 75 are both explicit that the registry adds a source
   with zero changes to the hub itself — the day docs 25/27/28/42/63/64
   are built, each registers its own source at zero hub cost, which is
   the coverage promise this session verified rather than assumed.
4. **`ContactImportService`'s CSV column is `city`, not doc 72's own
   `address`.** `Contact` (`crm.prisma`) has no `address` field, only
   `city` — confirmed by reading the model. Inventing an `address` column
   with nowhere to store it would mean silently dropping every value a
   real spreadsheet put in that column, which is worse than naming the
   column the schema actually has.
5. **`ExpenseImportService` does not refuse a row dated into a CLOSED
   `FiscalPeriod`**, despite doc 72's own acceptance criterion naming
   this exactly. Two independent reasons, not one: (a) `finance.
   service.ts`'s own header states the invariant this file preserves —
   "finance never imports AccountingService... works identically whether
   or not `accounting` is in MODULES" (R15, "accounting couples to
   nothing") — querying `FiscalPeriod` (owned by `accounting`) from an
   import service in `finance` would violate exactly the decoupling this
   codebase already committed to. (b) More importantly: **no write path
   in this codebase enforces this today, for anyone.**
   `AccountingService.resolveOpenPeriod()` — the only place a
   `FiscalPeriod` is ever consulted before posting — silently re-dates
   the *journal entry* into whichever period is currently open rather
   than rejecting the source record, identically for a manually entered
   expense (`FinanceController.createExpense`) and an imported one. Doc
   72's acceptance criterion describes behavior that does not exist for
   manual entry either; building it only for CSV import would make a
   spreadsheet row stricter than typing the same expense by hand, which
   is inconsistent, not safer. If closed-period rejection is wanted, it
   belongs in `AccountingService.resolveOpenPeriod()` itself, applying
   uniformly to every posting path — a separate, larger decision, not one
   to make silently inside an importer.
6. **A new shared `CsvImportCard` component, not a reuse of the existing
   `/admin/import` (catalogue) screen's own JSX.** The catalogue screen's
   `ImportSummary`/`ImportRowResult` types are SKU-specific
   (`apps/web/src/types/api.ts`); doc 72's own restated interface uses a
   generic `key` field instead. Rather than reshaping a working, already-
   shipped screen to fit a shared generic (risking a regression to
   `/admin/import` for no requirement asking for one), a new
   `CsvImportSummary`/`CsvImportRowResult` pair and a new `CsvImportCard`
   component serve the two new importers; `/admin/import` is untouched.
7. **`/admin/import`'s own dry-run UI was not added.** `ProductImportService`
   gained dry-run mode this session (doc 72 WO-72.3 names retrofitting it
   explicitly), but its existing page never exposed a `dryRun` toggle
   before this session and doc 72's own WO-72.4 names only "the contacts
   list and the expenses list" for the UI work order. Adding a preview
   step to a third, already-shipped screen not named in the work order is
   scope this document did not ask for; the backend capability exists and
   is spec-proven, ready for a future work order to surface if the
   catalogue screen ever needs it.
8. **Doc 02's own remaining money-conversion debt is not fully closed.**
   `finance/expenses/page.tsx`, `customers/[id]/page.tsx` and `customers/
   gift-cards/page.tsx` each still convert rupees↔paisa with bare
   `Math.round(... * 100)`/`... / 100` rather than `toMinor()`/`toMajor()`.
   These were not part of doc 02's own measured inventory (four `<table>`s,
   the four-then-five conversions actually named) rediscovered this
   session — they are a materially larger, admin-app-wide pattern, not a
   miss in an otherwise-converted file (none of the three files imports
   `toMinor`/`toMajor` anywhere else). Fixing them is real, correctly-
   scoped work for a future pass, not something to silently fold into
   this document's own closing.

### Consequences

- The action hub, the two new CSV importers, and doc 02's last measured
  gaps are real, tested infrastructure — not prose. `pnpm lint`,
  `pnpm typecheck` and the full test suite (24 new tests across five
  spec files) pass; `check-module-boundaries.mjs`,
  `check-route-permissions.mjs`, `check-permission-checks.mjs`,
  `check-links.mjs` and `check-rebrand.mjs` all pass clean.
- Doc 75 no longer asserts anything a `grep` cannot confirm — the
  specific failure this ADR's Context names cannot recur silently,
  because the corrected document names the exact command that verifies
  it.
- Deviations #3, #7 and #8 are real, scoped, named gaps rather than
  silently absent work: the next work order that builds doc 25, 27, 28,
  42, 63 or 64 has a stated zero-cost registration path (§Decision, doc
  44); the next one that wants dry-run on the catalogue's own import
  screen, or wants the remaining money-conversion debt closed, has an
  exact file list instead of a rediscovery.
- Deviation #5 leaves a real gap in doc 72's own acceptance criteria
  (closed-period rejection) that this codebase does not implement for
  ANY expense-creation path, not only the imported one — named here so a
  future decision to add it is made once, in `AccountingService.
  resolveOpenPeriod()`, not divergently in each caller.

### Status
**Accepted.**

---

## ADR-034 — The wallet module (doc 155) built in full, shipped module-off and checkout-disconnected pending WO-155.0's own legal confirmation

### Context

`docs/implementation/commercial-licensing-agency/155-wallet-stored-value-merchant-escrow.md`
specifies Newax-issued store credit (`WalletAccount`/`WalletEntry`,
PURCHASE → RESERVE → REDEEM/RELEASE_RESERVATION) settling a merchant as an
ordinary trade payable (`MerchantPayable`) — a structure the doc's own
opening section explains was deliberately revised from an earlier
per-merchant *escrow* design specifically to avoid the PSO/PSP question a
platform holding a third party's funds in trust would raise. The revised
structure genuinely reduces that specific risk (neither leg is "holding
someone else's money"), but the doc's own WO-155.0 still asks for a real
lawyer's confirmation, before this handles real money, that (a) the credit
is genuinely closed-loop and (b) the merchant agreement documents Newax's
own buyer/facilitator role. No agent can provide that confirmation. The
task that produced this entry carried an explicit, separate instruction
from the owner: build the full mechanism, but do not make it live.

Two further facts shaped the build:

- `apps/api/prisma/schema/invoicing.prisma` was being extended with
  `CreditNote`/`DebitNote` (doc 145) by a different, concurrent agent.
  Checked directly at build time: neither model existed yet in that file.
- This codebase has no separate `PaymentRun` batch-settlement entity —
  `PurchasingService.recordSupplierBillPayment()` settles one
  `SupplierBill` at a time. "The batch payment-run mechanism this
  repository's own AP side already uses" (doc 155 §3) has no literal
  batch-entity precedent to reuse.

### Options Considered

- **Build nothing until WO-155.0 clears.** Rejected — the owner asked for
  the mechanism built now, with the legal step tracked as the one
  remaining gate, not for the whole feature to wait on it.
- **Build everything and enable it by default.** Rejected outright — this
  is the one thing WO-155.0 exists to prevent; shipping it live would
  make a regulatory judgement call an agent has no standing to make.
- **Build everything, gate it behind the existing `MODULES` allowlist,
  off by default, with the checkout integration point named but not
  wired.** Adopted — the mechanism this repository already uses for
  every other "not ready for every deployment yet" capability
  (`transfers`, `pos`, `identity-verification`, `accounting`), applied
  here for a regulatory rather than a product-maturity reason.
- **For the REDEEM-branch `refund()` correction, block on doc 145.**
  Rejected — `CreditNote` not existing yet is exactly the kind of
  cross-agent timing gap CLAUDE.md's own instructions for this task
  anticipated; blocking would leave "the undo fan-out" lens's own
  required answer unhandled, which the doc treats as a defect, not an
  acceptable gap.

### Decision

Build WO-155.1 through WO-155.5 in full — schema, both services, every
method named in the doc, permissions seeded to real roles, tests, and UI —
and ship it exactly the way this repository already ships a capability
that is real but not yet appropriate for every deployment:

1. **`wallet` is a new, independent module**
   (`apps/api/src/modules/wallet/`), registered in `modules.registry.ts`
   with `offByDefault: true` and classified `core` in `module-packs.ts`.
   It is listed on the `# Available:` line of all three `.env*.example`
   templates and enabled in none of them. No deployment's `MODULES`
   includes it today.
2. **Its own schema file** — `apps/api/prisma/schema/wallet.prisma`
   (`WalletAccount`, `WalletEntry`, `WalletAdjustmentRequest`,
   `MerchantPayable` and their enums) — additive, touching
   `invoicing.prisma` nowhere, so the concurrent doc-145 agent's own work
   in that file never conflicts. Migration:
   `20260925170000_add_wallet_merchant_payable`.
3. **`WalletService.placeOrderWithWalletCredit()` is built, tested
   directly, and not called from `orders.service.ts` or `cart`.** The
   live checkout flow's only payment options today are the ones already
   wired before this task; the wallet tender is a named, working method a
   human wires in once WO-155.0's confirmation is recorded — not an
   unreachable stub, a real method with a full spec suite that nothing in
   the live request path currently calls.
4. **The REDEEM-branch refund correction is a port, not a hard
   dependency on doc 145.** `wallet-credit-note.port.ts` defines
   `CreditNoteService` (one method, `issueForMerchantPayable`) and binds
   it, in `wallet.module.ts`, to
   `MerchantPayableAdjustmentCreditNoteService` — a real, tested default
   that reduces the `MerchantPayable` before payout, or records the
   amount owed back (via `AuditService`) when it is already `PAID`,
   exactly the answer "the undo fan-out" lens requires, never a throw or
   a silent no-op. The PURCHASE-branch refund (`refundPurchase()`) needed
   no such port — it is an ordinary `REFUND` entry against Newax's own
   Deferred Revenue liability, and a real posting-rule reversal
   (`WalletPostingRulesSubscriber.onWalletCreditRefunded`).
5. **`identity-verification` (also off by default) is read through a new
   extension point, not imported.** `schedulePayoutRun()`'s own
   verified/unverified timing branch needs `IdentityVerification.status`;
   rather than a direct cross-module import (which the doc's own words —
   "reads doc 18's own `IdentityVerification.status` directly" — could be
   misread as licensing), this adds
   `core/extension-points/identity-verification-status.registry.ts`, the
   same `register()`-from-`onModuleInit()` idiom `CameraPeopleCountRegistry`
   already uses. With `identity-verification` off, `isApproved()` resolves
   `false` — every merchant treated as unverified, never fast-tracked by a
   module that was never asked.
6. **Accounting posts through a new subscriber, not a direct call.**
   `WalletPostingRulesSubscriber` (in the `accounting` module, also off by
   default) subscribes to `WalletCreditPurchased`/`WalletCreditRedeemed`/
   `WalletCreditRefunded`, matching `PostingRulesSubscriber`'s own R15
   idiom exactly — `accounting` still imports nothing and knows nothing
   about `wallet`. One new chart-of-accounts entry, `2400 — Deferred
   Revenue — Wallet Credit` (`LIABILITY`), added to `CHART_OF_ACCOUNTS`
   (seeded unconditionally by `seed.ts`, as every account already is).

### Reasoning

Gating on `MODULES` rather than, say, a feature flag or a commented-out
route, is the mechanism this repository already has for exactly this
shape of problem — "real, tested, not appropriate for every deployment
yet" — and reusing it means no new on/off mechanism exists for a reviewer
to learn, and `scripts/check-env-templates.mjs`/`check-module-boundaries.mjs`
already enforce that it stays honestly off (a template that quietly
enabled `wallet` would fail `check-env-templates.mjs`'s own discoverability
rule the same way it would for `transfers` or `pos`). Splitting the
REDEEM-branch refund into its own port rather than either blocking on
doc 145 or writing directly against the model doc 145 might land keeps
both agents' work independent: this module ships complete and correct
today, and swapping the port's binding for a `CreditNote`-backed
implementation later is a one-line change in `wallet.module.ts`, not a
rewrite of `WalletService.refund()`.

### Consequences

- Every acceptance criterion in doc 155's own "Acceptance" section is
  proven by a spec that calls the real service directly:
  `availableBalance()`'s three transitions, `onMerchantConfirmed()`'s
  atomic two-write (including a forced mid-transaction failure),
  the verified/unverified payout-timing branch, and idempotency of a
  retried `purchaseCredit()`/`onMerchantConfirmed()` call —
  `wallet.service.spec.ts`, `merchant-payable.service.spec.ts`,
  `wallet-credit-note.port.spec.ts`,
  `wallet-posting-rules.subscriber.spec.ts` (60 wallet-specific tests;
  1528 passed, 0 failed, across the full `apps/api` suite after this
  change).
- The UI is real and reachable the moment a deployment turns the module
  on: `/account/wallet` (customer balance/history, gated in
  `dashboard-nav.tsx` by the same `/meta`-driven module check the admin
  shell already uses), `/admin/wallet` and `/admin/merchant-payables`
  (+ `[id]`) with `nav-registry.ts` entries carrying `module: 'wallet'`,
  so they are simply absent from the sidebar and command palette on every
  deployment today, per PRM-5/MOD-1, not a broken link.
- Three permissions — `finance.wallets.adjust`, `.adjust.approve`,
  `finance.merchant-payables.dispute` — are in `PERMISSION_CATALOG` **and**
  seeded through `ROLE_PERMISSION_SEED` (`.adjust` to `STAFF`, all three to
  `ADMIN`), avoiding the `seedPermissions()`-vs-`seedRoles()` gap
  `permissions.ts` itself warns against.
- **Until this entry's Status changes, `wallet` must not be added to any
  deployment's `MODULES`, and `placeOrderWithWalletCredit()` must not be
  called from `orders`/`cart`.** Both are one-line changes once WO-155.0's
  own confirmation is recorded here or in a superseding entry — this ADR
  is that gate, not a description of a permanent limitation.
- **Deviations from the doc's own literal text, each with its reason
  where it lives in code:**
  1. `WalletAccount.customerId` names `User`, not the doc's own literal
     `Party`/`Contact` — matches this codebase's existing sibling ledger
     (`StoreCreditService`/`StoreCreditTransaction`), which already keys
     an identical customer-balance concept to `User.id`. Documented on
     the model itself (`wallet.prisma`).
  2. `@@unique([customerId])`, not the doc's own
     `@@unique([organizationId, customerId])` — `organizationId` is
     nullable at Solo/Chain tier (RETAIL-ERP.md R14), and Postgres does
     not treat two `NULL`s as equal in a unique constraint, so the doc's
     own literal compound key would not actually enforce "one wallet per
     customer" outside the Organization tier. Documented on the model.
  3. `refund()` is a thin dispatcher over two internal methods
     (`refundPurchase()`, `refundRedeemedOrder()`) rather than one method
     branching at runtime on which id it received — each keeps its own
     precondition checks (which id, what it may exceed) as a compile-time
     guarantee. The doc's own single `refund()` name is still the public
     entry point.
  4. `MerchantPayableService.schedulePayoutRun()`'s own unverified path
     needs "the customer's own doc 07 'confirm receipt' action," which
     this codebase does not build as a distinct signal (checked
     directly). It uses the closest concrete proxy that exists,
     `Order.status === 'DELIVERED'`, named as a proxy in the method's own
     comment rather than silently assumed to be the same thing.
  5. `processPayoutRun()` settles every `SCHEDULED` `MerchantPayable` for
     one merchant in one call — this codebase's own AP settlement idiom
     (`recordSupplierBillPayment`'s one-bill-at-a-time shape) applied
     across a set, since no separate `PaymentRun` entity exists to reuse
     literally.
  6. Neither `WalletAccount`, `WalletEntry` nor `MerchantPayable` carries
     a numbered-document field (`number`) — the doc's own Prisma snippets
     never show one for any of the three, unlike `PurchaseOrder`/
     `SupplierBill`/`GoodsReceipt`. No `nextXNumber()`-style generator was
     built for this module; adding one would have been speculative.

### Status
**Accepted, pending legal review before enablement.** WO-155.0 is the one
open item: real counsel must confirm the closed-loop design and the
merchant-agreement characterisation before `wallet` is added to any
deployment's `MODULES` or `placeOrderWithWalletCredit()` is wired into
checkout. Record that confirmation as a new entry here (or an update to
this one) before either happens.

---

## ADR-036 — WO-145 (receivables: CreditNote/DebitNote, credit limits, dunning) keys the customer to `Contact`, not R18's own `Invoice`; ships undimensioned like its siblings; dunning gets its own cron, not doc 54's unbuilt registry

### Context — what problem required a decision?

`RETAIL-ERP.md` R18 names the `invoicing` module's full scope: "`Invoice` +
`InvoiceLine`, `CreditNote`, payment terms, and `receivables` (aging,
credit limits, statements, dunning)." AR aging was already real
(`accounting/aging.ts`, `gl-reports.service.ts`'s `agedReceivables()`) but
`CreditNote`/`DebitNote`/`dunning`/`creditLimit`/`statement` returned zero
hits anywhere in `apps/api/src` (verified by search before writing
anything). Doc 145's own schema sketch pairs `CreditNote.invoiceId` with
R18's `Invoice`, and its own Acceptance criterion #1 demands the note
"reduces that customer's own aging balance ... reconciling against
`accounting/aging.ts`'s own bucket totals." Checking those two demands
against the actual schema surfaced a real conflict: this codebase's
`Invoice` (`invoicing.prisma`) is a bounded, `tradingpartners`-scoped MVP —
its own file header says so explicitly ("a bounded MVP, not RETAIL-ERP.md's
full R18 invoicing module... needs the accounting module's FiscalYear/
FiscalPeriod machinery and is its own, much larger tranche") — and it is
never posted to the general ledger. `agedReceivables()` ages `JournalLine`
rows keyed by `contactId`, sourced from `Order`'s own `OrderPlaced` posting.
Building `CreditNote` against `Invoice` as literally sketched would make
Acceptance criterion #1 permanently untestable: there is no ledger entry
for an `Invoice` to reduce.

### Options Considered

1. **Build `CreditNote`/`DunningEvent` against `Invoice`/`TradingPartner`
   exactly as sketched**, and separately build a new posting path so
   `Invoice` gains a real ledger presence for the first time. Rejected: this
   silently absorbs R18's own already-named "much larger tranche" (the full
   `invoicing` module's FiscalYear/FiscalPeriod integration) into a receivables
   work order that never asked for it — exactly the "separably larger
   capability silently stubbed into scope" CLAUDE.md's own scoping-pass
   forbids, in the opposite direction (silently *expanded* instead of
   silently *skipped*).
2. **Build `CreditNote`/`DunningEvent` against `Invoice` anyway, and quietly
   skip Acceptance criterion #1's reconciliation test.** Rejected outright —
   an acceptance criterion is not optional once the doc that states it is the
   brief being built from; shipping around a stated test is not a smaller
   version of the feature, it is a broken one (CLAUDE.md's own words, "Feature
   scope").
3. **Key `CreditNote.customerId`/`DunningEvent`'s implied recipient to
   `Contact.id`, and the document each credits to `Order.id`, not
   `Invoice.id`.** `Contact`/`Order` is the entity pair the real, already-
   shipped AR ledger already keys off — `Order.contactId`, `onOrderPlaced`'s
   own AR posting tagging its `JournalLine` with `contactId`. Selected.

### Decision — what was selected?

Option 3. Every model in `receivables.prisma` keys `customerId` to
`Contact.id`; `CreditNote.orderId` (renamed from the doc's own `invoiceId`)
references `Order.id`. `DebitNote.supplierId`/`supplierBillId` needed no
equivalent change — they already matched `Supplier`/`SupplierBill`/
`agedPayables()` exactly as doc 145 sketched them, because the AP side of
this codebase's ledger already works the way R18 assumed.

Two further, smaller decisions rode along with the same "check before
building" discipline:

- **No `organizationId`/`retailBrandId`/`branchNodeId`/`costCentreId`
  columns on `CreditNote`/`DebitNote`/`CustomerCreditTerm`.** Doc 145's own
  sketch includes them directly on the documents. Checked against every
  sibling financial document these two correct — `Order`, `Invoice`,
  `PurchaseOrder`, `SupplierBill` — none carries those columns; only
  `JournalLine` does (`accounting.prisma`), set once, at post time, by
  `PostingRulesSubscriber`, identically to how every other document's own
  posting already sets them. Adding the columns to the source documents
  would be a dimension nothing else in this codebase sets at that layer —
  CLAUDE.md's "Every column or none" lens answered honestly (undimensioned,
  like the siblings) rather than papered over with an unused column.
- **Dunning gets its own `DunningCron`, not doc 54's `ExpiringRecordSource`
  registry.** Doc 145's own text asks to "register `Invoice.dueDate`
  against doc 54's existing `ExpiringRecordSource` watcher." Doc 54
  (`docs/implementation/hr-people-org/54-employee-document-lifecycle-
  alerts.md`) is itself unshipped — verified by search: no
  `ExpiringRecordSource` type, registry, or nightly watcher exists anywhere
  in `apps/api/src`. Building that generic registry here, unrequested, would
  repeat Option 1's mistake at smaller scale. A dedicated cron follows this
  codebase's own actual convention instead — one cron per module
  (`purchasing.cron.ts`, `cod-risk.cron.ts`, `inventory.cron.ts`, none of
  which share a registry either), not the not-yet-real shared one doc 145
  assumed.

### Reasoning — why?

Every alternative either silently expanded this work order into unrelated,
unrequested scope (Option 1, and building doc 54's registry), or silently
shipped a feature whose own stated acceptance test could never pass
(Option 2). Keying to `Contact`/`Order` is not a smaller feature — the AR
ledger, the aging report, and the credit-check function
(`CreditTermsService.checkCreditAvailable()`) all now reconcile to the
exact same numbers a manager already reads, which is what R18's own
`receivables (aging, credit limits, ...)` phrase was asking for in the
first place. `Invoice`'s own scope gap is real and stays real — named here,
not fixed by accident inside a differently-scoped work order.

### Consequences

- `CreditNote`/`CustomerCreditTerm`/dunning apply to B2B/wholesale
  customers trading on account via `Order` (retail/POS checkout, a Contact
  with a `CustomerCreditTerm` row) — never to the separate `tradingpartners`
  `Invoice`/`Quote` network-document exchange, which stays exactly as
  bounded as its own file header already said. A future work order that
  gives `Invoice` a real ledger presence (R18's own "much larger tranche")
  can extend `CreditNote`/`DunningEvent` to cover it without a breaking
  schema change — `orderId` stays nullable and a parallel `invoiceId`
  column is additive.
- `checkCreditAvailable()` is built, tested, and exposed as a real,
  permission-gated endpoint (`POST /admin/credit-terms/check`), but is not
  wired into an automatic "on-account checkout" flow: this codebase has no
  B2B/on-account payment method or checkout path today (`Payment.provider`
  is a free string among `cod`/`bank_transfer`/`jazzcash`/`easypaisa`, no
  `ON_ACCOUNT` value; `Order` carries no payment-method field at all) —
  inventing one to wire this into would itself be a separable, larger
  checkout capability, named here rather than silently built or silently
  skipped.
- `Invoice`'s own R18 gap (numbering, CreditNote pairing, and full ledger
  integration) remains exactly what it was before this work order: a named,
  separate, larger tranche — not silently closed by this one.

### Status
**Accepted.**

---

## ADR-035 — Phase 8 (content, marketing and search) audited and confirmed built; the ranking rule's missing availability tier fixed; the phantom "Phase 8 status note" several files already cited now exists

### Context

The owner asked directly for `docs/implementation/content-marketing-search/
08-content-marketing-search.md` to be built. Investigation
(`ls apps/api/src/modules` — `content`, `collections`, `search`, `marketing`,
`onsitemessages` all already present; a schema/service/spec/frontend audit
of each) found the phase already substantially built: every model doc 08
names, `SearchService`'s Postgres FTS (`tsvector`/GIN/`pg_trgm`, per-locale
config, synonym expansion, zero-result log) plus WO-9.5's hybrid
keyword+vector ranking layered on top, `CollectionsService`'s full sort
strategy set, `CampaignsService`'s send-time opt-out check and rate-limited
dispatch, `MarketingAutomationCron`'s three-stage abandoned-cart sequence
with a recovered-revenue report, and `OnsiteMessagesService`/the
storefront's `OnsiteMessages` component's full trigger and dismissal
handling. Fifteen source comments across five files already cited "the
Phase 8 status note" as the place naming small, deliberate deferrals — no
such document existed anywhere in `docs/`, the same stale-reference defect
ADR's own doc-75 correction (this session, earlier) found in a different
document. `doc 08`'s own five exit criteria were checked against the
running code, one by one, and four were already satisfied; the fifth
(search ranking) had a real, narrow gap.

### Decision

1. **Confirmed built, no changes**: WO-8.1 (CMS), WO-8.2 (collections),
   WO-8.4 (campaigns/broadcasts), WO-8.5 (abandoned-cart recovery), WO-8.6
   (on-site messaging). Each work order's own doc-08 requirements were
   checked against the actual service/schema/frontend code, not assumed
   from a comment; all matched.
2. **Fixed**: WO-8.3's own ranking rule — "text relevance, then
   availability, then `featuredRank`. Boost in-stock above out-of-stock
   always" — was not implemented. `SearchService.search()`'s sort was
   rank-only (when a term matched) or `featuredRank`-only (browse), with
   no availability tier in either path, and no spec covered it.
   `productInclude` now selects `variants: { stock, isActive }` (a cheap
   projection, `toHit()` never reads it), and the sort is a single
   comparator: rank (when present) → `isInStock()` (identical definition
   to `buildWhere()`'s own existing `inStock` filter) → `featuredRank`,
   each a tie-breaker for the one before it, never one replacing another.
   A new spec (`search.service.spec.ts`) creates two identically-worded
   products, one with stock and one without, and asserts the in-stock one
   ranks first — a real regression guard, not a smoke test.
3. **Written**: this ADR and a status blockquote on `08-content-marketing-
   search.md` itself, together forming the "Phase 8 status note" the
   existing fifteen comments already expected to exist. No comment text
   was rewritten — they now correctly resolve to something real.

### The named, deliberate deferrals this ADR makes citable

None of these violate an exit criterion (checked explicitly, below); each
was already reasoned out in its own code comment before this session and
is restated here only so the citation resolves to something real:

- **Size/colour facets** (`search.service.ts`) — needs a
  `ProductVariant`/`ProductOptionValue` join beyond today's product-level
  faceting; category/brand/fabric/season/in-stock facets are built and
  correctly exclude their own filter dimension.
- **Nightly collection-rule materialisation** (`catalog.prisma`) — today's
  read-time rule evaluation (`CollectionsService.resolveRuleProducts`) is
  the correct choice at this catalogue's size; named as the follow-on for
  when it isn't.
- **Campaign link click-tracking auto-rewrite** (`campaigns.service.ts`) —
  open tracking (a 1×1 pixel) is automatic on every EMAIL send; click
  tracking exists (`recordClick()`) but rewriting arbitrary HTML links
  inside a campaign's own content safely is a distinct, larger problem than
  a regex, not attempted here.
- **Facet-count badges in the storefront's `FilterPanel`** (`apps/web/src/
  lib/api.ts`) — the ranking and facet computation this ADR's fix depends
  on are server-side and complete; wiring the counts into the filter UI's
  own badges is a frontend-only follow-on.

### Exit criteria, checked against the running code

1. A merchandiser can publish a landing page and change a homepage banner
   with no deploy — `ContentService`/`/admin/content` (522-line admin page).
2. Search returns sensible results for a misspelled Urdu and English query,
   and facet counts respect active filters — trigram fallback
   (`fuzzyMatch`), per-locale `tsvector` config (`english`/`simple`),
   `computeFacets()`'s own `excludeDimension` parameter.
3. Zero-result queries are reported — `SearchService.zeroResultReport()`.
4. A campaign send skips every opted-out recipient, verified at send
   time — `CampaignsService.sendOne()` checks `Contact.marketingOptOut`/
   `PhoneOptOut` inside the send loop, never at `materializeScheduledCampaigns()`.
5. Abandoned-cart recovery reports recovered revenue —
   `MarketingAutomationCron.recoveredRevenueReport()`, broken down by
   which stage recovered the order.

### Consequences

- Doc 08 is `Accepted`/complete per its own exit criteria, with one real
  defect fixed and covered by a spec that would have caught it, and every
  comment across the codebase that names "the Phase 8 status note" now
  resolves to a real document instead of a promise nothing fulfilled.
- The four named deferrals are real, scoped, and now doubly citable (their
  own code comment, and this ADR) — the next work order that needs
  size/colour facets, collection materialisation at scale, safe link
  rewriting, or facet-count badges has a stated starting point.

### Status
**Accepted.**

---

## ADR-037 — Personal API keys: a user-bound token capped live by its owner, an explicit non-delegatable list, and no service account yet

### Context
The owner asked for API keys a signed-in person can hand to an AI agent, a
script or an integration without handing over their account — GitHub
fine-grained PATs, Cloudflare API tokens — on the admin API and on the
customer's own storefront API. Doc 34 (`34-partner-developer-api-access.md`)
had already designed an organisation-level `ApiClient` that survives its
creator. Three questions decided the architecture, and the owner answered each
directly. Long-form: `access-control-identity/163-personal-api-keys.md`.

### Options Considered
1. **Actor.** (a) A personal token owned by a `User`, its effective access
   `scopes ∩ owner's live permissions` recomputed per request; (b) a service
   account / `ApiClient` principal with its own grant set that outlives its
   creator (doc 34); (c) both at once.
2. **What can never be delegated.** (a) Reuse `PermissionDefinition.sensitivity`
   (e.g. "nothing `high` or above"); (b) a separate, short, hand-maintained
   list with a reason per entry.
3. **Surface.** (a) Admin API only; (b) admin and storefront, sharing one
   lifecycle but with two scope catalogues and two guard integration points.

### Decision
**1(a), 2(b), 3(b).** A personal token, now; service accounts are deferred and
doc 34 keeps their design. `NON_DELEGATABLE_PERMISSIONS`
(`packages/shared/src/api-keys.ts`) lists `roles.manage_permissions`,
`users.manage`, `organization.manage`, `settings.manage`, `pos.manage` and
`account.change_own_password`. A new `CUSTOMER_SCOPE_CATALOG` gives the
storefront fourteen scopes over routes that already exist. One `ApiKey` table
with one scope column per catalogue and a `CHECK` constraint tying each row to
exactly one. Both guards fail closed: a key reaches only routes that name a
capability of its own surface, and never a route marked `@SessionOnly()` —
every route that issues, rotates or installs a credential.

### Reasoning
- **Live intersection** makes offboarding need no memory: demote someone and
  every key they made shrinks on its next request; deactivate them and the
  deactivation transaction revokes every key (canonical ruling 6). A snapshot
  column would be a second grant table that silently goes stale.
- **Sensitivity is the wrong axis.** It measures how bad a wrong grant is, not
  whether a grant can widen itself. Refunds are `high` and legitimately
  delegatable; creating a user is `high` and must never be. The list's
  criterion is escalation — editing grants, minting a principal or credential
  that outlives the key, or taking over the account.
- **The permission list cannot catch everything.** `purchasing.manage` is fine
  to delegate but also gates minting a trading-partner credential, so the
  credential routes carry `@SessionOnly()` rather than the permission going on
  the list and taking purchase-order sync with it.
- **Fail-closed routing** means a route added tomorrow is unreachable by keys
  until someone grants it a scope, instead of reachable until someone
  remembers to exclude it.
- **Oversight reuses `users.manage`**: its holder can already deactivate a
  back-office account, which kills its keys; it is already non-delegatable and
  already granted to the Admin role, so there is no new permission to seed
  through `seedRoles()`'s one-time backfill (ADR-031 §2).

### Consequences
- A key can never be the "second person" in a maker-checker check — it carries
  its owner's `userId`. The deferred service account must answer that
  explicitly (doc 163 §9).
- Checkout is not in the storefront catalogue: an order-placement scope plus
  `addresses:write` would be a toxic pair; it is its own work order, with a
  grant-time refusal in `ApiKeysService.validateScopes()`.
- The residual risk is a future credential route written without
  `@SessionOnly()`; `.claude/rules/security.md` states the rule and
  `session-only-routes.spec.ts` pins today's routes.
- Lifecycle audit is written in-transaction (evidence class, ruling 9), but
  `AuditLog` is not yet immutable (ruling 1's prerequisite), so it is
  transactional, not tamper-evident.

### Status
**Accepted.** Service accounts: **deferred** — reopen by superseding this entry
when an integration must outlive the person who set it up.

---

## ADR-038 — Doc 153 (usage-based pricing): metering reads a tenant's own transactional outbox through `apps/platform`'s existing connection-per-call mechanism, never a new tenant→platform push credential; dunning reuses doc 145's shape only, not its code

### Context — what problem required a decision?

Doc 153 (`commercial-licensing-agency/153-usage-based-pricing-model.md`)
asks for event-driven metering: its own §2 pseudocode shows a listener
decorated `@OnDomainEvent(DomainEvent.OrderStatusChanged)` calling
`this.usageMeters.increment(...)` directly, and its own Scope lenses
require every `UsageMeter`/`PlatformInvoice` row to live in
`apps/platform`'s own control-plane database, "never inside a tenant's own
isolated database." Those two statements are only reconcilable if
something crosses the app boundary between a tenant's `apps/api` deployment
(where `OrderStatusChanged` actually fires, confirmed still firing for a
POS sale — WO-68.1 — before starting this work) and `apps/platform` (a
separate process, separate database, no code import possible either way).
Taken literally, the pseudocode would need a brand-new tenant→platform
authenticated push channel: an endpoint, a per-tenant credential, and a
guard resolving that credential back to a `PlatformTenant`. But doc 153's
own Scope lenses, in the very same document, answer "the actor with three
tables / the principal with no permission key / the grant that ends itself"
with "n/a — not a new actor." A key-hash principal is explicitly one of
this codebase's own three canonical actor tables (CLAUDE.md's "actor with
three tables" lens lists it alongside `User`/`Party`/`Contact`), so a new
tenant-reporting credential would itself be exactly the new actor the same
document says not to introduce. Separately, WO-153.3 asks to reuse doc
145's "Invoice/aging/dunning design pattern... in `apps/platform`" — but
doc 145's actual `CreditNote`/`DunningCron`/`CustomerCreditTerm` code lives
in `apps/api/src/modules/receivables/`, a different app with a different
Prisma schema; importing it into `apps/platform` is not merely undesirable,
it is impossible (two separate `package.json`s, two separate generated
Prisma clients, no shared runtime).

### Options Considered

1. **Build a new tenant→platform push channel**: a `TenantUsageCredential`
   model (key-hash, one per tenant), a guard resolving it, an
   apps/api-side `@OnDomainEvent` listener calling out over HTTP on every
   `OrderStatusChanged`/notification-send. Rejected: introduces exactly the
   new actor/principal doc 153's own Scope lenses rule out, opens a new,
   unreviewed trust boundary (tenant deployments now write financial facts
   into the control plane, the opposite direction from every existing
   cross-app connection), and is a separable, materially larger capability
   (a general tenant-facing reporting/webhook mechanism, complete with key
   provisioning and rotation) that doc 39/50/51 themselves left unbuilt for
   `PlatformUsageRecord` — verified: zero ingestion endpoint exists for it
   anywhere in this codebase today, and zero `PLATFORM_*`-aware code exists
   in `apps/api` at all.
2. **Import doc 145's actual receivables code into `apps/platform`.**
   Rejected outright — not a design tradeoff but a category error: the two
   apps have separate Prisma clients, separate schemas, and this repository
   has no shared-runtime mechanism between them; the two "PlatformInvoice
   dunning" and "tenant AR CreditNote" concepts do not even share a
   `customerId`/`Contact` vocabulary to key against.
3. **`apps/platform` reads a tenant's own `OutboxEvent` table directly**,
   through the identical connection-per-call mechanism
   `SeatCounterService.countBillableSeats()` already established and this
   same doc's WO-153.2 explicitly names for reuse ("this exact pattern...
   for other snapshot dimensions"): open a short-lived, read-only Postgres
   connection via `TenantCredentialResolverService`, run a narrow query,
   close it, cache nothing. A per-tenant `UsageMeteringCursor` checkpoint
   (a new row in `apps/platform`'s own database, not a new actor) tracks
   how far each tenant's outbox has been read. For dunning, build only the
   minimal shape doc 153's own acceptance criteria actually require (a
   `dueAt`/`dunningReminderSentAt` pair and one reminder cron) rather than
   any of doc 145's own code. Selected.

### Decision — what was selected?

Option 3, on both halves of the problem:

- **Metering.** `UsageMeteringService` (`apps/platform/src/modules/
  billing/usage-metering.service.ts`) opens one scoped connection per
  tenant per poll (via the existing `TenantCredentialResolverService`),
  reads `OutboxEvent` rows named `order.status_changed` /
  `notification.sent` created after that tenant's own
  `UsageMeteringCursor`, batches an `Order.grandTotal` lookup for the
  `DELIVERED` rows over that same connection, closes it, and applies every
  increment/reversal to `UsageMeter`/`MeteredOrderFee` inside a single
  `apps/platform`-local transaction that also advances the cursor. The only
  live cross-database connection this introduces runs in the same
  direction, with the same narrowness (connection-per-call, read-only nothing cached),
  that doc 39 already reviewed and shipped for `SeatCounterService` — never
  a new one in the opposite direction. The one `apps/api` change this
  requires is a single new domain event, `DomainEvent.NotificationSent`,
  published from `NotificationsService.send()`'s already-consolidated call
  site (doc 153 §2's own "one meter, not three") — not a new mechanism,
  one more row shape flowing through the outbox `apps/api` already has and
  already durably retries via `OutboxDispatcher`.
- **Dunning.** `PlatformInvoice` gains `dueAt` (computed at issuance for
  every pricing model, from `PLATFORM_INVOICE_NET_TERMS_DAYS`) and
  `dunningReminderSentAt`; `InvoiceDunningCron` sends exactly one reminder
  per overdue, unreminded invoice. A multi-stage escalation ladder,
  automatic suspension for non-payment, and a tenant-facing statement page
  are doc 145's own further shape and are named here as a future extension
  of this same pattern, not built now — doc 153's own acceptance criteria
  test none of them.
- **A `RETURNED` reversal that lands after its period's own invoice was
  already issued** credits that invoice via the *existing*
  `PlatformInvoiceCreditNote` model (doc 50) instead of mutating a closed
  period's `UsageMeter` row — doc 153's own "undo fan-out" scope lens
  answered literally: "doc 145's own `CreditNote` mechanism... is the
  correct tool," read here as apps/platform's own already-shipped
  credit-note model, since that is the CreditNote mechanism this database
  actually has.
- `UsageMeter.tenantId` (not the doc's own literal `organizationId`
  spelling) — apps/platform's schema names this identity `tenantId`
  everywhere else (`PlatformInvoice`, `PlatformSubscription`,
  `PlatformUsageRecord`, ...); `apps/api`'s own `Organization` model is an
  unrelated, optional, Organization-edition-only B2B concept with no
  relationship to a `PlatformTenant`. Matching this schema's own existing
  vocabulary is not a deviation in shape, only in spelling.

### Reasoning — why?

Every rejected option either introduced the new actor doc 153's own Scope
lenses explicitly disclaim, or asked for something structurally
impossible (importing one Nest app's Prisma-bound service code into a
second app with its own separate schema). Reading a tenant's own outbox is
not a new mechanism invented for this doc — it is the SAME mechanism this
repository already trusted enough to ship for seat counting, applied to one
more read. This keeps every cross-app data flow in this codebase flowing
in exactly one direction (`apps/platform` reaches into a tenant's database,
narrowly and briefly, never the reverse), which is the actual security
property doc 39's shared-infrastructure/isolated-data boundary is
protecting, not merely a coincidence of today's feature set.

### Consequences

- A tenant on `FLAT_MONTHLY`/`PER_SEAT`/`ONE_TIME_LICENSE` is never polled
  and accrues zero `UsageMeter` rows (`pollTenant`/`snapshotAllowances`
  both return immediately for a non-`USAGE_BASED` plan) — doc 153's own
  first acceptance criterion, satisfied structurally rather than by a
  filter that could be forgotten later.
- Metering freshness is bounded by the cron's own cadence (every 5 minutes
  for the fee/messages meter, daily for the allowance snapshot), not
  instantaneous — an explicit, acceptable tradeoff for "never a slow
  end-of-month aggregate scan," not "always real-time."
- If a future capability genuinely needs a tenant to push a fact into the
  control plane in real time (not just usage metering), that is the
  separable, larger capability named in Option 1 above — a proper
  tenant-reporting credential/principal, its own security review, its own
  provisioning story — sequenced as its own work order if and when a real
  requirement forces it, never retrofitted quietly onto this one.
- `PlatformOpsClient` provisioning itself remains exactly the pre-existing,
  already-tracked gap it was before this work order (no seed/bootstrap
  script exists for ANY of this app's ops scopes, `platform.billing.manage`
  included) — `platform.billing.approve` is added to the
  `PLATFORM_PERMISSIONS` catalogue by this work order, but, like every
  scope before it, reaches a live `PlatformOpsClient` only when hosting-ops
  provisions one by hand today; this is named honestly rather than claimed
  fixed by a work order that did not touch it.

### Status
**Accepted.**

## ADR-039 — `finance-accounting` docs 04/56/68/79/137/147/151/49 completed; a department-permission planning doc (164) added, deliberately not built

### Context

The remaining unverified documents in `docs/implementation/finance-
accounting/` were pulled and checked against the running codebase, one by
one, in the discipline this file's own ADR-025/ADR-033 already established:
never trust a doc's own prose or a prior status note, verify by reading the
actual source and running the actual tests before writing anything. Three
turned out to be small, real gaps needing code (`56`, `68`'s remaining
work orders, `04`'s remaining WO-4.6 UI); one was a clean audit needing
only re-verification (`137`); three named genuinely unbuilt capabilities
this repository's schema had no model for at all (`79` employee assets —
a real prerequisite doc 147 depends on, `147` fixed-asset depreciation,
`151` layby/instalment sales); one named a merchant-settlement capability
with no schema, service or connector anywhere (`49`). Mid-session, the
owner separately asked for a design document — not an implementation — on
making departments and their permission/duty/role control fully dynamic,
answered as doc 164 in `hr-people-org/`, built on top of docs 19/20/21/23's
own existing, still-unbuilt specs rather than duplicating them.

### Decision

Built, this session:

- **Doc 56 (overdue-invoices counter)** — `overdueInvoicesSummary()`
  (`tradingpartners/invoice.service.ts`), `GET
  /admin/invoices/overdue-summary`, a counter tile on the trading-partners
  dashboard. The mobile tile WO-56.2 also named was not built — doc 52's
  mobile shell has no trading-partner surface to host it on, named as a
  separate capability rather than silently skipped.
- **Doc 68 (real-time gross profit), WO-68.2–68.4** — `OrderEconomicsService.
  grossProfitToday()`, `GET /admin/finance/gross-profit-today` gated by
  `inventory.view_cost` (WO-68.1's own `OrderStatusChanged` publish fix
  had already shipped in an earlier session).
- **Doc 04, the remaining WO-4.6 gap** — a fiscal-period close admin screen
  at `/admin/accounting/fiscal-periods`.
- **Doc 137** — re-verified, not rebuilt: `PaymentContext`/
  `PaymentInitiation` (`payments/payment-provider.ts`) still carry no card-
  or wallet-specific field, confirmed by reading the current interface
  rather than trusting the doc's own two-session-old text.
- **Doc 79 (employee assets, built as doc 147's own named prerequisite)**
  — `Asset`/`AssetAssignment` (`hr.prisma`, a new `hr` core module, on by
  default), `AssetsService` (issue/return/write-off), and an
  `EmployeeOffboardingRegistry` extension point so `users.update()` can ask
  "does this person hold equipment?" without importing `hr` — the same
  registry shape `BranchPolicyRegistry`/`StockIntakeRegistry` already
  establish for a core↔core question neither side may import the other for.
- **Doc 147 (fixed-asset depreciation)** — `AssetDepreciationSchedule`/
  `AssetDepreciationPosting` (`accounting.prisma`), a real Prisma
  `@relation` to `hr.prisma`'s `Asset` — a schema-level FK, never a
  TypeScript import across the module line, so `check-module-boundaries.
  mjs` (which only scans `.ts` imports) reports no coupling and none
  exists at the code layer. `monthlyDepreciation()` is a pure function
  (straight-line and declining-balance, clamped at the salvage floor);
  posting and disposal both go through `AccountingService.postEntry()`
  with `findPostedEntry` idempotency. Two chart-of-accounts entries beyond
  the doc's own named two (`4300 Gain on Asset Disposal`, `5600 Loss on
  Asset Disposal`) were added of necessity — this chart carries no gross
  "Fixed Assets" debit account, so a disposal cannot "remove cost, remove
  depreciation" the textbook way and instead writes off remaining book
  value as a final loss.
- **Doc 151 (layby/instalment sales)** — `InstalmentPlan`/
  `InstalmentScheduleLine`/`InstalmentPayment` (`instalments.prisma`)
  live inside the `orders` module, not a new one — `orders` already
  hard-imports `payments`/`inventory` for same-transaction writes, so this
  adds no new coupling. `placeFromPos()` gained a LAYBY branch (order
  created `PENDING`, no stock decrement, deposit-only `Payment`) beside the
  existing immediate-sale path, now also usable for INSTALMENT (identical
  to an ordinary sale, schedule purely informational). Recording a payment
  is a RECORD (always commits once validated); releasing a completed
  layby's stock is a separate REQUEST in its own transaction, whose
  failure surfaces as a message and never rolls back the payment already
  received — proven by a spec.
- **Doc 49 (financial institution settlement)** — `SettlementProvider`/
  `SettlementBatch`/`SettlementBatchLine` (`settlements.prisma`) in a new
  `settlements` module, `core`-packed but off by default like
  `receivables`/`wallet`. `SettlementsService` implements the full
  reconcile → classify (`CONFIRMED`/`SHORT`) → write-off maker-checker
  flow, publishing `SettlementShortfallWrittenOff` for
  `posting-rules.subscriber.ts` to post — `settlements` never imports
  `accounting`, the identical domain-event decoupling every other posting
  rule in this repository already uses. A second, separate extension
  point (`FinancialInstitutionConnector`) mirrors `PaymentProvider`'s own
  shape rather than reusing it — collection and settlement are different
  trust boundaries. UI: a settlement list (status filter, record-expected-
  batch dialog) and a batch detail screen with the write-off flow,
  mirroring `credit-notes/[id]`'s own approve/issue shape.

Written, not built (by design):

- **Doc 164 (department permission/role/duty dynamics)** — a planning
  document only, per the owner's own explicit words ("make .md for that").
  It sketches `OrgUnitControlProfile`/`OrgUnitDuty` on top of docs
  19/20/21/23's own existing, still-unbuilt org-unit specs, scoped through
  all 27 lenses with named work orders, and ships no schema, service or
  UI change in this ADR.

### Deviations, stated here so an agent that reaches these docs next does not re-discover them by trial and error

- **Doc 49's own "with no connector registered, no `SettlementBatch` rows
  are ever created"** is narrower in this build than the doc's own
  sentence: `createExpectedBatch()` works with zero connectors registered
  (this codebase's permanent state today) because recording which
  payments a bank round-up should cover is a real, connector-independent
  operational need. What the sentence actually protects — a batch is
  never silently marked `CONFIRMED`/`SHORT` without a connector
  confirming it — holds exactly: `reconcile()`/`pollExpectedBatches()`
  both refuse outright with no connector, proven by spec.
- **`SettlementProvider`/`SettlementBatch` carry no `organizationId`**,
  though doc 49's own schema sketch has one — matching
  `receivables.prisma`'s own already-documented reasoning (no sibling
  model this document mirrors carries one either; this codebase's real
  multi-tenancy boundary is the deployment itself, not a column on every
  table).
- **Doc 151's `recordInstalmentPayment` takes `provider: string`**, not
  the doc's own named `PaymentMethod` enum — `Payment.provider` has never
  been an enum anywhere in this schema (`payments.prisma`'s own header:
  "a new gateway is a new class plus an env entry, no migration").
- **WO-49.2 (a real `FinancialInstitutionConnector`) and WO-49.7 (payroll
  disbursement through it) are not built**, matching the identical, already
  -accepted shape `PaymentProvider`'s own gateway classes follow: no real
  institution's API contract exists to integrate against yet, so the
  interface is written and typed, `this.connectors` stays a permanently
  empty map, and a fake connector registered directly into that map in
  `settlements.service.spec.ts` proves the mechanism works the moment a
  real one is added.

### Consequences

- `hr` and `settlements` are two new modules in `MODULE_PACKS`/
  `modules.registry.ts` (`hr` on by default, `settlements` off) — both
  `.env*.example` templates' `MODULES=`/`# Available:` lines were updated
  in the same change, closing the exact drift `check-env-templates.mjs`
  exists to catch (and did catch, on the first `pnpm lint` run against
  this batch). Every permission this batch added (`hr.assets.*`,
  `finance.assets.*`, `pos.instalments.*`, `finance.settlement.*`) is
  seeded through to a real `ADMIN` grant in `ROLE_PERMISSION_SEED`, not
  left as a catalogue-only row — the exact `seedPermissions()`-vs-
  `seedRoles()` trap CLAUDE.md names, not repeated here.
- `finance.settlement.view` is a genuinely reachable, separately-enforced
  permission (`@RequirePermission('finance.settlement.view',
  'finance.settlement.reconcile')` on every read route), not scaffolding
  that exists only in the catalogue — a design correction made while
  wiring the controller, before this ADR was written, rather than shipped
  and found later.
- Doc 147's cross-schema Prisma `@relation` (accounting → hr) is invisible
  to `check-module-boundaries.mjs`, which only scans `.ts` imports under
  `apps/api/src/modules/<name>/` — a real, named gap in what that script
  enforces, not a violation it missed by accident. It is the correct tool
  here specifically because no TypeScript service imports across the
  module line; a future case that needs `accounting`'s own service logic
  triggered from another module (as doc 49 does) still goes through a
  domain event, never a Prisma relation, exactly as doc 49 does it.
- Doc 164 is design-only. Nothing in `PERMISSION_CATALOG`, `nav-registry.ts`,
  or any Prisma schema changed on its account; a future work order building
  it starts from a written brief, not a blank page, and is not to be
  reported complete by this ADR.

### Status
**Accepted.**
