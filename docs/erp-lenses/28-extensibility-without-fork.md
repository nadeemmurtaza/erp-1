# 28. The client-specific need that must not fork

At Solo/SME scale a client-specific need is a config flag. At corporate scale
it multiplies: a hundred locations across several brands and departments each
want one exception — a document layout, an extra approval, a field nobody
else needs — and the codebase has exactly five legitimate places to put that
exception (pack, extension point, setting, schema field, refusal) and one
illegitimate one (an inline brand check). Feature scope fails here not by
omission but by picking the wrong door, or no door, every time.

## Lens: Five doors, one hallway

**Question:** For this client-specific ask, name which single mechanism owns
it — a sector pack (`module-packs.ts`), a named extension-point registration,
a `Setting` key, a new shared schema field, or a documented refusal — and
state why each of the other four is wrong for this request.

**Why:** `module-packs.ts` states its own test: a pack exists only where a
vertical owns genuine domain data core cannot express — grocery and
electronics were deliberately rejected because everything they seemed to
need "turned out to be universal" (`module-packs.ts:28-34`).
`EntityEnrichmentRegistry.register()` throws if a point already has an
implementation, so two client asks cannot both claim the same extension
point. `Setting` is one global `{key, value}` row per key
(`core.prisma:153-158`) with no `retailBrandId`/`branchNodeId` column, so a
rule that must differ by brand cannot live there. Skipping the naming step is
how CLAUDE.md's "two globals for the same thing" failure happens: an
unnamed request gets solved by a copy-pasted module or an inline brand check.

**Worked example:** Narrow slice: a client wants their goods-receipt PDF to
show a customs/duty breakdown no other client wants, so an engineer wraps
the renderer in `if (BRAND.slug === 'client-x')`. Complete capability:
answer the five-door question first. `GoodsReceipt` already carries
`freightCost`/`dutyCost`/`otherCost`, so it needs no new field. It isn't
sector domain data, so it isn't a pack. Nothing needs a second
implementation registered anywhere, so it isn't an extension point. It's a
per-deployment yes/no on which section renders, so it becomes a
`SettingKey` (e.g. `documents.grn.showDutyBreakdown`) read the way
`documentPrefix()` reads `DocumentSettings`, falling back to a shipped
default (`document-prefix.ts:31-43`) — never an if-branded literal in the
renderer.

**Done test:** The PR states in one sentence which door it used and cites
the artifact: the pack line in `module-packs.ts` + `modules.registry.ts`,
the point name passed to `register()`, the `SettingKey` added in
`settings.defaults.ts`, the migration adding the field, or "declined — not
a module for this deployment." `grep` the diff for `BRAND.slug ===` or a
deployment/client id compared with `===`/`includes` in application code —
must return zero.

**Breaks without:** The fifth client's "just one local rule" becomes an
`if (client === X)` in application code — the literal law 1 forbids — and
the sixth client's version of the same ask forks it a second, incompatible
way, because nothing stops two engineers picking different mechanisms for
the same kind of request. The codebase ends up with two ways to do the same
job, each internally consistent, which is worse than duplication because it
looks deliberate.

## Lens: The refusal that isn't graceful

**Question:** For a module a client refuses, name every other enabled
module that imports it directly per `KNOWN_MODULE_COUPLINGS` versus reaches
it only through a domain event or extension point, and state what happens
to each direct importer when the target is absent.

**Why:** `FeatureModulesModule.register()` filters `FEATURE_MODULES` purely
against the `MODULES` allowlist with no dependency check between entries
(`modules.registry.ts:101-124`) — nothing stops enabling `orders` while
leaving `inventory` or `payments` off, even though `orders -> payments`,
`orders -> inventory` and `purchasing -> inventory` are literal,
same-transaction NestJS imports in `KNOWN_MODULE_COUPLINGS`
(`check-module-boundaries.mjs:134-138`), kept direct on purpose because
"decoupling would trade a correctness guarantee for architectural purity."
Those imports never check whether Nest actually loaded their target —
unlike `StockIntakeRegistry.recordIntake()`, which no-ops gracefully when
`inventory` is off, a direct import that loses its target fails module
resolution at boot, not at the request that needed it.

**Worked example:** Narrow slice: a cash-only franchise refuses `payments`,
so an engineer drops it from `MODULES` assuming Nest routes around the gap.
Complete capability: check `orders -> payments` in
`KNOWN_MODULE_COUPLINGS` first, confirm `OrdersModule` injects a payments
provider directly, then either decline the refusal — recording in
`docs/implementation/DECISIONS.md` that payments cannot come off while
orders stays on, because it's a direct import, not an extension point — or
ship the work converting that coupling to an event/extension point before
honouring the refusal, the shape `StockIntakeRegistry` already gives
`catalog`'s CSV import path.

**Done test:** For any module named in a refusal, `grep KNOWN_MODULE_COUPLINGS
scripts/check-module-boundaries.mjs` for `<name> ->` entries pointing at it;
the PR states whether each importer is also being disabled in the same
change, or names the `DECISIONS.md` entry declining the refusal instead.

**Breaks without:** Enabling `orders` without `payments` or `inventory`
does not degrade gracefully the way an off `stitching` module does for
`EntityEnrichmentRegistry` — it is a boot-time Nest dependency-injection
crash. A client's "just turn that module off for us" request that skips
this check reaches production as a deploy that will not boot, not as a
quietly missing feature.

## Lens: The field with no home

**Question:** When a client's local rule needs a new attribute on a shared
object — Product, Order, GoodsReceipt, JournalEntry — that only they will
ever use, name the concrete mechanism it becomes: a real migrated column
every deployment shares, a Setting-keyed value, or a declined request — and
say which, since there is no metafield table to fall back on.

**Why:** `grep -rn "customField|CustomField|metafield|Metafield" apps
packages --include='*.ts*'` returns zero matches — unlike a Shopify-style
metafield table, there is no generic key-value extension on any business
object here. The only precedent for attaching data without a migration is
`Setting.value: Json` (`core.prisma:153-158`), a single global `{key,
value}` row not attached to any specific Product or Order row — good for a
deployment-wide default (`documentPrefix`'s `FALLBACK`,
`document-prefix.ts:31-43`), useless for a per-row value. Adding a real
column instead means every other deployment on the same build sees it too,
which satisfies globalization's "one source per concern" only when that
column is optional and defaulted.

**Worked example:** Narrow slice: a client wants an extra "Loom Reference"
text field only they use, so an engineer encodes it into `Product.slug`, or
adds `Product.loomReference String` as a required column. Complete
capability: since no metafield table exists, the PR either (a) adds
`Product.loomReference String?` — nullable, shared by the whole build,
every other deployment's rows simply stay null — the correct answer at this
repo's current scale, or (b) if it's speculative and genuinely
single-client, declines it under CLAUDE.md's "no speculative
functionality" rule and offers a `Setting` row of free text on the document
instead of a schema change.

**Done test:** `grep -rn "customField\|Metafield" apps packages
--include='*.ts*'` returns zero today; if the PR adds a schema field
anyway, the migration must declare it nullable (`String?`, not `String`),
and the PR states which of (a) real column or (b) declined-with-Setting it
chose.

**Breaks without:** A required, client-specific column silently breaks
every other deployment's Product create or import the day their code path
hits the missing value. Smuggling it into an existing field instead —
slug, description, an untyped JSON blob — creates data no report, no
permission key and no extension point can see, because nothing else in the
codebase knows to look there.

## Not modelled yet

- No per-brand or per-location module toggle — `MODULES` is one
  process-wide env var read in `FeatureModulesModule.register()`
  (`modules.registry.ts:105-124`), so a refusal is whole-deployment or
  nothing.
- No metafield/custom-field table on any business object — confirmed by
  `grep -rn "customField|CustomField|metafield|Metafield" apps packages
  --include='*.ts*'` returning zero matches.
- No dependency check between `FEATURE_MODULES` entries at runtime —
  `KNOWN_MODULE_COUPLINGS` is enforced only by the boundary lint at compile
  time (`scripts/check-module-boundaries.mjs`), not by
  `FeatureModulesModule.register()`, so an incompatible module combination
  is only caught at Nest boot, not before.
