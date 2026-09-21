# 14 · Navigation

One information space holding hundreds of departments, without anybody having
to learn where anything is.

> **Status: exists, unmeasured.** There are 125 screens and a nav registry
> today. What does not exist is any measurement of the thing that actually
> matters — how deep the tree is, how many entries a real role sees, whether
> every screen is reachable by clicking, and whether any entry points at a
> route that is gone. Chapter 15 specifies those checks. Until then the laws
> below are binding on review.

## The scale problem

Hundreds of departments do not each get a nav entry. If they did, the nav
would be the product and nothing would be findable. Three facts have to hold
at once:

1. **Every screen is reachable by clicking** — never only by typing a URL.
2. **No user sees a nav they cannot scan** — which means what they see is a
   function of their capabilities (`PRM-2`) and their deployment (`MOD-3`),
   not of the product's full surface area.
3. **The structure does not change when it grows** — adding the 40th module
   does not reorganise the 39.

Those three are in tension, and the resolution is the rest of this chapter.

---

## NAV · The laws

### NAV-1 · Organise by job, not by org chart
**Here** — the nav is grouped by **what someone is trying to do**, never by
which department owns the data. A hundred departments produce a hundred
top-level entries; a dozen jobs produce a navigable product.

This is the single most consequential decision in this chapter. Departments
change — a reorganisation should not be an information-architecture project.
Jobs do not: someone is still receiving stock, still approving a price, still
chasing a payment.

**Corollary** — a department's *identity* lives on the records (an owner, a
cost centre, a scope), not in the tree.

### NAV-2 · Breadth over depth, within reason
**Here** — **three levels, and a fourth only inside an object.** Top level
(a job area), second level (a thing), third level (a view of that thing).
Deeper than that and users stop navigating and start searching for things
they have already seen.

The arithmetic that makes this fit: a dozen top-level areas × ~7 entries each
(`COG-2`) is ~84 reachable destinations before any object-level navigation —
which is more than a product with 125 screens needs.

### NAV-3 · Search is a first-class path, not a fallback
**Here** — at this scale, **search is how people navigate**, and browsing is
how they discover. Search reaches objects (an order number, a SKU, a
customer) *and* destinations (a screen, a setting, a report) *and* actions —
because `COG-6` says nobody recalls where a rarely-used screen lives.

A search that only finds records, in a product with hundreds of screens, is
half a search.

### NAV-4 · The current position is always stated
**Here** — every screen answers "where am I" without the user reconstructing
it: the nav shows the active trail, and breadcrumbs appear wherever the
hierarchy is deeper than two levels or the user can arrive from several
places. `HEU-1`, applied to place rather than to status.

**And in this product, position includes scope**: which branch, which brand,
which period. A screen that does not state its scope is stating an
assumption (`MOD-6`, `PRM-12`).

### NAV-5 · One destination, one route
**Here** — a screen has one canonical URL. The same thing reachable at two
addresses splits history, breaks bookmarks, confuses the active-trail
calculation in `NAV-4`, and doubles the surface every check in chapter 15 has
to cover.

### NAV-6 · Every screen is reachable by clicking
**Here** — the definition of done in `CLAUDE.md` already requires this and
this is the design half. A screen reachable only by typing a URL is
**unshipped**, whatever its state of completion. In a product this size, an
unreachable screen is not discovered; it is rebuilt by someone who did not
know it existed.

### NAV-7 · Navigation state survives the task
**Here** — going into an object and coming back returns the user to the list
they left: same filters, same sort, same page, same scroll. A list that
resets is a list that gets re-filtered fifty times a day by someone
processing fifty records.

This is the most-felt law in this chapter for a high-throughput role, and the
most commonly broken.

### NAV-8 · Depth is a promise of specificity
**Here** — going one level down always means "more specific", never "more
of the same" and never "somewhere else entirely" (`PER-4`: continuity). A
tree where level three is a sibling concept of level one is unlearnable —
people navigate by remembering shape, not labels.

### NAV-9 · The tree is composed, not authored
**Here** — see `MOD-3`. Entries are registrations carrying their module and
their permission. Nobody maintains a nav file per deployment or per role, and
**an empty group collapses** rather than rendering a heading with nothing
under it.

### NAV-10 · Recency and pinning belong to the user
**Here** — with hundreds of destinations, the shortest path is the one the
user made. Recent items and pinned destinations are personal, persistent, and
never a substitute for the structure in `NAV-1`. `HEU-7`: an accelerator for
the trained, at no cost to anyone else.

### NAV-11 · Label like the business speaks
**Here** — `HEU-2` and chapter 06's terminology table. "Goods receipt", not
"Inbound logistics". One word per concept, and the nav uses the same word the
page's heading uses — a mismatch between an entry and the page it opens is a
small betrayal that costs trust everywhere else.

### NAV-12 · A cross-surface concept keeps its place
**Here** — where admin, POS and mobile share a concept, it sits in the same
place in each, with the same name. A till operator who also uses the back
office should not have to learn two maps.

---

## Patterns

### The shape

```
Global                what is always reachable: search, scope, account, help
  ↓
Area                  a job: Selling · Stock · Buying · Money · People · Setup
  ↓
Destination           a thing: Orders · Transfers · Suppliers
  ↓
View                  a slice of it: Awaiting approval · Overdue
  ↓
Object                one record — and its own tabs (Law 7: detail on click)
```

Areas are the stable layer; adding a module adds destinations inside existing
areas far more often than it adds an area. When a new area is genuinely
needed, that is an architecture conversation (`DECISIONS.md`), not a nav
edit.

### Scope, not a filter

Branch, brand and period are **scope**, not filters. They belong in the
global layer, they persist across navigation, and they are always visible.
A filter narrows a list; scope determines what the whole screen is about —
and in a multi-branch product, mistaking one for the other is how someone
reads Karachi's stock while believing they are looking at Lahore's.

### Object-level navigation

Inside a record, the house components already decide the rule:

- **`SectionRail`** — the parts of one object, all present, jump to any.
- **`Tabs`** — separate tasks on one object, one at a time.
- **`Disclosure`** — rare, advanced or destructive, closed by default.

The distinction is not stylistic. A rail says "this is all one thing"; tabs
say "these are different jobs". Choosing wrong teaches a wrong model of the
object.

### What the nav must not become

- A mirror of the org chart (`NAV-1`).
- A mirror of the database (`HEU-2`).
- A place where a rarely-used screen is "parked" because it had nowhere else
  to go — that is a symptom of the screen being wrong, not the nav.
- A list of every permission the user holds.

---

## What must be built

1. **Reachability**: assert every routable screen is reachable from the nav
   registry (`NAV-6`) — chapter 15.
2. **Link integrity**: assert every nav entry resolves to a route that exists
   (`NAV-5`) — chapter 15.
3. **Depth and breadth measurement**: report the tree's depth and each level's
   fan-out, so `NAV-2` is a number rather than an opinion.
4. **Global search across objects, destinations and actions** (`NAV-3`) —
   named here as a real capability to sequence, not a nav tweak.

---

## Sources

- [Information architecture for navigation — Abby Covert](https://abbycovert.com/writing/information-architecture-for-navigation/)
- [Intranet information architecture trends — NN/G](https://www.nngroup.com/articles/intranet-information-architecture-ia/)
- [Navigation design patterns for web apps](https://www.onething.design/post/top-website-navigation-design-patterns) · [UX navigation patterns and best practices](https://www.eleken.co/blog-posts/ux-navigation-design)
- [Guide to large website menu design](https://www.easternstandard.com/blog/guide-to-large-website-menu-toolbars-design/)
- [12 ways to improve findability](https://www.omniaintranet.com/en/insights/blogs/12-great-intranet-navigation-examples)
