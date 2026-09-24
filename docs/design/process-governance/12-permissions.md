# 12 · Permissions

Designing a screen when no two people who open it see the same thing.

> **Status: partly built, and the gap is structural.** The API enforces
> permissions properly — `@RequirePermission`, a global `PermissionGuard`,
> server-side only. What does not exist is a *design* answer for what a page
> becomes when a user holds 40% of its capabilities. Today that is decided
> per component, which is how a page ends up with a heading, a toolbar, and
> nothing in between. There are 36 permissions in the catalogue today; this
> chapter is written for the thousands the product is heading toward.

## The problem, stated precisely

In a normal product, permissions are a handful of roles and a few hidden
buttons. Here:

- permissions are **capabilities**, at micro level, in the thousands;
- roles are **compositions** of them, 250+ of them, most client-specific;
- so the number of distinct *views* of one page is not 250 — it is the number
  of distinct permission subsets that page is sensitive to, which is
  combinatorial.

**You cannot design 250 pages. You must design one page that degrades
correctly.** That is the entire subject of this chapter, and it is a design
problem, not an authorization problem — authorization is already solved
server-side and is not reopened here.

The failure this prevents: a page designed for the administrator, seen by a
warehouse clerk as a title, an empty toolbar, and a table with no actions —
technically secure, operationally useless, and indistinguishable from broken.

---

## PRM · The laws

### PRM-1 · The server decides; the interface only reflects
**Here** — the client never computes an entitlement. It asks, and it renders
what it is told. A client-side check is a *convenience*, never a control —
`.claude/rules/security.md` is binding and this does not soften it.

**Corollary** — the interface must not be able to show an action the server
would refuse. Rendering a button that returns 403 is a design defect even
though it is not a security one.

### PRM-2 · Hide navigation, disable action, explain both
**Here** — the rule that settles the hide-versus-disable argument, decided
once:

| Element | If the user lacks the permission | Why |
|---|---|---|
| A nav entry to a page they cannot open | **hidden** | offering a door to a locked room is a dead end (`FLO-1`) |
| An action on a page they *can* open | **disabled, with a reason on hover and focus** | its absence would make the page look broken or incomplete |
| A field they may see but not change | **read-only, visibly** | the value is information; the control is not |
| A field they may not see | **absent**, and the layout closes over it | a masked box invites a support ticket |

The distinction is **discoverability versus completeness**. Navigation is a
promise of reachability, so a promise you cannot keep is not made. A page's
own action set is a description of the object, so removing items silently
makes the object look different than it is.

The reason text is not optional. "You do not have permission" is useless;
**"Requires *Approve transfers* — ask a Branch Manager"** is actionable, and
in a 250-role system it is the difference between a resolved request and a
ticket.

### PRM-3 · A page with nothing to do is not that page
**Here** — if a user's permissions reduce a page to no readable content and
no available action, **they must not be able to arrive there.** Either the
nav entry is hidden (`PRM-2`), or the route redirects to what they can
actually do, or the page renders a purpose-built state that says what this
page is for and what access it needs.

A page that renders its chrome around an empty middle is the specific failure
`SPA-4` forbids, arriving by a different road.

### PRM-4 · Design for the smallest viable holder, then add
**Here** — the design starts from the **least-privileged person who has a
real reason to open this page**, and capabilities are layered on for those
who hold more. The reverse order — design for the admin, then subtract —
is what produces the hollow page, because subtraction leaves the holes where
the removed things were.

**The practical method**: write down the two or three *personas by
capability* the page serves (not by job title) before laying it out. A
"viewer", an "operator", an "approver". If the page cannot serve the viewer
coherently, it is two pages (Law 5).

### PRM-5 · Layout closes over absence
**Here** — when a capability is absent, the layout **reflows**; it does not
leave a gap. This is `SPA-4` and Law 4 applied to permissions: a grid that
was three columns for an administrator is not three columns with one empty
for a clerk.

Consequence for implementation: a permission-sensitive region is a
content-driven layout (`SPA-8` — intrinsic, `auto-fit`, `flex-wrap`), never a
fixed template with slots that may be empty.

### PRM-6 · Permission state is not an error state
**Here** — "you cannot do this" is a **normal, expected, designed state**,
not a failure. It never uses error colour (`COL-1`), never uses an alert
component, never says "denied". It is the quietest possible statement of a
boundary, because for most users most boundaries are simply not their job.

### PRM-7 · One capability, one name, everywhere
**Here** — the permission key, the label in role administration, the reason
text on a disabled control, and the word in the documentation are **the same
word** (`HEU-4`, chapter 06's terminology table). With thousands of
permissions, a synonym is unfindable, and an unfindable permission gets
granted by giving someone a broader role — which is how least privilege
quietly dies in a system like this.

### PRM-8 · Granting is a design surface, not a data grid
**Here** — assigning capabilities across thousands of permissions and 250+
roles is itself one of the hardest screens in the product, and it obeys the
same laws as the rest:

- **Grouped by resource**, never a flat alphabetical list (`COG-3`).
- **Searchable**, because recall of a key is impossible (`COG-6`).
- **Shows effect, not only assignment** — "what will this person be able to
  do" is the question being answered; a list of checkboxes does not answer
  it.
- **Diffs before it commits** (`FLO-13`) — a role change that widens access
  for 300 people states that before it is applied.
- **Never a single 2,000-row table.** Overview first, detail on click
  (Law 7).

### PRM-9 · Templates over assembly
**Here** — nobody composes a role from two thousand checkboxes correctly. A
role starts from a **template** for a recognisable job, and is adjusted. The
design's job is to make the adjustment visible: what this role has that the
template does not, and what it lacks.

**Corollary** — the interface shows *why* a person has a capability: which
role granted it. In a 250-role system, an unexplained permission cannot be
safely revoked, so it never is.

### PRM-10 · Separation of duties is shown, not just enforced
**Here** — where the same person must not both create and approve, the
interface **says so at the point of action**, not only at the point of
refusal. `FLO-7`: a refusal states its remedy — here, that the remedy is a
different person, and ideally which people qualify.

### PRM-11 · Never leak existence through absence
**Here** — a user who cannot see a record gets the same response as one for a
record that does not exist. The design consequence: **empty and forbidden
must be indistinguishable where confidentiality requires it** — and
distinguishable where it does not. Which of the two applies is a decision
made per resource, deliberately, and recorded — not a default that happened.

This is where the design system touches `.claude/rules/security.md`. When
they disagree, security wins.

### PRM-12 · Scope is part of the permission, and it is visible
**Here** — in a multi-branch, multi-brand product, "can approve transfers" is
meaningless without *where*. Every capability the interface reports carries
its scope, and **the screen always states which branch or brand it is acting
on** (`HEU-1`). An unscoped read is already forbidden architecturally; an
unscoped *display* is the same bug wearing a different coat.

---

## Patterns

### The capability probe

The page asks once, at load, for the capability set it is sensitive to —
rather than each component asking separately. One answer, one render, no
flicker of controls appearing after the fact. A control that appears 300 ms
late has already been read as absent.

### The reason registry

Every permission has a human sentence explaining what it allows and who
typically holds it. That sentence is what `PRM-2` puts on a disabled control,
what `PRM-8` shows in role administration, and what documentation quotes. One
sentence, one place, three uses — the alternative is three sentences that
drift.

### Density by capability, not by role

An approver scanning 200 rows and a clerk entering one record want different
densities of the same data (`SPA-3`). Bind density to the task the
capabilities imply, and let it be overridden — never to job title, which is
not knowable from 250 role names.

---

## What must be built

1. **A page-level capability contract** — a page declares what it is
   sensitive to, so `PRM-3` (nothing to do) and `PRM-5` (reflow) can be
   reasoned about, and eventually checked.
2. **The reason registry** — `PRM-2` is unimplementable without it.
3. **Role administration as a designed surface** — `PRM-8` and `PRM-9`. This
   is a substantial capability in its own right and is named here so it is
   sequenced explicitly rather than discovered at the point somebody needs
   to create the 251st role.
4. **The `seedPermissions()` / `seedRoles()` gap** — this repository already
   tracks it: a permission that exists in the catalogue but reaches no role a
   real user holds is not shipped, it is scaffolding. The design law is the
   same one: **a capability nobody holds is indistinguishable from a
   capability that does not exist.**

---

## Sources

- [What is enterprise UX — multi-role workflows, permissions and complex data](https://f1studioz.com/blog/what-is-enterprise-ux-design-multi-role-workflows-permissions-complex-data-explained/)
- [Implementing permission-based UI](https://medium.com/@esuba.t/implement-permission-based-ui-ead7d13dffa3) · [frontend RBAC in React](https://www.permit.io/blog/implementing-react-rbac-authorization)
- [RBAC best practices](https://www.osohq.com/learn/rbac-best-practices) · [how to build a role-based access control layer](https://www.osohq.com/learn/rbac-role-based-access-control)
- [Role-based access control — ultimate guide](https://budibase.com/blog/app-building/role-based-access-control/)
- [Enterprise UX design — scaling complex products](https://www.mindinventory.com/blog/enterprise-ux-design/)
