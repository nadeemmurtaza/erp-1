# Working in this repository

Read this before writing code. It is loaded automatically for every agent
session opened anywhere in this repo, which is the point: the rules used to
live only in one person's private global config, so a teammate's agent, a
cloud run or CI saw none of them.

The long form is [`docs/implementation/00-HOUSE-RULES.md`](docs/implementation/00-HOUSE-RULES.md).
That file is the contract; this one is the part you must not miss.

---

## The seven laws

Binding on every surface — admin, storefront, customer account, mobile, API.
If a detail elsewhere disagrees with a law, the law wins.

1. **No hardcoding.** No brand, locale or design literal in application code.
   Colour, radius, type step, currency, dial code, timezone, company name,
   support address — every one resolves through an import from
   `packages/shared/src/brand.ts`. The only exception is Newax's own
   attribution and the `@newax/*` package scope.
2. **Hide complexity in depth.** Power is never removed, only moved. Nothing
   is deleted to make a page calm; it goes one level down.
3. **It should feel like there are only a few features.** The test the other
   laws serve. If a page makes the product look big, the page is wrong.
4. **Seven screens, no dead space.** `xs` 280 · `sm` 380 · `fold` 640 ·
   `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536. None may waste its space.
5. **One main job per page.** Two jobs is two pages.
6. **No clutter at all.** Ships when nothing visible could be removed.
7. **Overview first, detail on click.** Never render the detail of everything.

---

## Software engineering, not vibe coding

Every rule in this file and in the NEWAX Engineering Operating Protocol
further down exists to keep this repository on one side of a single line:
architecture over improvisation. A system that is understood before it is
built, not assembled by trial and error against a running app and never
revisited. This section makes that binding, explicitly, project-specifically,
with no exception for "it's a small change."

No agent, developer, or automated process working here vibe-codes: no
unstructured trial-and-error against a running app, no quick fix stacked on
a quick fix, no "make the error go away" without understanding why it
appeared, no code shipped because it happened to work once. Every change
traces to a requirement, is scoped before it is written, and is verified by
a command, not by eyeballing a screen.

### Flexibility, resilience and innovation outrank everything else here

When a choice below trades off against one of these three, these three win.
A locally tidy shortcut that forecloses a future capability is the wrong
trade even when it ships faster today — that is the whole reason the
module-pack architecture and the three-axes model exist instead of a
simpler design that would have been faster to write once and impossible to
extend twice.

- **Flexibility first.** The module-pack system, extension points and
  domain events exist so that a new sector, a new brand, a new payment
  provider, or a capability nobody has asked for yet is a new file, not a
  rewrite of an existing one. Before choosing an implementation, ask which
  option leaves more doors open for a requirement not yet known, and take
  that one — even at a small cost today. Never hardcode an assumption
  ("there is only one of these," "this never changes," "nobody will need
  X") without writing down, next to it, why that assumption is safe.
- **Resilience first.** The transactional outbox, idempotent event
  handlers, predicate-on-write guards, and R5's "a sale that already
  happened is never rejected by sync" are all instances of one rule: the
  system keeps working, or degrades honestly and recoverably, when a
  dependency is slow, offline, partial, or wrong — it never silently loses
  or corrupts a fact. Every new integration point states its failure mode,
  its retry/idempotency story, and its recovery path before it ships, not
  after an incident forces the question.
- **Innovation first.** The architecture must not calcify around today's
  feature set. A change that makes tomorrow's plausible feature (a new
  sector, a new channel, a new tier of the business) measurably easier to
  build is worth more than a change that only makes today's feature
  marginally cleaner. When the two trade off, choose the one that keeps
  optionality open, and say so in the plan.

This ordering does not excuse skipping the rest of this section — it
explains *why* the rest of this section is strict. Proper architecture,
security and observability are how flexibility, resilience and innovation
stay possible at scale, not competitors to them.

### The five pillars, made concrete for this codebase

A generic engineering principle is useless until it names where it lives.
Each pillar below states the actual mechanism THIS repository uses — not an
aspiration, not a diagram — and, where nothing enforces it yet, says so
honestly rather than pretending it does.

| Pillar | What it means here | Enforced by |
|---|---|---|
| **Proper architecture** | Module packs, the core/pack boundary, `KNOWN_MODULE_COUPLINGS` as the only sanctioned cross-module coupling, domain events and extension points instead of direct calls (see "Scale: the three axes" below, `ENTERPRISE-SCALE.md`). | `scripts/check-module-boundaries.mjs`, run by `pnpm lint` and CI |
| **Scalable systems** | The sector/brand/branch axes, the node/replication model for chain deployments (`RETAIL-ERP.md`), pagination on every list endpoint, N+1 prevention, indexing justified by real query patterns (see Performance engineering below). | Partially — pagination and index discipline are code review today, not a lint rule |
| **Secure by design** | Permission-based access control (PBAC) — every route states its `@RequirePermission`, checked server-side only, never trusted from the client; tenant/branch isolation via scoped queries. | `scripts/check-route-permissions.mjs`; enforcement is `core/auth`'s `PermissionGuard`, applied globally |
| **Stable & reliable** | The transactional outbox (`EventBusService` + `OutboxDispatcher`) for at-least-once event delivery, idempotent event handlers, predicate-on-write for concurrent stock changes (House Rule 10), hand-written forward-only migrations — never `migrate diff` against a real database. | `pnpm test`; the migration discipline itself has no automated guard — a reviewer's job |
| **Observable** | Structured logging via Nest's `Logger` in every service (never `console.log`), an audit trail (`AuditService`) for state-changing actions, domain events as a natural trace of what happened and when. | Not yet: no APM, error tracker, or metrics backend is wired in this codebase today. Adopting one is a decision for `docs/implementation/DECISIONS.md`, not something to silently assume exists. |

### Mapping a reference architecture diagram's boxes

A "software engineering" reference architecture names infrastructure pieces
— API Gateway, Load Balancer, Services, Databases, Cache, Monitoring,
Logging, Security — as separate deployed services. This repository is a
**deliberate modular monolith** (`ENTERPRISE-SCALE.md`, `RETAIL-ERP.md`): one
NestJS process per node, not a microservice mesh. That choice is already
made and is not reopened by this section. The boxes still have to exist —
they live inside that choice, not beside it:

- **API Gateway** → the single NestJS entrypoint's own hardening: a global
  `ValidationPipe`, API versioning, `JwtAuthGuard` + `PermissionGuard` on
  every route, the `CORS_ORIGINS` allowlist. Not a separate gateway process.
- **Load Balancer** → not applicable at today's single-process-per-node
  scale. When a node needs horizontal replicas this gets a real answer in
  `DECISIONS.md` before it gets an env var — never assumed into existence.
- **Services** → the module-pack system itself; each module is the unit the
  independence rules already govern.
- **Databases** → Postgres via Prisma, one database per node (`RETAIL-ERP.md`
  R2/R7), hand-written forward-only migrations.
- **Cache** → `VariantSalesStat`-style precomputed caches, HTTP/application
  caching per the Performance engineering table — each with a stated owner,
  key and invalidation strategy, never introduced silently.
- **Monitoring / Logging** → structured `Logger` output today; no APM is
  wired — see the Observable row above. Never claim monitoring exists where
  only logging does.
- **Security** → PBAC, server-side enforcement, the Security engineering
  section below — never a client-side check standing in for one.

### No compromise

These five pillars are not aspirational language to skim past. A
non-trivial change states, in its own plan or PR description, which pillars
it touches and how — the same discipline "Plan before build" below already
asks for, made explicit here so it cannot be silently dropped. A change that
weakens module independence, skips permission enforcement, ships without a
migration reason, or adds a cache with no stated invalidation strategy is a
defect, not a shortcut — no exception for urgency, and none for a small diff.

---

## Feature scope: build the whole capability, not one slice of it

The owner's own standing instruction, stated directly and repeated because it
was under-applied: naming a feature is not a request for the narrowest
technical thing those words could mean. Building "a cart" is not done at
add/remove line items — a cart nobody can check out with was never a
complete feature, only a fragment presented as one. This section is the
method for finding the rest of it, every time, before calling anything done.

### The worked example, in the owner's own words

> Cart depends on saved addresses, shipping methods, payment methods, voucher
> and discount application — the customer cannot complete a purchase without
> them. The merchant side needs an abandoned-cart tracker, stage-of-abandonment
> visibility, transactional email to bring the customer back. After a sale
> completes, the customer can return it — so a return-item portal and a
> written return policy are part of the same feature, not later work. Real
> payment and delivery-partner integrations are part of it, not a status enum
> standing in for one. Vouchers imply voucher creation and management, not
> only redemption at checkout.

Generalize this to every feature request with five lenses, run **before**
implementation, as part of "Plan before build" below:

1. **The transaction, start to finish.** What does the actor — customer,
   till user, merchant — need, end to end, to complete the real job the
   feature exists for? A feature that cannot carry a real transaction to
   completion is not complete, whatever fraction of it is finished.
2. **The other side of the same transaction.** Every customer-facing
   capability has an operator-facing twin: reporting, exception handling,
   intervention. Cart's twin is the abandoned-cart tracker; an order's twin
   is the fulfilment queue; a return's twin is the refund approval screen.
3. **What happens after "done."** A completed purchase is not the end of a
   feature's life. Returns, cancellations, disputes and refunds are checkout's
   own back half, not later add-ons — a feature that only runs forward is
   half a feature.
4. **The integrations a real business needs, not a demo.** A payment method
   is a real gateway integration; a shipping method is a real delivery-partner
   integration with rate, label and tracking. If the feature cannot go live in
   front of a real customer without a piece existing, that piece is part of
   the feature.
5. **The policy/rules layer that governs it.** Vouchers imply management, not
   just redemption. Discounts imply a rules engine, not a hardcoded
   percentage. A return flow implies a written policy the flow actually
   enforces.

### What this means for scope

- Before implementing a named feature, run the five lenses and **write down
  the resulting map** — what's in the transaction, the operator's twin, the
  after-completion lifecycle, the implied integrations, the policy layer.
  This is the "Plan before build" section below, made specific to features.
- Build the feature **and** everything the map surfaces that it cannot
  function as a real, sellable capability without. The test: could a real
  customer complete a real transaction, and could a real merchant run their
  business on it, without the piece in question? If no, it is in scope now,
  not a future work order.
- Anything the map surfaces that is a genuinely separable, larger capability
  on its own — a full CRM, a loyalty program, multi-provider payment
  orchestration — is never silently stubbed and never silently skipped
  either. Name it, plan it, and sequence it as its own explicit next work
  order — the same discipline RETAIL-ERP.md's own tranches already use,
  surfaced to the owner, never buried in a PR description nobody reads.
- Every piece that ships must also be reachable: the minimum UI to actually
  perform it, a nav entry so it's found by clicking rather than typing a URL,
  and every permission it needs seeded all the way through to a real grant a
  live user holds — not just the `Permission` row (`seedPermissions()` vs.
  `seedRoles()`'s one-time migration is this repo's own tracked instance of
  that trap; do not repeat it on purpose).

### The boundary, stated plainly

This is this repository's default scoping posture for a named feature or
capability request — it replaces "ship the narrowest thing the literal words
require." It does not license scope creep on a bug fix, a one-line change, or
a request that is already narrow and complete on its own terms; *Change
minimization* and *No speculative functionality* below still govern those.
The distinction is the test in the second bullet above: something the named
feature cannot work as a real capability without is **required**, not
speculative, however far it reaches — a discount-code field on checkout with
no voucher management behind it is not a smaller version of the feature, it
is a broken one.

---

## Scale: the three axes

This repository serves several sectors, several clients, and clients with
several branches. Almost every "can it also do X?" is one of three questions,
answered in three different places. Confusing them is how a codebase ends up
with a branch per client.

| Axis | Question | Lives in | Never |
|---|---|---|---|
| **Sector** | what kind of business | a module pack + the `MODULES` allowlist | a git branch, a fork, `if (sector === …)` |
| **Brand** | which business | `packages/shared/src/brand.ts` | a literal in application code |
| **Branch** | where it happened | a `Location` row on the movement; at chain scale, a node with its own database | an unscoped read, or stock replicated as a total |

> A branch is a point in time. A sector is a configuration. A brand is a value.
> A location is a row. Keep each in its own kind of place.

Hard rules, in full with reasoning in
[`docs/implementation/ENTERPRISE-SCALE.md`](docs/implementation/ENTERPRISE-SCALE.md)
and [`MULTI-SECTOR.md`](docs/implementation/MULTI-SECTOR.md). Multi-branch
chains — a brand with several locations plus a website, offline POS, and
inter-branch transfers — are architected in full in
[`docs/implementation/RETAIL-ERP.md`](docs/implementation/RETAIL-ERP.md),
which is the document of record where it and `ENTERPRISE-SCALE.md` overlap:

- **One `main`, one `production`.** No per-sector, per-client branch. A
  configuration is never encoded in time.
- **Adding a sector adds a folder.** It never edits a core module. Core never
  imports a pack; a pack never imports another pack — `pnpm lint` fails on it.
- **Every pack must be survivably absent.** Booting without it has to work.
- **Every module is independent of every other module — full stop, not just
  across packs.** No direct import between two modules, core or pack alike,
  except a named, narrow `KNOWN_MODULE_COUPLINGS` entry for a same-transaction
  write. Everything else crosses through a domain event or an extension point.
  `pnpm lint` fails a violation. The payoff is not tidiness: any module can be
  dropped, replaced, or shipped alone for a given client without breaking the
  rest — that is what makes the `MODULES` allowlist actually safe to vary per
  deployment.
- **Extension points, not conditionals.** There is no `if (sector === …)`
  anywhere and there must never be.
- **One deployment serves one brand**, resolved at build time. That is a
  deliberate boundary; do not build toward multi-brand speculatively.
- **Every movement of value names its location**, and any query that can span
  branches says which — there is no implicit "all branches" read.
- **A branch is a node, not a tenant.** At chain scale it has its own database
  and is authoritative for its own facts, holding a read-only cache of the
  brand's policy. If two "branches" must not see each other's customers, they
  are two **brands** — that is Br1, not this axis.
- **One writer per invariant.** Stock moves through `InventoryService.move()`
  and nothing else.
- **Permissions are capabilities, not roles.** A route with no
  `@RequirePermission` is authenticated-but-unrestricted, which is almost
  never intended.

Three of these are **not machine-enforced yet** — branch-scoped reads,
pack-absence boot, and undecorated routes. ENTERPRISE-SCALE.md names them, in
the order they bite. Do not assume a green build proves them.

## Look it up before you search

This repository is ~880 files and ~141k lines across four applications. A
generated index of all of it lives in **`docs/index/`**, and it is regenerated
and staged by `.githooks/pre-commit` on every commit, so it always describes
the commit you are looking at.

**Read the index page for your question before grepping the repository.** Not
because searching is forbidden, but because the index already answers the
questions grep answers badly — which permission actually guards a route, which
module publishes an event, whether a component already exists — and answers
them in one file instead of forty.

| Looking for | Open |
|---|---|
| orientation, and which page answers what | `docs/index/README.md` |
| the whole repository on one screen | `docs/index/01-MAP.md` |
| an API endpoint and the permission guarding it | `docs/index/cross/routes.md` |
| a permission: what enforces it, which roles hold it | `docs/index/cross/permissions.md` |
| a table, column or enum | `docs/index/cross/data-model.md` → `docs/index/data/<schema>.md` |
| how two modules talk to each other | `docs/index/cross/events.md` |
| a screen, URL or nav entry | `docs/index/cross/ui-routes.md` |
| whether a component already exists | `docs/index/cross/components.md` |
| the design system, and the measured state of what it governs | `docs/index/cross/design-system.md` → `docs/design/` |
| everything about one API module | `docs/index/modules/<name>.md` |
| what a file exports, with line numbers | `docs/index/symbols/<area>.md` |
| every tracked file, by area | `docs/index/cross/files.md` |
| a command, a test, a migration, a doc outline | `docs/index/cross/{commands,tests,migrations,docs}.md` |
| a machine-readable form to `jq` | `docs/index/index.json` |

```bash
pnpm index         # regenerate (under a second, zero dependencies)
pnpm index:check   # exit 1 if stale — CI runs this, so does the post-commit hook
```

Three rules about it:

- **Never edit a file under `docs/index/` by hand.** It is generated; the next
  commit overwrites your edit. Fix `scripts/build-index.mjs`, or fix the code
  the generator read.
- **The index says *where*. This file and `docs/implementation/` say *why* and
  *what you may do*, and they win.** If the index and a document of record
  disagree, the document is right and the generator has a bug.
- **It is a map, not the territory.** The scanners are line-based, not a type
  checker. Open the file the index points you at — never cite the index as
  evidence that code does something.

If the index is missing or stale in your checkout, the pre-commit hook is not
installed: run `pnpm install`, or `node scripts/install-git-hooks.mjs`.

**Match the model to the job.** `docs/index/cross/model-routing.md` is the
routing table, generated from `scripts/lib/model-routing.mjs`. In Claude Code
it is applied automatically for anything delegated to a subagent — the
definitions in `.claude/agents/` pin both `model` and `effort`, so `locate`
runs on Haiku at low effort and `security` on Opus at max. The main session's
own model and effort are `/model` and `/effort`; a hook cannot set them, so
`.claude/hooks/suggest-model.sh` only advises, and only for access control,
migrations and architecture. Default downward: staying at `sonnet`/`medium`
needs no justification, going above it does.

**This file is the contract for every agent, not only for Claude.** The same
generator writes `AGENTS.md`, `.github/copilot-instructions.md`, `GEMINI.md`,
`.cursor/rules/repo-index.mdc`, `.windsurfrules`, `.clinerules` and
`.junie/guidelines.md` from one shared body, and every one of them points back
here. They are generated — add a tool to `AGENT_FILES` in
`scripts/build-index.mjs`; never hand-edit one, and never put a rule in one
that is not already in this file.

## The rule index

Every rule in this repository is binding. Not every rule needs to be in front of
you at every moment, so the ones that apply to a particular kind of file live in
`.claude/rules/` and load automatically the moment you open a file they govern.

This is the complete list. A rule being scoped does not make it optional — it
makes it arrive when it applies, which is when it is most likely to be followed.
**If you are about to work on one of these areas, read its file.**

| Rule file | Loads when you touch | What it governs |
|---|---|---|
| `.claude/rules/ui.md` | web / POS / mobile components and CSS | Use what exists (primitives, classes, `@newax/shared`) · Borders and boxes · No dead ends |
| `.claude/rules/design.md` | web / POS / mobile components and CSS, theme and brand files | the design system in `docs/design/` — 16 chapters, **150 numbered laws** with stable IDs, and the obligations binding now: every state shipped, no dead end, no ring of content around an empty middle, layout closes over absent permissions and modules, motion that communicates, keyboard, targets, logical properties, one word per concept |
| `.claude/rules/performance.md` | services, controllers, React components, Prisma | the performance engineering table — caching, indexing, N+1, pagination, bundles |
| `.claude/rules/database.md` | `apps/api/prisma/**` | the database change protocol; migrations are hand-written and forward-only |
| `.claude/rules/security.md` | auth, controllers, the permission catalogue | what a security review covers; server-side enforcement only |
| `.claude/rules/services.md` | services, controllers, listeners, crons | error handling and observability |
| `.claude/rules/testing.md` | any spec file | the testing standard and its minimum scenarios |
| `.claude/rules/dependencies.md` | any `package.json` | what must be answered before adding a dependency |
| `.claude/rules/configuration.md` | env templates, config, compose files | never hardcode an environment value; never commit a secret |
| `.claude/rules/decisions.md` | `docs/implementation/*.md` | how an architectural decision is recorded |

```bash
pnpm idx rule <text>        # search every rule, scoped or not
pnpm idx design <text>      # search the design system's chapters
pnpm idx law SPA-4          # one design law, by ID or family
node scripts/check-rules.mjs  # verify no rule went missing (pnpm lint runs this)
```

**Adding a rule later.** If it applies to everything, it belongs in this file. If
it applies to one kind of file, add it to the matching `.claude/rules/` file — or
a new one with a `paths:` frontmatter block — and add a row above.
`scripts/check-rules.mjs` fails the build if a rule file exists that this table
does not list, or a listed file that does not exist, so the index cannot drift
from the rules it indexes.


## Before you open a PR

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Both apps are currently at **0 errors and 0 warnings**. Keep them there.

Then verify by counting, not by reading — quote the number:

```bash
grep -rn "style={{" apps/web/src --include='*.tsx'          # inline styles
grep -rn "toLocaleString\|toLocaleDateString" apps/web/src   # stray formatting
grep -rn "await fetch(\|= fetch(" apps/web/src               # bare fetch
grep -ro "text-gray-[0-9]*\|bg-gray-[0-9]*" apps/web/src     # second palette
```

The rebrand leak used to be a fifth grep here. It is a script now —
`pnpm check:rebrand`, and `pnpm lint` runs it — because a grep for the current
client's name was itself the thing Law 1 forbids, and could not see a brand
literal that does not contain that name. `brand.ts` says so in its own words
next to `orderNumberPrefix`: "a case-insensitive search for the client's name
would never find it."

```bash
pnpm check:rebrand                        # Law 1, brand axis — part of pnpm lint
node scripts/check-rebrand.mjs --self-test  # proves the matcher still catches a leak
```

Three more design checks run inside `pnpm lint`, from
`docs/design/15-integrity.md`'s build order. Each carries a declared baseline
of the debt it found on the day it was written — a count that may shrink and
may not grow — and each has a `--self-test` that proves its own maths:

```bash
pnpm check:contrast    # COL-3 / ITG-11 — WCAG floors, palette read from brand.ts
pnpm check:links       # ITG-2/3/5 — links resolve, images exist, no orphan screen
```

`eslint-plugin-jsx-a11y` runs on both apps for the same reason. What still has
no check — focus order, reduced motion, RTL, overflow at the seven widths —
needs a render, and `15-integrity.md` ranks it.

Its terms are **derived from `packages/shared/src/brand.ts`**, so a rebrand
rebrands the check too and there is nothing to remember. It reads application
code only — `apps/*/src` and `packages/*/src` — because that is what Law 1
scopes itself to; deployment configuration, migrations and `docs/` are named
as out of scope in the script's own header rather than left as silent blind
spots. Its exceptions (the brand file, spec fixtures, whole-line comments, the
`@newax/` scope, and an allowlist that holds the two `LEGACY_*_COOKIE`
constants and nothing else) each carry their reason in the file. A brand name
in a *trailing* comment on a line of code still fails — mixed in with code is
where one hides.

Legitimate remaining exceptions, so you do not "fix" them:

- inline `style` on data-driven widths and colours (bar charts, tree indents)
- inline `style` in `app/global-error.tsx` and `app/not-found.tsx`, which
  render before any stylesheet exists
- `any` in `*.spec.ts` — partial test doubles, allowed by eslint config.
  Production code gets no such exemption.

---

## Deployment

The house rules' §7 caution against pushing/merging into `main` or
`production` assumes this working copy is wired to the live
`test.yaseen.pk` / `yaseen.pk` deployments. **It is not**: this repo
(`nadeemmurtaza/erp-1`) is a disconnected clone of the original — pushing or
merging into its `main` or `production` branches triggers no deployment
anywhere. Push and merge freely here; the caution still applies to the
original `yaseenecom` repo, not this one.


---

## NEWAX Engineering Operating Protocol

Binding on every agent, developer, automated process, cloud coding
environment, CI workflow, and future contributor here. The goal is not code
that runs — it's systems that are correct, understandable, maintainable,
secure, performant, observable, documented, verifiable and operationally
reliable. The system does the work; the client should not have to manage
unnecessary technical complexity.

### Operating sequence

```
Understand → Inspect → Plan → Document → Implement → Verify → Review → Report
```

Never jump straight from a request to implementation. First classify the
task — bug fix / feature / refactor / performance / security / docs /
architecture / infra / content / config — the category sets what
verification is required.

### Before writing or modifying code

```bash
pwd
git status --short
git branch --show-current
find . -maxdepth 2 -type f | sort | head -200
```

Then search before creating:

```bash
grep -R "existing-component-name" apps packages
grep -R "existing-function-name" apps packages
grep -R "existing-route" apps packages
```

— before introducing any component, function, service, hook, utility, API
endpoint, database table, database column, permission, validation rule,
dependency, or configuration value. A duplicate implementation is a defect
unless a documented boundary requires the separation.

Record scope before starting: affected applications, packages, database
tables, APIs, routes, permissions, external systems. If scope is unclear,
inspect further — don't invent it.

### Plan before build

Every non-trivial task gets a written plan first, proportional to the task
(a typo needs no plan; a database redesign does):

```markdown
## Implementation Plan

### Objective
### Existing State
### Required Change
### Files Likely Affected
### Dependencies (existing capabilities reused)
### Risks
### Acceptance Criteria
### Out of Scope
```

Every meaningful implementation traces back to a requirement — product
docs, an issue, a spec, an existing business rule, an acceptance criterion,
a user request, a security or performance requirement:

```
Requirement: / Reason: / Expected Outcome: / Verification Method:
```

Code with no documented reason is speculative functionality — don't build a
feature merely because it looks useful.

### Documentation-first

Update documentation **before** implementing when a change touches:
architecture, database structure, API contracts, authentication,
authorization, permissions, deployment, infrastructure, external
integrations, major workflows, business rules, performance characteristics,
or security boundaries. Search first — `docs/implementation/`,
`docs/architecture/`, `docs/api/`, `docs/operations/`, `docs/security/` —
and update the document of record. Never fork a duplicate doc.

### Preserve existing systems

Before changing existing behavior, know: why it exists, who uses it, what
depends on it, whether it's documented, whether tests cover it, what else
it touches. Don't rewrite a working system because a different
implementation looks cleaner — a refactor needs a measurable or documented
reason.

### Change minimization

Smallest complete change that satisfies the requirement wins. Do not:
rewrite unrelated modules, rename unrelated files, reformat unrelated code,
upgrade dependencies without justification, change architecture
unnecessarily, introduce speculative abstractions, or modify a shared
component without checking every consumer. Every unrelated change adds
review complexity and regression risk for nothing.

### Verification after every change

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Plus `pnpm build` and `pnpm format:check` where applicable. Never reuse an
old successful run as evidence for a new change.

**Automated verification is the authority.** Human review is valuable but
insufficient — never claim success from visual inspection or reasoning
alone. Evidence means: tests passing, typecheck passing, build passing,
lint passing, a migration applying cleanly, an endpoint responding
correctly, a preview deployment functioning, logs showing no unresolved
failure.

### Definition of done

```
[ ] Requirement understood
[ ] Existing implementation inspected
[ ] Plan created
[ ] Documentation updated where required
[ ] Implementation completed
[ ] Reachable — nav entry + real UI + permission actually granted to a role,
    not backend-only, unless nothing a human clicks depends on it
[ ] No unnecessary code added
[ ] No duplicate implementation introduced
[ ] Security reviewed
[ ] Performance reviewed
[ ] Tests added or updated
[ ] Lint passed
[ ] Typecheck passed
[ ] Tests passed
[ ] Build passed where applicable
[ ] Acceptance criteria verified
[ ] Documentation synchronized
[ ] Git diff reviewed
[ ] No unresolved known blocker
```

Any item incomplete means the task is not complete.

### Status vocabulary

**Investigated** — repository inspected, problem understood.
**Planned** — implementation approach documented.
**Changed** — code or configuration modified.
**Verified Locally** — verification commands passed after the latest change.
**Blocked** — progress can't continue: a dependency, access, decision, or
information is unavailable.
**Complete** — every applicable requirement and acceptance criterion
satisfied *and verified*. Never call something complete when only code has
been written.

### No speculative functionality

Don't implement anything not requested or required — no future-proofing for
imagined requirements, extra configuration, unused abstractions, unused API
endpoints, placeholder infrastructure, unnecessary tables, unnecessary
dependencies, unused permissions, unused env vars. Every addition needs a
documented reason. For a named feature request, "required" is defined by
"Feature scope: build the whole capability" near the top of this file, not
by the narrowest reading of the request's literal words — that section's
five lenses are the documented reason.

### A feature ships whole, not backend-only

See "Feature scope: build the whole capability" near the top of this file
for the full method (the five lenses, the worked cart example, the
build-vs-sequence boundary) — this is that section's mechanical checklist.
A work order is not done because the service and its tests pass. Every
piece that ships also ships:

- the backend — schema, service, controller, tests (already required above);
- the minimum UI to perform the capability — one page, section or action,
  not a page suite; the seven laws already say how small that is allowed
  to be, they do not say it is allowed to be zero;
- a nav-registry entry, so the capability is reachable by clicking, not
  only by typing a URL or curling the API by hand;
- every permission the capability needs, seeded all the way through — the
  Permission row AND a real grant in whichever system actually gates a
  live user's access today. A permission that exists in the catalogue but
  reaches no role a real user holds is not shipped, it is scaffolding —
  the `seedPermissions()`-vs-`seedRoles()` gap this codebase already
  carries is exactly this trap, tracked, not repeated on purpose.

### Refactoring

Preserve behavior unless a behavior change is explicitly intended. Before:
understand current behavior, identify consumers, check tests, name the
risks, define the expected outcome. After: run relevant tests, compare
behavior, review performance and affected boundaries. Never refactor
unrelated code while implementing a feature.

### Git discipline

```bash
git status
git branch --show-current
```

before starting; never overwrite unrelated changes or reset/delete someone
else's work without explicit authorization.

```bash
git diff --stat
git diff
```

before committing or opening a PR — review the complete diff. The final
diff contains only intentional changes.

### No direct production modification

Never: push directly to production, modify a production database casually,
change production env vars without authorization, deploy unverified code,
bypass CI, or disable a security control to make a deployment pass. Verify
in development/preview first. (See this file's own Deployment section
above — the same rule, restated here for the full protocol.)

### Release safety

Before release: requirements verified, acceptance criteria passed, tests
passed, build passed, security reviewed, performance reviewed,
documentation updated, migration reviewed, rollback considered, monitoring
available. A successful deployment is not automatically a successful
release — verify production behavior *after* deployment too.

### Continuous improvement

After significant work, ask: what was difficult, what was duplicated, what
documentation was missing, what verification was missing, what should
become reusable, what should be automated, what should be removed. Don't
let a temporary workaround calcify into permanent architecture.

### The final questions

Before writing code — *does this make the system simpler, more reliable,
more understandable, or more capable of serving its actual purpose?* If
not, don't add it.

Before declaring completion — *what evidence proves this works?* No
evidence, not verified.

Before introducing complexity — *can the existing system already solve
this?* If yes, reuse it.

Before creating a new abstraction — *what real boundary justifies its
existence?* No clear answer, don't create it.

The goal is not maximum code. The goal is dependable business
infrastructure.

### Response format for non-trivial work

Before implementing:

```
TASK UNDERSTANDING
Objective: / Affected Area: / Task Type:

CURRENT STATE
Relevant Existing Files: / Existing Capabilities: / Potential Risks:

PLAN
1. 2. 3. …

ACCEPTANCE CRITERIA
1. 2. 3. …

IMPLEMENTATION STATUS
Not Started / In Progress / Blocked / Verified
```

Don't claim completion before implementing. After implementing:

```
CHANGES MADE
- File: / File: …

VERIFICATION
- Lint: / Typecheck: / Tests: / Build:

REMAINING RISKS
- None / Listed

FINAL STATUS
Verified Locally / Blocked / Complete
```
