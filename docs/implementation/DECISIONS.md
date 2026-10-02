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

### Addendum — 2026-10-02: a procedure for one kind of task is a skill, and the first one moved

**Decision.** The owner chose "Slim it" on 2026-10-02. The "Feature scope" section of
`CLAUDE.md` (13,589 bytes, 186 non-blank lines) moved word for word into
`.claude/skills/feature-scope/SKILL.md`. `CLAUDE.md` keeps the section's heading, the
standing instruction, the boundary (a one-line fix runs no lenses; a named feature runs
all of them), the reviewer rule in one sentence, and a pointer. This ADR's path-scoped
rules load by file; the lenses apply to a task, which no file glob can see, so a skill,
loaded by name or by its description, is the matching mechanism.

**Numbers.** `CLAUDE.md` went from 55,429 to 43,583 bytes (11,846 fewer, 21%; about 3,000
tokens at 4 bytes a token, an estimate and not a count). The skill is 14,573 bytes: the
section (13,607 bytes once its two links gained `../../../`) plus a 965-byte lead. Checked
by script against `HEAD:CLAUDE.md`: the original section body, with those two link targets
re-based, equals the skill's section body exactly, so none of its 186 non-blank lines is
missing or altered.

**What else changed.** The two `docs/erp-lenses/` links inside the section now start from
the skill's folder (the only edit to the moved text). Two sentences in the Protocol and
one in the design paragraph of `CLAUDE.md` now say "the `feature-scope` skill". The `feature`
agent's brief, generated from `scripts/lib/model-routing.mjs`, now begins by reading the
skill. `Memory.md`'s map names it. `scripts/check-rules.mjs` fails when `CLAUDE.md`
points at a skill file that is not there (proved by breaking the pointer once: exit 1).

**Failure mode this adds.** An agent that never loads the skill scopes a named feature
from the stub alone. The stub carries the boundary and the reviewer rule and names the
file; the skill's description is in every session's skill list; the `feature` agent reads
it first; the other tools' pointer files lead to `CLAUDE.md`, which names the path.
Not measured: whether agents load it in practice.

**Not moved, and not decided.** The next largest sections are the NEWAX protocol (about
15.5 KB) and "Software engineering, not vibe coding" (about 7.6 KB). Neither was touched.

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
**Partially superseded by ADR-073** — the service-account deferral only: an
installed third-party app is exactly an integration that must outlive the person
who set it up, so doc 34's `ApiClient` is now specified for completion (docs
187/189/193). Every personal-key decision above stands unchanged.

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

---

## ADR-040 — `finance-accounting` docs 04/56/68/79/137/147/151/49 completed; a department-permission planning doc (164) added, deliberately not built

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

---

## ADR-039 — Doc 14 (managed services) built in full, overriding its own "not now": `PlatformTenant`/`PlatformInvoice` extended rather than a parallel `AgencyClient` registry and invoice cache, real Stripe collection bridged in decoupled from `BillingService`

### Context — what problem required a decision?

`commercial-licensing-agency/14-managed-services-module.md` scopes a
Master-Platform-side `agency` module and a client-side `managed-services`
module for the agency's own hosting/billing dashboard, and ends with "when
to actually build this: Not now." The owner overrode that line directly and
asked for the full capability built now. The doc's own proposed schema
(`AgencyClient` — id, status, tier, databaseName, apiKeyHash,
stripeCustomerId/stripeSubscriptionId) predates this repository's actual
`apps/platform` control plane (`39-shared-cross-tenant-hosting-tier.md`,
built since), which already has a `PlatformTenant` model carrying every
fact `AgencyClient` proposes to duplicate — a superset `TenantStatus`
enum, a real per-tenant database via `TenantDeploymentCredential` +
`TenantCredentialResolverService.resolveConnectionString()`, a real
`resourceTier`. Two questions had to be settled before writing any schema:
whether `AgencyClient` should be a new table at all, and — discovered only
while inspecting `apps/platform`'s existing billing engine (docs 50/153) —
whether doc 14's own "small local invoice cache" for
`GET /agency/clients/me/invoices` should be a second table alongside the
`PlatformInvoice` model that ALREADY implements "one row per tenant per
billing period, flat monthly price per tier, issued and reminded
automatically" (`BillingService`, `BillingCron`, `InvoiceDunningCron`) —
doc 14's entire commercial shape, minus a real Stripe charge.

### Options Considered

1. **Registry.** (a) Doc 14's own new `AgencyClient` table; (b) extend the
   existing `PlatformTenant` with only the columns it genuinely lacks
   (`mailDomain`, `apiKeyHash`/`apiKeyRotatedAt`, `stripeCustomerId`/
   `stripeSubscriptionId`), treating "self-hosted vs. managed" as "does a
   `PlatformTenant` row exist for this client's deployment at all" rather
   than a stored enum value.
2. **Invoicing.** (a) A new, Stripe-subscription-driven invoice cache,
   decoupled from `BillingService`, matching the doc's literal words
   ("delegate billing math to Stripe entirely"); (b) extend the existing
   `PlatformInvoice` row with Stripe linkage columns
   (`stripeInvoiceId`/`stripeHostedInvoiceUrl`/`stripePaymentStatus`) and
   bridge to Stripe for actual collection only, keeping `BillingService`'s
   already-built, already-tested amount computation as the one authority.
3. **Where the Stripe bridge lives.** (a) Inside
   `BillingService.issueInvoiceForPeriod()` itself; (b) a separate,
   decoupled cron in the new `agency` module, selecting
   `PlatformInvoice` rows by `stripeInvoiceId: null` for a
   Stripe-linked tenant — the same "read `PlatformInvoice`/tenant tables
   from outside `BillingService`" pattern `InvoiceDunningCron` and
   `UsageMeteringCron` already establish.
4. **Stalwart's admin API.** (a) Guess a plausible-sounding endpoint and
   present it as verified; (b) build one narrow, swappable client against
   a stated, honestly-flagged assumption, degrading to `null` (never
   throwing) on any failure, and say in the delivered report that this
   leg is unverified against a live instance — this sandbox's outbound
   network has no route to Stalwart's own docs to confirm the path, the
   same category of constraint `docs/email.md` already documents for this
   integration's setup side.

### Decision

**1(b), 2(b), 3(b), 4(b).** `PlatformTenant` gained exactly four columns
(`mailDomain`, `apiKeyHash` + `apiKeyRotatedAt`, `stripeCustomerId`,
`stripeSubscriptionId`); no new `AgencyClientStatus`/`AgencyClientTier`
enum exists — `PlatformTenant.status` and `apiKeyHash`'s own nullability
already carry that information. `PlatformInvoice` gained
`stripeInvoiceId`/`stripeHostedInvoiceUrl`/`stripePaymentStatus`/
`stripePaymentFailedAt`; `AgencyUsageSnapshot` is the one genuinely new
table (no existing equivalent). A new `agency` module in `apps/platform`
(`AgencyClientsService`/`.Controller` for manual registration/rotation,
`AgencyApiKeyGuard` + `AgencyReportingController` for the read-only
`X-Agency-Api-Key` surface, `AgencyUsageService`/`.Cron` for the nightly
snapshot, `AgencyStripeService`/`AgencyStripeChargeCron`/
`AgencyStripeWebhookController` for real collection) imports
`TenantsModule` to reuse `TenantsService.suspend()`/`.reactivate()` rather
than writing a second status-transition path. A new, small `managed-services`
module in `apps/api` (`offByDefault`, never in a client's default
`MODULES`) proxies the two read-only endpoints server-side. `settings.manage`
is reused for the client-side page (already seeded to real roles); a new
ops-side `platform.agency.manage` scope gates the master-side admin actions.

### Reasoning

- **A parallel `AgencyClient` table would have created exactly the
  two-competing-truths failure mode CLAUDE.md's own money/scale lenses
  name** — a second "is this client active" and "which database" answer
  alongside `PlatformTenant`'s already-authoritative one. The `apiKeyHash`
  nullability trick makes "agency-managed and onboarded to this dashboard"
  a real, queryable fact (`listRegisteredTenantIds()`,
  `AgencyClientsService.list()`) with zero new enum to keep in sync.
- **The same reasoning, applied a second time to invoicing, was the
  session's own load-bearing discovery**: `PlatformInvoice` already IS
  "the agency's own hosting invoice to this tenant" (doc 50's
  `FLAT_MONTHLY` pricing model, built before doc 14 was read this
  closely). Doc 14's "small local invoice cache" would have been a THIRD
  parallel invoice concept in this schema (after `Order` and
  `JournalEntry`/`PosShift` on the tenant side) with no stated
  reconciliation rule — the exact anti-pattern the money lens's "click the
  number" / "which surface is authoritative" language exists to catch.
  Bridging Stripe onto the existing row keeps one authority for the
  amount (`BillingService`) and delegates only what doc 14 actually needs
  delegated: real payment collection and a hosted, shareable invoice page.
- **A decoupled charge cron, not a `BillingService` edit**, is
  change-minimization applied to a stable, already-tested billing engine:
  `AgencyStripeChargeCron` can be added, changed, or removed without
  touching `billing.service.ts`'s own tested computation at all, and its
  `stripeInvoiceId: null` selector is itself the idempotency guarantee (a
  rerun never double-charges) — no new coordination is needed between the
  two modules beyond a shared Prisma table both already read.
- **`customer.subscription.updated` is logged, never acted on** — the
  session declined to let a webhook auto-cancel or auto-deprovision a
  paying tenant, matching CLAUDE.md's own no-destructive-action-without-a-
  human discipline extended to the platform's own customers, not only to
  git branches and database rows. `invoice.paid`/`invoice.payment_failed`
  already cover doc 14's own concrete "updates
  AgencyClientStatus" requirement, reusing `TenantsService.suspend()`/
  `.reactivate()` rather than writing a bespoke status mutation — and
  `onInvoicePaid` reactivates only a tenant it can prove `suspend()`
  itself suspended for non-payment (`suspendedReason` is checked, not just
  `status === SUSPENDED`), so it can never undo an unrelated ops
  suspension.
- **The Stalwart leg is honestly unverified, not confidently wrong.** This
  sandbox's outbound network reaches `registry.npmjs.org` but not
  Stalwart's own documentation host, so `StalwartAdminClient`'s one
  endpoint path is stated as this integration's own assumption, in the
  file's own header comment, rather than presented as a confirmed
  contract — and its failure mode (return `null`, log, never throw) means
  a wrong path degrades to "this tenant's email count is blank tonight,"
  never a failed nightly sweep for every other tenant or metric.
- **`agency.manage`'s own real-grant gap is named, not hidden**, matching
  ADR-038's own honest note about `platform.billing.approve`: this control
  plane has no seed/bootstrap script for ANY `PlatformOpsClient` scope
  today (confirmed absent before this ADR, not merely assumed), so
  `platform.agency.manage` reaches a live ops key only when hosting-ops
  provisions one by hand — the same pre-existing, already-tracked
  characteristic every sibling scope in `PLATFORM_PERMISSIONS` shares, not
  a gap this work order introduced or is pretending to have closed.
- **`scripts/sync-client.mjs`'s doc-14-cited claim was checked, not
  trusted**: `--modules=managed-services` would have failed the
  Extractor's own "Unknown module(s) requested" validation before this
  work order, because `managed-services` was never in
  `apps/api/src/modules/module-packs.ts`/`modules.registry.ts` — only the
  `.env.example` key-generation branch existed. Both registrations are
  added here, `offByDefault: true`, discoverable per
  `check-env-templates.mjs`'s own two rules, never enabled by default.

### Consequences

- A client's own `AGENCY_API_KEY` can only ever resolve to its own
  `PlatformTenant` row (`AgencyApiKeyGuard` hashes the presented key and
  looks up `apiKeyHash` directly — no route anywhere accepts a tenant id
  as a parameter), proven against a real Postgres database in
  `agency-cross-tenant.integration.spec.ts`, not mocks alone.
- `AgencyUsageSnapshot`'s `@@unique([tenantId, snapshotDate])` is the
  literal mechanism behind doc 14's "run twice in a day -> one row"
  acceptance criterion — proven both against the real constraint (same
  integration spec) and at the service's own call-shape level (mocked
  unit spec).
- `apps/platform`'s own `pnpm test` step is not wired to a Postgres
  service in `.github/workflows/ci.yml` today (a pre-existing
  characteristic of every prior `apps/platform` work order, not introduced
  here) — the new real-Postgres integration spec is written to skip
  honestly (`describe.skip`) rather than fail when `PLATFORM_DATABASE_URL`
  is unset, so it strengthens local/future-CI verification without
  breaking today's CI run. Wiring a `PLATFORM_DATABASE_URL`-backed
  Postgres service into that workflow is named here as a real, valuable
  follow-up, not executed as a silent side effect of this feature.
- A self-hosted client's extracted repo carries no `managed-services`
  folder and no `AGENCY_API_KEY` in its `.env.example` — structurally, by
  the Extractor's existing per-module copy step, exactly as doc 14 itself
  requires; there is no `agency` module or route reachable from any
  extracted client repo at all.
- Real per-message Stalwart send counts remain unverified against a live
  instance until someone with real network access to that admin API
  confirms `StalwartAdminClient`'s one endpoint path — named as an open
  item here rather than closed by assumption.

### Status
**Accepted.**

---

## ADR-041 — An `IntentRouter` core extension point: one dispatch shape for every future calling modality, proven against one real service call

### Context
Doc 135 (`ai-layer/135-intent-router-voice-video-agent.md`) asks the direct
question "what if there's no dashboard tomorrow" — a voice transcript, a
video-call assistant, or an MCP tool call all need the identical answer to
"does this caller have permission, which service method does this map to,"
and doc 116's own `McpToolDefinition` registry (`ai-layer/116-agentic-
integration-mcp.md`) already named that shape for one modality. Doc 116's
own MCP adapter (WO-116.1) and doc 135's own voice/video parsers (WO-135.3)
are each explicitly named as future work, not built here — a live MCP
transport server and a voice/video pipeline are real infrastructure with no
real requirement naming them yet, per `CLAUDE.md`'s own "no speculative
functionality." What this ADR decides is narrower: whether the dispatch
*seam* itself — `Intent`/`IntentRouter` — is worth building now, ahead of
either concrete caller, the same way `AiProvider`, `StorageDriver` and
`PaymentProvider` were each built as a registered extension point before
every implementation or caller existed.

### Options Considered
1. **Build nothing until a real MCP or voice/video requirement exists.**
   Defers doc 135 entirely alongside doc 116's own adapter and doc 135's own
   parsers.
2. **Build `Intent`/`IntentRouter` now, as core-only infrastructure**,
   proven against one real, already-existing service call (the same
   `getChainStatus()` doc 116 itself used as its own worked example), with
   no live external caller (no MCP transport, no voice/video parser) —
   exactly WO-135.1 as doc 135 names it, deferring WO-135.2 (retrofitting a
   still-unbuilt MCP adapter) and WO-135.3 (a still-unnamed voice/video
   parser).
3. **Build the router AND a live MCP tool server** — pulled WO-116.1
   forward, ahead of doc 116's own explicit deferral.

### Decision
**2.** `IntentRouterService` (`core/intent/`) is a `@Global()` core module —
a plain registry (`register()`/`route()`/`list()`) any feature module
injects and registers its own intents into from its own `onModuleInit()`,
the identical pattern `StockIntakeRegistry` already established for two
core modules decoupling from each other. `InventoryService` registers
exactly one intent, `check_inventory_chain_status`, wrapping its own
existing `getChainStatus()` unchanged — the same method `GET /admin/
inventory/:variantId/chain` already calls. Permission enforcement reuses
`decideApiKeyAccess()` (`core/auth/api-keys/api-key-access.ts`) directly
rather than re-deriving it, so an intent is refused to a caller under the
identical rule an HTTP route would refuse them, by construction, not by
two independently-maintained implementations agreeing today.

### Reasoning
- **One real registration, not zero and not many.** An empty router with no
  registered intent would be exactly the "unused abstraction" `CLAUDE.md`
  asks "what real boundary justifies its existence?" about — nothing would
  ever call `route()` outside a test. A blanket registration of every
  service method would be the "general MCP server exposing every method
  speculatively" doc 116 itself names and refuses. One curated,
  already-permissioned, read-only method — the same one doc 116's own
  worked example named — is the minimum that makes doc 135's acceptance
  criterion ("byte-identical results to calling the same service method via
  HTTP") a fact a spec proves today, not a claim about code that doesn't
  exist yet.
- **Reusing `decideApiKeyAccess` instead of a parallel permission check**
  is the same reasoning ADR-037 already established for keys: two
  independently-written authorization checks drift the day one of them is
  edited and the other is not; one function called from two call sites
  cannot drift from itself.
- **No new actor kind.** Doc 135's own sketch imagined `actorContext:
  {userId?, apiClientId?}` against doc 34's still-deferred `ApiClient`
  (ADR-037's own decision 1(a)). `Intent.actor` uses the real
  `AuthenticatedUser` shape instead — a session or a personal API key
  (163-personal-api-keys.md) — since that is what this codebase actually
  authenticates callers as today; inventing a second actor shape for a
  router with no live caller would be exactly the kind of gap a future
  ApiClient decision would have to reconcile against two things instead of
  one.

### Consequences
- **WO-135.2 (retrofit doc 116's MCP adapter as one `IntentRouter` source)
  stays blocked**, honestly, on WO-116.1 not existing — this ADR does not
  pretend to satisfy it. The router's own design (accepting any
  `sourceModality` string, trusting nothing it wasn't handed already-
  authenticated) is what makes that retrofit a new adapter file when it
  happens, not a router redesign.
- **Adding a second registered intent is free** — any module injects
  `IntentRouterService` and registers from its own `onModuleInit()`, with
  zero change to `IntentRouterService` itself or to any existing
  `*Service` method, which is doc 135's own second acceptance criterion,
  now provable rather than asserted.
- **The router has no HTTP route or admin screen of its own** — like
  `AiProvider`/`StorageDriver`, nothing a human directly clicks depends on
  it yet, so `CLAUDE.md`'s "reachable" rule does not apply until a real
  caller (an MCP adapter, a voice parser) gives it one.

### Status
**Accepted.** WO-135.2 and WO-135.3: **deferred**, exactly as doc 135 and
doc 116 each already name — reopen either the day a real MCP integration or
voice/video requirement is named.

---

## ADR-042 — Doc 154 (three headline commercial plans): public pricing-page copy lives as four columns on `PlatformPlan` itself, not a JSON blob or a second table; the read endpoint joins the existing `billing` module rather than a new one

### Context — what problem required a decision?

`commercial-licensing-agency/154-three-headline-commercial-plans.md` is
explicit that it is "pure packaging" — no new `PricingModel` value, no new
billing mechanism, only which existing `PlatformPlan` rows a public
pricing-comparison page shows, in what order. Its own literal schema
sketch (§3) adds exactly two columns, `isHeadline`/`headlineOrder`, and
says "these are the entire new surface." But its own `PlanComparisonRow`
TypeScript sketch, three lines later in the same section, reads
`displayName`/`priceDescription`/`bestFor`/`ctaLabel` off a `PlatformPlan`
row — fields that do not exist anywhere in doc 50's or doc 153's own
schema. Building `getPlanComparison()` "exactly as the doc's own sketch
shows" is therefore impossible without first deciding where that public
copy actually lives, which the doc itself never states. A second question
followed once the DTO/controller layer was being written: whether this
belongs inside the existing `billing` module (`PlansController`/
`PlansService`, doc 50/153's own home for every `PlatformPlan` mutation)
or a new module, the way doc 14 stood up its own `agency` module for a
genuinely new domain (API keys, Stripe linkage, usage snapshots).

### Options Considered

1. **Where the copy lives.** (a) Four new nullable `String` columns on
   `PlatformPlan` (`displayName`/`priceDescription`/`bestFor`/`ctaLabel`),
   mirroring how every other pricing-model-specific fact on this table is
   already a discrete, typed column (`oneTimeLicenseMinor`,
   `licenseDeploymentMode`, …); (b) one JSON blob column, matching the
   pattern `usageRateCardMinor`/`includedAllowances` already use for a
   genuinely open-ended, per-dimension rate card; (c) a separate
   `PlatformPlanCopy` table keyed to `planId`.
2. **Where the read/write code lives.** (a) Extend the existing `billing`
   module — `PlansController`/`PlansService` gain an `update()` method and
   a sibling, unauthenticated `PricingController`; (b) a new `pricing`
   module, mirroring doc 14's own `agency` module precedent.
3. **How the CTA reaches the identical existing provisioning path.**
   `PlanComparisonRow`'s own literal shape (doc 154 §3) carries no field a
   signup form could submit as `RequestSignupDto.planKey` — only the
   semantic `planKey: 'LIFETIME_LICENSE' | 'PER_MONTH' | 'PAY_AS_YOU_GROW'`
   union doc 154 §1's table defines. (a) Add the real `PlatformPlan.key`
   as a field on the returned row anyway, despite the doc's sketch not
   listing it; (b) resolve it through a second, new public endpoint
   (`GET /pricing/:planKey`) that maps the semantic name back to a real
   key server-side.

### Decision

**1(a), 2(a), 3(a).** `PlatformPlan` gained four nullable `String`
columns — `displayName`, `priceDescription`, `bestFor`, `ctaLabel` —
alongside doc 154's own `isHeadline`/`headlineOrder`, all in the same
migration (`20260925094500_wo154_headline_plans`). `PlansController` gained
one `PATCH :id` route (`UpdatePlanDto`, gated by the same
`platform.billing.manage` scope `create()` already requires — doc 154's
own "gated the same as any other PlatformPlan field change doc 153 already
requires" scope lens, not a new permission), and a new, sibling
`PricingController` (`GET /pricing`, unauthenticated) was added to the
SAME `billing` module rather than a new one. `PlanComparisonRow` carries
an additional `key: string` field beyond the doc's literal sketch — the
actual `PlatformPlan.key` — documented in its own doc comment as exactly
what a CTA needs to hand to doc 51's unmodified `RequestSignupDto.planKey`.

### Reasoning

- **A JSON blob would have been the wrong shape for a fixed, small set of
  known fields.** `usageRateCardMinor`/`includedAllowances` are JSON
  because their keys are genuinely open-ended (a new metered dimension is
  a rate-card key, not a migration — doc 153 §1). Pricing-page copy has
  exactly four fixed fields, known today, the same shape every other
  pricing-model-specific fact on this table already takes as a discrete
  column. A JSON blob here would have been schema-avoidance, not
  flexibility — CLAUDE.md's own "never hardcode an assumption" cuts the
  other way when the fields are already fully enumerated by the doc that
  specifies them.
- **A separate `PlatformPlanCopy` table would have split one row's public
  identity across two tables for four nullable strings**, the same
  "two-competing-truths" shape ADR-039 already refused for doc 14's
  `AgencyClient` — a plan's own public copy is a property of the plan,
  not a separate entity with its own lifecycle, cardinality, or query
  path.
- **The `billing` module, not a new one.** Doc 154 adds no new actor, no
  new external integration, no new domain event — it is a new read
  (`getPlanComparison()`) and one new write path (`update()`) over a table
  `PlansService` already owns end to end. Doc 14's own `agency` module
  earned its separateness from real new surface (API-key issuance, Stripe
  webhooks, a nightly usage cron) doc 154 has none of; forcing a second
  module here would have been the pattern applied where its own
  justification does not hold, not consistency.
- **`PlanComparisonRow.key` is necessary, not scope creep.** Doc 154 §4 is
  explicit that a headline plan's CTA "routes into the identical existing
  provisioning entry point its own `pricingModel` already uses" — doc 51's
  existing, unmodified signup form takes a real `planKey` string, and
  nothing else in doc 154's own document names a mechanism for a browser
  to learn it. Building a second public endpoint that maps the semantic
  name back to a real key (option 3b) would itself have been the "new,
  parallel mechanism" doc 154 explicitly forbids introducing. The one
  exclusion doc 154 §"whose rows, and which columns" actually states —
  never `transactionFeeBps`'s exact value or `usageRateCardMinor` — is
  honored exactly: `key` is never a billing figure, and
  `getPlanComparison()`'s own tests assert the internal fields are absent
  from every returned row.

### Consequences

- `getPlanComparison()` degrades honestly when copy was never set:
  `displayName` falls back to the plan's own `key`, `ctaLabel` to "Get
  started" — doc 154's own "the absent collaborator"/failure-path lenses,
  applied to a single row missing its copy rather than only to zero rows.
- `PlansService.update()` is a predicate-on-write guard, not admin
  discipline alone: a `PER_SEAT` plan can never be marked `isHeadline`
  (doc 154 §1's "never a fourth tile," enforced at the one write boundary,
  not left to be caught only by a reviewer reading the admin console), and
  `getPlanComparison()` itself drops any headline row whose
  `pricingModel` has no doc 154 §1 headline name as a second, defensive
  layer.
- No new permission key exists — `platform.billing.manage` alone gates
  every `PlatformPlan` mutation this doc adds, matching doc 153's own
  precedent exactly, so there is no `seedPermissions()`-vs-`seedRoles()`
  gap of the kind this repository already tracks elsewhere: this app's
  `PlatformOpsClient.scopes` model has no seed step to miss in the first
  place (ops keys are issued out of band, per `OpsAuthGuard`'s own doc
  comment) — the same true of every other `platform.*` scope in this app,
  not a gap doc 154 introduces.
- `apps/platform`'s own `pnpm test` step is not wired to a Postgres
  service in `.github/workflows/ci.yml` today (the same pre-existing
  characteristic ADR-039 already named for doc 14) — this migration was
  verified by hand against a real, disposable Postgres database
  (`prisma migrate deploy` + `prisma migrate diff --exit-code`), not by
  CI, exactly as every prior `apps/platform` work order in this set has
  been.

### Status
**Accepted.**

## ADR-043 — `access-control-identity` docs 126/161 built; 16/18/163 re-verified; 125 corrected; 21 reported blocked on missing docs 19/20

### Context

The `docs/implementation/access-control-identity/` folder's seven
documents were pulled and checked against the running codebase, in the
same discipline this file's own ADR-025/ADR-033 established. Three were
already fully built and verified unchanged (`16` PBAC row scoping, `18`
identity verification via nID, `163` personal API keys — ADR-037). One
(`125`, zero-trust networking) had already been decided closed by
ADR-026/ADR-027 with no work orders, but its own illustrative citations
(doc 36's `OutboundConnector`, doc 113's embed-token pattern) turned out
to name two documents that are themselves still unbuilt — a real,
if narrow, drift between a doc's prose and the running code, the same
failure mode ADR-025/ADR-033 found in the opposite direction. Two
(`126` pluggable cryptography, `161` SSO/identity federation) named real,
buildable gaps. One (`21`, access over the org tree) turned out to depend
entirely on two sibling documents (`19` org structure, `20` people/
positions/ranks) that carry zero code and no status note between them —
a genuinely separate, large HR-org-tree subsystem, not a gap this batch
could close in passing.

Given the security stakes of the two buildable documents — one touches
every password check in the system, the other adds a second way to
authenticate as any staff account — their implementation was delegated to
a security-focused review pass rather than written at this session's own
default effort, per this repository's own model-routing table
(`docs/index/cross/model-routing.md`: "Access control, isolation and
money → opus at max effort"). The orchestrating session did full
reconnaissance first (every call site, every existing pattern to mirror)
so the brief handed over was a resolved design, not an open question, and
reviewed every file line by line before it shipped.

### Decision

**Doc 125** — corrected, not rebuilt. Its central claim
(`JwtAuthGuard`/`PermissionsGuard` enforcing every request with no
"trusted internal network" assumption) re-verified true against the
running code. Its two illustrative citations were replaced with real,
already-built examples of the identical principle:
`TradingPartner.outboundApiKeyEncrypted` and doc 163's own personal API
keys.

**Doc 126 (WO-126.1)** — `bcryptjs` wrapped behind a `PasswordHasher`
interface (`apps/api/src/core/auth/password.util.ts`), extending the
file's own existing "one place a plaintext password becomes a stored
hash" rather than forking it. `BcryptPasswordHasher` (`version:
'bcrypt-v1'`) is the only registered implementation; a hash's own format
prefix (`$2…`) identifies which hasher wrote it, so a future
`argon2id-v1` entry (WO-126.2, deferred — no current reason names one)
needs to reinterpret nothing already written. `verifyPassword()` replaced
two direct `bcryptjs` `compare()` calls in `auth.service.ts`, the
constant-time `DUMMY_HASH` comparison included; `hashPassword()` kept its
exact signature, so neither `users-admin.service.ts`'s two call sites nor
any existing test needed to change.

**Doc 161 (WO-161.1–161.5)** — a full OIDC authorization-code sign-in.
`SsoConnection` (new `sso.prisma`) holds one admin-registered identity
provider per row — more than one is allowed, since a deployment (this
codebase's real tenant boundary, per ADR-040) may have more than one.
`OidcProvider` (`openid-client` 5.7.1) runs real discovery, PKCE, and
ID-token verification, and refuses outright a templated or multi-tenant
issuer path (`/common/`, `/organizations/`, `/consumers/`) — a discovery
document that would accept a token from any tenant of that provider, not
just the one configured. `SsoService` enforces the domain allowlist
before any `User` lookup, then resolves an existing account, links one at
a verified domain (audited via `AuditService.recordEvidence`, and mailed
through a new `SsoAccountLinked` domain event so an unexpected link is
never silent), or JIT-provisions a new one into a role checked against
`NON_DELEGATABLE_PERMISSIONS` — so a connection's own `defaultRoleName`
can never grant admin capability, checked both at configuration and again
at every provisioning in case the role changed underneath it. An
open-signup email domain (gmail.com and its siblings) is refused as an
allowed domain at configuration, closing the one misconfiguration a shop
whose staff use personal mailboxes would most plausibly make.
`settings.sso.manage` is critical, `NON_DELEGATABLE_PERMISSIONS`, and
`@SessionOnly()` — installing a client secret must never be reachable by
a personal API key, per `.claude/rules/security.md`'s own rule for a
credential-affecting route. WO-161.2b (a `SamlProvider`) is deliberately
unbuilt — no real client has named a SAML-only provider yet.

**Doc 21** — reported blocked, not stubbed. `OrgUnit`/`Posting` (docs 19/
20) do not exist anywhere in this schema; doc 21's own text depends on
both for its `OrgUnitGrant`/`scopeFilterFor()` extension and its
`outranks()` countersignature rule. Building it now would mean silently
absorbing docs 19 and 20's own, much larger, unscoped HR-org-tree work
into this batch — exactly the "separably larger capability silently
built in" CLAUDE.md's own scoping discipline forbids. Named here as its
own future work order instead.

### Deviations from doc 161's own literal schema/interface sketch

- **No `organizationId`** on `SsoConnection` — this codebase's real
  multi-tenancy boundary is the deployment itself, matching
  `receivables.prisma`'s and (this same batch's own) settlement schema's
  identical reasoning; `Organization` here is the optional multi-brand
  grouping inside one deployment, not a tenant.
- **`credentialEncrypted` is `String`, not `Bytes`** —
  `encryptSecret()`/`decryptSecret()` (`@newax/shared/secret-crypto`)
  already return the `iv:authTag:ciphertext` base64url string every other
  encrypted-at-rest column in this schema uses
  (`TradingPartner.outboundApiKeyEncrypted`).
- **`IdentityProvider` gained a second method.** The doc's own (and doc
  128's own) one-shot `verifyAssertion(rawAssertion)` assumed the
  assertion is already in hand; a real browser-redirect OIDC flow has two
  steps — sending the browser to the provider, and completing the code
  exchange when it returns — so the interface has exactly those two:
  `buildAuthorizationUrl()`/`handleCallback()`.
- **No token ever appears in a URL, not even a fragment.** The callback
  seals the session it just issued into a two-minute, encrypted, httpOnly
  cookie scoped to `/api/v1/auth/sso`; the admin app's own
  `/admin/login/sso-complete` page redeems it once through `POST
  /auth/sso/session`, returning the identical `AuthResult` a password
  sign-in does, stored the identical way. This is stricter than the
  fragment-based handoff the orchestrating session's own brief proposed —
  a fragment never reaches a server, but still transits the browser's own
  history and any extension reading the URL; a sealed cookie the page
  never reads avoids that entirely.

### Consequences

- `openid-client` (5.7.1, pinned to the CJS-compatible 5.x line — 6.x is
  ESM-only and this API is CommonJS) is a new dependency, recorded per
  `.claude/rules/dependencies.md`'s own template in the provider file's
  header comment: no existing library in this codebase verifies another
  party's rotating RS256 keys, and hand-writing JWKS fetch, key rotation
  and the dozen ID-token claim checks is exactly the security-critical
  protocol code that must not be written by hand.
- A full end-to-end test (`apps/api/test/sso.e2e-spec.ts`) runs the real
  app against a real (loopback) OpenID provider implementing discovery,
  JWKS, PKCE and RS256 signing — `openid-client` runs every check it
  would run against Google or Microsoft Entra. It is the acceptance proof
  for every criterion doc 161 itself names: the domain gate refusing
  before any lookup, JIT provisioning never publishing `UserRegistered`,
  linking audited and mailed, CSRF refused, an unverified email refused,
  a suspended connection refusing outright.
- `settings.sso.manage` hit this codebase's own already-tracked
  `seedPermissions()`-vs-`seedRoles()` trap on this repository's local
  scratch database specifically: `seedRoles()`'s one-time `RolePermission`
  → `RoleGrant` migration had already run here (2026-09-25, before this
  permission existed), so a fresh `RolePermission(ADMIN)` row from
  `seedPermissions()` never reached a real `RoleGrant` — confirmed by
  querying both tables directly. Backfilled with the one `RoleGrant` row
  `seedRoles()` itself would have written had it run after this permission
  existed, per ADR-031 §2's own accepted "one-time, never re-synced"
  design — no seed-script or architecture change. A fresh deployment, or
  one whose `seedRoles()` migration has not yet fired, needs no such step;
  an already-migrated one adding any new permission always will, which is
  this trap working exactly as ADR-031 §2 already decided it should.
- Docs 19/20/21 remain a named, scoped-but-unbuilt HR-org-tree body of
  work — this ADR does not close that gap, it documents why this batch
  could not close it without silently absorbing a much larger, separately
  scoped feature.

### Status
**Accepted.**

## ADR-044 — Docs 19/20 (org tree, positions and ranks): `OrgUnit` kept orthogonal to `Node` exactly as specified; no separate `Employee` model — every posting keys to `User`, matching payroll's and doc 79's own precedent

### Context

Doc 21 (`access-control-identity/21-access-over-the-org-tree.md`, ADR-043)
could not be built because it depends entirely on doc 19
(`hr-people-org/19-org-structure-offices-departments.md`, an `OrgUnit`
tree) and doc 20 (`hr-people-org/20-people-positions-ranks.md`, `Position`/
`Rank`/`Posting`), neither of which carried any code. Both were pulled and
built. Doc 19 explicitly names its own central choice as one requiring a
recorded decision before its first work order — "before WO-19.1 is
written" — so this record exists for that reason as much as for the
second decision doc 20's own build surfaced.

### Decision — doc 19: `OrgUnit` is orthogonal to `Node`, as specified, with one deployment-scoping correction

Doc 19's own central choice — the org tree (`OrgUnit`, arbitrary depth,
re-drawn on reorganisation) is a separate structure from the deployment
topology (`Organization` → `RetailBrand` → `Node`, infrastructure with its
own migration and replication cost) — is adopted exactly as the document
argues it. `AdminScopeLevel` keeps its three values (`ORG`/`BRAND`/
`BRANCH`); no fourth or fifth tier is added to it. `OrgUnit` is new,
self-referencing, with `retailBrandId`/`nodeId` both nullable exactly as
sketched.

**One correction to the doc's own schema**: `OrgUnitType.organizationId`
was sketched `String` (required). Checked against the actual codebase —
`organization` is off by default in every deployment today
(`modules.registry.ts`: `offByDefault: true`), and `Organization` itself
is optional even when the module is on (a Chain-edition deployment has no
`Organization` row at all, per that model's own header comment). A
required `organizationId` would make `OrgUnitType` — and therefore every
`OrgUnit` — impossible to create on the deployment shape this repository
actually ships today. `OrgUnitType.key` is `@unique` alone, matching this
codebase's own single-tenant idiom (`receivables.prisma`, `settlements.
prisma`, ADR-040): the deployment itself is the tenant boundary, not a
column threaded through every table for a multi-org concept most
deployments never turn on.

### Decision — doc 20: no `Employee` model; `Position`/`Posting` key to `User`

Doc 20 sketches a new `Employee` model — "an employee is not a user," a
workshop tailor who may never sign in, `Employee.userId` nullable so the
model can exist without one. This repository has already answered the
identical question twice, in the identical problem space, and answered it
differently: `payroll.prisma` (`docs/implementation/payroll/19-payroll.md`,
already built) states outright, "Every actor here is a User — same idiom
as `Expense.createdById`, `BomRecipe.createdById`" — `CompensationRate`
keys to `User.id`, not to any employee record. `hr.prisma`
(`hr-people-org/79-employee-asset-management.md`, built earlier this
session) makes the same call explicitly: "this codebase never built the
doc's own separate Employee model... one User is both the payee and, for
an ADMIN, the actor who acts on someone else's record." Both precedents
predate this decision and were not written for it — they are the same
question, answered the same way, twice, independently.

Doc 20's own stated reason for a separate model — a person who never
signs in — does not survive contact with the actual `User` schema:
`email`, `phone` and `passwordHash` are already all nullable on `User`
(`core.prisma`). A workshop tailor with no login is already representable
today as a `User` row with all three null — `AuthService.login()` cannot
locate such a row by identifier and cannot pass a null-hash comparison
against it (`DUMMY_HASH`'s own constant-time-failure path), so a
login-less `User` is already, structurally, unable to authenticate;
nothing about permission resolution or `PermissionsGuard` assumes a `User`
row is reachable by password. Doc 20's second concern — "a customer signs
in and is not an employee" — is already answered by `Role`/
`UserRoleAssignment`: a customer holds the Customer role, an employee
holds a staff-facing one; a `Posting` existing for a `User` never
retroactively reclassifies what that `User` already was.

#### Options considered

1. **Build `Employee` exactly as sketched**, linked to `User` by a
   nullable `userId`. Rejected: introduces a fourth actor-shaped table
   this repository has twice, deliberately, declined to introduce for the
   identical reason, and creates a real duplication risk this codebase's
   own "second copy of the write" lens warns against — two tables, one of
   them a shadow of the other via a nullable FK, both claiming to
   represent "a person who works here."
2. **Key `Position`/`Posting` straight to `User.id`; add no HR-specific
   columns to `User` itself; add a thin `EmployeeProfile` (1:1 `User`) for
   the fields that have no other home** — `employeeCode` (the payroll/HR
   paper identifier doc 20 itself names), `status` (`EmploymentStatus`),
   `joinedOn`, `leftOn`. Selected. Keeps `core.prisma`'s `User` free of a
   module-specific column set (`hr` is a real, if today on-by-default,
   togglable module — `EmployeeProfile` living in `hr.prisma` means a
   deployment with `hr` off has no such rows and `User` is completely
   unaffected, the same "every module survivably absent" test this
   repository already applies everywhere else).
3. **Key `Position`/`Posting` to `User.id` with no supplementary table at
   all**, adding `employeeCode`/`joinedOn`/`leftOn` directly to `User`.
   Rejected: pollutes the universal, always-on `User` model with fields
   that mean nothing outside a togglable HR context, and that a Solo shop
   with `hr` off would carry as permanently-null dead columns forever.

#### Decision

Option 2. `Rank`/`Position`/`Posting` are built as doc 20 sketches them,
with `Posting.employeeId` renamed `Posting.userId → User.id` and no
`Employee` model anywhere. `EmployeeProfile.organizationId` is dropped for
the identical reason `OrgUnitType.organizationId` is dropped above;
`Rank.organizationId` is dropped the same way, `key`/`level` each
`@unique` alone.

### Consequences

- Every later `hr-people-org` document that names `Employee` by number
  (docs 28, 42, 53, and others per `docs/implementation/README.md`'s own
  index) means "a `User` holding a `Posting`, optionally with an
  `EmployeeProfile` row," not a fourth table — read this ADR before
  building any of them, the same way doc 151 and doc 49 each had to be
  read against ADR-040 before their own schemas were written.
- The toxic-pair refusals doc 19 and doc 20 each name in their own scope
  lenses (`org.structure.manage` + `org.access.grant`,
  `hr.people.manage` + `org.access.grant`) cannot be wired up by this ADR's
  own work: `org.access.grant` does not exist until doc 21 is built, and —
  checked directly against `roles.service.ts` before writing anything —
  no generic toxic-pair mechanism exists there today at all, only
  `ADMIN_LOCKED_PERMISSIONS`. Doc 19/20's own citation of "refused in
  `RolesService.create`/`.update` (`roles.service.ts:60`, `:91`)" names
  lines that today hold a different check; the toxic-pair mechanism itself
  is doc 21's own work order to introduce, once `org.access.grant` exists
  for it to pair against. Named here so it is not silently assumed built.
- `scope.guard.ts` is untouched by this ADR, exactly as doc 19/20's own
  work-order lists already scope it: the `OrgUnit` case in
  `scopeFilterFor()` is doc 21's WO-21.2, not this one's.
- A Solo or Chain deployment (the overwhelming majority, per
  `organization`'s own `offByDefault: true`) gets a real org tree and a
  real posting/rank system with zero `Organization` row anywhere in either
  path — the same "works with the optional collaborator absent" property
  every other module in this repository already has to prove.

### Status
**Accepted.**

## ADR-045 — Doc 21 (access over the org tree): `OrgUnitGrant` built exactly as specified; `MAX_GRANT_DAYS` as a plain Setting, not a `BrandPolicy` column; `org.access.grant` seeded to no role by default; the granter's own reach treats "no posting" as unrestricted; existing list endpoints are NOT retrofitted to scope by `OrgUnit`

### Context

Doc 21 (`access-control-identity/21-access-over-the-org-tree.md`) was
blocked on docs 19/20 (ADR-043/ADR-044); both now ship. This document adds a
fourth `scopeFilterFor()` case (`OrgUnit`, alongside ORG/BRAND/BRANCH) and an
explicit, time-boxed grant table with a ceiling on who may issue one. Four
decisions were made while building it, each checked against this
repository's actual code before being written down, not assumed from the
doc's own text.

### Decision 1 — `OrgUnitGrant`/`GrantMode` built exactly as specified

The schema (`org-structure.prisma`), the resolution order (derived ∪
explicit, DENY last and unconditional), and the five-refusal shape of
`GrantService.issue()` are adopted as the document argues them, with the
model's own precedent (`Posting`, `EmployeeProfile`) followed for placement:
`OrgUnitGrant` lives in `org-structure.prisma` next to `OrgUnit`, `GrantService`
in the `orgstructure` module next to `OrgUnitService`. `GrantService` reads
`Posting`/`Position`/`Rank` (the `hr` module's own tables) by a direct Prisma
query, never by importing `PeopleService` — `check-module-boundaries.mjs`'s
`KNOWN_MODULE_COUPLINGS` is reserved for a same-transaction WRITE, and this is
a read; the same "cross-schema Prisma relation without a TS coupling" pattern
`Position.orgUnitId -> OrgUnit` already established, mirrored in the other
direction. This causes one deliberate, small duplication: the maximum-rank
comparison doc 20's `outranks()` expresses is restated as a private
~1-line helper in `GrantService` rather than imported — module independence
is exactly the "documented boundary" CLAUDE.md's own "no duplicate
implementation" rule carves an exception for.

### Decision 2 — `MAX_GRANT_DAYS` is a plain `Setting`, not a `BrandPolicy` column

The doc's own text names this "a `BrandPolicy` value (`organization.prisma:70`)".
Checked directly: `BrandPolicy` is `@unique` on `retailBrandId` — one row per
`RetailBrand` — and `RetailBrand` rows exist only when the `organization`
module is switched on, off by default in every deployment today
(`modules.registry.ts`). A required per-brand read would make issuing a
grant impossible on the Solo/Chain shape this repository actually ships —
the identical trap ADR-044 already caught and corrected for
`OrgUnitType.organizationId` and `Rank.organizationId`. `BrandPolicy`'s own
doc comment already names the exact precedent for this situation:
`org.allow_inter_brand_transfers` "is organization-level, not brand-level,
and stays a plain Setting." `SettingKey.OrgAccessMaxGrantDays`
(`settings.defaults.ts`, default 90 days) follows that precedent instead.

### Decision 3 — `org.access.grant` is seeded to no role by default, not to ADMIN

WO-21.5 says the two new permissions are "seeded to a real grant." Every
prior permission this session added to a *new* capability was seeded onto
`ROLE_PERMISSION_SEED.ADMIN` (docs 19, 20, and earlier). Doing the same for
`org.access.grant` here would be a real defect, not a style choice: ADMIN
already holds both `org.structure.manage` and `hr.people.manage` (docs
19/20's own seeding), and `TOXIC_PERMISSION_PAIRS`
(`packages/shared/src/permissions.ts`) — this document's own defence against
"invent the thing, then authorise yourself over the thing" — names both of
those paired with `org.access.grant` as exactly the combination to refuse.
Seeding all three onto the one role every deployment starts with would put
the very toxic pair this document defines onto that role from day one,
un-catchable by `RolesService.create()`/`.update()`'s own check because the
seed writes `RolePermission`/`RoleGrant` directly, never through that
service. `org.access.view` (medium, safe) is seeded to ADMIN; `org.access.grant`
(high) is seeded to no role — a deployment that needs to issue explicit
grants creates a dedicated custom role (e.g. "Access Reviewer") holding it
alone, through the existing custom-roles screen. This is not a gap: it is
exactly the "Solo: ... the grant screen never rendered" silhouette the
document's own text already names, and the access screen still renders
read-only for ADMIN via `org.access.view`.

### Decision 4 — the granter's own reach: no open posting is unrestricted, not empty

`GrantService.issue()`'s refusal #2 ("the target unit is inside the
granter's own reachable subtree") needs the granter's OWN reach computed
somehow. The document's worked example bounds a person WHO HOLDS a posting
("a Finance Manager of North reaches North and everything under it, never
North's parent") but says nothing about a person who holds none.
`GrantService.reachOf()` treats zero open postings as **unrestricted**
(skips this refusal), not empty (which would refuse everything). This is
the only reading under which the one account that exists on a fresh
deployment — ADMIN, which holds no `Posting` because docs 19/20 built no
"implicit position" mechanism for it — can ever issue a first grant at all;
the alternative (empty-by-default) would make the whole mechanism
unreachable from its own bootstrap state. `orgUnitScopeFilterFor()`
(`scope.guard.ts`) mirrors this with an explicit `isUnrestricted` field on
`OrgUnitReach`, the same shape `resolveScope()`'s own `isOrgWide` already
takes for the ORG/BRAND/BRANCH axis.

A related concretisation: the document's `ACTING` refusal names
"a countersignature from a second principal who outranks **the target
post**" — but `OrgUnitGrant` carries no `positionId` or rank of its own.
`GrantService` reads this as *outranks the grant's own recipient* (their
current open-posting rank levels, via doc 20's `outranks()` rule restated
per Decision 1), the only interpretation buildable from fields that
actually exist on the schema as specified.

### Decision 5 — no existing list endpoint is retrofitted to scope by `OrgUnit`

`orgUnitScopeFilterFor()` is built and proven in isolation
(`scope.guard.spec.ts`, including doc 19's own acceptance wording verbatim:
"returns that unit and its descendants and nothing else, proven at three
depths"), and `PermissionsResolverService.resolveForUser()` now unions in a
currently-valid `OrgUnitGrant`'s keys so an explicit grant actually clears
`PermissionsGuard`. What this ADR does **not** do: call
`orgUnitScopeFilterFor()` from `PeopleService.listPeople()` or
`OrgUnitService.tree()`/`.subtree()`. Doing so would silently change
default visibility for every admin who holds no `Posting` — which is
every admin on every deployment today, ADMIN included — turning an
unscoped list into an empty one the moment this ADR merged. No work order
in doc 21 names this retrofit, and doc 19's own status note already
deferred exactly this question to doc 21; deferring it again, honestly,
beats guessing at a default-visibility change no acceptance criterion
asks for. `GrantService.accessOverUnit()` (WO-21.6's own "who reaches this
unit" screen) and `reachOf()` are built and are the pieces a future
document retrofitting a specific list screen would call.

### Consequences

- A deployment that wants explicit access grants creates a dedicated role
  for `org.access.grant` — this is expected, not a workaround, per Decision 3.
- `PermissionsResolverService.resolveForUser()` now makes three queries
  instead of two; the third (`orgUnitGrant.findMany`) returns `[]` for every
  user until a grant is issued, so this changes nothing for any deployment
  today — read this ADR before assuming a fourth would be free to add the
  same way.
- The toxic-pair mechanism (`TOXIC_PERMISSION_PAIRS`, `RolesService`) now
  exists, closing the gap ADR-044 named — but it guards `RolesService.create()`/
  `.update()` only, not a raw seed script or a direct database write; Decision 3
  exists because that boundary is real, not closed by this ADR.
- Any future document that wants a specific list screen scoped by the
  caller's `OrgUnit` reach calls `GrantService.reachOf()` and
  `orgUnitScopeFilterFor()` directly — both are built, tested infrastructure,
  not a placeholder — see Decision 5 for why no consumer was wired up here.

### Status
**Accepted.**

## ADR-046 — Doc 22 (attendance, shifts and leave): `AttendanceEvent` partitioned by month exactly as specified; `AttendanceDevice` added as the missing WO-22.4 model; `employeeId` corrected to `userId`; `hr.attendance.reconcile` seeded to no role by default; the classification and adjustment rules concretised where the doc names a mechanism it does not fully specify

### Context

Doc 22 (`attendance-workforce/22-attendance-shifts-leave.md`) is this
document set's first genuine RECORD, not REQUEST: a punch must never be
refused, and the doc's own words are explicit that this is "the one table
in this set that must be designed for the volume on day one." Building it
required more decisions than any prior document in this set, because the
doc names several mechanisms (a device principal, a partitioned table, a
classification engine, an adjustment threshold) without fully specifying
their schema or algorithm. Each decision below was checked against this
repository's actual code before being written down.

### Decision 1 — `employeeId` is `userId -> User`, exactly ADR-044's precedent

The doc's own schema uses `employeeId Employee`. This document predates
ADR-044 (docs 19/20), which already settled this question for the entire
hr-people-org set: no separate `Employee` model, every actor is a `User`.
`AttendanceEvent.userId`, `Shift.userId` and `AttendanceException.userId`
all key straight to `User`, matching `Posting`, `EmployeeProfile` and
`AssetAssignment` before them. Not re-litigated here.

### Decision 2 — `AttendanceDevice` is a new model this document adds

The doc's own text says a device "authenticates by key hash exactly as
`PosTerminal.deviceKeyHash` does" — but its own schema block never declares
the table. WO-22.4 ("device enrolment, key hash, rotation, externalRef
required") is exactly that missing model. `AttendanceDevice`
(`attendance.prisma`) mirrors `PosTerminal` field-for-field:
`code`/`label`/`orgUnitId`, a nullable `deviceKeyHash` issued once via
`rotateDeviceKey()`, a `PENDING`/`ACTIVE`/`SUSPENDED` status, `lastSeenAt`.
`AttendanceDeviceService` mirrors `PosTerminalsService` method-for-method.

### Decision 3 — a new module and schema file, not appended to `hr`/`hr.prisma`

The doc's own text says "append to hr.prisma." This document's own folder
(`attendance-workforce/`) is a different category from `hr-people-org/`
(docs 19/20) — a genuinely distinct capability, not an extension of
assets/positions/postings. A new `attendance` module (core-packed, on by
default, matching `hr`/`orgstructure`) with its own `attendance.prisma`
follows the one-schema-file-per-module convention `org-structure.prisma`
already set for `orgstructure`, rather than growing `hr.prisma` with a
15,000-row-a-day table that has nothing to do with assets or ranks.

### Decision 4 — partitioning: composite primary key, a widened but still-correct unique constraint, a DEFAULT partition as the actual safety net, and a real composite foreign key where the doc implies one

Postgres requires every unique constraint and the primary key on a
partitioned table to include the partition key column. `AttendanceEvent`'s
primary key is therefore the composite `(id, occurredAt)`, and its
idempotency constraint — `@@unique([userId, source, externalRef, occurredAt])`
— includes `occurredAt` too. This is not a weaker guarantee in practice: a
genuine replay of the same punch (the case this constraint exists for)
carries the identical `occurredAt` the device sent the first time, so the
extra column changes nothing about what "the same punch" means.

The migration creates monthly partitions three months back through nine
months ahead (twelve total) plus an `AttendanceEvent_default` partition.
The default is not decorative: it is what keeps "a punch is never refused"
literally true even if `AttendancePartitionCron` (which extends real
coverage six months ahead, monthly) ever stops running — Postgres routes
any `occurredAt` outside every named range into it rather than raising "no
partition found for row," which would be exactly the refusal this whole
document exists to prevent.

`AttendanceException.eventId` gets a real, DB-enforced two-column foreign
key against `AttendanceEvent`'s own composite primary key
`(id, occurredAt)` — supported since Postgres 12 — rather than the bare
scalar a first reading of "no plain FK to a partitioned table's `id`" might
suggest; `eventOccurredAt` is denormalised alongside it for exactly this.
`AttendanceEvent.correctsId` (self-referencing the same partitioned table,
used only by the rarer adjustment path) stays a bare scalar with no
relation — the one place this schema does use the documented
`PosTerminal.locationId` pattern ("a bare scalar... checks it exists itself
rather than leaning on a DB-level FK"), since a second denormalised
timestamp column for that path was not worth the schema weight the core
reconciliation path already justifies. Verified end to end with a real
insert/read/delete against the partitioned table before writing any
service code against it.

### Decision 5 — `workingDayOf()`/`workedMinutesBetween()` reuse `core/time/shop-time.ts`, not a new DST implementation

The doc's own "working day is not a date" section describes exactly the
problem `core/time/shop-time.ts` already solves for the shop's own
calendar day ("never label a day with `toISOString()`", DST-safe day
stepping via `shopLocalHour`/`startOfShopDay`/`startOfShopDaysAgo`).
`workingDayOf()` is that same computation with a configurable cut-over hour
instead of midnight, built by composing those existing functions rather
than re-deriving timezone/DST handling — CLAUDE.md's own "can the existing
system already solve this?" question, answered yes. `workedMinutesBetween()`
is a plain UTC-instant subtraction, correct by construction because
`AttendanceEvent.occurredAt` is always a true UTC instant (the schema's own
rule) — proven against both a spring-forward and a fall-back transition in
`attendance-time.spec.ts`.

### Decision 6 — the toxic pair is `hr.attendance.reconcile` + `payroll.manage`, not `hr.attendance.reconcile` + `hr.payroll.run`

The doc names the pair as "`hr.attendance.reconcile` with `hr.payroll.run`."
Checked directly: no `hr.payroll.run` permission key exists anywhere in
this codebase; running a pay run is gated by `payroll.manage`
(`pay-run.controller.ts`). `TOXIC_PERMISSION_PAIRS` therefore pairs
`hr.attendance.reconcile` with `payroll.manage`, the key that actually
gates the write the doc's own reasoning ("clearing your own exception and
then paying it") is protecting against.

### Decision 7 — `hr.attendance.reconcile` is seeded to no role by default, not ADMIN — the identical shape ADR-045 already established for `org.access.grant`

ADMIN already holds `payroll.manage` (seeded since payroll shipped).
Seeding `hr.attendance.reconcile` onto the same role would put the toxic
pair Decision 6 just defined onto the one role every deployment starts
with, on a path (`seedRoles()`/`seedPermissions()`) the `RolesService`
check cannot reach. `hr.attendance.view` and `hr.attendance.record` (safe,
no toxic pairing) are seeded to ADMIN; `hr.attendance.reconcile` is not — a
deployment that needs to reconcile attendance creates a dedicated role
holding it without `payroll.manage`, exactly the "Access Reviewer" pattern
ADR-045 already established, applied here to a second pair.

### Decision 8 — the classification algorithm: a concretisation, not a literal reading

The doc names six exception reasons but not the algorithm that produces
them. `AttendanceService.classify()` checks, in priority order: an approved
`LeaveRequest` covering the punch (`WHILE_ON_LEAVE`) before anything else;
a same-kind punch within `AttendanceDuplicateWindowMinutes` (new Setting,
default 2) of the previous one (`DUPLICATE_SUSPECTED`); then the nearest
`Shift` within 24 hours by distance to its own window — none at all is
`NO_MATCHING_SHIFT`, a different `orgUnitId` is `WRONG_UNIT`, outside
`AttendanceShiftGraceMinutes` (new Setting, default 15) of that shift's own
start/end is `OUTSIDE_ROSTER`; finally, for an `OUT` or `BREAK_END`, no
immediately preceding `IN`/`BREAK_START` is `MISSING_COUNTERPART`. Each
reason gets its own spec in `attendance.service.spec.ts`, isolating exactly
the condition that produces it.

### Decision 9 — the adjustment threshold, the second-approver check, and one authorisation gap closed before it shipped

`SettingKey.AttendanceMaxSelfAdjustMinutes` (default 30) is the "policy"
value the doc names but does not default; `AttendanceService.adjust()`
needs an approver who outranks the employee (rank levels from open
`Posting` rows, the identical duplicated-rather-than-imported pattern
`GrantService`, doc 21, already establishes and justifies) whenever the
actor is adjusting their own record, or the change exceeds that threshold.
While building this, a real authorisation gap surfaced that the doc's own
text does not name: nothing stopped an arbitrary signed-in user from
submitting an adjustment against *someone else's* event, so long as they
also supplied a valid approver. `checkAdjustRefusals()` now refuses
(`NOT_AUTHORIZED`) any adjustment where the actor is neither the event's
own user nor a holder of `hr.attendance.record` — closed before this ADR
was written, not left as a known issue.

### Decision 10 — what shipped in the UI, and what did not

WO-22.5's reconcile screen (`/admin/attendance`) is built exactly as named:
every open exception, gated by `hr.attendance.reconcile` to resolve, listed
for `hr.attendance.view` to see. A second screen, `/admin/my-attendance`,
ships alongside it — the doc's own "Solo: self punch on one screen, no
devices, no roster" silhouette describes UI, and without it nothing in
this deployment could ever create an `AttendanceEvent` through the product
at all for a shop with no devices; it carries no `permissions` field
(nav-registry.ts's own documented "omit for everyone signed in"), matching
the fact that `POST /admin/attendance/punch` itself needs no capability
beyond `@AuthenticatedOnly()`.

`AttendanceDeviceController` (enrolment CRUD) ships API-only, no web page —
the same precedent `PosTerminalsController` already sets in this exact
codebase (a full CRUD controller with zero web pages consuming it today).
Shift creation/listing ships as a plain API (`POST`/`GET
/admin/attendance/shifts`) with no dedicated roster-management screen — the
doc's own text calls rostering "deliberately thin" and separately lists
"rota optimisation and shift bidding" as out of scope; a full roster
builder is not required to satisfy any acceptance criterion here.

### Consequences

- Every later `attendance-workforce` document that reads or writes
  `AttendanceEvent` must go through `AttendanceService.record()` — the only
  writer — and must never assume `id` alone is a valid `findUnique` key;
  it is always `id_occurredAt`.
- `AttendancePartitionCron` must keep running for `AttendanceEvent` to stay
  performant at scale; its failure degrades gracefully (rows land in the
  default partition, never refused) rather than breaking anything, but a
  large default partition eventually needs a manual detach-and-resplit —
  named here so it is not discovered cold in an incident.
- `hr.attendance.reconcile`'s no-default-seed follows the exact shape
  ADR-045 established; any THIRD toxic pair this document set discovers
  should look here and at ADR-045 before assuming ADMIN can safely hold it.
- The classification algorithm (Decision 8) is this document's own
  reasonable reading of an under-specified brief, not a literal
  transcription — a future document refining rostering rules should read
  this ADR, not just the original doc, before changing `classify()`.

### Status
**Accepted.**

## ADR-050 — Doc 23 (task allotment, status and tracking): built exactly as specified, with `Employee` translated to `User` per ADR-044, a new `hr.posting_ended` domain event added since doc 20's build didn't need one, and the toxic pair kept out of `TOXIC_PERMISSION_PAIRS`

### Context

Doc 23 (`tasks-notifications-support/23-tasks-allotment-tracking.md`)
names `Task.assigneeEmployeeId` and reacts to an `hr.posting_ended` domain
event. Neither exists as the doc's own literal text assumes: ADR-044
(this document, ~150 lines above) already resolved docs 19/20 with no
`Employee` model at all — `Position`/`Posting` key straight to `User.id`,
with `EmployeeProfile` (1:1 `User`) holding the HR-specific fields.
Checked directly against `apps/api/src/modules/hr/people.service.ts`:
`PostingService.end()` exists and works, but publishes no domain event —
doc 20's own acceptance criteria never needed one, so nobody added it.

### Decision

**`Task.assigneeUserId`, not `assigneeEmployeeId`.** Every later
`hr-people-org`/`tasks-notifications-support` document naming "Employee"
means "a `User` holding a `Posting`" per ADR-044's own stated
consequence — this is the first document to actually hit that
translation in its own schema, not just its prose.

**`PostingService.end()` now publishes `DomainEvent.PostingEnded` (`'hr.posting_ended'`)**,
added to the catalogue in `domain-events.ts` alongside its payload
(`{ postingId, userId, positionId, endedOn }`) — the exact shape WO-23.4
needs to unclaim a post's open tasks and surface them to `reportsTo`.
This is doc 20's own missing half, not doc 23's to route around: doc 20's
"Consequences" already promises "the `path`/reporting chain survives the
person," and a leaver's tasks going nowhere would silently break that
promise the day this module exists to notice. Adding the publish call to
an already-shipped method, with no signature change and no behavior
change for any existing caller, is the smallest complete fix — checked
against every current call site of `PostingService.end()` before writing
it, to confirm none of them run inside a code path that would double-fire
on retry.

**The `tasks.assign`/`tasks.close` toxic pair is NOT added to
`TOXIC_PERMISSION_PAIRS`.** That mechanism (`RolesService.create()`/
`.update()`, ADR-045/ADR-046's own precedent) refuses a ROLE from ever
holding both keys — appropriate for `org.structure.manage`+
`org.access.grant`, where the two together are dangerous in every case.
Doc 23's own text scopes the danger narrower: "assigning yourself work
and marking it done unobserved is only a control weakness where the task
gates something... refused together only for tasks whose `sourceType` is
a money module." Most `STAFF` legitimately holds both keys and self-closes
ordinary tasks constantly; a role-level refusal would make the common
case unusable to prevent a risk that only exists for one `sourceType`.
Enforced instead as a per-instance check inside `TaskService.close()`:
when `task.sourceType` names a money-adjacent module (the same list
`AiFeature`'s own budget-gated set or `KNOWN_MODULE_COUPLINGS`'
finance-adjacent entries already name — see the actual enforcement code
for the exact list), refuse a close whose actor matches the task's own
`assigneeUserId` set at *assignment* time, mirroring `closeShift()`'s
existing `closedByUserId`-vs-`openedByUserId` pattern CLAUDE.md itself
cites as the house style for this class of check, rather than force-fit a
role-level mechanism built for a different shape of risk.

**`TaskStageDefinition.organizationId` dropped, `key` unique alone** —
the identical, now three-times-repeated correction ADR-040/ADR-044 already
make for the same reason: this deployment is the tenant boundary, and
`organization` is off by default everywhere today.

### Consequences

- `hr.posting_ended` is now a real, subscribable event; any future
  document reacting to someone leaving a post (performance scoring cutoff,
  a leaver's pending-approvals sweep) subscribes to this one, never adds a
  second "posting ended" signal.
- `tasks` imports no other module (WO-23.3's own generic event-intake
  registry is how e.g. `orders.order_placed` becomes a task) and no other
  module imports `tasks` — a money-adjacent module marking its own
  `sourceType` string is the entire coupling surface, matching the doc's
  own "absent collaborator" lens.
- A future real toxic-pair need with the SAME "only in this specific
  context" shape should read this ADR before reaching for
  `TOXIC_PERMISSION_PAIRS`, which is for role-level, context-free pairs
  only.

### Status
**Accepted.**

## ADR-047 — Doc 165 (cross-tenant marketplace directory): a new `apps/platform` module, not a shared `Product` table; the "Facebook" ask read as publish/discover, not merge; login-centralization split into two distinct pieces, one blocked on nID's own repo

### Context

The owner's own request — "centralize everything shared by different
clients... login should remain with nID only" — read literally would mean
merging tenant business data into one shared store, which
`39-shared-cross-tenant-hosting-tier.md` already rejected in writing
("shared compute, never shared data"). Two rounds of clarification
(`AskUserQuestion`) established the actual ask: separate, isolated tenants
exactly as doc 39 already built, plus a Facebook-like layer where a tenant
voluntarily publishes products/services to an audience it controls by type
(retailer/distributor/supplier/direct customer), with both discovery-only
and full-transaction paths available per listing, the client's own choice.
This ADR records the design in `165-cross-tenant-marketplace-directory.md`
and why it does not reopen doc 39.

### Options considered

1. **A shared `Product`/`Party` table across tenants** (the literal reading)
   — rejected outright: this is precisely doc 39's own named trap, "the
   exact duplicate-implementation trap CLAUDE.md warns against, just at the
   tenancy layer." Never seriously pursued past the first read of the
   request.
2. **Put the catalog inside nID** — rejected: nID's own scope
   (`18-identity-verification.md`) is identity/KYC, not commerce; nID has no
   `Product` concept and stretching it there duplicates
   `catalog-variants-pricing/03-variants-sku-seo.md`'s own `ProductVariant`
   a third way for no benefit.
3. **Extend `18-trading-partner-network.md`'s own 1:1 model** to allow an
   unregistered viewer — rejected as the primary mechanism, reused as a
   component instead: `TradingPartner` is built around a *named, pre-linked*
   partner and an API key issued to that specific partner. The owner's own
   "control who can see it, by category" is an audience/visibility question
   a 1:1 link model cannot express without being bent out of its own shape.
   Reused, correctly, as the **delivery** mechanism once a transaction is
   actually chosen (§2 below) — the marketplace registers as one more
   `TradingPartner` from the selling tenant's own point of view, so no new
   inbound-order code was written.
4. **A new module inside `apps/platform`, with its own schema, that a
   tenant explicitly publishes toward** — selected. `apps/platform` is
   already the one place in this codebase authorized to know about more
   than one tenant, for exactly this reason (doc 39). A tenant's published
   listing is data that tenant chose to make shared — categorically
   different from doc 39's "never shared data," which was always about
   data nobody chose to expose.

### Decision

Built as designed in doc 165: `MarketplaceListing` /
`MarketplacePublisherCredential` / `MarketplaceViewerProfile` /
`MarketplaceEngagement` in `apps/platform/prisma/schema/marketplace.prisma`.
This ADR records the design; ADR-058 records WO-165.1/165.2/165.6's actual
build and the remaining blocked work orders. Publishing is per-listing and
explicit; audience is
`visibleTo: MarketplaceAudience[]`; the transact-or-discover choice is
`engagementMode`, set by the publishing tenant, never a platform-wide
default. Login-centralization splits into two pieces that must not be
conflated: erp-1 staff login already has an SSO mechanism
(`161-sso-identity-federation.md`) and needs only one additive column
(`SsoConnection.enforceSso`) to make nID-only actually enforced, once nID
is configured as that connection's issuer; a marketplace viewer, who may
hold no `User` row anywhere, needs a second, narrower, hardcoded-to-nID
OIDC client living in `apps/platform` itself — justified as a real
extraction (`packages/shared/src/oidc-client.ts`) rather than a duplicate
implementation, because it is the second genuine call site, not the first.

### Reasoning

The owner's own clarifying answers are the load-bearing evidence here, not
an inference: "client will have access to his own organization only, not
all" confirms doc 39's isolation stands; "he can control who can see his
product/services" names an opt-in, filtered publication, not a merge;
"give both discovery and transactional option and let the client choose"
is why `engagementMode` is a per-listing enum, not a global toggle. Every
reused mechanism (doc 18's inbound trading-partner API, doc 155's
stored-value design for a later payment-centralization decision, doc 161's
OIDC provider mechanics) was reused because doc 165 confirmed no
architectural boundary requires a separate implementation — the same
search-before-creating discipline this repository's house rules require
everywhere else.

### Consequences

- `apps/platform` gains its first module whose entire purpose is to hold
  data a tenant *chose* to expose across the tenant boundary — a new kind
  of row in that app, distinct from `PlatformTenant`/billing/support-access,
  and any future cross-tenant capability should be measured against this
  precedent (does the tenant explicitly opt in per record, or is this
  actually doc-39-forbidden shared business data) before being added there.
- WO-165.5 (the `oidc-client.ts` extraction) and WO-165.6
  (`enforceSso`) are real, small, immediately buildable work with no
  external dependency. WO-165.3/165.4 (discovery/transact) and the
  platform-side nID login half of WO-165.5 are blocked on confirming nID's
  own OIDC surface — `nadeemmurtaza/nID` is a separate repository not
  attached to this session, so this cannot be verified or built from here.
  A future session with that repository attached must confirm or build it
  before those work orders can close.
- Phase 2 (`verifiedType`, nID-backed KYB audience verification) is
  intentionally unbuilt scaffolding — a nullable column and a deferred flag
  — exactly the pattern doc 18.5's EDI deferral already established for
  "shape it so a real request isn't a design exercise, but do not build it
  before a real trigger exists."
- Payment/escrow centralization across a marketplace transaction was
  explicitly named and deferred (doc 165's own "Out of scope") rather than
  silently assumed; if a tenant later asks for it, doc 155's stored-value
  design is the stated starting point, not a new mechanism invented cold.

### Status
**Accepted.**

## ADR-048 — Doc 166 (unified product reference registry): a `GlobalProductReference` keyed by barcode in the same platform module as doc 165, text cached locally but images referenced by shared URL, never re-uploaded, as the actual storage-saving mechanism

### Context

The owner's follow-up named a concrete, real cost this document set had not
yet addressed: the identical product's name, description and photographs
are re-entered from scratch by every business in a supply chain —
manufacturer, then each distributor, supplier and retailer who stocks the
same physical item — because nothing in this codebase reads
`ProductVariant.barcode` (already unique per tenant, `03-variants-sku-seo.md`)
as proof that two tenants are describing the same object. The owner asked
for this to be designed using Apple's unified-memory principle by name: one
shared copy, read by every consumer through a reference, instead of a
copy per consumer.

### Options considered

1. **Do nothing / leave it as tenant-private duplication** — rejected: the
   owner named a real, measurable cost (a hundred-fold repeated upload of
   identical photographs across a real supply chain) that doc 39's own
   isolation, correct for commercial data, was never meant to force onto
   purely descriptive facts.
2. **Fully centralize the `Product`/`ProductVariant` tables themselves**
   (the literal "one shared product table" reading) — rejected for the
   same reason ADR-047 rejected it for the marketplace: it would erase the
   commercial data (price, stock, SKU, cost) that must stay private per
   tenant, conflating two different kinds of fact doc 39 already
   separates.
3. **A shared reference table for descriptive facts only, joined by
   barcode, living in the same `apps/platform` module doc 165 already
   introduced** — selected. Reuses the one tenant-trust boundary this
   codebase has already built for cross-tenant, opt-in, non-commercial data,
   rather than standing up a second one.
4. **Sync images as local copies alongside the text** (treat images and
   text identically) — rejected specifically for images: a locally-copied
   image defeats the entire storage-saving purpose the owner asked for. The
   correct application of the unified-memory principle is that images are
   *referenced* by shared URL, never copied, which is where the actual
   "100 times" storage cost lives; text is cheap enough that caching it
   locally for storefront-render resilience is a reasoned, explicit
   exception, not an oversight.

### Decision

`GlobalProductReference` (keyed by barcode) plus its
`Translation`/`Image`/`Link`/`Flag` tables, additive to the same
`apps/platform/prisma/schema/marketplace.prisma` doc 165 introduced. A
tenant creating a product looks up its barcode; a match autofills text and
images without a manual re-entry. Text is synced into the tenant's own
`ProductTranslation` for render-time resilience (doc 39's own "no
application code inside a tenant's own instance needs to know a shared
tier exists above it" restated). Images are never re-uploaded — a linked
tenant's own `ProductImage.imageUrl` points directly at the platform's own
shared storage, the literal "one buffer, many readers" move that actually
removes the duplicated storage cost. Only the registering tenant may edit
the canonical record; every other tenant's write path is a reviewed flag,
closing the toxic-pair risk of one tenant vandalizing another's shared data.

### Reasoning

The Apple unified-memory analogy is exact, not decorative: the traditional
GPU-has-its-own-VRAM design pays a real copy-and-sync cost for data the CPU
already holds, precisely mirroring a hundred tenants each holding their own
copy of one manufacturer's product description. The fix in both cases is
the same — stop copying, start referencing — applied here only to the half
of a product record that is objectively, physically true regardless of who
is selling it, never to the half that is true only for one business's own
commercial relationship to it. That boundary is exactly doc 39's own
existing shared-vs-private line, not a new one invented for this decision.

### Consequences

- `apps/platform`'s marketplace module now holds two related but distinct
  cross-tenant capabilities — doc 165's publish/discover listings and this
  document's shared reference registry — sharing one tenant credential
  rather than two, and any future addition to that module should be
  checked against the same "opt-in, non-commercial, tenant-explicit" test
  before being added there.
- The real, measurable storage saving this document delivers is on image
  storage specifically, not on the schema row count — a future review of
  "did this actually save 100x" should look at the storage driver's own
  bucket size for shared vs. duplicated images, not at Postgres row counts.
- `GlobalProductReferenceFlag`'s manual-review path is a deliberate
  slower-but-safer choice; if flag volume ever becomes a real moderation
  burden, an automatic resolution heuristic is a named future refinement
  (doc 166's own "Out of scope"), not something to build ahead of that need.
- WO-166.1–166.5 are unblocked and buildable today — unlike doc 165's own
  nID-login half, this document has no external cross-repo dependency.

### Build-time follow-up (2026-09-26) — WO-166.1, WO-166.2 and the new WO-166.6 built; four decisions the original sketch left open

A same-day follow-up from the owner sharpened the design before any code
was written — "centralize everything, not just images... cloud stays
synced, offline gets a full copy" — recorded in doc 166's own revision note
and reflected in the schema (`attributes Json` for every other descriptive
detail) and a new bulk-lookup/export pull path (WO-166.6) before the build
started. Building WO-166.1/166.2/166.6 against a real Postgres then
required four decisions the doc's own text had left implicit:

1. **Credential issuance is ops-gated (`OpsAuthGuard`,
   `platform.marketplace.manage`), not self-service**, mirroring
   `AgencyClientsService.register()`'s exact precedent — doc 165, which was
   to have "already issued" this credential, does not exist yet, so there
   was no self-service path to build against. `MarketplaceCredentialsService.
   issue()/rotate()/revoke()` mint/replace/delete a `MarketplacePublisherCredential`
   on an existing `PlatformTenant`, never creating a new entity (ADR-039's
   own convention).
2. **`revoke()`** — deletes the credential row outright; nothing on it
   needs preserving once a tenant stops authenticating with it.
3. **`unlink()`** — removes a `GlobalProductReferenceLink` by
   `(tenantId, variantRef)`, giving the "reversal document, not the
   reversal flag" lens a real method rather than only a description.
4. **`link()` upserts on `(tenantId, variantRef)`** rather than only
   inserting, so a corrected barcode scan re-points the existing link
   instead of hitting the unique constraint doc 166's own schema already
   relies on for "the second copy of the write."

`PlatformTenant` (`platform.prisma`) gained the back-relations Prisma
requires for `marketplace.prisma`'s new relations (`MarketplacePublisherCredential`,
`GlobalProductReference.registeredByTenant`, `GlobalProductReferenceLink.tenant`,
`GlobalProductReferenceFlag.flaggedByTenant`) — additive, no existing
column touched. Migration `20260926125941_wo166_product_reference_registry`
applied cleanly against the real `newax_platform` database. 32 new tests
across six spec files; `pnpm lint`/`typecheck`/`test` for `apps/platform`
all pass. WO-166.3 (erp-1-side autofill UI), WO-166.4 (erp-1-side sync
consumer) and WO-166.5 (moderation screen) remain unbuilt — see doc 166's
own "What's built" section for the exact file list.

### Status
**Accepted.**

## ADR-049 — Docs 140–143 (general EAV, metadata-driven UI, BPMN workflow editor, micro-frontend fragments): the four mechanisms `architecture-patterns/00-*` names as explicitly owner-overridden (ADR-026) against this repository's own engineering recommendation, built with the corrections that recommendation still turns out to require

### Context

`architecture-patterns/104-jsonb-eav-extensibility.md`, `105-metadata-
driven-ui-rendering.md`, `107-*` (visual workflow builder) and `113-micro-
frontend-embedding.md` each recommended a narrower, bounded mechanism over
the general form named in an original document set, for stated reasons
(untyped/unindexable EAV, an unmaintainable generic renderer, a workflow
engine this codebase's actual approval model doesn't need, and a real
Next.js version conflict for JS-level module federation). Per **ADR-026**,
the owner reviewed that reasoning twice and instructed the general forms
be built anyway, for flexibility as requirements are discovered that the
narrower forms cannot anticipate. Docs 140/141/142/143 are those four
general forms. This entry is not a re-litigation of ADR-026 — the owner's
override is accepted and each mechanism below is built — it records the
concrete corrections each one's own draft needed once checked against the
actual codebase, the same discipline already applied to every doc in this
batch.

### Decision — doc 140 (`EntityAttribute`, a general EAV model): no `organizationId`; `entityType` validated against `Prisma.ModelName`, not a hand-maintained list

Doc 140's own sketch required `organizationId` on `EntityAttribute`,
exactly the column ADR-044/ADR-040 already found wrong for doc 104's own
`CustomFieldDefinition` for the identical reason: `organization` is off by
default in every deployment today, and this deployment is itself the
tenant boundary. Removed, matching doc 104's own precedent exactly —
`@@unique([entityType, entityId, attributeKey])`, no organization column
anywhere in the model.

Doc 140 asks for "a runtime-checked (not compile-time) list of known
Prisma model names" to validate `entityType` against, without naming the
mechanism. `Prisma.ModelName` — the Prisma client's own auto-generated
enum-like object, regenerated from the schema on every `prisma generate` —
is exactly that list, and using it means there is no second array to keep
in sync with the schema by hand. `EntityAttributeService.setAttribute()`
and `.getAttributes()` both reject an `entityType` not in
`Prisma.ModelName` before touching the database.

`deleteAll(entityType, entityId)` is wired into `PurchasingService.
remove()` for `Supplier` — the same first worked example doc 104 used.
Built first as a direct import of `EntityAttributesModule` into
`PurchasingModule`; `check-module-boundaries.mjs` correctly refused this
(no module may import another directly, only core, per `MULTI-SECTOR.md`)
and named its own remedy — publish a domain event. Corrected to a new
`SupplierDeleted` domain event (`purchasing.supplier_deleted`):
`PurchasingService.remove()` publishes it, and a new
`EntityAttributeSupplierDeletedListener`, living inside `entity-attributes`
itself, subscribes — the module boundary is crossed from the
`entity-attributes` side, never the `purchasing` side, matching this
repository's own "packs reach core through domain events, never the
reverse" rule extended to the identical core-to-core case. No other entity
is wired yet; the next adopter of this mechanism must both wire its own
deletion path and publish its own equivalent event, exactly as doc 140's
own text names as a standing obligation rather than something this
document could automate away.

Authorization follows the same pattern as doc 104's `CustomFieldsController`:
a small, explicitly maintained `Record<string, PermissionKey>` map
(`ENTITY_TYPE_EDIT_PERMISSION` in `EntityAttributesController`) from entity
type to the permission that already gates editing that entity. An entity
type not on the map is refused outright — never defaulted to "any
signed-in user may edit," since `entityType` here carries no code-known
allowlist the way doc 104's own bounded mechanism does.

### Reasoning

Both corrections are the same rule applied twice: a mechanism the owner
asked to be built anyway is still built against this repository's own
already-settled facts (the single-tenant deployment boundary; a generated
registry over a hand-maintained one) rather than against a sketch's literal
schema. Overriding the recommendation to keep the mechanism narrow does not
override the separate, already-decided facts the narrower mechanism's own
schema happened to get right by accident.

### Consequences

- `EntityAttribute` composes cleanly with every other client-configurable
  table in this codebase — no dead `organizationId` column, no migration
  cost the day a second tenant concept is ever turned on for real.
- `Prisma.ModelName` validation means adding a new Prisma model
  automatically makes it a valid `entityType` with zero code change to this
  mechanism — the flexibility ADR-026 asked for, delivered without a
  parallel list to maintain.
- The maintenance obligation doc 140 names (`deleteAll()` must be wired by
  hand into every adopting entity's own deletion path) is real and remains
  real; this decision does not remove it, only names where it currently
  stands (`Supplier` only).

### Decision — doc 143 (micro-frontend fragments): no `organizationId`; WO-143.1's literal module-federation build substituted with doc 113's own iframe + embed-token pattern, reused rather than rebuilt

Doc 143's own sketch required `organizationId` on `MicroFrontendFragment` —
the same column already found wrong for docs 104 and 140, for the same
reason. Removed; `key` is `@unique` alone.

Doc 143's WO-143.1 asks for a `next.config.js` module-federation build
(`@module-federation/nextjs-mf`) wrapping the admin shell. Checked against
this repository's own facts rather than built from the sketch: this
repository's actual Next.js version is 15.5.23
(`apps/web/package.json`); `@module-federation/nextjs-mf`'s own GitHub
issue tracker has an open, unresolved request for Next.js 15 support, with
stated doubt about the package's own maintenance past 2026; and this
repository's admin app is already committed to the App Router, React
Server Components and Turbopack-first dev (doc 93's own architecture).
Building WO-143.1 as sketched would mean pinning this repository's own
framework upgrade path to an unmaintained third-party wrapper's own
compatibility window — a worse, harder-to-reverse trade-off than the
narrow capability the mechanism exists to deliver, and precisely the kind
of framework-version lock doc 93's own reasoning (cited at the top of doc
143) already warns against.

**WO-143.4 — the embed-token issuer from doc 113, reused unchanged as the
credential a federated fragment receives — already names the actual
composition layer this document needs.** Rather than build a second,
parallel mount mechanism through literal module federation, `Fragments
Service.issueFragmentToken()` and `FragmentMountPoint`/`FragmentFrame`
reuse doc 113's own iframe + short-lived, scoped JWT pattern
(`EmbedWidgetsService.issueEmbedToken()`'s own shape, a distinct `aud`
claim, a `sub` that is the fragment's own key) as the real mount
mechanism: a fragment is loaded into a named mount point exactly as
independently-deployed as literal module federation would have made it —
its own remote deployment, its own release cycle, no shared build step
with the admin shell — the two differ only in transport (an iframe boundary
instead of a webpack runtime boundary), and the iframe boundary is the
stronger isolation of the two, not a lesser substitute.

### Reasoning

The owner's override targets the *capability* (deploy a specialized
fragment independently of the admin app's own release train, opt-in per
fragment), not the specific *mechanism* named in doc 143's own sketch. The
sketch's own mechanism (JS-level module federation) is unsafe to build
today for a reason entirely orthogonal to ADR-026's own rationale — an
upstream package's Next.js 15 compatibility gap this repository does not
control and cannot fix by writing more code. Delivering the actual
capability through a mechanism this repository already owns, tests, and
can maintain (doc 113's iframe pattern) honors the override; silently
shipping a module-federation build known to be fragile against this
repository's own Next.js version would not — it would trade a documented,
working substitution for an undocumented, breaking one.

### Consequences

- `MicroFrontendFragment` composes cleanly with every other
  client-configurable table in this codebase, matching docs 104/140's own
  precedent.
- A registered fragment gets real independent deployability — its own
  vendor-controlled release cycle, no shared build step with the admin
  app — without this repository taking on a framework-version dependency
  it cannot verify is safe today.
- If `@module-federation/nextjs-mf` (or an equivalent) ships verified
  Next.js 15 support later, WO-143.1 can be revisited as an addition
  alongside the iframe mechanism, not a replacement forced by today's
  compatibility gap — named here so the substitution is not mistaken for
  a permanent rejection of the literal sketch.
- The design-law attestation this document requires at registration
  (`settings.fragments.manage`, a required `attestationConfirmed` field
  validated server-side) is unaffected by the mechanism swap: it gates
  registration itself, not the transport a registered fragment is mounted
  through.

### Decision — doc 140 build-time follow-up: `deleteAll()` wired through a new `SupplierDeleted` domain event, not a direct cross-module import

Building WO-140.3 (wire `EntityAttributeService.deleteAll()` into
`PurchasingService.remove()`) first imported `EntityAttributesModule`
directly into `PurchasingModule`. `scripts/check-module-boundaries.mjs`
correctly refused this: no module may import another module directly —
only core, and packs reach core through a domain event, never a direct
call. `entity-attributes` and `purchasing` are both `core` modules, so the
identical independence rule applies between them.

Corrected to a new `SupplierDeleted` domain event
(`DomainEvent.SupplierDeleted`, `purchasing.supplier_deleted`,
`{ supplierId }`): `PurchasingService.remove()` publishes it through the
existing transactional outbox (`EventBusService.publish()`), and a new
`EntityAttributeSupplierDeletedListener` — living inside `entity-
attributes`, not `purchasing` — subscribes via `@OnDomainEvent`. The
module boundary is crossed from the `entity-attributes` side only:
`purchasing` knows nothing about `entity-attributes` existing, exactly the
property `KNOWN_MODULE_COUPLINGS`'s alternative (a domain event) is meant
to preserve. At-least-once delivery is safe here without any extra
idempotency work: `deleteAll()` is a plain `deleteMany`, a no-op on redelivery.

### Decision — doc 141 (a general metadata-driven UI engine): no `organizationId`; the document's own "compose entirely from `@newax/shared`'s own primitive components" premise is corrected to this codebase's real, already-shipped form idiom

Doc 141's own sketch required `organizationId` on `FormMetadata` — the
same column already found wrong for docs 104/140/143, for the same reason.
Removed; `entityType` is `@unique` alone, and validated against
`Prisma.ModelName` at definition time, the identical mitigation doc 140
already established for the identical typo risk.

Doc 141's own central guardrail (§2) rests on a factual claim about this
codebase: "`renderMetadataForm()` may only ever call `@newax/shared`'s own
existing primitive components." Checked directly — `find packages/shared/
src -iname "*.tsx"` returns nothing. `@newax/shared` is a pure logic/
constants/types package; it has never had a React component in it. The
guardrail's own premise names a primitive set that does not exist.

This codebase's real, already-shipped, already-swept form idiom (`.claude/
rules/ui.md`'s own "Use what exists"; `custom-field-form-section.tsx`,
doc 105, built earlier in this same session) is plain semantic HTML
elements — `<input>`, `<select>`, `<label>` — styled through `.field-
label`/`.field-input`/`.field-check` (`apps/web/src/app/globals.css`).
`MetadataDrivenForm` (`metadata-driven-form.tsx`) is built against that
real idiom. The guardrail itself is not weakened by this correction — it
is retargeted at the risk doc 141's own text actually names ("a generic
renderer easily becomes a second, uninspected component library"), which
has nothing to do with which specific primitive set is real: **`scripts/
check-metadata-renderer.mjs`** (wired into `pnpm lint`, with its own
`--self-test`) fails if `metadata-driven-form.tsx` imports anything beyond
`@/types/api`'s own types, or uses an inline `style` prop — the two
concrete ways a second component library or a design-law bypass would
actually enter this one file. Doc 141's own acceptance criterion
describing the self-test as catching "a raw `<input>`" is corrected
alongside it: a raw `<input>` is the correct idiom here, not a violation.

WO-141.4's own "at least one representative metadata-driven form" is
`MetadataDrivenEntityForm`, reusing doc 140's own `EntityAttribute` rows
as value storage (never a second, parallel write path) and embedded on
the Supplier detail screen — a route `pnpm check:overflow` already sweeps
(`/admin/suppliers/[id]`, `scripts/check-overflow.mjs`'s own fixture
table), so extending that check's coverage to a metadata-driven form
needed no change to the check itself, per doc 66's own "extend an
existing check's coverage rather than assuming it" convention already
cited by doc 141.

### Reasoning

Both corrections are the same rule applied a third and fourth time
(after docs 104/140/143): a mechanism the owner overrode toward "build the
general form anyway" is still built against this repository's own
already-settled, checkable facts — the single-tenant deployment boundary,
a generated model-name registry, which package actually contains React
components, which existing check already sweeps a given route — rather
than against a sketch's own unverified claims. None of these facts bear on
whether the general form should exist; they bear only on what it is
correctly built out of.

### Consequences

- `FormMetadata` composes cleanly with every other client-configurable
  table in this codebase, matching docs 104/140/143's own precedent.
- The metadata-driven UI engine is enforced against this codebase's real
  design-system idiom, not an idiom that was never real — a future
  contributor extending `metadata-driven-form.tsx` gets an accurate,
  mechanically-enforced rule instead of one that would have permitted
  nothing at all (since no `@newax/shared` primitive to compose from ever
  existed).
- `entity-attributes` and `purchasing` stay fully independent modules per
  this repository's own module-pack architecture; a future entity
  adopting `EntityAttribute` must publish its own equivalent "deleted"
  event rather than import `entity-attributes` directly, and
  `check-module-boundaries.mjs` will catch it if it doesn't.

### Decision — doc 142 (a BPMN visual workflow engine): no `organizationId`; a hand-written compiler over a new dependency; "simple branching" narrowed to strictly linear; reached through a new `WorkflowStepsRegistry` extension point

Doc 142's own sketch required `organizationId` on `BpmnWorkflowDefinition`
— the same column already found wrong for docs 104/140/141/143, for the
same reason. Removed; `subjectType` is `@unique` alone, reusing doc 63's
own `ApprovalSubjectType` enum unchanged.

Before writing any code, `ApprovalChain`/`ApprovalStep`/
`ApprovalSubjectType`/`ApprovalService.decide()` were checked directly
against `approvals.prisma` and `core/approvals/approval.service.ts` —
doc 142's own assumption that these already exist, typed and reviewed, is
correct. `ApprovalService.start()` is the one existing write path this
document's own compiler now feeds; `decide()` is untouched.

**WO-142.1's compiler is hand-written and dependency-free**, not built on
a general XML or BPMN library. This codebase had no XML-parsing dependency
before this document; the supported subset (§1's own "linear or simple
branching approval task sequences only") is narrow enough — a handful of
element types, no nested content model to speak of — that a small,
directly-testable regex-and-graph-walk parser (`bpmn-compiler.ts`) covers
it completely without one. An explicit tag allowlist rejects everything
else by name (a gateway of any kind, a timer or message event, a script or
service task, a sub-process), exactly the "REJECTED at compile time with a
specific error" the document itself asks for.

**"Simple branching" is narrowed to strictly linear.** A visual gateway
would let an author express a real fork, but `ApprovalService.decide()`
already has its own approve/reject branch built in — a REJECT
unconditionally skips every remaining step, with no gateway needed to say
so. Supporting an actual BPMN gateway would require this compiler to
interpret conditional flow, which is exactly the second interpreter doc
142's own §1 states must never exist. The subset is capped at what the
existing typed engine can already do, per the document's own "Out of
scope."

**A task node's approver is read from its own `name` attribute** —
`"purchasing.requisitions.approve"`-shaped for a role, or
`"user:<userId>"` for one specific person — matching
`RequisitionService`'s own pre-existing hardcoded convention for
`approverRoleId` exactly (`const APPROVER_PERMISSION =
'purchasing.requisitions.approve'`, unchanged elsewhere in this codebase).
BPMN has no native "approver" concept; a custom moddle extension plus a
`bpmn-js-properties-panel` integration was considered and rejected as
unjustified complexity — a task's own name already carries the identical
information a form-based admin screen would collect in a labelled input,
with no additional UI dependency.

**Reached through a new extension point, not a direct import.** Building
WO-142.3's wiring into `RequisitionService.create()` by importing
`BpmnWorkflowsModule` into `PurchasingModule` would repeat the exact
mistake doc 140's own build-time follow-up (above) already made and
corrected — `bpmn-workflows` and `purchasing` are both `core` modules, so
the same independence rule applies. `WorkflowStepsRegistry`
(`core/extension-points/workflow-steps.registry.ts`) is the seam instead,
built the same shape as `BranchPolicyRegistry`: `bpmn-workflows` registers
a handler in its own `onModuleInit()`; `RequisitionService` calls the
registry, which answers `null` when no handler is registered or no
diagram is saved for a subject type, and `RequisitionService`'s own
pre-existing hardcoded single-step chain is the safe, always-available
fallback either way — a diagram is additive, never load-bearing.

**`bpmn-js` (18.30.1) is a new dependency**, added to `apps/web` only, per
`.claude/rules/dependencies.md`'s own required justification (recorded in
full next to its import in `bpmn-editor.tsx`): the well-established
open-source BPMN 2.0 editor doc 142's own WO-142.2 explicitly names as
required, in place of a bespoke diagram tool. It mounts imperatively via
`useRef`/`useEffect` as a vanilla-JS widget owning its own DOM subtree,
never as a controlled React component tree, so it carries no React-version
coupling of its own.

### Reasoning

Every correction here is the same rule applied a fifth time (after docs
104/140/141/143): a mechanism the owner overrode toward "build the general
form anyway" is still built against this repository's own already-settled,
checkable facts — the single-tenant boundary, which modules may import
which, what `RequisitionService` already hardcodes for its own approver
convention, what BPMN itself can and cannot natively express — rather than
against a sketch's own unverified assumptions. The one genuinely new
judgment call this document required (narrowing "simple branching" to
strictly linear, and encoding the approver in a task's own name rather
than a custom moddle extension) both trade a small amount of the sketch's
own expressive ambition for staying inside doc 142's own non-negotiable
boundary: no second interpreter, ever.

### Consequences

- `BpmnWorkflowDefinition` composes cleanly with every other
  client-configurable table in this codebase, matching docs 104/140/141/
  143's own precedent.
- No BPMN interpreter runs against a live approval decision — only
  `compileBpmnToApprovalSteps()`, called once, at save time; the acceptance
  criterion "no runtime BPMN-execution dependency in the deployed service"
  is satisfied by construction, since `bpmn-js` itself is a devDependency
  of nothing on the API side and never ships to the server bundle.
- A manager can redraw `PURCHASE_REQUISITION`'s own approval chain shape
  today, with no engineering deploy; `WALLET_ADJUSTMENT` (doc 155's own
  second `ApprovalSubjectType` consumer) is reachable through the identical
  mechanism the moment its own subject module reads
  `WorkflowStepsRegistry`, which it does not do yet — named here so it is
  not mistaken for already wired up.
- `purchasing` and `bpmn-workflows` stay fully independent modules; a
  future `ApprovalSubjectType` consumer wires itself into
  `WorkflowStepsRegistry` the same way, never by importing
  `bpmn-workflows` directly.
## ADR-051 — Docs 47, 146, 150 (category presets, wholesale pricing, product bundles): three independently-scoped catalog/commerce gaps built together; a repeated schema deviation (no `organizationId`) and a repeated permission deviation (reuse an existing key, never invent a narrower one nobody asked for)

### Context

Three documents named real, confirmed-by-grep gaps in the catalog/commerce
layer: doc 47 (`CategoryPreset` — starter category trees, "data, not a
module"), doc 146 (the `pricing` module `MULTI-SECTOR.md` already named as
missing), and doc 150 (`ProductBundle`/`BundleComponent` — kitting/bundles,
confirmed absent from both `catalog.prisma` and `bom.prisma`). None
depends on another's schema, but all three touch the same catalog/checkout
surface (`cart.service.ts`, `orders.service.ts`, `catalog-admin.controller.ts`),
so they were built and verified in one pass rather than three separate ones.

### Options considered

For each document, the real choice was "follow this document's own schema
sketch literally" vs. "follow this codebase's actual, confirmed convention
where the two disagree." Both doc 146 and doc 150 claimed their new tables
would be `organizationId`-scoped "exactly as `Category`/`Product` already
are" — checked against the actual schema and found false: neither
`Category` nor `Product` carries an `organizationId` column anywhere in
`catalog.prisma`. `receivables.prisma`'s own header comment already
states why: this codebase is one `Organization` per deployment, so a
config/catalog table doesn't carry that column at all; only genuinely
money-posting tables carry the finer-grained `retailBrandId`/`branchNodeId`/
`costCentreId` set, and even then per-column, never a blanket
`organizationId` habit. Similarly, doc 47 named a permission
(`catalog.categories.manage`) and doc 150 named another
(`catalog.bundles.manage`) that do not exist in `packages/shared/src/
permissions.ts` — the real, already-enforced key on
`CatalogAdminController`'s own class-level `@RequirePermission` is the
single, broader `catalog.manage`.

### Decision

Built each document's own real mechanism, deviating from its schema/
permission sketch wherever the sketch's own claim didn't match the actual
code, rather than either introducing a first, precedent-setting
`organizationId` column on a catalog table or inventing two new,
unnecessarily narrow permission keys nobody asked to have split out.
`pricing.price-lists.approve` is the one genuinely new permission key
across all three documents — deliberately seeded to no role by default,
the identical `org.access.grant`/`hr.attendance.reconcile` discipline
ADR-045/046 already established for a real margin-decision threshold.
`pricing` and `catalog` (for `BundlesService`) are hard-imported into
`cart`/`orders`/`fulfilment` the same way `tax`/`fulfilment` already are,
with four new entries in `scripts/check-module-boundaries.mjs`'s
`KNOWN_MODULE_COUPLINGS` (`cart -> pricing`, `orders -> pricing`,
`orders -> catalog`, `fulfilment -> catalog`) and `pricing` classified
`core` in `module-packs.ts` — a B2B capability, not a sector pack, per
that file's own "business models... cut across every sector" rule.

### Reasoning

Every migration generated by `prisma migrate dev --create-only` against
this session's own `erp_scratch` database also emitted `DROP INDEX`
statements for pre-existing vector/trigram search indexes
(`DocumentChunk_embedding_idx`, `ProductTranslation_embedding_idx`,
`ProductTranslation_name_trgm_idx`, `ProductTranslation_searchVector_idx`)
completely unrelated to any of these three changes — almost certainly
indexes created by raw SQL (pgvector/trigram) that a plain Prisma schema
diff cannot represent faithfully. Each of the three migrations
(`20260926134514_wo146_pricing_module`, `20260926135636_wo47_category_presets`,
`20260926140325_wo150_product_bundles`) was hand-edited to remove those
unrelated drops before being applied, per this repository's own migration
discipline ("hand-written forward-only migrations, never a raw migrate diff
applied blindly") — applying any of them unedited would have silently
dropped a live search index as a side effect of an unrelated catalog change.

A bundle sale reuses the existing `SALE`/`RETURN`/`WRITE_OFF`
`StockMovementReason` values rather than doc 150's own proposed
`BUNDLE_SALE` reason, so a manager's own "how much did I sell today"
report by reason already includes a bundle's own component decrements
without needing to know bundles exist as a concept — provenance is
`refType: 'Order', refId` on each component's own `StockMovement`, per
this document's own "Click the number" lens, not a reason code.

### Consequences

- `PricingService.resolvePrices()`/`BundlesService.sellBundle()` are now
  load-bearing, hard-imported dependencies of `cart`/`orders`/`fulfilment`
  — any future change to either service's own signature must check these
  three call sites, the same discipline already required of
  `InventoryService.move()`/`TaxService`.
- A bundle line is deliberately never backorder-eligible in
  `orders.service.ts#place()`, regardless of the `checkout.allow_backorder`
  setting — there is no single component to park a backorder against when
  the shortfall could be any one of several. Extending backorder support to
  bundles, if a real client asks, is new, separate design work, not
  something this pass silently half-built.
- Two real, named gaps carried forward rather than silently assumed
  complete: `placeFromPos()` (a till sale uses `postUnconditional()`'s
  oversell-tolerant R5 path, which `sellBundle()`'s own conditional
  `move()` calls do not support) and the storefront's own "in stock" badge
  for a bundle (`catalog.service.ts#localise()` is a widely-shared,
  non-location-aware function; `bundleAvailableStock()` needs a location
  context that function does not have today). Both are named, scoped
  follow-ups, not built speculatively in this pass.
- `pnpm index` must be regenerated (new modules, models, routes, tests) and
  `check-module-boundaries.mjs`/`module-packs.ts` are now load-bearing for
  three additional couplings — a future removal of `pricing` or the
  bundles mechanism must also remove its `KNOWN_MODULE_COUPLINGS` entries,
  which the script itself already enforces ("the list must only shrink").

### Status
**Accepted.**

## ADR-052 — Docs 127/128/136 (hardcoded-policy sweep, extension-point coverage audit, database/cache portability audit): two real policy gaps converted; both of doc 128's own "gaps found" turn out to already be closed by prior work it never checked against; 170+ raw-SQL call sites triaged, none rewritten

### Context

Three architecture-patterns documents describe themselves as one-time
audits rather than new mechanisms — doc 127 (a sweep for hardcoded
business thresholds still living in application code), doc 128 (a
port-coverage audit claiming two concrete extension-point gaps: SSO/
identity and shipping carriers), and doc 136 (a portability audit of every
`$queryRaw`/`$executeRaw` call site). None had ever been run against the
actual codebase; each document's own claims were taken on faith by
whichever process wrote them. This entry records what running each audit
for real actually found.

### Decision — doc 127: two genuine policy gaps converted, everything else confirmed a legitimate constant

`scripts/check-hardcoded-policy.mjs` (WO-127.1) runs three heuristics — the
document's own two, plus a `DAYS`/`PERCENT`/`RATE`/`GRACE`-shaped pattern
that surfaced findings the original two missed. Deliberately not wired
into `pnpm lint`, per the document's own caution against a permanently
noisy check nobody trusts.

The triage (WO-127.2) found exactly two genuine policy gaps, both
converted to a `Setting` following the exact sibling pattern
`InventorySlowMoverDays`/`DemandForecastSafetyStockDays` already establish:
`QuoteService`'s hardcoded 14-day default quote validity
(`SettingKey.TradingPartnersQuoteDefaultValidityDays`) and `CartService`'s
hardcoded 30-day guest-cart TTL (`SettingKey.CartGuestTtlDays`). Every
other candidate the sweep surfaced — an API-key lockout window, a
duplicate-detection similarity threshold, several search/recommendation
result-count caps, a report query's own date-range safety bound — checked
out as a genuine engineering constant on inspection of its own call site,
matching this document's own worked example (`MAX_ATTEMPTS` in the outbox
dispatcher).

### Decision — doc 128: both "gaps found" are already closed; the document's own title is stale, not the architecture

Doc 128 claimed, "confirmed by search," that no SSO/identity port and no
shipping-carrier port exist. A fresh grep against the codebase as it
stands today finds both already built, by other documents this one never
cross-referenced:

- `IdentityProvider` (`core/auth/identity-provider.ts`) — built under
  `161-sso-identity-federation.md` (ADR-043). Its own doc comment already
  cites doc 128 by name and corrects its sketch on contact with a real
  OIDC flow (one `verifyAssertion()` method sketched; two real steps
  needed, `buildAuthorizationUrl()`/`handleCallback()`).
- `CourierProvider` (`fulfilment/courier-provider.ts`) — built under
  WO-6.3, predating doc 128 entirely. Covers booking, labels, tracking and
  webhook verification, registered via a `COURIER_PROVIDERS` env allowlist
  — the identical shape doc 128's own §2 sketches, down to citing the same
  `PaymentProvider`/`StorageDriver` idiom. Doc 128's own claim that
  `Shipment.cost` is "populated from whatever process already exists" is
  also wrong: it is computed from `ShippingRate`, a real zone × method
  rate table (`FLAT`/`BY_WEIGHT`/`BY_ITEM`), not manual entry.

One narrower gap survives inspection and is deliberately left unbuilt:
`CourierProvider` has no `getRate()` for a *live* carrier-API quote (as
opposed to the shop's own static `ShippingRate` card). `courier-provider.
ts`'s own comment is unchanged and still true — no real courier account
exists in this deployment to build a live-quote integration against — so
adding it now would be exactly the speculative interface doc 36 (cited by
doc 128 itself) already refuses.

WO-128.3's own permission sketch (`settings.sso.manage`,
`settings.carriers.manage`) is corrected rather than built:
`settings.sso.manage` already exists and gates `SsoConnection`
administration, a real database row; `settings.carriers.manage` is never
added, because `CourierProvider` registration is deployment-time env
configuration with no runtime row to gate — the identical position
`PAYMENT_PROVIDERS` already occupies with no matching permission.

### Decision — doc 136: 170+ raw-SQL call sites found, all justified, none rewritten

The sweep found far more `$queryRaw`/`$executeRaw` call sites than doc
136's own text anticipated. Every one triages into one of six named
categories, each working around a genuine Prisma capability gap rather
than developer habit: atomic per-year document numbering
(`pg_advisory_xact_lock` — the majority of hits, across ten modules),
outbox/queue claiming (`FOR UPDATE SKIP LOCKED`), atomic upsert-and-
increment (`INSERT ... ON CONFLICT ... RETURNING`), columns Prisma cannot
address at all (`pgvector`'s `::vector`, full-text `tsvector`),
column-to-column `WHERE` comparisons (Prisma's filter API only compares a
column to a literal), and conditional aggregation computed in one round
trip. None of the 170+ sites is rewritten — none is avoidable, per this
document's own standard ("confirming each one is named and justified, not
eliminating raw SQL as a category"). The full category breakdown, with
file citations, is recorded in doc 136's own Status blockquote as the
permanent triage record WO-136.2 asks for.

### Reasoning

All three audits converge on the same lesson: an architecture-pattern
document's own factual claims about "what exists" or "what was found" are
exactly as reliable as the last time anyone actually checked them against
the codebase — which, for docs 127/128/136, was never, until this pass.
Doc 128 in particular illustrates the risk of an audit document that
becomes stale the moment the very gaps it names get closed by unrelated,
later work (docs 161 and WO-6.3, neither of which had reason to know doc
128 existed). The fix is the same one this whole batch of documents
already established for docs 95/98/103/108/115: verify before building,
and correct the record rather than build a redundant second interpretation
of a mechanism that already exists.

### Consequences

- Two real business defaults (quote validity, cart TTL) are now
  client-editable without a deploy, matching this repository's own "rows
  over enums" discipline.
- `scripts/check-hardcoded-policy.mjs` exists as a repeatable, manually-run
  tool for the next sweep, with its own current clean output (13 remaining
  candidates, all already triaged as legitimate constants) serving as the
  baseline a future re-run compares against.
- Doc 128 no longer overstates what is missing — a future reader is not
  sent to (re-)build `IdentityProvider` or `CourierProvider` from scratch.
- Doc 136's own category list is a genuine reference: a future database or
  cache portability effort starts from a pre-triaged list of ~170 call
  sites instead of re-discovering them one at a time.

### Status
**Accepted.**

## ADR-053 — Doc 149 (`accounts`/`approvals` sector packs): a genuine REQUEST/RECORD split (`B2BOrderRequest`) rather than gating the generic checkout endpoint; the doc's own self-approval-refusal claim corrected against `ApprovalService`'s real behavior; an approval step widened to a Contact set, never a second chain mechanism

### Context

`MULTI-SECTOR.md`'s own module table names `accounts` and `approvals` as
capabilities a full B2B deployment needs but neither had ever been scoped
as a work order. Doc 149 asks for a thin layer over what already exists:
doc 145's `CreditTermsService.checkCreditAvailable()` for the credit gate,
and doc 63's generic `ApprovalChain`/`ApprovalStep` for the purchase-
approval gate. The real design question was never the schema sketch —
it was *where* the threshold gate lives relative to the generic,
already-shipped `POST /orders` checkout endpoint every buyer already uses.

### Options considered

1. **Gate inside the transaction.** Let `POST /orders` always attempt to
   place the order, and have `AccountProvider.initiate()` — running inside
   `place()`'s own transaction — detect an above-threshold order and
   somehow "convert" it into a pending approval mid-transaction. Rejected:
   `PaymentProvider.initiate()` never receives the transaction client (by
   design — providers stay pure/external-call-safe, `payment-provider.ts`'s
   own doc comment), so a request row written here would straddle a
   transaction boundary that could still roll back for an unrelated reason
   (stock, tax), leaving an orphaned or duplicated request.
2. **A `CheckoutValidator` registration.** `core/checkout/checkout-
   validator.registry.ts` (B3, `MULTI-SECTOR.md`) explicitly names "credit
   limits and approval holds" as intended consumers. Rejected as the sole
   mechanism: it can only return a veto (block) or allow — it has no
   sanctioned way to also create the underlying `B2BOrderRequest`+
   `ApprovalChain` as a side effect of that veto, and doing so would smuggle
   a write into an interface documented as a pure decision.
3. **A genuine REQUEST/RECORD split** (adopted) — mirroring
   `PurchaseRequisition`/`RequisitionService.convertToPurchaseOrder()`
   exactly: nothing above the threshold is ever an `Order` until a listed
   approver decides it. `AccountProvider.initiate()` (inside the generic
   checkout's own transaction) unconditionally refuses an order at or above
   the account's threshold — no side effect, no partial state — and a
   separate, explicit `AccountsService.submitOrderRequest()` creates the
   `B2BOrderRequest` + starts the chain. Approval calls
   `OrdersService.place()` for real, sequentially, after the approval's own
   transaction has already committed.

### Decision

Option 3. `B2BOrderRequest` (new `accounts.prisma`) holds the buyer's
submitted `PlaceOrderDto` verbatim as `Json` and replays it unchanged
through the SAME `OrdersService.place()` every other order already uses —
never a second order-creation path. `AccountsService.convertToOrder()`
claims the request via a race-safe `updateMany({where:{status:'APPROVED'}})`
before calling `place()`, identical to `convertToPurchaseOrder()`'s own
claim pattern, so a lost race or a retried call can never produce two
orders from one request.

`ApprovalSubjectType` gained one value (`B2B_ORDER`) and `ApprovalStep`
gained two additive columns — `approverContactIds String[]` (a SET any one
of whom may decide, not `approverContactId` singular: this document's own
schema sketch already showed a list, and a single-tier policy needs "any
one of N", not "this one specific person") and `decidedByContactId`
(`decidedById`'s own `@relation` is typed to `User`, so a Contact's id
cannot be written there — never a reinterpretation of the existing
column). Both `ApprovalService.start()`/`.decide()` were widened
additively (a new optional `actorKind: 'USER' | 'CONTACT'` parameter,
defaulting to `'USER'`) — both existing callers
(`RequisitionService`, doc 155's wallet service) are unchanged and their
own tests still pass unmodified in shape.

Doc 149's own text claims self-approval refusal is "the identical...
`ApprovalService.start()` already enforces, unchanged." Read against the
real code, this is false: `ApprovalService`'s own doc comment explicitly
disclaims it — "this service does not resolve who may decide a step... a
self-approval refusal is the caller's own concern." `RequisitionService
.decide()` already implements this refusal itself
(`requisition.requestedById === actorId`); `AccountsService.decide()`
does the identical check (`request.requestedByContactId === actorContactId`)
at the same calling layer, matching the ALREADY-CORRECT pattern this
document merely mis-described.

The generic `POST /orders` endpoint never completes an at-or-above-
threshold on-account order, full stop, under any payment-method
combination — `AccountProvider.initiate()`'s threshold check has no
"unless a pre-approval exists" branch, because there is no code path by
which the generic endpoint could ever consume one (submission and
conversion both live entirely inside the `accounts` module's own
service). Settlement of an on-account order reuses
`PaymentsService.approve()` — the identical "staff confirms a bank
transfer, or cash collected on delivery" endpoint every other unpaid
method already settles through — unchanged; no new settlement code exists
in this build.

`packages/shared/src/api-keys.ts`'s `CUSTOMER_SCOPE_CATALOG` gained
`b2b-account:read` only, deliberately no `:write`: `163-personal-api-
keys.md` §4 already excludes checkout entirely from that catalogue ("an
order-placement scope is its own work order") because a leaked storefront
key must never spend the customer's money. Submitting or deciding a
`B2BOrderRequest` can end in exactly that (`convertToOrder()` calling
`place()`), so both actions stay reachable only by `@AuthenticatedOnly()`
with no customer scope — session-only by the absence of a write scope,
the same mechanism checkout itself already relies on, not a new one.

No `organizationId` column on `B2BAccount`/`B2BPurchaseApprovalPolicy`/
`B2BOrderRequest` — the same deviation ADR-051 already documents for
`pricing.prisma`, restated here rather than re-derived. `accounts` is
classified `core` in `module-packs.ts` (a B2B capability, not a sector
pack) and registered `offByDefault: true` in `modules.registry.ts`, same
tier as `wallet`/`settlements`/`transfers` — a Solo deployment sees zero
behavior change with it off, satisfying this document's own Acceptance
criterion #1 by construction.

### Reasoning

`AccountsService.submitOrderRequest()` needed the buyer's own cart total
before it could even decide whether a request is above threshold, but
`OrdersService`'s own pricing logic (`priceCart()`) is private, and the
`accounts` module cannot import a DTO file from `orders`
(`scripts/check-module-boundaries.mjs`'s "depth" rule: a cross-module
import may only be a `.module` or a top-level `.service`, never anything
else — this applies even to a `type`-only import, since the checker
matches every `from '...'` clause regardless). Two consequences follow
from that one rule: (1) the submitted amount is computed via
`PricingService.resolvePrices()` directly against the cart's own items —
documented in `accounts.prisma`'s own header as an *approximation* used
only for the threshold decision, never the binding charge, which
`OrdersService.place()` always re-derives fresh at conversion time,
consistent with every other order's own "re-price from the database"
discipline; and (2) `OrdersService.validatePlaceOrderDto()` is a new
public method — the one way `accounts` can validate a buyer's raw
submission against `PlaceOrderDto`'s own decorators without ever
importing the class itself, mirroring `main.ts`'s global `ValidationPipe`
exactly (`whitelist`/`forbidNonWhitelisted`) so a submission accepted here
can never disagree with what checkout itself would have accepted.

`PaymentContext` gained two additive, optional fields — `contactId` and
`purchaseOrderReference` — threaded from `OrdersService.place()`'s own
already-resolved `Contact` lookup (the identical lookup doc 146's
`priceCart()` already performs for wholesale pricing, now returned
alongside `lines`/`totals` rather than re-derived a second time). Every
existing provider (`cod`, `bank_transfer`, `jazzcash`, `easypaisa`,
`giftkarta`) ignores both fields — zero behavior change for any of them.

Two new `KNOWN_MODULE_COUPLINGS` entries were required: `payments ->
receivables` (`AccountProvider.initiate()` needs `CreditTermsService
.checkCreditAvailable()` before checkout can commit — the identical
"checkout cannot commit without this number" pure-read reasoning
`orders -> tax`/`cart -> pricing` already establish, so `ReceivablesModule`
is now hard-imported into `PaymentsModule` the same way `TaxModule` is
hard-imported into `OrdersModule`; `receivables`'s own MODULES entry now
only gates its admin nav, restated in `receivables.module.ts`'s own header
comment) and `accounts -> orders` (`AccountsService.convertToOrder()`
hands an approved request to `OrdersService.place()` — "a channel that
funnels into the normal order-creation path," the identical reasoning
`pos -> orders` already establishes, though sequential rather than
same-transaction since `place()` always manages its own transaction).
Neither `AccountProvider` nor any other `payments` code imports anything
from `accounts` — it reads `B2BAccount`/`B2BPurchaseApprovalPolicy`
directly via `PrismaService`, the identical cross-module-read pattern
`reports.service.ts`/`AttendanceService` already use elsewhere, so no
`payments -> accounts` coupling was needed at all.

Every `prisma migrate dev --create-only` run against this session's
`erp_scratch` database again emitted unrelated `DROP INDEX` statements
for the same pre-existing vector/trigram indexes ADR-051 already names —
hand-edited out of `20260926152210_wo149_b2b_accounts_approvals` before
applying, per this repository's own migration discipline. The interactive
`prisma migrate dev` apply step itself hung on this session's Postgres
(a stale `DROP DATABASE IF EXISTS prisma_migrate_shadow_db_...` connection
holding the advisory lock past the point its own client had already
disconnected) — resolved by terminating that backend
(`pg_terminate_backend`) and applying with `prisma migrate deploy`
instead, which is non-interactive and does not create a shadow database.

### Consequences

- `OrdersService.validatePlaceOrderDto()` and the `customerId`/`priced`
  return shape of `priceCart()` are now a small, load-bearing public
  surface of `orders` for exactly one caller (`accounts`) — a future
  change to `PlaceOrderDto`'s own validation rules is automatically picked
  up by the buyer-portal submission path with no separate change needed,
  which was the whole point of not duplicating the DTO.
- `finance.credit-terms.manage` (reused, never a new key) gates the
  STAFF-side `B2BAccount`/policy admin screen; the buyer's own portal edits
  the SAME policy through a session-only, no-customer-scope route scoped
  to the account's own primary contact
  (`B2BAccount.customerId === contactId`) — two write paths to one
  underlying `upsert`, never two divergent ones.
- The buyer-portal's "edit my approval policy" UI ships read-only in this
  pass (threshold and approver names/phones, resolved server-side, since
  no customer-facing contact-directory endpoint exists to pick an approver
  from — `163-personal-api-keys.md` §4's own deliberate gap). The backend
  endpoint (`AccountsService.setMyApprovalPolicy()`, by Contact id) is
  built, tested, and reachable session-only; wiring a picker to it is
  future, separate work once a real customer-facing contact-lookup
  mechanism exists — named here rather than silently assumed complete.
- `pnpm index` must be regenerated (new module, models, routes, tests,
  screens) and `check-module-boundaries.mjs`/`module-packs.ts` are now
  load-bearing for two additional couplings, same discipline ADR-051
  already established.

### Status
**Accepted.**

## ADR-054 — Doc 139 (WebSocket/SSE gateway) verified, deliberately left unbuilt; doc 157 (client `Idempotency-Key`) built, with `organizationId` dropped per ADR-044/040 and the sketch's non-atomic race guard corrected

### Context

Two more architecture-patterns documents needed inspection: doc 139 (a
WebSocket/SSE transport, proposed as a second front door onto doc 135's
`IntentRouter`, for a future agent/voice-session caller) and doc 157 (a
client-supplied `Idempotency-Key`, closing the one gap doc 117's own
domain-key strategy structurally cannot reach — the moment before a row
exists to key against, i.e. creating it in the first place).

### Decision — doc 139: verified, not built

`IntentRouterService` (`core/intent/intent-router.service.ts`) exists
exactly as doc 135 and doc 139 both assume — `register()`/`route()`/
`list()`, reusing `decideApiKeyAccess` so it can never drift from
`PermissionsGuard`'s own HTTP-path enforcement. No WebSocket/SSE dependency
(`@nestjs/websockets`, `@nestjs/platform-ws`, `socket.io`, `ws`) appears in
`apps/api/package.json`, and no gateway file exists anywhere in
`apps/api/src`. Doc 139's own WO-139.1 is explicit that `AgentSessionGateway`
is "named future work, scoped now, built once a real agent/voice integration
requirement exists" — no such requirement exists in this codebase today, so
building it now would be exactly the speculative functionality CLAUDE.md's
"No speculative functionality" section forbids, matching the identical
reasoning ADR-052 already applied to doc 128's deferred
`ShippingCarrier.getRate()`. Doc 139 is marked verified with no code change.

### Decision — doc 157: built, with three corrections to its own sketch

`IdempotencyKey` (Prisma model, `IdempotencyKeyStatus` enum),
`IdempotencyInterceptor` + `@IdempotentWrite(scope)` (registered globally
via `APP_INTERCEPTOR`, a no-op on any route without the decorator), and
`IdempotencyCron` (a nightly purge of `COMPLETED` rows older than 7 days,
plus a 5-minute-interval reaper for rows stuck `IN_PROGRESS` past 60
minutes — a crashed handler). Applied to the five routes the document names:
`orders.place` (`OrdersController.place()` — the document's own citation of
`.create()` does not exist), `pos.sale.create`
(`POST /admin/pos/shifts/:id/sales`), `fulfilment.shipment.create`
(`POST /admin/fulfilment/shipments` — the document's own citation of
`/orders/:id/shipments` does not exist), `wallet.purchase`
(`POST /wallet/purchase`), and `instalment.payment.record`
(`POST /admin/orders/:orderId/instalments/payments`).

Three corrections to the document's own sketch, each found by checking its
claims against the live codebase before writing code (the same discipline
ADR-052 established):

1. **No `organizationId`**, per ADR-044/ADR-040 — this deployment IS the
   tenant. The sketch's schema and its `req.user.organizationId` read
   cannot work: `OrdersController.place()`, the primary guarded route, is
   `@Public()` with `user?: AuthenticatedUser | undefined` (guest checkout,
   frequently no user at all), and no `AuthenticatedUser` in this codebase
   carries an `organizationId`. The shipped unique constraint is
   `(scope, key)` alone — already correct for a single-tenant deployment,
   the same correction repeated on `EntityAttribute`, `FormMetadata`,
   `MicroFrontendFragment` and `BpmnWorkflowDefinition` earlier this batch.
2. **The sketch's own race guard was not atomic.** Its
   `findUnique()`-then-`create()` sequence has a real TOCTOU gap under true
   concurrency. The shipped interceptor wraps `create()` in try/catch for
   Prisma's `P2002` unique-violation code instead, treating a genuine race
   as a 409 — correctly implementing the sketch's own stated intent ("the
   `@@unique` constraint is the actual race guard"), proven by
   `idempotency-key.constraint.spec.ts`'s real-database
   `Promise.allSettled` test issuing two truly concurrent creates for the
   identical `(scope, key)`.
3. **Real status-code recovery.** `Reflector.get(HTTP_CODE_METADATA, ...)`
   recovers each guarded route's actual configured status (defaulting to
   Nest's own 201 for `POST`) for a replayed response, rather than the
   sketch's hardcoded 200.

WO-157.5 (client changes) shipped as part of this same work, not deferred:
making the header required with no client update would have broken real
checkout, POS sales, and the two admin actions in production the moment
this merged. `apps/web`'s checkout page generates one key per checkout
attempt (a `useRef`, resent unchanged on retry); the admin "add tracking"
and "record instalment payment" actions do the same, the latter keyed to
the payment dialog's own open/close lifecycle; `apps/pos`'s till sale
generates its key *before* the first network attempt (not after a
failure), so if that attempt actually reaches the server but the response
is lost, the outbox-sync retry — which reuses the queued entry's own `id`
as the same key, per doc 157's own §2 — replays the recorded sale instead
of ringing it up twice. `wallet.purchase` has no client call site anywhere
in this codebase (the wallet module ships off by default per doc 155, with
no purchase UI built yet), so no client fix was needed there.

Seven pre-existing e2e suites that place orders
(`crm`, `customer-portal`, `giftkarta-checkout`, `orders`,
`payments-gateway`, `promotions-checkout`, `stitching`) needed a
`randomUUID()` `Idempotency-Key` header added to every `POST /orders` call
site once the header became required; all were fixed and re-verified
passing. `orders.e2e-spec.ts` gained a dedicated `idempotency
(Idempotency-Key)` block covering all four of doc 157's own acceptance
criteria plus the missing-header case.

### Reasoning

Doc 139 is the same lesson as ADR-052's doc 128 in miniature: a document
naming its own future work honestly, with a real gating condition
("once a real agent/voice integration requirement exists"), is verified
against that condition rather than built speculatively against it. Doc
157's `organizationId` correction is this batch's now-standard fix — the
sketch pattern of adding a tenant column reflexively, before checking
whether any caller of the guarded route even has one, keeps recurring
across independently-written documents, and keeps getting caught the same
way: read the actual controller and its actual `AuthenticatedUser` type
before writing the schema.

### Consequences

- Doc 139 is confirmed current — a future reader does not re-verify
  `IntentRouterService`'s existence, and does not build `AgentSessionGateway`
  without first confirming a real agent/voice caller exists to justify it.
- A double-tap on checkout, a POS terminal that times out and retries, or
  doc 48's offline-sync replay of a queued sale now collapses to one real
  `Order` row instead of two, across all five named routes.
- Every real client in this codebase that calls a now-guarded route was
  updated in the same change — the feature is reachable end to end, not
  backend-only.
- `AdminRequestOptions` (`apps/web/src/lib/admin-client.ts`) gained a
  generic `headers` passthrough, reusable by any future guarded admin
  action, not just these two.

### Status
**Accepted.**

## ADR-055 — Doc 117 (choreography and idempotency) and doc 118 (headless, composable, agent-consumable capabilities): both theses stand, but doc 117's own worked-example table was three-quarters fabricated, and doc 118 (plus doc 115, its own source) cite a deferred model as already shipped

### Context

Two more architecture-patterns documents needed inspection: doc 117 (why
this repository's idempotency strategy is domain-keyed rather than a
generic event-ID ledger) and doc 118 (why "headless, composable,
agent-consumable API" is already this repository's shape, extended one
step by doc 116's proposed MCP adapter). Both documents' *theses* turn out
to be sound engineering positions; both documents' own *evidence* for
those theses turns out to be substantially wrong on inspection.

### Decision — doc 117: three of four cited "already exists" mechanisms do not exist

Doc 117's own table named `OrderEconomics` (doc 68), `BulletinAcknowledgement`
(doc 61), `LotAllocation`/`FaceMatchVerification`, and `BomProductionLineLot`
(doc 71) as four already-real domain-keyed idempotency guards. Checked
against the actual schema and code: only `OrderEconomics` is real
(`finance.prisma`'s `orderId String @id`, confirmed). The other three cite
sketches from documents that were never built and carry no `Status:` note
of their own — `61-policy-communications-bulletin.md` and
`71-recipe-batch-traceability.md` are both proposals with their own
unexecuted work-order lists; `Lot`/`LotStock`/`LotAllocation` (doc 32, the
document 71 itself depends on) has no Prisma model anywhere in this
codebase; `FaceMatchVerification` matches nothing at all — the only related
string in the whole codebase is a doc-comment on an *extension point*
noting a `FaceMatchProvider` is "not in this codebase yet." Doc 117's own
argument (a business-invariant unique constraint catches more than a
generic event-ID ledger ever could) did not need these citations to be
true — it needed *some* real ones, which the corrected table now supplies:
`findPostedEntry(source, sourceRef)` (the GL posting guard used across
`accounting`/`finance`/`wallet`), `LoyaltyLedger`'s own
`@@unique([orderId, type])` (its schema comment already calls this "the
actual guard"), `AttendanceEvent`'s `@@unique([userId, source, externalRef,
occurredAt])`, and this session's own newly-shipped `IdempotencyKey`
(doc 157, ADR-054) — the same principle's newest and purest instance,
since it is the one case a business-invariant unique key exists *before*
any row does.

### Decision — doc 118: `ApiClient` (doc 34) is cited as shipped; it is explicitly deferred

Doc 118 repeatedly cites "doc 34's `ApiClient`" as the mechanism already
scoping an agent or third-party caller's permissions. Doc 34's own header
says otherwise, in its own words: "The `ApiClient` below... is the
**service account** that [ADR-037] deliberately defers... Nothing below
is built." The mechanism this repository actually shipped instead is doc
163's personal `ApiKey` (also ADR-037): owned by a `User`, capped by that
user's own live `permissionKeys`/`customerScopes` (drawn from
`PERMISSION_CATALOG`/`CUSTOMER_SCOPE_CATALOG`), with a mandatory
`expiresAt` and revoked when its owner is deactivated — a personal,
user-bound credential, not a separate organisation-level principal that
outlives its creator. Doc 118 also repeated a second, unrelated error
carried over verbatim from doc 115 (which this document quotes as a
source): `OrdersService.createFromPos()` does not exist — the real method
is `placeFromPos()`. Doc 115's own table has the identical wrong name,
missed by its own earlier "corrected" pass (ADR-052's era), which fixed
five fabricated ports/adapters but not this one; fixed here too, since it
was found while verifying the document that quotes it.

Doc 116 (which doc 118 also quotes, for its `McpToolDefinition` design)
repeats the same `ApiClient` citation and carries no `Status:` note of its
own. Its correction is intentionally left for when doc 116 is itself
verified — this entry fixes what doc 117 and doc 118 assert, not every
document either one cites, matching this batch's own standing rule
(ADR-052's doc 128 in miniature: fix the document actually being
inspected, name the sibling's error rather than silently absorbing the
fix into an unrelated pass).

### Reasoning

Both errors are instances of the same failure mode this whole
architecture-patterns set keeps surfacing: a document's own "already
exists" claim is only as good as the last time anyone actually checked it
against the codebase, and a sibling document's *sketch* — code presented
inside a proposal, complete with a Prisma `model` block and a plausible
method signature — reads exactly like real code to a later document that
cites it without re-verifying. Doc 117 cited three sketches as shipped;
doc 118 cited a model its own source document explicitly labels
unbuilt. Neither error was contained to its own document: doc 118 and
doc 115 shared the identical wrong method name, and doc 116 carries the
same `ApiClient` mistake doc 118 does — evidence that a wrong citation
propagates forward through "cites doc N's own finding" chains exactly as
easily as a correct one does, which is the argument for verifying at the
point of citation, not trusting the citation's own age or apparent
authority.

### Consequences

- Doc 117's thesis is now backed by five real, checkable citations
  instead of one real and three fabricated ones — a future reader
  verifying "is idempotency really domain-keyed here" finds working code
  at every link.
- Doc 118 and doc 115 no longer send a future reader looking for
  `OrdersService.createFromPos()`, which does not exist.
- The real service-account gap (doc 34's `ApiClient`, deliberately
  deferred) and the real shipped mechanism (doc 163's `ApiKey`) are now
  correctly distinguished in doc 118 — a future agent-integration effort
  building on this document will design against the credential this
  repository actually has, not one that was explicitly set aside.
- Doc 116's own `ApiClient` citation is now a known, named, open
  correction for whenever that document is next inspected — not
  rediscovered from scratch.

### Status
**Accepted.**

## ADR-056 — Docs 122 (data lake), 130 (capability manifest) and 131 (versioned domain events): one more fabricated citation, one more deferred-model repeat, one small real work order actually shipped

### Context

Three more architecture-patterns documents needed inspection. Doc 122
argues a data lake is premature at this repository's current scale and
names the measurable trigger for revisiting that; doc 130 proposes a
live, machine-readable capability manifest for programmatic API
discovery; doc 131 names the naming convention for a breaking domain-event
shape change. None had been checked against the live codebase before this
pass.

### Decision — doc 122: one citation corrected, thesis unaffected

Doc 122 cited `doc 71's BomProductionLineLot` as an example of a real
table with a documented expected row count, alongside doc 60's headcount
series and doc 79's `AssetAssignment`. ADR-055 already established that
`BomProductionLineLot` does not exist anywhere in this codebase — doc 71
is an unbuilt sketch. Corrected to `doc 22's AttendanceEvent` (built,
partitioned by month, ADR-046) — a real table with the identical
row-count discipline doc 122's own citation intends to demonstrate. The
document's actual thesis — no table has been documented as approaching a
size where indexing and partitioning stop being sufficient, and the
concrete trigger for revisiting a data lake is the two named conditions,
not a vague sense of scale — never depended on this specific citation and
is otherwise unaffected.

### Decision — doc 130: verified, deliberately left unbuilt

Doc 130 names three consumers for the capability manifest it proposes: an
AI agent via doc 116's MCP tool adapter, a hyperautomation platform via
doc 36's `OutboundConnector`, and "a future integration partner" via doc
34's `ApiClient`. All three are confirmed unbuilt: doc 116's own WO-116.1
is explicit that no adapter exists yet; doc 36 carries no `Status:` note
and `OutboundConnector` matches nothing in `apps/api/src`; doc 34's own
header says its `ApiClient` is the service-account model ADR-037
"deliberately defers... nothing below is built" (the same finding
ADR-055 already made correcting doc 118's identical citation). With zero
real consumers today, building a live introspection endpoint for them
would be exactly the speculative functionality CLAUDE.md's "No
speculative functionality" section forbids — matching the identical
reasoning already applied to doc 128's `ShippingCarrier.getRate()` and
doc 139's `AgentSessionGateway` (ADR-052, ADR-054). Marked verified with
no code built. Two corrections recorded for whenever a real consumer is
named and this is actually built: the sketch's `organizationId` parameter
repeats the recurring mistake ADR-044/040 already corrects throughout this
session (this deployment IS the tenant), and doc 128's own new ports are
named `IdentityProvider`/`CourierProvider` in the real code, not
`identity`/`ShippingCarrier` as the sketch had it — both fixed in the
document's own body, not just its Status note, so a future implementer
reads a self-consistent sketch.

### Decision — doc 131: WO-131.1 shipped; WO-131.2 deferred on a dependency that does not exist yet

Doc 131's own convention — additive event-shape changes are never a
version bump; a genuinely breaking change publishes under a new event
name (`OrderPlaced` → `OrderPlacedV2`) alongside the original for a
defined migration window, retired only once the generated
`docs/index/cross/events.md` shows zero remaining subscribers — is sound
and needed nowhere to be built to state. WO-131.1 ("record this convention
in `core/events`'s own README/header comment") is exactly that: a
documentation-only work order with no dependency on anything else, shipped
by adding the convention directly into `domain-events.ts`'s own existing
header comment, next to its "adding an event" guidance. WO-131.2 ("extend
doc 38's WO-38.5 contract-test suite" to flag a zero-subscriber
predecessor) cannot be built: doc 38 carries no `Status:` note and no
contract-test file exists anywhere in `apps/api/src` for WO-131.2 to
extend — WO-38.5 itself was never built. Deferred until WO-38.5 exists,
rather than building a speculative extension of a mechanism this
repository does not have.

### Reasoning

Doc 122 and doc 130 are the same lesson as ADR-055 in miniature, applied
twice more: a document's own evidentiary citations are only as reliable as
the last time anyone checked them, and a proposal that reads like shipped
code (a Prisma sketch, a plausible interface, a doc-comment reference)
keeps getting cited by later documents as though it already exists. Doc
130 in particular is the fourth instance this session of the identical
gating pattern (docs 128, 139, 116, now 130): a document proposes a real,
buildable mechanism whose only stated justification is future,
hypothetical callers — the correct answer every time has been to verify
the document's own reasoning holds, not to build ahead of a named
requirement. Doc 131 is the opposite case: a small, genuinely
independent, zero-dependency piece of its own work order was buildable
today and is now built, while a second work order that looked equally
small on the page turned out to depend on infrastructure (doc 38's
WO-38.5) that was never built — the "verify before building" discipline
catching a dependency gap as readily as a fabricated citation.

### Consequences

- Doc 122's own trigger-condition argument is now backed by a real table
  citation instead of a nonexistent one.
- Doc 130 is confirmed current — a future reader does not re-verify
  whether doc 116/36/34's own consumers exist before deciding not to build
  the manifest, and does not build it without first confirming a real
  consumer has been named; its own sketch is corrected in place so
  building it later starts from an accurate design.
- The next genuinely-breaking domain-event shape change in this
  repository has a stated, discoverable convention to follow
  (`core/events/domain-events.ts`'s own header), rather than an ad hoc
  decision made under deadline pressure.
- WO-131.2 is a named, open dependency on WO-38.5 rather than a silently
  dropped work order — whoever builds doc 38's contract-test suite next
  has a already-scoped follow-up waiting.

### Status
**Accepted.**

## ADR-057 — Docs 133 (dry-run harness), 134 (hexagonal-purity CI check) and 138 (technology substitution playbook): a naming convention shipped with better evidence than it cited, a real static check built and wired into `pnpm lint`, one CI overclaim corrected

### Context

Three more architecture-patterns documents, all genuinely small and
buildable rather than deferred-pending-a-real-requirement like the
previous batch: doc 133 proposes a `preview()`/`apply()` naming
convention so future policy-as-data mechanisms don't each reinvent a
dry-run design; doc 134 proposes a static check enforcing that a service
file never imports a transport-layer or frontend-framework dependency;
doc 138 is a written swap-path playbook for every core dependency not
already behind a provider-registry interface.

### Decision — doc 133: shipped, with its own citations replaced by stronger real evidence

Doc 133's opening cited `TaxRate` changes and `ApprovalChain` policy
edits as already having "separately-built preview mechanisms" — neither
does; `TaxRate` is effective-dated (a different technique, a future-dated
row, not a "compute what apply() would do without doing it" method), and
`ApprovalChain` has no simulate/preview method at all. Its other two
citations, doc 132's webhook test-delivery and doc 144's sandboxed
formulas, both carry no `Status:` note — neither is built. The actual
codebase has stronger evidence than any of these: at least four real,
independently-built `preview()`/apply()-shaped pairs —
`CategoryPresetService.preview()`/`.apply()` (an exact match to the
document's own proposed interface), `OrgUnitGrantService
.previewIssue()`/`.issue()`, `AttendanceService.previewAdjust()`/
`.adjust()`, and `MerchantPayableService.previewPayoutRun()`/
`.processPayoutRun()` — each arrived at independently, in a different
module, with no shared base class, exactly the pattern the document
argues for. WO-133.1 (record the convention) is built:
`.claude/rules/services.md` — which already loads for every
`*.service.ts` file per its own `paths:` frontmatter — states it under a
new "Dry run before live" heading, citing the four real pairs above.

### Decision — doc 134: shipped, `scripts/check-hexagonal-purity.mjs` wired into `pnpm lint`

Verified doc 115's own claim first: no `*.service.ts` file in this
codebase imports `express`, `react`, `next`, or uses an `@Req()`/`@Res()`
decorator — the claimed zero-violation baseline holds. Built
`scripts/check-hexagonal-purity.mjs` following `check-module-boundaries
.mjs`'s own file-walking and error-reporting shape, and `check-rebrand
.mjs`'s own `--self-test` convention (8 synthetic cases: an Express
import, a type-only Express import, a React import, a Next.js subpath
import, a bare `@Req()` decorator with no import, and three cases that
must NOT trigger — an ordinary NestJS import, a same-repo service
import, a comment merely mentioning the word). Wired into `pnpm lint`
immediately after `check-module-boundaries.mjs`, with its own `pnpm
check:hexagonal-purity` alias matching every other standalone check in
this repository. Run against the live codebase: 153 service files,
zero violations.

### Decision — doc 138: corrected, one CI overclaim found and fixed

Doc 138's fourth playbook entry claimed a Node.js runtime bump is "a
`Dockerfile` change, tested in CI before rollout." Verified false:
`.github/workflows/ci.yml` runs lint, typecheck and tests directly
against the Node runtime and never builds or runs either
`apps/api/Dockerfile` or `apps/web/Dockerfile`; `.github/workflows
/deploy-cloudflare.yml` is a deployment-status notifier for Cloudflare
Pages' own auto-build, not a Docker pipeline — no workflow in this
repository builds or tests a Docker image today. The Dockerfiles
themselves are real (doc 94's own "verified" status already confirms
this) and a runtime bump genuinely is a small, contained edit — the
overclaim was specifically "tested in CI," now corrected to name the gap
honestly: a runtime bump is manually verified before rollout until a CI
step actually builds and smoke-tests the image. Every other entry
(`PasswordHasher`'s real pluggable-algorithm interface, doc 100's own
outbox-to-broker trigger condition, the provider-registry pattern for a
vendor going out of business) checked out real on inspection.

### Reasoning

Doc 133 and doc 138 both repeat a pattern this whole batch keeps
surfacing — a document's own citations are only as reliable as the last
time anyone checked them, and correcting them is often not a downgrade:
doc 133's real evidence (four independent, unprompted implementations of
the identical shape) is a *stronger* argument for its own thesis than the
fabricated one it originally cited. Doc 138's CI-testing overclaim is a
different, subtler failure mode worth naming on its own: a document
claiming a REAL artifact (the Dockerfiles) is protected by a process that
does not exist (CI building/testing it), which is exactly the gap
`CLAUDE.md`'s own "Observable" pillar row warns against — "never claim
monitoring exists where only logging does," restated here as "never claim
CI coverage exists where only the artifact does." Doc 134 is this
session's rare document that needed no citation correction at all: its
own zero-violations baseline held, and the check it proposed was cheap
enough to just build, matching its own "worth building even though the
audit found zero violations today" argument for why a check like this
earns its keep before the first violation ever lands.

### Consequences

- `.claude/rules/services.md` now states the dry-run naming convention
  next to the failure-path and observability rules every `*.service.ts`
  file already loads — the next policy-as-data mechanism has a named
  pattern and four real examples to follow.
- `pnpm lint` now catches a service file importing a transport-layer or
  frontend-framework dependency the moment it lands, rather than relying
  on review to notice — the same "prevent the first violation" reasoning
  that already justifies `check-module-boundaries.mjs`.
- Doc 138's playbook no longer claims a CI safety net that doesn't exist;
  a future reader deciding whether a Node runtime bump is safe to ship
  knows to verify it manually rather than trusting an automated check
  that was never built.

### Status
**Accepted.**

## ADR-058 — Doc 165 (cross-tenant marketplace directory), part two: WO-165.1/165.2/165.6 built; WO-165.3/165.4/165.5 deferred together as ADR-047 already scoped them; the publisher credential is ops-issued, not self-service; `enforceSso` gates by legacy `User.role`, exempting whoever turned it on

### Context

ADR-047 recorded doc 165's design without building it. This session built
the work orders ADR-047's own Consequences already named as immediately
buildable with no external dependency (WO-165.1, the schema; WO-165.6, the
`enforceSso` column) plus WO-165.2 (the publish API and its erp-1 admin
screen), and left WO-165.3/165.4/165.5 exactly where ADR-047 already put
them — blocked on nID's own OIDC surface, in a repository
(`nadeemmurtaza/nID`) not attached to this session. Two questions doc 165's
own text does not fully answer came up during the build and needed a
decision: who issues a `MarketplacePublisherCredential`, and which accounts
are exempt from `enforceSso`.

### Options considered

**Credential issuance:**
1. **Self-service** (doc 165 §2's own wording: "the tenant generated
   once") — rejected: doc 166's own already-built mechanism
   (`MarketplaceCredentialsController`, `OpsAuthGuard`,
   `RequireOpsPermission('platform.marketplace.manage')`) is ops-only, and
   building a second, tenant-facing issuance path would be a duplicate
   implementation of the exact credential doc 166 already mints, the kind
   of drift CLAUDE.md's search-before-creating rule exists to prevent.
2. **Mirror doc 166's ops-only mechanism, erp-1 reads the issued credential
   from server-side env** — selected. Matches doc 14's
   `ManagedServicesService` pattern exactly: `MARKETPLACE_API_URL`/
   `MARKETPLACE_API_KEY`, never sent to the browser bundle,
   `ServiceUnavailableException` when unconfigured. A documented deviation
   from doc 165's own §2 wording, not a silent one.

**`enforceSso`'s scope and its escape hatch:**
1. **Block every account's password login** — rejected: `/auth/login` is
   the same route a storefront customer signs in through
   (`AuthService.login()` has no separate staff endpoint), so this would
   lock out every customer the moment any tenant enabled SSO for their own
   staff — a severe, undocumented regression doc 165's own text does not
   ask for ("erp-1 staff login" is the phrase used throughout §3).
2. **Gate on `User.roleAssignments` (the real RBAC)** — considered,
   rejected as unnecessarily indirect: the legacy `role: UserRole` enum
   (`CUSTOMER`/`STAFF`/`TAILOR`/`ADMIN`) already reliably distinguishes a
   customer from a staff account — `SsoService.resolveOrProvision()` itself
   sets `role: 'STAFF'` on every SSO-provisioned account, and the schema's
   own comment says a public signup is always assigned `CUSTOMER`. Reusing
   this field needed no new query against the grants table.
3. **A dedicated `User.isBreakGlassAdmin` flag** — rejected: doc 165's own
   text says "the one break-glass admin doc 161's own design already
   assumes exists" without naming a concrete mechanism, and inventing a new
   column for it would be exactly the kind of un-asked-for schema addition
   CLAUDE.md's "no speculative functionality" rule forbids.
4. **Exempt `SsoConnection.createdByUserId`** — selected. The admin who
   flips `enforceSso` to true is, by definition, the one person who must
   never be locked out by their own change — otherwise a misconfigured
   connection (wrong issuer, an outage at the identity provider) would be
   unrecoverable without direct database access. `createdByUserId` already
   exists on the row for exactly this kind of accountability, needs no new
   field, and gives a single, auditable, self-consistent answer to "who is
   the break-glass admin" grounded in what actually got built rather than
   what doc 165 assumed.

### Decision

Built: the full WO-165.1 schema (`MarketplaceListing`,
`MarketplaceViewerProfile`, `MarketplaceEngagement`, alongside doc 166's
`MarketplacePublisherCredential`); WO-165.2's platform publish API
(`MarketplaceListingsController`/`Service`, upsert on
`[tenantId, externalRef]`, `getOwnedOrThrow` toxic-pair check, auto-delist
on credential revocation) and erp-1's thin proxy (`MarketplaceModule`, off
by default, `catalog.manage`-gated, mirroring `ManagedServicesService`) plus
its admin "Publish to marketplace" screen; WO-165.6's
`SsoConnection.enforceSso` column, `AuthService.login()`'s guard clause
(refuses password sign-in for `role !== 'CUSTOMER'` once any `ACTIVE`
connection has `enforceSso: true`, except that connection's own
`createdByUserId`), and the admin toggle on the connection's own settings
screen. WO-165.3, WO-165.4 and WO-165.5 are untouched, exactly as ADR-047
already scoped them — not re-litigated here, per this repository's own "do
not repeatedly revisit a settled decision without new evidence" rule: no
new evidence about nID's OIDC surface exists this session.

### Reasoning

Every deviation above traces to a real, already-built artifact rather than
an assumption: the ops-only credential path exists in code today
(`marketplace-credentials.controller.ts`), so erp-1's side had to be built
against what actually gates that credential, not against doc 165's own
description of it. The `enforceSso` exemption traces to a field
(`createdByUserId`) that already exists on `SsoConnection` for auditing —
reusing it for the break-glass exemption needed no new column and kept the
change to "a column and a guard clause," exactly the scope doc 165's own
§3 asks for. Deferring WO-165.3/165.4/165.5 together, rather than trying to
carve out a partially-unblocked slice (e.g., building an inbound
"marketplace calls into erp-1" endpoint ahead of the OIDC client), was
judged and rejected during this session's own scoping: it would introduce a
novel, security-sensitive inbound surface with no existing precedent and no
reviewer available to check it against a real nID contract — worse than
waiting.

### Consequences

- A tenant with no `MarketplacePublisherCredential` configured sees no new
  behavior: `marketplace` is `offByDefault` in `modules.registry.ts`, and
  its nav entry, routes and controller are all gated the same way
  `managed-services` already is.
- `enforceSso` is additive and defaults to `false` — every existing
  deployment's login screen is byte-identical until an admin explicitly
  opts in per connection, restated from doc 161's and doc 165's own
  acceptance criteria.
- The exemption is per-connection, not global: an org running two
  enforced `SsoConnection` rows has two independent break-glass admins,
  one per connection's own `createdByUserId`. This was not named as a
  goal in doc 165 but falls out correctly from reusing the existing field
  rather than adding a new one.
- WO-165.3/165.4/165.5 remain named, not silently dropped: doc 165's own
  status blockquote and `docs/implementation/README.md`'s entry are both
  updated to state exactly what is built versus still blocked, so a future
  session (or one with `nadeemmurtaza/nID` attached) has an accurate
  starting point rather than rediscovering this scoping from scratch.
- `MarketplaceViewerProfile`/`MarketplaceEngagement` exist as tables with
  no reader or writer yet — intentional, matching WO-165.1's own framing
  as one work order bundling all four models, and this repository's
  established precedent (doc 18.5's EDI deferral) for shaping a genuinely
  blocked future phase so a real request is not a design exercise.

### Status
**Accepted.**

## ADR-059 — Doc 166 (unified product reference registry), the erp-1-side pieces: `adopt()`/`apply()` split instead of one method; WO-166.5 (moderation) is not erp-1's work; the platform's own outbound dispatcher stays unbuilt for the same reason apps/platform has no other outbox infrastructure

### Context

ADR-048's own build-time follow-up shipped WO-166.1/166.2/166.6 on the
platform side and left WO-166.3 (erp-1-side autofill UI), WO-166.4
(erp-1-side sync consumer) and WO-166.5 (moderation screen) named but
unbuilt. This session built the genuinely erp-1-side pieces. Doing so
surfaced three questions doc 166's own text does not fully answer: whether
"apply the reference" is one method or two, whether WO-166.5 belongs to
this build at all, and what to do about the platform's own outbound sync
dispatcher that §2 assumes exists.

### Options considered

**One write method, or two:**
1. **A single `apply()` used both when a staff member accepts an autofill
   and when a later sync delivery arrives** — rejected. The two moments
   need different behavior: accepting an autofill happens immediately
   after the product's own normal save already wrote whatever the staff
   member kept or edited from the preview, so re-writing
   `name`/`description`/`careInstructions` from the "canonical" reference
   at that point would silently discard an edit made seconds earlier — the
   opposite of doc 166's own "the staff member reviews and saves." A later
   sync delivery, by contrast, exists ONLY to propagate exactly that kind
   of edit to every linked tenant — refusing to overwrite text there would
   defeat the entire mechanism.
2. **`adopt()` for the tenant's own explicit accept, `apply()` for an
   inbound delivery** — selected. `adopt()` stamps provenance
   (`sourcedFromGlobalReferenceId`/`sourcedFromReferenceUpdatedAt`) and
   writes the reference's own images (which the ordinary upload form has
   no way to bring in from a remote URL) without touching translation text
   that already exists; it only creates a translation for a locale the
   product doesn't have yet. `apply()` overwrites text, but only on a row
   still carrying the SAME reference's own marker, and only when the
   incoming `updatedAt` is newer than what was last applied — the
   redelivery-idempotency and "never silently clobbered" guarantees doc
   166 §2 asks for.

**Whether WO-166.5 (moderation) belongs to "build the erp-1-side pieces":**
1. **Build it anyway, as an erp-1 admin screen** — rejected: doc 166's own
   Work Orders section labels WO-166.5 "(platform staff)", not
   erp-1-side, for a concrete reason — `GlobalProductReferenceFlag` is a
   platform-side table, and moderating it is an ops action, not a tenant
   action. Building it inside erp-1 would mean either exposing another
   tenant's flag data to every tenant (a real cross-tenant data leak) or
   scoping it to "flags this tenant raised," which is not what a
   moderation screen for ops staff needs to do.
2. **Build a first ops console for `apps/platform`** — rejected for this
   pass: `apps/platform` is a NestJS API with no frontend of any kind
   today (`OpsAuthGuard`'s own callers are curled/scripted, not clicked).
   Standing one up is a real, standalone architectural decision — which
   framework, which auth flow for ops staff, where it deploys — far larger
   than one moderation screen, and not something this document's own scope
   asked for.
3. **Name it honestly as out of this pass's reach, exactly like doc 165's
   own nID blocker** — selected. Doc 166's own status note and
   `docs/implementation/README.md`'s entry both say plainly that WO-166.5
   needs a platform ops console that does not exist, rather than silently
   building the wrong-shaped version of it or silently dropping it.

**The platform's own outbound sync dispatcher:**
1. **Build it now, alongside the erp-1-side consumer** — rejected: §2
   describes it as reusing "the identical at-least-once, backed-off outbox
   delivery doc 18.3 already built," but that pattern (`EventBusService`/
   `OutboxDispatcher`) lives entirely in `apps/api`. `apps/platform` has no
   outbox or domain-event infrastructure of its own — building one now
   would be a new piece of shared infrastructure for a second NestJS app,
   not "the erp-1-side pieces" this session was asked to build.
2. **Build the erp-1-side consumer (`apply()` plus the inbound webhook)
   ahead of its sender, tested against a simulated delivery** — selected,
   mirroring doc 18.5's own EDI-adapter deferral pattern exactly: shape the
   receiving side so a real request is not a design exercise, without
   inventing the sending side speculatively.

### Decision

Built: `ProductTranslation.sourcedFromGlobalReferenceId`/
`sourcedFromReferenceUpdatedAt` and `ProductImage.sourcedFromGlobalReferenceId`
(additive columns, migration `20260926210218_wo166_product_reference_sync_provenance`);
`ProductAdminService.update()`'s translation upsert now clears both
`ProductTranslation` fields on every ordinary edit, which is what makes a
later hand-edit "a deliberate override" rather than a state nothing ever
reset. `ProductReferenceSyncService.adopt()`/`.apply()` as scoped above.
`ProductReferencesController` (`GET .../lookup`, `POST .../apply`,
`POST .../register`, `catalog.manage`-gated) and
`MarketplaceWebhookController`/`MarketplaceWebhookGuard` (`@Public()`,
authenticated by the SAME `MARKETPLACE_API_KEY` this tenant already holds
for its own outbound calls — never a second credential, restated from doc
165's own "one credential authenticates both capabilities"). The product
editor's own barcode field triggers the lookup on blur, gated behind the
`marketplace` module so a deployment without it fires no extra request;
`BarcodeReferencePreview` shows the match and writes nothing until "Fill
from shared listing" is clicked; a genuinely new barcode is registered
silently after save, exactly matching §2's own "the form behaves exactly
as it does today."

### Reasoning

Every one of these three decisions traces to the same principle: build
what was actually asked (the erp-1-side pieces), name what depends on
infrastructure or a surface that does not exist rather than inventing it
speculatively or silently dropping it. The `adopt()`/`apply()` split is not
an added abstraction for its own sake — it is the direct consequence of
the two callers needing incompatible answers to "should this overwrite
existing text," and merging them would have silently picked the wrong
answer for one of the two. Declining to build a platform ops console or a
platform outbox mirrors this repository's own established discipline
(doc 18.5, ADR-047's own nID deferral) of shaping a receiver ahead of its
sender rather than building both halves of a mechanism whose other half
depends on a decision — a framework choice, an auth flow — this document
was never asked to make.

### Consequences

- A staff member's own edit to a product's name/description/care
  instructions, made through the ordinary product form, always clears
  `sourcedFromGlobalReferenceId`/`sourcedFromReferenceUpdatedAt` — anyone
  auditing why a product "stopped syncing" should look here first, not at
  `ProductReferenceSyncService` itself.
- `ProductReferenceSyncService.apply()` has no live caller today (no
  platform-side dispatcher exists to invoke the webhook it backs) — it is
  fully covered by unit tests against a simulated delivery, the same
  "tested but not yet exercised end-to-end" state doc 18.5's own EDI
  translator interface has always been in.
- WO-166.5 remains genuinely unbuilt, not deferred inside erp-1's own
  scope — a future session building a platform ops console (for this or
  any other ops-facing screen `apps/platform` will eventually need) should
  treat that as its own architectural decision, not a continuation of this
  document.
- `pnpm index` must be regenerated (new module files, migration, routes,
  tests) and the doc's own status blockquote and
  `docs/implementation/README.md` entry are both updated to state exactly
  what is built versus still blocked.
### Status
**Accepted.**

## ADR-060 — Doc 24 (internal notifications, meetings and escalation): built in full, with one new model beyond its own sketch and a countersignature routed to a named person rather than a role

### Context

Doc 24 named a real gap this repository had no answer for: staff messaging
already exists (`NotificationsService`, three real `NotificationChannel`
implementations), but there was no way to say *every department head in
the North region* and have it resolve to people, no way to call a meeting
and know who has not answered, and no way to make a stalled approval
visible when the approver is simply not acting. All three are genuine,
distinct capabilities the document correctly refused to build as three
separate ad-hoc mechanisms.

### Decision — built: `Audience`, `NotifyService`, `MeetingsService`, `EscalationCron`, three permissions, admin UI

`apps/api/src/modules/notify/` now holds `AudienceService` (`resolve()`,
reach-intersected against the sender's own open postings via the same
`reachOf()` pattern `GrantService` already established, and shared
unchanged between preview and the real send), `NotifyService`
(`send()`/`decide()`), `MeetingsService`
(`create()`/`respond()`/`cancel()`/`shortfallReport()`) and
`EscalationCron` (a 10-minute tick climbing `Position.reportsTo`). The
three named permissions (`notify.send`, `notify.broadcast`,
`notify.escalation.manage`) are seeded through `ROLE_PERMISSION_SEED` and
grouped in `PERMISSION_GROUPS`, `notify.broadcast` paired with
`org.access.grant` in `TOXIC_PERMISSION_PAIRS` exactly as the document's
own scope lens named. `notify` is registered as a `core` module — not
off by default — matching `tasks` and `attendance`'s own precedent that a
broadly useful staff-facing capability is not sector- or scale-gated.
Delivery itself is not rebuilt: `NotifyService.dispatch()` and
`MeetingsService`'s own notifications call the existing
`NotificationsService.send()`, so `grep -rn "implements NotificationChannel"`
still returns the same three channels this work order started with.

Two deliberate departures from the document's own literal sketch, both
required to make the document's own stated requirements real rather than
aspirational, not silent improvisation:

1. **`BroadcastMessage` is a new model the document never sketched.**
   `ApprovalService.start(subjectType, subjectId, steps)` requires a real,
   persisted row's id as its subject — there is no way to gate an
   above-quorum announcement behind an approval chain without a row for
   the chain to attach to. The same row also answers the document's own
   "reversal document" scope lens: the permanent record of what was sent,
   to whom, and when, which a fire-and-forget notification send would
   otherwise never produce. `ApprovalSubjectType` gained a
   `BROADCAST_MESSAGE` member for this — the existing generic approval
   engine, never a second one.
2. **The countersignature is routed to a specific person, not a role.**
   `ApprovalService` deliberately does not resolve who may decide a
   step — stated in its own doc comment, and the correct behavior, since
   different callers need different resolution (`RequisitionService` and
   `AccountsService` gate role-shaped approvals by permission; this one
   names a specific individual). Doc 24's own text asks for "someone who
   outranks the sender," which this repository already models as the
   sender's `Position.reportsTo` holder, not a permission category — so
   `NotifyService.managerOf()` resolves that specific person at send
   time, and `NotifyService.decide()` itself checks
   `actorId === step.approverUserId`, throwing `ForbiddenException`
   otherwise. This is a correctness fix caught during implementation, not
   requested separately: without it, anyone holding a role-based
   permission the chain didn't name could decide a step meant for one
   named manager.

Two settings back the quorum threshold the document names but leaves
unmechanised: `NotifyAnnounceQuorumRankLevel` (default 30) and
`NotifyAnnounceQuorumRecipientCount` (default 50), both ordinary
`SettingKey` rows, client-editable with no deploy needed to retune either
number.

`EscalationCron.climb()` resolves the document's own two stated rules
into exact semantics: a vacant post costs no step — the climb passes
through it to its own `reportsTo` for free, and only a position with an
active `Posting` counts against `stepsPerFire`; a fire beyond
`ceilingRankLevel` or past `maxFires` stops rather than escalating
further, and each fire is keyed `@@unique([taskId, fireNumber])` so an
overlapping cron tick is a benign no-op rather than a duplicate page.

### Reasoning

Both departures follow the same rule this document set stays under
throughout this session: a document's own sketch is a specification of
intent, not a contract that forecloses a model the intent cannot actually
work without. `BroadcastMessage` is required, not speculative, by
`CLAUDE.md`'s own "Feature scope" standard — an above-quorum announcement
with no row to hang the approval chain on is not a smaller version of the
feature, it is a broken one. Routing the countersignature to a named
individual rather than a permission category is not a stylistic choice
either: `ApprovalService`'s own doc comment already puts step-ownership
resolution on the caller, and the document's own words ("someone who
outranks the sender") describe a specific relationship this repository
already has a table for (`Position.reportsTo`), so building a new
permission-shaped approval step here would have reintroduced exactly the
gap `notify.broadcast`'s toxic-pair entry with `org.access.grant` was
meant to close from the other direction — anyone with the broad
permission approving their own broadcast.

### Consequences

- Mass internal messaging in this repository can never bypass a human
  countersignature above the configured quorum, and that countersignature
  cannot be satisfied by anyone other than the specific manager the chain
  was addressed to.
- A stalled task now escalates without a human remembering to chase it,
  without ever paging past a configured ceiling or more than
  `maxFires` times, and without losing the post-not-person distinction a
  leaver would otherwise break.
- `docs/implementation/tasks-notifications-support/24-internal-notifications-meetings-escalation.md`
  carries its own Status blockquote naming every real file and both
  departures from its own sketch, following this session's own
  established discipline of naming every deviation rather than letting a
  document imply something was built exactly as first written.
- 27 new spec files under `apps/api/src/modules/notify/` bring the suite
  to 243 suites / 2,538 tests, all passing; `pnpm lint`, `pnpm typecheck`
  and `pnpm build` are all clean, including the `check-hexagonal-purity.mjs`
  and `check-env-templates.mjs` checks ADR-057 and this repository's own
  module-registration discipline both require.

### Status
**Accepted.**


## ADR-061 — Docs 47 and 150 (category presets, product bundles), the missing admin UI: "start from a template" and the bundle-builder screen, both reachable now; a `withLabels()` enrichment step so a bare scalar id never reaches an admin screen

### Context

Doc 03 (variants/SKU/SEO) was re-checked against the running code and found
still accurate — its own status note, last re-audited 2026-09-24, correctly
names WO-3.2 (the option-model read-switch) as deliberately deferred behind
an owner-held Setting flag, and WO-3.4/3.5's remaining gap (a variant
matrix-builder UI over the already-built, already-tested pure functions in
`packages/shared/src/variant-matrix.ts`) as a real but non-blocking
convenience — the existing flat-row editor already lets a boutique create,
edit and delete every variant a product needs. Nothing there needed
building this pass. Docs 47 and 150 were a different case: both had a
fully-built, fully-tested backend (`CategoryPresetService`,
`BundlesService`, complete admin routes) with **zero UI** — not a
convenience gap, but the specific violation CLAUDE.md's "A feature ships
whole, not backend-only" rule exists to catch. WO-47.4 and WO-150.6 were
each named, in the doc's own words, as "not yet built."

### Options considered

**Whether to build a UI at all, versus leaving these as backend-verified
capabilities:** rejected leaving them — a capability reachable only by a
developer typing a raw `curl` command is not reachable by the staff member
who actually needs it (an admin populating a new deployment's category
tree, a merchandiser building a starter kit), and doc 165/166's own build
this session already established the norm of shipping the UI alongside a
newly-discovered backend-only gap rather than treating "the API works" as
done.

**How to show a bundle's own variant and component references, given
`ProductBundle.variantId`/`BundleComponent.componentVariantId` are bare
scalars in the schema, not Prisma relations (the same "cross-module
references are bare scalars" reasoning ADR-012 already established,
applied here inside one module for the same reason: doc 150's own
`onDelete: Restrict` sits on `ProductVariantOptionValue`, not this pair, so
nothing here needed a hard FK to begin with):**
1. **Resolve labels client-side**, fetching each referenced variant
   separately after loading the bundle list — rejected: no existing
   endpoint returns a variant by id in isolation, and adding a
   many-small-requests pattern for what is naturally one batched query is
   the exact N+1 shape `.claude/rules/performance.md` flags as a defect.
2. **Enrich `BundlesService.list()`/`.get()` with a `withLabels()` step** —
   selected. One batched `productVariant.findMany({ where: { id: { in:
   [...] } } })` per response, resolving every `variantId`/
   `componentVariantId` to `"Product name — Variant (SKU)"` before the
   admin screen (or any future consumer of these two routes) ever sees a
   raw id — doc 150's own "Click the number" lens, applied literally.
   `update()`/`remove()`'s own internal existence check does not need this
   enrichment (only `variantId`/`isActive`/`components.length`), so a
   separate `findOrThrow()` keeps that path from paying for a label lookup
   it never uses — and keeps the existing spec suite's prisma mock (which
   never stubbed `productVariant.findMany`) passing unchanged.

**Where to put "start from a template":** the categories admin screen's
own header, always visible, plus the empty state's primary action — doc
47's own text names the empty/first-run case explicitly, and `ui.md`'s own
"no dead end" rule requires an `EmptyState` to carry an action rather than
a bare message.

### Decision

Built: `apps/web/src/app/(admin)/admin/(app)/categories/page.tsx` gained a
`Dialog`-based preset picker (`GET category-presets` list → `GET
.../:key/preview` on selection → `POST .../:key/apply` on confirm, showing
the created/skipped/collision counts before commit, per doc 47's own dry
run requirement). `apps/web/src/app/(admin)/admin/(app)/bundles/page.tsx`
(new) is the bundle-builder screen — a debounced product/variant search
(mirroring `cross-sell-manager.tsx`'s own established pattern, flattened
from product to variant granularity since a bundle's own identity and
every component are specific variants) picks the bundle's own already-
existing variant and its components, with per-component quantity and
remove controls, wired to the existing `POST`/`PATCH`/`DELETE
/admin/catalog/bundles` routes. Both screens are `catalog.manage`-gated,
matching each document's own already-recorded permission deviation.
`BundlesService` gained `BundleView`/`withLabels()`; `list()`/`get()`
return it, `update()`/`remove()` use the new unenriched `findOrThrow()`
instead. 4 new specs (`bundles.service.spec.ts`); full apps/api suite
passing with no regression.

### Reasoning

Both UI gaps trace to the same root cause — a backend built and verified
against a real database, with its own admin routes wired, but no session
carried the work through to a human clicking it — and both are fixed the
same way: reuse an already-established UI pattern (`Dialog` for a
preview-before-commit flow, the debounced-search picker already proven in
`cross-sell-manager.tsx`) rather than inventing a new interaction model for
either. The `withLabels()` enrichment is not scope creep on top of that: a
bundle-builder screen showing `cm8x...f3` instead of "Cotton shirt — Medium
(SHIRT-M)" would be unusable by the staff member it exists for, and doc
150's own "Click the number" lens already named this exact requirement
before this pass ever started.

### Consequences

- Every future consumer of `GET /admin/catalog/bundles` (or `/:id`)
  receives resolved labels for free — a second screen never needs to
  re-solve this problem.
- A component variant deleted out from under a live bundle degrades to
  showing its own raw id rather than throwing — named explicitly in
  `bundles.service.spec.ts`, so a future change to `withLabels()` cannot
  silently regress this into a 500.
- Doc 03's own remaining gaps (the matrix-builder UI, the barcode print
  sheet) remain named and unbuilt, not silently absorbed into this pass —
  they are real convenience work, not a backend-only capability nobody can
  reach, and the doc's own 2026-09-24 status note already states this
  honestly.
- `pnpm index` must be regenerated (new route, new screen, new tests) and
  both documents' own status blockquotes and `docs/implementation/README.md`
  are updated to say exactly what shipped.

### Status
**Accepted.**

## ADR-062 — Doc 61 (policy communications bulletin board): built inside the `notify` module rather than `hr`, an author-side reach check the document's own sketch omits, and a read-side visibility rule distinct from a sender's reach

### Context

Doc 24 already gave this repository a way to push an internal message to a
resolved audience. It gave no way to keep one: a company policy notice or
HR memo an employee can open days later and still read. Doc 61 names that
gap precisely and refuses to rebuild delivery for it — the entire scope is
a persistent, browsable record (`Bulletin`), reusing doc 24's own
`NotificationsService` fan-out for the "you have a new notice" ping.

### Decision — built: `Bulletin`/`BulletinAcknowledgement`, `BulletinsService`, a listener, two permissions, a two-screen admin UI

`Bulletin` (title, `bodyMarkdown`, `category`, `audienceOrgUnitId`,
`expiresAt`, `requiresAcknowledgement`, `archivedAt`) and
`BulletinAcknowledgement` (`@@unique([bulletinId, userId])`) land in
`notify.prisma`, not `hr.prisma` — the document's own casual suggestion
("wherever `NotificationsService` is already wired"). `hr` and `notify`
are separate module packs with no entry in `KNOWN_MODULE_COUPLINGS`, and
the document's own central rule — "never a bulletin-specific second
audience-resolution mechanism" — leaves no way to reuse
`AudienceService.resolve()` from a different module without one. Placing
`BulletinsService`/`BulletinsController`/`BulletinNotificationListener`
inside `notify` alongside the service that already owns audience
resolution is the only placement that keeps that rule true; `AudienceService
.reachOf()` was widened from `private` to a plain method on the same class
for this, not duplicated.

Two permissions, seeded exactly as the document asks: `hr.bulletins.view`
(low, seeded broadly to TAILOR/STAFF/ADMIN — "the whole point is being
read by everyone in scope," the document's own words, and the one `hr.*`
key in this codebase that is NOT ADMIN-only) and `hr.bulletins.publish`
(medium, scoped to the publisher's own reach). The admin UI is two
screens, not one — `/admin/bulletins` (the board, gated by the broad
permission) and `/admin/bulletins/new` (the post form, gated by the
narrow one) — Law 5 ("one main job per page"), since a page combining a
publish form with a general-readership board would show the form to
everyone whether or not they may use it.

Two things the document's own sketch does not specify, both decided
during implementation rather than left to guesswork:

1. **An author-side reach check `publish()` performs before writing
   anything.** The document's own scope lens states this is a real
   authority boundary ("who may publish org-wide vs. subtree-only… scoped
   identically to every other org-tree-scoped write") but its own code
   sketch shows no such check. Doc 24's own `AudienceService.resolve()`
   narrows a REQUESTED recipient list to a sender's reach at send time —
   there is no equivalent narrowing available for a persistent record,
   since nothing re-checks a `Bulletin` row's own `audienceOrgUnitId`
   after it is written. Left unchecked, a low-level employee could publish
   with `audienceOrgUnitId: null` and have it render as a genuinely
   org-wide notice. `BulletinsService.publish()` therefore calls the same
   `AudienceService.reachOf()` doc 24 already uses and refuses (Forbidden)
   an `audienceOrgUnitId` the author does not hold a posting at directly,
   or a `null` (org-wide) request from a reach-bound author. An
   unrestricted author (no posting at all — a fresh deployment's ADMIN)
   may address the whole organization, the identical unrestricted-reach
   reasoning `reachOf()` already documents.
2. **A read-side visibility rule that is the SUBTREE-INVERSE of a
   sender's reach, not the same computation.** `AudienceService.reachOf()`
   answers "which exact units does this sender hold a posting in" (used to
   narrow a REQUESTED audience). Reading a bulletin board asks a different
   question: "does a notice addressed to unit X reach a reader posted at a
   DESCENDANT of X?" `BulletinsService.eligibleAudienceIds()` answers it by
   flattening every `OrgUnit.path` the reader's own postings resolve to —
   a distinct computation from `reachOf()`, not a duplicate of it, and
   documented as such in its own doc comment so a future reader does not
   "simplify" the two into one.

### Reasoning

Both decisions follow this session's own repeated finding: a document's
sketch is a specification of intent the code must satisfy, not a contract
that forecloses whatever the intent cannot actually work without. An
authority boundary named in prose ("who may publish org-wide vs.
subtree-only") but absent from the sketch's own code is still a
requirement — the scope lens is normative, the code block underneath it
is illustrative. Building the write path with no such check would have
shipped exactly the "audience is a capability, not an address" violation
CLAUDE.md's own lens catalogue exists to catch, just one document later
than usual. The read-side computation earns its own name rather than
reusing `reachOf()`'s, because conflating "the sender's own posting units"
with "every unit whose subtree includes the reader" would have been wrong
in both directions: a sender addressing their own literal unit would
exclude every descendant reader, and a reader far up the tree from a
narrowly-addressed notice would incorrectly see it.

### Consequences

- A bulletin addressed to a unit is readable by everyone posted anywhere
  in that unit's own subtree, and by nobody else, without a second
  audience-resolution mechanism ever being written.
- A publisher bound to a reach cannot widen a notice's audience beyond
  their own posting by choosing a wider `audienceOrgUnitId` or `null` —
  the identical authority boundary doc 24 already enforces for a
  broadcast, now enforced here too, before the row is ever written rather
  than discovered later by an accidentally-org-wide notice.
- `docs/implementation/tasks-notifications-support/61-policy-communications-bulletin.md`
  carries its own Status blockquote naming every real file, the
  `notify`-not-`hr` placement, and both decisions above — the same
  discipline this session applies to every other document's own build.
- New spec files (`bulletins.service.spec.ts`,
  `bulletin-notification.listener.spec.ts`) cover the document's own
  Acceptance criteria directly: reach-bounded publish authority, exactly
  one `BulletinPublished` event per publish, an idempotent acknowledge
  proven by a second `P2002` being swallowed, and a retraction that
  archives rather than deletes.

### Status
**Accepted.**

## ADR-063 — Doc 167 (bank facility management): promoted from a gap report to a built capability, mirroring doc 49's own settlements shape rather than inventing a new one

### Context

`GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` named a real, entirely unbuilt
capability: what the business itself owes a bank against a facility limit
— a term loan, running finance, an overdraft, or a letter-of-credit/bank-
guarantee limit — the mirror concern to `receivables` (doc 145, what the
business is owed). The owner asked to check the next `finance-accounting`
doc; every numbered doc in that category was already built or verified, so
this gap report — explicitly marked "not scoped... nothing here is built,
scheduled" — was the only remaining item, and the owner chose to promote
and build it rather than leave the category's own gap report as the last
word.

### Options Considered

1. **Leave the gap report as-is.** Rejected — the owner explicitly asked
   to move it from gap analysis to built capability.
2. **Fold facility drawdowns/repayments into the existing `finance` or
   `accounting` module** rather than a new `bankfacilities` module.
   Rejected: every other genuinely optional, off-by-default treasury
   concern in this codebase (`settlements`, `receivables`'s own
   predecessor, `wallet`) is its own module precisely so a deployment with
   no bank facility never boots code that assumes one — folding this into
   `accounting` (always on) would mean every deployment pays for a concept
   most of them do not have.
3. **A single `BankFacilityTransaction` table** with a signed amount and a
   `kind` discriminator (DRAWDOWN/REPAYMENT/ACCRUAL) instead of three
   separate tables. Rejected: a drawdown, a repayment and a markup accrual
   have genuinely different columns (a drawdown has no `markupMinor`; an
   accrual has no `createdById` — it is system-posted) and different
   business rules (only a drawdown is ever refused for a limit breach or
   held for approval). Three narrow, explicit tables read correctly on
   their own; one wide table with nullable columns for whichever `kind`
   does not apply is the "every column or none" anti-pattern this
   document's own scope-lens section explicitly guards against elsewhere.
4. **Mirror `SettlementsService`'s own maker-checker and off-by-default
   module shape exactly, and `AssetDepreciationService`'s own monthly-
   accrual-cron shape exactly.** Chosen.

### Decision

Built as `167-bank-facility-management.md`, WO-167.1–167.6, in full:
`Bank`/`BankFacility`/`BankFacilityDrawdown`/`BankFacilityRepayment`/
`BankFacilityMarkupAccrual` (`bank-facilities.prisma`) in a new
`bankfacilities` module, off by default like `settlements`. A drawdown's
maker-checker (`recordDrawdown()`/`approveDrawdown()`/`postDrawdown()`)
mirrors `CreditNotesService.create()`/`.approve()`/`.issue()` field-for-
field: below `FinanceFacilityDrawdownApprovalThresholdMinor` it posts
immediately; above it, refused without a prior, different approver,
checked again at post time. `utilizationOf()` sums posted drawdowns minus
repaid principal at read time — never a stored counter — and
`recordDrawdown()` refuses outright, before creating any row, a drawdown
that would breach the facility's own limit. Three new GL accounts (`2500
Bank Loan Payable`, `2600 Accrued Markup Payable`, `5800 Markup Expense`)
and three new domain events (`BankFacilityDrawdownPosted`/
`RepaymentRecorded`/`MarkupAccrued`) handled by
`posting-rules.subscriber.ts` — `bankfacilities` never imports
`accounting`, the identical decoupling `settlements` already establishes.
The monthly markup-accrual cron (`BankFacilitiesCron`) mirrors
`AssetDepreciationCron` exactly: idempotent per `(facilityId,
periodStart)`, posting on the outstanding balance independent of any
repayment that month. Permissions `finance.facilities.view/.manage/
.approve_drawdown` seeded to `ADMIN`. UI: a facility list
(`/admin/bank-facilities`, utilization summary strip, a register dialog
that can also register a new bank inline) and a facility detail screen
(`/admin/bank-facilities/:id`, drawdown/repayment recording, drawdown
approve/post, markup-accrual history), reachable from the Finance nav
group. `GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` is kept, marked
superseded and pointing to doc 167, rather than deleted — it remains the
historical record of the gap as it stood before this build.

One deviation, the identical reasoning doc 49's own build already states:
`Bank`/`BankFacility` carry no `organizationId` — this codebase's real
multi-tenancy boundary is the deployment itself (`RETAIL-ERP.md` R7), and
no sibling model this document mirrors (`SettlementProvider`, `CreditNote`)
carries one either.

### Reasoning

Every mechanism this capability needs already has a proven shape
elsewhere in this codebase — a maker-checker threshold pair
(`CreditNotesService`/`SettlementsService`), a computed-never-stored
utilization figure (`bundleAvailableStock()`), a monthly accrual cron
(`AssetDepreciationCron`), an off-by-default module posting through domain
events only (`settlements`). Inventing a new pattern for any of these
would be the "no compromise" section's own defect: a locally different
shape here would mean a future reader has to learn a second convention for
something this codebase already has one convention for. Following each
existing shape exactly — including reusing the same threshold-setting
naming convention and the same private `findOrThrow`-style idempotency
discipline — means a developer who already understands settlements or
fixed-asset depreciation understands this capability's own mechanics
immediately, with nothing new to learn except the domain (borrowing
instead of collection or depreciation).

### Consequences

- A new client with a real bank facility relationship can be onboarded by
  toggling `bankfacilities` on in `MODULES` and registering their bank(s)
  and facility(ies) through the UI — no code change, no migration beyond
  the one this ADR ships.
- The three new GL accounts are seeded unconditionally
  (`seedChartOfAccounts()`'s own standing rule), so a deployment that later
  turns `bankfacilities` on has never had a first-run gap between "the
  module is on" and "the chart of accounts is ready for it."
- `GAP-ANALYSIS-BANK-FACILITY-MANAGEMENT.md` remains in the repository,
  marked superseded, per this codebase's own "no deletion without explicit
  confirmation" rule — a future reader following an old link still lands
  somewhere useful rather than a 404.
- A pre-existing ADR-numbering collision was discovered and fixed in the
  same pass: an earlier merge had left two unrelated ADRs both numbered
  ADR-060 (doc 24's own build, and docs 47/150's admin-UI build). The
  docs-47/150 one is renumbered to ADR-061 here, with every citing
  document (`47-preconfigured-sector-taxonomy.md`,
  `150-product-kitting-bundles.md`, `README.md`) updated to match — the
  same fix this repository's own DECISIONS.md history already applied once
  before to an ADR-054/055 collision. A second, freshly-introduced
  collision (this ADR and doc 61's own build, drafted independently on
  parallel branches, both claimed ADR-062) was caught at merge time and
  resolved the same way, before either branch's own citing documents ever
  diverged permanently: doc 61 keeps ADR-062 (already merged first), this
  document's own ADR is ADR-063.
- `pnpm index` must be regenerated (new module, new routes, new screens,
  new tests, new permissions) and `docs/implementation/README.md` is
  updated to say exactly what shipped.
### Status
**Accepted.**

## ADR-064 — Doc 64 (in-app help desk): built as a new standalone module, with a per-instance transition-authority rule and a name-resolution step the document's own sketch does not specify

### Context

Doc 64 named a real, narrow gap: nothing in this repository lets a staff
member raise a support request from inside the product and have it
tracked, assigned and resolved. `AuditService` records what happened and
`NotificationsService` delivers a message, but neither is a ticket with a
lifecycle. The document scopes this deliberately narrow — internal only,
reusing every existing primitive (permissions, `AuditService`,
`NotificationsService`) rather than a second identity or messaging system,
and explicitly out of scope for the external, customer-facing case doc
148 covers separately with its own actor model.

### Decision — built: `SupportTicket`/`TicketMessage`, `SupportTicketsService`, an action-hub source, four permissions, three screens

`SupportTicket`/`TicketMessage`/`TicketStatus`/`TicketPriority` land in a
new `support.prisma`, in a new, fully standalone `apps/api/src/modules
/support/` module — the document's own "The absent collaborator" lens
already calls for this: nothing depends on it, and it depends on nothing.
`SupportTicketsService` implements `create()`/`reply()`/`assign()`/
`transition()`/`list()`/`get()`; `SupportTicketActionSource` registers
into doc 44's own action-hub registry rather than a bespoke SLA-breach
mechanism, gated by a new `SupportTicketSlaMinutes` setting (240 minutes,
one default window — per-priority tuning is the document's own named,
deferred extension). Four permissions
(`support.tickets.raise`/`.handle`/`.view_all`/`.reassign`) are seeded
exactly as the document's own authority lens describes: `raise` broadly to
every internal role (TAILOR/STAFF/ADMIN — never CUSTOMER, since this is
the internal desk), `handle`/`view_all` to STAFF/ADMIN, `reassign`
ADMIN-only, mirroring `notify.broadcast`'s own admin-only precedent for
the same shape of "the broad override that may act on anything." Three
admin screens (list, raise, detail-with-reply-thread) serve both a
requester's own view and a handler's queue from one list — the API's own
visibility scoping makes a separate "queue" screen unnecessary, the
document's own WO-64.5 notwithstanding.

Two decisions beyond the document's own literal sketch:

1. **Per-instance authority inside `transition()`, since the document
   names no separate permission for it.** WO-64.3 lists exactly four
   permissions, none named "who may change a ticket's status." The
   document's own prose gives the answer piecemeal — "the requester
   reopens because the issue recurred" for the one backward move,
   `support.tickets.reassign` for "who may reassign any ticket" — so
   `transition()` checks, per call: the current assignee, or a
   `support.tickets.reassign` holder (the same broad override), or, only
   for the RESOLVED → IN_PROGRESS reopen, the original requester. This is
   the same identity-check-inside-the-service shape doc 24's
   `NotifyService.decide()` already established for an authority
   `@RequirePermission` alone cannot express.
2. **A name-resolution step `get()` performs that the sketch does not
   mention.** `raisedByUserId`/`assignedToUserId`/`TicketMessage.authorId`
   are bare scalars with no Prisma relation (the same "erasure the ledger
   cannot obey" shape `MeetingInvitation.userId` already uses), so serving
   them raw to an admin screen would put an unresolved id in front of a
   reader — exactly what ADR-061 already named as a defect for a bundle's
   component variant id. `SupportTicketsService.get()` batch-resolves
   every id on a ticket to a display name in one extra query, split from
   the shared `findVisible()` helper `reply()` also uses, so a reply's own
   visibility check never pays for a lookup it never uses.

`notifyHandlers()` resolves "whoever currently holds `support.tickets
.handle`" via the identical `roleAssignments: { some: { role: { grants: {
some: { permission: { key } } } } } }` query `credit-terms.service.ts`'s
own `notifyHoldApplied()` already established — reused, not reinvented,
matching the document's own "audience is a capability, not an address"
lens with existing precedent rather than a new mechanism. The same query
shape (as a boolean check, and as a batch check against a candidate set)
resolves `assign()`'s own assignee-eligibility rule and the action-hub
source's "assignee lost the permission" detection — one primitive, three
call sites, never three.

### Reasoning

Both decisions are the same pattern this session keeps finding: a
document's sketch specifies intent narrowly (four permissions, a plain
`SupportTicket`/`TicketMessage` shape) while its own prose and its own
scope lenses state requirements the sketch's code never renders — an
authority rule in words only, a raw scalar the "Whose rows, and which
columns" lens already implies must resolve to *something* a reader can
read. Treating the prose and the lenses as normative, and the code block
as illustrative, is what this whole batch of documents keeps requiring,
and doc 64 is no exception. The `notifyHandlers()`/`assign()`/action-hub
overlap is worth naming on its own: three call sites needing "does this
user currently hold this permission key" is exactly the situation that
tempts a bespoke abstraction; reusing `credit-terms.service.ts`'s own
already-established, deliberately simple (role-grants-only, no
`OrgUnitGrant`/`UserPermission` override resolution) query is the correct
call — `CLAUDE.md`'s own "can the existing system already solve this?"
answered yes, three times, without inventing a fourth shape.

### Consequences

- A staff member with no elevated access can raise a ticket and know it
  reached someone; a handler who loses `support.tickets.handle` (role
  change, deactivation) never leaves an open ticket silently orphaned on
  them — it surfaces to a `support.tickets.reassign` holder through doc
  44's own action hub, proven by a spec simulating exactly that
  deactivation.
- `docs/implementation/tasks-notifications-support/64-help-desk-support-ticketing.md`
  carries its own Status blockquote naming every real file and both
  decisions above, the same discipline this session applies to every
  other document's own build.
- 26 new spec files' worth of tests cover the document's own Acceptance
  criteria directly: visibility (404, never 403, for an out-of-scope
  ticket), the forward-only state machine with its one allowed backward
  move, and per-instance transition authority.
- `pnpm index` must be regenerated (new module, new routes, new
  permissions, new screens) and `docs/implementation/README.md`'s own
  entry updated to state exactly what shipped.

### Status
**Accepted.**

## ADR-065 — Doc 148 (external customer support portal): built as a second, `Contact`-keyed model alongside doc 64's own `SupportTicket`, sharing its handler permissions and its action-hub source rather than inventing either again

### Context

Doc 64 built the internal help desk and named its own external
counterpart as explicitly out of scope: "a customer-facing support portal
is a separate, larger effort," deferred to doc 148. That document's own
central thesis is that the two are not the same feature with a different
skin — the requester is fundamentally different. An internal ticket is
raised by a `User`, a staff member already inside the permission system.
An external one is raised by a customer, who is a `Contact`/`Party` in
this codebase's own three-table actor model (`CLAUDE.md`'s "The actor with
three tables" lens) and is never issued a `PermissionsGuard` principal for
it. Building this as a second `raisedByUserId` on the same
`SupportTicket` table would have been the shortcut; it would also have
been wrong, since a customer's session identity is their `User.id`, not a
staff principal, and the moment a customer had no order yet, there would
be nothing to key a ticket to at all.

### Decision — built: `CustomerSupportTicket`/`CustomerSupportMessage`, `CustomerSupportService`, a shared `SupportHandlersService`, an extended action-hub source, two customer-facing screens plus a staff queue

`CustomerSupportTicket`/`CustomerSupportMessage`/`CustomerTicketStatus`/
`SupportMessageAuthorType` land in the same `support.prisma` doc 64 owns
(one schema directory compiles as one schema; no new file was needed),
keyed on `contactId`, never `raisedByUserId`. The document's own sketch
carries an `organizationId` column; the built model has none, the same
deliberate omission ADR-040/044/046/049/060/062 already establish for
every other model in this deployment — this codebase's own tenant
boundary is the deployment itself, not a row-level column, and the file's
own header comment names the precedent rather than leaving the deviation
silent. `raise()` finds-or-creates
the caller's own `Contact` via `CrmService.upsertContact()` inside the
same transaction as the ticket write — the mechanism that closes the doc's
own "Contact creation timing gap": historically a `Contact` row only
existed once `OrderPlaced` fired, so a customer who registered but never
ordered had none yet. This is the one place `support` reaches into
`crm`, sanctioned as `'support -> crm'` in `KNOWN_MODULE_COUPLINGS` on the
identical same-transaction reasoning `'purchasing -> parties'` already
establishes: a ticket must never exist without its `Contact`, so the two
writes commit together or not at all.

The staff side is deliberately doc 64's own, unchanged, not a parallel
system:

1. **The same three permissions.** `support.tickets.handle`/`.view_all`/
   `.reassign`, seeded to the identical roles doc 64 already grants them
   to. A customer-raised ticket and a staff-raised one compete for the
   same handler pool, so a second permission set would only let one
   handler forget to hold both.
2. **`SupportHandlersService`, extracted rather than duplicated.**
   `SupportTicketsService.notifyHandlers()`/`holdsPermission()` (the
   `roleAssignments: { some: { role: { grants: { some: { permission: {
   key } } } } } }` query ADR-064 already traces to `credit-terms
   .service.ts`) moved into a new, shared, independently tested service
   both `SupportTicketsService` and `CustomerSupportService` now inject —
   "does this user currently hold this permission key" stays one
   primitive across both ticket kinds, not two copies that could drift.
3. **The same action-hub source, extended, not a second SLA mechanism.**
   `SupportTicketActionSource.fetchFor()` now also queries
   `CustomerSupportTicket`, tagging its items `kind: 'CUSTOMER_SUPPORT_TICKET'`
   against doc 64's own `'SUPPORT_TICKET'`, reusing the same
   `SupportTicketSlaMinutes` staleness window — the document's own WO-148.4
   asks for "likely one shared queue screen, filterable by ticket type,"
   and one registered source emitting two `kind` values is that, without a
   second SLA setting nobody would keep in step with the first.

Where doc 64 built one screen serving both requester and handler (its own
visibility scoping made a separate queue unnecessary), doc 148 could not:
a customer never holds a staff permission, so `getForCustomer()`,
`raise()` and `replyAsCustomer()` are a genuinely separate trust boundary
from `getForStaff()`, `assign()`, `transition()` and `replyAsStaff()` —
reflected as two controllers (`CustomerSupportController` on bare
`support/tickets`, matching `ReturnsController`'s own customer-facing
convention, and `CustomerSupportStaffController` on
`admin/support/customer-tickets`) and, on the storefront, three screens
(list, raise, detail-with-reply) under `account/support`, gated by a new
`@CustomerScope('support:read'|'support:write')` pair in
`CUSTOMER_SCOPE_CATALOG` so a personal API key can reach it exactly as
every other self-service resource does. On the admin side, a *second* nav
entry and a *second* pair of screens (`admin/support/customer-tickets`
list + detail) rather than a filter tab bolted onto doc 64's own
`/admin/support/tickets` — `CustomerSupportTicket` is a distinct Prisma
model with a distinct requester, so it is a distinct object with its own
queue, not a second view over the same one; the two screens are siblings
under the same permissions, not one screen wearing a toggle.

Two decisions beyond the document's own literal sketch:

1. **`reply()` is two methods, not one.** The document sketches a single
   reply path; `replyAsCustomer()` and `replyAsStaff()` split it because
   the two sides of the trust boundary need genuinely different
   visibility checks — Contact ownership on one side, staff
   assignment/`view_all` on the other — and because a customer's own reply
   while `AWAITING_CUSTOMER` auto-resumes the SLA clock (`IN_PROGRESS`),
   a transition only the customer side ever triggers. One method branching
   on `authorType` would blur exactly the distinction the document's own
   actor-model thesis insists on keeping sharp.
2. **The staff list batches its `Contact` name lookup, since the document
   names no shape for the queue row at all.** `listForStaff()` returning
   the bare `CustomerSupportTicket` (a `contactId`, not a name) would put
   an unresolved id in front of a triaging handler — the identical defect
   ADR-061 and ADR-064 already named for a bundle's component variant and
   a ticket's `assignedToUserId`. `listForStaff()` now batch-resolves every
   row's `Contact.name` in one extra query rather than one per row, the
   same N+1 discipline `getForStaff()`'s own `enrich()` already applies to
   a single ticket's messages.

`AWAITING_CUSTOMER` is the one state doc 64's internal ticket never
needed — a customer-support-specific holding state for "we are waiting on
the customer's own reply, not staff's" — and it is deliberately excluded
from the action-hub source's staleness detection in the `.handle` branch
(that clock belongs to the customer, not the assignee) while still
counted in the `.reassign` branch's orphan-detection query, matching the
document's own reasoning about whose inaction each query is meant to
surface.

### Reasoning

The document's own five lenses (`CLAUDE.md`'s "Feature scope") are answered
directly by the shape above, not worked around: the actor is a `Contact`
with a real `PERMISSION_CATALOG`-free authentication path (the storefront
customer session plus `@CustomerScope`, never `PermissionsGuard`); the
authority is doc 64's own three permissions, reused rather than
reinvented, so "whose rows, and which columns" stays answered by a query
this codebase already trusts; the act is a REQUEST the system may refuse
(a ticket, not a financial record) with its own forward-only state
machine plus the one named backward move; the money lens is `n/a` — this
feature writes no `JournalLine`; and the afterlife lens is a `CLOSED`
terminal state with no further undo, matching doc 64's own. The one place
this document's shape diverges from doc 64's is the trust boundary itself,
and that divergence — two controllers, two sets of storefront/admin
screens, one shared service layer and one shared action-hub source
underneath both — is the correct cost of getting `CLAUDE.md`'s "The actor
with three tables" lens right rather than papering over it with a second
`User`-shaped principal that would have been wrong the day a
never-yet-ordered customer tried to raise a ticket.

### Consequences

- A customer who has never placed an order can still raise a ticket —
  `raise()`'s own `upsertContact()` call guarantees a `Contact` exists
  before the ticket does, closing the gap doc 64's own model would have
  left open.
- A handler who loses `support.tickets.handle` never leaves a customer
  ticket silently orphaned any more than an internal one does — the same
  action-hub orphan-detection query now covers both `kind`s from one
  registered source.
- `docs/implementation/tasks-notifications-support/148-external-customer-support-portal.md`
  carries its own Status blockquote naming every real file and both
  decisions above, the same discipline ADR-064 applies to doc 64's own
  build.
- 51 tests across four new/changed spec files cover the document's own
  Acceptance criteria: a customer reaching only their own tickets (404,
  never 403, for someone else's), a staff reply notifying the customer
  through their own resolved contact channel, and `AWAITING_CUSTOMER` vs.
  `IN_PROGRESS` staying distinguishable through both the customer-reply
  auto-resume and the action-hub staleness split.
- `pnpm index` must be regenerated (new module surface, new routes, new
  scope keys, new screens) and `docs/implementation/README.md`'s own entry
  updated to state exactly what shipped — the fifth and final document in
  this batch's own "build all five" instruction.

### Status
**Accepted.**

## ADR-066 — Doc 144 (R20–R26 supply-chain resilience planning engine): built as a pure read/recommendation engine, generating only the two action kinds this graph has real data to back

### Context

`RETAIL-ERP.md` names seven complete architecture rules (R20–R26) — a
dependency graph, shock propagation, action ranking, GenAI narration,
liquidity forecasting, supplier lead-time distributions, and an online-
stock read model — with no code anywhere implementing any of them. This
was, by the doc's own words, "the single largest gap between what this
repository has already designed and what it has actually built." The
owner asked to build both doc 14 (already found built) and doc 144 in
the same pass; doc 144 is this ADR's own subject.

### Options Considered

1. **Build the full R20–R26 sketch literally, including its illustrative
   edge types and all nine named action kinds.** Rejected in part: two of
   the sketch's own illustrative dependency-graph edges ("SKU → Channel at
   Location" via a `LocationAssortment` model, "Sale → Cash account" via
   `JournalLine`) have no real, already-shipped row to project from in
   this actual schema — building them would mean inventing a projection,
   the exact thing R21's own "never invented, never guessed" rule forbids.
   Likewise, seven of R22's nine named action kinds (`EXPEDITE_PO`,
   `SPLIT_PO_ALTERNATE_SUPPLIER`, `SUBSTITUTE_SKU`,
   `REALLOCATE_ONLINE_BUFFER`, `DELIST_AT_LOCATION`,
   `MARKDOWN_TRAPPED_STOCK`, `RAISE_PRICE`) need data this graph does not
   project (an alternate-supplier PO split, a substitute-SKU mapping,
   markdown price elasticity) — generating them today would mean
   fabricating a recommendation with no real backing edge.
2. **Skip the whole document as "too large" and defer it entirely.**
   Rejected — the owner explicitly asked for it, and five of the seven
   architecture rules (R20, R21, R24, R25, R26) map cleanly onto real,
   already-shipped tables with no invented data required; only R22's own
   full action-kind catalogue and two of R20's own illustrative edges
   needed honest scoping, not the whole document.
3. **Build every function complete, generate every action kind with best-
   effort heuristics for the ones lacking real data.** Rejected — a
   "best-effort" `MARKDOWN_TRAPPED_STOCK` candidate with no real price-
   elasticity model behind it is exactly the "free-text suggestion an LLM
   invents" R22 explicitly refuses to be; a recommendation engine that
   sometimes fabricates its own inputs is worse than one that honestly
   says a capability is not there yet.
4. **Build every function this document names, generate only the action
   kinds with real, already-shipped backing data, and name the rest as
   forward-extensible but ungenerated.** Chosen.

### Decision

Built in full as a new, always-on `planning` module
(`apps/api/src/modules/planning/`): `DependencyGraphService.build()`
(R20) projects five real edge types — Supplier→SKU (`SupplierProduct`),
RawMaterial→SKU (`BomComponent`, extending the document's own type union
since this schema's raw materials are a distinct model from a finished
SKU, never conflated), SKU→Location (`VariantLocationStock`), Location→
Location (real `StockTransfer` history only — never a blanket "any two
locations may transfer" assumption), and Supplier→Obligation (unpaid
`SupplierBill`s). `propagate()` (R21) and `rankActions()` (R22) are pure
functions — no `prisma.*` call, no side effect, identical inputs produce
byte-identical output, proven by spec — with `rankActions()` generating
only `TRANSFER_STOCK` and `DELAY_DISCRETIONARY_AP`, the two action kinds
this graph has real data to back; the other seven are named in the
`CandidateActionKind` type for forward extensibility but never generated.
`NarrationService.narrate()` (R23) adds `AiFeature.PLANNING_NARRATION`
and refuses any narration whose text contains a standalone number outside
the exact figures it was handed — `assertNoOriginatedFigures()`,
word-boundary-matched so a bare entity id ("l1", "v42") is never mistaken
for an originated figure. `LiquidityForecastService.forecast()` (R24)
reads `JournalLine`/`Invoice`/`SupplierBill`/`PayRun` directly, including
a real `cashConversionCycleDays` computed as DIO+DSO-DPO from the same
tables. `SupplierLeadTimeObservation` + `SupplierResilienceService` (R25)
backfill automatically from the existing `GoodsReceived` domain event;
`supplierScorecard()`'s own `defectRatePct` is honestly `null` — no
quality/defect field exists anywhere in this schema, never fabricated.
`OnlineStockService` (R26) provides `onlineStockFor()` (a pure sum of
branch allotments) and `assignFulfillingBranch()` — the one place this
document writes, reversing and re-committing stock through the identical
`InventoryService.move()` writer every sale already uses, a new
`planning -> inventory` entry in `KNOWN_MODULE_COUPLINGS`. Permission
`planning.propagation.view` (Purchasing category) seeded to ADMIN; UI at
`/admin/resilience` (shock-scenario runner, liquidity forecast, supplier
scorecard lookup), reachable from the Stock nav group.

One further deviation beyond the two named above:
`assignFulfillingBranch()` is honestly a REASSIGNMENT, not a first-time
decrement from an unassigned state as the document's own pseudocode
assumed — this codebase's real order-placement flow already resolves and
decrements a real `locationId` at placement time, so assigning a
fulfilling branch reverses the existing commitment and re-commits it
elsewhere, never a second, competing decrement.

### Reasoning

R21 and R22 both state, in their own words, that a candidate or a
propagated figure must never be invented or guessed — that rule cannot
apply to every OTHER part of this document and stop applying to this
document's own scope-completeness. An engine that fabricates a
`MARKDOWN_TRAPPED_STOCK` recommendation with no real elasticity model
behind it, or a `Location -> Channel` edge with no `LocationAssortment`
row to back it, would be a worse violation of R20–R23's own stated
philosophy than simply not generating that piece yet. Naming the
remaining action kinds in the type (rather than omitting them entirely)
keeps the door open for a future work order to extend `rankActions()`
the moment a real data source exists — House Rule 1's own "adding a
sector adds a folder" instinct applied to a recommendation engine instead
of a sector pack.

### Consequences

- A new client with real purchase-order/goods-receipt/stock-transfer
  history gains a working resilience report and liquidity forecast with
  zero code changes — the engine is a pure projection over rows it
  already writes for other reasons.
- `rankActions()`'s own coverage is honestly partial (2 of 9 action
  kinds) — a future work order extending it to `EXPEDITE_PO` or
  `SUBSTITUTE_SKU` needs a real data source for that kind first (an
  alternate-supplier mapping, a substitute-SKU table), not a heuristic
  bolted onto the existing function.
- `assertNoOriginatedFigures()`'s word-boundary matching means a
  narration is free to name a location or variant id in prose without
  being wrongly refused — verified by spec against the exact failure mode
  a naive digit-anywhere check would have hit.
- `docs/implementation/resilience-scalability/144-supply-chain-resilience-planning-engine.md`
  carries its own Status blockquote naming every real file and all three
  deviations above, the same discipline this session applies to every
  other document's own build.
- 9 new spec files cover the document's own Acceptance criteria directly:
  `propagate()`'s determinism, `rankActions()`'s "never a candidate with
  no real edge," the citation-stripping refusal, `buildDependencyGraph()`'s
  omission of edge types when the underlying rows are absent, and
  `assignFulfillingBranch()`'s own call-path proof against
  `InventoryService.move()`.
- `pnpm index` must be regenerated (new module, new routes, new
  permission, new screen) and `docs/implementation/README.md`'s own entry
  updated to state exactly what shipped.

### Status
**Accepted.**

## ADR-067 — Docs 31/66/67/76 (`pos-hardware/` category): the till hardware layer as extension points, ad-hoc modifiers over a hardcoded list, and a corrected permission claim

### Context

The `docs/implementation/pos-hardware/` category holds four documents built
as one unit of work, following on from doc 144: doc 31 (sector POS profiles
and hardware integration — the substantial build), doc 66 (multi-form-factor
POS, a design-law coverage note), doc 67 (secure cash-drawer triggering, a
coverage note dependent on doc 31), and doc 76 (a POS-side dashboard screen).
Doc 31's own text left several points genuinely ambiguous or, in one place,
plainly wrong, and doc 66/67 could not be honestly confirmed until doc 31
actually existed to confirm against.

### Options Considered

1. **Build a concrete WebUSB/serial receipt-printer and cash-drawer driver
   alongside the extension points.** Rejected — doc 31's own WO-31.1 asks
   only for the interfaces ("extension points", not concrete drivers), this
   sandbox environment has no physical hardware to honestly test a real
   driver against, and a fake/mock WebUSB implementation would be
   speculative functionality with no way to verify it — the same
   `AiProvider`-style "absent collaborator" pattern this repository already
   uses for every other optional integration.
2. **Invent a `ProductModifierOption` catalogue table so a modifier could be
   picked from a list instead of typed ad hoc.** Rejected — doc 31 names
   `PosLineModifier` as a per-sale record explicitly, never a catalogue, and
   a catalogue is a materially larger, separately-scoped capability (product
   setup screens, a new permission, seed data) that the document never asks
   for. A hardcoded, in-code list of modifier options would also violate
   Law 1 directly. Ad-hoc entry (label + price delta, typed by the cashier)
   is the only non-speculative, non-hardcoded choice available today.
3. **Take WO-31.6's claim that `pos.terminal.configure` "already extends the
   existing `pos.*` family, no new top-level key needed" at face value and
   add no permission catalogue entry.** Rejected — grepping
   `packages/shared/src/permissions.ts` confirmed the specific key never
   existed; only the `pos.*` *namespace* did. Silently treating the doc's
   claim as already-satisfied would have shipped WO-31.6 as scaffolding with
   no real catalogue entry, exactly the `seedPermissions()`-vs-`seedRoles()`
   trap CLAUDE.md itself names as already tracked and not to be repeated.
4. **Build a separate terminal-level admin screen gating order-type/driver
   configuration behind `pos.terminal.configure`.** Rejected for now,
   after re-reading doc 31's own "Authority and blast radius" lens a second
   time as its own text instructs: "the worst value is a terminal left in
   `TABLE` mode at a counter-only branch, which only changes which button
   the cashier sees, not what the sale posts" describes a per-sale UI
   choice, not a fixed device setting a manager configures once. Building a
   dedicated config screen the document's own WO-31.4/31.5/31.6 never ask
   for would be scope creep beyond what "ships whole" requires; the
   permission is seeded through for when that screen is actually scoped.
5. **Build the whole capability as scoped above: extension points only for
   hardware, park/retrieve, ad-hoc modifiers, a real permission correction,
   a per-sale order-type toggle, and confirm docs 66/67/76 against the real
   result.** Chosen.

### Decision

**Doc 31.** `packages/pos-core/src/hardware.ts` adds `BarcodeScanner`/
`ReceiptPrinter`/`CashDrawer` as interfaces only; `apps/pos/src/lib/
hardware.ts` is the browser-side registry, every function a safe no-op with
nothing registered. `pos.prisma` gains `PosLineModifier`,
`QuantitySource`/`PosLineQuantitySource`, `PosOrderType`/`PosParkedSale`
(migration `20260927080000_wo31_pos_hardware_park_retrieve`), additive only.
`PosParkedSalesService` parks (refusing `COUNTER`) and retrieves
idempotently via a conditional `updateMany` (House Rule 10's own
predicate-on-write pattern), gated by the existing `pos.operate` — parking
a sale changes no authority boundary, so it needs no new permission.
`PosCatalogService.listSellableRecipes()` reads `bom.prisma`'s `BomRecipe`
directly, matching this module's own existing "direct read, no
cross-module import" precedent — no `BomModule` export, no new
`KNOWN_MODULE_COUPLINGS` entry. `basket.ts`'s `addLine`/`setQuantity`/
`removeLine` gain a trailing optional `lineRef` parameter — omitted, every
existing call site behaves exactly as before (proven by the pre-existing
spec cases passing unchanged); supplied, it scopes the operation to one
specific line so a modifier or scale/recipe line never silently merges with
another. A modifier's `priceDeltaMinor` folds into `OrderItem.unitPrice` in
`OrdersService.placeFromPos()` — zero schema change to `orders`.
`pos.terminal.configure` is added for real to `PERMISSION_CATALOG` (Sales,
medium), the `sales` `PERMISSION_GROUPS` entry, and `ROLE_PERMISSION_SEED
.ADMIN` only (matching `pos.manage`'s own placement) — WO-31.6's own text
is corrected in doc 31's status blockquote rather than left standing.
Order type ships as a per-sale toggle on the till screen, not a
`pos.terminal.configure`-gated config screen. Modifiers are entered ad hoc
at the till (label + price delta); no `ProductModifierOption` catalogue is
built.

**Doc 66.** `check-overflow.mjs`'s `routeInventory()` walks `apps/pos/src/
app` on the filesystem directly (`scripts/check-links.mjs`), so every
`apps/pos` route is already swept, and `WIDTHS` already carries Law 4's
seven — confirmed by reading the checker's own source, then proven by
running it for real (api+web+pos booted against a live Postgres, 141
routes × 7 widths). That run found one genuine `apps/pos` violation — the
new till order-type/recipe row overflowing 13px at `xs` (280px) — fixed
with `flex-wrap`; a second run confirmed zero `apps/pos` violations remain.
The same run surfaced 22 pre-existing `apps/web` admin-route violations,
named in doc 66's own status blockquote and left untouched — out of this
category's own scope.

**Doc 67.** Re-verified against the actual doc-31 build rather than taken
on faith: `kickCashDrawer()` is called from exactly one place
(`till/page.tsx`'s `completeSale()`), only when `cashWasTendered` is true,
never for a queued offline sale. This till has no card/wallet tender path
at all (`pos-core/src/tender.ts`'s own header), so "never on a card
tender" holds structurally rather than by a conditional that could be
flipped.

**Doc 76.** `PosDashboardService.summary(locationId)` delegates to the
same facts `AnalyticsService.summary()` already computes (`Order`,
`Contact`, `VariantLocationStock`/`ProductVariant`), scoped to one
terminal's own `locationId` for sales and low stock. `totalCustomers` is a
plain, unscoped `Contact.count()` — `Contact` carries no `locationId`
anywhere in this schema, and at chain scale a branch's own node/database
(RETAIL-ERP.md R7) already makes that count branch-scoped by construction.
A new `pos.dashboard.view` permission (Sales, low, seeded to `STAFF` and
`ADMIN`) gates a sixth `apps/pos` route, `/dashboard`, reachable from the
till's own header.

### Reasoning

The four documents in this category share one theme: each names a gap
against this repository's own existing code, and each gap has an honest,
non-speculative answer only once the surrounding code is actually read —
`pos.terminal.configure`'s absence, the "no card tender exists" fact that
makes doc 67's claim trivially true rather than merely asserted, and
`check-overflow.mjs`'s filesystem-walked route discovery all had to be
verified, not assumed, before any of the four documents could honestly
claim "built" or "confirmed". Building concrete hardware drivers or a
modifier catalogue neither doc 31 nor any other document in this
repository asks for would have been exactly the "speculative functionality"
CLAUDE.md's own engineering protocol forbids — the extension-point
interfaces are what makes a later, real driver a new file, not a rewrite,
which is the same "flexibility first" reasoning the module-pack system
itself already applies.

### Consequences

- A deployment can plug in a real WebUSB/serial `ReceiptPrinter`/
  `CashDrawer`/`BarcodeScanner` later by registering one against
  `apps/pos/src/lib/hardware.ts`'s existing functions — no call site
  changes, since every one already checks for absence.
- `pos.terminal.configure` exists in the catalogue and is seeded to ADMIN,
  but gates no route yet — a future terminal-configuration screen is real,
  scoped, separate work, not fabricated here to make the permission "used".
- A second node/branch's `Contact` table naturally scopes doc 76's
  `totalCustomers` tile without any code change, by the node-per-branch
  model RETAIL-ERP.md already establishes — but a Solo-to-Chain
  transition should re-examine this the day `Contact` itself gains a
  `locationId` or cross-branch sharing, since the current correctness
  depends on the node boundary, not an explicit filter.
- The 22 pre-existing `apps/web` overflow findings this session's own
  `check:overflow` run surfaced remain open — named in doc 66's status
  blockquote so they are not lost, not silently fixed as scope creep under
  a pos-hardware document.
- All four documents' own status blockquotes and `docs/implementation/
  README.md`'s four rows state exactly what shipped, per this session's
  own standing documentation discipline.

### Status
**Accepted.**

## ADR-068 — Doc 37 (scalability future upgrades): the versioning policy ships inert, `FeatureFlag` gains two fields its own sketch omitted, and the rollout threshold reuses the settlements/bank-facilities maker-checker shape rather than inventing a third

### Context

Doc 37 answers a software-lifecycle question none of `MULTI-SECTOR.md`,
`ENTERPRISE-SCALE.md` or `RETAIL-ERP.md` cover: how an already-running
system accepts a code change without breaking an old client or forcing an
all-or-nothing rollout. Three sub-capabilities: a version/deprecation policy
on top of the URI versioning `main.ts` already wires but has never used; a
`FeatureFlag` primitive for staged rollout; and `SDK-CONTRACT.md`, a
published contract for a pack built outside this repository. Two of the
document's own §1 bullets name `ApiClientRequestLog` (doc 34's `ApiClient`),
which does not exist in this codebase — doc 34's own README row and
ADR-037 already record that an organisation-level service account is
deliberately deferred in favor of doc 163's personal API keys.

### Options Considered

1. **Build `ApiClient`/`ApiClientRequestLog` here to unblock the `apiVersion`
   column and the "who still calls v1" report doc 37's §1 names.** Rejected
   outright — ADR-037 is a settled decision with no new evidence offered
   here to reopen it; `CLAUDE.md`'s "Preserve existing systems" rule forbids
   rebuilding a deferred capability as a side effect of an unrelated work
   order. The two pieces are named as explicitly blocked in doc 37's own
   status blockquote instead of faked against a table that does not exist.
2. **Exercise the `Deprecation`/`Sunset` header mechanism against a
   fabricated v2 route just to prove it works live.** Rejected — nothing
   has ever needed a v2, and inventing one would be exactly the
   speculative-functionality doc 38's own `CircuitBreaker` precedent avoids
   by shipping inert and unit-tested directly against the policy service.
3. **`FeatureFlag`'s threshold ("needs a second approver" on a money/
   stock-path flag) as a single extra permission check with no distinct-
   actor enforcement**, on the reasoning that no shared "maker-checker
   primitive" exists in this codebase to reuse. Investigated first,
   rejected on the evidence: `SettlementsService.approveWriteoff()`
   (`writeoffRequestedById`/`writeoffApprovedById`, refusing the same actor)
   and `BankFacilityDrawdown` (`createdById`/`approvedById`,
   `finance.facilities.approve_drawdown` seeded onto ADMIN) are both real,
   built instances of exactly this shape in this codebase already. A single
   permission check with no distinct-actor refusal would let a lone ADMIN
   holding both keys self-approve, defeating "a second approver" entirely
   the moment both permissions are seeded onto the one role every
   deployment starts with.
4. **Add `moneyOrStockPath`/`removalCriteria` to `FeatureFlag` beyond doc
   37's own Prisma sketch**, needed because the sketch names WO-37.3's own
   audit ("every flag with no stated removal criteria") and the "threshold
   nobody approves alone" lens ("if the flag gates a money- or
   stock-writing path") but gives neither a column to check against.
   Considered speculative at first read, then judged a necessary completion
   of what the document itself already asks for — the identical judgment
   call this session's own prior ADRs (e.g. ADR-063's mirrored shape) make
   routinely for an incomplete sketch.
5. **Reuse the settlements/bank-facilities maker-checker shape for
   `FeatureFlag`'s own threshold, held as pending fields on the flag itself
   (never a separate request table) given a flag has at most one risky
   change proposed at a time.** Chosen, alongside 2 and 4 above.

### Decision

**1, 2, 4, 5** — see this session's changes and doc 37's own status
blockquote for the full list. In one line: `core/versioning/`
(`ApiVersionPolicyService`, `DeprecationHeaderInterceptor`) implements the
header mechanism inert; `core/feature-flags/feature-flags.service.ts`
implements `isEnabled()` with the stated precedence, a 30s cache, and a
fail-closed default; `FeatureFlagsAdminService.proposeRollout()`/
`.approveRollout()` mirror `SettlementsService`'s own maker-checker exactly,
refusing the same actor; `platform.flags.manage`/`platform.flags
.approve_rollout` are both seeded onto ADMIN, the identical shape
`finance.settlement.approve_writeoff`/`finance.facilities
.approve_drawdown` already take, relying on the distinct-actor check rather
than withholding the permission (doc 37's own scope-lens marks "the toxic
pair" n/a for this document, ruling out the `org.access.grant`-style
withhold-from-ADMIN shape instead); `SDK-CONTRACT.md` and
`example-hello-world-pack` (registered under a new, non-`core` `'example'`
`PackName`) are built as doc 37 §3/WO-37.4 ask. The `apiVersion` column and
the v1-usage report stay unbuilt, named in doc 37's own status blockquote.

### Reasoning

- **Evidence over the task's own tentative suggestion.** The initial plan
  assumed no reusable dual-approval shape existed in this codebase; a
  direct search found two (settlements, bank facilities) already built and
  in production use for exactly this kind of threshold. Following the
  evidence rather than the untested assumption is what "if one exists,
  reuse it instead of inventing a second one" actually asks for.
- **Fails closed, not merely gated.** A flag lookup failure, and a flag row
  that does not exist, both resolve to `false` — the same "never silently
  fails open by accident for a money-adjacent flag" rule doc 37's own
  "failure path" lens states, and the same posture `SettingsService`
  already takes for configuration reads generally.
- **The cache's own honesty.** A 30s TTL is stated as a real trade-off
  (an ordinary rollout edit takes up to 30s to reach every process), not
  hidden — `killSwitch=true` additionally invalidates its own process's
  cache entry synchronously, so the process that flips it during an
  incident sees the effect immediately, while every other process still
  catches up within the stated window.
- **A demonstration pack proves the seam, not a fixed test.** Registering
  `example-hello-world-pack` under a genuine new `PackName` (`'example'`,
  never `'core'`) means `check-module-boundaries.mjs`'s DIRECTION rule
  actually constrains it the same way it would a real third-party sector
  pack — a pack registered under `'core'` would not have been a real test
  of the boundary doc 37 §3 asks to prove.

### Consequences

- The `apiVersion` column and the "who still calls v1" report remain a
  real, named gap until doc 34 ships — tracked in doc 37's status
  blockquote and this ADR, not silently dropped.
- A deployment with only one ADMIN account cannot complete a 100%-rollout
  or kill-switch-clear transition on a money/stock-path flag at all (the
  distinct-actor refusal has no second person to approve) — the same
  honest limitation settlements/bank-facilities already carry for their own
  thresholds, not a new one this document introduces.
- `docs/.env*.example`'s `# Available:` lines and `module-packs.ts`'s
  `PackName` union both now carry `example-hello-world-pack`/`'example'`
  permanently, as a standing, lint-checked proof rather than a one-time
  manual confirmation.
- Doc 37's own status blockquote and `docs/implementation/README.md`'s row
  state exactly what shipped and what is still blocked, per this session's
  own standing documentation discipline.

### Status
**Accepted.**

## ADR-069 — Docs 32/71/158 (`lots-serials-traceability/`): the `move()` call-site scoping boundary, a doc-158 internal contradiction corrected in `SerializedUnit.stockMovementId`'s own favour, per-unit receiving proved cost-equivalent to batch receiving, and serialized sale deliberately left out of ordinary checkout

### Context

The `docs/implementation/lots-serials-traceability/` category holds three
documents built as one unit of work: doc 32 (batch/lot identity, FEFO
allocation, expiry alerting), doc 71 (connecting doc 32's lots to `bom`'s
production runs — batch genealogy), and doc 158 (one-row-per-physical-unit
serial tracking, IMEI-style). All three share one root fact: `Lot`/
`SerializedUnit` are sub-ledgers UNDER the existing `VariantLocationStock`
row, never a second stock model — `InventoryService.move()` stays the only
writer of stock itself, exactly as it already is for every other caller.
That single fact still left four genuine decisions doc 32/71/158's own text
did not settle on its own.

### Options Considered

1. **Wire lot/serial awareness into `InventoryService.move()`'s own
   signature**, so every one of its ~16 existing call sites gained the
   capability at once. Rejected — `move()` is deliberately generic (a
   variant, a location, a delta); teaching it about `Lot`/`SerializedUnit`
   would make the ledger primitive know about two optional sub-ledgers it
   has no reason to know about, and every one of the ~16 call sites would
   need to decide what to pass whether or not it is lot/serial-relevant.
   The one-writer-per-invariant rule this codebase already applies to
   `move()` itself extends naturally to `LotsService`/
   `SerializedUnitsService` as the ONLY writers of their OWN sub-ledgers,
   called alongside `move()` — never inside it.
2. **Wire that alongside-call into every one of `move()`'s ~16 call
   sites**, so a manual adjustment, a transfer, or a bundle-component
   deduction would also draw down a lot or retire a serial. Rejected as
   more than doc 32/71/158 actually ask for: the three documents' own
   worked examples are purchasing receipt, an order's sale deduction, and
   BOM production consumption/output — the transaction types a lot or
   serial genuinely changes hands on. Wiring a manual stock-count
   adjustment or an inter-branch transfer into lot/serial bookkeeping is a
   real, separately-scoped capability (which lot moved with a transfer? is
   an adjustment ever lot-specific?) that neither document poses or
   answers, and building it here would be exactly the speculative
   functionality CLAUDE.md's own protocol forbids.
3. **Wire `SerializedUnitsService.sellUnit()` directly into
   `orders.service.ts`'s own checkout deduction loop**, so an ordinary sale
   of a serial-tracked variant would auto-select a unit the way an
   ordinary lot-tracked sale auto-allocates via FEFO. Rejected — unlike a
   lot (fungible units, FEFO makes the choice), a serialized unit is NOT
   fungible: automatically picking "the next `IN_STOCK` unit" the moment an
   order places would frequently pick the wrong physical unit relative to
   what a courier or in-store handoff actually hands the customer, with no
   way to correct it short of a manual return-then-resell. Checkout's own
   sale path is therefore left alone; a staff member reconciles the
   specific serial against the order afterward via the manual
   sell/return/write-off screen doc 158 itself scopes as its own
   capability.
4. **Trust doc 158's own prose that `SerializedUnit.stockMovementId` should
   be `@unique`.** Rejected after finding the document's own §2 code sketch
   contradicts its prose: the sketch shares ONE `StockMovement` across N
   serials received on the same line, which a unique constraint on that
   column would reject outright the first time two serials share a
   receiving movement. The prose is the error; the sketch is correct. This
   repository's own precedent (this whole task's prior sessions) is to
   trust a document's worked code over its own summary claim when the two
   conflict — the code sketch is treated as the more authoritative source
   of truth about what the writer actually intended.
5. **Follow doc 158's sketch literally and create exactly one
   `StockMovement` per receiving line, with delta = the full line
   quantity, then fan the N serials out against that one movement.**
   Rejected in favour of one `StockMovement` per physical unit (delta 1
   each, N movements for N serials) — proved cost-equivalent below — because
   a single-movement-per-line design leaves no natural per-unit audit row:
   `StockMovement` is this codebase's own ledger of physical events, and "20
   units of one IMEI-tracked phone arrived in one receiving event" is
   itself 20 physical arrivals, not one. `SerializedUnit.stockMovementId`
   stays a plain, non-unique foreign key precisely so a genuinely shared
   receiving movement (a bulk delivery note, for instance) remains
   representable without contradiction, but the actual receiving path this
   codebase's own `PurchasingService.receiveGoods()` takes is N individual
   `move()` calls.
6. **Build the whole capability as scoped above** — `LotsService`/
   `SerializedUnitsService` as the only writers of their own sub-ledgers,
   wired alongside `move()` at exactly the purchasing/orders/production
   call sites the documents' own worked examples name; the
   `stockMovementId` contradiction resolved in the code sketch's favour;
   per-unit receiving with the cost-equivalence proof below; and
   serialized sale left out of ordinary checkout, stated here rather than
   silently assumed. **Chosen.**

### Decision

**Doc 32.** `Lot`/`LotStock`/`LotAllocation` (inventory.prisma) are
additive, cascading from `ProductVariant`/`Location`/`StockMovement`.
`LotsService.recordReceipt()`/`recordDeduction()` are the only writers,
called from `PurchasingService.receiveGoods()` (receipt) and
`OrdersService`'s sale-deduction loop (deduction) inside the SAME
transaction as the `move()` call each already makes — never a second
write path. `lot-allocation.ts`'s `allocateFefo()` is a pure function
(sorts eligible lots by `expiresOn` ascending, nulls last) with an
optional `preferredLotId` manual override drawing from that lot first.
`LotsService.recallLookup()` joins `LotAllocation -> StockMovement ->
Order` via `StockMovement`'s own bare `refType`/`refId` scalars (no Prisma
relation across the inventory/orders module boundary — the identical
decoupling `InventoryService.getChainStatus()` already uses), gated by the
narrower `inventory.recall` rather than `inventory.lots.manage`.
`InventoryCron.alertExpiringLots()` reads `LotsService
.expiringLotsWithStock()` and sends ONE consolidated digest — never a ping
per expiring lot — to every `inventory.manage` holder, resolved through a
new `PermissionsResolverService.usersWithPermission()` batch query (the
inverse of the resolver's own existing per-user `resolveForUser()`) rather
than a fixed address, the exact anti-pattern CLAUDE.md itself names
(`inventory.listener.ts`'s `store.supportEmail`). A zero-holder deployment
gets a structured `Logger.error()` — the escalation this codebase's
tooling can actually perform today, since no APM/pager is wired.

**Doc 71.** `BomProductionLineLot` (bom.prisma) connects one production
line's consumption to the specific input lot(s) `LotsService
.recordDeduction()` drew from, inside `ProductionService.create()`'s own
existing transaction; `BomProductionRun.outputLotId` is set the same way
via `LotsService.recordReceipt()` for a lot-tracked output variant.
`ProductionService.traceOutputLot()`/`traceInputLotForward()` are read-only
graph walks over rows already written at production time — never
recomputed or inferred — answering both directions of a recall
symmetrically, exposed as `GET /admin/bom/lots/:lotId/trace-output` and
`.../trace-forward`.

**Doc 158.** `SerializedUnit` (inventory.prisma) is a one-row-per-unit
sub-ledger; `SerializedUnitsService.receiveUnits()` is the only writer at
receipt time, called from `PurchasingService.receiveGoods()` as N
individual `move()` calls (delta 1 each) rather than one `moveMany()` call
for the whole line, for the reason in Option 5 above and the cost-math
proof below. `sellUnit()`/`returnUnit()`/`writeOff()` are manual staff
actions reached from `/admin/inventory/serials/:serialNumber`, deliberately
NOT wired into `orders.service.ts`'s own checkout deduction loop (Option 3
above). `returnUnit()` refuses unless `status === 'SOLD'` AND `orderId`
matches the order named exactly — the same toxic-pair self-dealing guard
`StockVariance.resolve()` already established. `getUnitHistory()` returns
exactly `{ serialNumber, status, soldOn, orderId, orderNumber,
warrantyEndsOn }` for both the staff-side history route and the public
`GET /public/serials/:serialNumber` warranty-verify lookup — never a
branch or an employee — reachable from the storefront footer's "Verify
your purchase" link.

**Cost-equivalence proof (Option 5).** `weightedAverageCost(stockBefore,
oldCost, quantity, newUnitCost)` is linear in `quantity`: applying it once
with `quantity = N` computes `(stockBefore·oldCost + N·newUnitCost) /
(stockBefore + N)`. Applying it N times with `quantity = 1` each, folding
the running stock/cost forward after each step, telescopes to the
identical numerator and denominator — each step adds exactly one
`newUnitCost` to the running total and one unit to the running stock, so N
steps of 1 sum to the same N·newUnitCost and N as one step of N. Receiving
N serialized units as N separate `move()` calls therefore produces the
IDENTICAL `costPrice` result a single batched receipt would, with no
per-unit-precision cost machinery needed beyond what already exists.

**lotTracked/tracksSerials/warrantyMonths.** New `ProductVariant` boolean/
integer fields (catalog.prisma), editable from the raw-material edit form
and the product-variant editor's own "Barcode, cost & reorder" advanced
section — the same discoverable-but-not-in-the-way placement
`reorderPoint`/`reorderQuantity` already use, per Law 2 ("hide complexity
in depth").

### Reasoning

Every one of the four decisions above follows the same rule already
binding elsewhere in this codebase: a sub-ledger's own writer stays the
only writer of that sub-ledger, called alongside the existing stock
primitive rather than folded into it. Scoping which of `move()`'s call
sites gain lot/serial awareness to exactly the three the documents'
own worked examples name — rather than either the smallest one call site
or literally all sixteen — is the same "build the whole capability, not a
narrower or a wider slice" balance CLAUDE.md's own feature-scope section
asks for: doc 32/71/158 each name purchasing receipt, order sale, and (for
lots) BOM production explicitly; none of them name a manual adjustment or
a transfer, so building those would be scope invented, not scope shipped.
Leaving serialized sale out of ordinary checkout is the same honesty this
whole task's prior sessions already established for boundaries a document
doesn't fully resolve: a wrong-but-automatic behavior (mis-selecting which
physical IMEI a sale consumed) is worse than a manual step named plainly
as a limitation, exactly the standard `10-admin-dashboard.md`'s own
"Request or record" lens sets for any write that cannot be safely
automated yet.

### Consequences

- A manual stock-count adjustment, an inter-branch transfer, and a bundle
  component's own deduction do NOT draw down a lot or retire a serial
  today — a lot-tracked or serial-tracked variant moved through any of
  those three paths behaves exactly as an untracked one does. This is a
  real, named gap: the day this sector needs adjustment- or
  transfer-level lot/serial awareness, it is new, separately-scoped work
  against `LotsService`/`SerializedUnitsService`'s own existing methods,
  not a rewrite of them.
- Checkout's own sale path never automatically marks a `SerializedUnit`
  `SOLD` — a serial-tracked variant's stock count still decrements
  correctly through the ordinary `move()` call, but the specific unit sold
  is reconciled by a staff member afterward via the manual
  sell/return/write-off screen. A future point-of-sale or storefront
  redesign that needs this automated (e.g., choosing a specific IMEI at
  checkout) is real, scoped, separate work, not fabricated here.
- `PermissionsResolverService.usersWithPermission()` is now a reusable
  primitive for any future "notify whoever holds permission X" need —
  deliberately omitting `OrgUnitGrant`-derived access, matching
  `resolveForUser()`'s own doc comment that no deployment today has any
  such grant; a caller needing that reach too composes `resolveForUser()`
  per candidate instead.
- `inventory.lots.override`'s own catalogue entry (medium sensitivity) is
  seeded to ADMIN but gates no dedicated override endpoint yet —
  `LotsService.previewAllocation()`'s own `preferredLotId` parameter is
  the only manual-override surface built; a standalone override screen or
  route is real, separately-scoped future work, not fabricated here to
  make the permission "used".
- All three documents' own status blockquotes and `docs/implementation/
  README.md`'s three rows state exactly what shipped, per this session's
  own standing documentation discipline.

### Status
**Accepted.**

## ADR-070 — Doc 38 (resilience engineering): a table-driven contract test over the real source tree instead of 69 hand-written files, `RequestOutcome` instead of forcing SLO data through the business-metrics registry, and a genuine `/admin/resilience` naming collision resolved by renaming the newer screen

### Context

Doc 38 asks for six work orders: the degradation matrix proven by test
(WO-38.1), a `CircuitBreaker` wrapping `AiProvider`/`PaymentProvider`/
`OutboundConnector`/`VectorStore` (WO-38.2), SLO/error-budget
instrumentation on three named critical paths (WO-38.3), real DR numbers
(WO-38.4), a domain-event contract test suite (WO-38.5), and three new
`platform.resilience.*` permissions (WO-38.6). Several of its own asks are
underspecified on purpose (doc 38 explicitly invites judgment on the
contract-test suite's shape) or run into a fact this document could not
have known at the time it was written: `OutboundConnector` does not exist,
`core/metrics`'s existing extension point was built for a different shape
of data, and a completely unrelated document (144) had already claimed the
`/admin/resilience` route for a different feature.

### Options Considered

1. **One hand-written contract test per domain event (69 files).** Doc 38
   §5 literally suggests this shape, then explicitly says to use judgment.
   Rejected: every event's assertion is structurally identical (a
   subscriber's assumed fields must be a subset of the real payload's
   fields), so 69 files would be 69 copies of one check, not a new
   contract per event — a maintenance cost the same discipline
   `check-module-boundaries.mjs` already rejects for cross-module checks.
2. **A single, table-driven static analyzer** (`contract-analyzer.ts`) that
   parses the real `domain-events.ts` and every `@OnDomainEvent` handler in
   the real source tree, character-scanning rather than using the
   TypeScript compiler API. Chosen. The existing `check-*.mjs` scripts are
   all line/character-based scanners by established convention
   (`CLAUDE.md`: "the scanners are line-based, not a type checker"); this
   codebase's payload interfaces are uniformly flat (confirmed by reading
   every one in `domain-events.ts`), making a character scanner tractable
   and lower-risk than standing up the TypeScript compiler API for one
   test suite. A naive line-based version was tried first and produced
   false positives from stray braces inside comments and lost real
   `payload.x` accesses written inside template-literal interpolations
   (`posting-rules.subscriber.ts`'s own `` `${payload.billId}:${payload
   .paidAt}` `` sourceRef) — both fixed by masking comments/plain strings
   to blanks while keeping a template literal's own `${...}` code live,
   proven against the real tree (0 violations, 71 real handlers checked)
   and proven to actually catch a break (`PasswordChangedPayload.userId`
   was temporarily renamed, the suite failed naming the exact broken
   subscriber, then the rename was reverted — see doc 38's own status
   blockquote).
3. **Force SLO/error-budget data through `core/metrics`'s existing
   `MetricProvider` extension point**, since it already exists and this
   session built it. Rejected on inspection: `MetricContext`/`MetricValue`
   are shaped around a permission-gated, previous-period-compared
   *business* number computed on demand for a dashboard card — there is no
   way to express "record this one request's outcome, right now,
   non-blocking" through it, and forcing that shape through an interface
   built for something else would be exactly the wrong-abstraction
   `CLAUDE.md`'s "before creating a new abstraction" question warns
   against answering by reflex. A new, minimal `RequestOutcome` table plus
   `SloRecorderService` was built instead, purpose-built for a
   fire-and-forget outcome/latency record with a trailing-window
   aggregate query.
4. **Wrap every extension point doc 38's matrix cites**
   (`StorageDriver`, `SmsProvider`, `WhatsAppProvider`) in a circuit
   breaker too, since the matrix mentions them.** Rejected: doc 38's own
   §2 names exactly four — `AiProvider`, `PaymentProvider`,
   `OutboundConnector`, `VectorStore` — and expanding that list silently
   would be scope creep past what the document itself asked for.
   `NotificationsService`'s existing `Promise.all`-per-channel fan-out
   already isolates one channel's failure from another with no shared
   state to trip a breaker against; `StorageDriver` has no retry path for
   a breaker to protect (see the found gap below). Both are named,
   reasoned exclusions in doc 38's own status blockquote, not silent
   omissions.
5. **Route `/admin/resilience` on the web app for doc 38's new dashboard**,
   the literal name the work order's own brief suggested. Investigated
   first: `apps/web/src/constants/routes.ts` and `nav-registry.ts` already
   held a `resilience` key at that exact path for
   `144-supply-chain-resilience-planning-engine.md`'s own "Resilience
   Planning" screen — a real collision (confirmed live: a first attempt at
   this route silently overwrote doc 144's page, caught by `git status`
   showing the file as modified rather than new, and reverted with `git
   checkout` before being rebuilt at a new path). Doc 144's screen shipped
   first and keeps the shorter name; doc 38's screen is named "Platform
   Resilience" at `/admin/platform-resilience` instead — a naming
   collision resolved by renaming the newer, unshipped screen, never by
   overwriting the existing one.
6. **A dry-run `CircuitBreaker.simulate()` fed by live historical call
   data**, as doc 38 §2's own "dry run before live" lens asks for. Found
   genuinely unbuildable against real data today: no call-outcome log
   exists for `AiProvider`/`PaymentProvider`/`VectorStore` calls (WO-38.3's
   own `RequestOutcome` table instruments three different, named business
   paths — checkout, POS sale, replication sync — never these four
   extension points). Chosen instead: `simulate()` is a real, pure,
   unit-tested replay function taking a caller-supplied history, ready to
   wire to a live log the day one exists, honestly unable to answer
   "would this have tripped last month" until then — named explicitly
   rather than faked against data that does not exist.

### Decision

**2, 3, 4, 5, 6** — see this session's changes and doc 38's own status
blockquote for the full account of what shipped, what was found missing,
and what was deliberately left out.

- **A parser proven against the real tree, not just a happy-path fixture.**
  `event-contracts.spec.ts` runs `contract-analyzer.ts` against every real
  `@OnDomainEvent` handler in `apps/api/src`, not a curated sample — the
  same "the scanner is checked against the actual codebase, not a mock of
  it" discipline `check-module-boundaries.mjs`'s own self-test already
  establishes for module boundaries.
- **A found gap is reported, not silently fixed or silently ignored.**
  `StorageDriver`'s "queue for retry" claim in doc 38's own §1 table does
  not match `storage.service.ts`'s real behavior — surfaced in the status
  blockquote and via a new test proving the actual current behavior,
  rather than either fabricating a passing test for code that does not
  exist or quietly building a retry queue as an unscoped side effect.
- **A route collision is caught and fixed before merge, not shipped.** The
  `/admin/resilience` overwrite was caught by reading `git status` after
  the first write, reverted, and the new screen was given a distinct name
  — exactly the "review the complete diff" discipline `CLAUDE.md`'s Git
  discipline section asks for, applied to a collision a plan alone would
  not have surfaced.

### Consequences

- `OutboundConnector`'s circuit-breaker wrap remains unbuilt until doc 36
  ships — tracked in doc 38's own status blockquote, the identical shape
  ADR-068 already records for doc 37's own `ApiClient` gap.
- The deploy-freeze on a breached error budget is a computed boolean and a
  dashboard banner, not an enforced CI/CD gate — a future CI workflow can
  read `GET /admin/resilience/slo`'s `overBudget` field, but none does
  today, named honestly rather than claimed.
- RTO stays unmeasured, and the real number will not exist until the first
  quarterly game-day actually runs against a live Docker Swarm stack —
  `DEPLOYMENT.md` §9 states this as pending, not as a placeholder to
  forget.
- A second, unrelated document now shares the word "resilience" with two
  different admin screens at two different routes
  (`/admin/resilience` for doc 144, `/admin/platform-resilience` for doc
  38) — a naming seam future readers should know about, recorded here
  rather than left to be rediscovered as a surprise.
## ADR-071 — Docs 168–183 (a composable, resilience-first SME platform for du): built inside erp-1 as new core-classified modules over the shipped planning engine (doc 144) and hosting control plane (doc 39), not a greenfield repository or a fork; zero new module couplings, and the program brief's premises corrected against the code

### Context

NEWAX is proposing to du (a UAE telecom operator) a du-owned, composable ERP/SaaS
product focused on operational resilience, for 50,000+ SMEs: an SME connects its
existing spreadsheets, accounting system and POS; the platform builds a
dependency graph of its business, simulates disruptions (a supplier down, a
lead-time slip, a cash shock), ranks recovery actions, and closes the loop
through du's own payment rails. Docs 168–183
(`docs/implementation/composable-resilience-platform/`) specify it as seven
layers. The question this entry settles is **where it is built**: in a new
repository, inside this one, or in a fork of this one.

The evidence, checked against the code while writing the document set:

- **The resilience engine already exists.** `apps/api/src/modules/planning/` is
  `RETAIL-ERP.md` R20–R26 built (doc 144, ADR-066): `DependencyGraphService.build()`,
  the pure `propagate()` and `rankActions()` with determinism and non-invention
  proven by spec, `NarrationService` with `assertNoOriginatedFigures()`,
  `LiquidityForecastService`, `SupplierResilienceService`, `OnlineStockService`,
  and `/admin/resilience` behind `planning.propagation.view`.
- **The multi-tenant control plane already exists.** `apps/platform` (doc 39 and
  docs 14/50/51/153/154): an isolated database per tenant ("a tenant is a
  node"), provisioning, hostname routing, expiring and audited
  `SupportAccessGrant`s, resource quotas, export and deprovisioning, four pricing
  shapes, invoicing, trials, metering from each tenant's own outbox.
- **The connector architecture is specified to the column** (docs 36, 132, 160,
  162) — and, checked, **unbuilt**: no `connectors.prisma`, no `connectors`
  module.
- **Every country-specific integration sits behind an interface** —
  `PaymentProvider`, `FinancialInstitutionConnector`, `IdentityVerificationProvider`,
  `AiProvider`, the sketched `FiscalComplianceProvider` — and module independence
  is enforced by `scripts/check-module-boundaries.mjs` on every `pnpm lint`.

### Options Considered

1. **A separate greenfield repository for the du product.** Rejected: it would
   rebuild, before its first new feature, a resilience engine whose
   determinism and non-invention guarantees took nine spec files to prove, a
   control plane with isolation, support access, export and billing, a PBAC
   catalogue with seeded roles and non-delegatable keys, a transactional outbox,
   a double-entry ledger that posts from events, a settlement reconciler with a
   named `SHORT` variance, and a feature-flag primitive with maker-checker —
   and would re-earn none of the scope-lens analysis 160+ documents already
   carry. It would also sever the international proof that is this program's
   strongest argument: a second market arriving as second implementations of
   existing interfaces.
2. **Inside erp-1, as new modules extending docs 144/39/160/162.** The new work
   is: the ingestion boundary as the inbound half of the `connectors` module docs
   160/162 already specify (`'core'` in `MODULE_PACKS`, `offByDefault`), a
   `CanonicalRecordSinkRegistry` core extension point for writing into owning
   modules, planning extensions (provenance partition, currency-neutral cost,
   revenue at risk, persisted runs and decisions), du-rail implementations of the
   two existing payment/settlement interfaces, and control-plane state for
   per-tenant Build Manifests.
3. **A fork of erp-1 dedicated to du.** Rejected for now: doc 11 already rejects
   per-client branches and forks ("merge hell") in favour of one Blueprint and the
   extractor (`scripts/sync-client.mjs`, doc 12, built), which can produce a
   client-specific repository from `main` without forking development. A fork
   today would split every fix between two codebases for no requirement anyone
   has stated.
4. **Inside erp-1, but as a new sector pack (`PackName 'resilience'`).**
   Considered because the brief spoke of "module packs". Rejected by
   `module-packs.ts`'s own rule — "a pack exists only where a vertical owns
   genuine domain data that core cannot express"; connectivity and resilience are
   cross-sector capabilities, classified `'core'` exactly as `marketplace`,
   `managed-services` and `accounts` already are.

### Decision

**Option 2.** The program is built inside this repository, as core-classified,
off-by-default modules and extensions of shipped modules, in `apps/api` and
`apps/platform`, under this repository's lint, test, index and ADR discipline.
Specifically:

- **No new `KNOWN_MODULE_COUPLINGS` entry.** The brief expected one for the
  ingestion pack to "reach `planning`", mirroring `planning -> inventory`. There
  is no same-transaction write between them, the list's own comment reserves it
  for exactly that, and `RETAIL-ERP.md` Part 4 says the intelligence layer adds
  "zero module couplings". `planning` reads ingested rows by bare Prisma read, as
  it reads every other module's rows; the connectors module writes into owning
  modules through `CanonicalRecordSinkRegistry`, the `StockIntakeRegistry`
  precedent (doc 172 §8–§9).
- **No `tenantId` column.** The tenant boundary is the database (doc 39;
  ADR-040/044 as restated in `idempotency.prisma`); provenance, confidence and
  freshness live on doc 160's `ExternalRecordLink`, extended (doc 169 §2, §4).

### Reasoning

The decision rests on shipped capability, not on architectural preference:

- The product's differentiator — deterministic, traceable disruption simulation
  with AI that may narrate but never compute — is `planning`, already built and
  proven. Its missing half is data from systems the SME already runs, and the
  design for that half (docs 160/162) is already written, reviewed through its
  own scope lenses, in this repository.
- du's operating model — du owns the platform, each SME is isolated — is doc 39's
  shared-infrastructure/isolated-data control plane, already built, with the
  support-access and export commitments a regulated operator will be asked about.
- The UAE is the proof this architecture was designed for: tax filing, identity,
  payments, settlement and locale each take a UAE implementation behind an
  existing interface (doc 168 §5), with the honest deltas named — two optional
  fields on `IdentityVerificationStart`, fail-closed callback verification, labels
  as translation rows — and none requiring a core edit or a country conditional.
- Building here also surfaced defects a separate repository would have
  inherited unseen: `rupeesSpentMinor` and its currency-literal siblings (eight
  `@default("PKR")` schema defaults; create paths that never set `currency`),
  AP summed across currencies, cash reported as zero when unknown, callbacks
  trusted when a provider omits `verified`, and support grants enforced only in
  the control plane. Each is now a scoped work order.

### Consequences

- **This program is coupled to erp-1's own release, lint and test discipline.**
  Its work orders pass `pnpm lint && pnpm typecheck && pnpm test`, the module
  boundary check, the index freshness check and this ADR log like every other
  change; its pace is bounded by that discipline, deliberately (doc 183's gates).
- **The fork door stays open, unexercised.** If a contract ever requires full
  separation, doc 11's handover model — the extractor producing a du repository
  from `main`, upgraded by pull request — is the path; source escrow (doc 181 §7)
  covers continuity without one.
- **The brief's premises are corrected, not carried** (doc 168 §3):
  `FiscalComplianceProvider` has zero implementations, so the UAE ASP provider
  will be its first; the shipped identity provider calls Newax's own nID
  platform, not NADRA; the connector system is unbuilt, so WO-160.x/162.x are the
  ingestion program's first work orders; doc 38 is unbuilt — no circuit breaker,
  no measured RPO/RTO; the pricing model has four shapes and doc 155's wallet is
  not one and is excluded from du tenants.
- **Preconditions before any UAE tenant exists** (doc 183 gate G0): the currency
  sweep, fail-closed callback verification, and the planning currency and
  honesty fixes.
- **Two decisions are opened, not taken** (WO-168.3): an SME's legal identity on
  its own tax invoice at runtime (touches `ENTERPRISE-SCALE.md` Br1's wording),
  and compute density / scale-to-zero at 50,000 tenants (beside ADR-018, still
  Open). Two more are named for their own entries when their work orders start:
  a payment-clearing account (WO-175.10) and the `CanonicalRecordSinkRegistry`
  extension point itself.
- **Documents of record are not edited by this entry.** `RETAIL-ERP.md` R22's
  heading ("cash preserved per rupee spent") and doc 144's §3 sketch still carry
  the currency word; the first is the owner's to reword, the second is updated by
  the PR that lands WO-173.1.

### Status
**Superseded by ADR-072.**

## ADR-072 — Docs 168–183 revised: NEWAX's own product, not a du-owned platform — du was a quality-bar reference only, never a counterparty; ADR-071's build-here decision carried forward unchanged

### Context

ADR-071 recorded where the composable, resilience-first SME platform of docs
168–183 is built, on a premise its own Context states: "NEWAX is proposing to
du (a UAE telecom operator) a du-owned, composable ERP/SaaS product … and closes
the loop through du's own payment rails." The premise ran through the document
set: du as owner and operator of the control plane (doc 168 §1, "A du-operated
control plane"); du's licensed entities as *the* payment rail and the custody
boundary (doc 175); du's account team recruiting pilot SMEs and du's program
owner as the third cutover signatory (doc 179); du as data processor with NEWAX
as its sub-processor, "du's sovereign cloud" and "du's own contractual security
requirements" (doc 181); a competition submission (doc 178); and a commercial
rationale arguing "why du — and not NEWAX building this alone" against e&'s
marketplace (doc 182).

The owner has since corrected that premise directly: du was only ever a
reference point for the ambition and quality bar. There is no du partnership,
no competition submission, no telecom distribution deal, and nothing du-owned.
The product is NEWAX's own — built and owned by NEWAX, sold to SMEs and
enterprises directly and through NEWAX's existing commercial and hosting model:
doc 11's two-track Blueprint/agency model, doc 39's control plane (whose own
text already says "Newax's own hosting-operations staff"), and the pricing
shapes of docs 50 and 153–155.

This is new evidence — a correction of fact from the owner — not a settled
decision reopened without cause. What changed is not ADR-071's decision (build
inside erp-1) but the counterparty its framing, and six of the sixteen
documents, rested on. Three rulings accompanied the correction and are applied
here rather than re-argued: payments and custody stay conservative (licensed
third-party PSPs through the existing extension point, never NEWAX as money
transmitter, and not doc 155's wallet model); the UAE stays, as NEWAX's own
chosen second market; and the competition and "why du / versus e&" arguments
are removed, not reworded.

### Options Considered

1. **Leave ADR-071 as the historical record and layer a correction on top,
   without touching docs 168–183's own prose.** Rejected: the documents would
   stay self-contradictory, citing a counterparty the record says does not
   exist — a "du rail" as WO-175.3's build target, a `DU_OWNER` role in doc
   179's `SystemOfRecordCutover.signoffs`, du as processor in doc 181 §1. An
   engineer picking up WO-175.3 would build against a rail nobody chose.
2. **Rewrite ADR-071 in place.** Rejected: this file's own rule — "do not edit
   a decided entry to reflect a change of mind — supersede it with a new entry
   and set the old one's status to `Superseded by ADR-NNN`" — and the
   repository's practice of correcting forward (the ADR-062 collision was kept
   as merged and resolved by recording ADR-063 beside it, not by rewriting the
   merged entry) keep a merged decision's text as the record of what was
   believed, and when.
3. **Supersede ADR-071 with this entry and revise the sixteen documents' own
   prose to the corrected premise**, changing only sentences that assume a du
   counterparty and leaving technically du-independent content untouched.
   Chosen.

### Decision

**Option 3.** ADR-071's status is now `Superseded by ADR-072`; its Context,
Options, Decision, Reasoning and Consequences are left verbatim, title
included. Its substantive decision is **carried forward into this entry
unchanged**: the program is built inside this repository as core-classified,
off-by-default modules and extensions of shipped modules in `apps/api` and
`apps/platform`; no new `KNOWN_MODULE_COUPLINGS` entry; no `tenantId` column;
the two decisions WO-168.3 names are still to be opened as their own entries.
What changes is who stands where:

- **Owner and operator:** NEWAX, on its own doc 39 control plane.
- **Payments:** licensed third-party PSPs, integrated per market through the
  existing `PaymentProvider` (`apps/api/src/modules/payments/payment-provider.ts:73`)
  and `FinancialInstitutionConnector`. NEWAX never becomes a money transmitter
  or wallet-holder for this program. du Pay and Network International appear
  only as illustrations of a regional rail the extension point could plug into.
  Doc 155's wallet/stored-value/escrow model is not adopted — a separate, more
  heavily regulated business decision the owner has not made.
- **The UAE:** NEWAX's own chosen second market, hosted in a UAE region on
  NEWAX's own control plane; the regulatory research is kept.
- **Go-to-market:** NEWAX direct, self-serve trial and `/pricing`, and doc 11's
  Agency-Managed track.
- **Two files renamed, numbers kept:**
  `178-10-competition-deliverable-vs-pilot-vertical-slice.md` →
  `178-10-mvp-vertical-slice-vs-full-rollout.md`, and
  `182-14-commercial-partnership-rationale.md` →
  `182-14-why-newax-builds-and-owns-this.md`. Every reference outside the
  generated index (`docs/implementation/README.md`, doc 168 §7) was updated;
  the index was regenerated.

### Reasoning

The sentences changed, and why each had to be:

- **Doc 168 §1.** "offered by du to 50,000+ SMEs as a du-owned product" became
  "offered by NEWAX as its own product to SMEs … sold directly and through
  NEWAX's own Agency-Managed hosting model (doc 11 §5, doc 39)"; "A du-operated
  control plane" became "NEWAX's own control plane"; "du's own licensed entities
  move money; NEWAX never holds funds" became "licensed third-party payment
  service providers, integrated per market through the existing
  `PaymentProvider` extension point, move money. NEWAX is a technology
  platform — never a money transmitter or wallet-holder for this program". §5's
  UAE payment row no longer reads "A du rail (du Pay and/or its acquirer)".
- **Doc 175 §3.** "The du rail — du Pay and/or the acquirer behind it (the
  brief names Network International) — is one class,
  `providers/<du-rail>.provider.ts`, its key fixed by the contract (for example
  `du_pay`)" became one class per PSP, `providers/<psp>.provider.ts`, with the
  first PSP NEWAX's own commercial choice and du Pay/Network International named
  only as illustrations. §4's "If du wants stored value, it is du's own licensed
  product" became a statement that stored value is a separate decision the owner
  has not made, behind doc 155's own legal gate (WO-155.0); §4's revenue row
  "du ↔ NEWAX, du ↔ SME … through du's own billing" became "NEWAX ↔ SME",
  collected through `AgencyStripeChargeCron` (ADR-039). The custody posture is
  unchanged or stricter: every money-moving call still terminates at a licensed
  entity, and `wallet` stays out of every program tenant's manifest.
- **Doc 179.** "du's account team nominates" became NEWAX's own sales and
  onboarding team, fed by `/pricing`, the trial sign-up and Agency-Managed
  engagements; the third cutover signatory "du's program owner" became "NEWAX's
  program owner — never the same person as the implementation lead", and the
  `signoffs` role `DU_OWNER` became `NEWAX_PROGRAM_OWNER`. With both NEWAX
  signatories in one company, the existing distinct-`userId` rule is now what
  keeps the second signature a check on the first — written into §5.2.
- **Doc 181.** §1 had du as processor and NEWAX as sub-processor; NEWAX is now
  the processor under its own data-processing agreement with each SME, and its
  infrastructure providers are the sub-processors. §2's "du's own contractual
  security requirements | Always, for du's product" became NEWAX's own published
  security commitments plus any enterprise customer's schedule; §3.2's "On du's
  sovereign cloud" became NEWAX deploying its own control plane and tenant fleet
  in a UAE region; §7's "du must be able to run, repair and … leave" became every
  SME leaving with its data and an enterprise customer that contracts for it
  being able to run and repair; §8's IP boundary is now between NEWAX and its
  customers. The PDPL, DIFC, ADGM, ISO 27001, PINT AE and erasure tables are
  unchanged.
- **Doc 178.** "Competition submission vs pilot" became "MVP slice vs full
  rollout"; "if sandbox access is not granted by submission" became "not yet
  granted when the slice is cut". The built-versus-new map, the 21-step journey
  and the non-goals are unchanged.
- **Doc 182.** §2 "Why du — and not NEWAX building this alone" and §3's "No
  claim is made here about what e& or any other operator offers" are removed.
  In their place: why NEWAX builds and owns this, against what an SME actually
  uses (a spreadsheet, a point-solution BI tool, no visibility), on NEWAX's own
  built distribution (`ProvisioningService`, `SignupService`, `/pricing`,
  `BillingService`, `InvoiceDunningCron`, `AgencyStripeChargeCron`), and one
  owner of the canonical foundation versus a stack of point tools. §4's "Who
  bills whom — two options, decided in the contract" (Option A: du bills the
  SME) became NEWAX billing directly. WO-182.2 and WO-182.3 (a wholesale
  statement and a bridge to du's billing) are marked withdrawn, their ids not
  reused.
- **Incidental mentions in docs 169–174, 176, 177, 180 and 183.** "du SME"
  became "pilot SME" or "tenant SME"; "du operations" became "NEWAX hosting
  operations"; "du's own workforce IdP" became NEWAX's; `CANARY // du's and
  NEWAX's own internal tenants` became NEWAX's; "off by default for du tenants"
  became "for UAE tenants"; doc 183's G3 "The du rail" became "The first
  licensed PSP's integration"; every `<du-rail>` path placeholder became
  `<psp>`. Doc 180's "Revenue per SME to du" row now says NEWAX bills directly,
  so `PlatformInvoice` and `PlatformTenant.status`/`deprovisionedAt` are where
  those figures would be read — as KPIs only once the owner defines them.
- **`docs/implementation/README.md`.** The "Numbers 168–183" introduction no
  longer says NEWAX "is proposing to du, a UAE telecom operator"; rows 168, 175,
  178, 181 and 182 were brought into line with their revised documents.

This correction was safe to make in place because none of the technical
substance was ever du-dependent: Layers 0–5 cite erp-1's own code, the UAE
implementations sit behind interfaces whoever owns the product, and the custody
boundary never depended on *which* licensed entity moves the money — only that
one does.

### Consequences

- **Survives essentially unchanged:** the UAE-market research (PDPL, DIFC,
  ADGM, Emirates ID, UAE PASS, PINT AE, VAT record-keeping), the
  `PaymentProvider`/`FinancialInstitutionConnector` architecture and the custody
  boundary, Layers 0–5, platform resilience, graph derivability, metrics,
  engineering governance, and every work order except the two withdrawn.
- **Does not survive:** the competition/submission narrative (doc 178 is now MVP
  sequencing), the du commercial rationale (doc 182's thesis replaced, and with
  it Option A, WO-182.2 and WO-182.3), and du as recruiter and signatory
  (doc 179).
- **NEWAX now carries directly what the old premise assigned to du:** procuring
  UAE-region hosting (WO-181.9), a UAE sales presence, a possible UAE contracting
  entity (doc 182 §2.3 — named, not built), choosing the PSP or PSPs to integrate
  (WO-175.3), and being the data processor of record under a data-processing
  agreement with each SME (doc 181 §1).
- **Two filenames changed.** An outside bookmark to either old name breaks;
  both old names are recorded here and in each renamed document's own revision
  note so they can be traced.
- **ADR-071's title still reads "for du".** Left as written under this file's
  own rule; its status line points here.
- **Nothing opened or closed by this entry.** WO-168.3's two decisions and
  WO-175.10's clearing-account ADR remain exactly as ADR-071 left them.

### Status
**Accepted.**

---

## ADR-073 — Third-party apps (docs 184–195): an open, reviewed directory of remote services — never in-process code — installed per tenant with consent onto doc 34's `ApiClient`, completed now; ADR-037's service-account deferral superseded

### Context
The owner asked for a system where any tenant can connect to any external
partner it chooses, compared directly to "apps in GitHub" — GitHub Apps and
GitHub Marketplace. That means any outside developer or company can build an
app, submit it for review, and any tenant can discover it and install it in one
step, on a consent screen naming exactly what it is granted. NEWAX building
integrations itself is not the ask. The platform is built for more than 50,000
tenants' financial and operational data (`PRD.md`), so how an outsider's app
reaches that data is the decision.

The repository already has an in-process extension mechanism: module packs
(`apps/api/src/modules/module-packs.ts`, `SDK-CONTRACT.md`,
`example-hello-world-pack`, doc 37 §3), for NEWAX's own sector packs and a
vetted client's bespoke pack committed through NEWAX's repository and review.
It also has two relevant deferrals. Doc 34's `ApiClient` — an
organisation-level principal that survives its creator — was deferred by
ADR-037 "until an integration must outlive the person who set it up". Doc 36's
Out of scope named "a connector marketplace/catalogue of pre-built
integrations" as a natural future layer. Long-form: docs 184–195 in
`docs/implementation/integrations-connectivity/`.

### Options Considered
1. **Open the in-process module-pack mechanism to third-party submission.** It is
   the only mechanism that lets an app change behaviour anywhere. Rejected:
   code in the API process runs with the process's authority — every table,
   `APP_ENCRYPTION_KEY`, any service called directly past `PermissionsGuard`.
   No review makes an anonymous developer's code safe there: a reviewed
   version is replaced, a dependency is compromised after approval. ADR-027
   already withdrew a far narrower sandbox for "partner-authored formulas"
   over exactly this exposure. The same reasoning excludes browser-side
   federation of third-party JavaScript (doc 143) into the admin's
   authenticated origin.
2. **Remote-service-only apps over the connector, webhook and API-client
   plumbing this repository already specifies, completing doc 34.** An app runs
   on its publisher's infrastructure. NEWAX calls it (signed webhooks, provider
   calls through NEWAX-written adapters), and it calls NEWAX with a scoped,
   individually revocable credential checked by the existing guards.
3. **A separate third-party-integration microservice outside the modular
   monolith**, brokering all app traffic. Rejected: it contradicts ADR-001's
   deliberate modular monolith (`ENTERPRISE-SCALE.md`, `RETAIL-ERP.md`), adds
   a network trust boundary and a second place authorization is decided, and
   buys no isolation that is not already stronger elsewhere — tenants are
   isolated per database (doc 39, "a tenant is a node"), not per service.

Within option 2, four narrower choices were also taken on evidence:
- **Principal:** doc 34's `ApiClient` plus a login-disabled actor `User`, over
  extending personal keys (doc 163). A personal key is capped by and dies with
  one person — the opposite of an installed app. A bare `ApiClient` id in
  `request.user.id` would violate the 75 `User` foreign keys every attributed
  write sets. Doc 170 §4.1 already chose the login-disabled `User` for the
  support session.
- **Event delivery:** a per-subscriber `OutboxDelivery` layer fanned out by the
  existing outbox, over an HTTP call inside an `@OnDomainEvent` listener.
  `OutboxDispatcher` retries a whole event for every listener, delivers
  sequentially, and gives up after 8 attempts, so one app would stall or lose
  events for all. `TradingPartnersService.pushOutbound()` is that anti-pattern
  already, swallowing failures while doc 18 §18.3 says otherwise.
- **Credential:** short-lived tokens minted with the publisher's private key,
  over a long-lived per-tenant secret held at the app.
- **Kill switch:** a public, pulled, append-only status feed, over a platform
  push. `apps/platform` has no outbox (ADR-059), and doc 39 requires that a
  tenant need no code awareness of the control plane.

### Decision
**Option 2.** A third-party app is always a remote service, and nothing from
any app ever runs in any NEWAX process. The directory (publishers, listings,
versioned manifests, review, reports, the status feed, installation records,
prices) lives in `apps/platform`'s own database. An installation (consent
evidence, topics, provider bindings, and its `ApiClient`) lives in the
installing tenant's own database. Specifically:

- Scopes are real `PERMISSION_CATALOG` keys, enforced by the same
  `PermissionsGuard`/`decideApiKeyAccess()`. `NON_DELEGATABLE_PERMISSIONS`
  gains `apps.manage`, `api-access.manage` and `api-access.approve_scope`. A new
  `API_CLIENT_EXCLUDED_PERMISSIONS` keeps every maker-checker "approve" key and
  `org.access.grant` off any non-person.
- Data scope is the whole node only until `ENTERPRISE-SCALE.md`'s L2
  branch-scoped reads are enforced.
- Webhook payloads are thin (ids and transitions), from an explicit
  `APP_EVENT_TOPICS` allowlist.
- A grant touching `medium`+ sensitivity needs a second approver, with ruling
  16's recorded fallback.
- A key or URL change needs the app's own well-known document to agree with
  the control plane.
- Paid apps are add-on lines on the one `PlatformInvoice`, billed in arrears.
- The private connectors (docs 36/132/160/162) and doc 34's service account
  remain the escape hatch for any partner without an app.

Rollout is gated (doc 195): core first, then NEWAX's own three apps
invite-only, then contracted partners, then paid apps, and only then public
publishers and revenue share.

### Reasoning
- **The boundary is the control.** Over HTTP an app can do exactly what its
  grant permits on exactly the tenants that consented, and the grant is
  enforced by code NEWAX wrote. In-process, no such bound exists.
- **Every piece reuses a precedent that is already built:**
  - `PermissionsGuard` and fail-closed `decideApiKeyAccess()`, `@SessionOnly()`,
    and `NON_DELEGATABLE_PERMISSIONS` (doc 163);
  - the transactional outbox, its backoff formula and `EventEmitter2.onAny()`
    (`TaskEventIntakeService`);
  - `CircuitBreakerService` (doc 38);
  - doc 166's ops-issued, hash-only publisher credential and its
    never-auto-applied flag;
  - `SupportAccessGrant`'s clock-bound grant that never trusts a cron for
    liveness;
  - `PlatformInvoice`/`PlatformInvoiceCreditNote` and `BillingService`;
  - doc 155's trade payable in place of custody;
  - `SeatCounterService`'s single read-only query as the only boundary
    crossing.

  No second authorization system, event system or billing system is added.
- **ADR-037's reopening condition is met on its own terms.** An installed app
  must outlive its installer, or every tenant loses its integrations at the
  next staff change.
- **A directory is only safe if review is honest.** Review verifies what a
  remote service lets NEWAX verify — contract minimality, protocol behaviour
  in a sandbox tenant, signature verification, publisher identity, policy on
  paper. The consent screen says what the badge does not mean.

### Consequences
- **Doc 34's deferred work is now required, not optional**, with four
  corrections: no `organizationId`; a login-disabled actor `User`
  (`User.principalKind`); token-based credentials; and a flushed request log.
  Core changes accompany it: a `JwtAuthGuard` branch; refusals in `AuthService`,
  `JwtStrategy`, `UsersAdminService`, `RolesService` and
  `ApprovalService.start()`; a metadata argument on `EventBusService.dispatch()`;
  and a lease on `OutboxEvent`, which doc 163 §7 already asked for.
- **Review of arbitrary third parties is a permanent operational cost**, not a
  one-time build: staffed queues with SLAs, a sandbox tenant, report
  handling, suspension decisions, fast-tracked key rotations. Phase 4 cannot
  open until that capacity exists.
- **The private-connector escape hatch is preserved deliberately.** No tenant
  is ever blocked on nobody having published an app. The directory and the
  connectors share one delivery engine and nothing else.
- **Doc 36 is realised, and corrected, rather than built separately.** Its
  `ConnectorDelivery` becomes `OutboxDelivery` rows of kind `CONNECTOR`. Its
  in-process 8-attempt ceiling for external targets is replaced by a 72-hour
  window, because the old ceiling lost events after 8.5 minutes of target
  downtime, contradicting its own "four hours down" lens.
- **Recorded as found and not fixed here:**
  - doc 18 §18.3 and doc 166 §2 describe `pushOutbound()` as retried and
    at-least-once, and it is neither (WO-188.10);
  - doc 166's "no frontend of any kind" and "the platform's own storage
    driver" are both inaccurate;
  - `TenantsService.reactivate()` erases suspension history.
- **Open for doc 163's owner, not decided here:** whether personal keys should
  also lose `org.access.grant`, whose grants outlive the key that issued them.
- **Stated risks, not hidden:**
  - the kill switch fails open when the control plane is unreachable
    (< 2 min bound when it is reachable; warned at 30 min and 24 h);
  - enrolling a tenant in the directory is a manual ops step until WO-195.1;
  - revenue share cannot pay out until WO-192.0's legal/accounting
    confirmation and a general "invoice paid" record (WO-192.6) exist;
  - evidence-class audit is transactional, not tamper-evident, until
    `AuditLog` immutability (ruling 1).
- **Supersedes ADR-037's service-account deferral only.** ADR-037's
  personal-key decisions stand, and its status line points here.

### Status
**Accepted** — the architecture and the remote-only rule. Every work order in
docs 184–195 is proposed, not yet built.

---

## ADR-074 — Doc 205 (video rooms for doc 24's meetings): self-host LiveKit as NEWAX's own SFU behind a new `VideoConferenceProvider` core seam, run as its own Coolify resource and off by default in every deployment; LiveKit's built-in TURN rather than coturn; recording deferred

### Context

The owner asked for NEWAX to host video for its own meetings rather than
depend on Zoom, Google Meet or Microsoft Teams, and scoped the work small
deliberately:

- **In scope:** real video rooms wired into doc 24's existing `Meeting`
  (ADR-060).
- **Explicitly declined:** a standalone product, a Zoom-competitor business
  line, multi-region, native apps, webinars, breakout rooms and virtual
  backgrounds.

The question this entry settles is **which media engine, and where it lives**.
`docs/implementation/tasks-notifications-support/205-self-hosted-video-meetings-livekit.md`
is the design.

The evidence, checked against the code while writing doc 205:

- **No video anywhere.** `Meeting.location` is a bare `String?`, and no room,
  provider, URL or join mechanism exists in the schema, services or web app.
- **Doc 24 has no invitee-facing surface.** Nothing in `apps/web` calls
  `POST admin/notify/meetings/:id/respond`, no `GET` for meetings exists, and
  the only nav entry is gated on `notify.send`.
- **Doc 24's meetings are not NEWAX-only.** `notify` is in every client
  deployment's `MODULES` (`.env.production.example`).
- **Production runs on Coolify.** `DEPLOYMENT.md`'s own banner says so, and
  the one self-hosted third-party engine already running, Stalwart mail, is a
  Coolify Docker Compose resource (`docker-compose.mail.yml`,
  `docs/email.md`). Doc 13 is that choice's business intent, not its
  mechanism.
- **The typed-provider pattern is proven in code** by `PaymentProvider`,
  `CourierProvider`, `IdentityVerificationProvider`, `AiProvider` and
  `StorageDriver`. `FiscalComplianceProvider` (doc 15) is specified but
  unbuilt: WO-15.5 is blocked.
- **LiveKit's own source shows two facts that shape the access design:**
  - a connected participant's token is re-signed every five minutes, with at
    least ten minutes' validity (`pkg/service/roommanager.go`), so a short
    join-token TTL never ends a live session;
  - rooms auto-create on join by default (`room.auto_create`).

### Options Considered

1. **Integrate exclusively with a third-party API: Zoom, Meet or Teams.**
   Rejected.
   - The owner wants to own the infrastructure and avoid per-seat third-party
     licensing.
   - It would also move admission out of this codebase. A vendor meeting link
     is a bearer URL, and the vendor, not `MeetingInvitation`, decides who is
     let in.
   - It would send every internal conversation and its participant list
     through a vendor.
   - The honest trade: it is the option with the least operational work.
2. **Hand-build a WebRTC media engine.** Rejected. An SFU with congestion
   control, simulcast, adaptive layer selection, TURN, ICE-TCP fallback,
   reconnection and browser interoperability is a multi-year effort. It
   offers no differentiated benefit over an actively maintained open-source
   engine. `CLAUDE.md`'s "can the existing system already solve this?"
   applies to existing open-source systems as much as to this repository's
   own.
3. **Self-host LiveKit (Apache-2.0, Go) as NEWAX's own SFU, behind a new
   `VideoConferenceProvider` extension point.** Chosen.

Choices within option 3, each also weighed:

- **TURN.** LiveKit's embedded TURN (chosen) or a separate coturn.
- **Seam placement.** `apps/api/src/core/video/` (chosen) or inside `notify`.
- **Topology.** One LiveKit per enabling deployment (chosen) or one LiveKit
  shared across deployments.
- **Recording.** Now or deferred (deferred).

### Decision

Option 3.

1. **The seam.** `VideoConferenceProvider` has
   `createRoom`/`generateJoinToken`/`endRoom`/`listParticipants`/
   `removeParticipant`/`handleWebhook`/`ping`, with one implementation,
   `LiveKitVideoConferenceProvider`. It is selected by a
   `VIDEO_CONFERENCE_PROVIDERS` env allowlist that **defaults to empty**, so
   every deployment is byte-for-byte doc 24 until an operator enables it.
2. **Mechanism in core, policy in `notify`.** `core/video` knows rooms,
   grants and webhooks, and nothing of `Meeting`. `notify`'s
   `MeetingVideoService` decides who may join, when, and how many. The result
   is zero new `KNOWN_MODULE_COUPLINGS`, zero new domain events and zero new
   permission keys.
3. **Access.**
   - A join credential is minted only for a `MeetingInvitation` row, and the
     row's id is the LiveKit identity.
   - The route is `@AuthenticatedOnly()` + `@SessionOnly()` (pinned in
     `session-only-routes.spec.ts`) + throttled.
   - Issuance is audited evidence-class (ruling 9).
   - No token ever carries admin, recording, room-creation or hidden grants.
   - Sessions end server-side: `room.auto_create: false`, `endRoom()` at window
     close, on cancel and by the host, plus an admission re-check on every
     `participant_joined` and a per-minute removal sweep for deactivated users.
4. **Deployment.**
   - LiveKit runs as its **own Coolify Docker Compose resource**, like
     Stalwart, never as in-process code in `apps/api`. No media packet
     touches the API.
   - One instance per enabling deployment, with no Redis.
   - TURN/TLS on 443 through a Traefik TCP router with PROXY protocol.
   - It starts co-located, capped by container limits and a **measured**
     `limit.bytes_per_sec`.
5. **Recording is deferred** to its own later phase and ADR.
6. **Scope boundary.** Doc 205 owes doc 24 its missing invitee surface
   ("My meetings"), because a Join button needs somewhere to live.
7. **Not a product.** It is enforced by configuration and by what is not
   built: no plan, module toggle, listing, pricing or metering.

### Reasoning

- **It is doc 13's decision, taken again for a second kind of
  infrastructure.** Doc 13 chose a specific open-source engine (Stalwart) over
  a paid service. `docs/email.md` then deployed it as a Coolify resource beside
  the existing Postgres and Redis, rather than inside the app. LiveKit follows
  the same shape, and needs even less: no database and no Redis at one node.
  Real-time media is different in kind from a CRUD process, exactly as
  `RETAIL-ERP.md` gives a node its own database. So it gets its own deployable
  unit, and the modular monolith is not reopened.
- **House Rule 8, applied as the codebase already applies it.**
  `IdentityVerificationProvider`'s own header states the rule this follows: a
  single implementation still gets the interface, because it is the kind of
  external integration that gets a second one. `AiService`'s allowlist, its
  timeouts and `isAvailable()`-before-render are copied, not reinvented.
- **The seam goes in core because it knows nothing about meetings.** It
  mirrors `core/notifications` (delivery) beside `notify`'s `AudienceService`
  (who).
  - Placing it in `notify` would cost nothing today. But a later consumer
    outside `notify` (a sector pack that needs a room) would then have to
    import `notify`, which the boundary checker refuses, or wait for a move.
  - Placing it in core keeps that door open at zero cost now.
  - This document builds no second consumer. That would be speculative.
- **Built-in TURN** issues per-participant credentials that expire in 300
  seconds by default. It relays only to the SFU, and it enforces a
  per-participant relay-allocation quota.
  - A coturn deployment would need a long-lived shared secret, a second
    credential path, and deliberate peer-range denial so it is not an open
    relay into the Coolify network.
  - Coturn's advantages, independent scaling and a separate IP, belong to a
    scale this feature explicitly does not target.
- **One LiveKit per deployment, because the webhook stream is data.**
  LiveKit's `webhook.urls` is server-global. A shared instance would send each
  tenant's participant names and room activity to every other tenant. That is
  doc 39's "shares infrastructure, never a database" rule, applied to the
  thing that here plays the database's role.
- **Recording is deferred for concrete reasons,** each detailed in doc 205
  §10:
  - Egress is a second, CPU-heavy service that needs Redis;
  - `StorageDriver.put()` takes a whole `Buffer`, and production's
    `STORAGE_DRIVER=local` volume is unreachable from another container;
  - consent and notice policy is unwritten;
  - no table in the repository has a retention column (ruling 1's
    prerequisite is open);
  - playback needs a new permission and read-audit.

  Building it halfway would leave one of those five answered by accident.

### Consequences

- **Ongoing operational spend, not a one-time cost.**
  - Media bandwidth and CPU grow roughly with *N* × (*N* − 1) per room.
  - Every TURN-relayed participant crosses the host's interface twice.
  - This is recurring spend on the Coolify host's bandwidth, and it may force a
    dedicated server. Doc 205 requires the capacity figure be measured on the
    real host (`lk load-test`) before any deployment enables video, not
    estimated.
- **New infrastructure the team must operate, not just new code.**
  - A network-facing service with newly opened public UDP and TCP ports.
  - Its image updates and security releases.
  - Zero-downtime API-key rotation.
  - A Traefik TCP router for TURN/TLS.
  - Firewall rules, log rotation, and re-measuring capacity.

  `docs/video.md` (WO-205.7) is the runbook, and whoever operates the Coolify
  project owns it.
- **Monitoring is only structured logs plus a container healthcheck.** No
  metrics backend exists in this codebase. LiveKit's Prometheus endpoint stays
  off until one is adopted here as its own decision.
- **Every deployment carries the code, dormant.** Nothing changes until an
  operator sets the allowlist and runs a LiveKit resource. Doing that for a
  client deployment is an operator decision with its own cost line, not taken
  here.
- **A stated residual on deactivation.** A deactivated user already in a room
  may hear it for up to 60 seconds, until the next sweep. Closing that gap
  needs a `UserDeactivated` domain event from `users`, a separate decision
  named in doc 205's Out of scope.
- **Hosts can now see who actually attended their meeting.** That is a new
  visibility, limited to the meeting's caller by the same check
  `MeetingsService.cancel()` makes.
- **Doc 24 gains its first invitee-facing surface.** Its `respond()` route
  becomes reachable from a screen for the first time.
- **Three pre-existing doc-24 gaps are flagged, not fixed:**
  - `GET :id/shortfall` has no caller or reach check;
  - its two quorum settings have no editing route;
  - its erasure lens cites doc 25, which is payroll.
- **Three new dependencies,** each with a dependency-standard block in doc
  205: `livekit-server-sdk` (API), and `livekit-client` and
  `@livekit/components-react` (web, room route only, hooks and primitives
  only, never `@livekit/components-styles`).

### Status
**Accepted** — the engine, the seam and the deployment decision. Doc 205's
work orders (WO-205.1–205.7) are proposed, not yet built.

## ADR-075 — Doc 206 (rate limiting, sudden-logout, RAM ceilings, connection pooling, API caching, lazy loading, compression): eight requests investigated against the real code first — three extend what's already built, five are genuinely new, every parameter stated with its exact value

### Context

The owner asked for eight separate hardening measures in one message: a
Redis-backed token-bucket rate limiter for login attempts with a 429
response; a queueing mechanism to stop sessions being suddenly logged out;
a RAM ceiling for scripts; a "TERA type central connection" system for
faster connections; API response caching; prevention of irrelevant
component loading plus lazy loading; an image compressor; and a
zstd-over-brotli-over-gzip-over-uncompressed compression stack for server
responses — plus a standing instruction, now recorded in `CLAUDE.md`
itself, to always state the exact parameters and reasoning behind any
future security or performance decision rather than a vague description.

### Options Considered

1. **Treat all eight as greenfield and design each from first principles.**
   Rejected — a fast grep found real, partially-built systems already
   covering two of the eight (login rate limiting, image compression) and
   a third partially (Prisma's own connection pool). Designing over these
   without reading them first would have duplicated a security-relevant
   primitive (`@nestjs/throttler`'s own credential throttle) and an
   already-correct image pipeline (`StorageService`'s WebP conversion at
   quality 75) — exactly the "duplicate implementation is a defect" trap
   this repo's own house rules already name.
2. **Interpret "a queue system to prevent sudden logout" literally as a
   message queue (BullMQ or similar).** Rejected on inspection — nothing
   in this codebase's actual session/logout behavior is queue-shaped; the
   real, well-documented cause of an unexpected logout in a system that
   already rotates refresh tokens on use is a race between concurrent
   refresh requests, which a message queue does nothing to address. Doc
   206 §2 reframes this as refresh-token reuse-detection with a grace
   window, the actual mechanism that solves the described symptom.
3. **Investigate what exists, extend rather than duplicate the three
   partially-built systems, and specify exact parameters for the five
   genuinely new ones, all in one consolidated document (doc 206) rather
   than a document per system.** Chosen — proportional to eight related
   but individually contained hardening measures, none of which rises to
   the scale of a new module or a new business capability.

### Decision

Doc 206, as written. In one line per system: Redis-backed shared storage
for the existing IP-keyed throttler (unchanged limits, shared counters)
plus a new 5-token/5-minute-refill per-account bucket keyed by a hashed
login identifier, both fail-closed; refresh-token reuse detection with a
10-second grace window plus a client-side single-flight refresh mutex,
replacing the literal "queue" request; `--max-old-space-size` at 75% of
each service's own container memory ceiling; PgBouncer in transaction-
pooling mode plus a shared keep-alive HTTP agent for outbound connector
calls, in place of the unrecognized "TERA"; a 5-minute cache-aside Redis
layer for non-personalized reads, explicitly never for session-scoped
data; a 50KB-gzipped dynamic-import threshold for component loading;
image compression confirmed already built, no action; and a zstd→brotli→
gzip→identity negotiated compression stack with per-context quality
levels (fast for dynamic responses, maximum for build-time static
assets), enabled by a one-line `engines.node` bump to `>=22.15.0` rather
than a new native dependency.

### Reasoning

Every number above is justified in doc 206 itself, against the actual
code (real file paths, real existing constants like `WEBP_QUALITY = 75`
and `CREDENTIAL_THROTTLE`'s `{ limit: 10, ttl: 60_000 }`), not asserted
in the abstract. The recurring pattern across all eight: fail closed
rather than silently open when a new dependency (Redis, PgBouncer) is
unreachable, because an unlimited/uncached/unpooled system during an
infrastructure incident is a worse failure mode than a temporarily
degraded one, matching this repo's own `FeatureFlagsService` precedent.

### Consequences

Two new runtime dependencies this program requires sign-off on before
work starts: a dedicated Redis instance (rate limiting §1 and caching §5,
separate logical DBs, never the mail Redis) and PgBouncer (§4) — named in
doc 206's own dependency-justification block, not silently assumed
approved. `engines.node`'s tightening to `>=22.15.0` is a one-line,
low-risk change but does narrow which Node patch versions this repo
accepts — stated so CI/deployment images are checked against it. Every
other change is additive to already-shipped behavior (the existing
throttle limits are unchanged in value) or purely new capability with no
existing behavior to preserve.

### Status
**Accepted.**

### Addendum — 2026-09-28: WO-206.1 to WO-206.4 as built

Every value decided above is implemented unchanged. Building it against the
real code settled what the ADR left open: items 1 and 2 correct it, 3 and 4
record choices so they are not re-litigated. The full record, with each
parameter's reasoning, is doc 206 §8.

**Settled while building.**
1. *Fail closed where the limit is a credential control, not everywhere.*
   The global 300/60 s throttle guards every route, so a storage that
   fails closed on all of them turns a Redis outage into a total API
   outage — contradicting doc 38 §1 (the only total outage is Postgres).
   Routes that declare their own `@Throttle` fail closed (503); the
   module-wide limit falls back to per-process counting, the
   pre-WO-206.1 behaviour. Doc 38's degradation matrix has the row.
2. *One `auth.rate_limited` row per throttling episode, not per 429.* A
   synchronous INSERT per refused request would let a login flood exhaust
   the Postgres pool; a Redis `SET NX` marker records the first refusal of
   each episode (60 s per route per IP; 300 s per identifier).
3. *Per-identifier bucket keys kept over per-account keys*, recorded so it
   is not re-litigated: a shared account bucket would reveal whether a
   phone number and an email belong to one account.
4. *The grace window stays on `POST /auth/refresh`, as §2.2 scopes it.* The
   single sign-on handoff (`POST /auth/sso/session`, doc 161) redeems a
   refresh token through the same rotation but keeps single use: a second
   redemption inside 10 s is refused, not replayed.

**Parameters added** (Parameter — exact value — why — where — degrades):

| Parameter | Value | Why | Where | Degrades |
|---|---|---|---|---|
| Redis offline queue | disabled | never park requests on a dead socket | `core/redis/redis.service.ts` | command refused at once |
| Retries / resend per command | 0 / never | a replayed EVAL double-spends a sign-in token | same | fails on first drop |
| Command timeout | 500 ms | < 1 ms RTT; one 200 ms TCP retransmit still fits | same | treated as Redis down |
| Connect timeout | 2 000 ms | ~1 ms connect plus a cold DNS lookup | same | retried with backoff |
| Reconnect backoff | 50 ms × attempt, cap 2 000 ms | recovery noticed within 2 s | same | — |
| Boot wait | 2 000 ms, then boot | Redis is never a boot dependency | same | boots degraded |
| Instance memory | 64 MB data, 128M container | ~300k keys at ~200 B, ~3× a busy minute | compose/stack `redis` | full = refused writes |
| Eviction | `noeviction` | eviction resets a limit silently | same | as full |
| Persistence | none | counters are not facts | same | counters reset on restart |
| Refresh successor | HMAC-SHA256(`JWT_REFRESH_SECRET`, token) | replays return the same pair with no plaintext stored | `AuthService.successorOf` | secret change mid-window → plain 401 |
| Grace boundary | ≤ 10 000 ms inclusive | the ADR's 10 s, made exact | `REFRESH_REUSE_GRACE_MS` | — |

**Dependencies added by this build**: `@nest-lab/throttler-storage-redis`
1.2.0 and `ioredis` 5.11.1 (the 5.x line the adapter is built against;
6.0.0 switched to RESP3 by default two months before this). Doc 206 §1.3
names these, and the new Redis instance, as needing the owner's sign-off;
this addendum records what was built, not that sign-off.

## ADR-076 — Doc 207 (checkout admission queue): "prevent overselling during rush hours" corrected — overselling is already structurally impossible via `InventoryService.applyMovement()`'s predicate-on-write; the real problem is checkout UX and lock contention on a hot SKU's two rows, addressed with a per-variant admission queue that fails open, never a second stock guard

### Context

The owner asked for "waiting room logic to prevent selling over the
inventory during rush hours." Investigated before designing anything:
`InventoryService.applyMovement()` (`inventory.service.ts:236`) already
guards every stock decrement with an atomic conditional `UPDATE ...
WHERE quantity >= $requiredQty` (House Rule 10) — this makes overselling
impossible at any concurrency level, today, with no new code. A waiting
room built to "prevent overselling" would duplicate a guarantee that
already exists unconditionally.

### Options Considered

1. **Build a waiting room framed as overselling prevention** (a queue that
   gates checkout and is described as the thing stopping oversold stock).
   Rejected — this misrepresents what the feature actually does and risks
   a future reader believing stock correctness depends on the queue being
   up, when it does not and must not.
2. **Do nothing, since overselling is already solved.** Rejected — a real,
   distinct problem remains: `applyMovement()` also updates the variant's
   aggregate `stock` column via a second raw-SQL statement in the same
   transaction, so a genuine spike on one SKU serializes through two hot
   rows; past a real concurrency threshold this produces growing lock-wait
   chains and connection-pool pressure (the per-replica pool is 5
   connections per doc 206/ADR-075), and every losing bidder currently
   discovers they lost only after attempting payment, not before.
3. **A per-variant checkout admission queue**, scoped explicitly as a
   contention-bounding, UX and fairness mechanism, that fails open (never
   blocks a purchase) if its own infrastructure (Redis) is unavailable,
   and that reuses doc 206/WO-206.1's Redis module rather than adding a
   second one. Chosen.

### Decision

Doc 207, as written. Rush mode per variant triggers automatically at 10+
concurrent in-flight checkout attempts within a 5-second window (or
manually via a new `HighDemandWindow` an admin sets ahead of a scheduled
drop), admits 5 concurrent checkout sessions at a time — sized to exactly
match the per-replica Prisma pool so this alone can never exhaust it — each
with a 90-second completion window, and deactivates automatically when
contention drops below 3 for 30 seconds or the variant's real stock hits
zero (at which point everyone still queued gets an immediate sold-out
message rather than a doomed admission). The existing predicate-on-write
guard remains the sole authority on whether any given sale actually
succeeds; admission grants an attempt, never a stock hold.

### Reasoning

Every number is tied to a real existing constant already decided in this
log (the 5-connection pool from ADR-075) or to the actual failure mode
being bounded (10 as the point past which pool contention becomes real,
not a round number picked for its own sake). The fail-open posture is a
deliberate departure from doc 206's rate limiter's fail-closed posture,
reasoned explicitly: an unreachable Redis here should degrade to today's
already-correct behavior, never to a blocked purchase, because nothing
about stock correctness depends on this feature working.

### Consequences

This document's implementation is sequenced after doc 206/WO-206.1's
Redis module lands, specifically to avoid standing up a second Redis
client for the same infrastructure — named here so it is not silently
duplicated by whoever picks up WO-207.1. No change to `InventoryService`,
`applyMovement()`, or the predicate-on-write guard itself; this is
additive admission control in front of checkout, not a change to how
stock is written.

### Status
**Accepted.**

## ADR-077 — Doc 208 (L1/L2/L3 caching): each tier attached to a found hot path, not applied blindly — permission resolution's uncached three-query call on every authenticated request as the real L1/L2 target, `VariantSalesStat`'s eager-materialization pattern generalized as the L3 strategy, a real cross-replica settings-staleness bug found and closed along the way

### Context

The owner asked to "implement L1, L2, L3 caching where needed." Investigated
before designing: `SettingsService` already hand-rolls an in-process TTL
cache (30s) with no reusable primitive; `PermissionsService.resolveForUser()`
runs three uncached queries on every authenticated request (called from
`jwt.strategy.ts`'s `validate()`); `VariantSalesStat` is already an eagerly-
maintained materialized aggregate, not a TTL cache. "Where needed" is
answered by what these traces actually show, not by applying three generic
cache layers uniformly.

### Options Considered

1. **A single generic Redis caching layer wrapping arbitrary endpoints**,
   labeled L1/L2/L3 by convention without each tier solving a distinct
   problem. Rejected — this is exactly the "cache added with no stated
   invalidation strategy is a defect" failure CLAUDE.md's own performance
   rule already names, and duplicates `SettingsService`'s existing pattern
   under a different name instead of generalizing it.
2. **Build a new in-process cache for permission resolution without
   extracting `SettingsService`'s existing one into a shared primitive.**
   Rejected on the same "duplicate implementation is a defect" ground — two
   independently hand-rolled TTL-map caches, one already existing.
3. **Real cross-replica L1 invalidation via a new Redis pub/sub broadcast**,
   so a permission revocation is instant on every replica, not TTL-bounded.
   Rejected for this pass — no pub/sub mechanism exists anywhere in this
   codebase today, and building one solely to shrink an already-short
   10-second worst case is speculative infrastructure for a marginal
   benefit; named as a real future option if instant propagation is ever
   actually required, not built speculatively now.
4. **Extract `InProcessCache` as a shared L1 primitive, apply it to the
   found permission-resolution hot path with an explicit, reasoned TTL and
   delete-on-write invalidation at the real write sites, add an L2 Redis
   tier for both permissions and general API responses (doc 206 §5) in a
   shared safe-to-evict keyspace, and state the L3 criterion from
   `VariantSalesStat`'s own already-working shape rather than inventing a
   fourth pattern.** Chosen.

### Decision

Doc 208, as written. L1: `InProcessCache<K,V>`, extracted from
`SettingsService`'s existing hand-rolled cache; permission resolution gets
a 10-second L1 (capped 10,000 entries, LRU) and a 60-second L2
(`permissions:{userId}`), both invalidated by explicit delete-on-write at
the two real revocation call sites (`users-admin.service.ts`,
`roles.service.ts`) rather than TTL alone. Settings gains an L2 tier
(300s, `settings:{key}`) closing a real, previously-silent cross-replica
staleness gap: `SettingsService.set()` today only clears the *writing*
replica's own L1, leaving every other replica stale for up to 30 seconds
per write with no correction. Doc 206 §5's general API-response cache is
reclassified as this architecture's L2, parameters unchanged. L3 is
`VariantSalesStat`'s existing eager-materialization pattern, generalized
as a named criterion for future candidates rather than a fourth cache
tier — no speculative L3 target is built in this pass.

### Reasoning

Every parameter traces to either an already-shipped constant
(`SettingsService`'s real 30s TTL, kept unchanged) or a stated, specific
reason (10s for permissions because a stale revocation is a live
over-permission window, shorter than a stale setting's merely cosmetic
delay). The decision not to build pub/sub invalidation is argued
explicitly rather than left as a silent gap — the accepted staleness
bound is written down, not assumed safe without reasoning, per this
repo's own "never hardcode an assumption... without writing down why."

### Consequences

Permission-resolution caching introduces a real, bounded security trade-
off (up to a 60-second window where a revoked permission could still be
honored on a replica that hasn't independently expired its entry) — stated
here as a standing, reviewable fact of this design, not hidden inside an
implementation detail. The settings cross-replica staleness fix is a
correction to already-shipped behavior, not new functionality — worth
noting in case anything downstream was silently relying on the old,
looser cross-replica settings consistency. Implementation is sequenced
after doc 206/WO-206.1's Redis module (same dependency doc 207 already
states), adding one keyspace (`cache: { db: 1 }`) rather than a third.

### Status
**Accepted.**

### Addendum — 2026-09-28: WO-208.1 to WO-208.5 as built

Every number decided above runs unchanged (permissions 10 s L1 capped at
10,000, 60 s L2 at `permissions:{userId}`; settings 30 s L1, 300 s L2 at
`settings:{key}`; `cache: { db: 1 }`). Building it against the real code
corrected four things the decision rested on; doc 208 §5 has the full
record and §6 the measured budget.

**Corrected while building.**
1. *No per-keyspace eviction policy exists.* Redis sets `maxmemory-policy`
   once per instance, so `allkeys-lru` on db 1 beside `noeviction` on db 0
   cannot be configured, and switching the instance would let a cache burst
   evict rate-limit counters (ADR-075's refused fail-open). The cache shares
   the instance's `noeviction`, as doc 206 §8.1 had already noted: a full
   instance refuses the cache write, read as a miss. The shared budget is
   the cost — at the ceiling rate-limit writes are refused too — measured
   and bounded in doc 208 §6; a separate `allkeys-lru` instance is the named
   answer if WO-206.8's response cache outgrows it.
2. *Eight write sites in three files, and role-level writes reach every
   holder.* `GrantService.issue()`/`.revoke()` (orgstructure) change the
   resolved set too. A change to a role's grants, name or existence changes
   every holder's set — the `Customer` role has every customer — so it
   replaces one namespace token instead of deleting a key per holder.
3. *Delete-on-write alone reopens the window it closes.* A replica that read
   Postgres just before the write committed would write the old set back for
   a full TTL. Entries carry the namespace and per-id version tokens they
   were read under and are served only while both still match; in-process,
   an epoch keeps a read that straddled an invalidation out of L1.
4. *The settings gap was bounded, and L2 cannot shorten it.* `set()` called
   `delete(key)`, and every L1 entry expired after 30 s, so another replica
   was stale for at most 30 s — not "unbounded". An L2 behind each replica's
   L1 cannot shorten that; it was built as specified (it never lengthens it
   with delete-on-write) and buys one Postgres read per key per 300 s
   fleet-wide.

**Scoped while building.** Only the two per-request authenticators
(`JwtStrategy`, `ApiKeyAuthService`) take the cached path
(`resolveForUserCached()`); `resolveForUser()` stays uncached for the five
one-off callers, one of which (`GrantService` judging a granter) would
otherwise let a just-demoted granter issue a grant that outlives the cache
window. A time-boxed OrgUnitGrant caps its set's lifetime at its `expiresAt`.
The Consequences above therefore tighten: with a write site, a revocation
is refused on the revoking replica's next request and within 10 s on the
others; without one (raw SQL, a seed run), within 60 s.

**Parameters added** (Parameter — exact value — why — where — degrades):

| Parameter | Value | Why | Where | Degrades |
|---|---|---|---|---|
| Settings L1 capacity | 1,000 entries | 79 `SettingKey`s, none built dynamically: never evicts a real key | `SETTINGS_L1_MAX_ENTRIES` | LRU: one more read |
| Version token lifetime | 2 × L2 TTL (120 s / 600 s) | outlives every entry stamped with the token it replaced | `TieredCache.invalidate()` | — |
| Write-back cutoff | a read ≥ 1 L2 TTL old is not written back | keeps the row above true for a stuck loader | `TieredCache.writeShared()` | that read is not shared |
| Namespace token | no expiry, one per namespace | O(1) role-level invalidation; never evicted | `TieredCache.invalidateAll()` | — |

## ADR-078 — Doc 209 (semantic caching): applied to exactly one of ten AiFeature call sites — RAG_GENERATION, the only one where the answer depends solely on question meaning — and explicitly refused for WHATSAPP_ASSISTANT, where every prompt is already personalized per contact and a semantic cache would risk leaking one customer's data into another's answer

### Context

The owner asked to consider semantic caching alongside doc 208's L1/L2/L3
work. Investigated across all ten `AiFeature` call sites before choosing
one: `WHATSAPP_ASSISTANT` builds every prompt from
`buildGroundingContext(contact.id)` — per-customer order/conversation
history baked into the prompt itself; `SEMANTIC_SEARCH` only ever makes one
cheap embedding call per search with no completion step; `RAG_GENERATION`
scopes to `{ organizationId, corpus }` with no per-user dimension at all,
and its completion step is the genuinely expensive, cacheable cost.

### Options Considered

1. **Apply semantic caching generically across every AI-feature call site.**
   Rejected — for `WHATSAPP_ASSISTANT` specifically this is not merely
   unhelpful but actively dangerous: caching by question-embedding
   similarity while ignoring that every prompt also carries per-contact
   grounding context would serve one customer's cached answer, containing
   another customer's order context, to a semantically similar question
   from someone else. A real cross-customer data leak, not a hypothetical.
2. **Apply it to `SEMANTIC_SEARCH`.** Rejected — the only AI cost there is
   one embedding call per search with no completion step; a semantic cache
   still requires embedding the incoming query to check for a match, so it
   cannot avoid the one call this path makes. Doc 208's own general L2 Redis
   cache, keyed on the normalized search term, already captures the real
   repeat-query savings with no new infrastructure.
3. **Build a new Redis-based vector index for whichever target(s) are
   chosen.** Rejected — pgvector is already proven, working infrastructure
   in this codebase (`DocumentChunk.embedding`, `ProductTranslation.embedding`,
   both `vector(1536)`); a second vector-search mechanism in Redis duplicates
   a capability that already exists.
4. **Apply semantic caching to `RAG_GENERATION` only**, using pgvector (not
   a new Redis vector index), a conservative 0.95 cosine-similarity
   threshold, a 24-hour TTL backstopped by explicit invalidation on
   ingestion completion for the affected corpus, and cached citations
   carried forward unchanged rather than re-derived. Chosen.

### Decision

Doc 209, as written. One target (`RAG_GENERATION`), two explicit refusals
(`WHATSAPP_ASSISTANT`, `SEMANTIC_SEARCH`) with reasons recorded so neither
is silently reconsidered later without the same evidence being re-examined.

### Reasoning

The deciding question for every candidate was the same: does the answer
depend only on the question's meaning, or also on who's asking? Only
`RAG_GENERATION` answered "only on meaning." This is the same discipline
doc 208 already applied (attach a tier to a found, measured hot path, never
apply a technique uniformly because it's available) — extended here to
ruling a technique *out* with equal rigor when applying it would be a
correctness or privacy defect, not just unhelpful.

### Consequences

`RagGenerationService` gains a cache-check/cache-write path and a new
table; `RagIngestionService` gains one new call at its existing completion
point rather than a new generic event topic. `WHATSAPP_ASSISTANT` and
`SEMANTIC_SEARCH` are unaffected by this document — their absence of
caching here is a decision, not an oversight, and doc 209 itself is the
record a future reader checks before assuming otherwise.

### Status
**Accepted.**

## ADR-079 — Doc 210: caching third-party API calls to save charges — checked every real integration in this codebase and found exactly one billable, cacheable target (the AI provider), already covered by docs 208/209; two future non-AI targets named with their trigger condition, neither built now

### Context

The owner asked for caching on third-party API calls specifically to save
API charges, alongside the AI-caching work in docs 208/209. Checked every
real external integration before proposing a mechanism: `PaymentProvider
.feeFor()` returns a hardcoded 0 in both real implementations, no network
call; `PaymentProvider.initiate()` is a real call but must never be cached
(each is a unique transaction); `CourierProvider.track()` is a real,
cacheable-shaped polling call, but the only built implementation is
`manual` — no real courier account exists in this deployment; the generic
ingestion/connector system (docs 160/162/172) is specified but not built.

### Options Considered

1. **Build a generic third-party-response cache now, ready for whichever
   integration comes next.** Rejected — this is scaffolding with no real
   caller today, exactly the "unused abstraction with no documented reason"
   CLAUDE.md's own rules forbid. `CourierProvider.track()`'s real caching
   parameters (rate limits, sane TTL) depend on which courier is actually
   integrated and cannot be honestly set in advance.
2. **Report that AI caching (docs 208/209) is the whole answer and stop
   there, with no record of the non-AI investigation.** Rejected — a future
   session asked the same question should not have to re-derive that
   `feeFor()` is a no-op and `manual` is the only courier driver; the
   negative finding is worth exactly as much as a positive one and is
   recorded here so it isn't repeated.
3. **Record the finding, name the two real future targets and their exact
   trigger condition (a real implementation landing), build nothing
   speculative now.** Chosen.

### Decision

Doc 210, as written. No new caching mechanism is built by this decision.
The AI-caching work already in progress (docs 208, 209) is confirmed as
the complete answer to "cache third-party calls to save charges" for this
codebase as it stands today.

### Reasoning

Every named non-target was checked against real code, not assumed absent.
The two future targets reuse doc 208's own `InProcessCache`/Redis `cache`
keyspace rather than proposing a third caching mechanism, keeping this
consistent with the architecture already decided rather than opening a
parallel one.

### Consequences

None to the running system — this is a negative result, recorded for
discoverability. The two named triggers (a real courier provider, a real
ingestion connector) are the signal for revisiting this document, not a
calendar date or a guess.

### Status
**Accepted.**

## ADR-080 — Doc 211: cloud (subscription) and offline (license) locked to strictly separate `PricingModel`/`licenseDeploymentMode` pairings, retracting doc 154's "Lifetime License, ONLINE variant" row and naming doc 48 a precondition of a plan already on the public pricing page

### Context

The owner's direct instruction: do not mix cloud and offline at all —
cloud is sold on a monthly/yearly subscription, offline on a license,
never a subscription. Doc 50 (shipped) already models pricing shape
(`PricingModel`) and hosting mode (`licenseDeploymentMode: OFFLINE |
ONLINE`) as independent fields, and doc 154 (shipped, public `/pricing`
page) used that independence to offer an `ONLINE` variant of the
`ONE_TIME_LICENSE`-priced "Lifetime License" plan — a customer paying
once for infrastructure NEWAX keeps hosting indefinitely, with no
recurring charge to offset it.

### Options Considered

1. **Leave `licenseDeploymentMode` and `pricingModel` independent**, as
   shipped. Rejected — directly contradicts the owner's explicit
   instruction; also a real commercial liability (unbounded hosting cost
   with no recurring revenue to match).
2. **Remove `OFFLINE` entirely, sell only hosted plans.** Rejected — the
   owner separately confirmed a real, license-based offline product is
   wanted (this session's prior turn); doc 48 exists specifically to
   serve it.
3. **Lock the two fields together in both directions — recurring pricing
   models forced to `ONLINE`, `ONE_TIME_LICENSE` forced to `OFFLINE` —
   and retract doc 154's `ONLINE` variant of Lifetime License.** Chosen.

### Decision

Doc 211, as written. `pricingModel ∈ {FLAT_MONTHLY, PER_SEAT,
USAGE_BASED}` always implies `licenseDeploymentMode = ONLINE`;
`pricingModel = ONE_TIME_LICENSE` always implies `licenseDeploymentMode =
OFFLINE`. Doc 154's plan-comparison table's `ONLINE`-variant row for
Lifetime License, and the `hostingMode: 'EITHER'` value its
`PlanComparisonRow` type reserves, are both retracted. An annual license
term (12 months, 30-day grace period, node-locked) is recorded as the
recommended shape for the offline product, per `CLAUDE.md`'s own rule
against vague commercial parameters — not yet built.

### Reasoning

Doc 50's own field separation already gave this decision a home to land
in without a new mechanism — the fix is a constraint on an existing
model, not a new one. Locking the pairing in both directions (not just
removing the one violating cell) keeps the rule legible: there is no
configuration anywhere in `PlatformPlan` that mixes the two commercial
shapes, now or later. Naming doc 48 a precondition, rather than quietly
leaving the `ONLINE` fallback in place, is the honest reading of "do not
mix at all" — the fallback existed specifically because doc 48 doesn't.

### Consequences

Doc 154's shipped `/pricing` page and `PlanComparisonRow`/
`getPlanComparison()` no longer match this decision until the schema/DTO
cross-field check and the UI copy are updated (doc 211 §7, not built in
this pass). Doc 48 (native desktop deployment), previously a speculative
future mode, is now a named blocker on selling a plan already public.
No code changed in this pass — this ADR and doc 211 are the record; the
enforcement work is a future work order.

### Status
**Accepted.**

## ADR-081 — Doc 212: role/permission scope enforcement confirmed as a live adoption gap, not a hypothetical — `AdminScope` has exactly one production caller, `orgUnitScopeFilterFor()` has zero, and `check-route-permissions.mjs` has no awareness of either

### Context

The owner raised a specific concern: a role holder at one company/
department must never be authorized against another company's/
department's rows merely because they share a role name or permission
key — confirm company membership, confirm department membership, before
granting access. Investigation was required before answering, since
this codebase already has two real scoping mechanisms (`AdminScope` via
`scope.guard.ts`, and `OrgUnitGrant`'s subtree reach via doc 21) and the
question was whether they are actually enforced, not whether they exist.

### Options Considered

1. **Assume the existing mechanisms are sufficient because they exist.**
   Rejected — grepping the real call sites showed `assertCanManageAtScope`/
   `scopeFilterFor` used in exactly one module (`organization.service.ts`)
   and `orgUnitScopeFilterFor` used nowhere outside its own spec. Assuming
   coverage without checking would have been exactly the kind of
   unverified claim this codebase's own discipline forbids.
2. **Design a new "back tree" authentication mechanism from scratch**, as
   the request was initially phrased. Rejected once investigated — the
   correct mechanism already exists (`AdminScope`, `OrgUnitGrant`); the
   gap is adoption and enforcement, not a missing primitive. Building a
   second mechanism alongside an already-correct, unused one would be the
   duplicate-implementation defect `CLAUDE.md` itself names.
3. **Add a rigid `User.homeCompanyId`/`homeOrgUnitId` field** to make
   membership a single fact rather than inferred from grant rows.
   Rejected — fights the existing "grant that ends itself" model
   (time-boxed, revocable) that `AdminScope`/`OrgUnitGrant` already
   implement correctly.
4. **Record the gap precisely (which functions, how many real callers,
   which automated check doesn't cover it) and propose a static-check
   enforcement mechanism, matching `check-module-boundaries.mjs`'s own
   class of fix, without implementing it in this pass.** Chosen.

### Decision

Doc 212, as written. No `User.homeCompanyId` field. A new
`scripts/check-route-scoping.mjs` is proposed — same enforcement class
as `check-route-permissions.mjs` and `check-module-boundaries.mjs` — to
fail `pnpm lint` when a `@RequirePermission`-guarded handler touching a
`RetailBrand`/`Location`/`OrgUnit`-shaped model has no paired
`assertCanManageAtScope`/`scopeFilterFor`/`orgUnitScopeFilterFor` call.
Not implemented in this pass.

### Reasoning

The permission/scope separation in `PermissionsResolverService`'s own
doc comment ("this resolver answers may you at all; over which rows is
scope.guard.ts's job") is architecturally correct and shouldn't be
undone — the fix belongs at the enforcement layer, matching how this
codebase already catches an undecorated route (`check-route-permissions.
mjs`) and a cross-module import (`check-module-boundaries.mjs`) with a
build-time script rather than a runtime framework or a reviewer's
memory.

### Consequences

No behavior changes yet — every route that would fail the proposed check
today keeps working exactly as before. This ADR records a confirmed,
named exposure (any multi-brand/multi-department tenant with the
`organization` module either off, or on but relying on a route outside
`organization.service.ts`) so it is discoverable and fixable, rather than
found later in an incident. `ENTERPRISE-SCALE.md`'s own list of
not-yet-machine-enforced rules ("branch-scoped reads... undecorated
routes") already named this class of gap; this ADR makes the org/brand-
scoping half of it concrete with real file:line evidence instead of a
general caution.

### Status
**Accepted.**

## ADR-082 — Doc 48 (native desktop deployment): WO-48.1/48.3/48.4/48.5 built as real code in a new `packages/desktop-runtime`; the Electron/Tauri shell and auto-update stay unbuilt, exactly as the document's own text already scoped

### Context

Doc 48 proposes a desktop install as a real `RETAIL-ERP.md` node —
`apps/api` unmodified, an embedded managed Postgres, `apps/pos`/the admin
console, and the existing replication client, wrapped by a shell doc 48
itself never picks: "the choice between the two frameworks is a
`DECISIONS.md` entry of its own once resourced … not settled here"
(WO-48.2). Separately, ADR-080 (doc 211) has just named doc 48 a
precondition of a licensing plan already on the public pricing page,
raising the real-world stakes of the parts that are buildable now without
that shell decision.

### Options Considered

1. **Wait for the shell decision before building anything.** Rejected —
   doc 48's own text is explicit that the Postgres lifecycle, the setup
   wizard, and the hardware drivers are "real, testable orchestration
   logic … independent of which shell eventually wraps it." Waiting would
   leave real, buildable, independently valuable code unbuilt for a
   reason that does not apply to it.
2. **Pick Electron or Tauri now, as a side effect of building the rest.**
   Rejected — this is exactly the decision doc 48's own text reserves for
   a dedicated `DECISIONS.md` entry "once resourced," weighing bundle
   size, native-module support, and cross-platform build tooling; none of
   that evaluation was done in this pass, so adopting either framework
   here would be exactly the "settled" this document explicitly declines
   to be.
3. **Build WO-48.1/48.3/48.4/48.5 as real code behind a shell-agnostic
   interface, in a new package neither `apps/api` nor `apps/pos` need to
   import, and record the shell/auto-update deferral as its own decision
   rather than silently skipping it.** Chosen.

### Decision

A new workspace package, `packages/desktop-runtime` (Node-only, no
consumer today): `PostgresLifecycleManager` (real `embedded-postgres`
binary, random per-install credentials, a classified
`PostgresLifecycleError` with a `repairAction`), `FirstRunSetupWizard`
(no-terminal orchestration over `apps/api`'s own `db:deploy`/`db:seed`
scripts, validating `NODE_ROLE`/`PARENT_URL`/`PARENT_API_KEY` against
rules mirrored from `env.validation.ts`), `LocalBackupScheduler` (a
physical stop/tar/restart backup with a real restore-test, since
`embedded-postgres`'s own binary distribution ships no `pg_dump`/`psql`),
and `SerialPortReceiptPrinter`/`SerialPortCashDrawer` (native ESC/POS
drivers implementing doc 31's own `ReceiptPrinter`/`CashDrawer`
interfaces). WO-48.2 (the shell) and WO-48.6 (auto-update) are not built
— no Electron/Tauri scaffold, no installer, no updater — matching doc
48's own text precisely, not a scope reduction invented here.

### Reasoning

`packages/desktop-runtime` rather than `packages/pos-core` (where the
`ReceiptPrinter`/`CashDrawer` interfaces already live): `pos-core` is
consumed by `apps/pos`, a browser PWA a bundler builds; `embedded-
postgres` and `serialport` are Node-only, one with native bindings, and
neither belongs anywhere near a browser bundle graph, even as dead code a
bundler would have to be trusted never to reach. A dependency this
narrow-purpose earns its own package rather than risking that. The
Postgres-lifecycle and setup-wizard code runs *before* `apps/api` can
even boot (it is what starts Postgres and writes the env `apps/api`
reads), so it structurally cannot live inside `apps/api` itself without
contradicting doc 48's own "`apps/api`, unmodified" diagram — the same
reasoning places `LocalBackupScheduler` outside `apps/api` too, since it
is the thing that stops and restarts the very process a Nest-hosted
scheduler would need to keep running.

Two real, previously-unnamed gaps surfaced by actually building this,
recorded rather than quietly patched over: `env.validation.ts` requires
`REDIS_URL` in production with no usable default, and doc 48 never named
an embedded local Redis the way it names an embedded local Postgres — the
wizard now requires `redisUrl` as an explicit input rather than
defaulting it into a broken or dishonestly-downgraded configuration.
Separately, `embedded-postgres`'s binary distribution ships no client
tools, so `LocalBackupScheduler` is a physical (data-directory) backup,
not `deploy/backup.sh`'s live logical (`pg_dump`) one, and therefore
briefly stops the local database during a backup — a real trade-off
`deploy/backup.sh` does not have and doc 48 did not previously state.
Both are named here and in doc 48's own status blockquote as real,
separately-scoped follow-ups, not solved in this pass, per `CLAUDE.md`'s
own instruction that a separably larger capability is named and
sequenced, never silently stubbed.

Every mechanism above that touches a real external binary was proven
against the real thing, not only a fake: `embedded-postgres`'s actual
downloaded Postgres server binary and the real `tar` npm package were
both exercised end-to-end by hand in this sandbox (as a created non-root
OS user, since Postgres correctly refuses to run as root, and this
sandbox otherwise runs as root) via this package's own `test:integration`
script — init/start/health-check/stop, the database-bootstrap fix, the
credentials-must-travel-with-the-data-directory fix, and a full backup
plus independent restore-and-verify cycle all passed for real. The
serial-hardware drivers are the one piece with no real device in this
sandbox to test against at all (confirmed: even `SerialPort.list()`
itself fails here for want of `udevadm`) — their protocol logic is real
and unit-tested against a documented ESC/POS command set, but contact
with an actual printer or drawer is honestly unverified, not built-and-
claimed-working.

### Consequences

`packages/desktop-runtime` has no consumer yet — it is real, tested,
buildable code waiting for WO-48.2's own shell to invoke it, the same
"ships inert, ready the day it's needed" posture doc 37's own
`FeatureFlag`/versioning infrastructure already takes. ADR-080's naming
of doc 48 as a precondition of a public pricing plan means WO-48.2/48.6
are no longer a purely architectural deferral — whoever picks up the
shell/packaging decision next should read this ADR and ADR-080 together
before resourcing it. The Redis and physical-backup gaps this ADR names
are real, open engineering items, not merely documented risk: a
production desktop deployment today would need one of the Redis
mitigations named above, and its backup schedule should account for the
brief stop this design requires.

### Status
**Accepted.**


## ADR-083 — A two-theme design system: one source in `brand.ts`, themes as scoped CSS custom properties, fill and ink split, a closed Tailwind palette, and contrast enforced in both themes

### Context

The design system (`docs/design/`) specified eight token groups and built
three (colour, radius, type), all light-only. There was no dark theme, no
spacing/size/elevation/layer/motion token a surface could import, stock Tailwind
colours and numeric z-indexes were in use beside the brand palette, and
`scripts/check-contrast.mjs` measured only one theme. The request was a complete
premium design system with light and dark modes. This repository is one
deployment per brand (`CLAUDE.md`, "Scale: the three axes"), so the system had
to stay a build-time value per brand, not a runtime multi-tenant theme.

### Options Considered

1. **Tailwind `dark:` variants in every component.** The obvious route. Rejected:
   about 1,700 existing `neutral-*` call sites would each need a second class,
   every future component would have to remember it, and "forgot the `dark:`" is
   invisible in review. It also makes a component know which theme it is in.
2. **A codemod to rewrite call sites to semantic names, then theme the names.**
   Rejected as a first step: a 1,700-site diff is not reviewable, and it buys
   nothing the next option does not.
3. **Scoped CSS custom properties behind the existing class names (chosen).**
   `text-neutral-900` keeps its name and resolves through
   `rgb(var(--color-neutral-900) / <alpha-value>)`; the theme redefines the
   variable. No call site needs to change for the flip, `bg-neutral-900/60` still
   works, and a region can be pinned to one theme.
4. **A runtime theming library or CSS-in-JS.** Rejected: a dependency
   (`dependencies.md`) for something the platform does, and it would not reach
   `apps/mobile`, which consumes `packages/shared` but not Tailwind.

### Decision

- **One source.** `packages/shared/src/brand.ts` holds `colors` (light) and
  `colorsDark`, plus new `space`, `size`, `elevation` (per theme), `layers` and
  `motion`. The `theme-*.ts` files are thin views; `theme-tailwind.ts` turns the
  source into CSS variables and a Tailwind theme; `theme-runtime.ts` is the
  framework-free preference logic and the no-flash script.
- **Theme = `data-theme` on `<html>`**, scopes `:root`, `[data-theme='light']`,
  `[data-theme='dark']`, plus an `@media (prefers-color-scheme: dark)` fallback
  on `:root:not([data-theme])` for the case the script never ran.
- **Fill and ink are separate.** `bg-accent` is the brand fill in both themes;
  `text-/border-/ring-accent` are the ink (lighter in dark). Status-hue washes and
  ink follow the theme; solid fills keep their stock value.
- **Closed palette.** `theme.colors` and `theme.zIndex` are replaced, not
  extended. An unlisted colour or a numeric z-index generates nothing.
- **`cn()` knows the new names.** `tailwind-merge` only knows stock Tailwind:
  it kept both of `z-raised z-modal`, and read `text-metric` as a text colour,
  so `cn('text-metric', 'text-neutral-900')` silently dropped the metric size.
  `cn.ts` now extends it from the same token lists Tailwind is built from
  (`cn.spec.ts` holds the cases).
- **Two new semantic pairs** so a fill can survive the flip: `inverse` /
  `on-inverse`, and `scrim` for veils; `surface` and `overlay` so elevation can
  be said with lightness in dark.
- **Contrast enforced in both themes**: `theme-contrast.spec.ts` (every role
  pair; editing a dark value to break a floor was confirmed by hand to fail it) and
  `check-contrast.mjs` (every class use, each theme with its own baseline).
- **Reference page** `/admin/design-system`: public, `noindex`, reads no data,
  rendering the tokens and the real components and measuring contrast live.

### Parameters

| Parameter | Exact value | Why this number |
|---|---|---|
| Contrast floors | text 4.5:1; a control's boundary, a chart mark 3:1 | WCAG 2.2 AA (1.4.3, 1.4.11). The repo's existing `FLOOR` in `check-contrast.mjs`, unchanged. |
| Dark page / surface / overlay | `#0c0b0b` / `#171516` / `#242122` | Each step is lighter than the last: a shadow cannot say "higher" on near-black. Neutral-tinted, same hue family as the light ramp (`#121111` ink). |
| Dark neutral ramp | 50 `#0c0b0b` · 100 `#2b292a` · 200 `#6d6b6c` · 300 `#7b797a` · 400 `#8c8a8b` · 500 `#a3a1a2` · 600 `#bbb9ba` · 700 `#d1cfd0` · 800 `#e6e4e5` · 900 `#f9f7f8` | Monotonic (tested). 200 is 3.44:1 on the surface (control outline floor); 300 is 4.55:1 on the page (it was `#7a7879`, 4.48:1, and the two-theme check found it); 400 and up clear 4.5:1 on page, surface and overlay. |
| Dark brand ink | `#3db8cb` / hover `#8fdae6` | 7.72:1 on the surface. The fill stays `#0e8294` so a white label keeps 4.53:1. |
| Dark status tint mix | 10 / 16 / 26 / 40 % of the hue's 500 into the surface (steps 50/100/200/300) | Above about 16 % a red notice reads as an alarm lamp on a dark card; 26 vs 10 keeps `border-red-200` a visible hairline against its own 50 wash. |
| Elevation (light) | raised `0 1px 2px 0 / 0 1px 3px 0` at 6 %; overlay `0 4px 8px -2px` 8 % + `0 12px 24px -6px` 12 %; modal `0 8px 16px -4px` 12 % + `0 24px 56px -12px` 30 %, all `rgb(18 17 17)` | Two-layer shadows (contact + ambient), neutral-tinted rather than pure black. |
| Elevation (dark) | raised 50 % / 40 %; overlay 50 % / 55 %; modal 55 % / 70 %, `rgb(0 0 0)` | Higher opacity because a shadow on near-black is otherwise invisible; it is the secondary cue after surface lightness. |
| Layers | base 0 · raised 1 · raised-2 2 · raised-3 3 · sticky 10 · dropdown 20 · overlay 30 · modal 40 · toast 50 · debug 90 | The chapter-01 list, plus three in-card steps the storefront product card needed (link, badges and scrim, heart). |
| Durations | instant 80 · fast 140 · normal 220 · slow 320 · sweep 420 ms | Chapter 01's values, plus `sweep` for the button fill that was a literal in `globals.css`. |
| Space / size | 0, 2, 4, 8, 12, 16, 24, 32, 48, 64 px; control 32 / 40 / 48; icon 16 / 20 / 24; touch 44, POS 48 | Chapter 01 and 07, unchanged. |
| Theme storage | `localStorage` key `newax.theme`; values `light` \| `dark` \| `system`; default `system` | Per device, not per user (see lenses). Anything else stored is treated as `system`. |

### Reasoning

The fill/ink split is the decision the rest depends on. The teal dark enough
for a white button label (`#0e8294`, 4.53:1) reads only 4.02:1 as text on the
dark surface `#171516`, under the 4.5:1 floor; the teal light enough for that
(`#3db8cb`, 7.72:1) gives a white label just 2.36:1. No single value satisfies
both, so the same token name resolves differently for a background and for ink. Everything else follows from wanting no call site to
know which theme it is in.

The closed palette is a trade: it makes a stray `text-orange-600` produce no
style rather than a correct-in-light, wrong-in-dark colour, at the cost of one
more edit when a hue is genuinely needed. The hues in use (red, green, amber,
blue) are listed; adding one is a change to `createThemeTailwind`, which is the
point.

The two-theme contrast check paid for itself in the same change: it found a real
failure in dark (`bg-neutral-200 text-neutral-900/80` on the trading-partners
page, 3.84:1, now the shared neutral badge colours) and a marginal one
(dark `neutral-300`, 4.48:1), and it cannot be satisfied by an inverse fill
written as `bg-neutral-900 text-white` (its self-test proves it fails in dark).

### Consequences

- Existing call sites flip without edits; the call sites that cannot survive a
  flip (roughly seventy files) were migrated by hand: inverse fills, scrims, floating surfaces,
  off-palette stock hues, `z-50`-style literals, and the chart colours.
- Regions that must not flip are pinned with `data-theme="light"`: product-card
  badges, the announcement bar, the footer, the bottom-nav pill, the filter
  count badge, the email-template preview iframe and the BPMN canvas.
- **Known gaps, named rather than hidden:**
  1. **Light control outline is 1.72:1** against a 3:1 floor. It was before this
     work. The fix (darken light `neutral-200`, or add a dedicated control-edge
     token) changes the look of every input and is a brand decision.
  2. **POS and mobile have no dark mode.** The tokens are in `packages/shared`;
     adopting them is per-app work (POS has its own Tailwind config and root
     layout; mobile reads the tokens as numbers).
  3. `global-error.tsx` and `not-found.tsx` render before any stylesheet and stay
     light.
  3a. The reference page is reachable in production. It was written to 404
     there, but `check-frontend-secrets.mjs` (House Rule 12) rejects any
     non-`NEXT_PUBLIC_` `process.env` read in `apps/web/src`, `NODE_ENV`
     included, and loosening a security check to gate a reference page is the
     wrong trade. Options if it should not be public: move it behind sign-in
     (inside `(app)`), or add `NODE_ENV` to that check's public-by-definition
     list. Left as an owner decision.
  4. Urdu strings added for the toggle (`theme` namespace in `ur.json`) need a
     native reviewer.
  5. No page-level Content-Security-Policy exists today (`next.config.mjs`'s
     policy is the image optimizer's). The day one is adopted, the inline
     no-flash script needs a hash or nonce; its text is constant, so a hash is
     straightforward.
- No visual-regression tooling exists; the reference page was checked in
  Chromium at 280, 380, 640, 768, 1024 and 1536 px in both themes (no horizontal
  overflow at any width), and the dialogs, toasts, charts and pinned regions by
  hand. Focus order, reduced motion and RTL remain unchecked by any command, as
  `.claude/rules/design.md` already says.

### Pillars and scope lenses

**Pillars touched.** *Proper architecture*: tokens stay in `packages/shared`,
no module imports another (`check-module-boundaries` unaffected). *Scalable*: one
stylesheet, repaint by attribute change, no per-component JS. *Secure*: no server
change, one new unauthenticated page (the reference: no data, no API call, only values
already public in the stylesheet), and the inline script is a constant with a
JSON-escaped key. *Stable*: every failure mode of the
no-flash script (storage throws, `matchMedia` missing, script fails) degrades to
the OS preference. *Observable*: n/a, nothing server-side.

**Scope lenses.**
- The actor: n/a, no new actor; the preference belongs to a browser, not a `User`.
  A per-user server-side preference is a separable follow-up (a `User` column and
  an endpoint), sequenced after this.
- The principal with no permission key: the reference page reads no rows and
  calls no API, so it carries no `@RequirePermission`; the
  theme toggle is a presentation preference, not a capability, and adds no
  `PERMISSION_CATALOG` key.
- The grant that ends itself: n/a, grants nothing.
- Whose rows, and which columns: n/a, reads and writes no rows.
- The threshold nobody approves alone / toxic pair: n/a, commits no money or stock.
- Authority and blast radius: a palette change is a PR to `brand.ts`; the worst
  value one can set reaches every screen, and the build stops it at the floors
  (`theme-contrast.spec.ts`, `check-contrast.mjs`).
- Audience is a capability: n/a, sends no message.
- Request or record: the one write (`localStorage`) is a REQUEST the browser may
  refuse; the refusal path is the `system` fallback.
- The movement with no address / four hours down: n/a, no stock or cash write;
  the theme works offline.
- The money lenses (posting rule, dimensions, closed period, second legal entity,
  dry run, click the number): n/a, posts no journal line and shows no figure.
- Three silhouettes: a Solo, Chain or Organization deployment reads the same
  tokens; a second brand supplies its own `colors`/`colorsDark` at build time.
- The absent collaborator: depends on no module; a deployment without any pack
  renders the same theme.
- The second copy of the write: the init script and `setPreference` are
  idempotent.
- The hundred-thousandth row / the adoption test: n/a, no table, no generated code.
- The reversal document / undo fan-out: a theme is reversed by choosing another.
- The version stamp: the palette is versioned by git; no record stores a colour.
- The erasure the ledger cannot obey: the only stored datum is the `newax.theme`
  key, which holds no personal data.
- The failure path: a storage failure is silent and recoverable (follows the OS).
- Reachable: the toggle is in the admin header (`admin-shell.tsx`) and the
  storefront header (`theme-switch.tsx`); the reference page is opened by URL from
  `docs/design/` and is allow-listed in `check-links.mjs` with that reason.

### Status
**Accepted.**

Addenda are numbered by their headings, which are not a count: the two that carry no ordinal (2026-09-30
and the first of 2026-10-01) are the first and second, so the one headed "(second)" is the third and the
one headed "(eleventh)" is the twelfth.

Superseded in part by the eleventh addendum, where an earlier figure no longer holds: the contrast baselines
of 43 light and 39 dark quoted in the "(third)" and "(fourth)" addenda (now 52 and 42, because the check
learned `@apply`); the toast default written as `use-toast.ts`'s own `4 000 ms` in the "(fifth)", "(seventh)"
and "(eighth)" addenda (the number is unchanged and now lives in `BRAND.feedback.toastMs`); "no consumer" for
`components/common/toast-container.tsx` in the "(fifth)" (still true, now marked in the file and listed in the
generated index); and the 113 self-test cases of the "(tenth)" (now 124).

### Addendum — 2026-09-30: the admin UI spec (220) folded in

**Requirement.** The owner asked for `220-admin-ui-gemini-ideas-design-spec.md`
to be used as input to this design system. It lives on
`claude/ecstatic-archimedes-vlkgzk` (commit `ab1ad818`), not on this branch, so
it is referenced by path and not copied — a second copy would be a duplicate
document of record. It plans twelve admin screens, each its own work order, and
lists "new design tokens" as out of scope. So it adds no tokens; it is a consumer
of this system and the test of whether the system holds what those screens need.

**What was taken, and why each is here.**
- `DataTable` gains an opt-in `stacked` prop (default `false`). Spec §Shared layout
  contract: table screens become stacked cards below `md`; five planned lists
  need it (bulk import review, products feed, users, audit log, roster). Every
  existing table renders the same markup as before — checked in the built page:
  seven unstacked tables, none carrying a role attribute or a `max-md` class.
  Stacked tables restate their ARIA roles, because `display: block` removes table
  semantics in some browsers.
- `.notice-warning`, the fourth notice tone, in the same amber pair as the Badge
  `warning` tone. The access-ending banner (§3), the import "needs attention" line
  (§1) and "count unavailable" (§5) all need it, and notices had no warning tone
  while badges did. One existing hand-rolled amber banner
  (`trading-partners/[id]`) is not migrated here.
- An "Admin patterns" section on `/admin/design-system`, written out from
  primitives only: review before commit (§1), selection bar (§7, §10), difference
  preview (§2), access that ends (§3), live count (§5), profile cards (§4). They
  are specimens, not components.

**What was deliberately not built.**
- Any screen, route, endpoint, permission or table from the spec — each is its own
  work order with its own lenses (spec §Implementation plan).
- A side drawer that becomes a full-screen sheet below `md` (§6): one consumer.
  `03-components.md` states the rule of three, and this is the first.
- A stepper, a drop zone, a split button: already covered by `components/common/wizard`,
  `CsvImportCard` and plain buttons, or unneeded until the screen exists.
- Pixel motion (§12): the spec itself calls it decorative and last. It fails Law 6.

**A conflict, and the ruling.** `02-layout.md` says a scrolling table is usually
better for an ERP than cards, because users compare rows. The spec says cards
below `md`. Both hold: `stacked` is opt-in, for lists read one row at a time, and
`02-layout.md` now says so next to the rule it qualifies. The chapter's default
for compared rows is unchanged.

**Parameters.**

| Parameter | Exact value | Why | Enforced |
|---|---|---|---|
| Stacking breakpoint | below `md` = 768 px | the boundary the spec and the seven-screens ladder already use; between `fold` (672) and `md` a four-column table does not fit | `max-md:` variants in `data-table.tsx` |
| `stacked` default | `false` | changing how seven existing tables look is a behaviour change nobody asked for | prop default |
| Selection bar offset | `bottom-4` (1 rem), `z-sticky` | clears the page edge and sits in the same layer as the sticky header | `patterns.tsx` only |

The spec's own numbers (a 300 ms count debounce, an "In 48 h" option, a one-hour
warning threshold) belong to the screens that will use them and are not
implemented here.

**Verification.** `pnpm lint` exit 0 (contrast within both baselines), web
typecheck and 23 web tests pass, production build passes. The new section was
captured at 280, 380, 640, 768, 1024, 1280 and 1536 px in both themes: no
horizontal overflow at any width, no console errors, cards below 768 and a table
from 768.

**Noticed, not changed.** `tailwind.config.ts` names its screens `xs` 380, `sm` 640,
`fold` 672, `md` 768, while `CLAUDE.md` names them `xs` 280, `sm` 380, `fold` 640,
`md` 768. `md` agrees, which is the only one this change uses; the lower names
disagree and should be settled in their own ADR before a component leans on them.

**Pillars.** *Architecture*: no module boundary touched. *Scalable*: CSS-only
reflow, no client JS, no extra DOM. *Secure*: no route or data. *Stable*: opt-in,
so no regression path for existing tables. *Observable*: n/a.

**Scope lenses.** One opt-in prop on a shared primitive, one CSS class, specimens
and documentation — not a named feature: the five screens the spec plans run their own
lenses. n/a for every money, stock, actor and erasure lens: writes no row, reads
no row, posts nothing. Reachable: the specimens are at `/admin/design-system#patterns`,
in the page's section nav.

### Addendum — 2026-10-01: what the "Modern ERP UX Design Blueprint" adds to premium

**Requirement.** The owner asked for the shared document to be mined for
anything that makes the design more premium. The Google Doc link itself could not
be opened from this environment (`docs.google.com` is denied by the network
policy), so this addendum rests on the copy attached to the thread, which is the
same Gemini transcript spec 220 was written from: 2,677 lines, mostly Vue and
Quasar for functional screens. Its visual ideas are few. Each was weighed against
the house rules before it was taken.

**Taken, re-expressed in this system's tokens.**

| Idea in the transcript | What was built | Why it fits |
|---|---|---|
| Frosted glass over imagery (`bg-white/85 backdrop-blur-xl`) | `bg-overlay/85 shadow-overlay backdrop-blur-md`, solid under `prefers-reduced-transparency` | text keeps a surface; held to 4.5:1 by `theme-contrast.spec.ts` |
| Selectable cards with a tinted selected state | choice cards: real radio group, ring + tint + tick | the selected state is never colour alone; no border, per `ui.md` |
| Pulsing "live" dot | dot plus the word "Live", `motion-safe:animate-ping` | motion that communicates (a live feed), honours reduced motion |
| Slide-in floating selection bar | `motion-safe:animate-slideUp` on the bar | transform and opacity only, from the existing keyframe and duration tokens |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Frosted surface opacity | 85% | the lowest step tried (85, 70, 60, 50) that keeps primary and secondary text at 4.5:1 over a flat black and a flat white backdrop in both themes; worst case at 85 is 5.52:1 (dark, white backdrop, secondary text), and 70 falls to 3.65:1 there | `theme-contrast.spec.ts`, "frosted surface over a black/white backdrop" |
| Backdrop blur | `backdrop-blur-md` (12 px) | enough to average away detail behind small text; a blur is also what makes flat black or white the true worst case | specimen |
| Transparency fallback | solid `bg-overlay`, no blur, under `prefers-reduced-transparency: reduce` | transparency is the thing that setting turns off | arbitrary variant in `patterns.tsx` |

**Failure modes.** No `backdrop-filter` support: the 85% surface is still opaque
enough for the contrast figures above, the blur simply does not apply. No `:has()`
support (Firefox before 121): a choice card loses its keyboard focus ring, but
the ring, tint and tick are driven by state and still show.

**Not adopted, and why.**
- `rounded-2xl` and `rounded-3xl` cards: the house shape is sharp, with `lg` a hair
  softer for large panels (`brand.ts` radii). Rounder corners would read as a
  second design system.
- A border and a shadow on the same card edge (`border-gray-100 shadow-sm`):
  forbidden by `ui.md`. Elevation is the shadow alone.
- `bg-gray-900 text-white` for the floating bar: the pair that cannot survive a
  theme (17.9:1 in light, 1.07:1 in dark). `bg-overlay` carries it.
- A coloured glow under the primary button (`shadow-blue-500/30`): decoration that
  moves with the brand and names a literal colour.
- `bg-blue-600`, `text-gray-500` and similar literals: Law 1.
- The WebGL pixel shader, pixel-hover cards and `<PixelHeroBanner/>`: a second GPU
  context and a per-frame loop on pages whose job is something else, adding no
  information. Fails Laws 3 and 6, as spec 220 §12 already says.
- Mock arrays, `req.ip` and a controller-written `audit_logs` table: the functional
  ideas are already mapped, with their house-rule replacements, in spec 220.

**Noticed, not changed.** `cn()` drops a bare `outline` when `outline-2` follows it:
`cn('outline outline-2')` returns `outline-2`, which in Tailwind 3 draws nothing
(`outline-2` sets a width, `outline` sets the style). The merge library is
tailwind-merge 3, whose class groups follow Tailwind 4, where a width utility also
sets the style; this repo is on Tailwind 3.4. Nothing in the app combines the two
today, which is why it has not bitten; the choice cards use a ring, the house focus
style, and so avoid it. Worth its own look before anyone writes `outline outline-2`.

**Verification.** Web typecheck and lint pass, contrast passes in both themes, and
the new shared spec covers both themes at both worst-case backdrops.

**Scope lenses.** Specimens and one spec: reads and writes no row, no money, no
stock; no actor, permission or erasure lens applies. Reachable at
`/admin/design-system#patterns`.

### Addendum — 2026-10-01 (second): the eleven concept images, built as primitives, charts and specimens

**Requirement.** The owner shared eleven images (a bento board, skeleton screens, a
column manager over a dark data grid, an approval-routing canvas, a five-tier
"Modular ERP Journey Hierarchy" funnel, a "Regional Performance" comparison and a
3D "Department Budget Allocation" donut) and asked for each to be improved to the
most premium level and added to the design system. Each was taken apart into what
it is for, then rebuilt from this system's tokens. None of the images' colours,
radii or fonts were copied (Law 1).

**What was built.**

| Concept | Where it lives | What kind of thing it is |
|---|---|---|
| Bento board | `ui/bento.tsx`: `Bento`, `BentoTile` | primitive: a dashboard, a branch overview and a record home all want the same grid |
| Skeleton screens | `ui/skeleton.tsx`: `Skeleton`, `SkeletonText`, `SkeletonRegion`; `.skeleton` repainted in `globals.css` | primitive: every list and card has a first-load state |
| Toggle in the column manager | `ui/switch.tsx`: `Switch` | primitive: `role="switch"`, used by the manager and by any setting that applies now |
| Pinned first column | `DataTable stickyFirst` | opt-in prop on the existing table |
| Regional comparison | `admin/charts/period-comparison-chart.tsx`: `PeriodComparisonChart` | chart wrapper, inside the one folder `check-chart-imports.mjs` allows Recharts in |
| Department budget donut | `admin/charts/share-chart.tsx` upgraded in place | same component, same one consumer, same props |
| Column manager | `design-system/data-concepts.tsx` | specimen: one consumer so far, so written from primitives (rule of three) |
| Routing canvas, journey tiers | `design-system/flow-concepts.tsx` | specimens: each has one consumer |
| Bento and skeleton demos | `design-system/layout-loading.tsx` | specimens |

Shared by the charts: `chart-tooltip.tsx` (the one readout), `chart-math.ts` (the
change and share arithmetic, with `chart-math.spec.ts`: 19 cases), and
`use-reduced-motion.ts` (Recharts animates in JavaScript, which the stylesheet's
reduced-motion rule cannot reach). Two tokens were added to `chart-theme.ts`:
`CONTEXT` (`neutral-400`, the de-emphasis colour) and `HOVER_WASH`.

**Improved, not copied.**
- **The 3D donut became a flat one.** A tilted, extruded donut makes the near
  slices look larger than the far ones, so the picture misreports the number it is
  for. The premium treatment is spent where it helps reading: rounded slice ends, a
  gap between slices, the total as the hero figure in the centre (which becomes the
  chosen slice's value and share), and a legend that is also the keyboard path to a
  slice. Never more than five named slices and one "Other".
- **The previous period is a gray.** The comparison is "this one, against context",
  which is the emphasis form (one hue and a gray), not two categorical slots.
- **The skeleton was invisible on a white card.** The old `.skeleton` swept
  white, `neutral-50`, white, which is nothing on a `bg-surface` card. It is now a
  `neutral-100` base with a surface highlight, and it is only the first of four
  states in the specimen: empty and failed are designed beside it and never replaced
  by it.
- **Reordering is two buttons, not a drag handle.** A drag handle has no keyboard
  path without a library, and `dependencies.md` asks what a package does that the
  platform cannot. Move up and move down are keyboard-complete, 44 px on touch and
  announced in a `role="status"` line. A drag layer can come later as an
  enhancement over the same state.
- **The journey funnel uses the product's own five tiers**, not the image's
  invented ones: Global, Area, Destination, View, Object (`14-navigation.md`, "The
  shape"). What each tier leaves on screen follows `NAV-4`, `NAV-7`, `NAV-8` and
  Law 7, and that chapter now says so in one paragraph ("The chrome narrows with the
  job").

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Skeleton sweep | 1.6 s per pass, `ease-standard`, highlight `surface` at 70%, band 50% of the element's width, base `neutral-100` | one pass per 1.6 s is 0.6 Hz, far under the 3 flashes per second of WCAG 2.3.1; 70% is enough to read on `neutral-100` in both themes without a bright flash in dark | `.skeleton` in `globals.css`; the global reduced-motion rule freezes it after one frame |
| Switch | track 44 × 24 px, thumb 20 px, thumb travel 22 px (1.375 rem), row `min-h-touch` (44 px); off = `neutral-400` (3.34:1 light, 5.30:1 dark on surface), on = `bg-accent` (4.53:1 light, 4.02:1 dark on surface) | a control's state is held to the 3:1 floor for a mark; the 44 px row is the touch target | `ui/switch.tsx`; contrast by `check-contrast.mjs` |
| Period comparison bars | `maxBarSize` 24 px, 4 px rounded data-end, square base, `barGap` 2 px, hairline `neutral-100` grid, default height 240 px | dataviz marks spec: thin bars, a gap between a pair, quiet grid | `period-comparison-chart.tsx` |
| Donut geometry | 192 px square, outer radius 84, inner radius 66 (an 18 px ring, and a 132 px hole that fits "Rs 1,075,000" at 16 px), `paddingAngle` 2° (about 2.9 px at the outer edge), `cornerRadius` 4, others dimmed to 0.3 opacity when one is chosen, legend rows 44 px | a ring thin enough to read as a ring, a gap wide enough to read as a gap, rows that are a touch target | `share-chart.tsx`; at most 5 named slices + Other by `MAX_NAMED_SLICES`, tested |
| Bento grid | 16 px gap, rows `minmax(8rem, auto)`, 2 columns from `md` (768 px), 4 from `xl` (1280 px), tile padding 20 px | the shortest tile (eyebrow, one figure, one note line, two paddings) measures about 128 px; two columns is the narrowest a hero can span | `ui/bento.tsx` |
| Pinned column edge | 12 px (`w-3`) gradient from `scrim` at 5% | shows where the pin ends without a border and a shadow on the same edge (`ui.md`) | `data-table.tsx` |

**Palette audit: an owner decision, not changed here.** The dataviz validator was
run on the brand chart palette (`brand.ts`, `chart`) in both themes. It fails, on
reference surfaces `#fcfcfb` and `#1a1a19` (close to, not the same as, this repo's
`#ffffff` and `#171516`, so read the figures as indicative):

| Check | Light | Dark |
|---|---|---|
| Lightness band | pass | fail: five of six slots outside L 0.43 to 0.77 |
| Chroma floor | fail: four slots read as gray (`#0e8294`, `#4a6fa5`, `#8a5a44`, `#5f7a4f`) | fail: three slots (`#7c9bd0`, `#c08f77`, `#8fb07a`) |
| Colour-blind separation of neighbours | fail: `#5f7a4f` against `#8a5a44`, ΔE 2.9 (deutan) | fail: `#8fb07a` against `#c08f77`, ΔE 2.4 (deutan) |
| Normal-vision floor (hard gate, 15) | fail: same pair, ΔE 10.5 | fail: same pair, ΔE 10.9 |
| Contrast against the surface | pass | pass |

Swapping the last two slots (`[0, 1, 2, 3, 5, 4]`: teal, gold, blue, brown, purple,
green) clears colour-blind separation and the normal-vision floor in light (worst
neighbours ΔE 14.5 and 15.3) and the colour-blind check in dark, but dark still
sits at ΔE 14.6 against a floor of 15, and the chroma and dark lightness-band
failures remain. So the reorder is an improvement and not a fix.

The brand palette is a brand decision, so it was not touched. What it means for
what was built: `PeriodComparisonChart` uses only slot 0 and a gray, so it is not
affected. `ShareChart` can use up to six slots and relies on the secondary
encoding the validator accepts for the colour-blind check (a gap between slices,
a legend with the value and share beside every swatch, the centre readout), but
the normal-vision floor is "hard to tell apart even with full colour vision" and
secondary encoding does not excuse it. Three options for the owner: (a) reorder as
above, cheap and partial; (b) re-derive the six hues against the validator, which
changes the brand's look; (c) leave it, with the legend carrying identity as it
does today.

**Failure modes.** `ShareChart` given rows that are all zero shows the empty state
rather than a ring with no arc. `PeriodComparisonChart` cannot hide its last visible
series, because an empty chart is not a filter result. A previous value of zero is
worded "New", never an infinite percentage. Recharts' own animation honours
`prefers-reduced-motion` through `usePrefersReducedMotion`.

**Not adopted, and why.**
- The 3D, tilted donut, for the reason above, and a donut past six segments.
- A drag-and-drop column reorder library: see above.
- The images' blues, purples, gradients and glows, and their rounder corners: Law 1
  and the house shape.
- A "dark data grid" as a separate component: the grid is the same `DataTable`, and
  the theme makes it dark.
- Percentage numbers for "focus" on the journey funnel: the image's figures had no
  source, so the specimen shows tier position (1 of 5 to 5 of 5) and the layers
  present instead of an invented measure.

**Noticed, not changed.** The older charts (`comparison-chart.tsx`,
`category-bar-chart.tsx`, `time-series-chart.tsx`, `sparkline-chart.tsx`) wrap
their table twin inside a `role="img"` figure, which makes the table presentational
for assistive technology (an image's children are presentational). The new chart and
the upgraded donut put `role="img"` on the graphic only and the table beside it.
The older ones are left for a pass of their own.

**Verification.** `pnpm lint` passes (contrast, links, rules, boundaries, chart
imports), web typecheck passes, web unit tests pass (42, 19 of them new), and the
gallery was rendered at 280, 380, 640, 768, 1024, 1280 and 1536 px in both themes.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor is introduced; the specimens hold fixed demonstration
rows and the components render rows their caller already scoped.
Whose rows, and which columns: `data-concepts.tsx` and `layout-loading.tsx` hold
fixed demo rows; a real list passes the rows its endpoint already scoped.
Request or record: writes no row. The column manager's "Save view" moves local
state only. Saved column views per user need a table and an endpoint, which is its
own work order and is not stubbed here.
The movement with no address, the unwritten posting rule, every column or none,
the period that already moved, the second legal entity: n/a, no stock, cash or
journal fact is read or written.
The absent collaborator: every new piece degrades by props, not by module; a chart
with no rows renders `EmptyState`.
The second copy of the write: n/a, nothing is written.
The hundred-thousandth row: n/a, no query; `DataTable` stays a renderer, and its
pagination is the caller's.
The reversal document, the undo fan-out, the version stamp, the erasure the ledger
cannot obey, the failure path: n/a, nothing is written; the routing specimen's undo
row says a cancelled order reverses with its own document, as the real thing must.
Reachable: `/admin/design-system#layout`, `#data` and `#flows`, each with a link in
the page's section nav.

### Addendum — 2026-10-01 (third): eight chart forms, small multiples and a scoped profile board

**Requirement.** The owner shared a ten-widget dashboard reference, two mobile
"Sales Performance Comparison" screens (one chart per office on a shared scale, and
the same data overlaid) and a "Corporate Profile" board whose tiles each carry a
Read and a Write scope. With them came a mapping of eight chart forms to the shape
of data each is for, and the instruction "add all these too". The mapping is the
requirement: a chart is chosen by what the data is, not by what looks richest. The
reference's colours, gradients and glows were not copied (Law 1).

**What was built.** Every chart is in `components/admin/charts/`, the one folder
`check-chart-imports.mjs` lets Recharts into, and exported from its `index.ts`.

| Form | Component | Data shape it is for | Built on |
|---|---|---|---|
| Flow / funnel | `FunnelChart` | ordered stages, each a subset of the one before | plain SVG polygons in a 100-unit viewBox |
| Point-marked line | `PointLineChart` | one volatile series where each reading matters | Recharts line |
| Range / candlestick | `RangeChart` | lowest, average and highest per period | Recharts bar of `[min, max]` plus a ringed dot |
| Smooth multi-line, projected against actual | the existing `TimeSeriesChart` with two series | two to four series on one scale | unchanged; it needed nothing new |
| Radial gauge, concentric arcs | `GaugeChart` | one value against a fixed goal or limit | plain SVG arcs |
| Stacked area | `StackedAreaChart` | a total over time and its parts | Recharts stacked area |
| Calendar heatmap | `CalendarHeatmap` | one count per day | plain SVG grid |
| Radar | `RadarChart` | five to seven measures on one scale | Recharts radar, and grouped bars as its second view |
| Small multiples and overlay (the mobile screens) | `SmallMultiplesChart` | the same measure for two to five things | Recharts area and line |
| Scoped corporate profile board | `design-system/scoped-bento.tsx` | tiles with their own read and write scope | `Bento`, `BentoTile`, `Badge`, `Button` |

Shared by them: `chart-math.ts` (funnel steps, gauge state, heat calendar and
quartile cuts, month totals, `niceCeil`; the spec is 55 cases and the web package
now runs 78 tests, 36 of them added here), `chart-series.tsx` (`useSeriesVisibility`,
`SeriesToggles` and `ViewSwitch`, so the legend-is-the-filter rule is written once),
`chart-legend.tsx` (`ChartLegendRow`, also now used by the donut), and a `WARNING`
token in `chart-theme.ts`. `packages/shared` gained `formatMonthShort` and
`formatWeekdayShort` (3 tests) so no chart calls `toLocaleString` or `Intl` itself.
The gallery has a new section, `/admin/design-system#charts`, which opens with the
rule as a table (form, data shape, use it for, not for), then every form in both
themes. The scoped board is in `#layout`.

**Why no Chart.js, ApexCharts or Vue.** The reference text assumed Vue 3. This is
Next 15 and React 19 with Recharts already installed, and `dependencies.md` asks
what a package does that the platform cannot. Recharts has no funnel, gauge or
calendar form that meets the marks spec, so those three are plain SVG with no
dependency, and the rest use the library already here. No package was added.

**Improved, not copied.**
- **The radar has a second view.** Area and angle are the two encodings people
  judge worst, so "Shape" shows which axis is weak and "Compare" shows the same data
  as grouped bars on the same 0-to-max scale. Outside five to seven axes the radar is
  the wrong form and only the bars are offered.
- **The funnel's text sits beside its shapes, not inside them.** Text on a mark has
  to clear that mark's contrast in both themes, and a small last stage has no room.
  The stage that lost the most is named in words with an icon in the table, never by
  colour.
- **The gauge says which way is good.** `progress` means full is the goal ("Goal
  met"); `capacity` means full is a limit ("Filling up", then "Almost full"). A
  limit's state is a badge with an icon and words, in the legend and the table,
  and only then also the ring's amber or red. A value past its maximum keeps its true
  percentage (107% reads 107%).
- **The heatmap's steps are quartiles of the days that had activity**, not equal
  slices of the maximum, so one outlier day cannot flatten every other day into the
  palest step. A day with none is the neutral track.
- **Small multiples share one scale, and say so.** Side by side prints the same
  ceiling on every panel's axis and states it above them. Overlaid is the view for
  "where did they cross".
- **The profile board explains absence.** A tile the viewer cannot read is left out
  and the row closes over it (a neighbour widens to take its width); a tile they can
  read but not change keeps a disabled Edit with the permission written beside it
  (`PRM-2`, `PRM-5`); an "Your access" tile lists every tile and why.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Gauge geometry | 200-unit viewBox, outer radius 88, sweep 270° opening at the bottom, start 135°; strokes 10 px on a 16 px pitch for one or two rings, 8 px on 13 for three or four; at most 4 rings | a ring that is 270° reads "full" and "empty" at a glance; at 8 px on 13 the innermost ring leaves a centre about 90 px across, room for a figure and a label, and a fifth ring would not | `gauge-chart.tsx`, `MAX_GAUGE_RINGS` |
| Capacity thresholds | warning from 80% of the limit, critical from 95% | 80% is the usual "plan ahead" line and 95% is where one burst can use what is left. They are arguments of `gaugeState` and tested at the edges; the chart does not expose them as props yet, and a measure billed differently adds the prop when it needs it | `chart-math.ts`, `gaugeState` |
| Gauge arc motion | `stroke-dasharray` over 320 ms (`duration-slow`), `ease-standard`; none under reduced motion | it eases a change of value, so the ring never jumps; checked: the computed `transition-property` is `none` with `prefers-reduced-motion: reduce` | `motion-reduce:transition-none` |
| Heatmap cells | 14 px, 3 px gap, 52 weeks by default, Monday first, newest week at the end; steps at the 25th, 50th and 75th percentile of days with activity; level opacities 0.3, 0.55, 0.8, 1 over one hue | 52 weeks is about 910 px (881 px of cells and a 30 px weekday gutter), which fills a wide card and scrolls inside its own box on a phone, starting at the newest week; four tints plus the neutral track, because neighbouring steps already differ by only 1.2:1 to 1.7:1 in contrast (measured in both themes), so a sixth would run into its neighbour | `calendar-heatmap.tsx`, `quantileCuts` |
| Funnel rows | a 44 px shape per stage, 2 px between stages, from `sm` a name column of 4.5 to 7 rem and a figures column of at least 3.5 rem; below `sm` the name and figures sit above the shape | at 280 px the shape would get about 20 px between the two columns, so the columns become a line above it | `funnel-chart.tsx` |
| Point line | 2 px straight segments, 8 px circle markers, 13 px diamond for a reading above the level, 12 px peak label, dashed rule for the level | smoothing would invent values nobody measured; the diamond is the second channel, so "above" is never colour alone | `point-line-chart.tsx` |
| Range capsule | width capped at 14 px, 4 px rounded ends, average dot 8 px with a 2 px ring | thin marks; the ring keeps the dot visible where it sits on the capsule | `range-chart.tsx` |
| Radar | 5 to 7 axes, at most 3 series, outer radius 80% inside 56 px side margins, fill 12%, axis names cut at 8 characters; Compare bars capped at 24 px with a 4 px rounded top and a 2 px gap | on a 280 px card the polygon leaves about 58 px beside it and eight characters at 11 px is about 48 px; the full names are in the table | `radar-chart.tsx`, `MAX_AXIS_NAME` |
| Stacked area | at most 6 layers, a 2 px surface line between layers, layers solid, order fixed with the steadiest part at the bottom | a wash would let layers blend where they overlap the grid; only the bottom layer reads precisely against the baseline | `stacked-area-chart.tsx`, `MAX_STACKED_SERIES` |
| Small multiples | at most 5 things, panel charts 120 px high, overlay 260 px, panels `auto-fit` at a 16 rem minimum with a 16 px gap, one ceiling from `niceCeil` (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8 or 10 times a power of ten) printed at 0 and at the ceiling | a shared ceiling is what lets small charts be compared by eye, and it has to be round enough to read as an axis and tight enough not to leave half the plot empty | `small-multiples-chart.tsx`, `niceCeil` (tested) |
| Warning ink | `amber-600`: 3.19:1 on the light surface, 10.89:1 on the dark one | `brand.ts` has no warning feedback colour, so this is the step the Badge `warning` tone already uses; it clears the 3:1 floor for a mark, and it is never a series colour | `chart-theme.ts`, `WARNING` |

**Contrast, stated plainly.** The heatmap's two palest steps fall under the 3:1
floor for a mark: 1.49 and 2.18 on the light surface, 1.64 and 2.74 on the dark one
(its two darkest clear it: 3.25 and 4.53, then 4.43 and 6.28). That is the nature of
a sequential ramp, whose low end is pale, and a contrast warning obliges a visible
label or a table view rather than being dismissed, so: the line under the grid names
the figure for whichever day is pointed at or focused, every cell has an
`aria-label` with its date and count, and the table twin lists each month. Raising
the first step's opacity would help the palest day and shrink its difference from
"nothing". Left for the owner.

**Palette audit: still an owner decision, still not changed.** These charts draw on
the same brand chart palette that failed the validator in the second addendum.
`StackedAreaChart` can use six slots, `SmallMultiplesChart` five and `RadarChart`
three, so the normal-vision and colour-blind findings reach them. What carries
identity besides colour: the legend that is also the filter, the table twin, the
2 px surface line between stacked layers, and in the side-by-side view a name and
total above every panel, which is why it is the default. The overlaid view relies on
its legend and tooltip, and says so. The three options in the second addendum stand.

**Deviations from the usual rules, and why.**
- *Direct labels.* The overlaid view has no end-of-line labels: lines that end close
  together are the reason to overlay, and their labels would sit on top of each
  other. The side-by-side view is the directly labelled one.
- *Rule of three.* Each chart has one consumer, the gallery. They are components
  and not specimens because `charts/` is the only place Recharts may be imported
  and because a chart suite was asked for, not examples; a screen imports one from
  `@/components/admin/charts`. The scoped board is a specimen (one consumer).
- *`TimeSeriesChart`* keeps its older bordered tooltip and inline-styled legend
  for projected against actual; changing a shared chart needs every consumer
  checked, so it is left for its own pass.

**Failure modes.** Every chart renders `EmptyState` for no rows. A funnel needs two
stages (one is "the number is the chart"). A gauge with a limit of zero or less is an
empty ring in the `ok` state, not a division by zero. A heatmap treats a day missing
inside its window as no activity, which is true of a count and false of a gap in the
feed, so the caller passes the real window. Calendar days carry no zone and are
parsed and printed as UTC, so they cannot slide a day. A radar given fewer than five
or more than seven axes offers only bars. The last visible series cannot be
hidden, because an empty chart is not a filter result. A tooltip formatter is never
handed an empty label: Recharts renders the tooltip with one while nothing is pointed
at, and a date formatter throws on it (this crashed the page once, in the first
build of the small-multiples tooltip, and is guarded in `labelOf`).

**Not adopted.** Chart.js, ApexCharts and Vue (above); a 3D or glowing treatment of
any form; the reference's purple and peach palette; a donut past six segments; a
radar as the only view of a profile.

**Noticed, not changed.** The older charts still wrap their table twin inside a
`role="img"` figure (second addendum). Web typechecks `@newax/shared` from its built
`dist/`, so a change to a shared formatter needs `pnpm --filter @newax/shared build`
before the web app sees it.

**Verification.** `pnpm lint` passes (contrast baseline unchanged at 43 light and
39 dark known-below-floor uses, chart imports, rules, links), `pnpm typecheck`
passes, `pnpm test` passes for every package except the API (which needs a
database): web 78 tests, also run under `TZ=Pacific/Auckland` and
`TZ=America/Los_Angeles`, and shared 395. The gallery was built and rendered at
280, 380, 640, 768, 1024, 1280 and 1536 px in both themes with no horizontal
overflow at any of them, and 65 interaction checks were driven against the
production build with Playwright (funnel and table, point line, range, gauge hover,
focus and pin, stacked area restacking and the last-layer rule, heatmap arrow keys
and readout, radar Shape and Compare, small multiples, the board's three viewers
with the rows still filling the width, reduced motion). Those scripts are not in the
repository. `pnpm check:overflow` needs a seeded stack and was not run here.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor is introduced; the charts render rows their caller already
scoped. The board's "view as" switch is the specimen's own device, and a real screen
has one viewer.
Whose rows, and which columns: the charts hold fixed demonstration figures; a real
screen passes what its endpoint returned for the viewer. The board's scopes use
two real catalogue keys, `organization.view` (STAFF, ADMIN) to read the legal
identifiers and `settings.manage` (ADMIN) to write any tile, typed as
`PermissionKey` so a typo fails the build. No key was added.
The threshold nobody approves alone, the toxic pair, authority and blast radius: n/a
here, nothing is committed or changed. A real company-profile editor is separate
work and is named, not stubbed: a table for the profile, an endpoint, an audit row
carrying the old and new value, and a second signature on the tax and registration
numbers.
Audience is a capability, not an address: n/a, no message is sent.
Request or record, the movement with no address, four hours down: n/a, nothing is
written; the board's Save changes local state only.
The unwritten posting rule, every column or none, the period that already moved,
the second legal entity, dry run before live: n/a, no money fact is read or written.
Click the number: the funnel, gauge, range and heatmap each carry their own table,
and a screen that uses one links each figure to the rows that produced it, which is
the screen's job; no figure here has rows behind it.
Three silhouettes, the absent collaborator, the second copy of the write, the
hundred-thousandth row, the adoption test: n/a, no query, table, number series or
module is touched; a chart with no rows renders `EmptyState`.
The reversal document, the undo fan-out, the version stamp, the erasure the ledger
cannot obey, the failure path: n/a, nothing is written.
Reachable: `/admin/design-system#charts` and `#layout`, each with a link in the
page's section nav, and the rule and the chart list are in `03-components.md` and
`.claude/rules/ui.md`.

### Addendum — 2026-10-01 (fourth): six admin screens, read for what each one teaches

**Requirement.** The owner shared six screens and asked for their design concepts to
be added to the system, or the part already built improved, in this theme and in both
modes: a corporate profile board with a Read and a Write scope per tile, publishing a
profile to a chosen audience, a user list with an access drawer, a department page, a
page where DOM controls sit over a WebGL surface, and one-click invoice dispatch. A
screen is the unit here, not a widget: each one is built as a specimen from the
components that exist, in `/admin/design-system#screens` (and `#depth`, `#flows`,
`#layout`), with the states and refusals a picture of a screen leaves out. The
mockups' colours, fonts and Vue/Quasar-style code were not copied (Law 1, and this is
Next 15 and React 19).

**What was built.**

| Concept (screen) | Where | Built on |
|---|---|---|
| Segmented control (all six) | `ui/segmented.tsx`: `kind="filter"` (`aria-pressed`) or `kind="choice"` (`radiogroup`, arrow keys that skip disabled options) | promoted because it replaced two copies of one markup: `RangePicker` and the chart `ViewSwitch` now delegate to it; the gate, the mode switches and the grant length use it |
| Side sheet (user management drawer) | `Dialog align="end"`: full height against the inline-end edge, `w-full max-w-md` | the existing `Dialog`, so Escape, backdrop, labelled Close, focus trap and scroll lock come with it |
| People and access | `design-system/people-access.tsx`; rules in `access-draft.ts` | `PageHeader`, stacked `DataTable`, `Pagination`, `Dialog`, `ConfirmDialog`, `Segmented`, `ScopeChipEditor` |
| Publish and audience targeting | `publish-audience.tsx`; rules in `audience.ts`; `choice-cards.tsx` extracted from `patterns.tsx` | `Segmented`, `ChoiceCards`, `Switch`, `Button loading`, `ConfirmDialog`, `Skeleton` classes |
| Department page | `department-page.tsx`; rules in `department.ts` | `PageHeader`, `Disclosure`, `DataTable`, `ConfirmDialog`, `Segmented`, `Switch` |
| DOM over a surface (layering) | `layering.tsx`: stage at `z-base`, annotation layer at `z-raised` | `FROSTED`, `Switch`, `DataTable`, the named `layers` tokens |
| One-click dispatch | `dispatch-flow.tsx`; the moves between states in `dispatch-machine.ts` | `Badge`, `Button`, `Segmented`, `Disclosure` |
| Corporate profile board, improved | `scoped-bento.tsx`: an identity lead (logo, or a monogram when there is none, with an Active badge), an address tile with an honest "No map preview" slot, and a closed "Grid map" disclosure | `Bento`, `BentoTile`, `Disclosure`, `next/image` on `BRAND.assets.logoRaster` |
| A nested page's heading | `PageHeader headingLevel` (`h1` to `h4`, `h1` by default) | so a screen shown inside the gallery does not add a second `h1` |

Four pure modules carry every rule a screen enforces, so the rule can be tested
without a browser and a real screen imports it unchanged: `access-draft.ts` (24
tests), `audience.ts` (15), `department.ts` (24), `dispatch-machine.ts` (19). That is
82 new tests; the web package runs 160. `ScopeChipEditor` has one consumer (the
access sheet) and `ChoiceCards` two (the older patterns page and publishing), so
neither is in `ui/`: the third consumer promotes it (`design.md`, the rule of three).
No dependency was added.

**Improved, not copied.**
- **Access cannot be made to last forever.** "Temporary access" cannot be switched
  on without an end, which is what the schema already says (`OrgUnitGrant.expiresAt`
  is `DateTime`, not nullable). It needs a reason that goes to the audit log, and an
  acting grant needs a countersigner who outranks the recipient. Refusals use the
  server's own sentences (`org-unit-grant.service.ts`: "A grant cannot run longer than
  N days from now." and "An ACTING grant needs a countersignature from someone who
  outranks the recipient.") so the screen and the API cannot disagree. The 30-day
  preset is shown disabled with the limit written beside it, not hidden (`PRM-2`).
- **You cannot edit your own access.** Your row opens with every control disabled and
  the reason written (a person who can grant and use the same access is the toxic
  pair). A person with no branch has no branch, never every branch.
- **A dirty sheet asks before it closes**, by Escape, backdrop or Cancel, with
  "Keep editing" as the first choice. A change is shown as what it adds and what it
  removes ("+ Karachi", "− Lahore") before Save, not as a list of field names.
- **Audience only exists for Public.** An unlisted link with an audience is a
  contradiction, so choosing Unlisted or Internal closes the audience steps (`PRM-5`).
  Going Public asks first and names how many partner accounts can find it, and says
  what unpublishing cannot do: a search engine's copy can take days to clear.
- **The count is advice, not a gate.** It recounts after a pause and shows
  "Counting" immediately. When it fails the screen says so and Publish stays
  available; when the filters match nobody Publish is refused with the reason and the
  fix. Zero is reachable on purpose (`Site audited` is a 1% share).
- **A department's head is a post, not a column.** `OrgUnit` has no head-user and no
  cost-centre column, so the page shows the head as the holder of a post with a link
  to People, and "works in" as the nearest office up the tree, so it cannot disagree
  with the org chart. A closed unit cannot be a parent, and closing lists every
  blocker (open units, positions) with the screen that fixes each, in the server's
  words. "Active" is a badge that follows from the state, not a toggle.
- **The overlay is glass.** The wrapper is `pointer-events-none` and each control on
  it opts back in with `pointer-events-auto`, so empty overlay passes a click to the
  stage and a button on it is still a button. Focus follows source order, not z-order,
  and the stage works by keyboard on its own.
- **The send says only what it knows.** The badge goes Draft, Sending, Sent or
  Failed, never "Dispatched" or "Delivered", because nothing here can know a
  partner's inbox has it. Send answers in the same frame and becomes Undo for a
  window in which nothing has left. A bounce offers Correct the email and no Retry
  (it would bounce again); an outage offers Retry, which carries the same
  idempotency key so a half-worked first attempt cannot become two emails.
- **The profile board stays honest about what it has.** A drawn map thumbnail would be
  a picture of data the profile does not hold, so the address tile carries a slot that
  says "No map preview". The mockup's grid mapping is a closed disclosure showing, for
  the viewer, how many of the four blocks they read and write, and what was left out.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| Undo window | 5 000 ms | long enough to read the partner's name on the confirmation line and catch a wrong one, short enough that a waiting customer is not made to wait. The design for the real send is the outbox row's own delay: write it with `OutboxEvent.availableAt` that far ahead (`outbox.dispatcher.ts` already selects only rows with `"availableAt" <= NOW()`), so Undo cancels a row nothing has picked up and closing the tab inside the window does not cancel the send. Nothing here writes that row | `dispatch-machine.ts`, `UNDO_WINDOW_MS`, pinned by its spec |
| Undo clock | ticks every 250 ms, 5 pips (one per second), the counter rounds up | a quarter second keeps the pips from visibly lagging a click, and rounding up means the label never reads 0 s while Undo still works | `dispatch-flow.tsx`, `TICK_MS`, `PIPS` |
| Mail-service answer, specimen only | 1 400 ms | stands in for real latency so the Sending state is visible; the real wait is whatever the mail service takes | `dispatch-flow.tsx`, `HANDOFF_MS` |
| Audience count pause | 400 ms after the last change | one slider drag crosses many 10 km steps and should cost one count, and under half a second still feels live | `publish-audience.tsx`, `COUNT_DELAY_MS` |
| Publish, specimen only | 700 ms | makes the busy button visible; the real wait is the request | `publish-audience.tsx`, `PUBLISH_DELAY_MS` |
| Audience pool and radius | 4 800 partner accounts, 10 to 500 km in steps of 10, 150 km to start | illustrative figures; 500 km spans the whole network of a country-sized deployment and 10 km is the smallest meaningful catchment | `audience.ts` |
| Longest temporary grant | 14 days in the specimen; the real limit is a setting (`getOrgAccessMaxGrantDays`) | the screen's text says "set in Settings" because it is; 14 is only the specimen's stand-in | `access-draft.ts`, `MAX_GRANT_DAYS`, pinned by its spec |
| Grant length presets | 1 day, 1 week, 30 days, 1 week to start | the three lengths people actually mean; the third is disabled past the maximum so the limit is visible | `access-draft.ts`, `GRANT_PRESETS` |
| Access that ends soon | warning tone under 1 hour | the existing "Access that ends" pattern turns to warning at the same line | `access-draft.ts`, `endsSoon` |
| List page size, specimen | 4 rows over 12 people | small enough that pagination shows; a real list sizes this to its own endpoint | `people-access.tsx`, `PAGE_SIZE` |
| Sheet width | 448 px (`max-w-md`), full width below that | three short sections fit without sideways scroll at 280 px, and above that the list stays visible beside it | `dialog.tsx`, `align="end"` |
| Sheet motion | `slideInRight`, 320 ms (`duration-slow`), an 8 px travel, none under reduced motion | it says where the sheet came from; measured under `prefers-reduced-motion: reduce` the computed animation duration is 0.00001 s | the shared reduced-motion rule |
| Stacking | stage `z-base` (0), overlay `z-raised` (1), nothing above `z-raised-3`; the stage is wrapped in `isolate` | a stack that needs a fourth step has a structure problem, and `isolate` stops it leaking above the sticky header or below a modal | `brand.ts` `layers`; `layering.tsx` |
| Touch targets | Close, chip remove and the radio presets are 44 px below `fold` | a finger is the pointer there (`design.md`) | `min-h-11` and `h-11 w-11` with `fold:` overrides |

**Failure modes.**
- *A second copy of an event.* A double click on Send, a late timer, and a late
  delivery in the wrong state are no-ops: `dispatchReducer` returns the same state
  object for any move the state does not accept (19 tests, including that `sent` is
  final).
- *The count fails.* A warning in place of the figure, Publish still available.
- *Publishing while counting.* The button is disabled with the reason beside it, never
  hidden.
- *Focus lost to a button that is gone.* Found by driving the sheet with a keyboard:
  after Revoke the confirmation handed focus back to a button that no longer existed,
  so Escape stopped working because focus was on the page behind the sheet. The sheet
  now moves focus to the grant checkbox when a live grant ends. The chip editor does
  the same for its select after a removal, including when the select did not exist
  until that removal made room for it.
- *The same sentence twice.* The footer already announces why Save is off, so the
  inline refusal beside the field is not a second live region.
- *Nothing to send to.* An empty or malformed email disables Send and says the form
  to use. Failure copy always says what happened, why and the one next step, and the
  next step is never "try again later".

**Not adopted.** Vue, Pinia, Quasar and a ticker or timer library (this is React with
a reducer); Three.js or any WebGL (the transferable idea is the pass-through rule); the
mockups' colours, fonts and shadows; a drawn map thumbnail; a cost-centre lookup and
a head-user column (neither exists on `OrgUnit`); an Active toggle on a department; any
"Dispatched" or "Delivered" claim; literal z-index numbers.

**Noticed, not changed.**
- `brand.ts` has no distance unit, so the specimen holds `DISTANCE_UNIT = 'km'` itself.
  A deployment that uses miles needs a place for it, which is a token decision.
- `slideInRight` is a physical `translateX(8px)`. In a right-to-left locale the sheet
  sits against the left edge and still travels from the right by 8 px. It is harmless
  and physical, so it belongs in a logical-direction pass with the other keyframes.
- `Dialog` handles Escape on its own panel, so when focus is lost to the page behind a
  modal Escape does nothing. The sheet was fixed locally; a document-level listener in
  `Dialog` would change every consumer and is left for its own pass.
- `Pagination` was written for server pages and at 280 px wraps its centre text to two
  lines; no text is lost, so it was left alone.
- The profile board's "Your access" tile has spare room under its rows when it sits
  beside the taller address tile.
- There is no send-invoice endpoint. `admin/invoices` creates and reads under
  `orders.manage`. A real one is its own work order (a route the server checks, a
  decision whether `orders.manage` is enough or a key of its own, and an outbox
  handler that sends the mail), named here and not stubbed.

**Verification.** `pnpm lint` passes (contrast baseline unchanged at 43 light and 39
dark known-below-floor uses, module boundaries, chart imports, rebrand, links, rules),
`pnpm typecheck` passes, and `pnpm test` passes for every package except the API (which
needs a database): web 160 tests (78 before, 82 added). The four counts in `CLAUDE.md`
hold: inline `style={{` 26, `toLocaleString` 6, bare fetch 6, gray palette 0. The
gallery was built for production and driven with Playwright: 95 interaction checks
passed with no console error (sheet open and close three ways, focus return, discard
guard, branch chips and focus, the disabled preset and arrow keys skipping it, acting
refusals and countersigners, revoke through a second dialog, the count pause and its
failure, the Public confirmation, live versus draft, the staff view, department
validation, the code suggestion, the closed-parent option, close blockers and the empty
path, `elementFromPoint` pass-through, the layer outline, undo, success, bounce,
outage with the same key, the board's viewers, and reduced motion). A sweep of 7
widths (280, 380, 640, 768, 1024, 1280, 1536) in both themes found no horizontal
overflow and no clipped text in the four sections, with the sheet and its confirmation
open at each width (14 of 14 combinations). Those scripts are not in the repository.
`pnpm check:overflow` needs a seeded stack and was not run here. Two things the
screenshots caught that no command would have: the layers table clipped its last
column inside a narrow column (it now spans the width), and the outline tag covered the
"12 zones" label.

**Scope lenses.**
The actor with three tables: no new actor. The person is a `User` and a countersigner
is a `User`; a partner in the audience is a `TradingPartner`. The specimens hold
illustrative people and counts, not rows of either.
The principal with no permission key: every control is checked server-side against a
real key, shown disabled with its name in the reason (`PRM-2`): `users.manage` to open
the list, `org.access.grant` for temporary access, `org.structure.view` and
`org.structure.manage` for the department page, `settings.manage` to publish. All five
are in the catalogue (`docs/index/cross/permissions.md`) and ADMIN holds each; none was
added, so there is no `Permission` row without a grant.
The grant that ends itself: `OrgUnitGrant.expiresAt` is not nullable and the sheet
cannot issue a grant without it, with `endsSoon` warning under an hour. What deactivating
a user does to a live grant is not touched here.
Whose rows, and which columns: the list shows the branches a person can reach and the
board shows a viewer only the tiles they can read (`Grid map`); a real list passes what
its endpoint returned for the viewer.
The threshold nobody approves alone, the toxic pair: an acting grant needs a
countersigner who outranks the recipient (`countersignCandidates`), and your own access
cannot be changed by you (`saveBlocker`). The server enforces both, and the screen
shows its words.
Authority and blast radius: the longest grant is a setting, and the audit row carrying
the old and new value is the real screen's job, named in the sheet's reason field.
Audience is a capability, not an address: the invoice is sent to the partner's billing
email, a field of the invoice screen, not a literal; no announcement is sent from here.
Request or record: every write here is a REQUEST the system may refuse (grant, publish,
create, close, send), and each shows its refusal. None is a RECORD of something that
already happened; a delivery receipt would be one, and nothing here writes it.
The movement with no address, four hours down, the money lenses (posting rule,
columns, period, second legal entity, dry run): n/a, no stock, cash or journal line is
read or written; the invoice screen sends mail and posts nothing, because issuing is
the separate `invoice.issued` event.
Click the number: the audience count links to the list that produced it in a real
screen; the specimen's link goes to the section because no list exists.
The three silhouettes, the absent collaborator: a Solo deployment sees the same
screens with one branch; a pack that adds departments or trading partners is absent
without breaking the list, because each link is a `ROUTES` entry and not an import.
The second copy of the write: the idempotency key `invoice-id:send:intent`, with the
column and unique constraint belonging to the real endpoint.
The hundred-thousandth row: n/a, no query is made; a real people list pages on the
server through `Pagination` and its endpoint's own limit.
The adoption test: no number or code is generated here except the department code,
which is suggested from the name and checked against taken codes before Save.
The reversal document, the undo fan-out: Undo cancels an outbox row that has not been
picked up; after the window the send is irreversible and the screen says "Sending",
never "Delivered". Revoking a grant ends it now and says what it cannot undo.
The version stamp, the erasure the ledger cannot obey: n/a, no record is created.
The failure path: a bounce lands in Failed with its reason and a Correct action; an
outage lands in Failed with Retry; the real screen adds the outbox row's failed state
and the permission that opens it.
Reachable: `/admin/design-system#screens`, `#depth`, `#flows` and `#layout`, each with
a link in the page's section nav, and the new rows are in `03-components.md` and
`.claude/rules/ui.md`.

### Addendum — 2026-10-01 (fifth): the motion of a reference reel, as one language across every surface

**Requirement.** The owner supplied a short reel and asked for its motion graphics,
for buttons, cards, text fields and everything else, to be extracted and
implemented in all cards, buttons, boxes, popups, notifications, errors and
containers, on every page and sub-page of the design system. The reel was read frame
by frame (fourteen motions) for what each one tells the reader, not for how it looks;
its palette, type, hexagon and particles were not copied, and its entrances (about
600 ms) are a film, not a component. The result is two tiers: a **functional**
vocabulary on by default through the shared classes and primitives, and an
**expressive** tier that is opt-in and bounded. The long form, with the reel-to-meaning
table, is `docs/design/motion/05-motion.md`.

**What was built.**

| Concept | Where | Built on |
|---|---|---|
| Press and release | `.btn`, `.chip`, `.icon-btn`, `Segmented`, `.lift` (which returns to rest) in `globals.css` | tokens only; one rule per class because `@apply btn` rewrites `.btn` selectors one rule at a time |
| Arrive and leave | `animate-arrive` / `animate-leave` on cards, dialogs, popovers, notices (`role="alert"` or `"status"`) and toasts | the keyframes in `globals.css`, the animations in `tailwind.config.ts` |
| Error nudge | `.field-input`, `.field-flat`, `.field-inline` with `aria-invalid="true"`; `.notice-error[role="alert"]` after it has arrived | the attribute is the contract, so a screen reader hears it too |
| Focus ease | the focus ring on fields now eases with the border, on one curve | `box-shadow` added to the field's transition list |
| Loading ring | `.spinner`, `Button loading`, `Loading` | one revolution is two `sweep` steps |
| Page enter | `ui/page-enter.tsx` in the admin and storefront layouts | keyed on the pathname, not the segment, so a filter in the URL does not replay it |
| Stagger and reveal on scroll | `.stagger`, `ui/reveal-scope.tsx`, `lib/reveal.ts`; `Bento` is a scope | one `IntersectionObserver` per scope, never per tile |
| Tab glide | `Tabs`: one `.tab-indicator` that glides to the selected tab (`Segmented` gets the press and the eased fill, not the glide) | transform only (`translate` and `scaleX` of a one-pixel bar) |
| Side sheet | `Dialog align="end"`, the storefront mobile nav and filter panel | `.sheet-in` / `.sheet-out`, direction flips in a right-to-left document |
| Toast with a draining line | `toast-stack.tsx`, `hooks/use-toast.ts` | a `.toast-timer` line of `scaleX`, and an exit before removal |
| Count-up, progress ring | `ui/count-up.tsx`, `ui/progress-ring.tsx`; `CountUp` on the four P&L figures, `ProgressRing` on the dispatch specimen's undo window | pure maths in `lib/motion.ts` (`countUpValue`, `ringStroke`) |
| Lock-on brackets | `.focus-frame` in `globals.css`; used on the choice cards in the flow specimens | one pseudo-element carrying eight gradient bars |
| Scramble decode, typewriter | `ui/text-motion.tsx`: `ScrambleText` on the order number of a just-placed order; `TypeText` is built and specimen-only, with no product consumer yet | `scrambleFrame`, `typedFrame` in `lib/motion.ts` |
| Chart draw-on | the three chart files in `components/admin/charts` | now read `usePrefersReducedMotion`, which the old chart-local hook became a shim for |

A new gallery section, `/admin/design-system#motion` (`design-system/motion-specimens.tsx`),
shows every row above live, with the reel's name for it beside ours. The maths
lives in `lib/motion.ts` as pure functions, so it can be tested without a browser:
`lib/motion.spec.ts` has 21 tests. No dependency was added.

**Improved, not copied.**
- **No blur.** The reel's zoom-blur was measured and left out: a blur filter forces a
  paint of the whole element every frame, and a blurred label is below the contrast
  floor for the frames it is blurred (`MOT-5`, `COL-3`). The `blur` token group that
  was added to carry it was removed once it had no consumer.
- **Nothing overshoots.** The reel's curve is a strong ease-out, which became
  `settle`; `emphasized` (y2 = 1.2) overshoots and no business control uses it.
- **Siblings are not dimmed.** The reel dims everything but the focused element;
  dimming a neighbour's text drops it under the contrast floor in both themes.
- **Reduced motion is three layers, not one.** The stylesheet rule now also reaches
  pseudo-elements and zeroes delays (a staggered entrance keeps `both` fill, so a
  surviving 320 ms delay would hold the element at opacity 0: it would be missing, not
  jumping); JavaScript-driven motion (charts, `CountUp`, scramble, type, reveal,
  toast and dialog exit waits, and the storefront's Lenis scroller) asks
  `usePrefersReducedMotion` first; and information is carried twice (an `sr-only`
  copy, `role="progressbar"`, `aria-invalid`, the words "Working…" and "Loading…").
- **Every exit is the entrance's twin.** A dialog, toast and sheet used to vanish; each
  now plays `leave` for exactly `fast` and is removed after, through
  `useExitTransition`. Under reduced motion the hook returns `leaving: false` and the
  node unmounts at once, which also fixed a race found while testing.
- **Settled state first.** Server markup is always the visible one. `[data-reveal]`
  hides an element only after the script has run, and `@media print` shows every
  element, so a printed page has no holes.

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| `settle` easing | `cubic-bezier(0.16, 1, 0.3, 1)` | measured off the reel: 60% of the distance by 100 ms and within 1 px of rest by 600 ms; never overshoots (a test samples 100 points) | `brand.ts` `motion.easing.settle`; `lib/motion.spec.ts` |
| Press | `translateY(2px)` and `scale(0.98)`; down in 80 ms (`instant`), back in 140 ms (`fast`) | the click is acknowledged inside one frame (`ACT-3`); 98% of a 44 px button is under 1 px, enough to feel and too small to move the text | `globals.css` `.btn:active`, `.chip`, `.icon-btn` |
| Card press | back to rest, no scale | 2% of a 400 px card is 8 px, so a card's press is its lift reversing | `.lift:active` |
| Arrive | 220 ms (`normal`), 8 px (`distance.small`), `scale` 0.97 to 1, `backwards` fill | long enough to see, short enough that a toast is readable at once; `backwards` so the final frame has no transform (a transform on a wrapper breaks `position: fixed` descendants while it runs) | `@keyframes arrive`; `scale.arrive` |
| Leave | 140 ms (`fast`), `exit` easing, to `scale` 0.97, `forwards` fill | an exit is quicker than its entrance; it is how long the node stays mounted | `@keyframes leave`; `MOTION_MS.exit` |
| Nudge | 4 px (`distance.nudge`), 320 ms (`slow`), once, 0, -4, +4, -2, +1, 0 | big enough to read as "no", ends where it began so it cannot leave the field offset | `@keyframes nudge` |
| Stagger | 80 ms per step, capped at 4 steps (320 ms, never more than `slow`) | a list of 200 rows must not animate; a test pins the total at or under `slow` | `brand.ts` `motion.stagger`; `staggerDelayMs` |
| Side sheet | 64 px (`distance.large`) and a fade, 320 ms in, 140 ms out | reads as coming from the edge without crossing the viewport; replaces the 8 px `slideInRight` | `.sheet-in`, `.sheet-out` |
| Loading ring | 840 ms per turn (2 x `sweep`) | slower than 600 ms reads as a ring, faster as a flicker | `.spinner` |
| Toast | 4 000 ms default (unchanged), exit 140 ms, timer line 2 px, `duration: 0` has no line | the default is the old one; the line counts down data, so its duration is the one inline `style` this work adds | `use-toast.ts`; `.toast-timer`; `toast-stack.tsx` |
| Tab glide | 220 ms (`normal`), `settle` | one element moving reads as "the selection moved" | `.tab-indicator` |
| Count-up | 420 ms (`sweep`) | a page-level figure resolving takes the longest step; capped at `sweep` so a dashboard is never the thing the user waits for | `MOTION_MS.count`; `countUpValue` |
| Scramble decode | 320 ms, noise every 40 ms, 80 characters at most | a label is short; 25 changes a second is a shimmer, not a strobe; longer text just appears | `text-motion.tsx` (`NOISE_TICK_MS`, `MAX_ANIMATED_CHARS`) |
| Typewriter | 320 ms in total, 80 characters at most | the total is fixed, not per character, so a long line is not slow | `text-motion.tsx` |
| Progress ring draw-on | 320 ms | a ring is small; `sweep` would outlast the figure inside it | `progress-ring.tsx` |
| Reveal on scroll | `rootMargin: 0px 0px -8% 0px`, `threshold: 0.01` | a tile arrives just before the reader reaches it, and one pixel counts as seen | `lib/reveal.ts` |
| Lock-on brackets | arms 14 px, bars 2 px, 4 px outside the box, `scale` 1.06 to 1 | an arm of 14 px is visible on a 44 px control and never longer than the box's own edge | `.focus-frame` |

**Failure modes.**
- *Scripting off or slow.* Server markup is the settled state; nothing is hidden until
  the script has run, so the page is complete without it.
- *Reduced motion.* Every duration collapses to a frame and every delay to zero, JS
  motion is skipped, and each piece of information the motion carried is also stated
  in words or an attribute.
- *A transform on a wrapper.* It re-parents `position: fixed` children while it runs,
  which is why arrivals use `backwards` fill and the page-enter wrapper has no
  `forwards` fill.
- *An exit that never finishes.* Removal is a timer for `fast`, not an
  `animationend` listener, so a node cannot be left mounted by an event that did not
  fire.
- *A tab strip that has not measured.* The indicator stays hidden and the selected
  tab keeps its own underline, so the strip is right before and without scripting.
- *Right-to-left.* The sheet direction, the toast line and the lock-on use logical
  properties or a sign variable; the tab indicator is physical because it is measured
  from `offsetLeft`, and says so in its comment.

**Not adopted.** Zoom-blur, floating particles and ambient arcs (`Law 6`), the hexagon
with a leader line, dimmed siblings, the reel's 600 ms durations, a scroll-hijacking
library for page changes, WebGL, springs on a business control, and any bounce.

**Noticed, not changed.**
- Dead CSS in `globals.css` and `tailwind.config.ts` (`chart-line` / `drawLine`,
  `shimmer`, an unused `250` duration); deleting it needs the owner's confirmation.
- `emphasized` still overshoots and has no consumer; `distance.medium`, the `spring`
  group and the `framer-motion` dependency have none either.
- `components/admin/charts/use-reduced-motion.ts` is now a one-line shim over
  `hooks/use-prefers-reduced-motion.ts`; removing it is a deletion.
- `components/common/toast-container.tsx` has no consumer.
- The storefront's `SmoothScroller` hijacks the wheel with Lenis. It now stays off
  under reduced motion, but whether it should exist is the owner's decision.
- The admin drawer uses a physical `left-0` and the comment at the top of
  `tailwind.config.ts` still says the POS has its own copy; neither was touched.
- Mobile (`apps/mobile`, reanimated) and the POS do not use these tokens yet.
- ADR-083's fourth addendum rows "Sheet motion" (an 8 px `slideInRight`) and "Undo
  clock" (5 pips) are superseded: the sheet now travels 64 px (`.sheet-in`), and the
  dispatch specimen's pips became a `ProgressRing` while the 250 ms tick and the 5 000 ms
  window are unchanged.

**Verification.** Rebuilt for production and driven with Playwright against
`/admin/design-system`: 69 motion checks passed (press and release by computed
transform, arrive and leave timing, the nudge replaying on a false-to-true change, the
focus ease, the toast line draining over its own duration, the tab indicator gliding,
count-up landing exactly on its target, scramble ending on the real text, the type
total, the ring, reveal on scroll, page enter, `useExitTransition` under both
preferences, no property other than transform and opacity animated, and reduced
motion at zero duration with no element left hidden), and the earlier 95 screen
checks still passed, with no console error. A sweep of 7 widths (280, 380, 640, 768,
1024, 1280, 1536) in both themes found no horizontal overflow and no clipped text
(14 of 14 combinations). Those scripts are not in the repository. The storefront
drawers, the P&L page and the order page need a running API, so they were checked by
typecheck, lint and the production build only, not in a browser. `pnpm check:overflow`
needs a seeded stack and was not run. The four counts in `CLAUDE.md`: inline
`style={{` 27 (26 before, plus the toast timer's data-driven duration), `toLocaleString`
6, bare fetch 6, gray palette 0. The command results for this change are in the
reply that delivered it.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor, principal or grant is created; motion changes no
authority.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, nothing is read, committed or sent; no
`PERMISSION_CATALOG` key was added, so there is no `Permission` row without a grant.
Request or record: the toast's `leaving` and every reveal are presentation state, not
writes; nothing here is a REQUEST or a RECORD of a business fact.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash
or journal line is read or written.
The three silhouettes and the absent collaborator: a Solo deployment gets the same
motion; a deployment with no admin module simply never renders `PageEnter` there, and
the tokens live in `brand.ts`, which every surface imports.
The second copy of the write, the hundred-thousandth row: a list of any length
animates at most four stagger steps (`staggerDelayMs`), and one observer serves a whole
scope, so a 100 000-row table is not 100 000 animations.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, code, document or personal datum is
created.
The failure path: a toast that cannot animate is removed by a timer, a reveal that
cannot observe shows its element, and reduced motion keeps the information.
Reachable: `/admin/design-system#motion`, linked from the page's section nav, and the
vocabulary is on every page that uses `.btn`, `.field-input`, `.notice`, `Dialog`,
`Tabs`, `Segmented`, `MetricStrip`, `Bento` and `ToastStack` without an opt-in. The
new primitives are in `.claude/rules/ui.md`, and the tokens and laws in
`05-motion.md`, `01-foundations.md` and `10-laws.md`.

### Addendum — 2026-10-01 (sixth): seven further reels, every motion that fits the language

**Requirement.** The owner supplied seven more reels and asked that none of their
motion be missed. Each was read motion by motion for what it tells the reader, and the
seven catalogues were merged against what the fifth addendum already ships. Most rows
were already covered (arrive, stagger, the text decode and type, the loading ring,
press, count-up, ring draw-on, reveal on scroll). Twelve motions were new and fit the
caps, and are built; the rest are not adopted, with reasons. The long form, with the
motion-to-meaning table and how each is built, is the "seven further reels" section of
`docs/design/motion/05-motion.md`; the specimens are in
`/admin/design-system#motion` ("Quantities and changes", "Hand-offs and reveals").

**What was built.**

| Concept | Where | Built on |
|---|---|---|
| Sheen on a changed value | `.sheen` + `data-fresh`; `hooks/use-fresh-on-change.ts`; the dashboard `MetricCard` (a range switch refetches in place) and a new row in `LiveFeedWidget` | one gradient on a pseudo-element, transform only; `data-fresh` cleared after `sweep`; never on first render or on arrival |
| Label swap | `ui/swap-text.tsx`; `StatusBadge` | `nextSwap` (pure, tested); the leaving copy is `aria-hidden` and unmounts after `fast` |
| Progress bar | `ui/progress-bar.tsx` (`tone`, `head`, `segmented`); the Reports ranking and the Stitching tailor load replace two hand-rolled `width: X%` bars | a translate fill reading `--p`; `progressFraction` (pure, tested) |
| Truncate reveal | `ui/truncate-reveal.tsx`; Reports labels, Stitching tailor names | `revealRun` (pure, tested); `speed.read` token |
| Wizard direction | `components/common/wizard.tsx` | `.step-forward` / `.step-back` on a step keyed by its id |
| Popup from its trigger | `ui/dialog.tsx` | `originOffset` (pure, tested), read in a layout effect; `.arrive-from` |
| Error ignite | `.ignite`, `.notice-error[role=alert]`, the error toast | a 2px inset ring on a pseudo-element, opacity only |
| Badge pop | `.pop`; the cart count (keyed by the count) | `scale.pop` token |
| Chart motion | `components/admin/charts/chart-motion.ts` and every chart | tokenised draw-on, series stagger, tooltip glide, cursor, active dot, marker pop, donut halo; 23 tests |
| Icon draw-on | `ui/draw-icon.tsx`; the tick on verify-email and unsubscribe | `.draw-path` with `pathLength="1"`, marked on the client |
| Odometer | `CountUp mode="reel"`; net profit on the P&L page | `.reel-digit` / `.reel-strip`; `reelParts` (pure, tested) |
| Word reveal | `TypeText unit="word"` | `typedWordsFrame` (pure, tested) |
| Literal timings | 44 `duration-200/300/700` and `ease-out` classes in 18 files | `duration-normal/slow/sweep`, `ease-decelerate`; no behaviour change except where noted below |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced |
|---|---|---|---|
| `scale.pop` | 0.6 | a chart point or a count badge is about 8 to 20 px, so 97% of it (`arrive`) moves under half a pixel and reads as nothing; 60% is visible and still lands inside `fast` | `brand.ts`; `theme-space.spec.ts` (above 0, below `arrive`) |
| `speed.read` | 48 px/s | the two reels that scrolled text ran at 23 and 80; 48 is between, and a 240 px overflow is one pass of five seconds | `brand.ts`; `theme-space.spec.ts` (20 to 100); `revealRun` |
| Truncate reveal duration | overflow / 48 s, floor 140 ms (`fast`), ceiling 5 000 ms, after a 220 ms beat (`normal`), `linear` | a line being read must move at a steady rate; under 140 ms a few pixels would jerk; past five seconds the reader has read it or left (a long line goes faster, not longer) | `REVEAL_MAX_MS`, `revealRun`; `.reveal-run` |
| Truncate reveal threshold | 1 px of overflow | under a pixel is rounding, not truncation | `revealRun` |
| Sheen | 420 ms (`sweep`), `decelerate`, 105 degrees, 40/50/60% stops, accent ink at 14%, once | one pass long enough to follow and short enough to be over before the reader looks away; 14% of the accent ink clears nothing it should not and reads in both themes | `.sheen[data-fresh]::after`; `MOTION_MS.sheen` |
| Ignite | 2 px inset ring, negative colour, opacity 1 to 0 over 320 ms (`slow`), `settle` | the ring is the information, so it is as thick as a focus ring's step and inset so a clipping toast cannot cut it off | `.ignite::after` |
| Swap | out 140 ms (`fast`) `exit` over 4 px; in 220 ms (`normal`) `settle` from 4 px | leaving is quicker than arriving; `distance.nudge` is the smallest travel that reads | `.swap-in`, `.swap-out`; `MOTION_MS.exit` |
| Pop | 140 ms (`fast`), `settle`, `backwards` | a mark this small is done in a beat | `.pop`, `.chart-point` |
| Progress bar | fill eases 220 ms (`normal`) on `standard`; track 6 px; segmented track 12 px, cells 6 px, gap 3 px; head knob 12 px with a 2 px surface ring; a fraction held to 0 to 1, an unusable `max` draws empty | the bar follows real progress between samples, not a clock; `neutral-100` is the track because it is visible on both card surfaces (`neutral-50` vanished in dark) | the `.progress-*` rules in `globals.css`; `progressFraction` |
| Wizard / popup arrive | 220 ms (`normal`), `settle`, 8 px, 97% to 100%; popup offset held to 64 px (`distance.large`) per axis | the same as `arrive`; 64 px is the largest travel the language allows for a small idea, so a trigger at a far corner cannot make the panel cross the screen | `.step-forward`, `.step-back`, `.arrive-from`; `originOffset` |
| Reel | 420 ms (`sweep`), `settle`, digits 80 ms apart for at most four steps (320 ms), window 1.15 em | the one headline figure takes the longest step; the stagger ramp is the language's own, inside `slow` | `.reel-strip`; `staggerDelayMs` |
| Word reveal | 320 ms in total, at most 80 characters | the total is fixed, so a long line is not slow | `TypeText`; `MAX_ANIMATED_CHARS` |
| Icon draw-on | 320 ms (`slow`), `settle`, strokes 80 ms apart | a tick is small; a ring around it follows | `.draw-path` |
| Chart entrance | 420 ms (`sweep`), `settle`, series start 0, 80, 160, 240, 320 ms apart | a chart is a page-level figure; one duration and one curve so it reads as one event | `chartDrawProps` |
| Chart tooltip | glide 220 ms (`normal`) on `settle` | Recharts' own default is 400 ms on `ease` | `chartTooltipMotion` |
| Marker pop delay | when the eased line has covered 98% of the way to the point, at most 280 ms (draw less pop) | the line is front-loaded, so a linear share of the draw would pop the dots long after it had passed | `pointPopDelayMs` (inverts `settle`) |
| Donut halo | 3 px outside the ring, 4 px thick, 35% opacity, fades over 140 ms (`fast`) | stays inside the 96 px half-width of the box (84 + 3 + 4 = 91) | `share-chart.tsx` |
| Literal timings | `200` to `normal` (220), `300` to `slow` (320), `700` to `sweep` (420), `ease-out` to `decelerate` | nearest token, so one edit now retunes them; the product-card image zoom was 700 ms and is now 420 ms, which is the only change a reader would notice | the 18 files, `.claude/rules/ui.md` |

**Failure modes.**
- *Scripting off or slow.* Server markup is always the settled state: the reel strips
  rest on the figure, the icon is drawn, no sheen, no swap.
- *Reduced motion.* Every one of these asks for itself or is collapsed by the
  stylesheet; the sheen flag, the leaving label, the reel's starting digits, the icon's
  stroke marks and the truncate scroll never start, and the information stays (the new
  value, the figure, the icon, the full text in `title`, the tone in `valueText`).
- *A popup with no focused trigger* (opened by script, or a browser that does not focus
  a button on click) arrives from `small` below, which is `arrive` itself; a trigger
  with no size does the same.
- *A figure that changes its number of decimals* rolls its strips (keyed from the
  right) to their new digits from wherever they were, and ends on the right figure.
- *Copying a reel figure.* The strips are not selectable text, so the reel is for the
  one display figure of a screen; the default count stays where a figure is copied.
- *A second change inside 420 ms* does not restart the sheen; a fresh one starts after.
- *The tooltip's first show* may glide from its previous place (a Recharts trait, also
  true of its 400 ms default); `chartTooltipMotion` can return `isAnimationActive: false`.
- *Stagger on replays.* Recharts replays `animationBegin` when data or a legend toggle
  redraws a series, so a re-enabled third series waits 160 ms; series are indexed by
  visible position so the first visible one is always immediate.

**Exceptions to the 320 ms cap, and why.** A chart entrance is 420 ms (`sweep`); with
the stagger the fourth series ends at 660 ms. That is the entrance of a page-level
figure, not of a control, and each series is still one event on one curve. A truncated
label scrolls for as long as its text needs (to five seconds), but only under the
pointer, so nothing waits on it. The progress bar follows data.

**Not adopted.** The playhead scrubbing a timeline (no timeline view exists), an icon
that wipes open to its label (a `clip-path` animation is paint, not transform or
opacity, `MOT-5`), bounce, overshoot, tilt and camera zoom, glow and blur, particles,
brand-gradient watermarks, hard-cut scene edits, dimmed siblings, and a card hover tint
(`.lift` already carries it). `MetricStrip` takes no `changeKey`: the P&L page unmounts
its strip while a month loads, so a figure there arrives rather than changes and the
reel and count-up already mark it.

**Noticed, not changed.**
- `transition-all` remains on `header.tsx` (nav underlines), `product-card.tsx` and
  `stitching-panel.tsx`; it can animate layout properties and each needs reviewing one
  by one.
- Dead CSS: `.chart-line` / `drawLine` in `globals.css` (again unused, now that the charts
  are tokenised); deleting it needs the owner's confirmation.
- `TypeText` (both units) still has no product consumer; `DrawIcon` is on two storefront
  pages that could not be run here.
- The design-system pages and `tailwind.config.ts` (`250`) still carry a few literal
  timings, and mobile and the POS do not use these tokens.
- A gauge and a funnel chart do not use Recharts' animation: the gauge has its own
  tokenised transitions and the funnel none.

**Verification.** Rebuilt for production and driven with Playwright against
`/admin/design-system`. Forty-nine new checks pass: the bar's fill is a translate and
rests at `--p`, the tone colours equal the feedback tokens, the head and the cells,
the fill growing from the right in a right-to-left document; the sheen starting on a
change and clearing after one sweep; the label leaving as `aria-hidden` and unmounting
after `fast`; the reel resting on its digits, stopping one stagger step apart and
rolling monotonically without passing its target; the badge pop from 60% landing on 1
without overshoot; the wizard's first step not animating, then forward and back
arriving from either side and leaving no transform behind; the popup's offsets (opposite
signs on a 380 px screen, held to 64 px); the icon's strokes marked and drawing; the
truncated label running at the reading speed and holding at its end, then restoring
the plain text; the word reveal showing whole words only; the error notice and error
toast igniting and fading; the chart tooltip's `transform 220ms cubic-bezier(0.16, 1, 0.3, 1)`
and its cursor; and, under reduced motion, no sheen, no leaving label, the reel at its
figure at once, no marked strokes, no scroll, an unseen ring. The earlier 69 motion
checks, the 95 screen checks and the 14 width-and-theme combinations (280 to 1536,
light and dark: no horizontal overflow, no offender) still pass, with no console
error. `pnpm lint`, `pnpm typecheck` and `pnpm test --filter='!@newax/api'` pass
(web 221 tests, of which 17 are new in `motion.spec.ts` and 23 are `chart-motion.spec.ts`;
shared 397), `pnpm index:check` is current and the four counts in `CLAUDE.md` are inline
`style={{` 27, `toLocaleString` 6, bare fetch 6, gray palette 0 (the two hand-rolled
bars' two inline styles are gone and `ProgressBar` and `TruncateReveal` add two; the
reel, the marker pop and the chart cursors set custom properties through a variable,
which that pattern does not count). The two storefront pages that use `DrawIcon`, the
P&L page, Reports, Stitching, the dashboard and the activity feed need a running API
and a session, so they were checked by typecheck, lint and the production build only,
not in a browser. `pnpm check:overflow` needs a seeded stack and was not run. The
Playwright scripts are not in the repository.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that
ends itself: n/a, no actor, principal or grant is created; motion changes no
authority.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, nothing is read, committed or sent; no
`PERMISSION_CATALOG` key was added, so there is no `Permission` row without a grant.
Request or record: the sheen flag, the leaving label, the reel and the truncate scroll
are presentation state, not writes; nothing here is a REQUEST or a RECORD of a business
fact. The bars read the same numbers the hand-rolled ones did.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash
or journal line is read or written. The P&L reel shows the figure the page already
shows and the figure is also in an `sr-only` copy.
The three silhouettes and the absent collaborator: a Solo deployment gets the same
motion; the tokens live in `brand.ts`, which every surface imports, and the activity
feed and the dashboard render nothing when their module is absent, so the sheen never
mounts there.
The second copy of the write, the hundred-thousandth row: a list of any length animates
at most four stagger steps, `StatusBadge` mounts a small text swap per row (no timer
until a status changes), and the activity feed keeps at most ten ids.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, code, document or personal datum is
created.
The failure path: a swap that cannot finish is removed by a timer, a popup with no
trigger falls back to `arrive`, a chart with motion off draws whole, and reduced motion
keeps the information.
Reachable: `/admin/design-system#motion`, in the page's section nav, and the new
primitives are exported from `components/ui` and listed in `.claude/rules/ui.md`; the
tokens are in `01-foundations.md` and the language in `05-motion.md`.


### Addendum — 2026-10-01 (seventh): nine rule cards, built as thirty laws and the controls they name

**Requirement.** The owner supplied nine rule cards (uploads, dropdowns, danger, the
login form, the product card, and four sets of UX laws) and asked for them "in design
system globally". Each rule was turned into a law with a stable ID and a test, and the
control it names was built, so a review can cite `UPL-3` or `DNG-2` and a lint can fail
on it. The twelve borrowed UX laws on the cards (Fitts, Hick, chunking, Doherty,
proximity, Von Restorff, goal gradient, Postel, Tesler, similarity, serial position,
peak-end) were already `ACT-1`, `COG-1`, `COG-3`, `ACT-3`, `PER-1`, `COG-12`, `COG-10`,
`ACT-5`, `COG-8`, `PER-3`, `COG-11` and `COG-13`; they are not restated, and the end of
`10-laws.md` says which artifact makes each true. The long form is "Controls with a
contract" in `docs/design/components-states/03-components.md` (UPL, MNU, DNG, FRM, CRD:
thirty laws, 180 in all); the specimens are in `/admin/design-system#controls`.

**What was built.**

| Card | Where | Built on |
|---|---|---|
| Uploads: drop zone, honest progress, check before sending, limits upfront, per-file failure, never block the app | `ui/dropzone.tsx`, `ui/upload-tray.tsx`, `hooks/use-upload-queue.ts`, `components/admin/upload-provider.tsx` (wraps the admin shell), `lib/upload.ts`, `lib/upload-queue.ts`, `lib/upload-client.ts`, `lib/upload-rules.ts`; adopted by product images, the three CSV imports, expense receipts, RAG documents and the stitching photo | a pure reducer with an injected clock; an XHR transport because `fetch` cannot report upload progress, authenticated through the one `adminAuth` object `adminFetch` also uses; server limits copied with file and line |
| Dropdowns: type to filter, typed dates, stay open on pick, collision-aware, reasons not grey, no menu under five | `ui/select.tsx`, `ui/multi-select.tsx`, `ui/menu.tsx`, `ui/date-field.tsx`, `ui/segmented.tsx` (reasoned-disabled), `hooks/use-popover.ts`, `lib/popover-position.ts`, `lib/menu-filter.ts`, `lib/calendar.ts`, `lib/date-parse.ts`; 18 short selects, 32 date inputs and 17 long selects adopted | the Popover API (top layer, so a menu inside a modal is not clipped by z-index), with a portal fallback; placement is a pure function |
| Danger: hold to confirm, verb labels, off the happy path, red budget, danger zone, cooldown | `ui/hold-to-confirm.tsx`, `ui/danger-zone.tsx`, `ui/cooldown-banner.tsx`, `ui/confirm-dialog.tsx` (verb label required, Cancel focused), `lib/guard.ts`; 16 dialog labels reworded; `bom/[id]` archive moved into a zone | a state machine that takes the time as an argument; `BRAND.safeguards` |
| Login form recipe | `ui/field.tsx` (`Field`, `FormStack`), `.field-xl`, `Button done`, `useDoneBeat`; the admin login and the four storefront auth forms | `size.control.xl`; labels above, examples as placeholders; one filled button |
| Product card recipe | `.card-lit`, `.media-concentric`, `Price tone="accent"`, `ProductCard`, `ProductsGrid`, `concentricRadius` in `@newax/shared` | the concentric-corner formula; `fineStaggerDelayMs` |
| Lint | `scripts/check-danger.mjs` (vague destructive labels, DNG-2), `scripts/check-menus.mjs` (short native selects and native date inputs, MNU-6 and MNU-2); both in `pnpm lint` | the vague-word list is read from `guard.ts`, so there is one list |

**Parameters.**

| Parameter | Exact value | Why this and not another | Enforced | How it degrades |
|---|---|---|---|---|
| `safeguards.holdToConfirmMs` | 1000 ms | longer than a phone's long-press (about 500), so a resting thumb cannot fire it; a second is the least a ring can fill in and still be seen filling | `brand.ts`; `HOLD_MS`; `guard.spec.ts` pins it | a `holdMs` of 0 would fire on the first frame, so the spec pins the brand value and only a caller can pass another; NaN never fires (the control is inert, which is the safe side) |
| Hold, keyboard | Space or Enter held for the same length; a key repeat does not count | the hold has an equivalent for people who cannot point | `HoldToConfirm`; `nextHold` | releasing or leaving the button cancels |
| Hold, assistive technology | first bare click arms, second confirms; no timeout; ends on blur or Escape | a click with no preceding press cannot hold; a timeout would be its own barrier (WCAG 2.2.1) | `HoldToConfirm` | an armed control that loses focus quietly disarms |
| `safeguards.deletionCooldownDays` | 14 days (24 h each) | spans two weekends and a month-end close, which is when somebody notices what is missing | `brand.ts`; `COOLDOWN_DAYS`; `cooldownState` | an unreadable date or a bad length reads as expired, so a corrupt row cannot keep something alive; UI-only until a purge job exists |
| `size.control.xl` | 56 px | seven 8 px steps, above the 44 px touch floor; the form recipe's field height, kept off dense table rows (`md`, 40) | `brand.ts`; `theme-size.ts`; `.field-xl` | none needed |
| `motion.distance.lift` | 4 px | twice `micro`; enough to read as rising, small enough not to cover the next row; its own token so the card lift and the invalid-field shake (`nudge`) retune apart | `brand.ts`; `.lift` | under reduced motion the card does not lift |
| `motion.stagger.fine` | 40 ms, at most four steps (160 ms) | a grid of many small peers should not take 320 ms to arrive; the cap is what stops a 200-card grid from animating for seconds | `brand.ts`; `fineStaggerDelayMs`; `motion.spec.ts` | beyond the fourth step peers share one delay; the product grid cascades each row (`index % columns`, so at most 120 ms) |
| Submit beat | 320 ms (`slow`) | long enough for the check to draw before the page leaves | `MOTION_MS.done`; `useDoneBeat` | no wait and no drawing under reduced motion; the button still says "Signed in" |
| Focus ring | 2 px, eased in over 140 ms (`fast`) | the existing focus step; never removed | `.field-input` | none |
| Concurrent uploads | 3 | a browser holds 6 connections per origin; 3 leaves the rest for the app's own requests (UPL-6) | `startable()` in `upload-queue.ts` | the rest wait in order; nothing is dropped |
| Upload speed window | 3 000 ms | smooths a bursty link and still follows a change | `measure()` | under 2 samples reads 0 B/s |
| Upload time-left gate | 1 000 ms of samples and speed above 0 | under a second the figure is a guess (UPL-2) | `measure()` | the lane shows no time left |
| Progress report interval | 250 ms (the last report always passes) | browsers fire about every 50 ms and each report re-renders every reader of the queue; the bar eases over 220 ms, so four a second still glides | `use-upload-queue.ts` | cosmetic only |
| Tray auto-hide | 4 000 ms after everything succeeded, paused under the pointer or focus | the toast default | `upload-provider.tsx` | a failure never hides on a timer |
| Refusals listed | 5 names, then "N more" | dropping 200 wrong files must not be a wall of red | `dropzone.tsx` | the rest are counted in one line |
| Upload size and types | 8 MiB for images and PDFs; JPEG, PNG, WebP, AVIF; PDF alone for RAG; CSV has no byte limit and 5 000 rows (a hint only, checked after parsing) | the server's own numbers, with file and line in `upload-rules.ts` | `checkFile` at drop time | the server checks again; this is a convenience, never authorization |
| Client upload timeout | none | a slow link legitimately takes minutes, and every lane has Cancel | n/a | a hung connection stays "Uploading" until Cancel or the server gives up |
| Tray size | 384 px wide (`max-w-sm`) and the viewport minus 2 rem; lanes scroll at 288 px | fits a 280 px screen | `upload-tray.tsx` | lanes scroll, never reorder |
| Tray layer | `z-dropdown` (20) | above page content and sticky bars, below the drawer and every dialog | `upload-tray.tsx` | n/a |
| Menu search threshold | search above 10 options | MNU-1; ten rows fit a 20 rem panel without scrolling | `menu-filter.ts` `needsSearch` | `searchable` can force search on, never off for a long list |
| Segmented limit | below 5 options is a segmented control | MNU-6 | `menuKind` | an empty list is a menu, so it still has a trigger and an empty state |
| Popover gap and margin | 4 px from the trigger, 8 px from any edge | attached but not touching; never flush to the glass | `popover-position.ts` | the panel is clamped inward and its height and width are capped to the room left |
| Flip rule | flip up when room below is less than the panel and room above is greater than room below | equal room never flips, so there is no flip-flop at the boundary | `placePopover` | with both sides too small the larger is used and the panel scrolls |
| Menu panel | at most 20 rem high, 28 rem wide, each capped by the room left | about nine 2.5 rem rows and the search box | `menu.tsx` | falls back to the fixed size without the hook's variable |
| Placement recompute | one animation frame, coalesced, on scroll, resize and visual-viewport change | at most one layout read a frame | `use-popover.ts` | no debounce, so no stale placement |
| Type-ahead reset | 700 ms | longer than a typing burst, shorter than a pause to think | `menu-filter.ts` | the buffer clears |
| Calendar | always 6 rows by 7; years in pages of 12; years 1000 to 9999 | the panel never changes height between months; four-digit ISO strings keep string comparison and UTC maths safe | `calendar.ts` | out-of-range input gives a reason, never a clamp |
| Two-digit years | 80 years back, 20 forward from today | the usual window; 85 reads as 1985, 46 as 2046 | `date-parse.ts` | three-digit years are refused with a reason |
| `check-menus` baseline | short native selects 0, native date inputs 1 | short selects reached zero; the one date input is `MetadataDrivenForm`'s, which may compose only plain elements (architecture-patterns/141 §2, `check-metadata-renderer.mjs`) | `scripts/check-menus.mjs` | fails only on growth |

**Failure modes.**
- *Popover API missing* (an older browser): the panel is portalled into the nearest
  dialog or `body` with `fixed z-dropdown` and placed by the same function; a menu
  inside a modal is then in the modal's stacking context, which is why the hook portals
  into the dialog.
- *The server refuses what the client let through*: the lane fails with the server's
  message and a Retry; nothing is retried automatically, so a refusal cannot loop.
- *The network drops mid-upload*: the lane fails ("Network error"), the others carry
  on, Retry sends that one file again. A late success for a lane cancelled just as it
  finished is recorded as done, because the file landed.
- *A session expiring mid-upload*: the transport refreshes once through the same
  single-flight refresh `adminFetch` uses and retries the file; if that fails the
  operator is sent to sign in.
- *Closing the tab during a transfer*: a `beforeunload` confirm while anything is going.
- *Concurrent uploads to one product* take the same `order` on the server (the API
  numbers a new image from a count it reads before it saves), so the product's lanes
  are sent one at a time (`serialKey`); a failure or cancel never blocks the next. The
  race across two tabs needs a server transaction and is not fixed here.
- *Enter on the file input*: `Space` opens a file input natively; `Enter` did not reliably
  (headless Chromium opened the picker on 1 of 3 fresh pages), so `Dropzone` handles
  `Enter` itself (`preventDefault`, then `click()` on the input). After the page hydrates it
  opened the picker on 3 of 3 pages; before hydration the browser's own handling applies,
  which is not a state a keyboard user reaches.
- *A hold interrupted* (pointer leaves, focus moves, Escape, pointer cancel): the ring
  drains and nothing happens; a screen reader is told "Not confirmed".
- *Reduced motion*: the ring still follows the clock (it is the information), the check
  is shown without being drawn, the card does not lift, a grid arrives at once.
- *A typed date that cannot be read*: the text is kept, the reason is shown next to
  the field and announced, and nothing is committed.

**Deviations from the cards, and why.**
- *Corners.* The cards use 24 px cards, 12 px fields and a 16 px photograph. The house
  shape is 2 to 3 px, so the law is the formula (`concentricRadius`), which gives 24, 16
  and 8 for a soft brand and a square photograph here. The owner chose to keep the house
  corners (decision card, 2026-10-02), so the shape is not changed; a brand that wants
  soft corners changes its radii in `brand.ts` and the formula follows.
- *Shadow at rest.* The cards draw a border and a soft shadow together. `ui.md` forbids
  both on one edge, so `.card-lit` has the border and the lit surface, and the shadow
  arrives with the lift.
- *Press on a card.* A card is too big to scale (2% of 400 px is 8 px), so a press
  reverses the lift and the button inside carries the 98% press.
- *Hold to confirm replaces a dialog only for the middle `ACT-6` tier.* The sixteen
  existing confirmation dialogs carry a consequence paragraph, a typed name, or both, so
  they stay and only their labels changed.
- *The form card* appears only where the page has a backdrop (the admin sign-in); a form
  that is alone on its page stays boxless (`ui.md`), which is the storefront's case.
- *Cooldown* is a UI contract and the number a purge job will read; there is no purge job.
- *Date field.* English month names only; a bare "Oct 2026" is refused with "add the
  day"; Enter commits the text and does not submit the form; the calendar's cells are
  44 px tall and about 35 px wide at 280 px.
- *Uploads.* `Dropzone.disabled` is the reason string, so a zone cannot be disabled
  without saying why; `maxBytes` may be `Infinity` where the server sets no cap.

**Not adopted.** The storefront visual-search button (an icon-sized control on the public
API with no admin session or provider, and it needs strings in both catalogues); the
RAG "Replace file" row action and the party picker (no surface for a zone; an async
combobox with its own listbox); the 73 native selects of five to ten options or of
unknown size (the platform's menu is accessible and collision-aware there; the total is
printed on every `check-menus` run); the product form's selects (a field that wraps its
own label and a brand select with deactivated-option logic).

**Noticed, not changed.**
- Every API `FileInterceptor` is created with no `limits.fileSize`, including the public
  `/search/by-image`. Multer buffers the whole body in memory before the 8 MiB check in
  `putImage`, so the real cap is after the read. Setting `limits` is the fix and an API
  change.
- `lib/upload-rules.ts` copies the API's limits with file and line; they belong in
  `packages/shared` next to `IMPORT_ROW_CAP` so the API and web read one number.
- `Dialog`'s focus trap selects `input:not([disabled])`, which also matches the hidden
  input of a required `Select` if it is the last element in a dialog.
- A product form left while a photograph is still uploading loses track of that lane;
  the image lands and appears after a refresh. Fixing it needs a scope tag on lanes.
- `scripts/build-index.mjs` matched design chapters only at `docs/design/NN-*.md`, so
  after the chapters moved into group folders `pnpm idx law` indexed no laws; the pattern
  now allows one folder level.
- `AnimatedSection` (framer-motion) still carries a 0.8 s duration and a 50 px rise as
  literals; it predates the tokens and is used across the storefront.
- `transition-all` remains on `header.tsx` and `stitching-panel.tsx`.

**Verification.** Run on the final tree, after the last edit.

- `pnpm index` regenerated (217 pages, 18 changed); `pnpm index:check` exits 0.
- `pnpm lint` exits 0. It includes `check-danger` (53 literal labels checked, 9 written as
  expressions and not checked), `check-menus` (73 native selects in total, 0 short, 1
  native date input), `check-contrast`, `check-metadata-renderer`, `check-rules` and
  `check-rebrand`. Two lint failures turned up on the way and were fixed rather than
  baselined: a `DateField` import into `MetadataDrivenForm` (it may compose only plain
  elements, so the native date input stays and the `check-menus` baseline says 1), and
  three uses of `neutral-200` against a baseline of 1 (the `DateField` calendar button is
  now borderless and the dropzone's dashed edge is `neutral-500`, which clears the 3:1 a
  control edge needs).
- `pnpm typecheck` exits 0.
- `pnpm test`: web 501 passed (17 files), shared 404 passed, pos-core 28 passed. The root
  command exits 1 because 70 of the 295 `@newax/api` suites fail (684 of 3,068 tests);
  their log shows Redis refused at `localhost:6379`, and they are the e2e suites that need
  Postgres and Redis, neither of which this container runs. No file under `apps/api`
  changed in this work. This was not run against a database, so CI is where those suites
  are decided.
- `next build` of `apps/web` passes on the final tree.
- The four greps in `CLAUDE.md`: inline `style={{` 27, `toLocaleString` 6, bare `fetch` 6,
  `text-gray` and `bg-gray` 0. The first three are the same numbers `HEAD` has (27, 6, 6),
  so none was added.
- Browser, Chromium against the production build of `/admin/design-system`: danger, form
  and card specimens 63 of 63 checks (seven widths, light and dark, reduced motion);
  uploads and menus 48 of 48 (limits printed, Enter and drop and paste, refusals by name
  with a remedy, five files with one failure and exactly one Retry, search focus and
  filter, Escape and focus return, blocked options with reasons, multi-select staying open,
  typed dates, calendar jump, a panel opening upward near the bottom edge, a right-to-left
  380 px panel inside the viewport, and no horizontal overflow at the seven widths in both
  themes).

*Not verified in a browser:* the XHR transport against the real API (the specimen uses a
simulated transport, so progress, cancel and retry are verified and the wire is not);
the storefront sign-in, register and password pages and the storefront product card (they
need the API); and the roughly sixty admin pages that adopted `Select` and `DateField`,
and the pages that adopted `Dropzone`: they typecheck and build, and the controls they use
are the ones verified above, but each page was not opened.

**Scope lenses.**
The actor with three tables, the principal with no permission key, the grant that ends
itself: n/a, no actor, principal or grant is created. The upload tray and the danger
controls are presentation and never replace a server check.
Whose rows, and which columns, the threshold nobody approves alone, the toxic pair,
authority and blast radius, audience: n/a, no row is read or committed by the controls
themselves; each page that adopts one calls the same endpoint with the same permission
as before, and no `PERMISSION_CATALOG` key was added, so there is no `Permission` row
without a grant. `DangerZone` renders nothing for a person who may do none of its acts
(`PRM-5`).
Request or record: an upload is a REQUEST the server may refuse (the lane shows why);
a hold is a gate in front of a REQUEST that already existed; nothing here is a RECORD.
The movement with no address, four hours down, and the money lenses (posting rule,
columns, period, second legal entity, dry run, click the number): n/a, no stock, cash or
journal line is read or written.
The three silhouettes and the absent collaborator: the tokens live in `brand.ts`, so a
Solo deployment and a group deployment get the same controls; the upload provider
wraps the admin shell only, and a page that renders a `Dropzone` outside it throws a
clear error rather than failing silently.
The second copy of the write: a retried upload is a new request by design (the lane's
Retry); the server's image routes are not idempotent, which is why a product's lanes
run serially. A hold fires once per press (`nextHold` ignores a second down).
The hundred-thousandth row: no list is rendered at size by these controls; a menu of 140
branches filters in memory, and a product grid animates at most four stagger steps.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: see Failure modes above; every refusal states its remedy (`FLO-7`).
Reachable: `/admin/design-system#controls`, in the page's section nav; the primitives
are exported from `components/ui` and listed in `.claude/rules/ui.md`; the tokens are in
`01-foundations.md` and the motion in `05-motion.md`.

**Pillars.** Proper architecture: the controls are primitives behind `components/ui`,
the rules are pure functions with specs, and the two lints keep them used. Stable and
reliable: per-file failure, a single-flight refresh, no timeout that could trap a
person, a fail-safe on a bad hold length. Secure by design: every check at drop time is
a convenience and the server checks again. Observable: not touched (no APM is wired).
Scalable: the queue caps concurrency at 3 and the progress renders at 4 a second.

### Addendum — 2026-10-02 (eighth): two reels, built as a UX engine for the agents, seven laws, a lint and one primitive

**Requirement.** Two reels of 2026-10-02 ("Hierarchy", "Success is a system") and the
owner's instruction: "make Claude Code think like a senior UX designer. UX engine
designs the screen before coding, audits what is broken, reviews the diff and kills the
AI look." **Reason.** The design system had 180 laws and no procedure that makes an
agent apply them before it writes a screen, so a new page could still ship a second
loud button, a check mark with no button, or a gradient. **Outcome.** A procedure per
job, laws for what the reels add, a command that holds the machine-made look in place,
and one primitive for the success screen. **Verification.** Commands below, and a
cold dry run of each procedure by an agent that had not seen this thread.

**What was built.**

| Piece | Where | What it does |
|---|---|---|
| `HIE-1`, `HIE-2` | `docs/design/layout-composition/02-layout.md`, "Hierarchy: where the eye goes" | one headline per page; the eye makes three stops (headline, content, the one loud button) |
| `SUC-1` to `SUC-5` | `docs/design/components-states/04-states.md`, "The success state" | specific, a next step, the surface follows the stakes, at most one open loop, joy only for a rare milestone |
| `/ux-design`, `/ux-audit`, `/ux-review`, `/restyle` | `.claude/skills/*/SKILL.md` | design brief before JSX; read-only audit with evidence; read-only diff review ending Ship or Fix first; remove the tells (`/restyle` edits files, so it is `disable-model-invocation: true` and runs only when asked) |
| `ux` subagent | a row in `scripts/lib/model-routing.mjs`; `.claude/agents/ux.md` is generated by `pnpm index` | sonnet at high effort, read-only tools, follows the three skills |
| `check-tells` | `scripts/check-tells.mjs`, in `pnpm lint` | a ratchet per tell and per file; `node scripts/check-tells.mjs <file>` lists one file's tells with `file:line` |
| skill and law drift check | `scripts/check-rules.mjs` | a skill whose `name` differs from its folder, with no description, or with an odd number of fences fails; a cited law ID (`XXX-N`) with no heading in `docs/design/` fails (112 citations, all resolve, against 187 laws) |
| `SuccessState` | `apps/web/src/components/ui/success-state.tsx`, `lib/success-state.ts`, specimen at `/admin/design-system#controls` | a drawn tick, a specific title, proof, a required primary, one quiet repeat, one open loop, a way back; renders nothing without a primary action |

Six screens use `SuccessState`: storefront verify-email, unsubscribe, reset-password
and order placed or paid; the returns request; the admin CSV import (two callers).
Laws total 187 (180 and seven). The README's "87 borrowed" counts `SPA-5a`.

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| Toast lifetime | 4 000 ms | `SUC-3` row 1, a safe reversible setting | the reel's "leaves in four seconds"; it is `useToast`'s existing default, so nothing changed | `hooks/use-toast.ts` | a toast is not the only record: the control shows its new state |
| Burst sparks | 8 | `SuccessState celebrate` | eight reads as a ring at a 56 px badge, fewer reads as a spinner | `BURST_SPARKS` in `lib/success-state.ts` | no sparks under reduced motion or without `Element.animate`; the badge and text still arrive |
| Burst delay and duration | 320 ms (`duration.slow`), 420 ms (`duration.sweep`) | the burst | it starts as the tick finishes drawing (`DrawIcon` takes 320 ms) | `BURST_TIMING` | as above |
| Burst easing, travel, end | `easing.settle`, 24 px (`distance.medium`) from the badge edge, `scale.pop` 0.6, opacity 0 | the burst | never overshoots; ends invisible | `burstTravel`, `sparkKeyframes` | as above |
| Animated properties | transform and opacity only | the burst | `MOT-5` | `success-state.tsx` | as above |
| Entrance | `.stagger-fine`: 40 ms steps, capped at 4, 320 ms `arrive` | `SuccessState` | the house stagger | `globals.css` | reduced motion shows it at once |
| Column cap | `max-w-md`, 448 px | `SuccessState` | a result is one short column and must not stretch on a wide screen (`SPA-4`) | the component | none |
| Check-tells baseline | gradient 8, glass 8, loud motion 1, heavy shadow 1, emoji 4, `transition-all` 0, buzzword 0, vague success 0 | `apps/*/src`, `apps/web/messages` | the counts found on 2026-10-02 that are legitimate or wait on a designer; each entry names its file in `BASELINE` | `scripts/check-tells.mjs`, in `pnpm lint` | a count may fall and may not rise; a fall prints "lower BASELINE" and passes |
| Skill description | at most 1 024 characters | each `SKILL.md` | the limit a skill can carry | `check-rules.mjs` | the build fails |

**Decisions made without the owner, all reversible.**
- `soft-radius` is not a tell. `tailwind.config.ts` maps `lg`, `xl`, `2xl` and `3xl` onto
  one `--radius-lg` token, so `rounded-xl` is a spelling of the house shape, not a softer one.
- `check-tells` tells fixed in place rather than baselined: `transition-all` to a named
  property (five places in `header.tsx`, one in `stitching-panel.tsx`); `shadow-xl` and
  `shadow-lg` to `shadow-modal` and `shadow-overlay`, which they already resolved to; the
  loading avatar's `animate-pulse` to `.skeleton`; "seamless" removed from one sentence in
  `en.json`; two toasts and notices that said only "Saved." now say what was saved.
- `⚠` was removed from five strings (the word remains). It stood in for an icon, and the
  colour and the word already carry the state.
- The reset-password 2-second auto-redirect is gone: `SUC-3` says the result stays until
  the person leaves it, and a confirmation that disappears is the dead end the reel names.
  Returns submit no longer jumps to the list, for the same reason.
- `SuccessState`'s reading order is its focus order (title, proof, receipt, primary,
  secondary, loop, back), not the order the first draft had, which put the loop's control
  ahead of the loud button for a keyboard (`COG-11`).
- `celebrate` is off and no screen passes it. `SUC-5` allows it only for a milestone the
  system remembers, and that record does not exist.

**Not adopted, and why.** Forgot-password stays a plain notice: it is deliberately
non-confirming ("if an account exists") so it does not reveal whether one does, and a
check mark would assert success. Register, support-ticket creation and the sign-in
completion screen are transitions onto the thing made, not result pages. `CommonWizard`
and `SecretOnce` have no end state to wrap. Admin notify ("Sent.") and inventory reorder
("created N draft POs") are row 2 or 3 but have no destination page to lead to (there is
no sent-announcements list and no link target for the draft POs), so a primary action
would be dishonest; they need those pages first.

**Failure modes.** A skill that cites a law that was renamed fails `pnpm lint`. A
`SuccessState` built with no primary renders nothing, which is visible in review and in
the specimen, not silent in production. A tell that grows fails with `file:line` and the
replacement.

**Verification.** Run on the final tree, after the last edit.

- `pnpm lint` exits 0 and includes `check-tells` (counts as in the table; 21 success
  messages are written as expressions and are counted, not checked) and `check-rules`
  (10 rule files, 4 skills, 112 law citations, 187 laws). `node scripts/check-tells.mjs
  --self-test`: 95 cases. `node scripts/check-rules.mjs` was also proven to fail, in a
  scratch repository outside this one, on a skill whose name differs from its folder and
  on a citation of a law that does not exist.
- `pnpm --filter @newax/web exec tsc --noEmit` exits 0; `apps/mobile` `tsc --noEmit`
  exits 0 (two strings lost a glyph); `pnpm --filter @newax/web test` 510 passed (18
  files; the new spec adds 9 tests, for the burst maths); `@newax/shared` 404; `@newax/pos-core` 28.
  The root `pnpm test` still exits 1 for the API suites that need Postgres and Redis; no
  file under `apps/api` or `apps/pos` changed.
- `pnpm index` and `pnpm index:check` exit 0 (218 pages).
- `next build` of `apps/web` passes on the final tree (rebuilt after the last code edit).
- The four greps in `CLAUDE.md` against `HEAD`: inline `style={{` 27 and 27, `toLocaleString`
  6 and 6, bare `fetch` 6 and 6, `text-gray` and `bg-gray` 0 and 0.
- Browser, Chromium against the production build: the controls specimen sections from
  the previous addendum still pass (63 of 63, 48 of 48). `SuccessState`'s specimen 42 of
  42: no overflow at the seven widths in both themes, one list of three steps, Tab order
  (View invoice, Send another, Notify me, Back), every action 44 px tall at 380, eight
  sparks once and eight again on Replay, no sparks and no `animate()` call under reduced
  motion, a right-to-left pass at 280 and 380. The adopters against the production
  build with the API answered at the network layer: 31 of 31 (the first run had one
  failing assertion in the script itself, which expected the link `/en/` where the page
  correctly links `/en`; the script was corrected, not the page), and the returns submit
  6 of 6. These scripts are one-off and are not in CI.
- The four procedures were each followed cold by an agent that had not seen this thread:
  `/ux-design` on the admin Notify screen, `/ux-audit` on the storefront register page,
  `/ux-review` on this change's own uncommitted diff, and `/restyle` read-only on
  `product-purchase.tsx`. Between them they reported 24 places the procedures were
  ambiguous, cited something that does not exist or lacked a command, among them a
  premise the request got wrong (Notify messages staff, not customers) and a "read-only"
  audit whose first command installs git hooks and writes a build cache. All 24 are fixed
  in the skill files, and `check-tells` gained `node scripts/check-tells.mjs <file>` because
  `/restyle` could not otherwise see one file's tells. The dry runs also did real work:
  `/ux-review` found two defects in the code this change had just added, both fixed (the
  CSV import showed two loud buttons once a run was committed, so its Import button now
  steps back to secondary and stays disabled until another file is chosen; and the order
  page said "not paid yet" from the existence of bank details alone, so it now also
  requires the transfer's payment not to be `PAID`), plus a grammar slip ("Imported 1
  customers", now "1 row imported as customers"). `/ux-audit` found the open redirect
  recorded below. The dry runs were plain procedures; the harness later listed
  `/ux-design`, `/ux-audit` and `/ux-review` as skills in this same session, so they
  appear without a restart (`/restyle` is owner-invoked and is not listed to the model).

*Not verified:* any adopter against the real API (the pages were answered by network
mocks); the admin `CsvImportCard` in a browser (it needs an admin session; typecheck and
build only); real screen readers (checked in headless Chromium, which exposes the
accessibility tree, not a reader's speech); the Urdu strings written for the three new
namespaces (they need a native reviewer); mobile and POS (no motion or `SuccessState`
there); the `/restyle` skill's edit step (it was dry-run read-only and its edits were not
made).

**Scope lenses.**
The actor, the principal with no permission key, the grant that ends itself, whose rows
and columns, the threshold, the toxic pair, authority and blast radius, audience: n/a, no
actor, grant, row or message audience is created; `SuccessState` renders what a page
already holds and every adopter calls the endpoint and permission it called before.
Request or record: the adopters' writes are unchanged REQUESTS; the success screen is
shown after the server accepted one and never before.
The movement with no address, four hours down, the money lenses (posting rule, columns,
period, second legal entity, dry run, click the number): n/a, no stock, cash or journal
line is read or written. The order page shows the total from the order it already loaded.
The three silhouettes and the absent collaborator: the laws and `check-tells` read no
deployment setting; the order page's loop is built from the order's own status, so a
deployment with no shipping module shows the steps the order has.
The second copy of the write: n/a, no write is added; reset-password and the order page
are idempotent views of an outcome and a reload shows the same page.
The hundred-thousandth row: n/a, no list; `check-tells` scans 461 files in 0.35 s.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: a lint failure names `file:line` and the replacement.
Reachable: `/admin/design-system#controls`, in the page's section nav; `SuccessState` is
in `components/ui/index.ts` and the "Use what exists" table in `.claude/rules/ui.md`;
the commands are listed in `.claude/rules/design.md` and `CLAUDE.md`. The skills appear
as `/ux-design`, `/ux-audit` and `/ux-review` to the model and `/restyle` to the owner.

**Correction to the seventh addendum.** It says Enter did not reliably open a file input
in headless Chromium (1 of 3 fresh pages) and that `Dropzone`'s Enter handler fixed it.
That was a race in the test, which registered its file-chooser listener a moment before
the key was pressed. With the listener registered first, a bare `<input type="file">`
opens on Enter 12 of 12 times and `Space` 12 of 12, and the `Dropzone` opens once on 12 of
12 pages (never twice). The handler is kept, because UPL-1 promises Enter and Firefox and
WebKit were not measured, and `preventDefault` means an engine that opens natively does
not open twice; its code comment now says so instead of claiming a measured gap. The
uploads suite registers its listener early, and passes 48 of 48 on three consecutive runs.

**Separable work orders, named and not built.**
- *The milestone ledger.* `SUC-5` needs a record that a milestone happened (first
  invoice paid, first order shipped) with a unique key per person and milestone, so a
  celebration plays once and never again. Until it exists nothing passes `celebrate`.
- *Sent announcements and the approver's decision screen* (no web screen calls
  `/admin/notify/:id/decide`), which the Notify and reorder success states need first.
- *A component test harness* for `apps/web` (no `@testing-library` today), so
  `SuccessState`'s guard is a test and not a specimen and a browser run.

**Noticed, not changed.**
- **Open redirect.** `register/page.tsx:44-45` (and the login page) pass the `next` query
  parameter straight to `router.push`, so `/register?next=https://example.com` sends a
  new account to another site. It is a security fix with its own review, not part of a
  design change.
- `.claude/rules/design.md` says every user-visible string lives in `messages/*.json`;
  `06-content` says customer-facing strings do. Admin pages write literals and `en.json`
  has no admin namespace, so the rule is true of one and not the other. The skills
  follow `06-content` and say so; the owner may want the two made to agree.
- Register, forgot-password and reset-password carry English literals in JSX, and the
  register page's aside headline is `text-4xl` against a `text-2xl` page title (`HIE-1`).
- `order.thanks` and `order.paymentSuccess` in the message catalogue are now unused.
  They were left in place, not deleted.
- `check-tells` reads 21 success messages that are expressions and does not judge them.
- From the `/ux-review` dry run, not fixed because each is a judgement or older than this
  change: the CSV import shows a green tick when 3 of 1,000 rows landed (the detail line
  states the skips, and `SUC-1` can be read either way); "Import another file" unmounts
  the button that has focus, so focus falls to the page; `admin-shell.tsx:115` carries a
  physical `left-0` on the mobile drawer (`GLO-2`; making it `start-0` also needs the
  slide direction reversed for right to left); `Notice`'s non-danger branch on the order
  page has no caller now; `celebrate`, `receipt` and the burst have no production caller
  by design (`SUC-5`), which is the line a reviewer may ask the owner to accept.

### Addendum — 2026-10-02 (ninth): a reel on copying, built as five laws, one primitive and a lint

**Requirement.** A reel of 2026-10-02 ("Copy needs proof") and the owner's words: the
copy icon flips to a check the instant the copy fires, no spinner, no delay; the check
holds about two seconds and fades back, never stuck, so the next copy gives a signal;
the raw value is copied, not the formatted span with its line breaks and zero-width
characters; a screen reader hears "copied" through a live region; on an insecure origin
the clipboard call fails without a word, so fall back to a copy command. "A silent button
lies." **Reason.** The only copy action in the product (`SecretOnce`, on both API-key
pages) did not meet them: its "Copied" stayed for ever, it had no icon, it announced a
failure but not a success, and it had no fallback, so on a plain-HTTP origin
`navigator.clipboard` was `undefined`, the click threw a `TypeError`, and the button said
the browser blocked copying although the copy command would have worked. The bank
account number and IBAN on the order page, which a customer has to type into a banking
app, and the tracking number had no copy action at all. **Outcome.** One primitive that
proves its result, one function that is the only code to touch the clipboard, and a lint
that keeps it so. **Verification.** Commands and browser runs below.

**What was built.**

| Piece | Where | What it does |
|---|---|---|
| `CPY-1` to `CPY-5` | `docs/design/components-states/03-components.md`, "CPY · Copy" | the flip is the receipt, two seconds then back, copy the raw value, say it aloud, fall back then fail out loud |
| `BRAND.feedback` | `packages/shared/src/brand.ts` | `copiedHoldMs` 2 000 and `copyFailedHoldMs` 4 000, so a deployment retunes them in one place |
| `copyText`, `normalizeCopyValue`, `nextCopy` | `apps/web/src/lib/copy.ts`, 32 specs in `copy.spec.ts` | the async API, then the copy command from a scratch field inside the open `dialog`; the invisible characters removed; the button's state machine |
| `CopyButton` | `apps/web/src/components/ui/copy-button.tsx` | `icon` and `labelled` variants; stacked faces; an always-mounted `role="status"` region; renders nothing for an empty value |
| `check-clipboard` | `scripts/check-clipboard.mjs`, in `pnpm lint`, 20 self-test cases | fails `navigator.clipboard` or `execCommand('copy'|'cut')` anywhere in `apps/web/src` and `apps/pos/src` except `lib/copy.ts`; no baseline, because nothing was left to grandfather |
| Specimen | `/admin/design-system#controls`, "Copy" | both variants, a paste field, and a selector that makes the page's clipboard behave like an insecure origin or a blocked one |

Adopted on: `SecretOnce` (so both API-key pages), the bank account number and IBAN, and
the tracking number on the storefront order page. Laws total 192 (187 and five).

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| Success hold | 2 000 ms | the check | the owner's "about two seconds": long enough for the eye to come back from the place the value is pasted and still find the answer, short enough to be a copy button again before a second copy is wanted | `BRAND.feedback.copiedHoldMs`, read as `COPIED_HOLD_MS`, timer in `CopyButton` | returns to idle; a repeat copy restarts it; measured 2 001 ms |
| Failure hold | 4 000 ms | the failure icon and sentence | twice the success hold, because it carries a sentence to read and act on; it equals the toast default | `BRAND.feedback.copyFailedHoldMs` | returns to idle; the person can press again; measured 4 001 ms |
| Flip to a result | `duration.instant`, 80 ms | the faces, transform and opacity | the press already takes 80 ms down; the flip must not feel later than the press | `Face` in `copy-button.tsx` | reduced motion collapses it to 0.01 ms and the state still shows |
| Fade back | `duration.normal`, 220 ms | the faces | slow enough to read as a fade, fast enough to be ready | as above | as above |
| Repeat pulse | `.pop`, `duration.fast` 140 ms, once, only from the second copy in a hold | the check or failure face | a first copy already has the flip; only a repeat needs something new | `Face` (`pulse > 1`) | reduced motion shows no new frame; the repeat is still announced and still restarts the hold |
| Target size | 44 px below `fold` (672 px), 40 px from it | the icon variant | the house touch floor and `control-md`, as `.btn` | `min-w-touch`, `fold:min-w-control-md` | measured 44.0 and 40.0 at the seven widths sampled |
| Scratch field | fixed, 1 px by 1 px, opacity 0, `1rem` type | the fallback | it must be in the viewport (iOS will not select what is not) and 16 px type stops iOS zooming to it | `copyByCommand` | removed in a `finally`, focus and selection restored |
| Invisible characters removed | U+00AD, U+061C, U+200B to U+200F, U+202A to U+202E, U+2060 to U+206F, U+FEFF (written as escapes in `copy.ts`) | the value | what a formatter or an hyphenator adds and a terminal does not ignore; U+061C is the Arabic letter mark that ICU puts around numbers in right-to-left text, which Urdu ships | `normalizeCopyValue` | an all-invisible value is empty and copies nothing |
| Clipboard calls outside `lib/copy.ts` | 0 | `apps/web/src`, `apps/pos/src` | a second call site is a second implementation of five laws | `check-clipboard` | the build fails with `file:line` |

**Decisions made without the owner, all reversible.**
- The flip follows the write's result, not the click. A check shown on the click would be
  wrong whenever the copy then failed, which is the lie the reel is about. The write
  resolves in milliseconds (the flip was measured 11.4 ms after the click), so there is no
  pending state to show.
- The labelled variant shows "Copied" as its visible word for the hold, while its accessible
  name stays "Copy" (`aria-label`). For that two seconds the visible word is not in the
  name (WCAG 2.5.3 Label in Name); the idle word is.
- `CopyButton` renders nothing for a value that is empty once the invisible characters are
  gone. A copy button that cannot copy is worse than none.
- The failure icon is the same colour as the label: the sentence beside it is red, and the
  shape differs, so the failure never rests on colour alone, and a red icon on the
  outlined button's accent hover fill would have been unreadable.
- On the order page the label sits above a copied value instead of beside it. Side by side,
  a 24-character IBAN plus a 44 px button wrapped to a stray "02" at 1280 and pushed the
  card 74 px past the viewport at 280. The first run of the browser check found it.
- `normalizeCopyValue` strips the zero-width joiner and non-joiner. They are spelling in
  prose, so the function says in its comment and in `CPY-3` that it is for identifiers and
  codes. A caller with prose would need a different function.
- The specimen's selector replaces `navigator.clipboard` and `document.execCommand` with
  own properties while "Insecure origin" or "Blocked" is chosen, and deletes them on any
  change and on unmount. It is on the design-system page only, which needs an admin session.

**Not adopted, and why.** Other identifiers a person may need to copy (an admin order
number, a payment reference, an invoice number) were not changed: each is a one-line
adoption of `CopyButton` and none was asked for, and the lint already stops anything
else from copying a different way. `apps/mobile` has no DOM clipboard and would use
`expo-clipboard`, which is its own decision.

**Failure modes.** *Insecure origin:* `navigator.clipboard` is `undefined`; the copy
command runs inside the same click with nothing awaited before it, so the browser still
counts it as the gesture. *Refused:* the async call rejects and the command is tried after
it. *Open modal:* everything outside a modal dialog is inert, so the scratch field goes
inside the dialog that holds the clicked button. *Nothing works:* the failed state, a
sentence naming the remedy, `onFail` (the secret's field is selected), 4 000 ms. *Double
click:* the hold restarts and the region announces again, with no server write to repeat.
*A secret on the clipboard:* a clipboard manager may keep it; that is inherent in copying a
secret the person asked to copy, and the notice above it already says it is shown once.

**Verification.** Run on the final tree, after the last edit.

- `pnpm lint` exits 0 and now includes `check-clipboard` (511 files scanned, 0 clipboard
  calls outside `lib/copy.ts`; `--self-test` 20 cases) and `check-rules` (10 rule files, 4
  skills, 116 law citations, all resolve against 192 laws). The matcher was also run
  against the old `SecretOnce` from `HEAD` and flagged its `navigator.clipboard` call at
  line 48. The first `pnpm lint` on this change failed, correctly: `check-frontend-secrets`
  read the specimen's example secret `sk_live_51Hx9Example0000` as a Stripe-style key, so the
  example is now `key_example_7Hx9Qa2Lm04Zt`.
- `pnpm typecheck` exits 0 (10 tasks); `apps/mobile` `tsc --noEmit` is clean.
- Tests: web 542 passed (19 files; the new `lib/copy.spec.ts` adds 32: the invisible
  characters, the API, the refusal fallback, the missing API, the synchronous fallback, the
  dialog host, cleanup after a throw, every failure, the state machine, the reset on a
  value change, `selectContents` and the hold lengths); shared 407 (3 new, for `BRAND.feedback`); pos-core 28. Adding an `await` before
  the copy command in `copyText` makes the "nothing awaited before it" spec fail, so the
  spec has teeth; the change was reverted. The root `pnpm test` was not re-run: it exits 1
  at baseline for the API suites that need Postgres and Redis, and no API file changed.
- `pnpm index` and `pnpm index:check` exit 0 (218 pages). `next build` of `apps/web`
  passes on the final tree (rebuilt after the last code edit).
- The four greps in `CLAUDE.md` against `HEAD`: inline `style={{` 27 and 27,
  `toLocaleString` 6 and 6, bare `fetch` 6 and 6, `text-gray` and `bg-gray` 0 and 0.
- Browser, Chromium against the production build on the final tree, 96 checks, none failing:
  - The specimen, 59 of 59: the flip lands 11.4 ms after the click and no `.spinner` ever
    appears; the clipboard holds the raw account number and IBAN while the page displays
    them with spaces and zero-width characters, and pasting into a field gives the raw
    value; the check holds 2 001 ms and the copy icon is back after the fade; a second
    copy inside the hold replays `.pop`, restarts the clock (idle came 2 s after the second
    click) and is announced twice; the accessible name never changes; the region is
    `role="status"`, mounted and empty before the click; Enter and Space copy, focus stays
    on the button and shows a 2 px ring; the labelled variant shows "Copied" while its name
    stays "Copy"; with the API removed the copy command takes over and the secret pastes
    back; blocked, the state is `failed`, the sentence is visible and announced, the
    secret's field is selected, the label does not say "Copied", and it returns after
    4 001 ms; under reduced motion the fade is 0.01 ms and the state still shows and
    returns; the icon button is 44.0 px at 280 and 380 and 40.0 px from 768; no overflow and
    the card inside the viewport at 280, 380 (dark, and right to left), 768, 1280 (dark)
    and 1536; a field on the body cannot be focused while a modal is open and one inside
    the modal can (the premise of the dialog rule, measured); no console or page errors.
  - A real insecure origin, 7 of 7: the container's own address over plain HTTP
    (`isSecureContext` false, `navigator.clipboard` undefined). The old bare call threw a
    `TypeError` there; the button copied through the command and the secret and the raw
    IBAN pasted back; no scratch field was left behind.
  - The storefront order page with the API answered by network mocks, 30 of 30, in English
    and Urdu: each of the three buttons exists once, copies the stored value and says
    "Copied" (in Urdu, its own words); a shipment with no tracking number has no button;
    the tracking line still reads "TCS · TRK-0042"; nothing inside `main` spills past the
    viewport at 280, 380, 768 and 1280; with the clipboard blocked the failure sentence
    shows inside the card at 280, 380 and 1280 and the value's text is selected for a hand
    copy (at 280 the IBAN stays on one line, the button wraps below it and the sentence
    below that). These scripts are one-off and are not in CI.
- The `ux` agent followed `/ux-review` cold on the uncommitted diff, as in the previous
  addendum. Verdict: Ship, with two S2 findings and several S3, and the browser runs above
  were repeated after the fixes. S2, both fixed: the invisible-character class in
  `copy.ts` had been written as literal invisible characters, which is the hazard `CPY-3`
  names (an editor that strips them breaks it silently; the same was true of the
  spec's fixtures), and it missed the Arabic letter mark U+061C that ICU puts around
  numbers in right-to-left text, the soft hyphen and U+206A to U+206F, so it is now escapes
  with those added and a spec for each; and in a narrow card a failure sentence would
  have squeezed the IBAN, so the row now wraps the button and the sentence below the value.
  S3, fixed: the order page's rows select their text when the copy fails (the sentence
  tells the person to select it), a change of `value` resets a check that stood for the old
  one, the scratch field's `16px` is `1rem`, `CPY-5` said "off screen" where the field is
  in the viewport, and the tracking number is `dir="ltr"`. S3, kept: the failure is a
  polite `status` (a failed copy the person just asked for is not urgent and the sentence
  is visible); no test renders the component (there is no harness, already named); and
  while the specimen's failing mode is chosen every copy button on that page fails, which
  is the point of it and only that page has any.

*Not verified:* Firefox, WebKit and Safari (Safari only honours the write inside the
gesture, which the code allows for and which was not measured); real screen-reader speech
(the region's text and the accessibility name were read, not heard); the copy command
inside a real open modal (the premise was measured and the path is unit-tested with fakes,
but no screen has a copy button inside a dialog to click); the admin API-key page in a
browser (it needs an admin session, so `SecretOnce` was seen through the specimen's
labelled variant and by type and build); a high-contrast or forced-colours render; the
Urdu strings (they need a native reviewer).

**Scope lenses.**
The actor, the principal with no permission key, the grant that ends itself, whose rows
and columns, the threshold, the toxic pair, authority and blast radius, audience: n/a, no
actor, grant, row, permission key or message is created; the button copies a value the
page already shows to the person looking at it, and every adopter renders it under the
permission it already required.
Request or record: the copy is a REQUEST the browser may refuse, and the button says so
when it does; no server write is made.
The movement with no address, four hours down, the money lenses (posting rule, columns,
period, second legal entity, dry run, click the number): n/a, no stock, cash or journal
line is read or written.
The three silhouettes and the absent collaborator: the lint and the laws read no
deployment setting; the clipboard API is the one collaborator that may be absent, and the
copy command and then the failed state are what is recorded and shown instead.
The second copy of the write: a second click inside the hold is the case, and it restarts
the clock and is announced again (`nextCopy` counts it; `lib/copy.spec.ts`).
The hundred-thousandth row: n/a, no list; a page has a handful of buttons.
The adoption test, the reversal document, the undo fan-out, the version stamp, the
erasure the ledger cannot obey: n/a, no number, document or personal datum is created.
The failure path: inline, in the control, and nothing is stored, because a copy that
failed has nothing to replay but another click.
Reachable: `/admin/design-system#controls`, in the page's section nav; the order page's
bank and tracking rows; both API-key pages; `CopyButton` in `components/ui/index.ts` and
the "Use what exists" table in `.claude/rules/ui.md`; `check-clipboard` in `pnpm lint`.
No new permission key.

**Separable work orders, named and not built.**
- *Other identifiers.* Adopt `CopyButton` on the admin order and invoice numbers and
  payment references where an operator pastes them elsewhere.
- *A mobile copy primitive* on `expo-clipboard`, with the same five laws.
- *The browser checks in CI.* The runs above are one-off scripts, like the earlier
  addenda's; the web app has no component test harness (already named above).
- *A native review of the Urdu strings* written for the order page.

**Noticed, not changed.** The storefront header's Search and Language buttons end 25 px
past a 280 px viewport (`scrollWidth` 305) on the order page with and without any copy
row, so a storefront page scrolls sideways at the narrowest width. It predates this
change and was left alone. `pnpm check:overflow` is the check that would report it, and
it has not been able to run since CI stops at Apply migrations.


### Addendum — 2026-10-02 (tenth): a button is never round

**Requirement.** The owner, 2026-10-02: "Never use rounded buttons." **Reason.** `PER-3`
already said a pill is a status and nothing else may be one, but nothing checked buttons
and `rounded-full` was deliberately left alive in `tailwind.config.ts` for circles, so
the storefront kept hand-rolled circular icon buttons beside `.btn` and `.icon-btn`,
which already take the house corner. **Outcome.** One button shape, written into the law
that was already there and held by a lint. **Verification.** Below.

**What was built.**
- `PER-3` gained the sentence: a button, link-as-button or icon button wears the house
  corner (`.btn`, `.icon-btn`, `rounded`, which resolves to `--radius`); circles are for
  avatars, dots, spinners and count badges. No new law ID, so the 192 stays 192.
- `check-tells` gained the tell `round-button` (web and POS, `.tsx` and `.css`): a
  `rounded-full` or an arbitrary 999px or 50% radius in the attributes of a `<button>`,
  `<a>`, `<Link>`, `<summary>` or `…Button` component, or in a `.btn…` / `.…-button` rule.
  It walks back from the class to its tag, so a round dot inside a button is not a hit.
  113 self-test cases (109 before).
- 18 lines changed from `rounded-full` to `rounded`: 16 in the web app (dialog close,
  locale switcher, both mobile-menu buttons, header search, bottom-nav item, grid toggle,
  cart badge link, product quick view, three quantity and remove buttons in the cart, the
  product page's two steppers and colour swatches, the design-system dialog specimen) and
  2 in the POS till (the "pending, retry" and "parked" buttons, which were pills). On
  mobile, `theme.radius.pill` became `theme.radius.sm` on the two pressable chips
  (`ui.tsx`, the catalogue filter). Sizes, hover and transitions are untouched.

**Parameters.** No new number. The corner is the existing `--radius`, 2 px (`sharp` in
`THEME_RADII`). The one baseline entry is `switch.tsx`: 1, a ratchet that may shrink and
may not grow, enforced by `check-tells` in `pnpm lint`; a fifth hand-rolled circle fails
the build with `file:line`.

**Decisions made without the owner, all reversible.**
- "Rounded" is read as a circle or a pill, not the 2 px house corner the owner kept on
  2026-10-02.
- `Switch` keeps its pill track and round thumb: it is `role="switch"`, an input holding a
  state, and the pill is what makes a switch read as one. It is the single baseline entry.
- Product colour swatches are `<button>`s, so they became squares with the house corner.
- Count badges, avatars, dots, spinners, progress bars and wizard step dots stay circles:
  none is a button.

**Failure modes.** The lint misses a class assembled from parts, one held in a constant
and passed in, a JSX element passed as a prop ahead of the class (`icon={<X />}`), and
React Native styles, where the two chips were fixed by hand and `theme.radius.pill` is
still used by the wizard dot and the stage-rail bar, which are not buttons.

**Verification.** Run on the final tree. `pnpm lint` exit 0 (`round-button` 1 found, 1 in
the baseline; 118 law citations resolve to 192 laws); `pnpm typecheck` exit 0 (10 of 10
tasks); mobile `tsc --noEmit` exit 0; web 542 tests; `node scripts/check-tells.mjs
--self-test` 113 cases; the four `CLAUDE.md` greps 27, 6, 6, 0, equal to `HEAD`. Before the
change the tell found 19 lines (18 plus the switch). In Chromium on the production build
at 380 and 1280 px: 416 buttons and links on the storefront home, cart and shop pages and
the design-system page paint corners of 0, 2 and 3 px only, none round; the 11 switches
on the design-system page are still pills; an injected `rounded-full` button is detected
and an injected `rounded` one is not. **Not verified.** The cart steppers and remove
button, the product quick view, the product-page steppers and swatches, the dialog close
button and the POS till buttons were not rendered (they need cart or product data, an
opened dialog, or the POS app), so those rest on the lint, typecheck and the one-line
diff; the two mobile chips were not rendered either.

**Scope lenses.** The actor through the money lenses, the scale lenses and the afterlife
lenses: n/a, no actor, row, permission key, write, number or document is created; the
diff changes a corner class on 20 existing controls. Reachable: every changed control is
where it was; `round-button` runs in `pnpm lint`. No new permission key.

**Separable work orders, named and not built.**
- *Unify the hand-rolled icon buttons on `.icon-btn`.* The 16 web sites keep their own
  sizes and hovers; only the corner changed.
- *A React Native check* for `theme.radius.pill` on a pressable.

### Addendum — 2026-10-02 (eleventh): a consistency pass over the whole design system

**Requirement.** The owner, 2026-10-02, holding a "Merge to main" instruction: "resolve any
conflicts in this design system, any inconsistencies, any flow break, any gap, any
duplication". **Reason.** Ten addenda in two days had each been correct when written and
none had re-read the others: a chapter still said "unbuilt" for a thing that was built,
two documents ruled differently on the same control border, a toast was written out
sixteen more times beside the shared one, and four checkers could print OK having read
nothing. **Outcome.** The documents say what the code does, the duplicated or unreachable
pieces are removed or ratcheted, the flow breaks found are fixed, and everything that is a
real choice is listed below for the owner instead of being decided. **Verification.** Below.

**What was built.**
- *Documents made to agree with the code* (12 chapters and the README under
  `docs/design/`, both rule files, two skills, `CLAUDE.md`). Counts and "unbuilt" claims now match the generated
  index (43 primitives, all 8 token groups built, `check-contrast` built, 5 of 10
  integrity checks built, 278 screens); `ACC-4` is the one statement of the touch-target
  rule (44 below `fold`, 48 on the POS, pointer sizes from `fold`); `PER-3` says a status
  is `Badge` and `.pill` is a count chip; `PRM-2` says a role-grantable action is
  disabled with a reason on focus and touch and an irrelevant one is not rendered;
  `SUC-3` says which row a screen belongs to and what is adopted; `MOT-5` names the new
  `layout-motion` tell; `ITG-9` is scoped to what binds today. `ui.md` gained the
  primitive rows it lacked and names the two known conflicts (below) instead of hiding
  them.
- *Flow breaks fixed.* The four customer auth pages (verify email, unsubscribe, reset
  password, forgot password) said what happened and not what to do next (`FLO-7`); each
  now states its remedy (resend the verification email through the new
  `resendEmailVerification` in `customer-client.ts`, ask for a new reset link, change the
  preference from inside the account), with every string in `messages/en.json` and
  `ur.json`. `ConfirmDialog`'s typed-name field kept the last
  name typed when the dialog reopened, so a second delete arrived already unlocked: it
  now resets on open. `Dialog` handed focus back to an opener that a confirmed delete had
  removed, which dropped it on `<body>`: it now lands on the page's `<main>`, which draws
  no ring (a `:focus-visible` rule in `globals.css` for `main[tabindex='-1']`).
- *Duplication removed.* 16 admin files wrote their own toast markup beside the shared
  one and now render `ToastStack`; the order-status transitions were written twice and
  are now `constants/order-transitions.ts`, imported by the orders list and detail pages;
  the toast and upload-tray lifetimes were two separate `4000`s and are now one
  `BRAND.feedback.toastMs`. The two pre-Recharts charts have newer twins of the same
  name; they are marked SUPERSEDED and `check-chart-imports` holds their importers to the
  3 that exist (a ratchet).
- *Checks that could lie, fixed.* `check-tells`, `check-menus`, `check-clipboard` and
  `check-danger` now exit 1 when they scanned 0 files (a moved folder used to turn them
  all green). `check-contrast` now reads `@apply` statements, so the house classes
  (`.btn`, `.field-input`, `.notice`, `.chip`) are measured, which is what moved its
  baselines. `check-tells` gained the tell `layout-motion` and the round-button tell now
  sees a bare `<Button className="rounded-full">`; its self-test is 124 cases (113
  before) over 10 tells (9 before). The index generator reads barrel imports
  (`components/ui/index`), so component usage counts are real, and it now writes the
  primitives table and the two lists the ledger below leans on.
- *Small code fixes.* The storefront nav underline grows with `scale-x` and not `width`;
  `.eyebrow` and `.table-flat thead th` text went from 45% to 60% so they clear the floor;
  the POS button and field corners match the house corner; `Badge`'s docstring says what
  `StatusBadge` adds.
- *Gaps filled.* `/admin/design-system` shows the page-level pieces it had not: header and
  titled regions, the section rail, the filter bar with its skeleton and its empty result,
  page enter, in-place text change and the revealed board
  (`page-structure-specimens.tsx`), each the real component.

**Parameters.**

| Parameter | Exact value | Applies to | Why this number | Where enforced | How it degrades |
|---|---|---|---|---|---|
| `BRAND.feedback.toastMs` | 4 000 ms (unchanged) | a toast that gets no explicit `duration`, and the upload tray after everything succeeded | about twelve words read in 2 to 3 s plus a second to notice it; equals `copyFailedHoldMs`, which also carries a sentence | `hooks/use-toast.ts`, `lib/upload-queue.ts`; `theme-radii.spec.ts` | `duration: 0` stays until dismissed; a failure never hides on this timer |
| `layout-motion` baseline | 1 file: `stitching-panel.tsx` | `transition-[…]` or `transition:` naming a box-changing property, web and POS | the one site is a `max-height` accordion that needs a `Disclosure` rebuild | `check-tells` in `pnpm lint` | a second site fails the build with `file:line`; a fixed site fails until removed from the baseline |
| Superseded-chart importers | 3 files | imports of `components/admin/funnel-chart` or `gauge-chart` | moving them changes what finance and the analytics blocks look like | `check-chart-imports` in `pnpm lint` | a fourth importer fails; a moved one must leave the list |
| Contrast baseline, light | 52 uses (was 43) | colour pairs below their floor | 43 plus 3 in the stylesheet's dividers plus 6 control outlines newly readable through `@apply`: the scope grew, not the debt | `check-contrast` in `pnpm lint` | may shrink, may not grow |
| Contrast baseline, dark | 42 uses (was 39) | the same, dark theme | the 3 stylesheet dividers; the 6 outlines clear the floor in dark | `check-contrast` | same |

**Decisions made without the owner, all reversible.**
- Where a document and the code disagreed, the document was changed to match what was
  measured, except where the document is a rule (`ACC-4`, `PER-3`, `PRM-2`), where the
  rule was kept and the gap is listed.
- The four auth pages' remedy copy and their Urdu strings were written here and are not
  reviewed by a native speaker.
- The 16 toast sites render `ToastStack` exactly as the six before them did, so each gains
  the timer line and the exit the shared one has.
- `Dialog`'s focus fallback is `<main>`, not the nearest heading or the list's first row.
- The unused `components/common/toast-container.tsx` and the 10 primitives no product file
  imports (`Skeleton`, `SkeletonText`, `SkeletonRegion`, `Switch`, `CooldownBanner`,
  `MultiSelect`, `ProgressRing`, `TypeText`, `Bento`, `BentoTile`) were marked and listed,
  not removed: removing a file needs the owner's word.

**Open for the owner (named, not decided).**
1. *The seven screens.* The law names widths 280, 380, 640, 768, 1024, 1280, 1536; Tailwind
   prefixes are 380, 640, 672 (`fold`), 768 and up, so 640 to 767 has no single meaning.
   The mapping is documented, not renamed, and the sweep of 672 to 767 is not done.
2. *Control borders.* Six house-class outlines sit at 1.54:1 to 1.72:1 against the 3:1 floor
   (WCAG 1.4.11) while `ui.md` says controls take `border-neutral-200`: one of the two
   gives way.
3. *Pointer sizing.* Key `.btn`, `.icon-btn`, `.chip` and `.btn-text` to
   `@media (pointer: fine)` and not to `fold`, so a 700 px touch tablet gets touch sizes.
4. *`.btn-text` uppercase and the `.icon-btn` blur, frosted and ping patterns*, which
   `check-tells` does not yet read.
5. *Red and green.* The mobile app (`#b91c1c`), the web (`#B42318`) and the email palette
   are three reds.
6. *Admin and POS words.* 0 of 246 admin `.tsx` files and 0 POS files call a translation
   function; 62 of 94 storefront files do. Decide whether admin and POS are meant to be
   translated.
7. *`/admin/design-system` is reachable in production.*
8. *Adopt or cut* the 10 primitives and the one file above.
9. *Migrate the 3 legacy chart importers*, a visible change; the net-margin gauge has no
   goal to show.
10. *Gate `pnpm format:check`*, red repo-wide at baseline and in no gate today.
11. *The chart palette and heatmap* against the contrast floors; *terminology word
    choices* the table does not settle.
12. *The stitching accordion* (`max-height` 0 to 4 000 px, which also leaves a collapsed
    control reachable by Tab).
13. *Older items still open:* the milestone ledger; the open redirect through `?next=` on
    register and login; `FileInterceptor` limits on the API; `upload-rules.ts` written
    twice; `Switch` pill and square swatches; the dead `.chart-line` and `drawLine`; a
    React Native round-button check; motion tokens on mobile and the POS.

**Adoption-debt ledger** (a count that exists so it can shrink; none is a regression from
this pass; measured on the final tree with `git grep` over `apps/web/src`, line-based,
so each is approximate to a few sites).
- Forms: 56 files hold a `<form`, 2 of them use `Field` and none uses `FormStack`.
- Menus: 75 native `<select` in 50 files against 42 `<Select` elements.
- Page headers: 75 files write their own `<h1`; 148 files use `PageHeader`.
- Browser dialogs: `confirm()` 7 call sites, `prompt()` 38 in 11 files, `alert()` 1.
- Empty states: 96 `EmptyState` elements, 25 with an action (`ITG-1` wants a way out).
- Confirmations: 38 files raise a toast, 7 use `SuccessState`.
- Formatting: 6 `toLocaleString` or `toLocaleDateString` uses; 7 files build a `FormData`
  by hand beside the upload queue.
- Not re-counted here and so not quoted: hand-rolled icon buttons, `DataTable` empty and
  loading states, a toast action for undo, `Button` `blockedBy` (about 45 sites hide an
  action outright), `ErrorState`, drawers and scroll lock, fonts, mobile contrast and
  literals, POS error notices.

**Failure modes.** `check-contrast` still cannot see a colour assembled at run time or a
surface it cannot know without a render. `layout-motion` misses a transition set from a
constant or a style object. The index's usage counts follow imports it can resolve; a
component reached by a name it cannot see appears unused. The new specimens are not
visual-regression tested (there is none).

**Verification.** Run on the final tree. `pnpm lint` exit 0 (turbo 9 of 9 tasks; contrast 52 light and 42 dark
known-below-floor uses, both within baseline; `check-tells` within baseline with `layout-motion` 1 and
`round-button` 1; chart imports OK with 3 baselined importers; 126 law citations resolve to 192 laws);
`pnpm typecheck` exit 0 (10 of 10 tasks); tests web 542, shared 408, pos-core 28;
`pnpm --filter @newax/web build` exit 0; `node scripts/check-tells.mjs --self-test` 124 cases; the four
`CLAUDE.md` greps 27, 6, 6, 0, equal to `HEAD`. In Chromium on the production build: the auth flows and the
three new specimen groups 14 of 14 checks, run four times, with 0 page errors in three runs and one React
hydration error (#418) in one; it did not recur in three further runs or in 48 loads of the eight changed
pages at 380 px, and that first run did not log which page raised it, so it is reported and not explained.
The dialog checks pass 7 of 7 with 0 page errors, and the same script against the old `ConfirmDialog`
failed the two reopen checks (the field still held the name and confirm was still unlocked), so the bug
was real before the fix and gone after it. **Not verified.** The API test suites on the final tree (they
need `DATABASE_URL` and Redis, which this environment lacks; 70 suites failed for that reason on the last
run); the `overflow` job (it needs the seeded stack); CI (red on every head at "Apply migrations" with
`extension "vector" is not available`, a database-image problem separate from this diff and awaiting the
owner's word); the Urdu wording by a native speaker; the 16 migrated admin pages rendered (they need the API
and a login, so they rest on typecheck and the shape of the diff); the POS corners rendered; and the new
specimens across the seven widths.

**Scope lenses.** The actor through the money lenses, the scale lenses and the afterlife
lenses: n/a, no actor, row, permission key, write, number or document is created. One
parameter moved into `BRAND`, value unchanged. Reachable: the specimens are on the
existing `/admin/design-system` page; every changed check runs in `pnpm lint`. No new
permission key, no migration.

**Separable work orders, named and not built.**
- *Bug found, not fixed:* the stitching panel's "save measurements" never saves (the
  request very likely fails API validation); it needs the API contract read and its own
  change.
- *One shared file walker* for the checkers, which each carry their own.
- *`check-tells` for `TYP-3` and `GLO-7`.*
- *Button `blockedBy`, a toast action (undo), `ErrorState` adoption* and the rest of the
  ledger above.

## ADR-084 — Hospitality QR/NFC platform: the guest is a token-scoped principal, not a `User`; one order system through an extension point

### Context

Docs 213–219 (`hospitality-qr-nfc/`) specify a sector pack where a guest scans a
QR code or taps an NFC tag bound to one table or room and orders with no app and
no login. Two questions needed an answer before any schema: who the guest is to
the permission system, and whether a guest order is a new order system.

### Options Considered

1. **Guest as a `User` (auto-created anonymous account).** Rejected: every
   scan would create a row in the table PBAC, deactivation and erasure all
   key on, and a guest would be one missing guard away from a staff route.
2. **Guest as a token-scoped principal (chosen).** A signed, expiring
   `GuestSession` token authorises exactly one Space; a separate controller set
   and `GuestSessionGuard` serve it.
3. **A separate hospitality order and billing system.** Rejected: duplicates
   tax, discount, payment and ledger posting that core `Order` already carries.
4. **Guest orders become core `Order`s through `HospitalityOrderSink` (chosen).**

### Decision

Options 2 and 4. Guest endpoints have no `@RequirePermission`; they are
token-scoped and annotated as such for `check-route-permissions.mjs`. Tags carry
an opaque 128-bit `publicCode`, never a table number.

### Parameters

See doc 214 §5 (session TTL 4 h sliding/12 h max for tables, 24 h for rooms;
30 scans/min per tag; 60 scans/min per client; 20 guest writes/min per session;
50 lines and qty 20 per order; 3 open unconfirmed orders per Space) and doc
216 §4 (SLAs). Each lives in `Setting`, audited on change.

### Reasoning

Keeps the permission model intact, keeps one books-of-record, and lets payments,
POS, loyalty and WhatsApp attach later without changing the order shape.

### Consequences

A new public, unauthenticated-by-password surface needs rate limiting and abuse
policy (`requirePresence`) from day one. Guest PII (optional name/phone) needs
a retention window (default 90 days) and pseudonymisation.

### Status

Proposed. Nothing built.

## ADR-085 — Housing society pack: a plot is a unique-asset registry with one writer, outside `InventoryService`; the booking lifecycle is an append-only `BookingTransaction` record set

### Context

Docs 220–230 (`housing-society/`) specify a sector pack for housing societies:
plots and files, bookings, transfers, merges, rebooks, refunds, installments,
receipts, accounting, complaints, visitors, and Excel import. Two modelling
questions needed an answer before any schema: is a plot stock, and how is a
booking changed after it exists.

### Options Considered

1. **Plot as a product variant moved by `InventoryService.move()`.** Rejected:
   that service guards counted quantity; a plot is unique and has ownership,
   not a count. Forcing it through stock would blur the one-writer invariant.
2. **Plot as its own registry with one writer, `PlotRegistryService`, using
   predicate-on-write status changes (chosen).**
3. **Edit the booking row on transfer/merge/rebook.** Rejected: history is
   lost and an undo becomes guesswork.
4. **Append-only `BookingTransaction` rows, current state derived and checked
   against them (chosen).**

### Decision

Options 2 and 4. All money goes through core `accounting`, `receivables` and
`payments`; people through `Party`; complaints through `support`/`tasks`. No
second ledger, people table or ticketing system. Industry-specific: the pack is
gated by `MODULES`, core never imports it.

### Parameters

Late-fee defaults (10-day grace, 2%/month simple, 25% cap, nightly 02:00 run),
complaint SLAs (24 h acknowledge, 5 working days resolve, 24 h urgent), import
limits (25 MB / 200,000 rows, 500-row chunks, 30-day staging purge, 5 uploads/h)
are proposals in `Setting`, versioned and audited, to confirm per client.

### Reasoning

Keeps one writer per invariant, keeps one books-of-record, and lets every
future service (maintenance billing, utilities, dealers, online payments)
attach without changing the booking or ledger shape.

### Consequences

Plot status needs a replay check against `PlotStatusEvent`. Revenue-recognition
policy must be recorded per client. The meaning of "SAMs" in the source feature
list is assumed, pending the owner.

### Status

Proposed. Nothing built.

## ADR-086 — Launchpad apps: a static, presentation-only first-party manifest with tier/sector/audience tags; Mail as a control plane over a mail engine; Auction bids as predicate-on-write records

### Context

The owner is building an Odoo-style launchpad that groups modules into mini
apps (core and industry-specific, tagged B2B/B2C/C2C) and approved three new
apps: Mail, Auction, and a Vault & Work Credit app (docs 232–235). Docs
184–195 already define a different thing — third-party directory apps that are
always remote services (ADR-073). `MULTI-SECTOR.md` already rules that business
models cut across sectors.

### Options Considered

1. **App = module with declared dependencies (Odoo-style).** Rejected: turns app
   dependencies into code dependencies and breaks module independence.
2. **App = presentation manifest over independent modules (chosen).**
3. **Audience (B2B/B2C/C2C) as a folder/category.** Rejected: one app belongs to
   several; the repository already treats business models as cutting across
   sectors. Chosen: three tags — tier, sector, audience.
4. **Build a mail server.** Rejected: deliverability, spam, storage and abuse
   are an operations burden. Chosen: control plane over a mail engine (doc 13's
   Stalwart) behind an interface, gated on proof-of-concept spikes.
5. **Ship C2C auctions in the first release.** Rejected: needs escrow,
   reputation and dispute handling the platform lacks. `C2C` is a reserved tag.

### Decision

Options 2, 3, 4, and a B2C/B2B-first auction. The launchpad resolves tiles
server-side from permissions, `MODULES` and a per-tenant `AppEnablement`
setting. Directory (third-party) apps appear as tiles but their trust model
(doc 184 §2) is unchanged.

### Parameters

See doc 233 §6 (quotas, send limits, retries), doc 234 §12 (increment 5%,
anti-snipe 2 min / 30 min cap, 10 bids/min, 72 h payment window, 3 strikes,
2-of-3 sealed opening, hot-lot 50 bids/s). All are proposals in `Setting`,
versioned and audited.

### Reasoning

Keeps module independence and the third-party boundary intact, uses tags where
the domain is genuinely multi-valued, avoids owning mail infrastructure, and
puts the one hot concurrency invariant (current bid) behind one writer.

### Consequences

A new `check-launchpad` lint. Mail depends on spikes S1–S3 passing. Auction
deposits depend on a `payments` hold capability not yet verified, so v1 may run
without deposits. Auction legality needs per-market review. C2C stays unbuilt.

### Status

Proposed. Nothing built.

### ADR-086 addendum (2026-10-02) — vault protection mode: both ship, chosen per vault, no default

Owner decision, "keep both for now": sealed vaults support `CLIENT_SIDE` and
`SERVER_HELD` protection modes, selected by a vault's owners at creation, with
no global default (`vault.defaultMode` unset until the owner sets one).
Reasoning: neither mode dominates (confidentiality from the operator vs.
recovery and search), and the owner chose not to decide for every client in
advance. Cost accepted: two key providers behind one `VaultKeyProvider`
interface, and two sets of key-handling tests. Downgrade to `SERVER_HELD`
needs every owner; upgrade destroys the server-held key. Revisit with usage
evidence after the first client vaults. Doc 231 §3.3 holds the detail.

### ADR-086 addendum (2026-10-02) — WO-234.1 foundation: what was fixed, and the Int32 price ceiling

Built: `Auction` and `AuctionLot` (additive migration `20261002180000`), the
admin API and screens, three permissions, and the `auction` module, off by
default. The parameters below are exact, per the "exact parameters" rule.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Price ceiling | 2,147,483,647 minor units | `startPriceMinor`, `reservePriceMinor` | Money is `Int` minor units repo-wide; Postgres `INTEGER` is 32-bit. Widening only the auction columns would make them the one `BIGINT` money column | `@Max(MAX_MINOR)` in `auction.dto.ts`; `INTEGER` is the backstop | 400 with the limit named. **Open:** widen to `BIGINT` before WO-234.2 adds `Bid.amountMinor`, and before any real-estate or vehicle lot is listed |
| Number allocation | advisory lock namespace `8_241_170`, key = year; MAX scan of `AUC-<year>-%` | `Auction.number` | Same pattern as every other document number; the next free namespace in this repository | `nextAuctionNumber()` in a transaction | Concurrent creates queue on the lock; the `number` unique index is the backstop |
| Per-auction serialisation | `SELECT … FOR UPDATE` on the `Auction` row, first statement of every mutation | schedule, unschedule, cancel, lot add/edit/withdraw | "Schedule" and "withdraw the last lot" must not both win, and `lotNo` must stay gapless under concurrent adds | `lockAuction()` | A losing request waits, then re-reads and is refused or no-ops; repeated transitions write no second audit row |
| Text limits | title 160, terms 5,000, cancel reason 300 characters; quantity 1 to 1,000,000 | DTOs | Long enough for a real lot description and legal terms, short enough to keep a list page cheap | class-validator | 400 |
| Role grants | `auction.view`, `auction.manage`, `auction.publish` to the Admin role only; sensitivities low, medium, high | permission catalogue and migration `20261002180100` | The three keys are not toxic with one another today. `auction.publish` is high because it makes an auction visible to bidders | `ROLE_PERMISSION_SEED` for new deployments; the migration for existing ones, because `seedRoles()` runs once | An unreachable permission is a defect, so the migration is idempotent (`ON CONFLICT DO NOTHING`) and grants only to a permission with no grant yet |

Pillars touched: architecture (the module imports no other module; the launchpad
manifest entry is carried by WO-232.2), secure by design (every route states a
permission; the reserve price is stripped from any read by a caller without
`auction.manage`), stable and reliable (row lock, idempotent transitions,
forward-only hand-written migrations tested on a scratch database from an empty
state and from a simulated existing deployment). Observability is audit rows on
every state change and Nest `Logger`; no metrics backend exists to wire in.

Known gaps, stated rather than hidden: auction start and end are entered in the
browser's time zone and stored as UTC, so the admin screen shows what was
typed only on the same zone; there is no BigInt price path yet (above); the
`OPEN` status badge keeps its neutral tone from the shared task state until
WO-234.3 opens lots for real.

### ADR-086 addendum (2026-10-02) — WO-234.2 bidding: the BIGINT decision made, and the exact parameters

The open decision in the WO-234.1 addendum is closed: `AuctionLot.startPriceMinor`
and `reservePriceMinor` are `BIGINT` (migration `20261002190000`, which widens in
place and keeps every value), and `Bid.amountMinor` is `BIGINT` from its first
day. Money elsewhere in the repository stays `Int`; the auction is the one
exception, contained at the service boundary (every lot and bid leaves
`AuctionService` as a plain number, so JSON never meets a `bigint`). The ceiling
is 10^15 minor units; the reasoning is in doc 234 §12.

Built: `placeBid()` (one writer of a lot's price), `Bidder` and `Bid`,
`verifyBids()`, the bidder route and the admin ledger. Two supporting changes
outside the auction module, both additive: `core/common/hash-chain.ts`, the
tamper-evident chain doc 231 §2.3 also names, as pure functions with no
dependency, so doc 231's `WorkContribution` calls the same code; and
`AllExceptionsFilter` now passes a vetted `code` (SCREAMING_SNAKE_CASE) and flat
`details` (at most ten primitive values) from an exception to the response, so a
client can tell "BID_TOO_LOW" from "AUCTION_ENDED", both a 409. Before this the
filter replaced every exception's `error` with the HTTP status name, which made
the `error: 'INVALID_MEASUREMENTS'` the measurements module sets unreachable by
clients; that module is untouched and can adopt `code` when it needs to.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Price ceiling | 10^15 minor units | every `*Minor` on a lot or bid | Largest round number whose 5% step and the sum with it stay below 2^53 − 1 (9.007 × 10^15); `computeIncrement` multiplies in `BigInt` regardless | `@Max(MAX_MINOR)`; `BIGINT` is the backstop | 400 naming the limit |
| Minimum raise | max(ceil(current × 500 / 10 000), `toMinor(1)`) | `minimumNextBid()` | 5% takes about 15 raises to double a price; one whole currency unit is the smallest step a person calls a raise | `placeBid()`; copied onto the auction at `schedule()` from Settings `auction.bid_increment_bps`, `auction.bid_min_step_minor` | A missing or malformed field falls back to its default, field by field |
| Lot lock | `pg_advisory_xact_lock(8_241_171, hashtext(lotId))`; bidder provisioning `8_241_172` keyed by auction id | `placeBid()` | Serialises writers of one lot so the loser re-checks against the new price; the second lock keeps "Bidder N" gapless. Lock order is always lot, then bidders | the transaction | A waiter queues up to `maxWait`, then a 503 |
| Bid transaction | `maxWait` 10 000 ms, `timeout` 10 000 ms | `BID_TRANSACTION` | Prisma's 2 000 and 5 000 refuse a healthy hot lot in a final-minute rush; 10 s drains the 50 bids/s target through a pool of ten and still fails visibly | Prisma | 503, "your bid was not placed", nothing written |
| Attempts | 3 whole attempts | `MAX_BID_ATTEMPTS` | A bound on a bug, not a tuned number: the lock makes a lost predicate rare | `placeBid()` | 409 `LOT_CHANGED` |
| Per bidder per lot | 10 accepted bids per rolling 60 000 ms | `assertWithinBidRate()` | Unreachable by hand, reachable by a script; doc 234 §12 | counted from the ledger via the `(bidderId, acceptedAt)` index, so every node agrees without a shared counter | 429 `BID_RATE_LIMITED`, `Retry-After` set |
| Per client address | 60 requests per 60 000 ms | `POST /auctions/lots/:lotId/bids` | One a second sustained; ten bidders behind one office address still get six a minute each | `@Throttle`, Redis-backed `SharedThrottlerStorage` | 429; a Redis outage follows the throttler's existing per-route policy |
| Chain verification page | 1 000 bids per read | `verifyBids()` | A lot with 100 000 bids is never in memory at once; keyset on `seq` | the loop | none; read-only |

Pillars touched: architecture (the module still imports no other module; the
hash chain is core and pure), secure by design (the bid route is
`@AuthenticatedOnly` on purpose, closed to API keys by having no `CustomerScope`;
staff who run an auction are barred from bidding on it by data; no response
carries a user id, the reserve or the idempotency key; the admin ledger shows
aliases), stable and reliable (one transaction per bid, a retry of an accepted
key answered from the record even after close, the unique indexes behind the
lock, a refused first bid burning no alias), observable (`Logger` at `debug` for
an accepted bid, `warn` for a lost predicate or a timeout; no `AuditLog` row per
bid, because the hash-chained `Bid` ledger is the record and a row per bid
would double the write volume of the hottest path).

Known gaps, stated rather than hidden: nothing opens an auction until WO-234.3,
so bids exist only in tests; the bidder-facing bid box is WO-234.4; the §6 load
test needs the realtime path; staff identity-barring by `Party` link is WO-234.5;
`Bid` is not partitioned by month yet (doc 234 §4).


### ADR-086 addendum (2026-10-02) — WO-234.3 proxy bidding, anti-snipe and the close job: exact parameters

Built: `ProxyBid` and `AuctionResult`, per-lot `endsAt` and `extendedMs`
(migration `20261002200000`, additive), `setProxyBid()`, `placeBid()` rebuilt as
a commit pipeline, `AuctionLifecycleService` and `AuctionLifecycleCron`. The
module still imports no other module; the only core additions are three Settings
keys and the reuse of `encryptSecret()`.

Decisions, each with the alternative it displaced:

- **One commit writes a manual bid and at most one system answer, as consecutive
  links of the same chain, with one guarded `UPDATE`.** The alternative, a second
  transaction for the answer, would let a reader see a lot led by the manual
  bidder for a moment and would let a crash between the two lose the answer.
  Both bids carry the one `acceptedAt` the database clock gave under the lot's
  lock; their `seq` orders them.
- **One answer, never a ladder.** `resolveProxy()` jumps straight to the price
  the leader would have reached, so a 10 000-to-1 gap between two maxima costs
  one ledger row. The ladder (an auto-bid per increment) would have made the
  hottest path write amplification proportional to the gap.
- **A maximum is encrypted, raise-only and owner-readable.** AES-256-GCM with the
  existing `APP_ENCRYPTION_KEY`; lowering is refused because a maximum that could
  be pulled lets a bidder frighten others off with a number never meant; a raise
  counts as a new offer placed now and loses its place in a tie. Rotating the
  key means re-encrypting `ProxyBid` rows; there is no automatic migration of
  ciphertexts, which is an open item for key-rotation work, not for this one.
- **The lot closes `OPEN → CLOSED` directly.** No status between the end and the
  result needs protecting, and the auction's row is locked before the count of
  what is left, so two lots of one auction closing together cannot each see the
  other open and leave the auction open for ever (tested).
- **An outage extends, it never closes.** A lot found more than 60 s past its end
  is given 120 s from now once, audited, and outside the anti-snipe cap.
- **No domain event yet.** Nothing consumes one; WO-234.6's `AuctionOrderSink`
  will, and will define `auction.lot_closed` from the `AuctionResult` row then.

| Parameter | Exact value | Applies to | Why this number | Enforced | Fails how |
|---|---|---|---|---|---|
| Anti-snipe window | 120 000 ms (Settings `auction.anti_snipe_window_seconds` 120), a bid exactly at the edge is inside | a bid's effect on a lot's end | Long enough to read "you were outbid" and answer | `antiSnipeExtensionMs()` in `commitBids()`, snapshot on the auction at `schedule()` | missing or malformed → default, field by field |
| Anti-snipe extension | 120 000 ms (`auction.anti_snipe_extend_seconds` 120; 0 switches it off) | one commit | As long as the window, so a lone late bid always leaves one full window | same | same |
| Anti-snipe cap | 1 800 000 ms per lot (`auction.max_extension_seconds` 1 800) | a lot's total extension | A war ends within half an hour; staff and sellers can plan | same; the last extension is cut to what is left | no further extension |
| Standing maximum | ≤ 10^15, ≥ the next bid (a leader's: ≥ their bid), never lowered | `setProxyBid()` | A maximum below the next bid could never be used | the service | 409 `PROXY_TOO_LOW`, `PROXY_CANNOT_LOWER` |
| Proxy route | 30 requests per 60 000 ms per client address | `PUT /auctions/lots/:lotId/proxy` | Half of a bid's allowance: a decision, not a race; slows a probe for another bidder's maximum to one per two seconds on top of the lot lock | `@Throttle`, Redis-backed | 429, nothing changed |
| Bid rate count | manual bids only | `assertWithinBidRate()` | The system's answers are not the bidder's doing; counting them would let a bidding war lock a proxy holder out | the query's `kind: 'MANUAL'` | — |
| Job cadence | every 15 000 ms, 100 auctions and 100 lots a run, a run skipped while the last still goes | `AuctionLifecycleCron` | 15 s is how soon a result appears; 100 a run is 400 a minute against a handful of auctions; a backlog drains over runs | the cron, idempotent by predicate | a failing lot is logged and left for the next run |
| Outage grace and extension | found > 60 000 ms late → extend to 120 000 ms from now, once | `closeLot()` | 60 s is four missed runs; two minutes is the same window as anti-snipe | `OUTAGE_GRACE_MS`, `OUTAGE_EXTENSION_MS` | a longer outage extends again on the next recovery |

Pillars touched: architecture (no new import between modules; the proxy maths is
pure and the pipeline shares one `commitBids()` for a bid and a maximum), secure
by design (a maximum is encrypted at rest and readable by its owner alone, not
by staff and not in the ledger; the proxy route is `@AuthenticatedOnly` with no
`CustomerScope`; staff who run the auction cannot set one), stable and reliable
(close and open are idempotent by predicate and under locks, safe on every node
at once with no leader; a failing lot never blocks the batch), observable (`Logger`
at `log` for each open and close, `warn` for an outage extension, `error` for a
failure; `AuditLog` rows for `auction.opened`, `auction.lot_closed`,
`auction.closed` and `auction.lot_extended_after_outage`, none per bid).

Known costs and gaps, stated rather than hidden: every bid decrypts every
standing maximum on its lot, a few microseconds each and bounded by the bidders
who hold one, so it is cheap for the 50 bids a second target and would want a
per-lot cache under the lot lock only if one lot ever carries thousands of
maxima; a bidder still has no screen to bid from, and learns they were outbid by
a maximum only from the response to their own request or the next read of the
lot, until WO-234.4's realtime path; the §6 load test is WO-234.4's;
reserve-not-met leaves staff to make an offer by hand until WO-234.6 gives them
somewhere to do it.
