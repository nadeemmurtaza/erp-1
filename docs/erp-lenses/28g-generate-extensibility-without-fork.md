# 28g generate extensibility without fork

Output of the `gen:28:extensibility-without-fork` agent (Generate phase) of workflow `wf_0cc0602e-66b`,
recorded verbatim from the run journal.

## Domain

The client-specific need that must not fork

## File

docs/erp-lenses/28-extensibility-without-fork.md

## Lenses

### Five doors, one hallway

**Question:** For this client-specific ask, name which single mechanism owns it — a sector pack (module-packs.ts), a named extension-point registration, a Setting key, a new shared schema field, or a documented refusal — and state why each of the other four is wrong for this request.

**Grounding:** module-packs.ts:28-34 (pack test: 'genuine domain data core cannot express'), EntityEnrichmentRegistry.register() throwing on a second registration for one point, Setting model core.prisma:153-158 (global {key,value}, no retailBrandId/branchNodeId), document-prefix.ts:31-43 (documentPrefix fallback pattern), GoodsReceipt freightCost/dutyCost/otherCost fields

### The refusal that isn't graceful

**Question:** For a module a client refuses, name every other enabled module that imports it directly per KNOWN_MODULE_COUPLINGS versus reaches it only through a domain event or extension point, and state what happens to each direct importer when the target is absent.

**Grounding:** modules.registry.ts:101-124 (FeatureModulesModule.register(), no dependency check between MODULES entries), scripts/check-module-boundaries.mjs:134-138 (KNOWN_MODULE_COUPLINGS: orders->payments, orders->inventory, purchasing->inventory), StockIntakeRegistry.recordIntake() graceful no-op contrast, docs/implementation/DECISIONS.md pattern (CLAUDE.md:602)

### The field with no home

**Question:** When a client's local rule needs a new attribute on a shared object — Product, Order, GoodsReceipt, JournalEntry — that only they will ever use, name the concrete mechanism it becomes: a real migrated column every deployment shares, a Setting-keyed value, or a declined request — and say which, since there is no metafield table to fall back on.

**Grounding:** grep -rn 'customField|CustomField|metafield|Metafield' apps packages --include='*.ts*' returns zero matches (verified this session); Setting.value Json (core.prisma:153-158) as the only no-migration precedent; document-prefix.ts FALLBACK pattern; CLAUDE.md 'no speculative functionality' rule

## Absences

- No per-brand or per-location module toggle — MODULES is one process-wide env var (modules.registry.ts:105-124); a module refusal is whole-deployment or nothing today.
- No metafield/custom-field table on any business object anywhere in apps/ or packages/ (grep confirmed zero matches for customField|CustomField|metafield|Metafield).
- No runtime dependency check between FEATURE_MODULES entries — KNOWN_MODULE_COUPLINGS is enforced only by the compile-time boundary lint (scripts/check-module-boundaries.mjs), not by FeatureModulesModule.register(), so an incompatible module combination (e.g. orders on, payments off) is caught only at Nest boot, not before.

