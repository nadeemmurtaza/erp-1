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

## Use what exists

Most drift here came from someone building a thing that already existed. Before
writing markup, check this list. **Grep for the literal before adding one.**

### Primitives — `apps/web/src/components/ui`

| Import | For |
|---|---|
| `PageHeader` | context, title, one line, ONE primary action |
| `Section` | a titled region with no box around it |
| `SectionRail` | parts of one object — all present, jump to any |
| `Tabs` | separate tasks on one object — one at a time |
| `Disclosure` | rare, advanced or destructive — closed by default |
| `MetricStrip` | a row of figures; give an item `detail` to make it open a panel |
| `DataTable`, `EmptyState`, `Badge`, `Button`, `Dialog`, `Loading` | as named |

Cross-surface: `components/common/status-badge` (**the** status pill — do not
write an eighth), `components/common/wizard`.
Storefront: `components/storefront/auth-page`, `legal-page`.
Admin: `components/admin/range-picker`.

### Classes — `apps/web/src/app/globals.css`

`.btn` `.btn-primary` `.btn-secondary` `.btn-ghost` `.btn-danger` `.btn-text`
`.card` `.chip` `.icon-btn` `.field-label` `.field-input` `.field-check`
`.field-inline` `.field-flat` `.notice` `.notice-error` `.notice-success`
`.notice-info` `.eyebrow` `.metric-strip` `.metric` `.table-flat` `.pill`
`.nav-link` `.nav-tab` `.prose-legal` `.lift` `.skeleton` `.stagger`
`.no-scrollbar` `.container-page`

### Everything else

| Concern | Import from |
|---|---|
| Money, dates, numbers | `@newax/shared` — `formatMoney` `formatDate` `formatDateTime` `formatDateShort` `formatNumber` |
| Brand, locale, theme | `@newax/shared` — `BRAND` |
| Routes | `@/constants/routes` — `ROUTES` |
| API calls | `@/lib/api-client` `request()`, `@/lib/admin-client` `adminFetch()` |
| CSV download | `@/lib/download-csv` |
| Storage keys | `@/constants/storage` |
| Permissions | `@/constants/permissions` |

**Never**: a bare `fetch` in a page · `toLocaleString` at a call site · a hex
in a component · a path literal in an `href` · English in customer-facing JSX
(use `apps/web/messages/*.json`) · a second palette · a hand-rolled alert,
status pill, table or modal.

---

## Borders and boxes

A border must mean something. Prefer whitespace and alignment.

**One border, soft, and never two.**

- **Never a box inside a box.** A bordered container directly inside another
  bordered container draws two lines a few pixels apart with nothing between
  them; the reader sees a seam, not a boundary. The inner one goes — a tint
  (`bg-neutral-50`) or plain spacing separates it just as well. This is the
  single most common way these screens get noisy: the wizard was a card, and
  every step inside it drew another.
- **Soft.** Container edges are `border-neutral-100` (#E8E8E8). Controls that
  have to be findable — inputs, checkboxes, the secondary button — get
  `border-neutral-200`, and nothing goes darker. A border is an edge, not a
  drawn line.
- **Never a border and a shadow on the same edge.** That is also two
  boundaries. `.card` has no shadow; `.lift` adds one on hover, when it means
  "this rose".
- A **card** must be a summary, object, status, action, warning or result.
  No decorative cards. A form that is the only thing on its page gets no box.
- A **table** is already a grid — `.table-flat` draws row rules and nothing
  else. No outer frame, no vertical lines, no zebra, and no `divide-*` on top
  of it.
- A **message** gets a tint, not a border — `.notice`.
- A **filter row** is controls, not an object. No box.

The one exception is a **control**, not a container: a segmented toggle whose
outline groups its buttons into one thing, or a dashed placeholder marking an
empty slot. Those may sit inside a card, because they are not claiming to be
a second container.

```bash
# Two bordered containers, one inside the other. Should print 0 beyond the
# two known controls.
python scripts/nested-borders.py
```

---

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
grep -rni "yaseen" apps/*/src packages/*/src --include='*.ts*' | grep -v '@newax/'
```

The last one must return only the two documented `LEGACY_*_COOKIE` constants.
Anything else is a rebrand leak — this codebase ships to multiple clients.

Legitimate remaining exceptions, so you do not "fix" them:

- inline `style` on data-driven widths and colours (bar charts, tree indents)
- inline `style` in `app/global-error.tsx` and `app/not-found.tsx`, which
  render before any stylesheet exists
- `any` in `*.spec.ts` — partial test doubles, allowed by eslint config.
  Production code gets no such exemption.

---

## Deployment

**Never push to `main`. Never push to `production`. Never merge into either.**
Both auto-deploy, so a merge is a deployment, and deployments are the owner's
decision. See §7 of the house rules.


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

### Performance engineering

Every technique below must be *considered* where it applies to the change
at hand — never applied blindly, and never treated as mandatory everywhere.
The correct optimization depends on the actual system, and every claim
needs a measurement (Lighthouse, Core Web Vitals, bundle size, API/DB
response time, image transfer size, JS execution cost, layout shift — not
a guess).

| Area | What to check |
|---|---|
| **Cache API responses** | HTTP / server-side / application / Redis / CDN caching where safe. Every cache states: owner, key, expiration, invalidation strategy, data-freshness requirement, auth isolation. Never cache sensitive or user-specific data incorrectly. |
| **Database indexing** | Justify by real WHERE, JOIN, ORDER BY, foreign-key and frequently-combined-column patterns; verify with `EXPLAIN ANALYZE`. No index added just because it seems generally useful. |
| **Images** | Appropriate dimensions, compression, modern formats where supported, responsive delivery, lazy loading, correct aspect ratios, prevented layout shift. Never ship oversized images unnecessarily. |
| **Loading skeletons** | Match the real content structure; avoid excessive animation; never replace a meaningful empty state; never hide an error; respect reduced-motion preferences. |
| **Expensive query caching** | Redis, materialized views, precomputed aggregates, background jobs, or request-level memoization — always with a stated freshness requirement. |
| **N+1 queries** | Fetching N records then querying related data separately per record is a performance *defect*. Fix with batch queries, joins, aggregation, eager loading, or data loaders. |
| **Debounce expensive inputs** | API requests, search, filtering, validation, autosave, suggestions. Never debounce an action that needs immediate feedback. |
| **Code splitting** | Route-level splitting, dynamic imports, lazy-loaded heavy components, deferred secondary features. Must improve loading behavior, not just multiply files. |
| **CDN evaluation** | Static assets, public images, video, large downloads, public API responses where appropriate — weighed against traffic volume, geographic distribution, cacheability, cost, security, invalidation needs. Don't add CDN infra without a reason. |
| **Server-side caching** | Public content, configuration, expensive computations, frequently-requested aggregates — every one needs invalidation logic. |
| **Pagination** | Never assume a dataset stays small. Offset, cursor, or keyset pagination on every potentially large collection — no unbounded queries. |
| **API payload compression** | Compression, field selection, DTO optimization, pagination, trimming unnecessary nested data — without sacrificing API clarity. |
| **Prevent unnecessary re-renders** | Fix via state placement, stable references, correct reactive dependencies — not excessive watchers or expensive computed values or unnecessary global state. Don't reach for memoization without understanding the actual rendering problem. |
| **Minify production assets** | Through the framework's own build pipeline only, never by hand. Watch JS/CSS bundle size, dead code, duplicate packages, unused polyfills. |
| **Lazy loading** | Below-the-fold images, secondary dashboards, heavy charts, optional integrations, large editor components. Never delay critical content. |
| **Defer non-critical scripts** | Analytics, chat widgets, tracking, ads, optional integrations must not block critical rendering. Every third-party script needs a documented purpose. |
| **Remove unused dependencies** | Before adding one: check the language stdlib, then framework capability, then existing NEWAX utilities, then whether it's actually necessary, then its security/maintenance/bundle impact. Remove what's unused. |
| **Database connection pooling** | Connections reused appropriately, pool size justified, connections released safely, serverless limits understood, exhaustion prevented. |

### Architectural decision records

Record significant technical decisions in `docs/implementation/DECISIONS.md`:

```markdown
## Decision
### Context — what problem required a decision?
### Options Considered
### Decision — what was selected?
### Reasoning — why?
### Consequences — benefits and trade-offs
### Status — Accepted / Superseded / Rejected
```

Don't repeatedly revisit a settled decision without new evidence.

### Security engineering

Review: authentication, authorization, permission enforcement, tenant
isolation, branch isolation, input validation, output encoding, SQL
injection, XSS, CSRF, file uploads, secrets, environment variables, rate
limiting, error exposure, logging privacy, dependency vulnerabilities.
Security is enforced **server-side** — client-side restrictions are not
authorization.

### Error handling

Every external operation (database, API, network) needs a failure path
covering: validation failure, auth failure, timeout, partial failure,
duplicate request, concurrent request. Errors are understandable to users
where appropriate, useful to operators, safe to expose, and logged without
leaking sensitive information. Never silently swallow an error; never
expose a stack trace or a secret to a user.

### Observability

Where applicable: structured logging, error tracking, health checks,
request tracing, performance metrics, database monitoring, queue
monitoring, external-integration monitoring. A log should answer: what
happened, when, which operation, which organization/context, what was the
result, what failed. Never log passwords, tokens, secrets, or unnecessary
personal data.

### Database change protocol

Before modifying a database: inspect the current schema, identify
relationships, review existing migrations, check constraints and indexes,
determine data ownership, consider backward compatibility and rollback,
update documentation, add or update tests. Never casual — every migration
states a clear reason (this repo's own D1/D2 above go further: forward-only,
tested against a copy of production data, never `migrate dev` against
production).

### Testing standard

Match the category (unit / integration / API / e2e / permission / security
/ regression / performance) to the risk. Minimum scenarios to consider:
normal case, invalid input, boundary values, unauthorized access, wrong
organization, wrong branch, duplicate request, concurrent request, external
service failure, partial failure, empty state, loading state, error state.
Tests verify business behavior, not implementation details.

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
documented reason.

### Refactoring

Preserve behavior unless a behavior change is explicitly intended. Before:
understand current behavior, identify consumers, check tests, name the
risks, define the expected outcome. After: run relevant tests, compare
behavior, review performance and affected boundaries. Never refactor
unrelated code while implementing a feature.

### Dependency standard

Before installing one:

```
Dependency: / Purpose: / Existing Alternative: /
Why Existing Alternative Is Insufficient: / Security Considerations: /
Maintenance Considerations: / Bundle / Runtime Impact: / Approval Required:
```

Prefer fewer dependencies — each one is a long-term maintenance obligation,
not a temporary convenience.

### Environment and configuration

Never hardcode an environment-specific value — URLs, API keys, database
credentials, feature flags, deployment settings, external service ids,
timezones, locale configuration all resolve through config. Never commit a
secret or a production credential.

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
