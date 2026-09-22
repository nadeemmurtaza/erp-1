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
