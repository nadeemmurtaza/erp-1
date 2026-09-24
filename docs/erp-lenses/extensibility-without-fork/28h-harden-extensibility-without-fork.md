# 28h. Hardening record: The client-specific need that must not fork

Adversarial review of [28-extensibility-without-fork.md](./28-extensibility-without-fork.md) by the `harden:28:extensibility-without-fork` agent
of workflow `wf_0cc0602e-66b`, recorded verbatim. The reviewer opened every file the lens set cited and killed
by default; what survives below survived that.

## Kept (3)

### Five doors, one hallway  — strong

**Question:** For this client-specific ask, name which single mechanism owns it (module-packs.ts pack, EntityEnrichmentRegistry.register(), Setting key, schema field, or documented refusal) and state why each of the other four is wrong.

**Verified against:** module-packs.ts:28-34 (pack-eligibility rule + grocery/electronics rejection), EntityEnrichmentRegistry.register() (throws on duplicate point), core.prisma:153-158 (Setting model, no retailBrandId column) - all confirmed verbatim in working tree.

### The refusal that isn't graceful  — strong

**Question:** For a module a client refuses, name every other enabled module that imports it directly per KNOWN_MODULE_COUPLINGS vs. only via event/extension point, and state what happens to each direct importer when the target is absent.

**Verified against:** check-module-boundaries.mjs:134-138 (KNOWN_MODULE_COUPLINGS entries orders->payments, orders->inventory, purchasing->inventory - confirmed verbatim), modules.registry.ts:101-124 (FeatureModulesModule.register() has no cross-entry dependency check - confirmed), StockIntakeRegistry (confirmed exists as the graceful counterpart).

### The field with no home  — solid

**Question:** When a client's local rule needs a new attribute on a shared object, name the concrete mechanism: real migrated nullable column, Setting-keyed value, or declined request.

**Verified against:** grep for customField/Metafield returns zero matches (re-confirmed), Setting.value:Json (core.prisma:153-158), GoodsReceipt.freightCost/dutyCost/otherCost (purchasing.prisma:153-155, confirmed).

## Killed (0)

_Nothing was killed._


## Citations corrected (0)

_Every citation checked out as written._


## Not modelled in this repo today

- No lens covers whether the five-door choice must be re-verified when a module pack itself later gets refactored (i.e., a mechanism drift check over time) - left out as out of scope for a per-PR lens.
- No lens explicitly addresses cross-pack conflicts (two different sector packs both wanting the same extension point name) since EntityEnrichmentRegistry's throw-on-duplicate already makes that a runtime failure rather than a silent scope gap.
