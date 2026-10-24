# 13 · Composition

One codebase that ships as an online shop, or as a manufacturing group's
whole nervous system, without either looking like the other's leftovers.

> **Status: architecturally enforced, visually unenforced.** The API side is
> real and checked: module packs, the `MODULES` allowlist,
> `scripts/check-module-boundaries.mjs` failing the build on a cross-module
> import. The *interface* has no equivalent. Nothing verifies that a page
> renders correctly when a module it references is absent, and nothing
> verifies the nav does not offer a link into a module this deployment does
> not have. Those are the two failures this chapter exists to prevent.

## What is actually being shipped

The named combinations, and what each one changes about the interface:

| Deployment | Interface consequence |
|---|---|
| shop | one channel, one price list, no branch concept visible anywhere |
| shop + CRM | a customer becomes an object with a history, not a row on an order |
| shop + CRM, multi-brand | brand becomes a *deployment boundary*, not a selector — see below |
| shop + CRM + physical shop | a second, different surface (POS) shares the data model |
| + multi-branch | **location appears on every movement of value**, and every list needs a scope |
| + multi-branch, multi-brand | the branch axis and the brand axis are different, and confusing them is a data breach |
| + ERP | procurement, manufacturing, accounting — the object count roughly triples |

Plus the party the deployment serves: **manufacturer, distributor, supplier,
retailer.** The same screen means different things to each — a purchase order
is an obligation to one party and a receivable to the other — and the same
person may operate two of these roles in one chain.

**The load-bearing fact:** these are not seven products. They are one
product, and every screen has to be correct in all of them.

---

## MOD · The laws

### MOD-1 · A page is correct when a module it mentions is absent
**Here** — the architecture already requires every pack to be *survivably
absent* at boot. The interface law is the same, one level up: a screen
referencing a capability from an absent module renders correctly without it —
**closing over the gap (`PRM-5`), not leaving a hole.**

This is the same reflow requirement as permissions, and the implementation is
the same: content-driven layout, never fixed slots. A product page in a
shop-only deployment does not show an empty "Manufacturing" tab.

### MOD-2 · The composition is data, never a conditional
**Here** — `if (sector === …)` is forbidden architecturally, and
`if (hasModule('erp'))` scattered through components is the same defect in
the interface. **A surface declares what it needs; the shell decides whether
it appears.** Extension points and a registry, not conditionals — because a
conditional has to be found and edited for the eighth combination, and a
registration does not.

### MOD-3 · Navigation is composed, never authored
**Here** — there is one nav registry, and entries come *from* modules. Nobody
writes a nav tree per deployment. It follows that:

- an entry whose module is absent is **not rendered**, not disabled
  (`PRM-2`: a door to a room that does not exist);
- an entry whose module is present but whose permission the user lacks is
  also not rendered — the two mechanisms produce the same result by
  different reasoning, and both are binding;
- the nav's *shape* must survive both, which means groups collapse when they
  empty rather than rendering an empty heading.

### MOD-4 · No cross-module link without a fallback
**Here** — a screen in one module linking into another must handle that
module being absent. This is where broken links actually come from in a
modular product: not from typos, but from a link that was always valid in
development, where every module was on.

**The rule**: a cross-module link is resolved through the registry, so an
absent target produces *no link*, never a link to a 404. Chapter 15 makes
this checkable.

### MOD-5 · The core is complete on its own
**Here** — the minimum deployment is a whole product, not a demo with
disabled areas. If the shop-only configuration needs a concept, that concept
belongs in core, not in a pack the smallest client will not buy.

**The test**: could a client running only the smallest configuration run
their business, with no screen that hints at something they do not have? If
a page says "Upgrade to see this", the answer is no and the design is wrong.

### MOD-6 · Brand is a value, branch is a row, sector is a folder
**Here** — chapter 10's `GLO-4` in the deployment dimension, and this
repository's own three axes. The interface consequences:

- **Brand** is resolved at build time. One deployment serves one brand, so
  there is **no brand switcher**. A screen that offers one has confused the
  axes, and the fix is not a filter — it is two deployments.
- **Branch** is a row on a movement and a node at chain scale, so **every
  list that can span branches states its scope**, always visibly, never
  implicitly "all".
- **Sector** is a module pack, so it never appears in the interface at all.

The confusion that matters: if two "branches" must not see each other's
customers, **they are two brands**, and no amount of filtering makes that
safe. That is an architecture decision surfacing as a design decision, and
the design must not paper over it.

### MOD-7 · Multi-party screens name the party's side
**Here** — the same purchase order is an order to the buyer and a sale to the
seller. A screen shared across the chain **states whose view it is** and uses
that party's language (`HEU-2`). The amount's sign, the direction of the
arrow, the words "due" and "owed" all flip.

Never render one neutral view and expect the reader to work out their side.
In a system connecting manufacturers, distributors, suppliers and retailers,
that mistake is a payment made in the wrong direction.

### MOD-8 · An integration is a capability, not a brand
**Here** — with 20+ payment methods and many delivery partners, the interface
**never hardcodes a provider**. A payment method is a row with a name, an
icon, a set of fields, and states; adding the 21st is data plus an adapter,
never a new branch in a component.

The design consequence people miss: **provider-specific states must be
expressible generically.** One provider has a pending-review state, another
has a partial capture, a third has a mandate. The design carries a state
vocabulary wide enough for all of them, translated per provider — rather
than a union of every provider's enum, which is Law 6's clutter arriving
through the back door.

### MOD-9 · One component, many densities and surfaces — never a fork
**Here** — admin, storefront, POS and mobile share a person. A concept that
appears in two surfaces is **one component with surface-appropriate density
and targets** (`SPA-3`, `ACT-1`), not two implementations that drift.

Where a surface genuinely differs — the till is operated standing, at speed,
possibly offline — that is a documented variant of one component, not a
second component with the same name.

### MOD-10 · Capability discovery is honest
**Here** — the interface never advertises what this deployment does not have.
No greyed-out modules, no "coming soon" in a sold product, no upsell in an
operational tool. `MOD-5` states the principle; this is its visible form.

A client who bought the shop configuration should be unable to tell, from
the interface, that an ERP exists.

---

## Patterns

### The registry, not the tree

Nav, dashboard widgets, object tabs, report lists, and quick actions are all
**composed from registrations**, and each registration carries: the module
that owns it, the permission it needs, and where it belongs. The shell
resolves module presence and permission in one pass, then renders what
survives.

This is the single mechanism behind `MOD-3`, `MOD-4`, `PRM-2` and `PRM-5`.
Build it once.

### The absent-module boot test

The architectural rule — every pack survivably absent — has an interface
twin that does not exist yet: **render every screen with each module off, and
assert no broken link, no empty region, and no reference to an absent
concept.** Chapter 15 specifies it; it is the highest-value integrity check
this product could own, because the number of shipped combinations makes
manual testing of them impossible.

### The party lens

For multi-party objects, one component takes the viewing party as an input
and derives labels, direction and sign from it (`MOD-7`). Never a boolean
`isBuyer` threaded through a tree of components — that is the conditional
`MOD-2` forbids, at component scale.

---

## What must be built

1. **One registry** covering nav, tabs, widgets and actions, resolving module
   presence *and* permission (`MOD-3`, `PRM-2`).
2. **Registry-resolved cross-module links** (`MOD-4`).
3. **The absent-module render check** (`MOD-1`) — chapter 15.
4. **A generic payment/delivery state vocabulary** (`MOD-8`), decided before
   the fifth provider rather than after the twentieth.

---

## Sources

- [Modular SaaS architecture](https://www.sigmainfo.net/blog/how-modular-saas-architecture-can-speed-up-your-time-to-market/) · [designing modular customization for B2B SaaS](https://medium.com/design-bootcamp/b2b-saas-designing-modular-customization-for-scalable-growth-343a472a5dd6)
- [SaaS feature flags implementation guide](https://designrevision.com/blog/saas-feature-flags-guide)
- [Modular design systems for scalable SaaS UX](https://www.aufaitux.com/blog/saas-ux-design-modular-design-systems/)
- [B2B portal design for manufacturers and distributors](https://codup.co/blog/b2b-portal-design/) · [B2B ecommerce UX guide](https://www.btng.studio/articles/the-ultimate-guide-to-ux-design-for-b2b/)
- [B2B portals — key features and development](https://www.itransition.com/portals/b2b) · [10 B2B portal features for distributors](https://kt.team/blog/10-b2b-portal-benefits-for-distributors)
